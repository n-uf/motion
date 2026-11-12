/**
 * Poster (island): the seam of "What each package does" (components/Poster.astro). The words are real text in the HTML;
 * this measures how the server flowed them, then places every word by transform, and re-flows them as the seam moves:
 *
 * - **The left words glide.** Each is a real `@n-uf/motion` settle (`newSettle` on the site's frame loop, `drive`), so
 *   a new place is reached from where the word is drawn, never past it; under reduced motion the word is there at once.
 * - **The right words are placed at once**, with their line rects and overall dimensions drawn next to them, and a
 *   pointer over the block names its zone with `paneZone` (`@n-uf/placement/targets`), whose centre comes from
 *   `paneCentre`: placement answers where, and nothing animates.
 * - The word flow itself (greedy wrapping at a width) and the dimension lines are measured from the DOM: decoration.
 *
 * Wide: the seam is a draggable separator (arrow keys move it by 24 px). Narrow (860 px and under): the two lines stack and
 * the same seam is a slider that sets how wide both may run. A showcase moves it by itself (registered with the page's
 * showcase controller, so a visitor's action pauses it); reduced motion has none, and the poster stays as the server drew it.
 */
import type { Point, Rect } from "@n-uf/motion";
import { paneCentre, paneZone, type PaneZone } from "@n-uf/placement/targets";
import { drive, newSettle, omega, onMotionChange, reduced } from "./motion";
import { simulateRun } from "../demos/hero";
import { registerShowcase, setDragging, userAction } from "./showcase";

const SVGNS = "http://www.w3.org/2000/svg";
const PAD = 28, GUT = 28;

interface Word { el: HTMLElement; w: number }
interface Placed { x: number; y: number; w: number; h: number; line: number; n: number }

