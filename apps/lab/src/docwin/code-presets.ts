/**
 * The Code view's cases: the window as the code a host writes (./code). Each reads what `window.__docwin.code()` gives
 * (the same `codeOf` the page uses) against what the window has: the stored literal parses and reads back to the same
 * rects, Last move names the item and the spot a scripted drag landed in, the settings in the code are the page's
 * settings, and the Window | Code switch shows and updates the pane.
 */
import type { Point, Rect } from "@n-uf/placement";
import { readDockState, solve } from "@n-uf/docking";
import { codeOf, NO_MOVE } from "./code";
import { drive, emptySpace, hold, through } from "./intent-presets";
import { ALL, defaultState } from "./model";
import { presetFrom } from "./one-preview-presets";
import type { Docwin } from "./dock-state";

type CodePreset = ReturnType<typeof presetFrom>;

const fresh = (c: Docwin): void => c.setState(defaultState());

const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;
const near = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 && Math.abs(a.width - b.width) <= 0.5 && Math.abs(a.height - b.height) <= 0.5;
/** A point as the Code view writes it: full precision. */
const at = (p: Point): string => `{ x: ${p.x}, y: ${p.y} }`;

/** The stored literal in the State code, parsed as JSON; undefined when the code has none that parses. */
function storedLiteral(code: string): unknown {
  const marker = "const stored: StoredDockState = ";
  const from = code.indexOf(marker);
  if (from < 0) return undefined;
  const start = from + marker.length;
  // The literal's closing brace is the first one at the start of a line.
  const end = code.indexOf("\n};", start);
  if (end < 0) return undefined;
  try {
    return JSON.parse(code.slice(start, end + 2));
  } catch {
    return undefined;
  }
}

/** The State code's literal read back over the default window at the window's size, solved, against the window now. */
function roundTrip(c: Docwin, label: string, bad: string[]): boolean {
  const raw = storedLiteral(codeOf(c).state);
  if (raw === undefined) {
    bad.push(`${label}: the State code has no stored literal that parses as JSON`);
    return false;
  }
  const { width, height } = c.state.stage;
  const read = readDockState(raw, defaultState({ width, height }));
  if (read.error || read.dropped.length) {
    bad.push(`${label}: reading the literal gave ${read.error ?? `dropped ${read.dropped.join(", ")}`}`);
    return false;
  }
  const layout = solve(read.state);
  const off: string[] = [];
  for (const id of ALL) {
    const a = c.layout.items[id];
    const b = layout.items[id];
    if (!a || !b) {
      if (!!a !== !!b) off.push(`${id} is ${a ? "drawn" : "not drawn"} in the window and ${b ? "drawn" : "not drawn"} from the code`);
      continue;
    }
    if (!near(a.rect, b.rect) || a.edge !== b.edge || !!a.floating !== !!b.floating) off.push(`${id} ${fmt(a.rect)} in the window, ${fmt(b.rect)} from the code`);
  }
  if (off.length) bad.push(`${label}: ${off.join("; ")}`);
  return off.length === 0;
}

/** Zoom, let go over the bottom bar's free room (a sliding spot). */
function zoomToBottom(c: Docwin): boolean {
  const bottom = c.layout.edges.bottom!.rect;
  return !!drive(c, "zoom", (g) => hold(through([g, { x: 600, y: 16 }, { x: 600, y: bottom.y + bottom.height / 2 }], 0.4), 300));
}
/** Notes, let go over the document (it floats). */
function notesToDocument(c: Docwin): boolean {
  const p = emptySpace(c, "notes");
  return !!drive(c, "notes", (g) => hold(through([g, p], 0.8), 900));
}

const preset = (id: string, title: string, expected: string, check: (c: Docwin, bad: string[], said: string[]) => void): CodePreset => presetFrom(fresh, id, title, expected, check);

