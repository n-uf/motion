/**
 * The motion lab: a small master-stack tiling stage whose windows move by the
 * proposed rules (settle, hold, reveal) or by today's (a spring from rest,
 * a drag spring, stretched content, an overshooting maximize tween). Every
 * frame of every move is sampled and checked with @n-uf/motion/testing.
 *
 * `window.__motionLab.runAll()` runs the scripted scenarios in both modes and
 * returns which rules failed where (the headless try uses it).
 */
import {
  createFrameLoop,
  createSettle,
  createSpring,
  createTween,
  cubicBezier,
  popIn,
  reveal,
  SETTLE_TEMPO,
  type Animator,
  type FrameInfo,
  type Rect,
  type Settle,
  type Spring,
} from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import {
  checkContentScale,
  checkHeld,
  checkMonotonic,
  checkNoJumps,
  checkNoOvershoot,
  checkTempo,
  type CheckResult,
  type HeldSample,
  type RectSample,
  type ScaleSample,
  type TargetSample,
} from "@n-uf/motion/testing";

type Mode = "proposed" | "today";
type Tempo = keyof typeof SETTLE_TEMPO;
type How = "layout" | "morph";

const STAGE_W = 720;
const STAGE_H = 420;
const GAP = 10;
/** Today's maximize curve in Surface (tokens "snappy", 220 ms): y2 = 1.05 overshoots. */
const SNAPPY = cubicBezier(0.05, 0.9, 0.1, 1.05);
const OUT = cubicBezier(0.16, 1, 0.3, 1);

const stage = document.getElementById("stage") as HTMLDivElement;
const hint = document.getElementById("hint") as HTMLDivElement;
const checksBody = document.querySelector("#checks tbody") as HTMLTableSectionElement;
const checksTitle = document.getElementById("checks-title") as HTMLHeadingElement;
const runsBody = document.querySelector("#runs tbody") as HTMLTableSectionElement;
const trace = document.getElementById("trace") as HTMLCanvasElement;

interface Segment {
  readonly id: number;
  readonly t0: number;
  readonly from: Rect;
  readonly to: Rect;
  readonly samples: RectSample[];
}

interface Win {
  readonly id: number;
  readonly el: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly content: HTMLDivElement;
  rect: Animator<Rect>;
  kind: "settle" | "spring" | "tween";
  /** Where the element is laid out (its content's size); the drawn rect glides toward it. */
  target: Rect;
  pop: Animator<number>;
  closing: boolean;
  segment: Segment | null;
  /** Unheld frames, one run per stretch between lifts and drops. */
  runs: TargetSample[][];
}

let mode: Mode = "proposed";
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
let dropIndex = 0;
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
/** In snap mode: the slot index the window is snapped into, or null while it follows the pointer. */
let snapped: number | null = null;
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
  /** The motion and drop preview this move ran with. */
  mode: Mode;
  drop: DropMode;
} | null = null;
let idleWaiters: Array<() => void> = [];

const loop = createFrameLoop({ clock: createBrowserClock() });
let running = false;

const omega = (): number => SETTLE_TEMPO[tempo];
const same = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

/** The tiling layouts: Hyprland's master and dwindle, plus equal columns and a grid. */
type LayoutKind = "master" | "dwindle" | "columns" | "grid";
let layoutKind: LayoutKind = "master";

function layout(ids: readonly number[]): Map<number, Rect> {
  if (layoutKind === "dwindle") return dwindle(ids);
  if (layoutKind === "columns") return columns(ids);
  if (layoutKind === "grid") return grid(ids);
  return masterStack(ids);
}

