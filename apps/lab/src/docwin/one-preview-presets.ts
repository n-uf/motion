/**
 * The dragged item as the only preview (`previewPlan`'s `"snap"` mode, the viewer's `"item"`), on the window's own drag session, frame by frame: over
 * a place that takes it the item sits there with the room open; over the document it follows the pointer and floats; over
 * a refused place nothing is marked and "Can't go here" shows at the pointer. What shows at release is what lands.
 */
import { targetAt, type DragKeys } from "@n-uf/motion/drag";
import { clampInto, type Point, type Rect } from "@n-uf/placement";
import { refusalTargets, type DockState, type DockDrop } from "@n-uf/docking";
import { docking, drive, emptySpace, FRAME, hold, mid, sameRect, through, type Key } from "./intent-presets";
import { defaultState, floating, put, railedState, type ItemId } from "./model";
import type { Docwin, DragTrace } from "./dock-state";

interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}
interface OnePreset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  setup(c: Docwin): void;
  check(c: Docwin): Verdict;
}

/** The viewer's three drop preview modes, by the viewer's names: Outline, Placeholder, Snap (`"item"`, the library's `"snap"` mode). */
const VIEWER_MODES = ["indicator", "gap", "item"] as const;
const LABEL: Record<(typeof VIEWER_MODES)[number], string> = { indicator: "Outline", gap: "Placeholder", item: "Snap" };
const TOOLBAR: ItemId = "tools";
const PANEL: ItemId = "notes";
/** Long enough for the room to open and the item to settle into it. */
const SETTLE = 900;
const AIM = 0.8;
const FAST = 1.5;

const say = (r: Rect | null | undefined): string => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}` : "nothing");
const shownAtRelease = (t: DragTrace): Rect | null => t.frames.at(-1)?.item ?? null;
const within = (r: Rect, s: Rect): boolean => r.x >= s.x - 0.5 && r.y >= s.y - 0.5 && r.x + r.width <= s.x + s.width + 0.5 && r.y + r.height <= s.y + s.height + 0.5;
const fresh = (c: Docwin): void => {
  c.setState(defaultState());
  c.setDropPreview("item");
};

/** Every mark of where the item would land, other than the item itself. */
function marks(c: Docwin): string[] {
  const out: string[] = [];
  for (const sel of [".dw-slot", ".dw-railstrip"]) for (const el of c.win.querySelectorAll<HTMLElement>(sel)) if (!el.hidden) out.push(sel);
  return out;
}

/**
 * A point over a refusal of `id`, where the refusal is what the pick finds, away from its own place: the largest
 * refusal first (a refused stretch of a lane shorter than the item joins its spots, so it says nothing there).
 */
function refusedPoint(c: Docwin, id: ItemId): Point | null {
  const area = (r: { hit: Rect; hits?: readonly Rect[] }): number => (r.hits ?? [r.hit]).reduce((s, h) => s + h.width * h.height, 0);
  const refused = refusalTargets(c.refusals(id)).sort((a, b) => area(b) - area(a));
  const all = [...c.targets(id), ...refused];
  const own = c.layout.items[id]?.rect;
  for (const r of refused)
    for (const h of r.hits ?? [r.hit])
      for (const fy of [0.5, 0.25, 0.75])
        for (const fx of [0.5, 0.25, 0.75]) {
          const p = { x: h.x + h.width * fx, y: h.y + h.height * fy };
          const off = !own || p.x < own.x || p.x > own.x + own.width || p.y < own.y || p.y > own.y + own.height;
          if (off && targetAt(all, p)?.id === r.id) return p;
        }
  return null;
}

/** The toolbar rail target at a window side: its room moves the column. */
const edgeRail = (c: Docwin, side: "left" | "right"): DockDrop | undefined => c.targets(TOOLBAR).find((t) => t.id.includes(`:rail-${side}:`) && t.opensRoom);

type Where = { readonly name: string; readonly id: ItemId; readonly to: (c: Docwin) => Point | null };
const PLACES: readonly Where[] = [
  { name: "a toolbar over a bar's gap", id: TOOLBAR, to: (c) => { const t = docking(c, TOOLBAR)[0]; return t ? mid(t.hit) : null; } },
  { name: "a panel over a column gap", id: PANEL, to: (c) => { const t = docking(c, PANEL)[0]; return t ? mid(t.hit) : null; } },
  { name: "a toolbar over the left window-edge rail", id: TOOLBAR, to: (c) => { const t = edgeRail(c, "left"); return t ? mid(t.hit) : null; } },
];
const OTHERS: readonly Where[] = [
  { name: "a toolbar over the document", id: TOOLBAR, to: (c) => emptySpace(c, TOOLBAR) },
  { name: "a panel over the document", id: PANEL, to: (c) => emptySpace(c, PANEL) },
  { name: "a toolbar over a refused place", id: TOOLBAR, to: (c) => refusedPoint(c, TOOLBAR) },
  { name: "a panel over a refused place", id: PANEL, to: (c) => refusedPoint(c, PANEL) },
];

/** An empty bar's place, which lies over the document. */
const EMPTY_BAR: Where = {
  name: "a toolbar over an empty bar's place",
  id: TOOLBAR,
  to: (c) => {
    const t = c.targets(TOOLBAR).find((x) => x.id.startsWith("strip:top"));
    const content = c.layout.content;
    if (!t) return null;
    // The part of its zone over the content, clear of the title bar and the columns.
    const x0 = Math.max(t.hit.x, content.x);
    const y0 = Math.max(t.hit.y, content.y);
    return { x: (x0 + Math.min(t.hit.x + t.hit.width, content.x + content.width)) / 2, y: (y0 + Math.min(t.hit.y + t.hit.height, content.y + content.height)) / 2 };
  },
};
/** A panel over another column's body. */
const OVER_COLUMN: Where = { name: "a panel over a docked column's body", id: PANEL, to: (c) => mid(c.layout.items.findings!.rect) };
/** A rect over the document that takes no drop (`DockState.blocked`). */
const BLOCKED: Rect = { x: 400, y: 250, width: 160, height: 120 };

const preset = (id: string, title: string, expected: string, check: (c: Docwin, bad: string[], said: string[]) => void): OnePreset => presetFrom(fresh, id, title, expected, check);

/** A case set up by `fresh`, its check collecting what broke (`bad`) and what it saw (`said`). */
export function presetFrom(fresh: (c: Docwin) => void, id: string, title: string, expected: string, check: (c: Docwin, bad: string[], said: string[]) => void): OnePreset {
  return {
    id,
    title,
    expected,
    setup: fresh,
    check(c) {
      const bad: string[] = [];
      const said: string[] = [];
      fresh(c);
      check(c, bad, said);
      return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : `${said.join("; ")}.` };
    },
  };
}

/** Drive `w`'s item to its point at `speed`, hold `ms`, let go. */
function go(c: Docwin, w: Where, speed: number, ms: number, each?: (t: number) => void) {
  fresh(c);
  const p = w.to(c);
  if (!p) return null;
  const r = drive(c, w.id, (g): Key[] => hold(through([g, p], speed), ms), [], each);
  return r ? { ...r, p } : null;
}

/** The default window (or `window`) with `ids` collapsed by hand. */
const collapsed = (ids: readonly ItemId[], window: () => DockState = defaultState): DockState => {
  const s = window();
  return { ...s, items: { ...s.items, ...Object.fromEntries(ids.map((id) => [id, { ...s.items[id]!, from: 1 }])) } };
};

/** `ids` collapsed together as the right column's title tiles. */
const collapsedIn = (ids: readonly ItemId[], window: () => DockState = defaultState): DockState => {
  const s = collapsed(ids, window);
  return put(s, "right", [...ids]);
};

type PanelState = "open" | "collapsed";
type PanelOver = "an open column" | "collapsed titles" | "the document";
/** Notes, in `state`, with the right column open or (over titles) all collapsed. */
const panelState = (state: PanelState, over: PanelOver): DockState => collapsed([...(state === "collapsed" ? (["notes"] as const) : []), ...(over === "collapsed titles" ? (["findings"] as const) : [])]);
const panelPoint = (c: Docwin, over: PanelOver): Point | null => {
  if (over === "the document") return emptySpace(c, PANEL);
  if (over === "collapsed titles") return mid(c.layout.edges.right!.rect);
  const t = c.targets(PANEL).find((x) => x.place.kind === "gap" && x.place.edge === "right" && x.place.at === 0);
  return t ? mid(t.hit) : null;
};
/** What each cell of the rule gives: the form it lands in, floating or not. */
const PANEL_RULE: readonly [PanelState, PanelOver, string, boolean][] = [
  ["open", "an open column", "open", false],
  ["open", "collapsed titles", "open", false],
  ["open", "the document", "open", true],
  ["collapsed", "an open column", "header", false],
  ["collapsed", "collapsed titles", "rail", false],
  ["collapsed", "the document", "header", true],
];

function panelCell(state: PanelState, over: PanelOver, form: string, floats: boolean): OnePreset {
  const titles = over === "collapsed titles";
  return preset(
    `one-preview-panel-${state}-over-${over.replace(/^(an |the )/, "").replace(/ /g, "-")}`,
    `A ${state} panel over ${over} lands ${form === "rail" ? "as a title tile" : floats ? `floating, ${form === "open" ? "open" : "as a header"}` : form === "open" ? "open" : "as a header"}`,
    `Notes, ${state}, held over ${over} and let go: it keeps its state.${titles ? (state === "open" ? " The column opens around it, at full size." : " It takes the one place after the last title, and the column stays a rail.") : ""} What was shown at release is what lands.`,
    (c, bad, said) => {
      c.setState(panelState(state, over));
      const before = c.state.items[PANEL]!.from ?? 0;
      if (titles) {
        // One place: the column offers a single gap, over its whole length.
        const places = c.targets(PANEL).filter((t) => t.place.kind === "gap" && t.place.edge === "right");
        const rail = c.layout.edges.right!.rect;
        if (places.length !== 1 || !places[0]!.hit || places[0]!.hit.y > rail.y || places[0]!.hit.y + places[0]!.hit.height < rail.y + rail.height) bad.push(`the titles offer ${places.length} places, not one over the whole rail`);
      }
      const p = panelPoint(c, over);
      if (!p) {
        bad.push("no such place here");
        return;
      }
      const r = drive(c, PANEL, (g): Key[] => hold(through([g, p], AIM), SETTLE));
      if (!r) {
        bad.push("the drag never lifted");
        return;
      }
      const it = c.layout.items[PANEL];
      if (it?.formKind !== form) bad.push(`it landed as ${it?.formKind}`);
      if (!!it?.floating !== floats) bad.push(floats ? "it didn't float" : "it floated");
      if ((c.state.items[PANEL]!.from ?? 0) !== before) bad.push("its collapsed state changed");
      if (!sameRect(shownAtRelease(r.trace), it?.rect)) bad.push(`shown ${say(shownAtRelease(r.trace))}, landed ${say(it?.rect)}`);
      if (titles) {
        const right = c.layout.edges.right!;
        const order = c.state.edges.find((e) => e.id === "right")!.items;
        if (order[order.length - 1] !== PANEL) bad.push(`it isn't last in the column (${order.join(", ")})`);
        if (state === "open" ? right.rect.width < 200 : right.rect.width > 40) bad.push(`the column is ${Math.round(right.rect.width)} px wide`);
      }
      said.push(`${it?.formKind} at ${say(it?.rect)}`);
    },
  );
}

