/**
 * The motion lab: a small tiling stage whose windows move by the window
 * motion rules (settle, hold, reveal). Every frame of every move is sampled
 * and checked with @n-uf/motion/testing.
 *
 * `window.__motionLab.runAll()` runs the scripted scenarios and returns which
 * rules failed where (the headless try uses it).
 */
import { createFrameLoop, createSettle, popIn, reveal, SETTLE_TEMPO, type FrameInfo, type Rect, type Settle } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import { drawBox, layOutBox } from "@n-uf/motion/layout";
import type { HeldSample, ScaleSample, TargetSample } from "@n-uf/motion/testing";
import { motionRows, renderChecks, renderTrace, type Row, type Segment } from "./shared/checks";
import { measureFrame, onTopAt as onTopIn } from "./shared/frame";
import { inside, nextFrame, overlap, same, wait } from "./shared/geometry";
import "./shared/hooks";
import { cancelPress, trackPress } from "./shared/press";
import {
  columns,
  grid,
  layoutTree as layoutTreeIn,
  leafIds,
  masterStack,
  removeLeaf,
  splitLeaf,
  swapLeaves,
  treeFromOrder,
  type Tree,
} from "./shared/tiling";

type Tempo = keyof typeof SETTLE_TEMPO;

const STAGE_W = 720;
const STAGE_H = 420;
const GAP = 10;

const stage = document.getElementById("stage") as HTMLDivElement;
const hint = document.getElementById("hint") as HTMLDivElement;
const checksBody = document.querySelector("#checks tbody") as HTMLTableSectionElement;
const checksTitle = document.getElementById("checks-title") as HTMLHeadingElement;
const runsBody = document.querySelector("#runs tbody") as HTMLTableSectionElement;
const trace = document.getElementById("trace") as HTMLCanvasElement;

interface Win {
  readonly id: number;
  readonly el: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly content: HTMLDivElement;
  rect: Settle<Rect>;
  /** Where the element is laid out (its content's size); the drawn rect glides toward it. */
  target: Rect;
  pop: Settle<number>;
  closing: boolean;
  segment: Segment | null;
  /** Unheld frames, one run per stretch between lifts and drops. */
  runs: TargetSample[][];
}

let tempo: Tempo = "default";
let speed = 1;
let nextId = 1;
let wins: Win[] = [];
let order: number[] = [];
let maxId: number | null = null;

// The drag: the lifted window, its grab offset, the pointer's place for it, and where it would land.
let lifted: Win | null = null;
let grab = { x: 0, y: 0 };
let expected: Rect | null = null;
/**
 * A place the lifted window could land: its slot, the whole layout with it there (so the others can make
 * room), and how to commit it. `key` names it across pointer moves.
 */
interface Drop {
  readonly key: string;
  readonly slot: Rect;
  readonly layout: Map<number, Rect>;
  commit(): void;
}
/** Where the lifted window would land now. */
let drop: Drop | null = null;
/** Where the pointer is, in stage units, while dragging. */
let pointer = { x: 0, y: 0 };
/** The lifted window's size when it was picked up: it keeps it while it follows the pointer. */
let liftSize = { width: 0, height: 0 };
/**
 * The drop preview while dragging: "indicator" (the window stays under the
 * pointer, a dashed outline marks the slot it would land in) or "snap" (the
 * window itself glides into the slot under the pointer, and back out to the
 * pointer when the pointer leaves the slot).
 */
type DropMode = "indicator" | "snap";
let dropMode: DropMode = "indicator";
/** Indicator mode only, opt-in: the others make room at the slot the indicator marks (live reorder). */
let indicatorMakesRoom = false;
/** This drag has laid the others out around the marked slot at least once. */
let roomShown = false;

/** Where the lifted window is previewed in the layout (the others make room there), or null. */
function roomAt(): Drop | null {
  if (!lifted) return null;
  if (dropMode === "snap") return snapped;
  return indicatorMakesRoom ? drop : null;
}
/** In snap mode: the drop the window is snapped into, or null while it follows the pointer. */
let snapped: Drop | null = null;
/** The focused window: a new window splits it (dwindle). Set by a click, an open or a drop. */
let focusId: number | null = null;
/** The layout before the lift, and whether the pointer has left the lifted window's place since. */
let home: { tree: Tree | null; order: number[]; maxId: number | null; rect: Rect; layout: LayoutKind } | null = null;
let leftHome = false;
/** How far inside a slot the pointer must be to snap into it (it stays snapped until the pointer leaves the slot). */
const SNAP_IN = 24;
/** The window kept above all others: the one being dragged, and after the drop until it has settled. */
let raised: Win | null = null;
const Z_RAISED = "10";

