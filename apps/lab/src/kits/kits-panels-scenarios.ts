/**
 * The kits page's scripted scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the window with real
 * pointer events, frame by frame, and checks its rules from what the page drew: the indicator's rect, where the held
 * item sat, where it settled, which panels folded, and each frame of the drag.
 */
import type { Rect } from "@n-uf/motion";
import type { DragPreview } from "@n-uf/motion/drag";
import { checkMonotonic, checkNoOvershoot, checkTempo, type RectSample } from "@n-uf/motion/testing";
import { verdict, type Row } from "../shared/checks";
import { nextFrame, type Point } from "../shared/geometry";
import { passes, type LabRun, type ScenarioFilter } from "../shared/hooks";
import { page, type KitsPage } from "./kits-panels";

type Page = KitsPage;
interface Scenario {
  readonly name: string;
  /** The modes it runs in: the drop previews, or "kit" (the kits' own drag). */
  readonly modes: readonly string[];
  run(p: Page, mode: string): Promise<Row[]>;
}

// --- driving the page ----------------------------------------------------------------------------------------------

let at: Point = { x: 0, y: 0 };
function pointer(p: Page, type: string, q: Point, target: EventTarget = window): void {
  const r = p.stage.getBoundingClientRect();
  at = q;
  target.dispatchEvent(
    new PointerEvent(type, { clientX: r.left + q.x, clientY: r.top + q.y, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true, pointerType: "mouse" }),
  );
}
const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await nextFrame();
};
/** Move from where the pointer is to `to`, `step` px a frame. */
async function glide(p: Page, to: Point, step: number): Promise<void> {
  const from = at;
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
  for (let i = 1; i <= n; i++) {
    pointer(p, "pointermove", { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
    await nextFrame();
  }
}
/** Fly most of the way, then aim: the last 24 px slowly. */
async function approach(p: Page, to: Point): Promise<void> {
  const d = Math.hypot(to.x - at.x, to.y - at.y);
  if (d > 24) await glide(p, { x: to.x - ((to.x - at.x) * 24) / d, y: to.y - ((to.y - at.y) * 24) / d }, 14);
  await glide(p, to, 2);
}
async function until(cond: () => boolean, max = 90): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    if (cond()) return true;
    await nextFrame();
  }
  return cond();
}
/** An element's rect on the stage, as drawn. */
function drawnRect(p: Page, el: Element): Rect {
  const s = p.stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - s.left - 1, y: r.top - s.top - 1, width: r.width, height: r.height };
}
const itemEl = (p: Page, key: string): HTMLElement => p.items.get(key)!.el;
const centreOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** A panel's title bar (left of its fold button), a group's handle. */
const headOf = (p: Page, key: string): { el: Element; at: Point } => {
  const r = drawnRect(p, itemEl(p, key));
  return { el: itemEl(p, key).querySelector(".kp-head")!, at: { x: r.x + 50, y: r.y + 11 } };
};
const handleOf = (p: Page, key: string): { el: Element; at: Point } => {
  const h = itemEl(p, key).querySelector(".kp-handle")!;
  return { el: h, at: centreOf(drawnRect(p, h)) };
};
async function pressAt(p: Page, h: { el: Element; at: Point }): Promise<void> {
  pointer(p, "pointerdown", h.at, h.el);
  await nextFrame();
}
async function release(p: Page): Promise<void> {
  pointer(p, "pointerup", at);
  await nextFrame();
}
const settled = (p: Page): Promise<void> => p.motion.idle();
const near = (a: Rect, b: Rect, tol = 1.5): boolean => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.width - b.width) <= tol && Math.abs(a.height - b.height) <= tol;
const fmt = (r: Rect | null): string => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}` : "none");
const row = (name: string, failures: string[], info?: string): Row => ({ name, result: verdict(failures), ...(info ? { info } : {}) });

/** Where the page showed the slot: the indicator's outline, or the held item sitting in it (snap). */
async function shownSlot(p: Page, key: string): Promise<{ rect: Rect | null; how: string }> {
  const ok = await until(() => !p.ind.hidden || !!p.dragging?.snapped, 120);
  if (!ok) return { rect: null, how: "nothing showed" };
  if (!p.ind.hidden) {
    await frames(2);
    return { rect: drawnRect(p, p.ind), how: "indicator" };
  }
  // Snapped: let the glide into the slot finish, then read where the item is drawn.
  const m = p.items.get(key)!.m;
  await until(() => near(m.drawn, m.target, 0.3), 90);
  return { rect: drawnRect(p, itemEl(p, key)), how: "the item in its slot" };
}

// --- places in the window (stage px) -------------------------------------------------------------------------------

const RIGHT_DOCK_LOW = (p: Page): Point => ({ x: 880, y: p.mid.y + 420 });
const LEFT_DOCK_LOW = (p: Page): Point => ({ x: 160, y: p.mid.y + 440 });
const DOCUMENT = (p: Page): Point => ({ x: 520, y: p.mid.y + 230 });
const LEFT_RAIL = (p: Page): Point => ({ x: 17, y: p.mid.y + 200 });
const BOTTOM_BAR = { x: 520, y: 580 };

// --- the scenarios -------------------------------------------------------------------------------------------------

const PREVIEWS: readonly DragPreview[] = ["indicator", "gap", "snap"];

const landsWhereShown: Scenario = {
  name: "a panel lands where its slot showed",
  modes: PREVIEWS,
  async run(p, mode) {
    p.setPanelMode("dock");
    p.setPreview(mode as DragPreview);
    const key = "panel:2";
    await pressAt(p, headOf(p, key));
    await approach(p, RIGHT_DOCK_LOW(p));
    const shown = await shownSlot(p, key);
    await release(p);
    await settled(p);
    const landed = drawnRect(p, itemEl(p, key));
    const d = p.lastDrop;
    return [
      row("the page showed a slot", shown.rect ? [] : ["no indicator and no snap while aiming at the right dock"], shown.how),
      row("it landed where the slot showed", shown.rect && !near(landed, shown.rect) ? [`showed ${fmt(shown.rect)} (${shown.how}), landed at ${fmt(landed)}`] : [], fmt(landed)),
      row("it landed on the target the page showed", d && d.landed === d.shownAtRelease && d.landed === "dock:right:1" ? [] : [`landed on ${d?.landed ?? "home"}, the page showed ${d?.shownAtRelease ?? "nothing"}`]),
    ];
  },
};

const giveWay: Scenario = {
  name: "give-way folds the least recently used section",
  modes: ["snap"],
  async run(p) {
    p.setPanelMode("dock");
    p.setPreview("snap");
    const look = (k: string): string => itemEl(p, k).dataset.look ?? "";
    const pre = ["panel:1", "panel:2", "panel:3"].filter((k) => look(k) !== "section");
    // History (least recently used before the drop, the dropped one after it) into the left dock under Notes.
    await pressAt(p, headOf(p, "panel:3"));
    await approach(p, LEFT_DOCK_LOW(p));
    await until(() => !!p.dragging?.snapped, 120);
    const notes = p.items.get("panel:2")!.m;
    const outline = p.items.get("panel:1")!.m;
    await until(() => near(notes.drawn, notes.target, 0.3), 60);
    const during = { notes: notes.drawn.height, outline: outline.drawn.height };
    await release(p);
    await settled(p);
    const after = { outline: drawnRect(p, itemEl(p, "panel:1")), notes: drawnRect(p, itemEl(p, "panel:2")), history: drawnRect(p, itemEl(p, "panel:3")) };
    const d = p.lastDrop;
    return [
      row("all three sections open before the drag", pre.length ? [`${pre.join(", ")} already folded`] : []),
      row("Notes (least recently used) folds as the slot opens", Math.abs(during.notes - 22) > 1 || during.outline <= 23 ? [`while the room was open Notes was ${Math.round(during.notes)} px, Outline ${Math.round(during.outline)} px tall`] : []),
      row(
        "after the drop Notes is a folded header, Outline and History stay open",
        look("panel:2") !== "header" || Math.abs(after.notes.height - 22) > 1.5 || look("panel:1") !== "section" || look("panel:3") !== "section" || after.outline.height <= 23 || after.history.height <= 23
          ? [`Outline ${look("panel:1")} ${Math.round(after.outline.height)} px, Notes ${look("panel:2")} ${Math.round(after.notes.height)} px, History ${look("panel:3")} ${Math.round(after.history.height)} px`]
          : [],
      ),
      row("the drop says Notes folded to make room", d && d.folded.length === 1 && d.folded[0] === "panel:2" && d.landed === "dock:left:2" ? [] : [`landed on ${d?.landed ?? "home"}, folded ${d?.folded.join(", ") || "nothing"}`]),
    ];
  },
};

const tearOff: Scenario = {
  name: "tear-off and dock back",
  modes: ["snap"],
  async run(p) {
    p.setPanelMode("dock");
    p.setPreview("snap");
    const key = "panel:1";
    const el = itemEl(p, key);
    // Over the document: it tears off and floats where the outline showed.
    await pressAt(p, headOf(p, key));
    await approach(p, DOCUMENT(p));
    const floatShown = await shownSlot(p, key);
    await release(p);
    await settled(p);
    const floated = drawnRect(p, el);
    const torn = p.desk.torn.map((f) => f.id);
    const docCol = { x0: 34 + 246, x1: 1040 - 34 - 246 };
    const out: Row[] = [
      row("over the document it shows where it will float", floatShown.how === "indicator" && floatShown.rect ? [] : [`showed ${floatShown.how}`]),
      row(
        "it tears off as a palette where that outline was",
        el.dataset.look !== "float" || !el.classList.contains("floating") || !torn.includes(1) || Math.abs(floated.width - p.tornWidth) > 1 || !floatShown.rect || !near(floated, floatShown.rect)
          ? [`look ${el.dataset.look}, torn [${torn.join(", ")}], drawn ${fmt(floated)}, outline ${fmt(floatShown.rect)}`]
          : [],
        fmt(floated),
      ),
      row("the palette floats over the document", floated.x < docCol.x0 - 1 || floated.x + floated.width > docCol.x1 + 1 ? [`${fmt(floated)} is outside the document's column ${docCol.x0}–${docCol.x1}`] : []),
    ];
    // Back onto the left rail: it docks at the end of the left dock, into a slot of its own size.
    await pressAt(p, headOf(p, key));
    await approach(p, LEFT_RAIL(p));
    const dockShown = await shownSlot(p, key);
    await release(p);
    await settled(p);
    const docked = drawnRect(p, el);
    out.push(
      row("on the rail it shows a slot in the dock", dockShown.rect && dockShown.rect.width > 200 ? [] : [`showed ${dockShown.how} ${fmt(dockShown.rect)}`]),
      row(
        "it docks back where the slot showed",
        el.dataset.look !== "section" || p.desk.torn.length > 0 || p.desk.left.join(",") !== "2,1" || !dockShown.rect || !near(docked, dockShown.rect) || Math.abs(docked.x - 40) > 1.5
          ? [`look ${el.dataset.look}, left dock [${p.desk.left.join(", ")}], torn ${p.desk.torn.length}, drawn ${fmt(docked)}, slot ${fmt(dockShown.rect)}`]
          : [],
        fmt(docked),
      ),
    );
    return out;
  },
};