/** Dwindle (Hyprland's default): each window takes half of what is left, split along the longer side. */
function dwindle(ids: readonly number[]): Map<number, Rect> {
  const out = new Map<number, Rect>();
  let r: Rect = { x: GAP, y: GAP, width: STAGE_W - 2 * GAP, height: STAGE_H - 2 * GAP };
  ids.forEach((id, i) => {
    if (i === ids.length - 1) {
      out.set(id, r);
      return;
    }
    if (r.width >= r.height) {
      const w = (r.width - GAP) / 2;
      out.set(id, { x: r.x, y: r.y, width: w, height: r.height });
      r = { x: r.x + w + GAP, y: r.y, width: w, height: r.height };
    } else {
      const h = (r.height - GAP) / 2;
      out.set(id, { x: r.x, y: r.y, width: r.width, height: h });
      r = { x: r.x, y: r.y + h + GAP, width: r.width, height: h };
    }
  });
  return out;
}

/** Equal columns, full height. */
function columns(ids: readonly number[]): Map<number, Rect> {
  const out = new Map<number, Rect>();
  const n = ids.length;
  const w = (STAGE_W - GAP * (n + 1)) / Math.max(1, n);
  ids.forEach((id, i) => out.set(id, { x: GAP + i * (w + GAP), y: GAP, width: w, height: STAGE_H - 2 * GAP }));
  return out;
}

/** A grid as square as the count allows; the last row's cells widen to fill it. */
function grid(ids: readonly number[]): Map<number, Rect> {
  const out = new Map<number, Rect>();
  const n = ids.length;
  if (n === 0) return out;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const h = (STAGE_H - GAP * (rows + 1)) / rows;
  ids.forEach((id, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const col = i - row * cols;
    const w = (STAGE_W - GAP * (inRow + 1)) / inRow;
    out.set(id, { x: GAP + col * (w + GAP), y: GAP + row * (h + GAP), width: w, height: h });
  });
  return out;
}

/** Master and stack: the first window on the left half, the rest stacked on the right. */
function masterStack(ids: readonly number[]): Map<number, Rect> {
  const out = new Map<number, Rect>();
  const W = STAGE_W - 2 * GAP;
  const H = STAGE_H - 2 * GAP;
  if (ids.length === 0) return out;
  if (ids.length === 1) {
    out.set(ids[0]!, { x: GAP, y: GAP, width: W, height: H });
    return out;
  }
  const mw = (W - GAP) / 2;
  out.set(ids[0]!, { x: GAP, y: GAP, width: mw, height: H });
  const k = ids.length - 1;
  const sh = (H - GAP * (k - 1)) / k;
  ids.slice(1).forEach((id, i) => out.set(id, { x: 2 * GAP + mw, y: GAP + i * (sh + GAP), width: mw, height: sh }));
  return out;
}

const FULL: Rect = { x: GAP, y: GAP, width: STAGE_W - 2 * GAP, height: STAGE_H - 2 * GAP };

