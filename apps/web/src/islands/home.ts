/**
 * Home (island): the live demo built on @n-uf/motion (settle, reveal, held drag, drag intent) and the four cards'
 * thumbnails, on one frame loop. The server rendered every first frame; this animates them.
 *
 * Dragging a window onto another swaps them, by the drag-intent rules: nothing shows while the pointer flies; once it
 * aims at another window the drop shows by the preview mode (Drop indicator: an outline, nothing moves; Open gap: the
 * other window makes room after 160 ms, the dragged one stays under the pointer; Snap to slot: it makes room and the
 * dragged window glides into the slot); the release lands on what was shown. Its own slot is home: a release there
 * changes nothing. The automatic showcase (layouts and a swap, cycling the three modes) pauses as soon as you act and
 * resumes 10 s after your last action. Speed slows every glide; Tempo sets the settle's.
 */
import { reveal, type Point, type Rect, type Settle } from "@n-uf/motion";
import { $ } from "./rail";
import { flip, getSpeed, loop, newSettle, reduced, RectField, virtualNow } from "./motion";
import { registerShowcase, setDragging } from "./showcase";
import { DROP_MODES, dropMode, onDropMode, previewPlan, setDropMode, type DropMode } from "./drop-mode";
import { figureChrome } from "./figure-chrome";
import { createIntent, type Intent } from "../demos/intent";
import { CURVE, CURVES, DESK_A, DESK_B, LAYOUTS, WINDOWS, curvePoint, curveX } from "../demos/home";

// ---- The hero demo: three windows that tile, swap and glide ---------------------------------------------------------
const fig = $("demo-fig");
const demo = $("demo");
const readout = $("readout");
const layoutName = $("layout-name");
interface Win { i: number; el: HTMLElement; frame: HTMLElement; body: HTMLElement; settle: Settle<Rect>; slot: number; target: Rect; hold: boolean }
const wins: Win[] = [...demo.querySelectorAll<HTMLElement>(".dw")].map((el, i) => ({
  i,
  el,
  frame: el.querySelector<HTMLElement>(".dw-frame")!,
  body: el.querySelector<HTMLElement>(".dw-body")!,
  settle: newSettle<Rect>({ x: 0, y: 0, width: 0, height: 0 }),
  slot: i,
  target: { x: 0, y: 0, width: 0, height: 0 },
  hold: false,
}));
let layout = 0;
let running: (() => void) | null = null;
/** The drag in progress (the user's or the showcase's): set by lift(), cleared by release(). */
let drag: Drag | null = null;

// The drop indicator: the site's signal outline on the target slot, with a label.
const ind = document.createElement("div");
ind.className = "dw-ind";
ind.innerHTML = `<span class="dw-ind-label"></span>`;
demo.appendChild(ind);

const slotRect = (slot: number): Rect => LAYOUTS[layout]!.slots[slot]!(demo.clientWidth, demo.clientHeight);