const noFeedbackFlying: Scenario = {
  name: "no feedback while flying, for a group and a panel",
  modes: ["snap"],
  async run(p) {
    p.setPanelMode("dock");
    p.setPreview("snap");
    const out: Row[] = [];
    const fly = async (label: string, start: { el: Element; at: Point }, path: Point[], aimAt: Point): Promise<void> => {
      await pressAt(p, start);
      await glide(p, { x: start.at.x + 12, y: start.at.y + 12 }, 6);
      const t0 = performance.now();
      for (const q of path) await glide(p, q, 30);
      const t1 = performance.now();
      // Then aim: the feedback comes (so the check above isn't vacuous).
      await approach(p, aimAt);
      const came = await until(() => !p.ind.hidden || !!p.dragging?.snapped, 120);
      const frames0 = p.dragging ? 1 : 0;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await release(p);
      await settled(p);
      const bad = p.lastFrames
        .filter((f) => f.t >= t0 && f.t <= t1)
        .flatMap((f) => {
          const what = [f.indicator ? "the indicator" : "", f.snapped ? "a snap" : "", f.moved.length ? `room (${f.moved.join(", ")} moved)` : ""].filter(Boolean);
          return what.length ? [`at ${Math.round(f.pointer.x)},${Math.round(f.pointer.y)}: ${what.join(" and ")} while flying`] : [];
        })
        .slice(0, 3);
      const flown = p.lastFrames.filter((f) => f.t >= t0 && f.t <= t1);
      out.push(row(`${label}: nothing shows while it flies over targets`, flown.length < 8 ? [`only ${flown.length} frames of flight recorded`] : bad, `${flown.length} frames`));
      const tail = p.lastFrames.filter((f) => f.t > t1).slice(-4);
      const info = tail.map((f) => `${Math.round(f.pointer.x)},${Math.round(f.pointer.y)} aiming ${f.aiming} shown ${f.shown}`).join(" | ");
      out.push(row(`${label}: aiming afterwards shows the slot`, came && frames0 ? [] : [`no feedback came after slowing down (${info})`]));
    };
    await fly("Zoom (group)", handleOf(p, "g:zoom"), [BOTTOM_BAR, { x: 120, y: 580 }, { x: 300, y: 300 }, { x: 900, y: 320 }, { x: 600, y: 52 }], BOTTOM_BAR);
    await fly("Notes (panel)", headOf(p, "panel:2"), [RIGHT_DOCK_LOW(p), DOCUMENT(p), LEFT_RAIL(p), { x: 880, y: p.mid.y + 60 }, { x: 160, y: p.mid.y + 300 }], RIGHT_DOCK_LOW(p));
    return out;
  },
};