function startEpisode(): void {
  if (episode) return;
  episode = { t0: time, segments: [], runs: [], scale: [], held: [], onTop: [], mode, drop: dropMode };
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

function makeRectAnimator(at: Rect): { rect: Animator<Rect>; kind: Win["kind"] } {
  return mode === "proposed"
    ? { rect: createSettle(at, { omega: omega() }), kind: "settle" }
    : { rect: createSpring(at, { stiffness: 320, dampingRatio: 1 }), kind: "spring" };
}

function setTarget(w: Win, to: Rect, how: How): void {
  if (same(w.target, to) && same(w.rect.target, to)) return;
  ensureLoop();
  const drawn = w.rect.value;
  w.target = { ...to };
  Object.assign(w.el.style, { left: `${to.x}px`, top: `${to.y}px`, width: `${to.width}px`, height: `${to.height}px` });
  // The segment starts with the frame the move began on, so tempo counts from here.
  w.segment = { id: w.id, t0: time, from: { ...drawn }, to: { ...to }, samples: [{ t: time, rect: { ...drawn } }] };
  episode?.segments.push(w.segment);
  if (mode === "proposed") {
    const settle = w.rect as Settle<Rect>;
    settle.configure({ omega: omega() });
    settle.setTarget(to);
    return;
  }
  // Today: a morph is a tween from where it's drawn; anything else a 320 spring, rebuilt at rest after a tween.
  if (how === "morph") {
    w.rect = createTween(drawn, { duration: 220, easing: SNAPPY });
    w.kind = "tween";
  } else if (w.kind !== "spring") {
    w.rect = createSpring(drawn, { stiffness: 320, dampingRatio: 1 });
    w.kind = "spring";
  } else {
    (w.rect as Spring<Rect>).configure({ stiffness: 320 });
  }
  w.rect.setTarget(to);
}

function relayout(morphId: number | null = null): void {
  const slots = layout(order);
  for (const id of order) {
    const w = wins.find((x) => x.id === id)!;
    const to = id === maxId ? FULL : slots.get(id)!;
    setTarget(w, to, id === morphId ? "morph" : "layout");
    w.el.style.zIndex = w === raised ? Z_RAISED : id === maxId ? "3" : "1";
  }
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
  content.innerHTML = `<div class="title">Window ${id}</div><div class="body">Invoice 04${10 + id}.pdf · total due 1 240.00<br>Page 2 of 5 · the quick brown fox</div>`;
  el.append(frame, content);
  stage.append(el);
  const { rect, kind } = makeRectAnimator(at);
  const w: Win = {
    id,
    el,
    frame,
    content,
    rect,
    kind,
    target: { ...at },
    pop: mode === "proposed" ? createSettle(1, { omega: omega(), restDelta: 0.001 }) : createTween(1, { duration: 180, easing: OUT }),
    closing: false,
    segment: null,
    runs: [[]],
  };
  Object.assign(el.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${at.width}px`, height: `${at.height}px` });
  content.querySelector(".title")!.addEventListener("pointerdown", (e) => onPointerDown(w, e as PointerEvent));
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
  const slots = layout(order);
  for (const w of wins) {
    const at = slots.get(w.id)!;
    w.target = { ...at };
    Object.assign(w.el.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${at.width}px`, height: `${at.height}px` });
    w.rect.jumpTo(at);
    draw(w);
  }
  lastRows = [];
}

// --- actions -----------------------------------------------------------------

/** More windows than this make slots too small to see the motion (and dwindle's sizes run out). */
const MAX_WINDOWS = 8;

function doOpen(): void {
  if (order.length >= MAX_WINDOWS) return;
  const slots = layout([...order, nextId]);
  const at = slots.get(nextId)!;
  const w = makeWin(at);
  w.pop.jumpTo(0);
  ensureLoop();
  newRun(w);
  w.pop.setTarget(1);
  order.push(w.id);
  relayout();
}

function doClose(): void {
  const id = order.at(-1);
  if (id === undefined) return;
  const w = wins.find((x) => x.id === id)!;
  ensureLoop();
  w.closing = true;
  if (mode === "today") w.pop = createTween(1, { duration: 140, easing: OUT });
  w.pop.setTarget(0);
  order = order.filter((x) => x !== id);
  if (maxId === id) maxId = null;
  relayout();
}

function doSwap(): void {
  if (order.length < 2) return;
  [order[0], order[1]] = [order[1]!, order[0]!];
  relayout();
}

function doMaximize(): void {
  const id = order[0];
  if (id === undefined) return;
  maxId = maxId === id ? null : id;
  relayout(id);
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
  lifted = w;
  raised = w;
  w.el.style.zIndex = Z_RAISED;
  w.el.classList.add("lifted");
  if (maxId === w.id) maxId = null;
  order = order.filter((x) => x !== w.id);
  w.segment = null;
  newRun(w);
  if (mode === "today") {
    // Surface today: the person's own drag follows on the localDrag spring (1400).
    if (w.kind !== "spring") {
      w.rect = createSpring(d, { stiffness: 1400, dampingRatio: 1 });
      w.kind = "spring";
    } else (w.rect as Spring<Rect>).configure({ stiffness: 1400 });
  }
  relayout();
  moveDrag(px, py);
}