/** Draw one window at its drawn rect: laid out once at its target, moved and clipped, never stretched. */
function paint(w: Win): void {
  const f = reveal(w.settle.value, w.target);
  w.el.style.transform = `translate(${f.dx}px, ${f.dy}px)`;
  w.frame.style.width = f.width + "px";
  w.frame.style.height = f.height + "px";
  w.body.style.clipPath = f.clipRight || f.clipBottom ? `inset(0 ${f.clipRight}px ${f.clipBottom}px 0)` : "";
}
function place(w: Win, r: Rect): void {
  w.target = { ...r };
  Object.assign(w.el.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" });
}
function showReadout(): void {
  const w = wins[0]!, d = w.settle.value, t = w.settle.target;
  readout.innerHTML = `<b>${WINDOWS[0]!.title}</b> · drawn <b>${Math.round(d.width)} × ${Math.round(d.height)}</b> · target <b>${Math.round(t.width)} × ${Math.round(t.height)}</b> · ${w.settle.settled ? "at rest" : "settling"}`;
}
/** Step every window that isn't held 1:1 until all rest. */
function run(): void {
  if (running) return;
  const tick = (dt: number): boolean => {
    let moving = false;
    for (const w of wins) {
      if (!w.hold && w.settle.step(dt)) moving = true;
      paint(w);
    }
    showReadout();
    return moving || !!drag;
  };
  if (reduced()) {
    wins.forEach((w) => { if (!w.hold) w.settle.snap(); });
    tick(0);
    return;
  }
  tick(0);
  running = loop.repeat("write", (f) => {
    const m = tick(f.delta);
    if (!m) running = null;
    return m;
  });
}
/** Lay every window out at its slot; `animate` glides it there from where it is drawn. */
function relayout(animate: boolean): void {
  for (const w of wins) {
    if (drag && w === drag.w) continue;
    const r = slotRect(w.slot);
    place(w, r);
    if (!animate) w.settle.jumpTo({ ...r });
    else w.settle.setTarget({ ...r });
  }
  layoutName.textContent = LAYOUTS[layout]!.name;
  run();
}
relayout(false);
new ResizeObserver(() => { if (!drag) relayout(false); }).observe(demo);

// ---- Dragging a window onto another ----------------------------------------------------------------------------------
interface Drag {
  w: Win;
  dx: number;
  dy: number;
  intent: Intent<Win>;
  shown: Win | null;
  room: Win | null;
  snapped: boolean;
  returning: boolean;
  last: Point;
  scripted: boolean;
}
const inside = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const homeRect = (): Rect => slotRect(drag!.w.slot);
const pointerRect = (p: Point): Rect => { const h = homeRect(); return { x: p.x - drag!.dx, y: p.y - drag!.dy, width: h.width, height: h.height }; };

function showIndicator(target: Win | null): void {
  if (!target || !previewPlan(dropMode()).outline) {
    ind.classList.remove("on");
    return;
  }
  const r = slotRect(target.slot);
  Object.assign(ind.style, { left: r.x + 2 + "px", top: r.y + 2 + "px", width: r.width - 4 + "px", height: r.height - 4 + "px" });
  ind.querySelector(".dw-ind-label")!.textContent = `Swap with ${WINDOWS[target.i]!.title}`;
  ind.classList.add("on");
}
/** Start a drag of `w` grabbed at `p` (demo coordinates). */
function lift(w: Win, p: Point, scripted: boolean): void {
  const d = w.settle.value;
  drag = { w, dx: p.x - d.x, dy: p.y - d.y, intent: createIntent<Win>(), shown: null, room: null, snapped: false, returning: false, last: p, scripted };
  w.hold = true;
  w.settle.hold({ ...d });
  w.el.classList.add("held");
  if (!scripted) setDragging(true);
  run();
}
/** A pointer sample during a drag (demo coordinates, a timestamp in ms). */
function move(p: Point, t: number): void {
  const d = drag;
  if (!d) return;
  d.last = p;
  const own = inside(homeRect(), p);
  const raw = own ? null : wins.find((x) => x !== d.w && inside(slotRect(x.slot), p)) ?? null;
  const { shown, room } = d.intent.update(p, t, raw);
  if (shown !== d.shown) {
    // The old target goes back to its slot, and a snapped window back to the pointer.
    if (d.room) {
      const back = slotRect(d.room.slot);
      place(d.room, back);
      d.room.settle.setTarget(back);
      d.room = null;
    }
    if (d.snapped) {
      d.snapped = false;
      d.returning = true;
    }
    d.shown = shown;
    showIndicator(shown);
  }
  const plan = previewPlan(dropMode());
  if (shown && room && plan.room && d.room !== shown) {
    // Making room (Open gap, Snap to slot): the target settles into the dragged window's home slot.
    const home = homeRect();
    place(shown, home);
    shown.settle.setTarget(home);
    d.room = shown;
    if (plan.glide) {
      // Snap to slot: the dragged window glides into the target's slot, its size revealed, never stretched.
      const slot = slotRect(shown.slot);
      d.w.hold = false;
      place(d.w, slot);
      d.w.settle.setTarget(slot);
      d.snapped = true;
      d.returning = false;
    }
  }
  if (!d.snapped) {
    const r = pointerRect(p);
    if (d.returning) {
      // Back to the pointer by settle, then held 1:1 again.
      place(d.w, homeRect());
      d.w.hold = false;
      d.w.settle.setTarget(r);
      const v = d.w.settle.value;
      if (Math.abs(v.x - r.x) < 1 && Math.abs(v.y - r.y) < 1 && Math.abs(v.width - r.width) < 1) d.returning = false;
    } else {
      if (!d.w.hold) place(d.w, homeRect());
      d.w.hold = true;
      d.w.settle.hold(r);
      paint(d.w);
    }
  }
  run();
}
/** End the drag: the drop is what was shown; `cancel` (Escape, a lost pointer) always goes home. */
function release(cancel: boolean): void {
  const d = drag;
  if (!d) return;
  drag = null;
  ind.classList.remove("on");
  const target = cancel ? null : d.shown;
  if (target) [target.slot, d.w.slot] = [d.w.slot, target.slot];
  d.w.hold = false;
  d.w.el.classList.remove("held");
  // Every window settles to its slot from where it is drawn: a snapped one is already on its way, so no second motion.
  const r = slotRect(d.w.slot);
  place(d.w, r);
  d.w.settle.setTarget(r);
  relayout(true);
  if (!d.scripted) setDragging(false);
}

// The user's drag.
let pointerId = -1;
const local = (e: PointerEvent): Point => { const r = demo.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
demo.addEventListener("pointerdown", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".dw");
  const w = wins.find((x) => x.el === el);
  if (!w || e.button !== 0) return;
  e.preventDefault();
  if (drag) release(true);
  pointerId = e.pointerId;
  demo.setPointerCapture(e.pointerId);
  lift(w, local(e), false);
});
demo.addEventListener("pointermove", (e) => { if (drag && !drag.scripted && e.pointerId === pointerId) move(local(e), performance.now()); });
// Dwell counts too: while the user drags, keep feeding the last point when the pointer rests.
let dwellStop: (() => void) | null = null;
demo.addEventListener("pointerdown", () => {
  if (!drag || drag.scripted || dwellStop) return;
  dwellStop = loop.repeat("input", () => {
    if (!drag || drag.scripted) { dwellStop = null; return false; }
    move(drag.last, performance.now());
    return true;
  });
});
demo.addEventListener("pointerup", (e) => { if (drag && !drag.scripted && e.pointerId === pointerId) release(false); });
demo.addEventListener("pointercancel", () => { if (drag && !drag.scripted) release(true); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && drag && !drag.scripted) release(true); });
figureChrome(fig);
onDropMode(() => { if (drag) showIndicator(drag.shown); });
$("shuffle").addEventListener("click", () => nextLayout());