// The current move ("episode"): from the first change while idle until everything rests.
let time = 0;
let episode: {
  t0: number;
  segments: Segment[];
  runs: TargetSample[][];
  scale: ScaleSample[];
  held: HeldSample[];
  /** Per frame of the raised window: null when nothing covered it, else what did. */
  onTop: (string | null)[];
  /** Snap mode, per frame while snapped: null when no settled window overlaps the slot, else which does. */
  room: (string | null)[];
  /** The drop preview this move ran with. */
  drop: DropMode;
} | null = null;
let idleWaiters: Array<() => void> = [];

const loop = createFrameLoop({ clock: createBrowserClock() });
let running = false;

const omega = (): number => SETTLE_TEMPO[tempo];

/** The tiling layouts: Hyprland's master and dwindle, plus equal columns and a grid. */
type LayoutKind = "master" | "dwindle" | "columns" | "grid";
let layoutKind: LayoutKind = "master";

/** The order layouts (master, columns, grid): a list of ids in, a rect per id out. */
function layout(ids: readonly number[]): Map<number, Rect> {
  if (layoutKind === "columns") return columns(ids, FULL_AREA(), GAP);
  if (layoutKind === "grid") return grid(ids, FULL_AREA(), GAP);
  return masterStack(ids, FULL_AREA(), GAP);
}

/** Dwindle's split tree (see shared/tiling); a drop splits the window under the pointer, on the pointer's side. */
let tree: Tree | null = null;

const layoutTree = (node: Tree | null): Map<number, Rect> => layoutTreeIn(node, FULL_AREA(), GAP);

/** The whole layout now: the tree in dwindle, the order elsewhere. */
function baseLayout(): Map<number, Rect> {
  return layoutKind === "dwindle" ? layoutTree(tree) : layout(order);
}

/** Every place the lifted window `id` could land (the tree or order without it). */
function drops(id: number): Drop[] {
  if (layoutKind === "dwindle") {
    if (!tree) {
      const t: Tree = { leaf: id };
      return [{ key: "root", slot: FULL_AREA(), layout: layoutTree(t), commit: () => setTree(t) }];
    }
    return leafIds(tree).flatMap((target) =>
      [true, false].map((first) => {
        const t = splitLeaf(tree, target, id, first);
        const map = layoutTree(t);
        return { key: `${target}:${first ? "a" : "b"}`, slot: map.get(id)!, layout: map, commit: () => setTree(t) };
      }),
    );
  }
  return Array.from({ length: order.length + 1 }, (_, i) => {
    const ids = [...order.slice(0, i), id, ...order.slice(i)];
    const map = layout(ids);
    return { key: String(i), slot: map.get(id)!, layout: map, commit: () => order.splice(i, 0, id) };
  });
}

function setTree(t: Tree | null): void {
  tree = t;
  order = leafIds(t);
}

function FULL_AREA(): Rect {
  return { x: GAP, y: GAP, width: STAGE_W - 2 * GAP, height: STAGE_H - 2 * GAP };
}

const FULL: Rect = { x: GAP, y: GAP, width: STAGE_W - 2 * GAP, height: STAGE_H - 2 * GAP };

function startEpisode(): void {
  if (episode) return;
  episode = { t0: time, segments: [], runs: [], scale: [], held: [], onTop: [], room: [], drop: dropMode };
  for (const w of wins) {
    w.runs = [[]];
    episode.runs.push(...w.runs);
  }
}

function newRun(w: Win): void {
  const run: TargetSample[] = [];
  w.runs.push(run);
  episode?.runs.push(run);
}

function ensureLoop(): void {
  startEpisode();
  if (running) return;
  running = true;
  loop.repeat("update", tick);
}