/** The slot the lifted window would take if inserted at `index` in the order. */
function slotAt(index: number, id: number): Rect {
  return layout([...order.slice(0, index), id, ...order.slice(index)]).get(id)!;
}

const inside = (r: Rect, px: number, py: number, inset = 0): boolean =>
  px >= r.x + inset && px <= r.x + r.width - inset && py >= r.y + inset && py <= r.y + r.height - inset;

function moveDrag(px: number, py: number): void {
  if (!lifted) return;
  pointer = { x: px, y: py };
  expected = { x: px - grab.x, y: py - grab.y, width: liftSize.width, height: liftSize.height };
  // Where it would land: the slot under the pointer (else the nearest), trying each place in the order.
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= order.length; i++) {
    const slot = slotAt(i, lifted.id);
    const dx = px - (slot.x + slot.width / 2);
    const dy = py - (slot.y + slot.height / 2);
    const dist = (inside(slot, px, py) ? 0 : 1e6) + dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  dropIndex = best;
  const slot = slotAt(best, lifted.id);

  if (dropMode === "snap") {
    // Snap in once the pointer is well inside a slot; stay until it leaves that slot.
    if (snapped !== null && !inside(slotAt(snapped, lifted.id), px, py)) snapped = null;
    if (snapped === null && inside(slot, px, py, Math.min(SNAP_IN, Math.min(slot.width, slot.height) / 4))) snapped = best;
    if (snapped !== null) dropIndex = snapped;
    hint.hidden = true;
    // Snapped: glide into the slot. Not snapped: glide back under the pointer (no jump), at the lift size.
    const goal = snapped !== null ? slotAt(snapped, lifted.id) : expected;
    if (!same(lifted.rect.target, goal)) {
      // A new segment for the checks: from where it is drawn to the new goal.
      const drawn = lifted.rect.value;
      lifted.segment = { id: lifted.id, t0: time, from: { ...drawn }, to: { ...goal }, samples: [{ t: time, rect: { ...drawn } }] };
      episode?.segments.push(lifted.segment);
      lifted.rect.setTarget(goal);
    }
    return;
  }

  if (mode === "proposed") (lifted.rect as Settle<Rect>).hold(expected);
  else lifted.rect.setTarget(expected);
  hint.hidden = false;
  Object.assign(hint.style, { left: `${slot.x}px`, top: `${slot.y}px`, width: `${slot.width}px`, height: `${slot.height}px` });
}

function endDrag(): void {
  const w = lifted;
  if (!w) return;
  lifted = null;
  expected = null;
  snapped = null;
  hint.hidden = true;
  w.el.classList.remove("lifted");
  order.splice(dropIndex, 0, w.id);
  newRun(w);
  // It stays raised (above every other window) until its drop settle ends.
  relayout();
}

function onPointerDown(w: Win, e: PointerEvent): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const p = stagePoint(e);
  beginDrag(w, p.x, p.y);
  const move = (ev: PointerEvent): void => {
    const q = stagePoint(ev);
    moveDrag(q.x, q.y);
  };
  const up = (): void => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
    endDrag();
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}

// --- the frame ---------------------------------------------------------------

function draw(w: Win): void {
  const d = w.rect.value;
  const p = w.pop.value;
  const t = w.target;
  if (mode === "proposed") {
    const r = reveal(d, t);
    const pi = popIn(p);
    const cx = d.width / 2;
    const cy = d.height / 2;
    w.el.style.transform = `translate(${r.dx}px, ${r.dy}px) translate(${cx}px, ${cy}px) scale(${pi.scale}) translate(${-cx}px, ${-cy}px)`;
    w.el.style.opacity = String(pi.opacity);
    w.frame.style.width = `${r.width}px`;
    w.frame.style.height = `${r.height}px`;
    w.content.style.clipPath = `inset(0 ${r.clipRight}px ${r.clipBottom}px 0)`;
    return;
  }
  const sx = t.width > 0 ? d.width / t.width : 1;
  const sy = t.height > 0 ? d.height / t.height : 1;
  w.el.style.transform = `translate(${d.x - t.x}px, ${d.y - t.y + (1 - p) * 8}px) scale(${sx}, ${sy})`;
  w.el.style.opacity = String(p);
  w.frame.style.width = `${t.width}px`;
  w.frame.style.height = `${t.height}px`;
  w.content.style.clipPath = "";
}