// ---- The automatic showcase: layouts, then a swap, cycling the three modes; its pace follows the speed -------------
function nextLayout(): void {
  layout = (layout + 1) % LAYOUTS.length;
  // Each new layout also rotates which window takes which slot.
  wins.forEach((w) => (w.slot = (w.slot + 1) % wins.length));
  relayout(true);
}
let showTimer = 0, scriptStop: (() => void) | null = null, step = 0, userMode: DropMode = dropMode();
/** A scripted swap: fly from one window to another, aim, release. */
function scriptedSwap(mode: DropMode, done: () => void): void {
  setDropMode(mode, false);
  const a = wins.find((w) => w.slot === 1)!, b = wins.find((w) => w.slot === 0)!;
  const ra = slotRect(a.slot), rb = slotRect(b.slot);
  const from = { x: ra.x + ra.width / 2, y: ra.y + 16 }, to = { x: rb.x + rb.width * 0.55, y: rb.y + rb.height * 0.45 };
  lift(a, from, true);
  // The scripted pointer moves on the site's clock (slow motion slows it); the drag's own timing rules stay real-time.
  const t0 = virtualNow();
  const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  scriptStop = loop.repeat("input", () => {
    const t = virtualNow() - t0;
    if (t < 420) {
      const f = ease(t / 420);
      move({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }, performance.now());
    } else if (t < 1300) move({ x: to.x + ((t - 420) / 880) * 4, y: to.y }, performance.now());
    else {
      release(false);
      scriptStop = null;
      done();
      return false;
    }
    return true;
  });
}
function showcaseStep(): void {
  showTimer = window.setTimeout(() => {
    step++;
    if (step % 2 === 1) nextLayout();
    else scriptedSwap(DROP_MODES[(step / 2) % DROP_MODES.length]!, () => undefined);
    showcaseStep();
  }, 2600 / getSpeed());
}
registerShowcase(fig, {
  start() {
    userMode = dropMode();
    // A clean state: the first layout, every window in its own slot, gliding there.
    layout = 0;
    wins.forEach((w) => (w.slot = w.i));
    relayout(true);
    step = 0;
    showcaseStep();
  },
  stop() {
    clearTimeout(showTimer);
    if (scriptStop) {
      scriptStop();
      scriptStop = null;
      release(true);
    }
    setDropMode(userMode, false);
  },
});

// For checks: the windows' slots and the drag's state.
(window as unknown as Record<string, unknown>).__hero = {
  slots: () => wins.map((w) => w.slot),
  drag: () => (drag ? { shown: drag.shown ? WINDOWS[drag.shown.i]!.title : null, snapped: drag.snapped } : null),
  settled: () => wins.every((w) => w.settle.settled),
  drawn: () => wins.map((w) => ({ ...w.settle.value })),
  layout: () => layout,
};

