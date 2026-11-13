/**
 * The Panels pages: a document viewer's desk on @n-uf/placement/panels. Three columns on the left, two on the right,
 * a float that moves with the page and one pinned to the view. Every rect comes from `layoutPanels`; every item is
 * drawn by one @n-uf/motion/layout motion; a dragged panel follows the pointer by `holdItem`, and what shows, when,
 * and what a release lands on are the drag intent's (`createDragIntent` + `previewPlan`), on `panelTargets`.
 *
 * The page writes every word: the package gives places, kinds and note codes, never labels.
 * The scripted scenarios (panels-scenarios.ts) drive it through `page`.
 */
import { createFrameLoop, type Rect } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import { DRAG_DEFAULTS, createDragIntent, previewPlan, type DragIntent } from "@n-uf/motion/drag";
import { createLayoutMotion, domDrawable, holdItem, type HeldDrag, type LayoutItem } from "@n-uf/motion/layout";
import {
  DEFAULT_PANELS_OPTIONS,
  createPanels,
  defOf,
  focus,
  homePlace,
  keep,
  layoutPanels,
  liftPanel,
  panelDrop,
  panelTargets,
  pin,
  readPanels,
  resizeColumn,
  resizeFloat,
  storePanels,
  toggleFold,
  whereIs,
  type Clock,
  type GiveWay,
  type PanelDef,
  type PanelDrop,
  type PanelPlace,
  type PanelStop,
  type PanelTarget,
  type PanelTargetInput,
  type PanelsLayout,
  type PanelsNote,
  type PanelsOptions,
  type PanelsState,
  type Side,
  type View,
} from "@n-uf/placement/panels";
import { keyboardStops } from "@n-uf/placement/targets";
import { same, type Point } from "../shared/geometry";

// --- the desk ------------------------------------------------------------------------------------------------------

export const H = 520;
export const DEFAULT_W = 1260;
export const OMEGA = 25;

const w = (min: number, natural: number, max: number) => ({ min, natural, max });
export const DEFS: readonly PanelDef[] = [
  { id: "files", width: w(150, 180, 300) },
  { id: "outline", width: w(160, 200, 320) },
  { id: "notes", width: w(140, 160, 280) },
  { id: "inspector", width: w(170, 200, 320), sides: ["right"] },
  { id: "history", width: w(150, 180, 300) },
  { id: "comments", width: w(180, 220, 320), float: { min: { width: 200, height: 140 }, natural: { width: 240, height: 220 } } },
  { id: "navigator", width: w(160, 180, 280), float: { min: { width: 160, height: 120 }, natural: { width: 180, height: 140 } } },
];
/** The page's words for the panels (the package carries none). */
const TITLES: Record<string, string> = { files: "Files", outline: "Outline", notes: "Notes", inspector: "Inspector", history: "History", comments: "Comments", navigator: "Navigator" };
const ROWS: Record<string, readonly string[]> = {
  files: ["Quarterly plan.pdf", "Budget.xlsx", "Notes from Monday", "Timeline.pdf", "Appendix A"],
  outline: ["1. Scope", "2. Budget", "3. Timeline", "4. Risks", "5. Sign-off"],
  notes: ["Check the Q3 total", "Ask about p. 7", "Redo the chart"],
  inspector: ["Page 2 of 12", "A4 · portrait", "3 comments", "Last edit 10:42"],
  history: ["p. 3 edited", "p. 7 commented", "Shared", "Renamed"],
  comments: ["Sam: is this final?", "Ana: see p. 4", "Lee: approved"],
  navigator: ["▭ ▭ ▭", "▭ ▣ ▭"],
};
export const titleOf = (id: string): string => TITLES[id] ?? id;

/** Files is the oldest, History the newest; Comments floats with the page, Navigator is pinned to the view. */
export const startState = (): PanelsState =>
  createPanels(DEFS, {
    left: [["files"], ["outline"], ["notes"]],
    right: [["inspector"], ["history"]],
    floats: [
      { id: "comments", x: 580, y: 70 },
      { id: "navigator", x: 680, y: 340, pinned: true },
    ],
  });

// --- state ---------------------------------------------------------------------------------------------------------

