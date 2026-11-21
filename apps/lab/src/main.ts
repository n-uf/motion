/**
 * The motion lab: a small tiling stage whose windows move by the window
 * motion rules (settle, hold, reveal). The windows are the items of one
 * `createLayoutMotion` (`item.moveTo`, `item.show`), drawn onto their elements by
 * `domDrawable`; a dragged window is held by `holdItem`, and the drop preview is
 * `previewPlan`'s (Outline, Placeholder, Glide). Every frame of every move is sampled
 * (from the layout motion's `onDraw`) and checked with @n-uf/motion/testing. The
 * tiling is @n-uf/placement/tiling; a drag goes through the lab's drag session
 * (shared/session) and a drag intent over the tiling's targets.
 *
 * `window.__motionLab.runAll()` runs the scripted scenarios and returns which
 * rules failed where (the headless try uses it).
 */
import { createFrameLoop, createLayoutMotion, holdItem, SETTLE_TEMPO, type ClockPort, type DrawEntry, type HeldDrag, type LayoutItem, type Rect } from "@n-uf/motion";
import { createBrowserClock, domDrawable } from "@n-uf/motion/browser";
import { createDragIntent, previewPlan, type DragIntent, type PreviewMode } from "@n-uf/motion/drag";
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
  /** The layout motion's item: where it is drawn (`drawn`), where it heads (`target`) and its appearance. */
  readonly item: LayoutItem;
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

// The drag: the lifted window, the hold the pointer has on it, and where it would land.
let lifted: Win | null = null;
let held: HeldDrag | null = null;
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
/** Where the lifted window would land now. */
let drop: Drop | null = null;
/** Where the pointer is, in stage units, while dragging. */
let pointer = { x: 0, y: 0 };
/**
 * The drop preview while dragging, `previewPlan`'s modes (@n-uf/motion/drag), each one showing the same landing:
 * "outline" (the window stays under the pointer, a dashed outline marks the slot it would land in), "placeholder"
 * (the same, and once the intent makes room the others move aside) and "glide" (once the room is made the window
 * itself glides into the slot, and back to the pointer when the pointer leaves it; no outline).
 */
type DropMode = Extract<PreviewMode, "outline" | "placeholder" | "glide">;
const DROP_MODES: readonly DropMode[] = ["outline", "placeholder", "glide"];
/** The mode as the page says it. */
const DROP_LABEL: Readonly<Record<DropMode, string>> = { outline: "Outline", placeholder: "Placeholder", glide: "Glide" };
let dropMode: DropMode = "outline";
/** The drop the others make room for now (its key), or null. */
let roomFor: string | null = null;

/** Where the lifted window is previewed in the layout (the others make room there), or null. */
function roomAt(): Drop | null {
  return lifted && roomFor !== null && drop?.key === roomFor ? drop : null;
}
/** The focused window: a new window splits it (dwindle). Set by a click, an open or a drop. */
let focusId: number | null = null;
/** The layout before the lift: a release with no target, or Escape, puts it back. */
let home: { tree: Tree | null; order: number[]; maxId: number | null; layout: LayoutKind } | null = null;
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
  /** Per frame while the others make room: null when no settled window overlaps the slot, else which does. */
  room: (string | null)[];
  /** The drop preview this move ran with. */
  drop: DropMode;
} | null = null;

/**
 * The browser's clock, its time scaled by `speed`: slow motion slows the windows (the layout motion steps by the
 * frame's delta) and not the pointer or the drag intent, which read real time.
 */
const baseClock = createBrowserClock();
let scaledNow = baseClock.now();
let realNow = scaledNow;
const clock: ClockPort = {
  ...baseClock,
  now() {
    const real = baseClock.now();
    scaledNow += (real - realNow) * speed;
    realNow = real;
    return scaledNow;
  },
};
const loop = createFrameLoop({ clock });

const omega = (): number => SETTLE_TEMPO[tempo];

/**
 * Every window is an item of this one layout motion: `moveTo` settles it to a place, `show` pops it in or out, and
 * `domDrawable` draws it onto its element (laid out at the target, moved to the drawn rect, the content clipped). The
 * frames come in one batch per step (`onDraw`), which is where the checks sample them.
 */
const motion = createLayoutMotion({
  loop,
  omega: omega(),
  onDraw: sampleFrame,
  onActiveChange: (active) => {
    if (!active) endEpisode();
  },
});

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
  // A frame at least runs, so a change that moves nothing still ends the episode.
  motion.wake();
}