// ---- Thumbnails: each a showcase, so they pause with the hero ---------------------------------------------------------
/** A looping thumbnail: `step(ms)` every frame while it runs. */
function loopThumb(el: Element, period: number, step: (ms: number) => void): void {
  let stop: (() => void) | null = null, t0 = 0;
  registerShowcase(el, {
    start() {
      t0 = virtualNow();
      stop = loop.repeat("write", () => { step((virtualNow() - t0) % period); return true; });
    },
    stop() { stop?.(); stop = null; },
  });
}
/** A thumbnail that changes every `period` ms. */
function tickThumb(el: Element, period: number, tick: () => void, reset: () => void): void {
  let timer = 0;
  registerShowcase(el, {
    start() { reset(); timer = window.setInterval(tick, period / getSpeed()); },
    stop() { clearInterval(timer); },
  });
}

// 1 · Window motion: settle against a spring that overshoots, with a playhead.
{
  const svg = $("thumb-motion");
  const head = svg.querySelector(".t-head")!, d1 = svg.querySelector(".t-dot-other")!, d2 = svg.querySelector(".t-dot")!;
  loopThumb(svg, 2400, (t) => {
    const ms = Math.min(CURVE.Tms, t * 0.25);
    const a = curvePoint(CURVES.spring, ms), b = curvePoint(CURVES.settle, ms);
    head.setAttribute("x1", String(curveX(ms)));
    head.setAttribute("x2", String(curveX(ms)));
    d1.setAttribute("cx", String(a.x)); d1.setAttribute("cy", String(a.y));
    d2.setAttribute("cx", String(b.x)); d2.setAttribute("cy", String(b.y));
  });
}

// 2 · Drag intent: fly over, aim, the indicator shows, the panel lands with a settle and glides home.
{
  const stage = $("thumb-drag"), chip = stage.querySelector<HTMLElement>(".t-chip")!, ind2 = stage.querySelector<HTMLElement>(".t-ind")!;
  const HOMEP: Point = { x: 14, y: 99 }, SLOT: Point = { x: 195, y: 60 }, aimAt: Point = { x: 186, y: 55 };
  const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const settleAt = (from: Point, to: Point, ms: number): Point => { const k = Math.exp((-25 * ms) / 1000); return { x: to.x + (from.x - to.x) * k, y: to.y + (from.y - to.y) * k }; };
  loopThumb(stage, 3600, (t) => {
    let p: Point, on = false, lifted = true;
    if (t < 300) { p = HOMEP; lifted = false; }
    else if (t < 900) { const f = ease((t - 300) / 600); p = { x: HOMEP.x + (aimAt.x - HOMEP.x) * f, y: HOMEP.y + (aimAt.y - HOMEP.y) * f - Math.sin(f * Math.PI) * 40 }; }
    else if (t < 1500) { const f = (t - 900) / 600; p = { x: aimAt.x + 6 * f, y: aimAt.y + 3 * f }; on = t > 1060; }
    else if (t < 2500) { p = settleAt({ x: aimAt.x + 6, y: aimAt.y + 3 }, SLOT, t - 1500); lifted = false; }
    else { p = settleAt(SLOT, HOMEP, t - 2500); lifted = false; }
    chip.style.transform = `translate(${p.x}px, ${p.y}px)`;
    chip.classList.toggle("lifted", lifted);
    ind2.classList.toggle("on", on);
  });
}

// 3 · Desk layouts: the same desk built two ways, gliding between them.
{
  const svg = $("thumb-desk");
  const nodes = new Map<string, SVGElement>();
  svg.querySelectorAll<SVGElement>("rect[data-k]").forEach((n) => nodes.set(n.dataset.k!, n));
  let floating = false;
  const field = new RectField<string>((rects) => rects.forEach((r, k) => {
    const n = nodes.get(k)!;
    n.setAttribute("x", r.x.toFixed(1)); n.setAttribute("y", r.y.toFixed(1));
    n.setAttribute("width", Math.max(0, r.width).toFixed(1)); n.setAttribute("height", Math.max(0, r.height).toFixed(1));
    n.classList.toggle("t-float", floating && k.startsWith("p"));
  }));
  const set = (m: Record<string, Rect>, animate: boolean): void => field.set(new Map(Object.entries(m)), animate);
  set(DESK_A, false);
  tickThumb(svg, 2400, () => { floating = !floating; set(floating ? DESK_B : DESK_A, true); }, () => { if (floating) { floating = false; set(DESK_A, true); } });
}

// 4 · Toolbar groups: groups trade places behind their handles.
{
  const bar = $("thumb-bar");
  tickThumb(bar, 2000, () => {
    const groups = [...bar.querySelectorAll<HTMLElement>(".t-group")];
    flip(groups, () => bar.insertBefore(groups[groups.length - 1]!, groups[0]!));
  }, () => undefined);
}