let state: PanelsState = startState();
let W = DEFAULT_W;
let giveWay: GiveWay = DEFAULT_PANELS_OPTIONS.giveWay;
let floats: PanelsOptions["floats"] = DEFAULT_PANELS_OPTIONS.floats;
let view: View = { x: 0, y: 0, scale: 1 };

const opts = (): Partial<PanelsOptions> => ({ giveWay, floats, view });
const stageSize = () => ({ width: W, height: H });
export const lay = (s: PanelsState = state): PanelsLayout => layoutPanels(DEFS, s, stageSize(), opts());

const stage = document.getElementById("pn-stage") as HTMLDivElement;
const status = document.getElementById("pn-status") as HTMLParagraphElement;
const loop = createFrameLoop({ clock: createBrowserClock() });
export const motion = createLayoutMotion({ loop, omega: OMEGA, phase: "update" });

interface Item {
  readonly key: string;
  readonly el: HTMLElement;
  readonly m: LayoutItem;
}
const items = new Map<string, Item>();

function el(tag: string, cls: string, html = ""): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}

// --- words (the package gives places and codes; the page names them) -----------------------------------------------

const Cap = (s: Side): string => (s === "left" ? "Left" : "Right");
/** A place in words, read against the state the panel is lifted out of. */
export function placeWords(p: PanelPlace, id: string, s: PanelsState = state): string {
  switch (p.kind) {
    case "float":
      return "Float here";
    case "rail":
      return `${Cap(p.side)} rail: docked folded`;
    case "column":
      return `${Cap(p.side)} side · new column ${p.index + 1}`;
    case "into":
      return `Into ${liftPanel(s, id).sides[p.side][p.index]?.panels.map(titleOf).join(" + ") ?? "a column"}`;
  }
}
const noteWords = (n: PanelsNote): string => {
  switch (n.code) {
    case "column-shrunk":
      return `${n.items.map(titleOf).join(" + ")} narrowed to ${Math.round(n.to)} px`;
    case "column-folded":
      return `${n.items.map(titleOf).join(" + ")} folded to the ${n.side} rail`;
    case "kept-folded":
      return `${n.items.map(titleOf).join(" + ")} folded although kept open`;
    case "pages-under-min":
      return `the pages have ${Math.round(n.width)} px, under ${n.min}`;
    case "float-clamped":
      return `${n.items.map(titleOf).join(", ")} kept in view`;
    case "float-resized":
      return `${n.items.map(titleOf).join(", ")} shrank to the view`;
  }
};

// --- items ---------------------------------------------------------------------------------------------------------

const dots = "<i></i>".repeat(6);
const panelHtml = (id: string): string =>
  `<div class="pn-head" tabindex="0" role="button" aria-label="Move ${titleOf(id)}"><span class="pn-grip" aria-hidden="true">${dots}</span><span class="pn-name">${titleOf(id)}</span>` +
  `<button type="button" class="pn-btn pn-keep" aria-pressed="false" aria-label="Keep open" title="Keep open">◇</button>` +
  `<button type="button" class="pn-btn pn-pin" aria-pressed="false" aria-label="Pin to the view" title="Pin to the view">⊙</button>` +
  `<button type="button" class="pn-btn pn-fold" aria-label="Fold ${titleOf(id)}" title="Fold">▾</button></div>` +
  `<ul class="pn-body">${(ROWS[id] ?? []).map((r) => `<li>${r}</li>`).join("")}</ul><span class="pn-corner" aria-hidden="true"></span>`;
const pagesHtml = `<div class="pn-paper"><h4>2. Scope of work</h4>${'<div class="pn-l"></div>'.repeat(14)}<div class="pn-l short"></div></div>`;

const ind = el("div", "pn-ind");
const indLabel = el("div", "pn-ind-label");
ind.hidden = indLabel.hidden = true;
const edges = new Map<string, HTMLElement>();

function addItem(key: string, e: HTMLElement, at: Rect): Item {
  stage.append(e);
  const it = { key, el: e, m: motion.add(key, domDrawable({ node: e }), at) };
  items.set(key, it);
  return it;
}