/**
 * Whether the topmost element at stage point `want` belongs to `w`: null when it does, a failure message
 * when something else is on top, undefined when no point of it can be hit-tested (outside the stage's
 * visible content box or the browser's viewport). The point is moved into the part of the frame that
 * can be hit.
 */
function onTopAt(w: Win, want: { x: number; y: number }, frame: Rect): string | null | undefined {
  const s = stage.getBoundingClientRect();
  const k = s.width / STAGE_W;
  const ox = s.left + stage.clientLeft;
  const oy = s.top + stage.clientTop;
  // The visible box in stage units: the stage's content box, cut to the viewport.
  const vx0 = Math.max(0, -ox / k);
  const vy0 = Math.max(0, -oy / k);
  const vx1 = Math.min(stage.clientWidth / k, (window.innerWidth - ox) / k);
  const vy1 = Math.min(stage.clientHeight / k, (window.innerHeight - oy) / k);
  const x0 = Math.max(frame.x, vx0) + 1;
  const y0 = Math.max(frame.y, vy0) + 1;
  const x1 = Math.min(frame.x + frame.width, vx1) - 1;
  const y1 = Math.min(frame.y + frame.height, vy1) - 1;
  if (x1 <= x0 || y1 <= y0) return undefined;
  const at = { x: Math.min(Math.max(want.x, x0), x1), y: Math.min(Math.max(want.y, y0), y1) };
  const top = document.elementFromPoint(ox + at.x * k, oy + at.y * k);
  if (!top) return undefined;
  if (w.el.contains(top)) return null;
  const other = top?.closest<HTMLElement>(".win")?.dataset.id;
  return `t=${Math.round(time)} window ${w.id} is under ${other ? `window ${other}` : (top?.className || "something")} at (${Math.round(at.x)}, ${Math.round(at.y)})`;
}