function setTarget(w: Win, to: Rect): void {
  if (same(w.target, to) && same(w.rect.target, to)) return;
  ensureLoop();
  const drawn = w.rect.value;
  w.target = { ...to };
  layOutBox(w.el, to);
  // The segment starts with the frame the move began on, so tempo counts from here.
  w.segment = { id: w.id, t0: time, from: { ...drawn }, to: { ...to }, samples: [{ t: time, rect: { ...drawn } }] };
  episode?.segments.push(w.segment);
  w.rect.configure({ omega: omega() });
  w.rect.setTarget(to);
}

/**
 * Every window in the order glides to its place. While a window is snapped into a slot (snap mode), the
 * others make room for it: they take their places in the layout with it inserted at that slot.
 */
function relayout(): void {
  const slots = roomAt()?.layout ?? baseLayout();
  for (const id of order) {
    const w = wins.find((x) => x.id === id)!;
    const to = id === maxId ? FULL : slots.get(id)!;
    setTarget(w, to);
    w.el.style.zIndex = w === raised ? Z_RAISED : id === maxId ? "3" : "1";
  }
  for (const w of wins) w.el.classList.toggle("focused", w.id === focusId);
}

function makeWin(at: Rect): Win {
  const id = nextId++;
  const el = document.createElement("div");
  el.className = "win";
  el.dataset.id = String(id);
  const frame = document.createElement("div");
  frame.className = "frame";
  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = `<div class="title">Window ${id}</div><div class="body">Meeting notes ${10 + id} · edited today<br>Page 2 of 5 · the quick brown fox</div>`;
  el.append(frame, content);
  stage.append(el);
  const w: Win = {
    id,
    el,
    frame,
    content,
    rect: createSettle(at, { omega: omega() }),
    target: { ...at },
    pop: createSettle(1, { omega: omega(), restDelta: 0.001 }),
    closing: false,
    segment: null,
    runs: [[]],
  };
  layOutBox(el, at);
  content.querySelector(".title")!.addEventListener("pointerdown", (e) => onPointerDown(w, e as PointerEvent));
  // A press anywhere on a window focuses it (a new window in dwindle splits the focused one).
  el.addEventListener("pointerdown", () => {
    if (!w.closing) focus(w.id);
  });
  wins.push(w);
  draw(w);
  return w;
}

function reset(count = 3): void {
  for (const w of wins) w.el.remove();
  wins = [];
  order = [];
  maxId = null;
  lifted = null;
  raised = null;
  snapped = null;
  hint.hidden = true;
  for (let i = 0; i < count; i++) {
    const w = makeWin(FULL);
    order.push(w.id);
  }
  tree = treeFromOrder(order);
  focusId = order.at(-1) ?? null;
  const slots = baseLayout();
  for (const w of wins) {
    w.el.classList.toggle("focused", w.id === focusId);
    const at = slots.get(w.id)!;
    w.target = { ...at };
    layOutBox(w.el, at);
    w.rect.jumpTo(at);
    draw(w);
  }
  lastRows = [];
}

// --- actions -----------------------------------------------------------------

/** More windows than this make slots too small to see the motion (and dwindle's sizes run out). */
const MAX_WINDOWS = 8;

function focus(id: number | null): void {
  focusId = id;
  for (const w of wins) w.el.classList.toggle("focused", w.id === focusId);
}

/** A new window: in dwindle it splits the focused window (to its right or below); elsewhere it joins the end. */
function doOpen(): void {
  // Layout commands wait for the drag to end (a drop target found before them would be stale).
  if (lifted || order.length >= MAX_WINDOWS) return;
  const id = nextId;
  const target = focusId !== null && order.includes(focusId) ? focusId : (order.at(-1) ?? null);
  const nextTree = layoutKind === "dwindle" ? splitLeaf(tree, target, id, false) : null;
  const at = (nextTree ? layoutTree(nextTree) : layout([...order, id])).get(id)!;
  const w = makeWin(at);
  w.pop.jumpTo(0);
  ensureLoop();
  newRun(w);
  w.pop.setTarget(1);
  if (nextTree) setTree(nextTree);
  else {
    order.push(w.id);
    tree = treeFromOrder(order);
  }
  focus(w.id);
  relayout();
}

