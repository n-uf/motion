/**
 * Home hero (island): the two instruments of components/HeroScope.astro, run live on the packages themselves.
 *
 * - **The panel** is a real element carried by `@n-uf/motion/layout` (`createLayoutMotion` + `drawBox` on the site's
 *   frame loop): a move settles, a size change is revealed rather than stretched, and a drag holds it under the pointer
 *   (`holdItem`). Whether it shows a target, and which, is `@n-uf/motion/drag`'s `createDragIntent` and `previewPlan`.
 * - **The plan** is `@n-uf/placement`: its `createDesk` (the `dockTear` construction) lays the stage out, `deskTargets`
 *   offers the drop targets, `deskDrop` says where the panel lands. The plan is drawn from those rects at once.
 * - **The scope** reads the run off the real frames: each drawn rect of the panel is recorded and judged by
 *   `@n-uf/motion/testing` (`checkNoOvershoot`, `checkMonotonic`, `checkTempo`); the curve, the time to 90 % and the
 *   overshoot are what those frames did. The tempo is `SETTLE_TEMPO`, the speed the site's slow-motion clock.
 *
 * Only decoration is not the library: the dimension lines around the right headline (the headline's own measured line
 * boxes), the strobe dots (one per 1/60 s of the real run, placed at the drawn rect) and the grid grounds.
 *
 * The showcase (a panel crossing the seam into a target, again and again) is registered with the page's showcase
 * controller: a visitor's action pauses it, reduced motion has no auto-play (the finished still stays), and it stops
 * off screen. A drag ends on release, Escape, a cancelled pointer, a lost capture or the window losing focus.
 */
import type { Point, Rect } from "@n-uf/motion";
import { createDragIntent, previewPlan, type DragIntent, type DragTarget } from "@n-uf/motion/drag";
import { createLayoutMotion, drawBox, holdItem, type Drawable, type HeldDrag } from "@n-uf/motion/layout";
import type { RectSample } from "@n-uf/motion/testing";
import type { DeskTarget } from "@n-uf/placement/targets";
import { drive, getSpeed, getTempo, loop, newSettle, omega, onMotionChange, reduced, setSpeed, setTempo, type Tempo } from "./motion";
import { dropMode } from "./drop-mode";
import { registerShowcase, setDragging, userAction } from "./showcase";
import { NEEDLE, PLOT, TEMPOS, judge, pathOf, planOf, plotX, plotY, simulateRun, type RunReport } from "../demos/hero";

interface DeskDragTarget extends DragTarget {
  readonly target: DeskTarget;
}
type Where = { readonly kind: "pad" } | { readonly kind: "stage"; readonly slot: Rect };

const SPEED_FRAME_MS = 1000 / 60;

