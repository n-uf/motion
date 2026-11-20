/**
 * The motion lab: a small tiling stage whose windows move by the window
 * motion rules (settle, hold, reveal). Every frame of every move is sampled
 * and checked with @n-uf/motion/testing. The tiling is @n-uf/placement/tiling;
 * a drag goes through the lab's drag session (shared/session) and a drag
 * intent over the tiling's targets.
 *
 * `window.__motionLab.runAll()` runs the scripted scenarios and returns which
 * rules failed where (the headless try uses it).
 */
import { createFrameLoop, createSettle, popIn, reveal, SETTLE_TEMPO, type FrameInfo, type Rect, type Settle } from "@n-uf/motion";
import { createBrowserClock, drawBox, layOutBox } from "@n-uf/motion/browser";
import { createDragIntent, type DragIntent } from "@n-uf/motion/drag";
import type { HeldSample, ScaleSample, TargetSample } from "@n-uf/motion/testing";
import type { Point } from "@n-uf/placement";
import {
  columns,
  dropOnPane,
  grid,
  layoutSplit,
  masterStack,
  orderTargets,
  paneRegion,
  paneTargets,
  panesOf,
  removePane,
  splitFromOrder,
  splitPane,
  swapPanes,
  type OrderLayout,
  type OrderTarget,
  type PaneRegion,
  type PaneTarget,
  type Split,
} from "@n-uf/placement/tiling";
import { motionRows, renderChecks, renderTrace, type Row, type Segment } from "./shared/checks";
import { measureFrame, onTopAt as onTopIn } from "./shared/frame";
import { inside, nextFrame, overlap, same, wait } from "./shared/geometry";
import { passes, type ScenarioFilter } from "./shared/hooks";
import { createDragSession } from "./shared/session";

type Tree = Split<number>;
/** A drop target from @n-uf/placement/tiling: a pane of the split tree, or an index of an order layout. */
type TileTarget = PaneTarget<number> | OrderTarget<number>;
const isPane = (t: TileTarget): t is PaneTarget<number> => "pane" in t;

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
  readonly layout: ReadonlyMap<number, Rect>;
  /** In dwindle: the pane it drops on, and the drop region of that pane. */
  readonly pane?: number;
  readonly region?: PaneRegion;
  commit(): void;
}
/** The drag intent of the drag in progress (@n-uf/motion/drag): what the indicator shows and what a release lands on. */
let intent: DragIntent<TileTarget> | null = null;
/** Unscaled ms for the intent (slow motion slows the windows, not the pointer). */
let aimTime = 0;
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
/** Indicator mode only, opt-in: the others make room at the slot the indicator marks, once the intent says so. */
let indicatorMakesRoom = false;
/** Indicator mode: the drop the others make room for now (its key), or null. */
let roomFor: string | null = null;

/** Where the lifted window is previewed in the layout (the others make room there), or null. */
function roomAt(): Drop | null {
  if (!lifted) return null;
  if (dropMode === "snap") return snapped;
  return roomFor !== null && drop?.key === roomFor ? drop : null;
}
/** In snap mode: the drop the window is snapped into, or null while it follows the pointer. */
let snapped: Drop | null = null;
/** The focused window: a new window splits it (dwindle). Set by a click, an open or a drop. */
let focusId: number | null = null;
/** The layout before the lift: a release with no target, or Escape, puts it back. */
let home: { tree: Tree | null; order: number[]; maxId: number | null; layout: LayoutKind } | null = null;
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

/** The order layout of the current kind (master, columns, grid), from @n-uf/placement/tiling. */
const arrange = (): OrderLayout => (layoutKind === "columns" ? columns : layoutKind === "grid" ? grid : masterStack);

/** The order layouts: a list of ids in, a rect per id out. */
function layout(ids: readonly number[]): Map<number, Rect> {
  return arrange()(ids, FULL_AREA(), { gap: GAP });
}

/** Dwindle's split tree (@n-uf/placement/tiling); a drop splits the window under the pointer on a side, or swaps. */
let tree: Tree | null = null;

const layoutTree = (node: Tree | null): Map<number, Rect> => layoutSplit(node, FULL_AREA(), { gap: GAP });

/** The whole layout now: the tree in dwindle, the order elsewhere. */
function baseLayout(): Map<number, Rect> {
  return layoutKind === "dwindle" ? layoutTree(tree) : layout(order);
}

/** The drop targets for the lifted window `id` (the tree or the order without it): a pane each, or an index each. */
function targetsFor(id: number): TileTarget[] {
  if (layoutKind === "dwindle") return paneTargets(layoutTree(tree));
  return orderTargets(arrange(), order, id, FULL_AREA(), { gap: GAP });
}

/** The place the drag intent last gave each target, by id: the region shown is the region a release lands in. */
const places = new Map<string, string>();

/**
 * A target's place for the drag intent: an index's id, or the pane and the drop region under the pointer (held past
 * its boundary). Kept in `places`, so the drop reads the region the intent used.
 */
