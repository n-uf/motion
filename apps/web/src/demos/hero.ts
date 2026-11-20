/**
 * The home hero's scope (motion's slot), as plain data the server renders and the island animates (islands/hero.ts):
 * the settle curves at each tempo, a bouncy spring for contrast, and one real run of a panel's glide, recorded frame by
 * frame and checked with `@n-uf/motion/testing`.
 *
 * Placement's slot is the popup (demos/hero-pop.ts), docking's the app window (demos/hero-dock.ts).
 *
 * Every number here comes out of the packages. The server runs them at build time for the first (finished) state, and
 * the island runs them again in the browser, live; the two states agree by construction.
 */
import { createFakeClock, createFrameLoop, createSettle, createSpring, SETTLE_TEMPO, type Rect } from "@n-uf/motion";
import { createLayoutMotion } from "@n-uf/motion/layout";
import { checkMonotonic, checkNoOvershoot, checkTempo, type CheckResult, type RectSample } from "@n-uf/motion/testing";

export type Tempo = keyof typeof SETTLE_TEMPO;
export const TEMPOS = Object.keys(SETTLE_TEMPO) as Tempo[];
/** The dial's needle, in degrees, at each tempo's detent. */
export const NEEDLE: Record<Tempo, number> = { calm: -52, default: 0, quick: 52 };

// ---- The scope's plot ----------------------------------------------------------------------------------------------
/** The plot's box in its viewBox (290 × 176), and its time axis: 0 to 400 ms. */
export const PLOT = { x0: 30, w: 252, y0: 150, h: 115.4, tMax: 400, vbW: 290, vbH: 176 };
export const plotX = (ms: number): number => PLOT.x0 + (ms / PLOT.tMax) * PLOT.w;
export const plotY = (p: number): number => PLOT.y0 - p * PLOT.h;
const f1 = (n: number): string => n.toFixed(1);

/** A path through (ms, progress) samples. */
export function pathOf(points: readonly { ms: number; p: number }[]): string {
  return points.map((q, i) => `${i ? "L" : "M"}${f1(plotX(q.ms))} ${f1(plotY(Math.max(0, q.p)))}`).join("");
}

/** The settle's progress toward its target at `omega`, sampled every `step` ms by stepping a real `createSettle`. */
export function settleCurve(omega: number, tMax = PLOT.tMax, step = 4): { ms: number; p: number }[] {
  const s = createSettle(0, { omega });
  s.setTarget(1);
  const out = [{ ms: 0, p: 0 }];
  for (let ms = step; ms <= tMax; ms += step) {
    s.step(step);
    out.push({ ms, p: s.value });
  }
  return out;
}

/** A bouncy spring (damping ratio 0.35, as many UIs ship), for contrast: it passes its target and rings. */
export function springCurve(tMax = PLOT.tMax, step = 4): { ms: number; p: number }[] {
  const s = createSpring(0, { stiffness: 625, dampingRatio: 0.35 });
  s.setTarget(1);
  const out = [{ ms: 0, p: 0 }];
  for (let ms = step; ms <= tMax; ms += step) {
    s.step(step);
    out.push({ ms, p: s.value });
  }
  return out;
}

// ---- A recorded run ------------------------------------------------------------------------------------------------
/** What a run of a panel from `from` to `to` looked like frame by frame, and what the checks said of it. */
export interface RunReport {
  /** Progress toward the target by distance, 0 to 1, per frame: the live curve. */
  readonly curve: readonly { ms: number; p: number }[];
  /** Ms to 90 % of the way, interpolated between the frames that bracket it; null if it never got there. */
  readonly t90: number | null;
  /** The furthest any component went past its start-to-target range, px (0 when it never did). */
  readonly overshoot: number;
  readonly checks: { readonly noOvershoot: CheckResult; readonly monotonic: CheckResult; readonly tempo: CheckResult };
  /** Every check passed. */
  readonly ok: boolean;
}

const KEYS = ["x", "y", "width", "height"] as const;

/** Judge recorded frames (`samples`, the first one the start) of a move from `from` to `to` at `omega`. */
export function judge(samples: readonly RectSample[], from: Rect, to: Rect, omega: number): RunReport {
  const d0 = Math.hypot(to.x - from.x, to.y - from.y);
  const t0 = samples[0]?.t ?? 0;
  const curve = samples.map((s) => ({ ms: s.t - t0, p: d0 > 0 ? 1 - Math.hypot(to.x - s.rect.x, to.y - s.rect.y) / d0 : 1 }));
  let t90: number | null = null;
  for (let i = 1; i < curve.length && t90 === null; i++) {
    const a = curve[i - 1]!, b = curve[i]!;
    if (b.p >= 0.9) t90 = a.ms + ((0.9 - a.p) / (b.p - a.p || 1)) * (b.ms - a.ms);
  }
  let overshoot = 0;
  for (const s of samples) for (const k of KEYS) overshoot = Math.max(overshoot, s.rect[k] - Math.max(from[k], to[k]), Math.min(from[k], to[k]) - s.rect[k]);
  const expected = (Math.LN10 / omega) * 1000;
  const noOvershoot = checkNoOvershoot(samples, from, to);
  const monotonic = checkMonotonic(samples, to);
  // The tempo's own promise: 90 % in ln(10)/omega s, read off whole frames, so a frame's width either way.
  const tempo = d0 > 0 ? checkTempo(samples, from, to, expected, 0.3, t0) : { ok: true, failures: [] as string[], t90: null };
  return { curve, t90, overshoot: Math.max(0, overshoot), checks: { noOvershoot, monotonic, tempo }, ok: noOvershoot.ok && monotonic.ok && tempo.ok };
}

/**
 * One real run on a fake clock at 60 fps: a layout-motion item moves from `from` to `to` at `omega`, and every drawn
 * frame is recorded. The server's first state; the island records its live runs the same way (from the real frames).
 */
export function simulateRun(from: Rect, to: Rect, omega: number): { samples: RectSample[]; report: RunReport } {
  const clock = createFakeClock({ frameMs: 1000 / 60 });
  const loop = createFrameLoop({ clock });
  const motion = createLayoutMotion({ loop, omega });
  const item = motion.add("panel", { layOut: () => {}, draw: () => {} }, from);
  const samples: RectSample[] = [{ t: 0, rect: { ...item.drawn } }];
  let t = 0;
  motion.onFrame((frame) => {
    t += frame.delta;
    samples.push({ t, rect: { ...item.drawn } });
  });
  item.moveTo(to);
  clock.runUntilIdle();
  return { samples, report: judge(samples, from, to, omega) };
}