export function startHero(band: HTMLElement): void {
  const $ = <T extends Element>(sel: string): T => band.querySelector(sel) as T;
  const ov = $<HTMLElement>("#ov"), tokEl = $<HTMLElement>("#tok"), frameEl = $<HTMLElement>(".tok-frame"), bodyEl = $<HTMLElement>(".tok-body");
  const planEl = $<HTMLElement>("#plan"), padEl = $<HTMLElement>("#pad"), pind = $<HTMLElement>("#pind"), sayEl = $<HTMLElement>("#say");
  const liveEl = $<SVGPathElement>("#live"), markEl = $<SVGCircleElement>("#mark"), t90El = $<SVGTextElement>("#t90");
  const plan = planOf();
  const slotEls = [...band.querySelectorAll<HTMLElement>(".pslot")];
  const STAGE = plan.stage;

  // ---- Geometry: the plan's stage px to the overlay's px (the overlay is the band) ----------------------------------------
  let O: Point = { x: 0, y: 0 }, S = 1;
  let padRect: Rect = { x: 0, y: 0, width: 112, height: 64 };
  let targets: DeskDragTarget[] = [];
  const rel = (el: Element): Rect => {
    const b = ov.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - b.left, y: r.top - b.top, width: r.width, height: r.height };
  };
  const toOv = (r: Rect): Rect => ({ x: O.x + r.x * S, y: O.y + r.y * S, width: r.width * S, height: r.height * S });
  const fromOv = (p: Point): Point => ({ x: (p.x - O.x) / S, y: (p.y - O.y) / S });
  function measure(): void {
    const p = rel(planEl);
    O = { x: p.x + planEl.clientLeft, y: p.y + planEl.clientTop };
    S = planEl.clientWidth / STAGE.width;
    padRect = rel(padEl);
    targets = plan.targets.map((t) => ({ id: t.id, priority: t.priority, hit: toOv(t.hit), free: t.free, target: t }));
  }
  measure();

  // ---- The panel: a real element on the layout motion --------------------------------------------------------------------
  const startAt: Where = { kind: "stage", slot: plan.slots[1]!.drop.slot };
  const rectOf = (w: Where): Rect => (w.kind === "pad" ? padRect : toOv(w.slot));
  let where: Where = startAt;
  const motion = createLayoutMotion({ loop, omega: omega(), reducedMotion: reduced });
  // The library's own `drawBox` draws every frame; the box's place is a transform too (the node sits at 0, 0), so no frame
  // writes a left or a top and the page never records a layout shift for the panel.
  let bx = 0, by = 0;
  const nodes = { node: tokEl, frame: frameEl, content: bodyEl };
  const drawable: Drawable = {
    layOut(box) {
      bx = box.x;
      by = box.y;
      tokEl.style.width = `${box.width}px`;
      tokEl.style.height = `${box.height}px`;
    },
    draw(frame) {
      drawBox(nodes, frame);
      tokEl.style.transform = `translate(${bx}px, ${by}px) ${tokEl.style.transform}`;
    },
  };
  const item = motion.add("panel", drawable, rectOf(where));
  band.classList.add("go");

  // ---- What the plan says, drawn at once -----------------------------------------------------------------------------------
  // The indicator sits at the plan's origin and moves by transform (a left or top change would count as a layout shift).
  let indAt: Rect | null = null;
  const placeInd = (r: Rect): void => {
    indAt = r;
    pind.style.width = `${r.width * S}px`;
    pind.style.height = `${r.height * S}px`;
    pind.style.transform = `translate(${r.x * S}px, ${r.y * S}px)`;
  };
  const size = (r: Rect): string => `${Math.round(r.width)} × ${Math.round(r.height)}`;
  const same = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.01;
  const say = (html: string): void => void (sayEl.innerHTML = html);
  /** The indicator: where placement says the panel would land, with its label. `docked`: where it landed. */
  function indicate(drop: { slot: Rect; label: string } | null, docked = false): void {
    if (!drop) { pind.hidden = true; return; }
    placeInd(drop.slot);
    pind.classList.toggle("docked", docked);
    pind.firstElementChild!.textContent = docked ? "" : drop.label;
    pind.hidden = false;
  }
  slotEls.forEach((s) => s.classList.remove("docked")); // the indicator takes over from the server's docked slot
  const armed = (i: number): void => {
    const d = plan.slots[i]!.drop;
    indicate(d);
    say(`placement → <b>${d.label}</b> · rect ${size(d.slot)}`);
  };
  const docked = (i: number): void => {
    const d = plan.slots[i]!.drop;
    indicate(d, true);
    say(`docked · <b>${d.label}</b>`);
  };
  const clearPlan = (text = ""): void => { indicate(null); say(text); };

  // ---- The scope: a run read off the real frames ---------------------------------------------------------------------------
  interface Rec { samples: RectSample[]; from: Rect; to: Rect; t: number; omega: number; d: string; acc: number }
  let rec: Rec | null = null, last: RunReport | null = null, dots: HTMLElement[] = [], arrive: (() => void) | null = null;
  const stat = (id: string): HTMLElement => $<HTMLElement>(id);
  const showReport = (r: RunReport): void => {
    if (r.t90 !== null) {
      markEl.removeAttribute("visibility");
      markEl.setAttribute("cx", plotX(r.t90).toFixed(1));
      markEl.setAttribute("cy", plotY(0.9).toFixed(1));
      t90El.setAttribute("x", (plotX(r.t90) + 8).toFixed(1));
      t90El.setAttribute("y", (plotY(0.9) + 16).toFixed(1));
      t90El.textContent = `${Math.round(r.t90)} ms`;
      stat("#s90").textContent = `${Math.round(r.t90)} ms`;
    }
    const n = [r.checks.noOvershoot, r.checks.monotonic, r.checks.tempo].filter((c) => c.ok).length;
    stat("#sov").textContent = `${r.overshoot.toFixed(1)} px`;
    stat("#sov").className = r.checks.noOvershoot.ok ? "ok" : "bad";
    stat("#schk").textContent = `${n} of 3 pass`;
    stat("#schk").className = r.ok ? "ok" : "bad";
  };
  const resetPlot = (): void => {
    liveEl.setAttribute("d", "");
    markEl.setAttribute("visibility", "hidden");
    t90El.textContent = "";
  };
  function addDot(r: Rect): void {
    const d = document.createElement("i");
    d.className = "dot";
    d.style.transform = `translate(${r.x + r.width / 2}px, ${r.y + 11}px)`;
    ov.insertBefore(d, tokEl); // under the panel
    dots.push(d);
  }
  function fadeDots(): void {
    const ds = dots;
    dots = [];
    ds.forEach((d) => d.classList.add("f"));
    setTimeout(() => ds.forEach((d) => d.remove()), 2800);
  }
  /** A run starts: record the drawn rect now, and every frame until the motion rests. Call before `moveTo`. */
  function begin(to: Rect): void {
    rec = { samples: [{ t: 0, rect: { ...item.drawn } }], from: { ...item.drawn }, to: { ...to }, t: 0, omega: omega(), d: "", acc: 0 };
    resetPlot();
    stat("#sov").textContent = "0.0 px";
    stat("#sov").className = "ok";
  }
  motion.onFrame((frame) => {
    if (!rec) return;
    const d = item.drawn;
    rec.t += frame.delta;
    rec.samples.push({ t: rec.t, rect: { ...d } });
    const d0 = Math.hypot(rec.to.x - rec.from.x, rec.to.y - rec.from.y);
    const p = d0 > 0 ? 1 - Math.hypot(rec.to.x - d.x, rec.to.y - d.y) / d0 : 1;
    if (rec.t <= PLOT.tMax + 8) rec.d += `${rec.d ? "L" : "M"}${plotX(rec.t).toFixed(1)} ${plotY(Math.max(0, p)).toFixed(1)}`;
    liveEl.setAttribute("d", rec.d);
    // The strobe: one dot per 1/60 s of the run's own time, so slow motion keeps the spacing true.
    rec.acc += frame.delta;
    while (rec.acc >= SPEED_FRAME_MS) { rec.acc -= SPEED_FRAME_MS; addDot(d); }
    // The furthest past its range so far, live.
    let over = 0;
    for (const k of ["x", "y", "width", "height"] as const) over = Math.max(over, d[k] - Math.max(rec.from[k], rec.to[k]), Math.min(rec.from[k], rec.to[k]) - d[k]);
    stat("#sov").textContent = `${Math.max(0, over).toFixed(1)} px`;
  });
  function finish(): void {
    const r = rec;
    rec = null;
    if (r && r.samples.length > 2) {
      last = judge(r.samples, r.from, r.to, r.omega);
      showReport(last);
    }
    fadeDots();
    const f = arrive;
    arrive = null;
    f?.();
  }
  motion.onIdle(finish);

  // Aim at `to` from where the panel is drawn (a retarget mid-flight carries on, no jump).
  function launch(w: Where): void {
    where = w;
    const to = rectOf(w);
    begin(to);
    item.moveTo(to);
  }

  // ---- Dial, tempo and slow motion ---------------------------------------------------------------------------------------------
  const needle = newSettle(NEEDLE[getTempo()]);
  const drawNeedle = (v: number): void => $("#needle").setAttribute("transform", `rotate(${v} 70 70)`);
  let stopNeedle: (() => void) | null = null;
  const words = [...$<HTMLElement>("#hm").querySelectorAll<HTMLElement>(".hw")].map((el) => ({ el, s: newSettle<Point>({ x: 0, y: 0 }), stop: null as (() => void) | null }));
  const drawWord = (el: HTMLElement) => (p: Point): void => void (el.style.transform = p.x === 0 && p.y === 0 ? "" : `translate(${p.x}px, ${p.y}px)`);
  /** The left headline's words glide to their places from offsets: motion's headline, settled at the chosen tempo. */
  function entrance(): void {
    if (reduced()) return;
    words.forEach((w, i) => {
      w.stop?.();
      w.s.jumpTo({ x: i % 2 ? 56 : -56, y: 34 + (i % 3) * 10 });
      drawWord(w.el)(w.s.value);
      setTimeout(() => {
        w.s.setTarget({ x: 0, y: 0 });
        w.stop = drive(w.s, drawWord(w.el), () => { w.stop = null; });
      }, 60 + i * 55);
    });
  }
  let shownTempo: Tempo | null = null;
  function syncControls(): void {
    const t = getTempo(), w = omega();
    band.querySelectorAll<HTMLButtonElement>("[data-tempo]").forEach((b) => { if (b.closest("#tempo")) b.setAttribute("aria-pressed", String(b.dataset.tempo === t)); });
    band.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === getSpeed())));
    band.querySelectorAll<SVGPathElement>(".ghost").forEach((g) => g.classList.toggle("on", g.dataset.tempo === t));
    $("#gw").textContent = String(w);
    stat("#sw").textContent = `${w} /s`;
    if (shownTempo !== t) {
      const first = shownTempo === null;
      shownTempo = t;
      needle.setTarget(NEEDLE[t]);
      stopNeedle?.();
      if (first) { needle.jumpTo(NEEDLE[t]); drawNeedle(NEEDLE[t]); }
      else stopNeedle = drive(needle, drawNeedle);
      // The readings are the run at this tempo: one real run on the packages, drawn as the finished still.
      if (!rec) showStill(w);
      if (!first) entrance();
    }
  }
  onMotionChange(() => { motion.configure({ omega: omega() }); syncControls(); });
  band.querySelectorAll<HTMLButtonElement>("#tempo [data-tempo]").forEach((b) => b.addEventListener("click", () => setTempo(b.dataset.tempo as Tempo)));
  band.querySelectorAll<HTMLButtonElement>("#ts [data-speed]").forEach((b) => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));

  /** The scope's finished state at `w`: one run of the packages on a fake clock (what the server drew at the default tempo). */
  function showStill(w: number): void {
    const run = simulateRun({ x: 0, y: 0, width: 120, height: 64 }, { x: 300, y: 120, width: 120, height: 72 }, w);
    liveEl.setAttribute("d", pathOf(run.report.curve.filter((q) => q.ms <= PLOT.tMax + 8)));
    last = run.report;
    showReport(run.report);
  }

  // ---- The blueprint around the right headline: its own line boxes, dimensioned --------------------------------------------
  const bpl = $<HTMLElement>("#bpl"), hp = $<HTMLElement>("#hp");
  function blueprint(): void {
    bpl.textContent = "";
    // Stacked (860 px and under) the headlines sit over each other's text: no dimension lines there.
    if (band.clientWidth <= 860) return;
    const range = document.createRange();
    range.selectNodeContents(hp);
    const hb = band.getBoundingClientRect();
    const lines = [...range.getClientRects()].filter((q) => q.width > 4).map((q) => ({ x: q.left - hb.left, y: q.top - hb.top, w: q.width, h: q.height }));
    if (!lines.length) return;
    const add = (css: string, text = "", cls = ""): void => {
      const e = document.createElement("i");
      e.className = `bp ${cls}`;
      e.style.cssText = css;
      e.textContent = text;
      bpl.append(e);
    };
    const c = "color-mix(in srgb, var(--series-b) 70%, transparent)";
    const x0 = Math.min(...lines.map((l) => l.x)), x1 = Math.max(...lines.map((l) => l.x + l.w));
    const y0 = Math.min(...lines.map((l) => l.y)), y1 = Math.max(...lines.map((l) => l.y + l.h));
    lines.forEach((l) => {
      add(`left:${l.x}px;top:${l.y + 3}px;width:${l.w}px;height:${l.h - 6}px;border:1px dashed ${c};border-radius:3px;opacity:.55`);
      if (l.x + l.w + 70 < hb.width) add(`left:${l.x + l.w + 6}px;top:${l.y + l.h / 2 - 7}px`, `${Math.round(l.w)} × ${Math.round(l.h - 6)}`, "dim");
    });
    const W = Math.round(x1 - x0), H = Math.round(y1 - y0);
    add(`left:${x0}px;top:${y1 + 12}px;width:${W}px;height:9px;border-left:1px solid ${c};border-right:1px solid ${c}`);
    add(`left:${x0}px;top:${y1 + 16}px;width:${W}px;height:1px;background:${c}`);
    add(`left:${x0 + W / 2 - 34}px;top:${y1 + 9}px;width:68px`, `W ${W}`, "dim cut");
    if (x0 > 24) {
      add(`left:${x0 - 14}px;top:${y0}px;width:9px;height:${H}px;border-top:1px solid ${c};border-bottom:1px solid ${c}`);
      add(`left:${x0 - 10}px;top:${y0}px;width:1px;height:${H}px;background:${c}`);
    }
  }

  // ---- Drag: the panel under the pointer, the intent reading the aim ----------------------------------------------------------
  interface Drag { id: number; held: HeldDrag; intent: DragIntent<DeskDragTarget>; pointer: Point; stop: () => void }
  let drag: Drag | null = null;
  const localOf = (e: { clientX: number; clientY: number }): Point => {
    const b = ov.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const dropOf = (t: DeskDragTarget, p: Point) => plan.drop(t.target, fromOv(p));
  function dragFrame(d: Drag): void {
    const f = d.intent.update(d.pointer, performance.now(), targets);
    const shown = f.shown;
    const drop = shown ? dropOf(shown, d.pointer) : null;
    const pp = previewPlan(f, dropMode());
    const slot = pp.snapItem && drop ? toOv(drop.slot) : null;
    // A glide into a slot is a run like any other: record it from the frame it starts.
    if (slot && !(d.held.snapped && same(d.held.snapped, slot))) begin(slot);
    if (d.held.preview(pp, slot) === "left") rec = null;
    indicate(pp.showIndicator && drop ? drop : null);
    if (drop && pp.showIndicator) say(`placement → <b>${drop.label}</b> · rect ${size(drop.slot)}`);
    else if (drop) say(`placement → <b>${drop.label}</b> · motion carries the panel in`);
    else say(f.aiming || !targets.some((t) => t.hit.x <= d.pointer.x) ? "" : "moving fast · <b>no target shown</b>");
  }
  function endDrag(cancelled: boolean, e?: PointerEvent): void {
    const d = drag;
    if (!d) return;
    drag = null;
    d.stop();
    tokEl.classList.remove("held");
    try { if (e) frameEl.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const p = e ? localOf(e) : d.pointer;
    let target: DeskDragTarget | null = null;
    if (!cancelled) {
      d.intent.update(p, performance.now(), targets);
      target = d.intent.release(p, targets);
    }
    indicate(null);
    if (target) {
      const drop = dropOf(target, p);
      const slot = toOv(drop.slot);
      where = { kind: "stage", slot: drop.slot };
      // Already gliding into this slot (the snap preview): that run is the one on the scope.
      if (!(d.held.snapped && same(d.held.snapped, slot))) begin(slot);
      d.held.land(slot);
      arrive = () => { indicate(drop, true); say(`docked · <b>${drop.label}</b>`); };
      say(`placement → <b>${drop.label}</b> · motion lands it`);
    } else {
      where = { kind: "pad" };
      begin(padRect);
      d.held.cancel(padRect);
      say(cancelled ? "cancelled: it goes home" : "no target: it goes home");
      arrive = () => say("");
    }
    if (!motion.running) finish();
    setDragging(false);
  }
  frameEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag) return;
    e.preventDefault();
    setDragging(true); // pauses every showcase until the drag ends and 10 s after
    abortCycle();
    fadeDots();
    arrive = null;
    clearPlan();
    rec = null;
    const p = localOf(e), at = item.drawn;
    const held = holdItem(item, { x: p.x - at.x, y: p.y - at.y });
    const intent = createDragIntent<DeskDragTarget>({ home: padRect });
    held.move(p);
    tokEl.classList.add("held");
    frameEl.setPointerCapture(e.pointerId);
    const d: Drag = { id: e.pointerId, held, intent, pointer: p, stop: () => {} };
    d.stop = loop.repeat("input", () => { if (drag !== d) return false; dragFrame(d); return true; });
    drag = d;
  });
  frameEl.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.pointer = localOf(e);
    drag.held.move(drag.pointer);
  });
  frameEl.addEventListener("pointerup", (e) => { if (drag && e.pointerId === drag.id) endDrag(false, e); });
  frameEl.addEventListener("pointercancel", (e) => { if (drag && e.pointerId === drag.id) endDrag(true, e); });
  frameEl.addEventListener("lostpointercapture", () => endDrag(true));
  window.addEventListener("blur", () => endDrag(true));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") endDrag(true); });

  // ---- The showcase: placement arms a target at once, motion carries the panel there -----------------------------------------
  let ctl = { dead: false };
  const abortCycle = (): void => { ctl.dead = true; };
  const wait = (ms: number, c: { dead: boolean }): Promise<void> => new Promise((res, rej) => setTimeout(() => (c.dead ? rej(c) : res()), ms / getSpeed()));
  const until = (fn: () => boolean, c: { dead: boolean }): Promise<void> => new Promise((res, rej) => { const f = (): void => (c.dead ? rej(c) : fn() ? res() : void requestAnimationFrame(f)); f(); });
  const SEQUENCES = [[1], [0, 1], [2], [1, 2], [0]];
  const isDocked = (): boolean => !pind.hidden && pind.classList.contains("docked");
  async function home(c: { dead: boolean }): Promise<void> {
    if (where.kind === "pad" && !isDocked()) return;
    tokEl.classList.add("out");
    await wait(260, c);
    clearPlan();
    where = { kind: "pad" };
    item.jumpTo(padRect);
    resetPlot();
    await wait(60, c);
    tokEl.classList.remove("out");
  }
  async function cycle(n: number, c: { dead: boolean }): Promise<void> {
    const seq = SEQUENCES[n % SEQUENCES.length]!;
    armed(seq[0]!);
    await wait(900, c);
    launch({ kind: "stage", slot: plan.slots[seq[0]!]!.drop.slot });
    if (seq.length > 1) {
      // A new rect mid-flight: placement answers again, and the settle turns at once from where it is drawn.
      await until(() => !!rec && rec.t > 45, c);
      armed(seq[1]!);
      launch({ kind: "stage", slot: plan.slots[seq[1]!]!.drop.slot });
      say(`placement → <b>${plan.slots[seq[1]!]!.drop.label}</b> · a new rect, mid-flight`);
    }
    await motion.idle();
    await wait(160, c);
    fadeDots();
    docked(seq[seq.length - 1]!);
    await wait(2300, c);
    await home(c);
    await wait(1000, c);
  }
  async function showcaseLoop(c: { dead: boolean }): Promise<void> {
    try {
      await wait(1800, c);
      await home(c);
      await wait(800, c);
      for (let n = 0; ; n++) await cycle(n, c);
    } catch (e) {
      if (e !== c) throw e;
    }
  }

  // ---- The finished still: what reduced motion shows, and the state a stopped showcase leaves ---------------------------------
  function still(): void {
    abortCycle();
    fadeDots();
    where = startAt;
    item.jumpTo(rectOf(where));
    tokEl.classList.remove("out");
    const run = simulateRun({ x: 0, y: 0, width: 120, height: 64 }, rectOf(where), omega());
    dots.forEach((d) => d.remove());
    dots = [];
    const from = padRect, to = rectOf(where);
    // The trail: one dot per frame of the real run, placed by its progress along the way.
    run.report.curve.slice(1, 30).forEach((q) => addDot({ x: from.x + (to.x - from.x) * q.p, y: from.y + (to.y - from.y) * q.p, width: from.width + (to.width - from.width) * q.p, height: 0 }));
    dots.forEach((d) => { d.style.transition = "none"; d.style.opacity = ".55"; });
    docked(1);
  }

  registerShowcase(band, {
    start() {
      dots.forEach((d) => d.remove());
      dots = [];
      ctl = { dead: false };
      void showcaseLoop(ctl);
    },
    stop() {
      abortCycle();
    },
  });

  // ---- Start ----------------------------------------------------------------------------------------------------------------------
  new ResizeObserver(() => {
    measure();
    blueprint();
    if (indAt) placeInd(indAt);
    if (drag) return;
    const to = rectOf(where);
    // A run in flight is re-aimed: record it afresh against the new target, or the scope would judge the old one.
    if (motion.running) {
      begin(to);
      item.moveTo(to);
    } else item.jumpTo(to);
  }).observe(band);
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
    if (reduced()) still();
    else userAction();
  });
  syncControls();
  blueprint();
  if (reduced()) still();
  else docked(1);

  (window as unknown as Record<string, unknown>).__hero = {
    report: () => last,
    state: () => ({ drag: !!drag, where, rec: !!rec, running: motion.running, drawn: { ...item.drawn }, targets: targets.map((t) => t.id) }),
    tempos: TEMPOS,
  };
}