function newRun(w: Win): void {
  const run: TargetSample[] = [];
  w.runs.push(run);
  episode?.runs.push(run);
}

/** The window's move to `to` as the checks read it: from `from` (where it is drawn), sampled until it is retargeted. */
function startSegment(w: Win, to: Rect, from: Rect = w.item.drawn): void {
  // The segment starts with the frame the move began on, so tempo counts from here.
  w.segment = { id: w.id, t0: time, from: { ...from }, to: { ...to }, samples: [{ t: time, rect: { ...from } }] };
  episode?.segments.push(w.segment);
}

function setTarget(w: Win, to: Rect): void {
  if (same(w.item.box, to) && same(w.item.target, to)) return;
  startEpisode();
  startSegment(w, to);
  w.item.moveTo(to);
}

/**
 * Every window in the order glides to its place. While the others make room for the lifted window, they take their
 * places in the layout with it inserted at the previewed slot.
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

function makeWin(at: Rect, shown = true): Win {
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
  const item = motion.add(String(id), domDrawable({ node: el, frame, content }), at, { shown });
  const w: Win = { id, el, frame, content, item, closing: false, segment: null, runs: [[]] };
  content.querySelector(".title")!.addEventListener("pointerdown", (e) => onPointerDown(w, e as PointerEvent));
  // A press anywhere on a window focuses it (a new window in dwindle splits the focused one).
  el.addEventListener("pointerdown", () => {
    if (!w.closing) focus(w.id);
  });
  wins.push(w);
  return w;
}

/** A window is gone: its item leaves the layout motion and its element the stage. */
function dropWin(w: Win): void {
  motion.remove(String(w.id));
  w.el.remove();
  wins = wins.filter((x) => x !== w);
}

function reset(count = 3): void {
  for (const w of [...wins]) dropWin(w);
  order = [];
  maxId = null;
  // A reset mid-drag ends the drag: no session mark, no press listeners, no intent.
  if (lifted) session.ended();
  lifted = null;
  held = null;
  intent = null;
  raised = null;
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
    w.item.jumpTo(slots.get(w.id)!);
  }
  motion.flush();
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
  startEpisode();
  // It is laid out at its place, not shown yet, then pops in.
  const w = makeWin(at, false);
  newRun(w);
  w.item.show(true);
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
  startEpisode();
  w.closing = true;
  w.item.show(false);
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
 * `data-drag-session` while a window is dragged, Escape cancels, the click after the drop is the drag's. The frames of the
 * drag are the layout motion's (`aim`, a task of it), which feeds the drag intent.
 */
const session = createDragSession({ root: stage, point: stagePoint, frame: () => {} });

function beginDrag(w: Win, px: number, py: number): void {
  if (w.closing || lifted) return;
  startEpisode();
  const d = { ...w.item.drawn };
  roomFor = null;
  lifted = w;
  raised = w;
  // The real window follows the pointer 1:1 from where it was grabbed, at the size it has now.
  held = holdItem(w.item, { x: px - d.x, y: py - d.y });
  w.el.style.zIndex = Z_RAISED;
  w.el.classList.add("lifted");
  // Home: the layout as it was, to put back on Escape or on a release with no target (over its own place, say).
  home = { tree, order: [...order], maxId, layout: layoutKind };
  places.clear();
  // The stage is the drawn space: the intent clamps every point onto it.
  intent = createDragIntent<TileTarget>({ home: d, lift: { x: px, y: py }, bounds: { x: 0, y: 0, width: STAGE_W, height: STAGE_H }, placeOf });
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
  if (!lifted || !held) return;
  pointer = { x: px, y: py };
  held.move(pointer);
}

/**
 * One frame of the drag: the drag intent (@n-uf/motion/drag) over the tiling targets says which target shows and
 * when the others make room (a frame also counts when the pointer rests: a dwell), and `previewPlan` turns that into
 * what the mode draws: the outline, the room, the window in its slot.
 */