function makeItems(): void {
  const l = lay();
  addItem("pages", el("div", "pn-pages", pagesHtml), l.pages);
  for (const side of ["left", "right"] as const) {
    const r = el("nav", "pn-rail");
    r.dataset.side = side;
    addItem(`rail:${side}`, r, l.rails[side]?.rect ?? { x: side === "left" ? 0 : W, y: 0, width: 0, height: H });
  }
  for (const d of DEFS) {
    const e = el("section", "pn-panel", panelHtml(d.id));
    e.dataset.id = d.id;
    addItem(d.id, e, l.items.get(d.id)?.rect ?? { x: 0, y: 0, width: 0, height: 0 });
  }
  stage.append(ind, indLabel);
}

/** Where every item goes now (the room a held drag makes, if any). */
export function layoutNow(): { rects: Map<string, Rect>; layout: PanelsLayout } {
  const l = lay(drag?.room?.state ?? state);
  const rects = new Map<string, Rect>();
  rects.set("pages", l.pages);
  for (const side of ["left", "right"] as const) rects.set(`rail:${side}`, l.rails[side]?.rect ?? { x: side === "left" ? 0 : W, y: 0, width: 0, height: H });
  for (const [id, p] of l.items) rects.set(id, p.rect);
  return { rects, layout: l };
}

function dress(l: PanelsLayout): void {
  for (const d of DEFS) {
    const it = items.get(d.id)!;
    const p = l.items.get(d.id);
    const showing = !!p && !p.hidden;
    if (showing !== it.m.showing) it.m.show(showing);
    if (!p) continue;
    it.el.dataset.kind = p.kind;
    it.el.classList.toggle("float", p.kind === "float");
    it.el.classList.toggle("bar", p.kind === "bar");
    it.el.classList.toggle("kept", p.kept);
    it.el.style.zIndex = p.kind === "float" ? String(5 + p.layer) : "";
    it.el.querySelector(".pn-keep")!.setAttribute("aria-pressed", String(p.kept));
    it.el.querySelector(".pn-keep")!.textContent = p.kept ? "◆" : "◇";
    it.el.querySelector(".pn-pin")!.setAttribute("aria-pressed", String(p.pinned));
  }
  for (const side of ["left", "right"] as const) {
    const rail = l.rails[side];
    const it = items.get(`rail:${side}`)!;
    if (!!rail !== it.m.showing) it.m.show(!!rail);
    const segs = rail?.segments ?? [];
    const sig = segs.map((s) => `${s.id}@${s.rect.y}:${l.items.get(s.id)?.folded}`).join(",");
    if (it.el.dataset.sig !== sig) {
      it.el.dataset.sig = sig;
      it.el.innerHTML = segs
        .map((s) => `<button type="button" class="pn-seg ${l.items.get(s.id)?.folded ?? ""}" data-id="${s.id}" style="top:${s.rect.y - rail!.rect.y + 4}px" title="${titleOf(s.id)}" aria-label="${titleOf(s.id)}">${titleOf(s.id).slice(0, 2)}</button>`)
        .join("");
    }
  }
  // The page under the pages area: scrolled and scaled with the view.
  const paper = items.get("pages")!.el.querySelector<HTMLElement>(".pn-paper")!;
  paper.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  placeEdges(l);
}

/** The column resize handles, at each open column's inner edge. */
function placeEdges(l: PanelsLayout): void {
  const want = new Set<string>();
  for (const c of l.columns) {
    if (c.folded) continue;
    const key = `${c.side}:${c.index}`;
    want.add(key);
    let e = edges.get(key);
    if (!e) {
      e = el("div", "pn-edge");
      e.dataset.side = c.side;
      e.dataset.index = String(c.index);
      e.setAttribute("aria-label", "Resize the column");
      edges.set(key, e);
      stage.append(e);
    }
    const x = c.side === "left" ? c.rect.x + c.rect.width : c.rect.x;
    Object.assign(e.style, { left: `${x}px`, top: "0px", height: `${H}px` });
  }
  for (const [k, e] of edges) {
    if (want.has(k)) continue;
    e.remove();
    edges.delete(k);
  }
}

function relayout(instant = false): void {
  const { rects, layout: l } = layoutNow();
  dress(l);
  for (const [key, it] of items) {
    if (drag && key === drag.id) continue;
    const r = rects.get(key);
    if (!r) continue;
    if (instant) it.m.jumpTo(r);
    else if (!same(it.m.target, r)) it.m.moveTo(r);
  }
}