export function startPoster(poster: HTMLElement): void {
  const $ = <T extends Element>(sel: string): T => poster.querySelector(sel) as T;
  const pm = $<HTMLElement>("#pm"), pp = $<HTMLElement>("#pp"), seam = $<HTMLElement>("#pseam"), range = $<HTMLInputElement>("#prange");
  const dims = $<SVGGElement>("#pdims"), zones = $<SVGGElement>("#pzones"), tgs = $<SVGGElement>("#ptg");
  const mk = (n: string, a: Record<string, string | number>, p?: Element): SVGElement => {
    const e = document.createElementNS(SVGNS, n);
    for (const k in a) e.setAttribute(k, String(a[k]));
    p?.append(e);
    return e as SVGElement;
  };
  const stacked = (): boolean => poster.clientWidth <= 860;

  // ---- Adopt the words: measure the server's flow once, then place each word by transform --------------------------------------
  const pb = poster.getBoundingClientRect();
  const groups = [pm, pp].map((box) => {
    const els = [...box.querySelectorAll<HTMLElement>(".pw")];
    const rects = els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left - pb.left, y: r.top - pb.top, w: r.width, h: r.height }; });
    return { els, rects, words: els.map((el, i): Word => ({ el, w: rects[i]!.w })) };
  });
  const LH = groups[0]!.rects[0]!.h;
  const probe = document.createElement("span");
  probe.className = "pw";
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  probe.textContent = "a a";
  pm.append(probe);
  const w2 = probe.getBoundingClientRect().width;
  probe.textContent = "aa";
  const SP = w2 - probe.getBoundingClientRect().width;
  probe.remove();
  /** Where each block's first line sits: the CSS tops (wide 88 and 88, stacked 48 and 324), plus the line box's own offset as measured. */
  const nominal = (st: boolean): number[] => (st ? [48, 324] : [88, 88]);
  const lineOffset = groups[0]!.rects[0]!.y - nominal(poster.clientWidth <= 860)[0]!;
  const topOf = { 0: 0, 1: 0 } as Record<number, number>;
  const syncTops = (): void => { nominal(stacked()).forEach((t, i) => (topOf[i] = t + lineOffset)); };
  syncTops();
  const P0 = poster.clientWidth;

  /** Greedy flow of `ws` at width `W` from (x0, y0). */
  function flow(ws: readonly Word[], W: number, x0: number, y0: number): Placed[] {
    let line = 0, x = 0;
    const out: { line: number; x: number; w: number }[] = [];
    ws.forEach((word) => {
      if (x > 0 && x + SP + word.w > W) { line++; x = 0; }
      const px = x ? x + SP : 0;
      out.push({ line, x: x0 + px, w: word.w });
      x = px + word.w;
    });
    const n = line + 1;
    return out.map((o) => ({ x: o.x, y: y0 + o.line * LH, w: o.w, h: LH, line: o.line, n }));
  }
  const maxL = Math.max(...groups[0]!.words.map((w) => w.w)), maxR = Math.max(...groups[1]!.words.map((w) => w.w));
  const lay = { m: [] as Placed[], p: [] as Placed[] };
  /** The seam's value: wide, its x (the left of the right half); stacked, the width both lines may run. */
  let S = stacked() ? P0 - 2 * 20 : Math.round(P0 / 2);
  function range_(): [number, number] {
    if (stacked()) return [Math.ceil(Math.max(maxL, maxR)) + 4, poster.clientWidth - 40];
    let lo = 1e9, hi = 0;
    for (let s = Math.round(poster.clientWidth * 0.36); s <= Math.round(poster.clientWidth * 0.68); s += 4) {
      const a = flow(groups[0]!.words, s - GUT - PAD, PAD, topOf[0]!), b = flow(groups[1]!.words, poster.clientWidth - PAD - (s + GUT), s + GUT, topOf[1]!);
      if (maxL <= s - GUT - PAD && maxR <= poster.clientWidth - PAD - (s + GUT) && a[0]!.n <= 4 && b[0]!.n <= 4) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
    }
    return [lo, hi];
  }
  function layout(): void {
    const P = poster.clientWidth;
    syncTops();
    if (stacked()) {
      lay.m = flow(groups[0]!.words, S, 20, topOf[0]!);
      lay.p = flow(groups[1]!.words, S, 20, topOf[1]!);
    } else {
      lay.m = flow(groups[0]!.words, S - GUT - PAD, PAD, topOf[0]!);
      lay.p = flow(groups[1]!.words, P - PAD - (S + GUT), S + GUT, topOf[1]!);
    }
  }
  layout();

  // ---- One settle per left word; the right is set at once ------------------------------------------------------------------------
  const lean: Point[] = groups[0]!.els.map(() => ({ x: 0, y: 0 }));
  const drawAt = (el: HTMLElement) => (p: Point): void => void (el.style.transform = `translate(${p.x}px, ${p.y}px)`);
  const L = groups[0]!.els.map((el, i) => {
    const s = newSettle<Point>({ x: lay.m[i]!.x, y: lay.m[i]!.y });
    const t = mk("rect", { class: "tg", rx: 6, opacity: 0 }, tgs);
    const d = drawAt(el);
    return { el, s, t, stop: null as (() => void) | null, draw: (p: Point): void => { d(p); const g = s.target, dist = Math.hypot(p.x - g.x, p.y - g.y); t.setAttribute("opacity", String(dist > 4 ? Math.min(1, dist / 24) : 0)); } };
  });
  const R = groups[1]!.els.map((el) => ({ el, draw: drawAt(el) }));
  poster.classList.add("js");
  // The flow no longer lays the words out: put each exactly where the flow had it, then take over.
  groups[0]!.rects.forEach((r, i) => { L[i]!.s.jumpTo({ x: r.x, y: r.y }); L[i]!.draw({ x: r.x, y: r.y }); });
  groups[1]!.rects.forEach((r, i) => R[i]!.draw({ x: r.x, y: r.y }));
  const glide = (i: number): void => {
    const w = L[i]!;
    w.s.setTarget({ x: lay.m[i]!.x + lean[i]!.x, y: lay.m[i]!.y + lean[i]!.y });
    w.stop?.();
    w.stop = drive(w.s, w.draw, () => { w.stop = null; });
  };

  // ---- Placement's side: the rects and dimensions, drawn at once; the pane zone under the pointer --------------------------
  let block: Rect | null = null;
  const dtext = (id: string, s: string): void => { const e = poster.querySelector(id); if (e) e.textContent = s; };
  function drawDims(): void {
    dims.textContent = "";
    const rs = lay.p, x0 = Math.min(...rs.map((r) => r.x)), x1 = Math.max(...rs.map((r) => r.x + r.w));
    const lines: Record<number, { x0: number; x1: number; y: number }> = {};
    rs.forEach((r) => { const l = (lines[r.line] ??= { x0: 1e9, x1: 0, y: r.y }); l.x0 = Math.min(l.x0, r.x); l.x1 = Math.max(l.x1, r.x + r.w); });
    Object.values(lines).forEach((l) => {
      mk("rect", { class: "dr", x: l.x0, y: l.y + 4, width: l.x1 - l.x0, height: LH - 10, rx: 3 }, dims);
      const t = mk("text", { class: "dt", x: Math.min(l.x1 + 7, poster.clientWidth - 70), y: l.y + LH / 2 + 2 }, dims);
      t.textContent = `${Math.round(l.x1 - l.x0)} × ${Math.round(LH - 10)}`;
    });
    const W = Math.round(x1 - x0), top = rs[0]!.y + 4, bot = rs[rs.length - 1]!.y + LH - 6;
    if (!stacked()) {
      mk("path", { class: "dl", d: `M${x0} ${top - 16}v9M${x1} ${top - 16}v9M${x0} ${top - 12}H${x1}` }, dims);
      const wl = mk("text", { class: "dt", x: (x0 + x1) / 2, y: top - 19, "text-anchor": "middle", style: "paint-order:stroke;stroke:var(--bg-sunken);stroke-width:5px" }, dims);
      wl.textContent = `W ${W}`;
    }
    block = { x: x0, y: top, width: x1 - x0, height: bot - top };
    dtext("#pro-w", `${Math.round(stacked() ? S : poster.clientWidth - PAD - (S + GUT))} px`);
    dtext("#pro-l", String(rs[0]!.n));
  }
  function drawTargets(): void {
    lay.m.forEach((r, i) => { const t = L[i]!.t; t.setAttribute("x", String(r.x - 4)); t.setAttribute("y", String(r.y + 4)); t.setAttribute("width", String(r.w + 8)); t.setAttribute("height", String(LH - 10)); });
  }
  function drawZones(p: Point | null): void {
    zones.textContent = "";
    if (!block || !p) return;
    const r = block, c = paneCentre({ width: r.width, height: r.height });
    const z: PaneZone = paneZone(r, p);
    const cx = r.x + c.left, cy = r.y + c.top, cw = c.right - c.left, ch = c.bottom - c.top;
    const pts = (a: number[][]): string => a.map((q) => q.join(",")).join(" ");
    const A = [r.x, r.y], B = [r.x + r.width, r.y], C = [r.x + r.width, r.y + r.height], D = [r.x, r.y + r.height];
    const a = [cx, cy], b = [cx + cw, cy], c2 = [cx + cw, cy + ch], d = [cx, cy + ch];
    const T: Record<string, number[][]> = { top: [A!, B!, b, a], right: [B!, C!, c2, b], bottom: [D!, C!, c2, d], left: [A!, D!, d, a] };
    for (const k in T) mk("polygon", { class: `zt${z === k ? " on" : ""}`, points: pts(T[k]!) }, zones);
    mk("rect", { class: `zc${z === "center" ? " on" : ""}`, x: cx, y: cy, width: cw, height: ch }, zones);
    const t = mk("text", { class: "zl", x: Math.min(p.x + 14, r.x + r.width - 40), y: p.y - 12 }, zones);
    t.textContent = z;
  }

  // ---- The seam ----------------------------------------------------------------------------------------------------------------------
  function setSeam(v: number): void {
    const [lo, hi] = range_();
    v = Math.max(lo, Math.min(hi, Math.round(v)));
    S = v;
    poster.style.setProperty("--sx", stacked() ? "0px" : `${S}px`);
    layout();
    L.forEach((_, i) => glide(i));
    R.forEach((w, i) => w.draw({ x: lay.p[i]!.x, y: lay.p[i]!.y }));
    drawDims();
    drawTargets();
    const share = Math.round(((S - lo) / Math.max(1, hi - lo)) * 100);
    seam.setAttribute("aria-valuenow", String(share));
    range.value = String(share);
    range.style.setProperty("--fill", `${share}%`);
  }
  const fromShare = (share: number): number => { const [lo, hi] = range_(); return lo + ((hi - lo) * share) / 100; };
  let held = false;
  seam.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    userAction();
    setDragging(true);
    held = true;
    seam.classList.add("held");
    seam.setPointerCapture(e.pointerId);
    const pr = poster.getBoundingClientRect(), off = e.clientX - pr.left - S;
    const move = (ev: PointerEvent): void => setSeam(ev.clientX - pr.left - off);
    const up = (): void => {
      held = false;
      seam.classList.remove("held");
      seam.removeEventListener("pointermove", move);
      seam.removeEventListener("pointerup", up);
      seam.removeEventListener("pointercancel", up);
      seam.removeEventListener("lostpointercapture", up);
      removeEventListener("blur", up);
      setDragging(false);
    };
    seam.addEventListener("pointermove", move);
    seam.addEventListener("pointerup", up);
    seam.addEventListener("pointercancel", up);
    seam.addEventListener("lostpointercapture", up);
    addEventListener("blur", up); // the window loses focus mid-drag (alt-tab): the drag ends here too, never stuck held
  });
  seam.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    userAction();
    setSeam(S + (e.key === "ArrowLeft" ? -24 : 24));
  });
  range.addEventListener("input", () => { userAction(); setSeam(fromShare(Number(range.value))); });

  // The pointer over the words: the left leans toward it with the settle; the right answers which zone, at once.
  poster.addEventListener("pointermove", (e) => {
    if (held || (e.target as Element).closest(".pseam, .pslider")) return;
    const pr = poster.getBoundingClientRect(), x = e.clientX - pr.left, y = e.clientY - pr.top;
    if (stacked()) {
      const m = 22, b = block;
      drawZones(b && x >= b.x - m && x <= b.x + b.width + m && y >= b.y - m && y <= b.y + b.height + m ? { x, y } : null);
      return;
    }
    if (x < S) {
      drawZones(null);
      if (reduced()) return;
      lay.m.forEach((r, i) => {
        const cx = r.x + r.w / 2, cy = r.y + LH / 2, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, k = 14 * Math.exp(-d / 240);
        lean[i] = { x: (dx / d) * k, y: (dy / d) * k };
        glide(i);
      });
    } else {
      lean.forEach((l, i) => { if (l.x || l.y) { lean[i] = { x: 0, y: 0 }; glide(i); } });
      const m = 22, b = block;
      drawZones(b && x >= b.x - m && x <= b.x + b.width + m && y >= b.y - m && y <= b.y + b.height + m ? { x, y } : null);
    }
  });
  poster.addEventListener("pointerleave", () => {
    drawZones(null);
    lean.forEach((l, i) => { if (l.x || l.y) { lean[i] = { x: 0, y: 0 }; glide(i); } });
  });

  // ---- The showcase: the seam moves by itself, a settle of one number, so both halves react ------------------------------------
  const sv = newSettle(S);
  let stopSv: (() => void) | null = null, timer = 0;
  const wait = (ms: number): Promise<void> => new Promise((res) => { timer = window.setTimeout(res, ms); });
  let alive = false;
  async function showcase(): Promise<void> {
    const [lo, hi] = range_();
    const stops = stacked() ? [lo + 4, hi, Math.round((lo + hi) / 2)] : [hi - 8, lo + 8, Math.round(poster.clientWidth / 2)];
    await wait(1500);
    while (alive) {
      for (const to of stops) {
        if (!alive) return;
        sv.jumpTo(S);
        sv.setTarget(to);
        stopSv?.();
        stopSv = drive(sv, (v) => setSeam(v));
        await wait(3000);
      }
      await wait(1200);
    }
  }
  registerShowcase(poster, {
    start() { alive = true; void showcase(); },
    stop() { alive = false; clearTimeout(timer); stopSv?.(); stopSv = null; },
  });

  // The left readout follows the tempo (the visitor's stored one, or a change): ω and the time to 90 % of a real run at it.
  const readout = (): void => {
    const w = omega();
    dtext("#pro-o", `settle ω ${w} /s`);
    const t90 = simulateRun({ x: 0, y: 0, width: 100, height: 60 }, { x: 240, y: 90, width: 100, height: 60 }, w).report.t90;
    dtext("#pro-t", `90 % in ${Math.round(t90 ?? 0)} ms`);
  };
  onMotionChange(readout);
  readout();

  new ResizeObserver(() => {
    // The viewport changed: the server's flow is gone, so re-flow at the same seam share.
    const [lo, hi] = range_();
    setSeam(Math.max(lo, Math.min(hi, S)));
  }).observe(poster);
  setSeam(S);
}
