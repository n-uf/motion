/**
 * Home hero (island): the scope of components/HeroScope.astro (motion's slot), run live on the package itself. The other
 * two slots have their own islands (islands/hero-pop.ts, islands/hero-dock.ts).
 *
 * - **The panel** is a real element carried by `@n-uf/motion/layout` (`createLayoutMotion` + `drawBox` on the site's
 *   frame loop) between two pads: a move settles, a size change is revealed rather than stretched, and a drag holds it
 *   under the pointer (`holdItem`) until it lands on the pad nearest where it was let go.
 * - **The scope** reads the run off the real frames: each drawn rect of the panel is recorded and judged by
 *   `@n-uf/motion/testing` (`checkNoOvershoot`, `checkMonotonic`, `checkTempo`); the curve, the time to 90 % and the
 *   overshoot are what those frames did. The tempo is `SETTLE_TEMPO`, the speed the site's slow-motion clock.
 *
 * Only decoration is not the library: the dimension lines around the docking headline (the headline's own measured line
 * boxes), the strobe dots (one per 1/60 s of the real run, placed at the drawn rect) and the grid grounds.
 *
 * The showcase (the panel carried from one pad to the other, again and again) is registered with the page's showcase
 * controller: a visitor's action pauses it, reduced motion has no auto-play (the finished still stays), and it stops
 * off screen. A drag ends on release, Escape, a cancelled pointer, a lost capture or the window losing focus.
 */
import type { Point, Rect } from "@n-uf/motion";
import { createLayoutMotion, drawBox, holdItem, type Drawable, type HeldDrag } from "@n-uf/motion/layout";
import type { RectSample } from "@n-uf/motion/testing";
import { drive, getSpeed, getTempo, loop, newSettle, omega, onMotionChange, reduced, setSpeed, setTempo, type Tempo } from "./motion";
import { registerShowcase, setDragging, userAction } from "./showcase";
import { NEEDLE, PLOT, TEMPOS, judge, pathOf, plotX, plotY, simulateRun, type RunReport } from "../demos/hero";

/** The two pads the panel rests on: where it is held, and where it lands. */
type Pad = "a" | "b";

const SPEED_FRAME_MS = 1000 / 60;