// --- the held drag -------------------------------------------------------------------------------------------------

/** One frame of a held drag, as the page drew it. */
export interface DragFrameLog {
  readonly t: number;
  readonly pointer: Point;
  readonly shown: string | null;
  readonly indicator: boolean;
  readonly snapped: boolean;
}

interface Held {
  readonly id: string;
  readonly item: Item;
  readonly grab: Point;
  readonly home: Rect;
  readonly held: HeldDrag;
  readonly intent: DragIntent<PanelTarget>;
  readonly input: PanelTargetInput;
  readonly targets: readonly PanelTarget[];
  readonly before: PanelsState;
  readonly frames: DragFrameLog[];
  pointer: Point;
  shown: PanelDrop | null;
  room: PanelDrop | null;
  snapped: PanelDrop | null;
}
let drag: Held | null = null;

const slotted = (d: PanelDrop | null): d is PanelDrop => !!d && !d.free && !d.hidden;
const dropOf = (d: { input: PanelTargetInput; grab: Point }, t: PanelTarget, p: Point): PanelDrop => panelDrop(d.input, t, p, d.grab);

function beginHeld(it: Item, p: Point, grab: Point, glide: boolean): void {
  const home = { ...it.m.drawn };
  const input: PanelTargetInput = { defs: DEFS, state, id: it.key, stage: stageSize(), options: opts() };
  const targets = panelTargets(input);
  const intent = createDragIntent<PanelTarget>({ home, placeOf: (t, q) => panelDrop(input, t, q, grab).key });
  const held = holdItem(it.m, grab);
  drag = { id: it.key, item: it, grab, home, held, intent, input, targets, before: state, frames: [], pointer: p, shown: null, room: null, snapped: null };
  it.el.classList.add("lifted");
  it.m.show(true);
  if (glide) {
    held.snapTo({ ...it.m.drawn });
    held.snapTo(null);
  }
  held.move(p);
  stage.classList.add("dragging");
  motion.task(() => {
    if (!drag) return false;
    aim(performance.now());
    return true;
  });
}

/** Once a frame while a panel is held: the intent says what shows, the preview what moves. */
function aim(now: number): void {
  const d = drag;
  if (!d) return;
  const f = d.intent.update(d.pointer, now, d.targets);
  const drop = f.shown ? dropOf(d, f.shown, d.pointer) : null;
  const plan = previewPlan(f, "snap", slotted(drop));
  const roomFor = plan.makeRoom ? f.roomPlace : null;
  const room = roomFor === null ? null : drop?.key === roomFor ? drop : d.room?.key === roomFor ? d.room : null;
  if (room?.key !== d.room?.key) {
    d.room = room;
    relayout();
  }
  d.shown = drop;
  showIndicator(plan.showIndicator ? drop : null, d.id);
  const want = plan.snapItem && slotted(d.room) ? d.room : null;
  if (want) {
    if (d.snapped?.key !== want.key) {
      d.snapped = want;
      d.held.snapTo(want.slot);
    }
  } else {
    if (d.snapped) {
      d.snapped = null;
      d.held.snapTo(null);
    }
    d.held.follow();
  }
  d.frames.push({ t: now, pointer: { ...d.pointer }, shown: drop?.target ?? null, indicator: !ind.hidden, snapped: !!d.snapped });
}