/** What the page draws, read back from the DOM: the content's scale and the frame's rect in stage units. */
function measure(w: Win): { scale: ScaleSample; frame: Rect } {
  const css = getComputedStyle(w.el).transform;
  const m = css && css !== "none" ? new DOMMatrixReadOnly(css) : new DOMMatrixReadOnly();
  const s = stage.getBoundingClientRect();
  const f = w.frame.getBoundingClientRect();
  const k = STAGE_W / s.width;
  // The stage has a 1 px border; its content box starts inside it.
  const frame = { x: (f.left - s.left - stage.clientLeft) * k, y: (f.top - s.top - stage.clientTop) * k, width: f.width * k, height: f.height * k };
  return { scale: { t: time, a: m.a, d: m.d }, frame };
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

interface Row {
  readonly name: string;
  readonly result: CheckResult | null;
  readonly info?: string;
}

function merge(results: readonly CheckResult[]): CheckResult {
  const failures = results.flatMap((r) => r.failures);
  return { ok: failures.length === 0, failures };
}

let lastRows: Row[] = [];

function onTopResult(frames: readonly (string | null)[]): CheckResult {
  const failures = frames.filter((x): x is string => x !== null);
  return { ok: failures.length === 0, failures };
}

function endEpisode(): void {
  const ep = episode;
  episode = null;
  if (!ep) return;
  const segs = ep.segments.filter((s) => s.samples.length > 0);
  const label = (s: Segment, r: CheckResult): CheckResult => ({ ok: r.ok, failures: r.failures.map((f) => `window ${s.id}: ${f}`) });
  let longest: Segment | null = null;
  let longestSpan = 0;
  // The longest move that wasn't interrupted: it ends on its own target.
  const finished = segs.filter((s) => {
    const last = s.samples.at(-1)!.rect;
    return Math.abs(last.x - s.to.x) < 0.5 && Math.abs(last.y - s.to.y) < 0.5 && Math.abs(last.width - s.to.width) < 0.5 && Math.abs(last.height - s.to.height) < 0.5;
  });
  for (const s of finished) {
    const span = Math.max(...(["x", "y", "width", "height"] as const).map((k) => Math.abs(s.to[k] - s.from[k])));
    if (span > longestSpan) {
      longestSpan = span;
      longest = s;
    }
  }
  // Tempo: the proposed settle's 90 % time at the chosen tempo, on the longest move that finished.
  const t90 = (Math.log(10) / omega()) * 1000;
  const tempo = longest ? checkTempo(longest.samples, longest.from, longest.to, t90, 0.25, longest.t0) : null;
  const tempoInfo = tempo?.t90 != null ? `90 % after ${Math.round(tempo.t90)} ms (window ${longest!.id}, ${Math.round(longestSpan)} px; expected ${Math.round(t90)} ms)` : "";
  lastRows = [
    { name: "Something moved", result: { ok: segs.length > 0, failures: segs.length > 0 ? [] : ["no move was recorded"] } },
    { name: "No overshoot (position and size)", result: merge(segs.map((s) => label(s, checkNoOvershoot(s.samples, s.from, s.to)))) },
    { name: "Settles from one side (monotonic)", result: merge(segs.map((s) => label(s, checkMonotonic(s.samples, s.to)))) },
    { name: "No jumps or restarts", result: merge(ep.runs.map((run) => checkNoJumps(run, omega()))) },
    { name: "Content never stretched", result: checkContentScale(ep.scale) },
    { name: "Held 1:1 under the pointer", result: ep.held.length > 0 ? checkHeld(ep.held) : null },
    { name: "Dragged window stays on top", result: ep.onTop.length > 0 ? onTopResult(ep.onTop) : null },
    { name: "Tempo of the longest move", result: tempo, info: tempoInfo },
  ];
  checksTitle.textContent =
    `Checks of the last move · ${ep.mode === "proposed" ? "Proposed" : "Today (failures expected: this is today's motion)"}` +
    (ep.onTop.length > 0 ? ` · drop preview: ${ep.drop === "snap" ? "snap to slot" : "drop indicator"}` : "");
  renderChecks(lastRows);
  renderTrace(ep.t0, segs);
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const resolve of waiters) resolve();
}

function renderChecks(rows: readonly Row[]): void {
  checksBody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      const verdict = row.result === null ? "not exercised" : row.result.ok ? "pass" : `fail (${row.result.failures.length})`;
      const status = row.info ? `${verdict} · ${row.info}` : verdict;
      const cls = row.result === null ? "" : row.result.ok ? "ok" : "bad";
      tr.innerHTML = `<td></td><td class="${cls}"></td><td></td>`;
      tr.children[0]!.textContent = row.name;
      tr.children[1]!.textContent = status;
      tr.children[2]!.textContent = row.result?.failures[0] ?? "";
      return tr;
    }),
  );
}

