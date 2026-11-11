/**
 * Home (island): the live demo built on @n-uf/motion (settle, reveal, held drag) and the four cards' thumbnails, on
 * one frame loop. The server rendered every first frame; this animates them.
 */
import { createSettle, reveal, type Point, type Rect, type Settle } from "@n-uf/motion";
import { $ } from "./rail";
import { flip, loop, reduced, RectField } from "./motion";
import { CURVE, CURVES, DESK_A, DESK_B, LAYOUTS, WINDOWS, curvePoint, curveX } from "../demos/home";

// ---- The hero demo: three windows that tile, swap and glide ---------------------------------------------------------
const demo = $("demo");
const readout = $("readout");
const layoutName = $("layout-name");
interface Win { el: HTMLElement; frame: HTMLElement; body: HTMLElement; settle: Settle<Rect>; slot: number; target: Rect; held: boolean }
const wins: Win[] = [...demo.querySelectorAll<HTMLElement>(".dw")].map((el, i) => ({
  el,
  frame: el.querySelector<HTMLElement>(".dw-frame")!,
  body: el.querySelector<HTMLElement>(".dw-body")!,
  settle: createSettle<Rect>({ x: 0, y: 0, width: 0, height: 0 }),
  slot: i,
  target: { x: 0, y: 0, width: 0, height: 0 },
  held: false,
}));
let layout = 0;
let running: (() => void) | null = null;

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
  readout.innerHTML = `<span><b>${WINDOWS[0]!.title}</b></span><span>drawn <b>${Math.round(d.width)} × ${Math.round(d.height)}</b></span><span>target <b>${Math.round(t.width)} × ${Math.round(t.height)}</b></span><span>${w.settle.settled ? "at rest" : "settling"}</span>`;
}
function run(): void {
  if (running) return;
  const tick = (dt: number): boolean => {
    let moving = false;
    for (const w of wins) {
      if (!w.held && w.settle.step(dt)) moving = true;
      paint(w);
    }
    showReadout();
    return moving;
  };
  if (reduced()) {
    wins.forEach((w) => { if (!w.held) w.settle.snap(); });
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
function relayout(animate: boolean): void {
  const W = demo.clientWidth, H = demo.clientHeight;
  for (const w of wins) {
    const r = LAYOUTS[layout]!.slots[w.slot]!(W, H);
    place(w, r);
    if (!animate) w.settle.jumpTo({ ...r });
    else if (!w.held) w.settle.setTarget({ ...r });
  }
  layoutName.textContent = LAYOUTS[layout]!.name;
  run();
}
relayout(false);
new ResizeObserver(() => relayout(false)).observe(demo);

let auto = 0;
const next = (): void => {
  layout = (layout + 1) % LAYOUTS.length;
  // Each new layout also rotates which window takes which slot.
  wins.forEach((w) => (w.slot = (w.slot + 1) % wins.length));
  relayout(true);
};
const startAuto = (): void => {
  clearInterval(auto);
  if (!reduced()) auto = window.setInterval(next, 2600);
};
$("shuffle").addEventListener("click", () => { next(); startAuto(); });
startAuto();

// Held drag: a pressed window sits exactly under the pointer (hold); on release it swaps with the slot under it.
let grab: { w: Win; dx: number; dy: number } | null = null;
demo.addEventListener("pointerdown", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".dw");
  const w = wins.find((x) => x.el === el);
  if (!w || e.button !== 0) return;
  e.preventDefault();
  clearInterval(auto);
  const r = demo.getBoundingClientRect(), d = w.settle.value;
  grab = { w, dx: e.clientX - r.left - d.x, dy: e.clientY - r.top - d.y };
  w.held = true;
  w.el.classList.add("held");
  demo.setPointerCapture(e.pointerId);
});
demo.addEventListener("pointermove", (e) => {
  if (!grab) return;
  const r = demo.getBoundingClientRect(), d = grab.w.settle.value;
  grab.w.settle.hold({ x: e.clientX - r.left - grab.dx, y: e.clientY - r.top - grab.dy, width: d.width, height: d.height });
  paint(grab.w);
  showReadout();
});
const release = (e: PointerEvent): void => {
  if (!grab) return;
  const g = grab;
  grab = null;
  const r = demo.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top };
  const over = wins.find((w) => w !== g.w && p.x >= w.target.x && p.x <= w.target.x + w.target.width && p.y >= w.target.y && p.y <= w.target.y + w.target.height);
  if (over) [over.slot, g.w.slot] = [g.w.slot, over.slot];
  g.w.held = false;
  g.w.el.classList.remove("held");
  // The released window settles from where it was let go; the other one from where it is drawn.
  relayout(true);
  startAuto();
};
demo.addEventListener("pointerup", release);
demo.addEventListener("pointercancel", release);