function showIndicator(d: { slot: Rect; free: boolean; hidden: boolean; place: PanelPlace; layout: PanelsLayout } | null, id: string): void {
  if (!d) {
    ind.hidden = indLabel.hidden = true;
    return;
  }
  // Folded into a rail: the rail; else where the panel lands.
  const r = d.hidden && d.place.kind !== "float" ? (d.layout.rails[d.place.side]?.rect ?? d.slot) : d.slot;
  Object.assign(ind.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
  ind.classList.toggle("free", d.free);
  indLabel.textContent = placeWords(d.place, id);
  Object.assign(indLabel.style, { left: `${Math.min(Math.max(4, r.x), W - 160)}px`, top: `${Math.max(4, r.y + 6)}px` });
  ind.hidden = indLabel.hidden = false;
}

/** The last drop: what it landed on (null: home), what the page showed at the release, and where it went. */
export interface DropRecord {
  readonly id: string;
  readonly landed: string | null;
  readonly shownAtRelease: string | null;
  readonly to: Rect | null;
  readonly changed: boolean;
  readonly cancelled: boolean;
}
let lastDrop: DropRecord | null = null;
let lastFrames: readonly DragFrameLog[] = [];

function endHeld(cancel: boolean): void {
  const d = drag;
  if (!d) return;
  // The release point goes to the intent first (`update`), then `release`.
  if (!cancel) aim(performance.now());
  const t = cancel ? null : d.intent.release(d.pointer, d.targets);
  const drop = t ? dropOf(d, t, d.pointer) : null;
  const shownAtRelease = d.shown?.target ?? null;
  if (drop) state = drop.state;
  lastFrames = d.frames;
  drag = null;
  d.item.el.classList.remove("lifted");
  stage.classList.remove("dragging");
  showIndicator(null, d.id);
  relayout();
  const to = layoutNow().rects.get(d.id) ?? null;
  if (to) d.item.m.moveTo(to);
  if (lay().items.get(d.id)?.hidden) d.item.m.show(false);
  lastDrop = { id: d.id, landed: drop?.target ?? null, shownAtRelease, to, changed: state !== d.before, cancelled: cancel };
  say(drop ? `${titleOf(d.id)} → ${placeWords(drop.place, d.id, d.before)}.${notesSay()}` : cancel ? "Cancelled: back where it was." : "No target: it glided home.");
}

// --- keyboard moves ------------------------------------------------------------------------------------------------

interface KeyMove {
  readonly id: string;
  readonly stops: readonly PanelStop[];
  i: number;
}
let keys: KeyMove | null = null;

function beginKeys(id: string): void {
  const input: PanelTargetInput = { defs: DEFS, state, id, stage: stageSize(), options: opts() };
  const home = homePlace(state, id);
  if (!home) return;
  const l = lay();
  const at = { x: l.pages.x + l.pages.width / 2 - 100, y: 80 };
  const stops = keyboardStops(panelTargets(input), { home: { place: home, state }, floats: { at, grab: { x: 0, y: 0 } } });
  keys = { id, stops, i: stops.findIndex((s) => s.home) };
  items.get(id)!.el.classList.add("lifted");
  showStop();
}
function showStop(): void {
  const k = keys;
  if (!k) return;
  const s = k.stops[k.i]!;
  if (s.home) {
    showIndicator(null, k.id);
    say(`${titleOf(k.id)}: its own place (${k.i + 1} of ${k.stops.length}). Arrows move, Enter drops, Escape cancels.`);
    return;
  }
  const l = lay(s.state);
  const p = l.items.get(k.id)!;
  showIndicator({ slot: p.rect, free: s.place.kind === "float", hidden: p.hidden, place: s.place, layout: l }, k.id);
  say(`${titleOf(k.id)} → ${placeWords(s.place, k.id)} (${k.i + 1} of ${k.stops.length}).`);
}
function endKeys(commit: boolean): void {
  const k = keys;
  if (!k) return;
  keys = null;
  items.get(k.id)!.el.classList.remove("lifted");
  showIndicator(null, k.id);
  const s = k.stops[k.i]!;
  if (commit && !s.home) {
    state = s.state;
    say(`${titleOf(k.id)} → ${placeWords(s.place, k.id)}.${notesSay()}`);
  } else say(commit ? "Its own place: nothing moved." : "Cancelled.");
  relayout();
}

// --- resizing ------------------------------------------------------------------------------------------------------

let resizing: { kind: "column" | "float"; key: string } | null = null;

function resizeColumnBy(side: Side, index: number, startW: number, dx: number): void {
  const c = lay().columns.find((x) => x.side === side && x.index === index);
  if (!c) return;
  const want = side === "left" ? startW + dx : startW - dx;
  state = resizeColumn(state, side, index, Math.min(Math.max(want, c.min), c.max));
  relayout(true);
}

function resizeFloatBy(id: string, start: Rect, dx: number, dy: number): void {
  const def = defOf(DEFS, id)!;
  const min = def.float!.min;
  const f = state.floats.find((x) => x.id === id);
  if (!f) return;
  state = resizeFloat(state, id, { ...f.rect, width: Math.max(min.width, start.width + dx), height: Math.max(min.height, start.height + dy) });
  relayout(true);
}

// --- input ---------------------------------------------------------------------------------------------------------

const stagePoint = (e: { clientX: number; clientY: number }): Point => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left - stage.clientLeft, y: e.clientY - r.top - stage.clientTop };
};
const busy = (): boolean => !!drag || !!keys || !!resizing;