function renderTrace(t0: number, segs: readonly Segment[]): void {
  const ctx = trace.getContext("2d");
  if (!ctx) return;
  const W = trace.width;
  const H = trace.height;
  ctx.clearRect(0, 0, W, H);
  const ink = getComputedStyle(document.body).color;
  const end = Math.max(300, ...segs.map((s) => (s.samples.at(-1)?.t ?? t0) - t0));
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(30, 10);
  ctx.lineTo(30, H - 20);
  ctx.lineTo(W - 10, H - 20);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  ctx.font = "11px system-ui";
  ctx.fillText("100 %", 0, 14);
  ctx.fillText("0", 18, H - 22);
  ctx.fillText(`${Math.round(end)} ms`, W - 60, H - 6);
  const colours = ["#4c6ef5", "#e8590c", "#2b8a3e", "#ae3ec9", "#1098ad", "#f08c00"];
  const X = (t: number): number => 30 + ((W - 40) * (t - t0)) / end;
  const Y = (f: number): number => H - 20 - (H - 30) * f;
  segs.forEach((s, i) => {
    const keys = ["x", "y", "width", "height"] as const;
    const span = Math.max(...keys.map((k) => Math.abs(s.to[k] - s.from[k])));
    if (span < 0.5) return;
    ctx.strokeStyle = colours[s.id % colours.length]!;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(s.t0), Y(1));
    for (const x of s.samples) {
      // Signed: a component past its target shows below zero.
      const k = keys.reduce((a, b) => (Math.abs(s.to[b] - s.from[b]) > Math.abs(s.to[a] - s.from[a]) ? b : a));
      ctx.lineTo(X(x.t), Y((x.rect[k] - s.to[k]) / (s.from[k] - s.to[k])));
    }
    ctx.stroke();
    void i;
  });
}

// --- scenarios ---------------------------------------------------------------

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
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
  readonly mode: Mode;
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
  const run: Run = { scenario: name, mode, failed, rows: lastRows };
  runs.push(run);
  const tr = document.createElement("tr");
  tr.innerHTML = "<td></td><td></td><td></td>";
  tr.children[0]!.textContent = name;
  tr.children[1]!.textContent = `${mode === "proposed" ? "Proposed" : "Today"} · ${layoutAtStart}`;
  tr.children[2]!.textContent = failed.length ? failed.join(", ") : "none";
  (tr.children[2] as HTMLElement).className = failed.length ? "bad" : "ok";
  runsBody.append(tr);
  return run;
}

async function runAll(): Promise<Run[]> {
  const before = mode;
  const out: Run[] = [];
  runsBody.replaceChildren();
  for (const m of ["proposed", "today"] as const) {
    setMode(m);
    for (const name of Object.keys(SCENARIOS)) out.push(await runScenario(name));
  }
  setMode(before);
  return out;
}

// --- wiring ------------------------------------------------------------------

function setMode(m: Mode): void {
  mode = m;
  (document.querySelector(`input[name=mode][value=${m}]`) as HTMLInputElement).checked = true;
  reset(4);
}

function setDropMode(m: DropMode): void {
  dropMode = m;
  (document.querySelector(`input[name=drop][value=${m}]`) as HTMLInputElement).checked = true;
}

/** A new layout: every window glides to its place in it. */
function setLayout(k: LayoutKind): void {
  layoutKind = k;
  (document.querySelector(`input[name=layout][value=${k}]`) as HTMLInputElement).checked = true;
  if (!lifted) relayout();
}

document.querySelectorAll<HTMLInputElement>("input[name=mode]").forEach((input) =>
  input.addEventListener("change", () => setMode(input.value as Mode)),
);
document.querySelectorAll<HTMLInputElement>("input[name=drop]").forEach((input) =>
  input.addEventListener("change", () => setDropMode(input.value as DropMode)),
);
document.querySelectorAll<HTMLInputElement>("input[name=layout]").forEach((input) =>
  input.addEventListener("change", () => setLayout(input.value as LayoutKind)),
);
document.querySelectorAll<HTMLInputElement>("input[name=tempo]").forEach((input) =>
  input.addEventListener("change", () => {
    tempo = input.value as Tempo;
    for (const w of wins) if (w.kind === "settle") (w.rect as Settle<Rect>).configure({ omega: omega() });
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
  runall: () => void runAll(),
};
document.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) =>
  b.addEventListener("click", () => actions[b.dataset.act!]?.()),
);

reset(4);

declare global {
  interface Window {
    __motionLab: { runAll: () => Promise<Run[]>; runs: Run[]; lastRows: () => Row[] };
  }
}
window.__motionLab = { runAll, runs, lastRows: () => lastRows };