const sameSettle: Scenario = {
  name: "a group and a panel follow the same settle",
  modes: ["indicator"],
  async run(p) {
    p.setPanelMode("dock");
    p.setPreview("indicator");
    // A critically damped settle covers 90 % of the way in ln(10)/ω.
    const t90 = (Math.log(10) / p.omega) * 1000;
    const land = async (key: string, start: { el: Element; at: Point }, to: Point): Promise<{ samples: RectSample[]; from: Rect; to: Rect; t0: number; landed: string | null }> => {
      await pressAt(p, start);
      await approach(p, to);
      await until(() => !p.ind.hidden, 120);
      // Let go a little off the slot, so the landing has a way to go.
      await glide(p, { x: to.x + 18, y: to.y - 14 }, 3);
      const m = p.items.get(key)!.m;
      const samples: RectSample[] = [];
      const t0 = performance.now();
      samples.push({ t: t0, rect: { ...m.drawn } });
      const stop = p.motion.onFrame(() => samples.push({ t: performance.now(), rect: { ...m.drawn } }));
      await release(p);
      await settled(p);
      stop();
      return { samples, from: samples[0]!.rect, to: { ...m.target }, t0, landed: p.lastDrop?.landed ?? null };
    };
    const g = await land("g:zoom", handleOf(p, "g:zoom"), BOTTOM_BAR);
    const n = await land("panel:2", headOf(p, "panel:2"), RIGHT_DOCK_LOW(p));
    const out: Row[] = [];
    const tempos: number[] = [];
    for (const [label, s] of [["Zoom (group)", g], ["Notes (panel)", n]] as const) {
      const tempo = checkTempo(s.samples, s.from, s.to, t90, 0.25, s.t0);
      if (tempo.t90 !== null) tempos.push(tempo.t90);
      out.push(row(`${label} landed on a target`, s.landed ? [] : ["it went home"], s.landed ?? ""));
      out.push(row(`${label} settles at ω ${p.omega} (90 % in ${Math.round(t90)} ms)`, [...tempo.failures], tempo.t90 === null ? "" : `${Math.round(tempo.t90)} ms`));
      out.push(row(`${label} never overshoots`, [...checkNoOvershoot(s.samples, s.from, s.to).failures]));
      out.push(row(`${label} closes in steadily`, [...checkMonotonic(s.samples, s.to).failures]));
    }
    const [a, b] = tempos;
    out.push(row("the group's and the panel's settle match", a !== undefined && b !== undefined && Math.abs(a - b) <= 0.2 * Math.max(a, b) ? [] : [`90 % after ${tempos.map((x) => Math.round(x)).join(" ms and ")} ms`]));
    return out;
  },
};