/** Track a press: below the lift distance it is a tap; past it, `lift` and then `move`; `up` at the end. */
function track(e: PointerEvent, h: { lift: (start: Point, p: Point) => void; move: (p: Point) => void; up: (tap: boolean, cancel: boolean, p: Point) => void }): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const start = stagePoint(e);
  let lifted = false;
  const move = (ev: PointerEvent): void => {
    const p = stagePoint(ev);
    if (!lifted) {
      if (Math.hypot(p.x - start.x, p.y - start.y) < DRAG_DEFAULTS.lift) return;
      lifted = true;
      h.lift(start, p);
    }
    h.move(p);
  };
  const up = (ev: PointerEvent): void => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    h.up(!lifted, ev.type === "pointercancel", stagePoint(ev));
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

function pressPanel(e: PointerEvent, it: Item, fromRail: boolean): void {
  track(e, {
    lift: (start, p) => {
      const d = it.m.drawn;
      const grab = fromRail ? { x: Math.min(40, d.width / 2), y: 12 } : { x: start.x - d.x, y: start.y - d.y };
      beginHeld(it, p, grab, fromRail);
    },
    move: (p) => {
      if (!drag) return;
      drag.pointer = p;
      drag.held.move(p);
    },
    up: (tap, cancel, p) => {
      if (tap) {
        if (!cancel) tapPanel(it.key, fromRail);
        return;
      }
      if (drag) {
        drag.pointer = p;
        drag.held.move(p);
      }
      endHeld(cancel);
    },
  });
}

/** A tap on a title or a rail segment is a use; on a segment folded by hand it unfolds the panel. */
function tapPanel(id: string, fromRail: boolean): void {
  const p = lay().items.get(id);
  state = fromRail && p?.folded === "hand" ? toggleFold(state, id) : focus(state, id);
  relayout();
  say(`${titleOf(id)} used: it is the newest now.${notesSay()}`);
}

stage.addEventListener("pointerdown", (e) => {
  if (busy()) return;
  const t = e.target as HTMLElement;
  if (t.closest(".pn-btn")) return;
  const edge = t.closest<HTMLElement>(".pn-edge");
  if (edge) {
    const side = edge.dataset.side as Side;
    const index = Number(edge.dataset.index);
    const c = lay().columns.find((x) => x.side === side && x.index === index)!;
    const startW = c.rect.width;
    resizing = { kind: "column", key: `${side}:${index}` };
    edge.classList.add("on");
    let from: Point | null = null;
    track(e, {
      lift: (s) => (from = s),
      move: (p) => resizeColumnBy(side, index, startW, p.x - from!.x),
      up: () => {
        resizing = null;
        edge.classList.remove("on");
        say(`${c.panels.map(titleOf).join(" + ")} is ${Math.round(lay().columns.find((x) => x.side === side && x.index === index)?.rect.width ?? 0)} px wide (${c.min}–${c.max}).`);
      },
    });
    return;
  }
  const corner = t.closest<HTMLElement>(".pn-corner");
  if (corner) {
    const id = corner.closest<HTMLElement>(".pn-panel")!.dataset.id!;
    const f = state.floats.find((x) => x.id === id);
    if (!f) return;
    const start = { ...f.rect };
    resizing = { kind: "float", key: id };
    let from: Point | null = null;
    track(e, {
      lift: (s) => (from = s),
      move: (p) => resizeFloatBy(id, start, p.x - from!.x, p.y - from!.y),
      up: () => {
        resizing = null;
      },
    });
    return;
  }
  const head = t.closest<HTMLElement>(".pn-head");
  if (head) return pressPanel(e, items.get(head.closest<HTMLElement>(".pn-panel")!.dataset.id!)!, false);
  const seg = t.closest<HTMLElement>(".pn-seg");
  if (seg) return pressPanel(e, items.get(seg.dataset.id!)!, true);
});