/** Close the focused window (else the last); in dwindle its sibling takes its parent's place. */
function doClose(): void {
  if (lifted) return;
  const id = focusId !== null && order.includes(focusId) ? focusId : order.at(-1);
  if (id === undefined) return;
  const w = wins.find((x) => x.id === id)!;
  ensureLoop();
  w.closing = true;
  w.pop.setTarget(0);
  if (layoutKind === "dwindle") setTree(removeLeaf(tree, id));
  else {
    order = order.filter((x) => x !== id);
    tree = treeFromOrder(order);
  }
  if (maxId === id) maxId = null;
  focus(order.at(-1) ?? null);
  relayout();
}

function doSwap(): void {
  if (lifted || order.length < 2) return;
  const [x, y] = [order[0]!, order[1]!];
  if (layoutKind === "dwindle") setTree(swapLeaves(tree, x, y));
  else {
    [order[0], order[1]] = [y, x];
    tree = treeFromOrder(order);
  }
  relayout();
}

function doMaximize(): void {
  const id = order[0];
  if (lifted || id === undefined) return;
  maxId = maxId === id ? null : id;
  relayout();
}

// --- drag --------------------------------------------------------------------

function stagePoint(e: PointerEvent): { x: number; y: number } {
  const r = stage.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * STAGE_W) / r.width, y: ((e.clientY - r.top) * STAGE_H) / r.height };
}

function beginDrag(w: Win, px: number, py: number): void {
  if (w.closing || lifted) return;
  ensureLoop();
  const d = w.rect.value;
  grab = { x: px - d.x, y: py - d.y };
  liftSize = { width: d.width, height: d.height };
  snapped = null;
  roomShown = false;
  lifted = w;
  raised = w;
  w.el.style.zIndex = Z_RAISED;
  w.el.classList.add("lifted");
  // Home: the layout as it was, to put back on Escape or when the pointer never left the window's place.
  home = { tree, order: [...order], maxId, rect: { ...d }, layout: layoutKind };
  leftHome = false;
  if (maxId === w.id) maxId = null;
  // Lifted out of the layout (out of the tree and the order both): the others close the gap.
  if (layoutKind === "dwindle") setTree(removeLeaf(tree, w.id));
  else {
    order = order.filter((x) => x !== w.id);
    tree = treeFromOrder(order);
  }
  drop = null;
  w.segment = null;
  newRun(w);
  relayout();
  moveDrag(px, py);
}

