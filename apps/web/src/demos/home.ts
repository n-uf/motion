/**
 * The home page's live demo and thumbnails: the three windows and their layouts, the settle-versus-spring curve and
 * the two desk states. Strings and plain data, so the server renders every first frame and the island animates them.
 */
import { createSettle, type Rect } from "@n-uf/motion";

// ---- The hero demo -------------------------------------------------------------------------------------------------
type Slot = (W: number, H: number) => Rect;
const GAP = 10, PAD = 12;
export const DEMO = { w: 1198, h: 380 };
export const LAYOUTS: { name: string; slots: Slot[] }[] = [
  {
    name: "Master and stack",
    slots: [
      (W, H) => ({ x: PAD, y: PAD, width: Math.round((W - 2 * PAD - GAP) * 0.58), height: H - 2 * PAD }),
      (W, H) => { const mw = Math.round((W - 2 * PAD - GAP) * 0.58); return { x: PAD + mw + GAP, y: PAD, width: W - 2 * PAD - GAP - mw, height: (H - 2 * PAD - GAP) / 2 }; },
      (W, H) => { const mw = Math.round((W - 2 * PAD - GAP) * 0.58); return { x: PAD + mw + GAP, y: PAD + (H - 2 * PAD - GAP) / 2 + GAP, width: W - 2 * PAD - GAP - mw, height: (H - 2 * PAD - GAP) / 2 }; },
    ],
  },
  {
    name: "Columns",
    slots: [0, 1, 2].map((i): Slot => (W, H) => { const cw = (W - 2 * PAD - 2 * GAP) / 3; return { x: PAD + i * (cw + GAP), y: PAD, width: cw, height: H - 2 * PAD }; }),
  },
  {
    name: "Dwindle",
    slots: [
      (W, H) => ({ x: PAD, y: PAD, width: W - 2 * PAD, height: Math.round((H - 2 * PAD - GAP) * 0.52) }),
      (W, H) => { const th = Math.round((H - 2 * PAD - GAP) * 0.52); return { x: PAD, y: PAD + th + GAP, width: Math.round((W - 2 * PAD - GAP) * 0.42), height: H - 2 * PAD - GAP - th }; },
      (W, H) => { const th = Math.round((H - 2 * PAD - GAP) * 0.52), lw = Math.round((W - 2 * PAD - GAP) * 0.42); return { x: PAD + lw + GAP, y: PAD + th + GAP, width: W - 2 * PAD - GAP - lw, height: H - 2 * PAD - GAP - th }; },
    ],
  },
];
export const WINDOWS = [
  { title: "Quarterly plan.pdf", meta: "P 02/04", rows: 7 },
  { title: "Meeting notes", meta: "Thu", rows: 4 },
  { title: "Budget draft", meta: "v3", rows: 4 },
];
/** A window's inner markup: frame, then the body laid out at its target size. */
export function demoWindowHTML(i: number): string {
  const w = WINDOWS[i]!;
  return `<div class="dw-frame"></div><div class="dw-body"><div class="dw-bar"><span class="dw-grip"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="dw-title">${w.title}</span><span class="dw-meta">${w.meta}</span></div><div class="dw-lines">${"<i></i>".repeat(w.rows)}</div></div>`;
}
/** The first layout as percentages of the demo box, so the server's first frame fits any width. */
export function firstLayoutStyle(i: number): string {
  const r = LAYOUTS[0]!.slots[i]!(DEMO.w, DEMO.h);
  const pc = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
  return `left:${pc(r.x, DEMO.w)};top:${pc(r.y, DEMO.h)};width:${pc(r.width, DEMO.w)};height:${pc(r.height, DEMO.h)}`;
}

/** Where a settle at the default tempo crosses 90 %, in ms (stepped by the library, read between 1 ms steps). */
export function ninetyPercentMs(): number {
  const s = createSettle(0, { restDelta: 1e-4 });
  s.setTarget(1);
  let t = 0, prev = 0;
  while (s.value < 0.9) { prev = s.value; s.step(1); t++; }
  return Math.round(t - 1 + (0.9 - prev) / (s.value - prev));
}