function aim(): void {
  if (!lifted || !intent || !held) return;
  const f = intent.update(pointer, performance.now(), targetsFor(lifted.id));
  drop = f.shown ? dropOf(f.shown, lifted.id) : null;
  const plan = previewPlan(f, dropMode);
  // The others make room at the shown slot once the plan says so, and close the gap again when it goes.
  const room = plan.makeRoom && drop ? drop.key : null;
  if (room !== roomFor) {
    roomFor = room;
    relayout();
  }
  hint.hidden = !(plan.showIndicator && drop);
  if (drop && !hint.hidden) Object.assign(hint.style, { left: `${drop.slot.x}px`, top: `${drop.slot.y}px`, width: `${drop.slot.width}px`, height: `${drop.slot.height}px` });
  // The held window: under the pointer, or (the plan snaps it) gliding into the slot and back out to the pointer.
  const wasGliding = held.snapped !== null || held.returning;
  const drawn = { ...lifted.item.drawn };
  const change = held.preview(plan, drop?.slot ?? null);
  // A segment for the checks: the glide from where it is drawn into the slot; leaving ends it (the way back chases the pointer).
  if (change === "snapped" && drop) startSegment(lifted, drop.slot, drawn);
  else if (change === "left") lifted.segment = null;
  if (!wasGliding && (held.snapped !== null || held.returning)) newRun(lifted);
}

/**
 * Drop the lifted window where the drag intent says a release lands. `cancel` (Escape), or a release with no target
 * (over the window's own place), puts the whole layout back as it was before the lift.
 */
