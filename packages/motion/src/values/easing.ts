/** Maps progress in [0, 1] to eased progress (0 at 0, 1 at 1). */
export type Easing = (progress: number) => number;

/** No easing. */
export const linear: Easing = (t) => t;

const EPSILON = 1e-7;

/**
 * The CSS `cubic-bezier(x1, y1, x2, y2)` curve as a function, solved
 * numerically (Newton steps, then bisection). `x1` and `x2` must be in [0, 1].
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
    throw new RangeError(`cubicBezier: x1 and x2 must be in [0, 1], got ${x1} and ${x2}`);
  }
  if (x1 === y1 && x2 === y2) return linear;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < EPSILON) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < EPSILON) return t;
      if (x > value) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return t;
  };
  return (progress) => (progress <= 0 ? 0 : progress >= 1 ? 1 : sampleY(solveX(progress)));
}

/** CSS `ease`. */
export const ease: Easing = /* @__PURE__ */ cubicBezier(0.25, 0.1, 0.25, 1);
/** CSS `ease-in`. */
export const easeIn: Easing = /* @__PURE__ */ cubicBezier(0.42, 0, 1, 1);
/** CSS `ease-out`. */
export const easeOut: Easing = /* @__PURE__ */ cubicBezier(0, 0, 0.58, 1);
/** CSS `ease-in-out`. */
export const easeInOut: Easing = /* @__PURE__ */ cubicBezier(0.42, 0, 0.58, 1);
/** Cubic ease-out: fast start, gentle stop. The tween default. */
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
/** Cubic ease-in-out. */
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