export function startHero(band: HTMLElement): void {
  const $ = <T extends Element>(sel: string): T => band.querySelector(sel) as T;
  const ov = $<HTMLElement>("#ov"), tokEl = $<HTMLElement>("#tok"), frameEl = $<HTMLElement>(".tok-frame"), bodyEl = $<HTMLElement>(".tok-body");
  const padEls: Record<Pad, HTMLElement> = { a: $<HTMLElement>("#pad"), b: $<HTMLElement>("#pad2") };
  const liveEl = $<SVGPathElement>("#live"), markEl = $<SVGCircleElement>("#mark"), t90El = $<SVGTextElement>("#t90");

  // ---- Geometry: the pads' rects in the overlay's px (the overlay is the band) --------------------------------------------
  let pads: Record<Pad, Rect> = { a: { x: 0, y: 0, width: 96, height: 64 }, b: { x: 0, y: 0, width: 96, height: 64 } };
  const rel = (el: Element): Rect => {
    const b = ov.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - b.left, y: r.top - b.top, width: r.width, height: r.height };
  };
  const measure = (): void => void (pads = { a: rel(padEls.a), b: rel(padEls.b) });
  measure();

  // ---- The panel: a real element on the layout motion --------------------------------------------------------------------
  const rectOf = (p: Pad): Rect => pads[p];
  let where: Pad = "b";
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

  // Aim at `to` from where the panel is drawn (a retarget mid-flight carries on, no jump).
  function launch(w: Pad): void {
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

  // ---- The blueprint around the docking headline: its own line boxes, dimensioned --------------------------------------------
  const bpl = $<HTMLElement>("#bpl"), hp = $<HTMLElement>("#hd");
  function blueprint(): void {
    bpl.textContent = "";
    // Stacked (1100 px and under) the headlines sit over each other's text: no dimension lines there.
    if (band.clientWidth <= 1100) return;
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
    const c = "color-mix(in srgb, var(--dock) 70%, transparent)";
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

  // ---- Drag: the panel under the pointer; let go, and it settles on the nearer pad -------------------------------------------------
  interface Drag { id: number; held: HeldDrag; pointer: Point }
  let drag: Drag | null = null;
  const localOf = (e: { clientX: number; clientY: number }): Point => {
    const b = ov.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  /** The pad whose middle is nearer the held panel's middle. */
  const nearer = (d: Drag): Pad => {
    const h = d.held.held ?? item.drawn;
    const mid = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
    const dist = (p: Pad): number => Math.hypot(pads[p].x + pads[p].width / 2 - mid.x, pads[p].y + pads[p].height / 2 - mid.y);
    return dist("a") <= dist("b") ? "a" : "b";
  };
  function endDrag(cancelled: boolean, e?: PointerEvent): void {
    const d = drag;
    if (!d) return;
    drag = null;
    tokEl.classList.remove("held");
    try { if (e) frameEl.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    // Cancelled: back where it was lifted from. Released: on the pad it is nearer to.
    const pad = cancelled ? where : nearer(d);
    where = pad;
    begin(rectOf(pad));
    d.held.land(rectOf(pad));
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
    rec = null;
    const p = localOf(e), at = item.drawn;
    const held = holdItem(item, { x: p.x - at.x, y: p.y - at.y });
    held.move(p);
    tokEl.classList.add("held");
    frameEl.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, held, pointer: p };
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

  // ---- The showcase: motion carries the panel from one pad to the other --------------------------------------------------------
  let ctl = { dead: false };
  const abortCycle = (): void => { ctl.dead = true; };
  const wait = (ms: number, c: { dead: boolean }): Promise<void> => new Promise((res, rej) => setTimeout(() => (c.dead ? rej(c) : res()), ms / getSpeed()));
  const until = (fn: () => boolean, c: { dead: boolean }): Promise<void> => new Promise((res, rej) => { const f = (): void => (c.dead ? rej(c) : fn() ? res() : void requestAnimationFrame(f)); f(); });
  /** Each cycle's stops: now and then a new rect arrives mid-flight, and the settle turns at once from where it is drawn. */
  const SEQUENCES: Pad[][] = [["a"], ["b"], ["a", "b", "a"], ["b"]];
  async function cycle(n: number, c: { dead: boolean }): Promise<void> {
    const seq = SEQUENCES[n % SEQUENCES.length]!;
    for (const [i, pad] of seq.entries()) {
      launch(pad);
      if (i < seq.length - 1) await until(() => !!rec && rec.t > 45, c);
    }
    await motion.idle();
    await wait(160, c);
    fadeDots();
    await wait(1900, c);
  }
  async function showcaseLoop(c: { dead: boolean }): Promise<void> {
    try {
      await wait(1800, c);
      for (let n = 0; ; n++) await cycle(n, c);
    } catch (e) {
      if (e !== c) throw e;
    }
  }

  // ---- The finished still: what reduced motion shows, and the state a stopped showcase leaves ---------------------------------
  function still(): void {
    abortCycle();
    fadeDots();
    where = "b";
    item.jumpTo(rectOf(where));
    tokEl.classList.remove("out");
    const run = simulateRun({ x: 0, y: 0, width: 120, height: 64 }, rectOf(where), omega());
    dots.forEach((d) => d.remove());
    dots = [];
    const from = pads.a, to = rectOf(where);
    // The trail: one dot per frame of the real run, placed by its progress along the way.
    run.report.curve.slice(1, 30).forEach((q) => addDot({ x: from.x + (to.x - from.x) * q.p, y: from.y + (to.y - from.y) * q.p, width: from.width + (to.width - from.width) * q.p, height: 0 }));
    dots.forEach((d) => { d.style.transition = "none"; d.style.opacity = ".55"; });
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
    if (drag) return;
    const to = rectOf(where);
    // A run in flight is re-aimed: record it afresh against the new target, or the scope would judge the old one.
    if (running) {
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

  (window as unknown as Record<string, unknown>).__hero = {
    report: () => last,
    state: () => ({ drag: !!drag, where, rec: !!rec, running: motion.running, drawn: { ...item.drawn } }),
    tempos: TEMPOS,
  };
}