function moveDrag(px: number, py: number): void {
  if (!lifted) return;
  pointer = { x: px, y: py };
  if (home && !inside(home.rect, px, py)) leftHome = true;
  expected = { x: px - grab.x, y: py - grab.y, width: liftSize.width, height: liftSize.height };
  // Where it would land: the slot under the pointer (else the nearest), over every place it could go
  // (a split side of each window in dwindle, an index in the order elsewhere).
  let best: Drop | null = null;
  let bestDist = Infinity;
  for (const d of drops(lifted.id)) {
    const dx = px - (d.slot.x + d.slot.width / 2);
    const dy = py - (d.slot.y + d.slot.height / 2);
    const dist = (inside(d.slot, px, py) ? 0 : 1e6) + dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  if (!best) return;
  const previousDrop = drop?.key;
  drop = best;
  const slot = best.slot;

  if (dropMode === "snap") {
    // Snap in once the pointer is well inside a slot; stay until it leaves that slot.
    const was = snapped?.key;
    if (snapped !== null && !inside(snapped.slot, px, py)) snapped = null;
    if (snapped === null && inside(slot, px, py, Math.min(SNAP_IN, Math.min(slot.width, slot.height) / 4))) snapped = best;
    if (snapped !== null) drop = snapped;
    hint.hidden = true;
    // The others make room in the slot it snaps into, and close the gap again when it leaves.
    if (snapped?.key !== was) relayout();
    // Snapped: glide into the slot. Not snapped: glide back under the pointer (no jump), at the lift size.
    const goal = snapped !== null ? snapped.slot : expected;
    if (!same(lifted.rect.target, goal)) {
      // A new segment for the checks: from where it is drawn to the new goal.
      const drawn = lifted.rect.value;
      lifted.segment = { id: lifted.id, t0: time, from: { ...drawn }, to: { ...goal }, samples: [{ t: time, rect: { ...drawn } }] };
      episode?.segments.push(lifted.segment);
      lifted.rect.setTarget(goal);
    }
    return;
  }

  lifted.rect.hold(expected);
  // Opt-in live reorder: the others make room at the marked slot as it changes.
  if (indicatorMakesRoom && (drop.key !== previousDrop || !roomShown)) {
    roomShown = true;
    relayout();
  }
  hint.hidden = false;
  Object.assign(hint.style, { left: `${slot.x}px`, top: `${slot.y}px`, width: `${slot.width}px`, height: `${slot.height}px` });
}

/**
 * Drop the lifted window. `cancel` (Escape), or a drag whose pointer never left the window's own place,
 * puts the whole layout back as it was before the lift; otherwise it lands where it was going.
 */
function endDrag(cancel = false): void {
  const w = lifted;
  if (!w) return;
  const backHome = home && (cancel || !leftHome) ? home : null;
  lifted = null;
  expected = null;
  snapped = null;
  roomShown = false;
  hint.hidden = true;
  w.el.classList.remove("lifted");
  // A cancel goes home whatever happened meanwhile, the layout kind included; a release that never left
  // home goes back only if the layout kind is still the one it was lifted in.
  if (backHome && cancel && layoutKind !== backHome.layout) {
    layoutKind = backHome.layout;
    (document.querySelector(`input[name=layout][value=${layoutKind}]`) as HTMLInputElement).checked = true;
  }
  if (backHome && layoutKind === backHome.layout) {
    tree = backHome.tree;
    order = [...backHome.order];
    maxId = backHome.maxId;
  } else {
    // Land where it was going (no move at all: back to the end, or the root of an empty tree).
    (drop ?? drops(w.id).at(-1)!).commit();
  }
  drop = null;
  home = null;
  // Keep the two in step whichever the drop committed to.
  if (layoutKind === "dwindle") order = leafIds(tree);
  else tree = treeFromOrder(order);
  focus(w.id);
  newRun(w);
  // It stays raised (above every other window) until its drop settle ends.
  relayout();
}

/** A press on a title bar: a click until it passes the threshold (shared/press), then a drag of `w`. */
function onPointerDown(w: Win, e: PointerEvent): void {
  trackPress(e, {
    point: stagePoint,
    lifted: () => lifted === w,
    begin: (start) => beginDrag(w, start.x, start.y),
    move: (q) => moveDrag(q.x, q.y),
    end: (cancel) => endDrag(cancel),
  });
}

// Escape cancels a drag: everything goes back to where it was before the window was lifted.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && lifted) {
    cancelPress();
    endDrag(true);
  }
});

// --- the frame ---------------------------------------------------------------

/** Drawn by @n-uf/motion/layout's box writer: laid out at its target, moved to the drawn rect, the content clipped. */
function draw(w: Win): void {
  const drawn = w.rect.value;
  drawBox({ node: w.el, frame: w.frame, content: w.content }, { drawn, box: w.target, reveal: reveal(drawn, w.target), pop: popIn(w.pop.value), shown: w.pop.value, gone: false });
}

/**
 * Whether the topmost element at stage point `want` belongs to `w`: null when it does, a failure message
 * when something else is on top, undefined when no point of it can be hit-tested (outside the stage's
 * visible content box or the browser's viewport). The point is moved into the part of the frame that
 * can be hit.
 */
function onTopAt(w: Win, want: { x: number; y: number }, frame: Rect): string | null | undefined {
  return onTopIn(stage, STAGE_W, { el: w.el, name: `window ${w.id}` }, want, frame, time, (top) => {
    const other = top.closest<HTMLElement>(".win")?.dataset.id;
    return other ? `window ${other}` : null;
  });
}

/** What the page draws, read back from the DOM: the content's scale and the frame's rect in stage units. */
function measure(w: Win): { scale: ScaleSample; frame: Rect } {
  return measureFrame(stage, STAGE_W, w, time);
}