export function ONE_PREVIEW_PRESETS(): OnePreset[] {
  return [
    ...PANEL_RULE.map(([state, over, form, floats]) => panelCell(state, over, form, floats)),
    preset(
      "one-preview-panel-no-rail-docking",
      "A panel has no way into a rail but collapsing in its column",
      "A panel offers no edge strip, no dwell and no rail stop, its header has no \"Move to › Rail\" menu, and ⌘/Ctrl held over the document changes nothing: it floats as without the key.",
      (c, bad, said) => {
        for (const id of ["notes", "findings", "pages"] as const) {
          for (const t of [...c.targets(id), ...c.stops(id)]) if (t.place.kind === "rail" || t.arm || t.strip) bad.push(`${id}: ${t.id} docks it into a rail`);
          if (c.win.querySelector(`.dw-items [data-id="${id}"] [data-pmenu]`)) bad.push(`${id}: its header still has the rail menu`);
          for (const side of ["left", "right"] as const) if (c.moveToRail(id, side)) bad.push(`${id}: "Move to › Rail" still moves it to the ${side}`);
        }
        // In no preview: the menu follows the rules, not the preview. The published rules keep it.
        for (const mode of VIEWER_MODES) {
          c.setDropPreview(mode);
          c.setState(defaultState());
          if (c.win.querySelector("[data-pmenu]")) bad.push(`the ${mode} preview has the panel menu`);
        }
        c.setBehavior("published");
        if (!c.win.querySelector(`.dw-items [data-id="${PANEL}"] [data-pmenu]`)) bad.push("the published rules lost the panel menu");
        c.setBehavior("landing");
        if (c.win.querySelector("[data-pmenu]")) bad.push("the menu came back with the window's own rules");
        const p = emptySpace(c, PANEL);
        const r = drive(c, PANEL, (g): Key[] => hold(through([g, p], AIM), 300), [{ t: () => 0, run: () => c.keys({ meta: true }) }]);
        if (!c.layout.items[PANEL]?.floating) bad.push(`with ⌘ held it landed on ${r?.drop?.target}`);
        said.push("no rail target, no menu, ⌘/Ctrl does nothing for a panel");
      },
    ),
    preset(
      "one-preview-keys",
      "Toolbars keep their rails; Shift floats; Alt doesn't move anything",
      "A toolbar still offers its window-edge rail. Shift held over a place that would take it floats it there instead. Alt held changes nothing about where an item lands.",
      (c, bad, said) => {
        if (!edgeRail(c, "left") || !edgeRail(c, "right")) bad.push("a toolbar rail is gone");
        // A toolbar that starts docked, so a float is a change.
        const gap: Where = { name: "a docked toolbar over a gap", id: "views", to: (c2) => { const t = docking(c2, "views")[0]; return t ? mid(t.hit) : null; } };
        const p = gap.to(c)!;
        drive(c, gap.id, (g): Key[] => hold(through([g, p], AIM), SETTLE), [{ t: () => 0, run: () => c.keys({ shift: true }) }]);
        if (!c.layout.items[gap.id]?.floating) bad.push("Shift over a gap didn't float the toolbar");
        fresh(c);
        const q = gap.to(c)!;
        const r = drive(c, gap.id, (g): Key[] => hold(through([g, q], AIM), SETTLE), [{ t: () => 0, run: () => c.keys({ alt: true }) }]);
        if (c.layout.items[gap.id]?.floating || !r?.drop?.committed) bad.push("with Alt held the toolbar didn't dock");
        said.push("rails kept, Shift floats, Alt changes nothing");
      },
    ),
    preset(
      "one-preview-tile-moves-in-its-rail",
      "A title tile still moves among its own rail's tiles",
      "With Findings and Notes collapsed as the right column's title tiles, Notes dragged onto the place before Findings moves there, still a tile; the rail stays a rail. In both windows: the column drawn as a rail (the default window, no `rails`) and the rail the window declares (`DockState.rails`), where the column's tiles are the rail's.",
      (c, bad, said) => {
        for (const [name, window, declared] of [["the column drawn as a rail", defaultState, false], ["the declared rail", railedState, true]] as const) {
          c.setState(collapsedIn(["findings", "notes"], window));
          if (!!c.layout.items[PANEL]?.rail !== declared) {
            bad.push(`${name}: the tile is ${c.layout.items[PANEL]?.rail ? "in a declared rail" : "not in a declared rail"}`);
            continue;
          }
          const t = c.targets(PANEL).find((x) => x.place.kind === "gap" && x.place.edge === "right" && x.place.at === 0);
          if (!t) {
            bad.push(`${name}: no place before the first tile (places: ${c.targets(PANEL).map((x) => x.id).join(", ")})`);
            continue;
          }
          drive(c, PANEL, (g): Key[] => hold(through([g, mid(t.hit)], AIM), SETTLE));
          const order = c.state.edges.find((e) => e.id === "right")!.items;
          if (order[0] !== PANEL) bad.push(`${name}: the order is ${order.join(", ")}`);
          if (c.layout.items[PANEL]?.formKind !== "rail") bad.push(`${name}: it became ${c.layout.items[PANEL]?.formKind}`);
          if (!!c.layout.items[PANEL]?.rail !== declared) bad.push(`${name}: it left its rail`);
          said.push(`${name}: the rail reads ${order.join(", ")}`);
        }
      },
    ),
    preset(
      "one-preview-panel-never-collapses",
      "No drop changes a panel's collapsed state",
      "For Notes open and collapsed, beside an open column and collapsed titles, every place a drag offers keeps its state, and no place is a strip that collapses it into a rail.",
      (c, bad, said) => {
        let n = 0;
        for (const state of ["open", "collapsed"] as const)
          for (const over of ["an open column", "collapsed titles"] as const) {
            c.setState(panelState(state, over));
            const was = c.state.items[PANEL]!.from ?? 0;
            for (const t of c.targets(PANEL)) {
              n++;
              if (t.arm || t.strip) bad.push(`${state}, ${over}: ${t.id} is a strip`);
              if ((t.after({ x: 500, y: 300 }, { x: 8, y: 8 }).state.items[PANEL]!.from ?? 0) !== was) bad.push(`${state}, ${over}: ${t.id} changes it`);
            }
          }
        said.push(`${n} places, none changes it`);
      },
    ),
    preset(
      "one-preview-one-placement",
      "Only one placement is ever visible: the dragged item",
      "On every frame of a drag over a place that takes it, the document and a refused place, nothing but the held item says where it will land: no slot, no insertion line, no drop strip, and no room open unless the item is going into it.",
      (c, bad, said) => {
        let frames = 0;
        for (const w of [...PLACES, ...OTHERS]) {
          let two = 0;
          const r = go(c, w, AIM, SETTLE, () => {
            frames++;
            const tr = c.trace!;
            const room = tr.rooms.at(-1)?.room ?? null;
            const going = tr.snaps.at(-1)?.id ?? null;
            if (marks(c).length > 0 || (room !== null && room !== going)) two++;
          });
          if (!r) bad.push(`${w.name}: no such drag here`);
          else if (two) bad.push(`${w.name}: ${two} frames show a second placement`);
        }
        said.push(`${frames} frames, one placement in each`);
      },
    ),
    preset(
      "one-preview-place",
      "Over a place that takes it, the item sits there with the room open",
      "Held over a gap or a window-edge rail, the item settles into the slot with the room open and an accent outline, and a release leaves it exactly there.",
      (c, bad, said) => {
        for (const w of PLACES) {
          let placed = false;
          const r = go(c, w, AIM, SETTLE, () => {
            placed = c.win.querySelector(".dw-held")?.hasAttribute("data-placed") ?? false;
          });
          if (!r) {
            bad.push(`${w.name}: no such drag here`);
            continue;
          }
          const room = r.trace.rooms.at(-1)?.room;
          const landed = c.layout.items[w.id]?.rect;
          if (!room) bad.push(`${w.name}: no room open`);
          if (!placed) bad.push(`${w.name}: not marked as placed`);
          if (!r.drop?.committed || c.layout.items[w.id]?.floating) bad.push(`${w.name}: it didn't dock (${r.drop?.target})`);
          if (!sameRect(shownAtRelease(r.trace), landed)) bad.push(`${w.name}: shown ${say(shownAtRelease(r.trace))}, landed ${say(landed)}`);
          said.push(`${w.name}: ${say(landed)}`);
        }
      },
    ),
    preset(
      "one-preview-document",
      "Over the document the item follows the pointer and floats there",
      "Over open content the item stays under the pointer with nothing marked, and a release floats it where it was shown.",
      (c, bad, said) => {
        for (const w of OTHERS.slice(0, 2)) {
          const r = go(c, w, AIM, 300);
          if (!r) {
            bad.push(`${w.name}: no such drag here`);
            continue;
          }
          const landed = c.layout.items[w.id];
          if (!landed?.floating) bad.push(`${w.name}: it didn't float (${r.drop?.target})`);
          if (!sameRect(shownAtRelease(r.trace), landed?.rect)) bad.push(`${w.name}: shown ${say(shownAtRelease(r.trace))}, landed ${say(landed?.rect)}`);
          said.push(`${w.name}: floats at ${say(landed?.rect)}`);
        }
      },
    ),
    preset(
      "one-preview-refused",
      "Over a refused place nothing is marked, and a release returns the item",
      "Over a place that refuses it the item stays on the pointer, only \"Can't go here\" shows, at the pointer, and a release puts the item back where it was.",
      (c, bad, said) => {
        for (const w of OTHERS.slice(2)) {
          fresh(c);
          const before = c.layout.items[w.id]?.rect;
          let told = false;
          let at: Rect | null = null;
          const r = go(c, w, AIM, 300, () => {
            const m = c.win.querySelector<HTMLElement>(".dw-cant-go");
            told = !!m && !m.hidden && m.textContent === "Can't go here" && c.win.querySelectorAll("[data-drag-refusal]").length === 1;
            at = m ? { x: parseFloat(m.style.left), y: parseFloat(m.style.top), width: m.offsetWidth, height: m.offsetHeight } : null;
          });
          if (!r) {
            bad.push(`${w.name}: no such drag here`);
            continue;
          }
          // Beside the pointer, kept inside the window.
          const shown = at as Rect | null;
          const want = shown && clampInto({ ...shown, x: r.p.x + 12, y: r.p.y + 12 }, c.state.stage);
          const near = !!shown && !!want && Math.abs(shown.x - want.x) <= 1 && Math.abs(shown.y - want.y) <= 1;
          if (!told || !near) bad.push(`${w.name}: no "Can't go here" at the pointer`);
          if (r.drop?.committed || !sameRect(c.layout.items[w.id]?.rect, before)) bad.push(`${w.name}: the release moved it`);
          said.push(`${w.name}: back at ${say(before)}`);
        }
      },
    ),
    preset(
      "one-preview-early-release",
      "Let go before the item has settled, it floats where it is",
      "A toolbar flicked onto an empty bar's place over the document and let go before the bar takes it (a fast pass is no entry) floats where it was shown, and docks nowhere.",
      (c, bad, said) => {
        const r = go(c, EMPTY_BAR, FAST, 2 * FRAME);
        if (!r) {
          bad.push(`${EMPTY_BAR.name}: no such drag here`);
          return;
        }
        const landed = c.layout.items[EMPTY_BAR.id];
        if (r.trace.rooms.some((f) => f.room)) bad.push("the room had opened, the release wasn't early");
        if (!r.drop?.committed || !landed?.floating) bad.push(`it landed on ${r.drop?.target}, not as a float`);
        said.push(`${EMPTY_BAR.name}: floats at ${say(landed?.rect)}`);
      },
    ),
    preset(
      "one-preview-over-docked",
      "Over another panel's body a panel docks by halves; only content that takes no drop returns it",
      "A panel held over another column's body is over a place (the column splits by halves): no \"Can't go here\", it settles in and lands there, drawn as landed. A flick ending on the column, let go before it settled, floats (a release before the snap floats). \"Can't go here\" over docked content is left for content that takes no drop of the item and refuses nothing, which the default window doesn't have. A fast pass across a column never flashes the message.",
      (c, bad, said) => {
        fresh(c);
        const body = mid(c.layout.items.findings!.rect);
        let told = 0;
        const held = drive(c, PANEL, (g): Key[] => hold(through([g, body], AIM), SETTLE), [], () => {
          if (!c.win.querySelector<HTMLElement>(".dw-cant-go")!.hidden) told++;
        });
        const it = c.layout.items[PANEL];
        if (told) bad.push(`"Can't go here" on ${told} frames over the column`);
        if (!held?.drop?.committed || it?.floating || it?.edge !== "right") bad.push(`over the column it landed on ${held?.drop?.target ?? "nothing"}`);
        if (held && !sameRect(shownAtRelease(held.trace), it?.rect)) bad.push(`drawn ${say(shownAtRelease(held.trace))}, landed ${say(it?.rect)}`);
        fresh(c);
        const flick = c.targets(PANEL).find((t) => t.place.kind === "gap" && t.place.edge === "right");
        const early = flick && drive(c, PANEL, (g): Key[] => hold(through([g, mid(flick.hit)], FAST), 2 * FRAME));
        if (!early || !c.layout.items[PANEL]?.floating) bad.push(`a flick ending on a column landed on ${early?.drop?.target ?? "nothing"}, not as a float`);
        fresh(c);
        const doc = emptySpace(c, PANEL);
        const column = c.layout.items.findings!.rect;
        let flashed = 0;
        const pass = drive(c, PANEL, (g): Key[] => hold(through([g, doc, body, doc], 2.5), 2 * FRAME), [], () => {
          const f = c.trace!.frames.at(-1)!;
          const over = f.x >= column.x && f.x <= column.x + column.width;
          if (over && f.speed >= 0.6 && !c.win.querySelector<HTMLElement>(".dw-cant-go")!.hidden) flashed++;
        });
        if (flashed) bad.push(`a fast pass flashed the message on ${flashed} frames`);
        if (!pass || !c.layout.items[PANEL]?.floating) bad.push("a flick ending over the document didn't float");
        said.push("docks by halves over the column; a flick on it floats; a flick over the document floats");
      },
    ),
    preset(
      "one-preview-shown-is-landed",
      "The rect shown at release is the rect it lands on",
      "The held item's rect at release equals the rect it has after the drop: settled in a place, over the document, let go before it settled, with Shift over a column, with the rail key held, settled over a docked column's body (by halves). Where the pick lands nothing (past the window's edge, a refused place, a blocked place) the item says \"Can't go here\" and a release leaves everything as it was.",
      (c, bad, said) => {
        const cases: readonly [string, Where, number, number, DragKeys?][] = [
          ["settled in a place", PLACES[0]!, AIM, SETTLE],
          ["settled on the rail", PLACES[2]!, AIM, SETTLE],
          ["over the document", OTHERS[0]!, AIM, 300],
          ["before it settled", EMPTY_BAR, FAST, 2 * FRAME],
          ["Shift over a column", OVER_COLUMN, AIM, 300, { shift: true }],
          ["the rail key over the document", OTHERS[1]!, AIM, 300, { meta: true }],
          ["settled over a docked column's body", OVER_COLUMN, AIM, SETTLE],
        ];
        for (const [name, w, speed, ms, keys] of cases) {
          fresh(c);
          const p = w.to(c);
          const r = p && drive(c, w.id, (g): Key[] => hold(through([g, p], speed), ms), keys ? [{ t: () => 0, run: () => c.keys(keys) }] : []);
          if (!r) {
            bad.push(`${name}: no such drag here`);
            continue;
          }
          const shown = shownAtRelease(r.trace);
          const landed = c.layout.items[w.id]?.rect;
          if (!r.drop?.committed) bad.push(`${name}: nothing landed`);
          if (!sameRect(shown, landed)) bad.push(`${name}: shown ${say(shown)}, landed ${say(landed)}`);
          said.push(`${name}: ${say(landed)}`);
        }
        const nothing: readonly [string, Where, DockState?][] = [
          ["past the window's edge", { name: "", id: PANEL, to: (c2) => ({ x: mid(c2.layout.content).x, y: c2.state.stage.y + c2.state.stage.height + 40 }) }],
          ["a refused place", OTHERS[2]!],
          ["a blocked place", { name: "", id: PANEL, to: () => mid(BLOCKED) }, { ...defaultState(), blocked: [BLOCKED] }],
        ];
        for (const [name, w, state] of nothing) {
          fresh(c);
          if (state) c.setState(state);
          const before = c.layout.items[w.id]?.rect;
          const p = w.to(c);
          let told = false;
          const r = p && drive(c, w.id, (g): Key[] => hold(through([g, p], AIM), 300), [], () => {
            told = !c.win.querySelector<HTMLElement>(".dw-cant-go")!.hidden;
          });
          if (!r) {
            bad.push(`${name}: no such drag here`);
            continue;
          }
          if (!told) bad.push(`${name}: no "Can't go here"`);
          if (c.win.querySelector(".dw-held[data-placed]")) bad.push(`${name}: the item looks placed`);
          if (r.drop?.committed || !sameRect(c.layout.items[w.id]?.rect, before)) bad.push(`${name}: the release moved it`);
          said.push(`${name}: nothing lands`);
        }
      },
    ),
    ...VIEWER_MODES.map((mode) =>
      preset(
        `one-preview-mode-${LABEL[mode].toLowerCase()}-pages-over-notes`,
        `${LABEL[mode]}: Pages near the left edge over Notes' lower half lands open under Notes`,
        `In the ${LABEL[mode]} preview, Pages held near the left window edge over Notes' lower half: no edge strip at either side on any frame, no "collapse" box, ${mode === "indicator" ? "a dashed outline at the landing and nothing else moving" : mode === "gap" ? "a dashed placeholder at the landing with Notes moved for it" : "no outline anywhere, Notes moved and Pages itself settled where it lands"}; the release lands Pages open under Notes, where it was ${mode === "item" ? "drawn" : "outlined"}. The mode changes only how the landing is shown.`,
        (c, bad, said) => {
          c.setDropPreview(mode);
          // The review's path: Pages by its header to the left column's near edge (and its inner edge) over Notes' lower
          // half, held 800 ms, let go.
          for (const spot of ["window edge", "column's inner edge"] as const) {
          c.setState(defaultState());
          const n = c.layout.items.notes!.rect;
          const p = { x: spot === "window edge" ? c.state.stage.x + 4 : n.x + n.width - 4, y: n.y + n.height * 0.75 };
          let strips = 0;
          let collapseBox = 0;
          let words = 0;
          let outline: Rect | null = null;
          const r = drive(c, "pages", (g): Key[] => hold(through([g, p], AIM), 800), [], () => {
            for (const el of c.win.querySelectorAll<HTMLElement>(".dw-railstrip")) if (!el.hidden && el.getBoundingClientRect().width > 0) strips++;
            const slot = c.win.querySelector<HTMLElement>(".dw-slot");
            if (slot && !slot.hidden) {
              if (/collapse|rail/i.test(slot.textContent ?? "")) collapseBox++;
              if ((slot.textContent ?? "").trim() || slot.title) words++;
              outline = { x: parseFloat(slot.style.left), y: parseFloat(slot.style.top), width: parseFloat(slot.style.width), height: parseFloat(slot.style.height) };
            } else outline = null;
          });
          if (!r) {
            bad.push(`${spot}: no drag`);
            continue;
          }
          if (words) bad.push(`${spot}: the outline has words on ${words} frames`);
          // 1, 2: no edge strip at either side; 3: no "collapse into the rail" box.
          if (strips) bad.push(`${spot}: an edge strip showed on ${strips} frames`);
          if (collapseBox) bad.push(`${spot}: a "collapse" box showed on ${collapseBox} frames`);
          // 5: Pages lands open, under Notes, in the left column.
          const it = c.layout.items.pages;
          const order = c.state.edges.find((e) => e.id === "left")!.items.filter((x) => x === "notes" || x === "pages");
          if (!r.drop?.committed || it?.floating || it?.edge !== "left" || order.join() !== "notes,pages") bad.push(`${spot}: it landed on ${r.drop?.target ?? "nothing"}, the column reads ${order.join(", ")}`);
          if (it?.formKind !== "open") bad.push(`${spot}: it landed ${it?.formKind ?? "nowhere"}, not open`);
          // The look of the mode, and what it showed is what landed.
          const room = r.trace.rooms.some((f) => f.room);
          const shown = shownAtRelease(r.trace);
          const last = outline as Rect | null;
          if (mode === "indicator" || mode === "gap") {
            if (!last || !sameRect(last, it?.rect)) bad.push(`${spot}: outlined ${say(last)}, landed ${say(it?.rect)}`);
            if ((mode === "gap") !== room) bad.push(`${spot}: ${mode === "gap" ? "Notes didn't move for it" : "something moved"}`);
          } else {
            if (last) bad.push(`${spot}: a dashed outline at ${say(last)}`);
            if (!room) bad.push(`${spot}: Notes didn't move for it`);
            if (!sameRect(shown, it?.rect)) bad.push(`${spot}: drawn ${say(shown)}, landed ${say(it?.rect)}`);
          }
          said.push(`${spot}: ${it?.formKind} at ${say(it?.rect)}, under Notes`);
          }
        },
      ),
    ),
    preset(
      "one-preview-plain-words",
      "The status and help name outcomes, never internal terms",
      "Over a lift, a dock, a float, a refused drop and a resize, and for every preview's help line, the words the page shows name the outcome (dock, float, back where it was) and never gap, slot, strip, band, zone or target.",
      (c, bad, said) => {
        const JARGON = /\b(gaps?|slots?|strips?|bands?|zones?|targets?)\b/i;
        const status = (): string => c.win.ownerDocument.getElementById("dw-status")?.textContent ?? "";
        const heard: string[] = [];
        for (const w of [PLACES[0]!, PLACES[1]!, OTHERS[0]!, OTHERS[1]!, OTHERS[2]!]) {
          fresh(c);
          const p = w.to(c);
          if (!p) continue;
          drive(c, w.id, (g): Key[] => hold(through([g, p], AIM), SETTLE), [], () => {
            const s = status();
            if (!heard.includes(s)) heard.push(s);
          });
          heard.push(status());
        }
        for (const el of c.win.ownerDocument.querySelectorAll<HTMLElement>("#dw-mode-help, #dw-preview [data-mode]")) heard.push(el.textContent ?? "");
        const bad1 = heard.filter((s) => JARGON.test(s));
        if (bad1.length) bad.push(`internal words in: ${bad1.map((s) => `"${s}"`).join(", ")}`);
        said.push(`${heard.length} lines, none with internal words`);
      },
    ),
    preset(
      "one-preview-three-looks",
      "Three looks only: docks, floats, goes back",
      "In every preview the held item has three looks and nothing else changes between them: docked in its place it has the accent outline (Snap, where the item itself sits there); floating or going back it is plain; going back says \"Can't go here\". Its opacity and shadow never change. Snap draws the item where it floats; the other previews keep it on the pointer.",
      (c, bad, said) => {
        const looks = new Set<string>();
        for (const mode of VIEWER_MODES)
          for (const w of [PLACES[0]!, OTHERS[0]!, OTHERS[2]!]) {
            c.setState(defaultState());
            c.setDropPreview(mode);
            const p = w.to(c);
            const r = p && drive(c, w.id, (g): Key[] => hold(through([g, p], AIM), SETTLE), [], () => {
              const el = c.win.querySelector<HTMLElement>(".dw-held");
              if (!el) return;
              const cs = getComputedStyle(el);
              looks.add(`${cs.opacity}|${cs.boxShadow}`);
              const placed = el.hasAttribute("data-placed");
              const told = !c.win.querySelector<HTMLElement>(".dw-cant-go")!.hidden;
              if (placed && told) bad.push(`${mode}, ${w.name}: outlined and "Can't go here" at once`);
              if (placed && (mode === "indicator" || mode === "gap")) bad.push(`${mode}, ${w.name}: the held item outlined though it stays on the pointer`);
            });
            if (!r) bad.push(`${mode}, ${w.name}: no drag`);
          }
        if (looks.size !== 1) bad.push(`the held item's opacity and shadow changed: ${[...looks].join(" / ")}`);
        said.push("one opacity and shadow; outline only where it sits");
      },
    ),
    preset(
      "one-preview-guides-are-places",
      "Every place guide is a place a release takes, of the held item's kind",
      "With all place guides on in Snap: every guide a toolbar shows lies in a lane that takes a toolbar, never in a panel column (but an empty side rail's mark over the column's outer strip that moves aside for it), and a release with the pointer at the guide docks it in that lane; every guide a panel shows lies in a panel column or a new column's line, none on a bar or a rail.",
      (c, bad, said) => {
        c.setDropPreview("item");
        c.setPlaceGuides("snap", "all");
        try {
          /** The guides a drag of `id` shows, by id: the lane (the id's first part) and the rect. */
          const run = (id: ItemId, state: DockState): Map<string, { lane: string; r: Rect; kind: string }> => {
            c.setState(state);
            const seen = new Map<string, { lane: string; r: Rect; kind: string }>();
            const p = emptySpace(c, id);
            drive(c, id, (g): Key[] => hold(through([g, p], AIM), 200), [], () => {
              for (const el of c.win.querySelectorAll<HTMLElement>(".dw-guide[data-kind]:not([data-off])")) seen.set(el.dataset.guide!, { lane: el.dataset.guide!.split("/")[0]!, kind: el.dataset.kind ?? "", r: { x: parseFloat(el.style.left), y: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) } });
            });
            return seen;
          };
          const tools = run(TOOLBAR, defaultState());
          c.setState(defaultState());
          const cols = ["left", "right"].map((e) => c.layout.edges[e]?.rect).filter((r): r is Rect => !!r);
          // The lanes empty in the window the drag starts from (read once: each release below moves the toolbar).
          const startLayout = c.layout;
          // Overlap more than a hairline each way: a guide drawn in a panel column.
          const inside = (g: Rect, r: Rect): boolean => Math.min(g.x + g.width, r.x + r.width) - Math.max(g.x, r.x) > 1 && Math.min(g.y + g.height, r.y + r.height) - Math.max(g.y, r.y) > 1;
          for (const [id, { lane, r }] of tools) {
            const edge = c.state.edges.find((e) => e.id === lane);
            if (!edge || !edge.accepts.includes("group")) bad.push(`toolbar guide ${id} lies in ${lane}, which takes no toolbar`);
            // An empty lane's mark over a column is the room it takes (the column moves aside: an empty side rail's outer
            // strip, an empty bar's band over a column's top), at its real size or as a thin edge; any other toolbar guide
            // in a column is wrong. Empty in the window the drag starts from, not in the one the last release left.
            const emptyLane = (startLayout.edges[lane as keyof typeof startLayout.edges]?.cross ?? 0) <= 0;
            if (!emptyLane && cols.some((col) => inside(r, col))) bad.push(`toolbar guide ${id} is drawn in a panel column`);
            // A release with the pointer at the guide docks the toolbar in its lane.
            c.setState(defaultState());
            drive(c, TOOLBAR, (g): Key[] => hold(through([g, mid(r)], AIM), SETTLE));
            if (c.layout.items[TOOLBAR]?.edge !== lane) bad.push(`a release at toolbar guide ${id} landed in ${c.layout.items[TOOLBAR]?.edge ?? "no edge"}`);
          }
          if (tools.size === 0) bad.push("no toolbar guides with all on");
          // A panel: guides only in panel columns and new columns' lines.
          const panelGuides = [...run(PANEL, defaultState()), ...run(PANEL, put(defaultState(), "right", []))];
          const panelLane = (lane: string): boolean => lane.startsWith("column:") || !!c.state.edges.find((e) => e.id === lane && (e.side === "left" || e.side === "right") && !e.compact && e.accepts.includes("panel"));
          for (const [id, { lane }] of panelGuides) if (!panelLane(lane)) bad.push(`panel guide ${id} lies in ${lane}, no panel column`);
          if (panelGuides.length === 0) bad.push("no panel guides with all on");
          said.push(`toolbar: ${tools.size} guides, each docks it in its lane; panel: ${panelGuides.length} guides, all in columns`);
        } finally {
          c.setPlaceGuides("snap", null);
        }
      },
    ),
    preset(
      "one-preview-guides-near-all",
      "Near guides are the places near the pointer; all are every place",
      "One toolbar drag held over the document near the top bar, in Snap: near shows the top bar's places within reach and fewer than all, which shows every place of the drag.",
      (c, bad, said) => {
        const count = (g: "near" | "all"): number => {
          c.setDropPreview("item");
          c.setPlaceGuides("snap", g);
          c.setState(defaultState());
          const ct = c.layout.content;
          const p = { x: ct.x + ct.width / 2, y: ct.y + 40 };
          let n = 0;
          drive(c, TOOLBAR, (gr): Key[] => hold(through([gr, p], AIM), 120), [], () => {
            n = c.win.querySelectorAll(".dw-guide:not([data-off])").length;
          });
          return n;
        };
        try {
          const near = count("near");
          const all = count("all");
          if (!(near > 0 && near < all)) bad.push(`near ${near}, all ${all}`);
          said.push(`near ${near}, all ${all}`);
        } finally {
          c.setPlaceGuides("snap", null);
        }
      },
    ),
    preset(
      "one-preview-separate-lanes",
      "Panel rails and toolbar rails never share a lane",
      "With the panels collapsed into a left or right rail (titles or icons), no place a toolbar is offered puts it into the panels' rail or column, or draws it over that rail's lane after the drop; in Snap, Zoom held just right of the left panel rail lower down shows no outline while it is still on the pointer.",
      (c, bad, said) => {
        let checked = 0;
        for (const side of ["left", "right"] as const)
          for (const mode of ["titles", "icons"] as const) {
            const base = put(collapsed(["pages", "notes", "findings"]), side, ["pages", "notes", "findings"]);
            c.setState(base);
            c.setRailMode(side, mode);
            const col = c.state.edges.find((e) => e.id === side)!;
            for (const id of ["zoom", "tools", "views"] as const) {
              for (const t of c.targets(id)) {
                if (t.free || t.place.kind === "home") continue;
                const a = t.after({ x: 0, y: 0 }, { x: 4, y: 4 });
                const it = a.layout.items[id];
                const rail = a.layout.edges[col.id]?.rect;
                checked++;
                if (it?.edge === col.id) bad.push(`${side} ${mode}: ${id} → ${t.id} lands in the panels' column`);
                else if (it && rail && !it.floating && it.rect.x < rail.x + rail.width - 0.5 && rail.x < it.rect.x + it.rect.width - 0.5 && it.rect.y < rail.y + rail.height - 0.5 && rail.y < it.rect.y + it.rect.height - 0.5) bad.push(`${side} ${mode}: ${id} → ${t.id} lands over the panel rail's lane`);
              }
            }
          }
        // The screenshot's drag: Zoom just right of the left panel rail, lower down, in Snap: no outline on the pointer.
        c.setDropPreview("item");
        c.setState(put(collapsed(["pages", "notes", "findings"]), "left", ["pages", "notes", "findings"]));
        c.setRailMode("left", "icons");
        const rail = c.layout.edges.left!.rect;
        let outlined = 0;
        drive(c, "zoom", (g): Key[] => hold(through([g, { x: rail.x + rail.width + 14, y: rail.y + rail.height * 0.7 }], AIM), SETTLE), [], () => {
          const slot = c.win.querySelector<HTMLElement>(".dw-slot");
          if (slot && !slot.hidden) outlined++;
        });
        if (outlined) bad.push(`Snap showed an outline on ${outlined} frames`);
        said.push(`${checked} toolbar places, none in a panel rail's lane; no outline in Snap`);
      },
    ),
    preset(
      "one-preview-one-mark",
      "One landing, one mark: never an outline and a drop strip together",
      "In every preview, Zoom held at the left window edge, a toolbar over a bar's place and a panel over a column: no frame shows more than one mark of where the item lands (the dashed outline, a drop strip).",
      (c, bad, said) => {
        let frames = 0;
        const spots: readonly [ItemId, (c2: Docwin) => Point | null][] = [
          ["zoom", (c2) => ({ x: c2.state.stage.x + 3, y: c2.state.stage.y + c2.state.stage.height / 2 })],
          ["tools", (c2) => { const t = docking(c2, "tools")[0]; return t ? mid(t.hit) : null; }],
          [PANEL, (c2) => { const t = docking(c2, PANEL)[0]; return t ? mid(t.hit) : null; }],
        ];
        for (const mode of VIEWER_MODES)
          for (const [id, to] of spots) {
            c.setDropPreview(mode);
            c.setState(defaultState());
            const p = to(c);
            if (!p) continue;
            let both = 0;
            drive(c, id, (g): Key[] => hold(through([g, p], AIM), SETTLE), [], () => {
              frames++;
              if (marks(c).length > 1) both++;
            });
            if (both) bad.push(`${mode}, ${id}: more than one mark of the landing together on ${both} frames`);
          }
        said.push(`${frames} frames, one mark at most`);
      },
    ),
    preset(
      "one-preview-one-column-per-side",
      "One column per side, and no toolbar tray",
      "A stored layout with Notes in a second left column loads as one left column, Pages then Notes, and is stored that way. Dragging Findings offers no new column on the left, where a column is; a toolbar is offered no place in a panel column.",
      (c, bad, said) => {
        const base = defaultState();
        const left = base.edges.find((e) => e.id === "left")!;
        const two: DockState = { ...put(base, "left", ["pages"]), edges: [...put(base, "left", ["pages"]).edges, { ...left, id: "left-1" as typeof left.id, ring: 2, column: true, items: ["notes"] }] };
        c.setState(two);
        if (c.state.edges.filter((e) => e.side === "left" && !e.compact).length !== 2) bad.push("the two-column layout didn't set up");
        c.load();
        const cols = c.state.edges.filter((e) => e.side === "left" && !e.compact);
        if (cols.length !== 1 || cols[0]!.items.join() !== "pages,notes") bad.push(`loaded as ${cols.map((e) => `${e.id}[${e.items.join(",")}]`).join(" ")}`);
        const stored = JSON.stringify(c.stored());
        if (stored.includes("left-1")) bad.push("the stored layout still has the second column");
        if (c.targets("findings").some((t) => t.place.kind === "column" && t.place.side === "left")) bad.push("Findings is offered a new column on the left");
        if (c.targets("tools").some((t) => t.place.kind === "gap" && (t.place.edge === "left" || t.place.edge === "right"))) bad.push("a toolbar is offered a place in a panel column");
        said.push(`loaded as one left column (${cols[0]?.items.join(", ")}); no new left column; no tray`);
      },
    ),
    preset(
      "one-preview-mode-control",
      "The drop preview control is always in view and remembered",
      "The three drop preview modes are a segmented control at the top of the page, visible without opening anything: Outline, Placeholder, Snap. Clicking one sets the next drag's preview (Outline: an outline, no room; Placeholder: an outline and room; Snap: room and the item settling in, no outline) and keeps the choice in this browser for the next visit.",
      (c, bad, said) => {
        const bar = document.getElementById("dw-preview");
        if (!bar) {
          bad.push("no control on this page");
          return;
        }
        const r = bar.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || bar.closest("details:not([open])") || bar.closest("[hidden]")) bad.push("the control isn't visible");
        // The labels the user reads: Outline, Placeholder, Snap (the values stay the library's plans).
        const labels = [...bar.querySelectorAll<HTMLElement>("[data-mode]")].map((b) => `${b.dataset.mode}=${b.textContent?.trim()}`).join(" ");
        if (labels !== "indicator=Outline gap=Placeholder item=Snap") bad.push(`the labels read ${labels}`);
        // The viewer's stored choice, put back afterwards.
        let kept: [string, string | null][] = [];
        try {
          kept = Object.keys(localStorage).filter((k) => k.endsWith(":preview")).map((k) => [k, localStorage.getItem(k)]);
        } catch {
          // No storage: nothing to put back.
        }
        try {
          for (const mode of VIEWER_MODES) {
            // Twice: a drag just before (the previous case's) leaves the session swallowing the next click.
            bar.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)?.click();
            bar.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)?.click();
            if (c.dropPreview !== mode) bad.push(`${mode}: the drag preview is ${c.dropPreview}`);
            let stored = false;
            try {
              stored = Object.keys(localStorage).some((k) => k.endsWith(":preview") && localStorage.getItem(k) === mode);
            } catch {
              stored = true;
            }
            if (!stored) bad.push(`${mode}: not kept for the next visit`);
            if (bar.querySelector(`[data-mode="${mode}"]`)?.getAttribute("aria-checked") !== "true") bad.push(`${mode}: not shown as picked`);
            c.setState(defaultState());
            const t = docking(c, "views")[0];
            if (!t) {
              bad.push(`${mode}: no gap to drag to`);
              continue;
            }
            let slot = false;
            const d = drive(c, "views", (g): Key[] => hold(through([g, mid(t.hit)], AIM), SETTLE), [], () => {
              const el = c.win.querySelector<HTMLElement>(".dw-slot");
              if (el && !el.hidden) slot = true;
            });
            const room = !!d?.trace.rooms.some((f) => f.room);
            const snapped = !!d?.trace.snaps.some((s) => s.id);
            // [a dashed outline shows, room opens]: under Snap the item itself settles into its place, so no outline.
            const want = { item: [false, true], indicator: [true, false], gap: [true, true] }[mode];
            if (slot !== want[0] || room !== want[1]) bad.push(`${LABEL[mode]}: outline ${slot}, room ${room}`);
            if (mode === "item" && !snapped) bad.push("Snap: the item never settled in");
            said.push(`${LABEL[mode]}: outline ${slot ? "yes" : "no"}, room ${room ? "yes" : "no"}`);
          }
        } finally {
          try {
            for (const [k, v] of kept) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
          } catch {
            // No storage.
          }
        }
      },
    ),
    preset(
      "one-preview-panel-halves",
      "Over a docked panel, a held panel docks by halves",
      "With Pages floating and Notes alone in the left column, Pages held over Notes' lower half lands under Notes, and over its upper half above it, with the room opening and the item settling there; what is drawn at release is what lands. Swept down the whole column, Pages never shows \"Can't go here\".",
      (c, bad, said) => {
        const state = (): DockState => floating(put(defaultState(), "left", ["notes"]), "pages", { x: 500, y: 200, width: 240, height: 300 });
        for (const [half, f, want] of [["lower", 0.75, ["notes", "pages"]], ["upper", 0.25, ["pages", "notes"]]] as const) {
          c.setState(state());
          const n = c.layout.items.notes!.rect;
          const p = { x: n.x + n.width / 2, y: n.y + n.height * f };
          const r = drive(c, "pages", (g): Key[] => hold(through([g, p], AIM), SETTLE));
          if (!r) {
            bad.push(`${half} half: no drag`);
            continue;
          }
          const order = c.state.edges.find((e) => e.id === "left")!.items.filter((x) => x === "notes" || x === "pages");
          const it = c.layout.items.pages;
          if (!r.drop?.committed || it?.floating || order.join() !== want.join()) bad.push(`${half} half: landed on ${r.drop?.target ?? "nothing"}, the column reads ${order.join(", ")}`);
          if (!sameRect(shownAtRelease(r.trace), it?.rect)) bad.push(`${half} half: drawn ${say(shownAtRelease(r.trace))}, landed ${say(it?.rect)}`);
          said.push(`${half} half: ${order.join(", ")}`);
        }
        c.setState(state());
        const col = c.layout.edges.left!.rect;
        const x = col.x + col.width / 2;
        let told = 0;
        let frames = 0;
        const where: string[] = [];
        drive(c, "pages", (g): Key[] => hold(through([g, { x, y: col.y + 4 }, { x, y: col.y + col.height - 4 }], 0.3), 100), [], () => {
          frames++;
          if (!c.win.querySelector<HTMLElement>(".dw-cant-go")!.hidden) {
            told++;
            const f = c.trace!.frames.at(-1)!;
            where.push(`${Math.round(f.y)}${c.trace!.rooms.at(-1)?.shown ?? ""}`);
          }
        });
        if (told) bad.push(`"Can't go here" on ${told} of ${frames} frames down the column (at y ${where.join(" ")}, column ${say(col)})`);
        said.push(`no "Can't go here" in ${frames} frames down the column`);
      },
    ),
    preset(
      "one-preview-drawn-is-landed-at-edges",
      "Held against any window edge, what is drawn is what lands",
      "A toolbar and a panel held just inside each of the four window edges, with no inset and with one at the sides, with no column beside the content: wherever the item lands, the rect drawn at release is the rect it lands on, and it floats at every edge at least once. Where nothing lands, nothing moves.",
      (c, bad, said) => {
        const open = (inset: DockState["inset"]): DockState => ({ ...put(put(defaultState(), "left", [PANEL]), "right", []), ...(inset ? { inset } : {}) });
        for (const inset of [undefined, { left: 12, right: 12 }]) {
          const floated = new Set<string>();
          for (const id of [TOOLBAR, PANEL] as const)
            for (const edge of ["left", "right", "top", "bottom"] as const)
              for (const [off, shift] of [[5, false], [16, false], [48, false], [5, true], [16, true]] as const) {
                fresh(c);
                c.setState(open(inset));
                const s = c.state.stage;
                const m = mid(c.layout.content);
                const p = edge === "left" ? { x: s.x + off, y: m.y } : edge === "right" ? { x: s.x + s.width - off, y: m.y } : edge === "top" ? { x: m.x, y: s.y + off } : { x: m.x, y: s.y + s.height - off };
                const before = c.layout.items[id]?.rect;
                const name = `${id} ${off} px inside the ${edge} edge${inset ? ", inset" : ""}${shift ? ", Shift" : ""}`;
                // Shift floats it wherever it is held, so every edge is tried as a float as well as for what lies there.
                const r = drive(c, id, (g): Key[] => hold(through([g, m, p], AIM), SETTLE), shift ? [{ t: () => 0, run: () => c.keys({ shift: true }) }] : []);
                if (!r) {
                  bad.push(`${name}: no drag`);
                  continue;
                }
                const it = c.layout.items[id];
                if (!r.drop?.committed) {
                  if (!sameRect(it?.rect, before)) bad.push(`${name}: nothing landed, yet it moved`);
                  continue;
                }
                if (!sameRect(shownAtRelease(r.trace), it?.rect)) bad.push(`${name}: drawn ${say(shownAtRelease(r.trace))}, landed ${say(it?.rect)}`);
                if (it?.floating) floated.add(edge);
              }
          if (floated.size < 4) bad.push(`${inset ? "with an inset" : "no inset"}: it floated only at ${[...floated].join(", ")}`);
          said.push(`${inset ? "inset" : "no inset"}: drawn is landed, floats at ${floated.size} edges`);
        }
      },
    ),
    preset(
      "one-preview-inside-window",
      "A held item stays wholly inside the window at all four edges",
      "A toolbar and a panel held to each window edge, and 40 px past it, never lie outside the window on any frame; well inside the window the grip stays under the pointer.",
      (c, bad, said) => {
        for (const id of [TOOLBAR, "zoom", PANEL] as const) {
          let frames = 0;
          let off = 0;
          for (const edge of ["left", "right", "top", "bottom"] as const) {
            for (const past of [-2, 40]) {
              fresh(c);
              const s = c.state.stage;
              const m = mid(s);
              const p = edge === "left" ? { x: s.x - past, y: m.y } : edge === "right" ? { x: s.x + s.width + past, y: m.y } : edge === "top" ? { x: m.x, y: s.y - past } : { x: m.x, y: s.y + s.height + past };
              const r = drive(c, id, (g): Key[] => hold(through([g, m, p], AIM), 300), [], () => {
                frames++;
                const it = c.trace!.frames.at(-1)!.item;
                if (!within(it, s)) off++;
              });
              if (!r) bad.push(`${id}: no drag`);
            }
          }
          if (off) bad.push(`${id}: ${off} of ${frames} frames lie outside the window`);
          said.push(`${id}: ${frames} frames inside`);
        }
        fresh(c);
        const home = c.layout.items[TOOLBAR]!.rect;
        const g = c.gripOf(TOOLBAR)!;
        const m = mid(c.layout.content);
        const r = drive(c, TOOLBAR, (): Key[] => hold(through([g, m], AIM), 100));
        const it = r?.trace.frames.at(-1);
        // Over the document, clear of everything, the grip is where it was picked up on the item.
        if (!it || Math.abs(it.item.x - (it.x - (g.x - home.x))) > 1 || Math.abs(it.item.y - (it.y - (g.y - home.y))) > 1) bad.push(`the grip left the pointer in mid-window (${say(it?.item)})`);
      },
    ),
    presetFrom(
      wideNotes,
      "one-preview-wide-float-at-the-hand",
      "A float wider than the document lies at the hand",
      "Notes floating wider than the document (no clear place for it anywhere) dragged across the document: on every frame over the document the pointer is on the drawn item, which lies over the columns where it is wider than the gap, never off at a seam; \"Can't go here\" is drawn above the held item. Let go mid-document it lands exactly where it was shown, over a column, and stays there.",
      (c, bad, said) => {
        const ct = c.layout.content;
        const g = c.gripOf(PANEL);
        if (!g) {
          bad.push("no grip on Notes");
          return;
        }
        const y = ct.y + ct.height / 2;
        const path = [g, { x: ct.x + ct.width * 0.2, y }, { x: ct.x + ct.width * 0.8, y }, { x: ct.x + ct.width * 0.5, y: ct.y + ct.height * 0.4 }];
        let tagAbove = true;
        const r = drive(c, PANEL, (): Key[] => hold(through(path, AIM), 300), [], () => {
          const held = c.win.querySelector<HTMLElement>(".dw-held");
          const tag = c.win.querySelector<HTMLElement>(".dw-cant-go");
          if (held && tag && Number(getComputedStyle(tag).zIndex) <= Number(getComputedStyle(held).zIndex)) tagAbove = false;
        });
        if (!r) {
          bad.push("no drag");
          return;
        }
        let open = 0;
        let off = 0;
        for (const f of r.trace.frames) {
          if (f.x < ct.x || f.x > ct.x + ct.width || f.y < ct.y || f.y > ct.y + ct.height) continue;
          open++;
          if (f.x < f.item.x - 0.5 || f.x > f.item.x + f.item.width + 0.5 || f.y < f.item.y - 0.5 || f.y > f.item.y + f.item.height + 0.5) off++;
        }
        if (off) bad.push(`the pointer was off the drawn item on ${off} of ${open} frames over the document`);
        if (!tagAbove) bad.push(`"Can't go here" is drawn under the held item`);
        const shown = shownAtRelease(r.trace);
        const landed = c.layout.items[PANEL]?.rect;
        if (!r.drop?.committed || !sameRect(shown, landed)) bad.push(`shown ${say(shown)}, landed ${say(landed)}`);
        const columns = Object.values(c.layout.items).filter((p) => !p.floating && (p.edge === "left" || p.edge === "right"));
        if (!landed || !columns.some((p) => p.rect.x < landed.x + landed.width && landed.x < p.rect.x + p.rect.width)) bad.push(`it landed clear of the columns (${say(landed)})`);
        c.setState(c.state);
        if (!sameRect(c.layout.items[PANEL]?.rect, landed)) bad.push(`at rest it moved to ${say(c.layout.items[PANEL]?.rect)}`);
        said.push(`${open} frames over the document, the pointer on the item on each; landed at ${say(landed)}, over a column`);
      },
    ),
  ];
}

/** The default window with Notes floating 80 px wider than the document, so no clear place exists for it. */
function wideNotes(c: Docwin): void {
  fresh(c);
  const ct = c.layout.content;
  c.setState(floating(defaultState(), PANEL, { x: ct.x - 40, y: ct.y + 40, width: ct.width + 80, height: 200 }));
}