const kitToday: Scenario = {
  name: "today: the kits' drag ghosts, lines and drops at once; groups stay held",
  modes: ["kit"],
  async run(p) {
    p.setPanelMode("kit");
    p.setPreview("snap");
    const key = "panel:2";
    const el = itemEl(p, key);
    await pressAt(p, headOf(p, key));
    await glide(p, { x: at.x + 8, y: at.y }, 4);
    const ghost = !!p.kitDragging?.ghost.isConnected;
    const faded = Math.abs(Number(getComputedStyle(el).opacity) - 0.35) < 0.02;
    await glide(p, RIGHT_DOCK_LOW(p), 30);
    const lineWhileFlying = p.lastKitFrames.length === 0 ? !p.line.hidden : true;
    await release(p);
    await nextFrame();
    const m = p.items.get(key)!.m;
    const atOnce = near(m.drawn, m.target, 0.01);
    const kitFrames = p.lastKitFrames;
    const landed = p.lastDrop?.landed ?? null;
    await settled(p);
    // A group in the same mode: the real group lifts, no ghost.
    const zoom = handleOf(p, "g:zoom");
    await pressAt(p, zoom);
    await glide(p, { x: zoom.at.x + 20, y: zoom.at.y + 10 }, 4);
    const groupHeld = p.dragging?.key === "g:zoom" && !p.kitDragging;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await release(p);
    await settled(p);
    return [
      row("the panel stays put at 0.35 opacity under a ghost copy", ghost && faded ? [] : [`ghost ${ghost}, faded ${faded}`]),
      row("an insert line shows on the last move, even flying", lineWhileFlying && kitFrames.some((f) => f.line) ? [] : ["no insert line while flying"]),
      row("the drop is instant (no glide)", atOnce && landed === "dock:right:1" ? [] : [`landed on ${landed ?? "nothing"}, drawn ${fmt(m.drawn)} vs ${fmt(m.target)} on the next frame`]),
      row("a group still lifts itself (held drag)", groupHeld ? [] : ["the group didn't lift as a held drag"]),
    ];
  },
};

