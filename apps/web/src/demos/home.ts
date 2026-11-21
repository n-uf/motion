/**
 * The home page's thumbnails: the settle-versus-spring curve and the desk preview. Strings and plain data, so the server
 * renders them. (The live demo is the lab's Document window, mounted by islands/home.ts; it has no data here.)
 */
import { createSettle, createSpring, type Rect } from "@n-uf/motion";

/** The live demo's status line at rest: written by the server, and again by the island after a Reset, so nothing moves when it starts. */
export const HINT = "Drag a panel by its header or a toolbar by its dots, and drop it beside another, on a side or in a bar.";

// ---- Thumbnail 1: settle against a spring that overshoots ----------------------------------------------------------
export const CURVE = { W: 280, H: 150, L: 16, R: 16, T: 22, B: 18, Tms: 450 };
const cx = (ms: number) => CURVE.L + ((CURVE.W - CURVE.L - CURVE.R) * ms) / CURVE.Tms;
const cy = (v: number) => CURVE.T + (CURVE.H - CURVE.T - CURVE.B) * (1 - v / 1.12);
function curves(): { settle: [number, number][]; spring: [number, number][] } {
  const s = createSettle(0, { omega: 25, restDelta: 1e-5 });
  s.setTarget(1);
  const settle: [number, number][] = [[0, 0]];
  for (let ms = 5; ms <= CURVE.Tms; ms += 5) { s.step(5); settle.push([ms, s.value]); }
  // The spring it is set against: lightly damped (ratio 0.45), so it overshoots and rings.
  const o = createSpring(0, { stiffness: 484, dampingRatio: 0.45, restDelta: 1e-5, restSpeed: 1e-5 });
  o.setTarget(1);
  const spring: [number, number][] = [[0, 0]];
  for (let ms = 5; ms <= CURVE.Tms; ms += 5) { o.step(5); spring.push([ms, o.value]); }
  return { settle, spring };
}
const CURVES =curves();
/** A curve's value at `ms`. */
const curveAt = (d: [number, number][], ms: number): number => d[Math.min(d.length - 1, Math.round(ms / 5))]![1];
const curvePoint = (d: [number, number][], ms: number) => ({ x: cx(ms), y: cy(curveAt(d, ms)) });
export function curveSVG(ms: number): string {
  const path = (d: [number, number][]): string => d.map((p, i) => (i ? "L" : "M") + cx(p[0]).toFixed(1) + " " + cy(p[1]).toFixed(1)).join(" ");
  const a = curvePoint(CURVES.spring, ms), b = curvePoint(CURVES.settle, ms);
  return `<line x1="${CURVE.L}" x2="${CURVE.W - CURVE.R}" y1="${cy(1).toFixed(1)}" y2="${cy(1).toFixed(1)}" class="t-target"/>` +
    `<path d="${path(CURVES.spring)}" class="t-other"/><path d="${path(CURVES.settle)}" class="t-settle"/>` +
    `<line class="t-head" x1="${cx(ms).toFixed(1)}" x2="${cx(ms).toFixed(1)}" y1="${CURVE.T - 6}" y2="${CURVE.H - CURVE.B}"/>` +
    `<circle r="4" class="t-dot-other" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}"/><circle r="4.5" class="t-dot" cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}"/>`;
}

// ---- The desk preview: rails, panels, two documents and the bar ------------------------------------------------------
const DESK_A:Record<string, Rect> = {
  railL: { x: 0, y: 0, width: 14, height: 150 }, railR: { x: 266, y: 0, width: 14, height: 150 },
  p1: { x: 18, y: 4, width: 58, height: 70 }, p2: { x: 18, y: 78, width: 58, height: 68 },
  p3: { x: 204, y: 4, width: 58, height: 142 },
  d1: { x: 80, y: 26, width: 66, height: 120 }, d2: { x: 150, y: 26, width: 50, height: 120 },
  bar: { x: 104, y: 6, width: 72, height: 14 },
};
const deskKind = (k: string): string => (k.startsWith("rail") ? "t-rail" : k.startsWith("d") ? "t-doc" : k === "bar" ? "t-pill" : "t-panel");
export function deskThumbSVG(): string {
  return Object.entries(DESK_A).map(([k, r]) => `<rect data-k="${k}" rx="${k === "bar" ? 7 : 4}" class="${deskKind(k)}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`).join("");
}