stage.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(".pn-btn");
  if (!b || busy()) return;
  const id = b.closest<HTMLElement>(".pn-panel")!.dataset.id!;
  if (b.classList.contains("pn-fold")) {
    state = toggleFold(state, id);
    say(`${titleOf(id)} ${state.folded.includes(id) ? "folded by hand" : "unfolded"}.${notesSay()}`);
  } else if (b.classList.contains("pn-keep")) {
    const on = !state.kept.includes(id);
    state = keep(state, id, on);
    say(on ? `${titleOf(id)} is kept open: its column gives way last.${notesSay()}` : `${titleOf(id)} is no longer kept open.${notesSay()}`);
  } else if (b.classList.contains("pn-pin")) {
    const f = state.floats.find((x) => x.id === id);
    // Where it shows (the clamp may have moved it), so it doesn't jump.
    state = pin(state, id, !f?.pinned, view, lay().items.get(id)?.rect);
    say(`${titleOf(id)} ${f?.pinned ? "moves with the page" : "is pinned to the view"}.`);
  }
  relayout();
});

stage.addEventListener("keydown", (e) => {
  if (keys) {
    e.preventDefault();
    if (e.key === "ArrowRight" || e.key === "ArrowDown") keys.i = Math.min(keys.stops.length - 1, keys.i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") keys.i = Math.max(0, keys.i - 1);
    else if (e.key === "Enter" || e.key === " ") return endKeys(true);
    else if (e.key === "Escape") return endKeys(false);
    showStop();
    return;
  }
  if ((e.target as HTMLElement).closest(".pn-btn")) return;
  const head = (e.target as HTMLElement).closest<HTMLElement>(".pn-head");
  if (!head || busy() || (e.key !== " " && e.key !== "Enter")) return;
  e.preventDefault();
  beginKeys(head.closest<HTMLElement>(".pn-panel")!.dataset.id!);
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drag) endHeld(true);
});
window.addEventListener("blur", () => {
  if (drag) endHeld(true);
});

// --- controls ------------------------------------------------------------------------------------------------------

function say(text: string): void {
  status.textContent = text;
}
function notesSay(): string {
  const n = lay().notes;
  return n.length ? ` Now: ${n.map(noteWords).join("; ")}.` : "";
}

const widthIn = document.getElementById("pn-width") as HTMLInputElement;
const widthOut = document.getElementById("pn-width-out") as HTMLOutputElement;
const panIn = document.getElementById("pn-pan") as HTMLInputElement;
const panOut = document.getElementById("pn-pan-out") as HTMLOutputElement;

export function setWidth(px: number, instant = false): void {
  W = Math.round(px);
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  widthIn.value = String(W);
  widthOut.textContent = `${W} px`;
  relayout(instant);
}
widthIn.addEventListener("input", () => {
  setWidth(Number(widthIn.value));
  say(`Stage ${W} px.${notesSay()}`);
});

export function setPan(y: number, instant = false): void {
  view = { ...view, y };
  panIn.value = String(y);
  panOut.textContent = `${y} px`;
  relayout(instant);
}
panIn.addEventListener("input", () => setPan(Number(panIn.value)));

const radios = (name: string): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>(`input[name=${name}]`)];
export function setOptions(o: { order?: GiveWay["order"]; by?: GiveWay["by"]; floats?: PanelsOptions["floats"] }): void {
  giveWay = { order: o.order ?? giveWay.order, by: o.by ?? giveWay.by };
  floats = o.floats ?? floats;
  for (const r of radios("pn-order")) r.checked = r.value === giveWay.order;
  for (const r of radios("pn-by")) r.checked = r.value === giveWay.by;
  for (const r of radios("pn-floats")) r.checked = r.value === floats;
  relayout();
}
for (const name of ["pn-order", "pn-by", "pn-floats"]) {
  for (const r of radios(name)) {
    r.addEventListener("change", () => {
      if (!r.checked) return;
      setOptions(name === "pn-order" ? { order: r.value as GiveWay["order"] } : name === "pn-by" ? { by: r.value as GiveWay["by"] } : { floats: r.value as PanelsOptions["floats"] });
      say(`Give-way ${giveWay.order} first by ${giveWay.by === "used" ? "use" : "opening"}; floats ${floats}.${notesSay()}`);
    });
  }
}