// ---- Thumbnail 1: settle against a spring that overshoots ----------------------------------------------------------
export const CURVE = { W: 280, H: 150, L: 16, R: 16, T: 22, B: 18, Tms: 450 };
const cx = (ms: number) => CURVE.L + ((CURVE.W - CURVE.L - CURVE.R) * ms) / CURVE.Tms;
const cy = (v: number) => CURVE.T + (CURVE.H - CURVE.T - CURVE.B) * (1 - v / 1.12);
function curves(): { settle: [number, number][]; spring: [number, number][] } {
  const s = createSettle(0, { omega: 25, restDelta: 1e-5 });
  s.setTarget(1);
  const settle: [number, number][] = [[0, 0]];
  for (let ms = 5; ms <= CURVE.Tms; ms += 5) { s.step(5); settle.push([ms, s.value]); }
  const over = (ms: number): number => { const t = ms / 1000, z = 0.45, w = 22; const wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t)); };
  const spring: [number, number][] = [];
  for (let ms = 0; ms <= CURVE.Tms; ms += 5) spring.push([ms, over(ms)]);
  return { settle, spring };
}
export const CURVES = curves();
/** A curve's value at `ms`. */
export const curveAt = (d: [number, number][], ms: number): number => d[Math.min(d.length - 1, Math.round(ms / 5))]![1];
export const curvePoint = (d: [number, number][], ms: number) => ({ x: cx(ms), y: cy(curveAt(d, ms)) });
export function curveSVG(ms: number): string {
  const path = (d: [number, number][]): string => d.map((p, i) => (i ? "L" : "M") + cx(p[0]).toFixed(1) + " " + cy(p[1]).toFixed(1)).join(" ");
  const a = curvePoint(CURVES.spring, ms), b = curvePoint(CURVES.settle, ms);
  return `<line x1="${CURVE.L}" x2="${CURVE.W - CURVE.R}" y1="${cy(1).toFixed(1)}" y2="${cy(1).toFixed(1)}" class="t-target"/>` +
    `<path d="${path(CURVES.spring)}" class="t-other"/><path d="${path(CURVES.settle)}" class="t-settle"/>` +
    `<line class="t-head" x1="${cx(ms).toFixed(1)}" x2="${cx(ms).toFixed(1)}" y1="${CURVE.T - 6}" y2="${CURVE.H - CURVE.B}"/>` +
    `<circle r="4" class="t-dot-other" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}"/><circle r="4.5" class="t-dot" cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}"/>`;
}
export const curveX = cx;

// ---- Thumbnail 3: the same desk built two ways ------------------------------------------------------------------------
export const DESK_A: Record<string, Rect> = {
  railL: { x: 0, y: 0, width: 14, height: 150 }, railR: { x: 266, y: 0, width: 14, height: 150 },
  p1: { x: 18, y: 4, width: 58, height: 70 }, p2: { x: 18, y: 78, width: 58, height: 68 },
  p3: { x: 204, y: 4, width: 58, height: 142 },
  d1: { x: 80, y: 26, width: 66, height: 120 }, d2: { x: 150, y: 26, width: 50, height: 120 },
  bar: { x: 104, y: 6, width: 72, height: 14 },
};
export const DESK_B: Record<string, Rect> = {
  railL: { x: 0, y: 0, width: 0, height: 150 }, railR: { x: 280, y: 0, width: 0, height: 150 },
  p1: { x: 12, y: 30, width: 54, height: 40 }, p2: { x: 12, y: 74, width: 54, height: 30 },
  p3: { x: 214, y: 30, width: 54, height: 60 },
  d1: { x: 4, y: 24, width: 150, height: 122 }, d2: { x: 158, y: 24, width: 118, height: 122 },
  bar: { x: 104, y: 4, width: 72, height: 14 },
};
export const deskKind = (k: string): string => (k.startsWith("rail") ? "t-rail" : k.startsWith("d") ? "t-doc" : k === "bar" ? "t-pill" : "t-panel");
export function deskThumbSVG(): string {
  return Object.entries(DESK_A).map(([k, r]) => `<rect data-k="${k}" rx="${k === "bar" ? 7 : 4}" class="${deskKind(k)}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`).join("");
}