function tick(frame: FrameInfo): boolean {
  const dt = frame.delta * speed;
  time += dt;
  let moving = lifted !== null;
  for (const w of [...wins]) {
    if (w.rect.step(dt)) moving = true;
    if (w.pop.step(dt)) moving = true;
    draw(w);
    if (!episode) continue;
    const seen = measure(w);
    episode.scale.push(seen.scale);
    const drawn = w.rect.value;
    if (w === lifted && dropMode === "indicator") {
      // Held (indicator mode): compare what the page shows with where the pointer puts the window.
      if (expected) episode.held.push({ t: time, rect: seen.frame, expected });
    } else {
      // Everything that glides, including a lifted window snapping into a slot and back to the pointer.
      w.runs.at(-1)!.push({ t: time, rect: drawn, target: w.rect.target });
      w.segment?.samples.push({ t: time, rect: drawn });
    }
    if (w.closing && w.pop.settled) {
      w.el.remove();
      wins = wins.filter((x) => x !== w);
    }
  }
  // On top: while dragged, and after the drop until it has settled, nothing covers it. Checked after
  // every window of this frame is drawn.
  // Room: once the others have settled, none of them overlaps the slot the lifted window is snapped into.
  const room = roomAt();
  if (lifted && room !== null && episode) {
    const slot = room.slot;
    // Only once every other window has settled: before that the frame says nothing either way.
    const others = wins.filter((o) => o !== lifted && !o.closing);
    const blocking = others.every((o) => o.rect.settled) ? others.filter((o) => overlap(o.rect.value, slot) > 1) : null;
    if (blocking) episode.room.push(blocking.length ? `t=${Math.round(time)} window ${blocking.map((o) => o.id).join(", ")} still in the slot kept for window ${lifted.id}` : null);
  }
  const r = raised;
  if (r && episode) {
    const frameRect = measure(r).frame;
    const at = r === lifted && inside(frameRect, pointer.x, pointer.y) ? pointer : { x: frameRect.x + frameRect.width / 2, y: frameRect.y + frameRect.height / 2 };
    const verdict = onTopAt(r, at, frameRect);
    if (verdict !== undefined) episode.onTop.push(verdict);
    if (r !== lifted && r.rect.settled) {
      raised = null;
      r.el.style.zIndex = r.id === maxId ? "3" : "1";
    }
  }
  if (moving) return true;
  running = false;
  endEpisode();
  return false;
}

// --- checks ------------------------------------------------------------------

let lastRows: Row[] = [];

function endEpisode(): void {
  const ep = episode;
  episode = null;
  if (!ep) return;
  const { rows, segments: segs } = motionRows(ep, omega());
  lastRows = rows;
  checksTitle.textContent =
    "Checks of the last move" + (ep.onTop.length > 0 ? ` · drop preview: ${ep.drop === "snap" ? "snap to slot" : "drop indicator"}` : "");
  renderChecks(checksBody, lastRows);
  renderTrace(trace, ep.t0, segs);
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const resolve of waiters) resolve();
}

// --- scenarios ---------------------------------------------------------------

const idle = (): Promise<void> => (running || episode ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());

async function scriptedDrag(): Promise<void> {
  const w = wins.find((x) => x.id === order[0])!;
  const d = w.rect.value;
  const from = { x: d.x + 60, y: d.y + 12 };
  beginDrag(w, from.x, from.y);
  const to = { x: STAGE_W - 120, y: STAGE_H - 60 };
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    await nextFrame();
    const f = i / steps;
    const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
    moveDrag(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
  }
  await nextFrame();
  await nextFrame();
  endDrag();
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  open: async () => doOpen(),
  close: async () => doClose(),
  swap: async () => doSwap(),
  "two changes 40 ms apart": async () => {
    doOpen();
    await wait(40);
    doClose();
  },
  "maximize, restore after 80 ms": async () => {
    doMaximize();
    await wait(80);
    doMaximize();
  },
  "drag to the stack": scriptedDrag,
  "drag, snap to slot": async () => {
    const before = dropMode;
    setDropMode("snap");
    try {
      await scriptedDrag();
    } finally {
      setDropMode(before);
    }
  },
  "switch layout": async () => {
    const before = layoutKind;
    // Switch, and switch back mid-flight: one move with a retarget across layouts.
    setLayout(before === "dwindle" ? "master" : "dwindle");
    await wait(60);
    setLayout(before);
  },
};

interface Run {
  readonly scenario: string;
  /** The layout the scenario ran in. */
  readonly mode: string;
  readonly failed: string[];
  readonly rows: Row[];
}

const runs: Run[] = [];

