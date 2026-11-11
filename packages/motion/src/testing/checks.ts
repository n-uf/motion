import type { Rect } from "../shapes";

/**
 * Frame-sampled checks of the motion rules: record what was drawn on each
 * frame (in a unit test on the fake clock, or in a browser spec reading the
 * page each animation frame) and ask whether the motion kept the rules.
 *
 * Every check returns `{ ok, failures }`; a failure names the frame (its time)
 * and the component, so a spec can print it. Pixel tolerances default to half
 * a pixel.
 */

/** One drawn frame: the time in ms and the rect on screen. */
export interface RectSample {
  readonly t: number;
  readonly rect: Rect;
}

/** A drawn frame with the target the motion was heading for at that frame. */
export interface TargetSample extends RectSample {
  readonly target: Rect;
}

/** A drawn frame with where a pointer-held rect should be. */
export interface HeldSample extends RectSample {
  readonly expected: Rect;
}

/** A drawn frame of content's transform: the matrix's x and y scale (CSS matrix `a` and `d`). */
export interface ScaleSample {
  readonly t: number;
  readonly a: number;
  readonly d: number;
}

/** What a check found. */
export interface CheckResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
}

/** {@link checkTempo}'s result: also the measured time to 90 %. */
export interface TempoResult extends CheckResult {
  /** Ms from the first sample to the first one 90 % of the way, or null if never. */
  readonly t90: number | null;
}

const KEYS = ["x", "y", "width", "height"] as const;
type Key = (typeof KEYS)[number];

const result = (failures: string[]): CheckResult => ({ ok: failures.length === 0, failures });
const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

/**
 * No overshoot: between `from` and `to`, every component of every frame stays
 * between its start and end value (plus `tolerance`). Run it per move; size
 * (`width`, `height`) passing is "no wobble".
 */
export function checkNoOvershoot(samples: readonly RectSample[], from: Rect, to: Rect, tolerance = 0.5): CheckResult {
  const failures: string[] = [];
  for (const s of samples) {
    for (const k of KEYS) {
      const lo = Math.min(from[k], to[k]) - tolerance;
      const hi = Math.max(from[k], to[k]) + tolerance;
      const v = s.rect[k];
      if (v < lo || v > hi) failures.push(`t=${fmt(s.t)} ${k}=${fmt(v)} outside [${fmt(lo + tolerance)}, ${fmt(hi - tolerance)}]`);
    }
  }
  return result(failures);
}

/**
 * Monotonic settle: the distance to `to` never grows from one frame to the
 * next (by more than `tolerance`), per component. A bounce or a restart
 * backwards fails it.
 */
export function checkMonotonic(samples: readonly RectSample[], to: Rect, tolerance = 0.5): CheckResult {
  const failures: string[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    for (const k of KEYS) {
      const before = Math.abs(a.rect[k] - to[k]);
      const after = Math.abs(b.rect[k] - to[k]);
      if (after > before + tolerance) failures.push(`t=${fmt(b.t)} ${k} moved away from its target: ${fmt(before)} → ${fmt(after)} px off`);
    }
  }
  return result(failures);
}

/**
 * No jumps: no frame moves a component further than a settle at `omega`
 * could in that frame's time, measured against the larger of the distances to
 * the target before and after (plus `slack` px). A snap, a restart from an old
 * place or a teleport fails it; a settle, however often retargeted, passes.
 * Leave held frames out (a pointer may move anything any distance).
 */
export function checkNoJumps(samples: readonly TargetSample[], omega: number, slack = 1): CheckResult {
  const failures: string[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dt = Math.max(0, b.t - a.t) / 1000;
    const reach = 1 - Math.exp(-omega * dt);
    for (const k of KEYS) {
      const step = Math.abs(b.rect[k] - a.rect[k]);
      const far = Math.max(Math.abs(a.rect[k] - a.target[k]), Math.abs(a.rect[k] - b.target[k]));
      const limit = far * reach * 1.05 + slack;
      if (step > limit) failures.push(`t=${fmt(b.t)} ${k} jumped ${fmt(step)} px in ${fmt(b.t - a.t)} ms (at most ${fmt(limit)})`);
    }
  }
  return result(failures);
}

/** Held 1:1: on every frame the drawn rect is where the pointer puts it (within `tolerance`). */
export function checkHeld(samples: readonly HeldSample[], tolerance = 0.5): CheckResult {
  const failures: string[] = [];
  for (const s of samples) {
    for (const k of KEYS) {
      const off = Math.abs(s.rect[k] - s.expected[k]);
      if (off > tolerance) failures.push(`t=${fmt(s.t)} ${k} is ${fmt(off)} px from the pointer's place`);
    }
  }
  return result(failures);
}

/**
 * Content never stretched: the content's transform scales x and y by the same
 * factor (within `tolerance`). With `uniformOnly: false` (default true) it must
 * also be 1, i.e. not scaled at all: use that for glides, the default for
 * open and close.
 */
export function checkContentScale(samples: readonly ScaleSample[], options: { uniformOnly?: boolean; tolerance?: number } = {}): CheckResult {
  const tolerance = options.tolerance ?? 1e-3;
  const uniformOnly = options.uniformOnly ?? true;
  const failures: string[] = [];
  for (const s of samples) {
    if (Math.abs(s.a - s.d) > tolerance) failures.push(`t=${fmt(s.t)} content stretched: scale ${fmt(s.a)} × ${fmt(s.d)}`);
    else if (!uniformOnly && (Math.abs(s.a - 1) > tolerance || Math.abs(s.d - 1) > tolerance)) failures.push(`t=${fmt(s.t)} content scaled by ${fmt(s.a)}`);
  }
  return result(failures);
}

/**
 * Tempo: the move from `from` to `to` is 90 % done (by its largest component)
 * within `t90` ms, give or take `tolerance` (a fraction, default 0.25).
 */
export function checkTempo(samples: readonly RectSample[], from: Rect, to: Rect, t90: number, tolerance = 0.25): TempoResult {
  const start = samples[0]?.t ?? 0;
  let key: Key = "x";
  for (const k of KEYS) if (Math.abs(to[k] - from[k]) > Math.abs(to[key] - from[key])) key = k;
  const span = to[key] - from[key];
  let measured: number | null = null;
  if (span === 0) measured = 0;
  else {
    for (const s of samples) {
      if ((s.rect[key] - from[key]) / span >= 0.9) {
        measured = s.t - start;
        break;
      }
    }
  }
  const failures: string[] = [];
  if (measured === null) failures.push(`never got 90 % of the way (${key})`);
  else if (measured < t90 * (1 - tolerance) || measured > t90 * (1 + tolerance)) {
    failures.push(`90 % after ${fmt(measured)} ms, expected ${fmt(t90)} ms ± ${Math.round(tolerance * 100)} %`);
  }
  return { ok: failures.length === 0, failures, t90: measured };
}