function placeOf(t: TileTarget, p: Point, previous: string | null): string {
  const place = isPane(t) ? `${t.id}:${paneRegion(t.hit, p, (previous?.split(":")[2] as PaneRegion | undefined) ?? null)}` : t.id;
  places.set(t.id, place);
  return place;
}

/** What a release on `t` makes: an insertion at its index, or in dwindle a drop on the region the intent gave it. */
function dropOf(t: TileTarget, id: number): Drop {
  if (!isPane(t)) return { key: t.id, slot: t.slot!, layout: t.layout, commit: () => order.splice(t.index, 0, id) };
  const region = (places.get(t.id)?.split(":")[2] as PaneRegion | undefined) ?? "center";
  const next = dropOnPane(tree, id, t.pane, region);
  const map = layoutTree(next);
  return { key: `${t.id}:${region}`, slot: map.get(id)!, layout: map, pane: t.pane, region, commit: () => setTree(next) };
}

/** No target (an empty tree, or a layout switched mid-drag): the window joins the end. */
function dropAtEnd(id: number): Drop {
  if (layoutKind !== "dwindle") return { key: "end", slot: FULL_AREA(), layout: new Map(), commit: () => order.push(id) };
  const next = splitPane(tree, panesOf(tree).at(-1) ?? null, id);
  return { key: "end", slot: FULL_AREA(), layout: new Map(), commit: () => setTree(next) };
}