const SCENARIOS: readonly Scenario[] = [landsWhereShown, giveWay, tearOff, noFeedbackFlying, sameSettle, kitToday];

// --- runAll --------------------------------------------------------------------------------------------------------

function installScenarios(p: Page, runButton: HTMLButtonElement, table: HTMLTableSectionElement): void {
  const runs: LabRun[] = [];
  let lastRows: Row[] = [];
  const restore = { mode: p.panelMode, preview: p.preview };
  async function runAll(filter?: ScenarioFilter): Promise<LabRun[]> {
    runs.length = 0;
    restore.mode = p.panelMode;
    restore.preview = p.preview;
    for (const s of SCENARIOS) {
      if (!passes(s.name, filter)) continue;
      for (const mode of s.modes) {
        p.reset();
        await settled(p);
        let rows: Row[];
        try {
          rows = await s.run(p, mode);
        } catch (e) {
          rows = [row("the scenario ran", [String(e)])];
        }
        lastRows = rows;
        runs.push({ scenario: s.name, mode, failed: rows.filter((r) => r.result && !r.result.ok).map((r) => r.name), rows });
      }
    }
    p.reset();
    p.setPanelMode(restore.mode);
    p.setPreview(restore.preview);
    await settled(p);
    render();
    return [...runs];
  }
  function render(): void {
    table.innerHTML = runs
      .map((r) => {
        const why = r.rows.filter((x) => x.result && !x.result.ok).map((x) => `${x.name}: ${x.result!.failures.slice(0, 2).join("; ")}`);
        return `<tr><td>${r.scenario}</td><td>${r.mode}</td><td class="${r.failed.length ? "bad" : "ok"}">${r.failed.length ? "✗" : "✓"}</td><td>${why.join(" · ")}</td></tr>`;
      })
      .join("");
  }
  runButton.addEventListener("click", async () => {
    runButton.disabled = true;
    await runAll();
    runButton.disabled = false;
  });
  window.__motionLab = { runAll, runs, lastRows: () => lastRows };
}

installScenarios(page, document.getElementById("kp-run") as HTMLButtonElement, document.getElementById("kp-runs") as HTMLTableSectionElement);