async function runScenario(name: string): Promise<Run> {
  reset(4);
  await nextFrame();
  const layoutAtStart = layoutKind;
  const play = SCENARIOS[name]!;
  await play();
  await idle();
  const failed = lastRows.filter((r) => r.result && !r.result.ok).map((r) => r.name);
  const run: Run = { scenario: name, mode: layoutAtStart, failed, rows: lastRows };
  runs.push(run);
  const tr = document.createElement("tr");
  tr.innerHTML = "<td></td><td></td><td></td>";
  tr.children[0]!.textContent = name;
  tr.children[1]!.textContent = layoutAtStart;
  tr.children[2]!.textContent = failed.length ? failed.join(", ") : "none";
  (tr.children[2] as HTMLElement).className = failed.length ? "bad" : "ok";
  runsBody.append(tr);
  return run;
}

/** The scenario run in progress (one at a time), and whether Stop was pressed. */
let runningAll = false;
let stopAll = false;
const runAllButton = document.querySelector("button[data-act=runall]") as HTMLButtonElement;

async function runAll(): Promise<Run[]> {
  if (runningAll) return [];
  runningAll = true;
  stopAll = false;
  runAllButton.textContent = "Stop scenarios";
  const out: Run[] = [];
  runsBody.replaceChildren();
  try {
    for (const name of Object.keys(SCENARIOS)) {
      if (stopAll) break;
      out.push(await runScenario(name));
    }
  } finally {
    reset(4);
    runningAll = false;
    stopAll = false;
    runAllButton.textContent = "Run all scenarios";
  }
  return out;
}

// --- wiring ------------------------------------------------------------------

function setDropMode(m: DropMode): void {
  dropMode = m;
  (document.querySelector(`input[name=drop][value=${m}]`) as HTMLInputElement).checked = true;
}

/** A new layout: every window glides to its place in it (mid-drag too: the drop is found again in it). */
function setLayout(k: LayoutKind): void {
  layoutKind = k;
  (document.querySelector(`input[name=layout][value=${k}]`) as HTMLInputElement).checked = true;
  // The lifted window is in neither the order nor the tree, so both describe the others; rebuild the
  // one the new layout reads from the other.
  // (Only when they disagree: a custom split tree survives a round trip through another layout.)
  if (k === "dwindle" && leafIds(tree).join() !== order.join()) tree = treeFromOrder(order);
  if (lifted) {
    drop = null;
    snapped = null;
    relayout();
    moveDrag(pointer.x, pointer.y);
  } else relayout();
}

document.querySelectorAll<HTMLInputElement>("input[name=drop]").forEach((input) =>
  input.addEventListener("change", () => setDropMode(input.value as DropMode)),
);
document.querySelectorAll<HTMLInputElement>("input[name=layout]").forEach((input) =>
  input.addEventListener("change", () => setLayout(input.value as LayoutKind)),
);
(document.getElementById("make-room") as HTMLInputElement).addEventListener("change", (e) => {
  indicatorMakesRoom = (e.target as HTMLInputElement).checked;
});
document.querySelectorAll<HTMLInputElement>("input[name=tempo]").forEach((input) =>
  input.addEventListener("change", () => {
    tempo = input.value as Tempo;
    for (const w of wins) w.rect.configure({ omega: omega() });
  }),
);
const actions: Record<string, () => void> = {
  open: doOpen,
  close: doClose,
  swap: doSwap,
  maximize: doMaximize,
  double: () => void SCENARIOS["two changes 40 ms apart"]!(),
  slow: () => {
    speed = speed === 1 ? 0.2 : 1;
    const b = document.querySelector("button[data-act=slow]")!;
    b.textContent = speed === 1 ? "Slow motion ×5" : "Normal speed";
  },
  // The same button stops a run in progress (after the scenario playing now).
  runall: () => {
    if (runningAll) {
      stopAll = true;
      runAllButton.textContent = "Stopping…";
    } else void runAll();
  },
};
document.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) =>
  b.addEventListener("click", () => actions[b.dataset.act!]?.()),
);

// Start from what the controls show: a reload restores the browser's checked radios and boxes, and the
// page must follow them rather than its own defaults (else the stage says one layout and the radio another).
const checked = (name: string): string | undefined => document.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)?.value;
tempo = (checked("tempo") as Tempo | undefined) ?? tempo;
layoutKind = (checked("layout") as LayoutKind | undefined) ?? layoutKind;
dropMode = (checked("drop") as DropMode | undefined) ?? dropMode;
indicatorMakesRoom = (document.getElementById("make-room") as HTMLInputElement).checked;
reset(4);

window.__motionLab = { runAll, runs, lastRows: () => lastRows };