/** Set the logical clock (the scenarios' known ages). */
export function setClock(clock: Record<string, Clock>): void {
  state = { ...state, clock: { ...state.clock, ...clock } };
  relayout();
}
/** Replace the state (a scenario's start). */
export function setState(s: PanelsState, instant = false): void {
  state = s;
  relayout(instant);
}

// --- the stored form -----------------------------------------------------------------------------------------------

const json = document.getElementById("pn-json") as HTMLTextAreaElement;
const storeOut = document.getElementById("pn-store-out") as HTMLElement;
export function storeNow(): string {
  json.value = JSON.stringify(storePanels(state));
  storeOut.textContent = `Stored ${json.value.length} characters.`;
  return json.value;
}
/** Read the text box back; never throws. Returns what happened, in the page's words. */
export function readNow(): { ok: boolean; dropped: readonly string[]; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(json.value);
  } catch {
    storeOut.textContent = "Not JSON: nothing read.";
    return { ok: false, dropped: [], error: "not JSON" };
  }
  const r = readPanels(data, DEFS);
  if (!r.ok) {
    storeOut.textContent = `Not read: ${r.error}.`;
    return { ok: false, dropped: [], error: r.error };
  }
  state = r.state;
  relayout();
  storeOut.textContent = r.dropped.length ? `Read; dropped ${r.dropped.join(", ")}.` : "Read back.";
  return { ok: true, dropped: r.dropped };
}
export const BAD_DATA = JSON.stringify({
  v: 1,
  sides: { left: [{ panels: ["files", "ghost"], width: 9999 }, { panels: [42] }], right: [{ panels: ["inspector"], width: "wide" }, "x"] },
  floats: [{ id: "comments", rect: { x: 600, y: 80, width: 10, height: 10 } }, { id: "nope", rect: null }],
  folded: ["ghost"],
  kept: ["comments"],
  closed: 7,
  clock: { files: { opened: "?", used: 2 } },
});
document.getElementById("pn-store")!.addEventListener("click", () => void storeNow());
document.getElementById("pn-read")!.addEventListener("click", () => void readNow());
document.getElementById("pn-bad")!.addEventListener("click", () => {
  json.value = BAD_DATA;
  storeOut.textContent = "Bad data in the box: read it back.";
});

/** Everything back to the start (and the defaults). */
export function reset(): void {
  if (drag) endHeld(true);
  if (keys) endKeys(false);
  resizing = null;
  state = startState();
  giveWay = DEFAULT_PANELS_OPTIONS.giveWay;
  floats = DEFAULT_PANELS_OPTIONS.floats;
  view = { x: 0, y: 0, scale: 1 };
  setOptions({});
  setPan(0, true);
  setWidth(DEFAULT_W, true);
  json.value = "";
  storeOut.textContent = "";
  lastDrop = null;
  lastFrames = [];
  say("");
}
document.getElementById("pn-reset")!.addEventListener("click", reset);

stage.style.width = `${W}px`;
stage.style.height = `${H}px`;
makeItems();
relayout(true);

/** What the scenarios read and drive. */
export const page = {
  stage,
  items,
  ind,
  indLabel,
  motion,
  omega: OMEGA,
  defs: DEFS,
  reset,
  setWidth,
  setPan,
  setOptions,
  setClock,
  setState,
  storeNow,
  readNow,
  badData: BAD_DATA,
  json,
  lay: (s?: PanelsState) => lay(s),
  layoutNow,
  where: (id: string) => whereIs(state, id),
  get state() {
    return state;
  },
  get width() {
    return W;
  },
  get view() {
    return view;
  },
  get options() {
    return { giveWay, floats };
  },
  get dragging(): { id: string; snapped: Rect | null } | null {
    return drag ? { id: drag.id, snapped: drag.held.snapped } : null;
  },
  get keys(): { id: string; i: number; stops: readonly PanelStop[] } | null {
    return keys ? { id: keys.id, i: keys.i, stops: keys.stops } : null;
  },
  get lastDrop() {
    return lastDrop;
  },
  get lastFrames() {
    return lastFrames;
  },
  edge: (side: Side, index: number) => edges.get(`${side}:${index}`) ?? null,
};
export type PanelsPage = typeof page;