function endDrag(cancel = false): void {
  const w = lifted;
  const hold = held;
  if (!w || !hold) return;
  // The intent takes the release point as one more sample, so a last jump of the pointer counts (and its places are current).
  const target = !cancel && intent ? intent.release(pointer, performance.now(), targetsFor(w.id)) : null;
  const landing = cancel ? null : target ? dropOf(target, w.id) : null;
  const backHome = home && landing === null ? home : null;
  intent = null;
  held = null;
  session.ended();
  lifted = null;
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
  // It stays raised (above every other window) until its drop settle ends. It is let go into its place in the
  // layout (or sent home): the landing settles from the rect it was let go at, never from its old home.
  const to = w.id === maxId ? FULL : baseLayout().get(w.id)!;
  startSegment(w, to);
  if (landing) hold.land(to);
  else hold.cancel(to);
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

/**
 * Each frame the layout motion draws (one batch per step, the DOM already written), sampled for the checks: the
 * content's scale, and either the window held 1:1 under the pointer (compared with where the pointer puts it) or
 * everything that glides, a lifted window gliding into a slot and back to the pointer included.
 */
function sampleFrame(batch: readonly DrawEntry[]): void {
  if (!episode) return;
  for (const { id, frame } of batch) {
    const w = wins.find((x) => String(x.id) === id);
    if (!w) continue;
    const seen = measure(w);
    episode.scale.push(seen.scale);
    if (w === lifted && held && held.snapped === null && !held.returning) {
      if (held.held) episode.held.push({ t: time, rect: seen.frame, expected: held.held });
    } else {
      w.runs.at(-1)!.push({ t: time, rect: { ...frame.drawn }, target: { ...w.item.target } });
      w.segment?.samples.push({ t: time, rect: { ...frame.drawn } });
    }
  }
}

/**
 * After every frame (the windows stepped and drawn): the drag's frame work, the closed windows leave, and the
 * per-frame checks run.
 */
function afterFrame(): void {
  for (const w of [...wins]) if (w.closing && w.item.shownSettled) dropWin(w);
  if (!episode) return;
  // Room: once the others have settled, none of them overlaps the slot the lifted window is previewed in.
  const room = roomAt();
  if (lifted && room !== null) {
    const slot = room.slot;
    // Only once every other window has settled: before that the frame says nothing either way.
    const others = wins.filter((o) => o !== lifted && !o.closing);
    const blocking = others.every((o) => o.item.settled) ? others.filter((o) => overlap(o.item.drawn, slot) > 1) : null;
    if (blocking) episode.room.push(blocking.length ? `t=${Math.round(time)} window ${blocking.map((o) => o.id).join(", ")} still in the slot kept for window ${lifted.id}` : null);
  }
  // On top: while dragged, and after the drop until it has settled, nothing covers it. Checked after
  // every window of this frame is drawn.
  const r = raised;
  if (r) {
    const frameRect = measure(r).frame;
    const at = r === lifted && inside(frameRect, pointer.x, pointer.y) ? pointer : { x: frameRect.x + frameRect.width / 2, y: frameRect.y + frameRect.height / 2 };
    const verdict = onTopAt(r, at, frameRect);
    if (verdict !== undefined) episode.onTop.push(verdict);
    if (r !== lifted && r.item.settled) {
      raised = null;
      r.el.style.zIndex = r.id === maxId ? "3" : "1";
    }
  }
}

/** Before every item steps: the clock of the checks, and the drag's frame. The frames keep coming while a window is held. */
motion.task((frame) => {
  time += frame.delta;
  aim();
  return lifted !== null;
});
motion.onFrame(afterFrame);

// --- checks ------------------------------------------------------------------

let lastRows: Row[] = [];

/** The move is over (the layout motion went idle): its checks are read, shown, and drawn as a trace. */
function endEpisode(): void {
  const ep = episode;
  episode = null;
  if (!ep) return;
  const { rows, segments: segs } = motionRows(ep, omega());
  lastRows = rows;
  checksTitle.textContent = "Checks of the last move" + (ep.onTop.length > 0 ? ` · drop preview: ${DROP_LABEL[ep.drop]}` : "");
  renderChecks(checksBody, lastRows);
  renderTrace(trace, ep.t0, segs);
}

// --- scenarios ---------------------------------------------------------------

/** Wait for `ok` (checked every frame), at most `ms`: a person's rest on the stack before the release. */
async function until(ok: () => boolean, ms: number): Promise<void> {
  const end = performance.now() + ms;
  while (!ok() && performance.now() < end) await nextFrame();
}

/**
 * A drag from the first window's title to the stack, then a rest there as a person aims, then the release: the
 * drag intent shows the slot after a dwell; with room (Placeholder, Glide) the others make room and settle first,
 * and in Glide the window is in its slot.
 */
async function scriptedDrag(): Promise<void> {
  const w = wins.find((x) => x.id === order[0])!;
  const d = w.item.drawn;
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
  if (dropMode === "outline") await until(() => !hint.hidden, 1500);
  else await until(() => roomFor !== null && wins.every((o) => o === lifted || o.item.settled) && (dropMode !== "glide" || (held?.snapped != null && w.item.settled)), 2500);
  // A last frame of rest, so the slot is on screen when it lets go.
  await nextFrame();
  endDrag();
}

/** The scripted drag under the drop preview `mode` (the page's own choice is kept). */
async function dragWith(mode: DropMode): Promise<void> {
  const before = dropMode;
  setDropMode(mode);
  try {
    await scriptedDrag();
  } finally {
    setDropMode(before);
  }
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
  "drag, outline": () => dragWith("outline"),
  "drag, placeholder": () => dragWith("placeholder"),
  "drag, glide": () => dragWith("glide"),
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
  await motion.idle();
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

/** The viewer's drop preview, kept in this browser only. */
const PREVIEW_KEY = "motion-lab:settle:preview";
/** A preview stored under the names from before the library's: Indicator is Outline, Snap is Glide. */
const OLD_PREVIEW: Readonly<Record<string, DropMode>> = { indicator: "outline", snap: "glide" };

/** The stored drop preview, or null (none stored, or no storage). An old name is read once: it is mapped and stored under the new one. */
function storedDropMode(): DropMode | null {
  try {
    const v = localStorage.getItem(PREVIEW_KEY);
    if (v === null) return null;
    if (DROP_MODES.includes(v as DropMode)) return v as DropMode;
    const mapped = OLD_PREVIEW[v];
    if (mapped) localStorage.setItem(PREVIEW_KEY, mapped);
    return mapped ?? null;
  } catch {
    return null;
  }
}

/** The viewer picks a drop preview: the next drag uses it, and it is kept for the next visit. */
function pickDropMode(m: DropMode): void {
  setDropMode(m);
  try {
    localStorage.setItem(PREVIEW_KEY, m);
  } catch {
    // No storage (a private window, blocked site data): the choice lasts this visit.
  }
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
    roomFor = null;
    relayout();
    moveDrag(pointer.x, pointer.y);
  } else relayout();
}

document.querySelectorAll<HTMLInputElement>("input[name=drop]").forEach((input) =>
  input.addEventListener("change", () => pickDropMode(input.value as DropMode)),
);
document.querySelectorAll<HTMLInputElement>("input[name=layout]").forEach((input) =>
  input.addEventListener("change", () => setLayout(input.value as LayoutKind)),
);
document.querySelectorAll<HTMLInputElement>("input[name=tempo]").forEach((input) =>
  input.addEventListener("change", () => {
    tempo = input.value as Tempo;
    motion.configure({ omega: omega() });
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
// The drop preview is the one stored (the controls are not restored by the browser: `autocomplete="off"`).
setDropMode(storedDropMode() ?? dropMode);
motion.configure({ omega: omega() });
reset(4);

window.__motionLab = { runAll, runs, lastRows: () => lastRows };