function setTree(t: Tree | null): void {
  tree = t;
  order = panesOf(t);
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
  // A reset mid-drag ends the drag: no session mark, no press listeners, no intent.
  if (lifted) session.ended();
  lifted = null;
  intent = null;
  raised = null;
  snapped = null;
  roomFor = null;
  drop = null;
  hint.hidden = true;
  for (let i = 0; i < count; i++) {
    const w = makeWin(FULL);
    order.push(w.id);
  }
  tree = splitFromOrder(order);
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
  const nextTree = layoutKind === "dwindle" ? splitPane(tree, target, id) : null;
  const at = (nextTree ? layoutTree(nextTree) : layout([...order, id])).get(id)!;
  const w = makeWin(at);
  w.pop.jumpTo(0);
  ensureLoop();
  newRun(w);
  w.pop.setTarget(1);
  if (nextTree) setTree(nextTree);
  else {
    order.push(w.id);
    tree = splitFromOrder(order);
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
  if (layoutKind === "dwindle") setTree(removePane(tree, id));
  else {
    order = order.filter((x) => x !== id);
    tree = splitFromOrder(order);
  }
  if (maxId === id) maxId = null;
  focus(order.at(-1) ?? null);
  relayout();
}

function doSwap(): void {
  if (lifted || order.length < 2) return;
  const [x, y] = [order[0]!, order[1]!];
  if (layoutKind === "dwindle") setTree(swapPanes(tree, x, y));
  else {
    [order[0], order[1]] = [y, x];
    tree = splitFromOrder(order);
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

function stagePoint(e: { clientX: number; clientY: number }): Point {
  const r = stage.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * STAGE_W) / r.width, y: ((e.clientY - r.top) * STAGE_H) / r.height };
}

/**
 * The lab's one drag session (shared/session): a title's press lifts past the lift distance, the stage carries
 * `data-drag-session` while a window is dragged, Escape cancels, the click after the drop is the drag's. Frames are this
 * page's own loop (`tick`), which feeds the drag intent.
 */
const session = createDragSession({ root: stage, point: stagePoint, frame: () => {} });

function beginDrag(w: Win, px: number, py: number): void {
  if (w.closing || lifted) return;
  ensureLoop();
  const d = w.rect.value;
  grab = { x: px - d.x, y: py - d.y };
  liftSize = { width: d.width, height: d.height };
  snapped = null;
  roomFor = null;
  lifted = w;
  raised = w;
  w.el.style.zIndex = Z_RAISED;
  w.el.classList.add("lifted");
  // Home: the layout as it was, to put back on Escape or on a release with no target (over its own place, say).
  home = { tree, order: [...order], maxId, layout: layoutKind };
  places.clear();
  intent = createDragIntent<TileTarget>({ home: { ...d }, lift: { x: px, y: py }, placeOf });
  session.started("window", performance.now());
  if (maxId === w.id) maxId = null;
  // Lifted out of the layout (out of the tree and the order both): the others close the gap.
  if (layoutKind === "dwindle") setTree(removePane(tree, w.id));
  else {
    order = order.filter((x) => x !== w.id);
    tree = splitFromOrder(order);
  }
  drop = null;
  w.segment = null;
  newRun(w);
  relayout();
  moveDrag(px, py);
}

/** The pointer moved during the drag: the held window follows it at once; the intent reads it on the next frame. */
function moveDrag(px: number, py: number): void {
  if (!lifted) return;
  pointer = { x: px, y: py };
  expected = { x: px - grab.x, y: py - grab.y, width: liftSize.width, height: liftSize.height };
  if (dropMode === "indicator") lifted.rect.jumpTo(expected);
}

/**
 * One frame of the drag: the drag intent (@n-uf/motion/drag) over the tiling targets says which target the indicator
 * shows and when the others make room; a frame also counts when the pointer rests (a dwell).
 */
function aim(): void {
  if (!lifted || !intent || !expected) return;
  const { x: px, y: py } = pointer;
  const f = intent.update(pointer, aimTime, targetsFor(lifted.id));
  drop = f.shown ? dropOf(f.shown, lifted.id) : null;

  if (dropMode === "snap") {
    // Snap in once the pointer is well inside the shown slot; stay until it leaves that slot.
    const was = snapped?.key;
    if (snapped !== null && !inside(snapped.slot, px, py)) snapped = null;
    const slot = drop?.slot;
    if (snapped === null && drop && slot && inside(slot, px, py, Math.min(SNAP_IN, Math.min(slot.width, slot.height) / 4))) snapped = drop;
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

  // Opt-in live reorder: the others make room at the shown slot once the intent says the aim has held.
  const room = indicatorMakesRoom && f.room && drop ? drop.key : null;
  if (room !== roomFor) {
    roomFor = room;
    relayout();
  }
  hint.hidden = drop === null;
  if (drop) Object.assign(hint.style, { left: `${drop.slot.x}px`, top: `${drop.slot.y}px`, width: `${drop.slot.width}px`, height: `${drop.slot.height}px` });
}

/**
 * Drop the lifted window where the drag intent says a release lands (in snap mode, the slot it is snapped into).
 * `cancel` (Escape), or a release with no target (over the window's own place), puts the whole layout back as it was
 * before the lift.
 */
function endDrag(cancel = false): void {
  const w = lifted;
  if (!w) return;
  // The release point is fed to the intent first, so a last jump of the pointer counts (and its places are current).
  const targets = targetsFor(w.id);
  if (!cancel && intent) intent.update(pointer, aimTime, targets);
  const target = !cancel && intent ? intent.release(pointer, targets) : null;
  const landing = cancel ? null : dropMode === "snap" && snapped ? snapped : target ? dropOf(target, w.id) : null;
  const backHome = home && landing === null ? home : null;
  intent = null;
  session.ended();
  lifted = null;
  expected = null;
  snapped = null;
  roomFor = null;
  hint.hidden = true;
  w.el.classList.remove("lifted");
  // A cancel goes home whatever happened meanwhile, the layout kind included; a release with no target goes back
  // only if the layout kind is still the one it was lifted in.
  if (backHome && cancel && layoutKind !== backHome.layout) {
    layoutKind = backHome.layout;
    (document.querySelector(`input[name=layout][value=${layoutKind}]`) as HTMLInputElement).checked = true;
  }
  if (backHome && layoutKind === backHome.layout) {
    tree = backHome.tree;
    order = [...backHome.order];
    maxId = backHome.maxId;
  } else {
    // Land where it was going (no target in a switched layout: the end, or the root of an empty tree).
    (landing ?? dropAtEnd(w.id)).commit();
  }
  drop = null;
  home = null;
  // Keep the two in step whichever the drop committed to.
  if (layoutKind === "dwindle") order = panesOf(tree);
  else tree = splitFromOrder(order);
  focus(w.id);
  newRun(w);
  // It stays raised (above every other window) until its drop settle ends.
  relayout();
}

/**
 * A press on a title bar, through the drag session: a click until it passes the lift distance, then a drag of `w`.
 * Escape cancels it: everything goes back to where it was before the window was lifted.
 */
function onPointerDown(w: Win, e: PointerEvent): void {
  if (e.button !== 0 || w.closing) return;
  session.press(e, `window:${w.id}`, {
    lift: (start, p) => {
      beginDrag(w, start.x, start.y);
      moveDrag(p.x, p.y);
      return lifted === w;
    },
    move: (p) => moveDrag(p.x, p.y),
    release: (p, _keys, cancel) => {
      moveDrag(p.x, p.y);
      endDrag(cancel);
    },
    escape: () => endDrag(true),
    keys: () => {},
    ended: () => {},
  });
}

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
  aimTime += frame.delta;
  aim();
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
  // Rest there as a person aims: the drag intent shows the slot after a dwell, and in snap mode the window snaps in
  // and the others make room (and settle) before the release.
  await wait(dropMode === "snap" ? 700 : 250);
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

async function runAll(filter?: ScenarioFilter): Promise<Run[]> {
  if (runningAll) return [];
  runningAll = true;
  stopAll = false;
  runAllButton.textContent = "Stop scenarios";
  const out: Run[] = [];
  runsBody.replaceChildren();
  try {
    for (const name of Object.keys(SCENARIOS)) {
      if (stopAll) break;
      if (!passes(name, filter)) continue;
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
  if (k === "dwindle" && panesOf(tree).join() !== order.join()) tree = splitFromOrder(order);
  if (lifted) {
    drop = null;
    snapped = null;
    roomFor = null;
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
