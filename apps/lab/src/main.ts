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

// The current move ("episode"): from the first change while idle until everything rests.
let time = 0;
let episode: {
  t0: number;
  segments: Segment[];
  runs: TargetSample[][];
  scale: ScaleSample[];
  held: HeldSample[];
} | null = null;
let idleWaiters: Array<() => void> = [];

const loop = createFrameLoop({ clock: createBrowserClock() });
let running = false;

const omega = (): number => SETTLE_TEMPO[tempo];
const same = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

function layout(ids: readonly number[]): Map<number, Rect> {
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
  episode = { t0: time, segments: [], runs: [], scale: [], held: [] };
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
    w.el.style.zIndex = id === maxId ? "3" : "1";
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

function doOpen(): void {
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
  lifted = w;
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

function moveDrag(px: number, py: number): void {
  if (!lifted) return;
  const d = lifted.rect.value;
  expected = { x: px - grab.x, y: py - grab.y, width: d.width, height: d.height };
  if (mode === "proposed") (lifted.rect as Settle<Rect>).hold(expected);
  else lifted.rect.setTarget(expected);
  // Where it would land: the slot under the pointer, trying each place in the order.
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= order.length; i++) {
    const ids = [...order.slice(0, i), lifted.id, ...order.slice(i)];
    const slot = layout(ids).get(lifted.id)!;
    const dx = px - (slot.x + slot.width / 2);
    const dy = py - (slot.y + slot.height / 2);
    const inside = px >= slot.x && px <= slot.x + slot.width && py >= slot.y && py <= slot.y + slot.height;
    const dist = (inside ? 0 : 1e6) + dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  dropIndex = best;
  const ids = [...order.slice(0, best), lifted.id, ...order.slice(best)];
  const slot = layout(ids).get(lifted.id)!;
  hint.hidden = false;
  Object.assign(hint.style, { left: `${slot.x}px`, top: `${slot.y}px`, width: `${slot.width}px`, height: `${slot.height}px` });
}

function endDrag(): void {
  const w = lifted;
  if (!w) return;
  lifted = null;
  expected = null;
  hint.hidden = true;
  w.el.classList.remove("lifted");
  order.splice(dropIndex, 0, w.id);
  newRun(w);
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
    if (w === lifted) {
      // Held: compare what the page shows with where the pointer puts the window.
      if (expected) episode.held.push({ t: time, rect: seen.frame, expected });
    } else {
      w.runs.at(-1)!.push({ t: time, rect: drawn, target: w.rect.target });
      w.segment?.samples.push({ t: time, rect: drawn });
    }
    if (w.closing && w.pop.settled) {
      w.el.remove();
      wins = wins.filter((x) => x !== w);
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
    { name: "Tempo of the longest move", result: tempo, info: tempoInfo },
  ];
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
};

interface Run {
  readonly scenario: string;
  readonly mode: Mode;
  readonly failed: string[];
  readonly rows: Row[];
}

const runs: Run[] = [];

async function runScenario(name: string): Promise<Run> {
  reset(3);
  await nextFrame();
  const play = SCENARIOS[name]!;
  await play();
  await idle();
  const failed = lastRows.filter((r) => r.result && !r.result.ok).map((r) => r.name);
  const run: Run = { scenario: name, mode, failed, rows: lastRows };
  runs.push(run);
  const tr = document.createElement("tr");
  tr.innerHTML = "<td></td><td></td><td></td>";
  tr.children[0]!.textContent = name;
  tr.children[1]!.textContent = mode === "proposed" ? "Proposed" : "Today";
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
  reset(3);
}

document.querySelectorAll<HTMLInputElement>("input[name=mode]").forEach((input) =>
  input.addEventListener("change", () => setMode(input.value as Mode)),
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

reset(3);

declare global {
  interface Window {
    __motionLab: { runAll: () => Promise<Run[]>; runs: Run[]; lastRows: () => Row[] };
  }
}
window.__motionLab = { runAll, runs, lastRows: () => lastRows };