export function CODE_PRESETS(): CodePreset[] {
  return [
    preset(
      "code-state-round-trip",
      "Code: the State code's stored literal reads back to the window",
      "The State code carries the stored state as one literal that parses as JSON. Read back over the default window at the window's size (`readDockState`) and solved, it gives every item the rect, edge and float state the window has now: for the default window, and after Zoom is let go over the bottom bar and Notes over the document.",
      (c, bad, said) => {
        if (roundTrip(c, "default window", bad)) said.push("the default window reads back to the same rects");
        if (!zoomToBottom(c)) bad.push("Zoom never lifted");
        else if (c.layout.items.zoom?.edge !== "bottom") bad.push(`Zoom landed in ${c.layout.items.zoom?.edge ?? "a float"}, not the bottom bar`);
        else if (roundTrip(c, "after Zoom to the bottom bar", bad)) said.push("after Zoom to the bottom bar too");
        if (!notesToDocument(c)) bad.push("Notes never lifted");
        else if (!c.layout.items.notes?.floating) bad.push("Notes didn't float");
        else if (roundTrip(c, "after Notes floated", bad)) said.push("and after Notes floated");
      },
    ),
    preset(
      "code-last-move",
      "Code: Last move names the item and the spot a drag landed in",
      "Before any drag, Last move says \"No move yet: drag an item in the window.\" After Zoom is let go over the bottom bar, it names Zoom, the bottom lane, the spot id the drop landed in and the commit call with the pointer and grab as released. After Notes is let go over the document it carries the float's commit call, not a spot.",
      (c, bad, said) => {
        c.forgetDrop();
        if (codeOf(c).move !== NO_MOVE) bad.push("with no drag made, Last move isn't the \"No move yet\" line");
        if (!zoomToBottom(c)) {
          bad.push("Zoom never lifted");
          return;
        }
        const d = c.lastDrop;
        const move = codeOf(c).move;
        if (!d?.committed || !d.call.lane || !d.call.spot) bad.push("the drop didn't land in a spot");
        else {
          const wants = [`lanes(dragState, "zoom"`, `l.id === ${JSON.stringify(d.call.lane)}`, `s.id === ${JSON.stringify(d.call.spot)}`, `.after(${at(d.call.pointer)}, ${at(d.call.grab)})`, "// Last move: Zoom"];
          const missing = wants.filter((w) => !move.includes(w));
          if (missing.length) bad.push(`Last move lacks ${missing.map((m) => `\`${m}\``).join(", ")}`);
          else if (d.call.lane !== c.layout.items.zoom?.edge) bad.push(`Last move says ${d.call.lane}, Zoom is in ${c.layout.items.zoom?.edge}`);
          else said.push(`Zoom: lane ${d.call.lane}, spot ${d.call.spot}${d.call.slides ? " (sliding)" : ""}`);
        }
        if (!notesToDocument(c)) {
          bad.push("Notes never lifted");
          return;
        }
        const f = codeOf(c).move;
        if (!f.includes(`lanes(dragState, "notes"`) || !f.includes("regions.float!.after(") || f.includes("lane.spots")) bad.push("after Notes floated, Last move isn't the float's commit call");
        else said.push("Notes: the float's commit call");
      },
    ),
    preset(
      "code-settings",
      "Code: the lane options in the code are the page's settings",
      "The State code's lane options say the stretch positions, pitch and snap distance the page uses now: Pitched at 25 px, then Free at a 13 px snap, and the one that doesn't count under the mode says so.",
      (c, bad, said) => {
        const was = { positions: c.stretchPositions, pitch: c.pitch, snap: c.snapDistance };
        try {
          c.setStretchPositions("pitched");
          c.setPitch(25);
          const p = codeOf(c).state;
          if (!p.includes(`  stretchPositions: "pitched",\n`) || !p.includes("  pitch: 25,\n") || !p.includes(`counts under "free" only`)) bad.push("Pitched at 25 px isn't what the code says");
          else said.push("Pitched, pitch 25");
          c.setStretchPositions("free");
          c.setSnapDistance(13);
          const f = codeOf(c).state;
          if (!f.includes(`  stretchPositions: "free",\n`) || !f.includes("  snapDistance: 13,\n") || !f.includes(`counts under "pitched" only`)) bad.push("Free at a 13 px snap isn't what the code says");
          else said.push("Free, snap 13");
        } finally {
          c.setStretchPositions(was.positions);
          c.setPitch(was.pitch);
          c.setSnapDistance(was.snap);
        }
      },
    ),
    preset(
      "code-view-switch",
      "Code: the Window | Code switch shows the code and keeps it live",
      "Picking Code shows the pane in place of the window (the window stays laid out, unseen) with the State code; the Last move tab says \"No move yet\" until a drag, and after Zoom is let go over the bottom bar it shows that move at once. Picking Window brings the window back. The switch's choice before the case is restored.",
      (c, bad, said) => {
        const q = <T extends HTMLElement>(s: string): T | null => document.querySelector<T>(s);
        const stage = q("#dw-stage");
        const pane = q("#dw-code");
        const pre = q("#dw-code-pre");
        const pick = (v: string): void => q<HTMLButtonElement>(`#dw-view [data-view="${v}"]`)?.click();
        const tab = (t: string): void => q<HTMLButtonElement>(`#dw-code-tabs [data-code="${t}"]`)?.click();
        if (!stage || !pane || !pre) {
          bad.push("the page has no Code view");
          return;
        }
        const wasView = stage.dataset.view === "code" ? "code" : "window";
        const wasTab = q('#dw-code-tabs [aria-selected="true"]')?.dataset.code ?? "state";
        try {
          pick("code");
          tab("state");
          const hidden = getComputedStyle(c.win.parentElement!).visibility === "hidden";
          if (stage.dataset.view !== "code" || pane.hidden || !hidden) bad.push("Code didn't take the window's place");
          if (pre.textContent !== codeOf(c).state) bad.push("the pane isn't the State code");
          c.forgetDrop();
          tab("move");
          if (pre.textContent !== NO_MOVE || !pre.hasAttribute("data-empty")) bad.push("Last move isn't the \"No move yet\" line before a drag");
          if (!zoomToBottom(c)) bad.push("Zoom never lifted");
          else if (!pre.textContent?.includes(`lanes(dragState, "zoom"`)) bad.push("the pane didn't follow the drop");
          else said.push("Code shows the state and follows a drop");
          pick("window");
          if (stage.dataset.view !== "window" || !pane.hidden) bad.push("Window didn't bring the window back");
        } finally {
          tab(wasTab);
          pick(wasView);
        }
      },
    ),
  ];
}