// ---- Thumbnails -----------------------------------------------------------------------------------------------------
/** Run `step(ms)` every frame while `el` is on screen (and motion is allowed). */
function whileVisible(el: Element, period: number, step: (ms: number) => void): void {
  if (reduced()) return;
  let stop: (() => void) | null = null, t0 = 0;
  new IntersectionObserver(([entry]) => {
    if (entry!.isIntersecting && !stop) {
      t0 = performance.now();
      stop = loop.repeat("write", () => { step((performance.now() - t0) % period); return true; });
    } else if (!entry!.isIntersecting && stop) {
      stop();
      stop = null;
    }
  }).observe(el);
}

// 1 · Window motion: settle against a spring that overshoots, with a playhead.
{
  const svg = $("thumb-motion");
  const head = svg.querySelector(".t-head")!, d1 = svg.querySelector(".t-dot-other")!, d2 = svg.querySelector(".t-dot")!;
  whileVisible(svg, 2400, (t) => {
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
  const stage = $("thumb-drag"), chip = stage.querySelector<HTMLElement>(".t-chip")!, ind = stage.querySelector<HTMLElement>(".t-ind")!;
  const HOMEP: Point = { x: 14, y: 99 }, SLOT: Point = { x: 195, y: 60 }, aimAt: Point = { x: 186, y: 55 };
  const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const settleAt = (from: Point, to: Point, ms: number): Point => { const k = Math.exp((-25 * ms) / 1000); return { x: to.x + (from.x - to.x) * k, y: to.y + (from.y - to.y) * k }; };
  whileVisible(stage, 3600, (t) => {
    let p: Point, on = false, lifted = true;
    if (t < 300) { p = HOMEP; lifted = false; }
    else if (t < 900) { const f = ease((t - 300) / 600); p = { x: HOMEP.x + (aimAt.x - HOMEP.x) * f, y: HOMEP.y + (aimAt.y - HOMEP.y) * f - Math.sin(f * Math.PI) * 40 }; }
    else if (t < 1500) { const f = (t - 900) / 600; p = { x: aimAt.x + 6 * f, y: aimAt.y + 3 * f }; on = t > 1060; }
    else if (t < 2500) { p = settleAt({ x: aimAt.x + 6, y: aimAt.y + 3 }, SLOT, t - 1500); lifted = false; }
    else { p = settleAt(SLOT, HOMEP, t - 2500); lifted = false; }
    chip.style.transform = `translate(${p.x}px, ${p.y}px)`;
    chip.classList.toggle("lifted", lifted);
    ind.classList.toggle("on", on);
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
  if (!reduced()) window.setInterval(() => { floating = !floating; set(floating ? DESK_B : DESK_A, true); }, 2400);
}

// 4 · Toolbar groups: groups trade places behind their handles.
{
  const bar = $("thumb-bar");
  if (!reduced()) window.setInterval(() => {
    const groups = [...bar.querySelectorAll<HTMLElement>(".t-group")];
    flip(groups, () => bar.insertBefore(groups[groups.length - 1]!, groups[0]!));
  }, 2000);
}
