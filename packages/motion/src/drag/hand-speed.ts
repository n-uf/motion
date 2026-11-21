import type { Point } from "../shapes";

/**
 * The hand's speed, the one estimate a landing model's gates read when they ask "fast or slow": the slide count into a
 * touching lane, its entry (`slid`), the settle rule after a fling and the slow-path gate. Speeds are px per 8 ms (the
 * 125 Hz step a landing model's gates are stated in).
 *
 * It is read over time, from the distinct samples since the hand last started:
 * - `step`, the newest step alone: a speed-up reads at once.
 * - `long`, over the newest samples that span at least `span` ms and `steps` steps. A speed's error comes from the
 *   timestamps at its two ends, a share of a frame each, so the span holds several frames: a fling whose timestamps
 *   jitter never reads slow over it. Unknown (null) until the samples since the hand started span that much.
 * - `speed`, the larger of the two (`long` unknown: `step`), so a speed-up reads at once and a slow-down only once it has
 *   lasted the span.
 * - `steady`, a slide's evidence: `long` known, and the newest step not faster than `accelerating` times it, so a hand
 *   gathering speed out of a hesitation or a rest is no slide yet.
 *
 * A gap of `gap` ms or more between two samples (a rest, a hesitation, a host that stopped sending) starts the hand
 * again: the samples before it never count, and the gap's own step is unknown (Infinity) unless it is no longer than
 * `slowStep` px (a hand creeping a pixel at a time, which reads slow), so a rest is never averaged into the next fling.
 *
 * Internal to the landing model (not exported from `./drag`).
 */
export interface HandSpeed {
  /** A distinct sample of the pointer at `t` ms. */
  push(p: Point, t: number): void;
  /** Forget every sample: the next one starts the hand. */
  reset(): void;
  readonly step: number;
  readonly long: number | null;
  readonly speed: number;
  readonly steady: boolean;
}

/** The crawl threshold: the longest step over a gap that still reads slow, a length in px (not a speed). */
export const HAND_SLOW_STEP = 3;

export interface HandSpeedOptions {
  /** How long the samples `long` reads must span, ms. */
  readonly span: number;
  /** How many steps they must hold, at least. */
  readonly steps: number;
  /** A gap between two samples this long or longer starts the hand again, ms. */
  readonly gap: number;
  /**
   * The longest step over a gap that still reads as the speed it is, px (`HAND_SLOW_STEP`, 3 by default; a length, not
   * a speed, so a landing model's `gates.step` does not set it): a hand creeping a pixel or two at a time reads slow; a
   * longer step over a gap (a fling out of a rest) is unknown.
   */
  readonly slowStep: number;
  /** How much faster than `long` the newest step may be and the hand still be steady (a slide). */
  readonly accelerating: number;
  /** How much faster `long` may read than half a span before and the hand still be steady (not gathering speed). */
  readonly gathering: number;
}

/**
 * The defaults: at least 48 ms and 5 steps (48 ms at 125 Hz, 80 ms at 60 Hz), so a fling at 2.4 px/ms whose timestamps
 * are off by up to half a frame at 125 Hz, or a third at 60 Hz, still reads above 2 px/ms; a gap of 40 ms (more than
 * two 60 Hz frames with their timestamps half a frame off, so a hesitation of 40 ms or more starts the hand again; a
 * landing model takes the smaller of it and its `pause`); steady up to 1.5 times.
 */
export const HAND_SPEED: HandSpeedOptions = { span: 48, steps: 5, gap: 40, slowStep: HAND_SLOW_STEP, accelerating: 1.5, gathering: 1.25 };

export function createHandSpeed(options: Partial<HandSpeedOptions> = {}): HandSpeed {
  const o = { ...HAND_SPEED, ...options };
  let samples: { p: Point; t: number }[] = [];
  let step = Infinity;
  let long: number | null = null;
  /** `long` as it read at the samples of the last span, oldest first. */
  let longs: { t: number; v: number }[] = [];
  return {
    push(p, t) {
      const last = samples[samples.length - 1];
      if (last && t - last.t >= o.gap) {
        // A rest or a gap: the hand starts again here. The gap's step tells nothing about its speed (a fling out of a
        // rest), unless it is no longer than `slowStep` px: a hand creeping a pixel at a time is slow, whatever the gap.
        const d = Math.hypot(p.x - last.p.x, p.y - last.p.y);
        samples = [{ p, t }];
        step = d <= o.slowStep ? (d * 8) / Math.max(1, t - last.t) : Infinity;
        long = null;
        longs = [];
        return;
      }
      step = last ? (Math.hypot(p.x - last.p.x, p.y - last.p.y) * 8) / Math.max(1, t - last.t) : Infinity;
      samples.push({ p, t });
      // Keep the newest samples that span the window, and no more.
      while (samples.length > o.steps + 1 && t - samples[1]!.t >= o.span) samples.shift();
      const first = samples[0]!;
      if (samples.length > o.steps && t - first.t >= o.span) {
        let path = 0;
        for (let i = 1; i < samples.length; i++) path += Math.hypot(samples[i]!.p.x - samples[i - 1]!.p.x, samples[i]!.p.y - samples[i - 1]!.p.y);
        long = (path * 8) / (t - first.t);
        longs.push({ t, v: long });
        while (longs.length > 1 && t - longs[1]!.t >= o.span / 2) longs.shift();
      } else long = null;
    },
    reset() {
      samples = [];
      step = Infinity;
      long = null;
      longs = [];
    },
    get step() {
      return step;
    },
    get long() {
      return long;
    },
    get speed() {
      return long === null ? step : Math.max(step, long);
    },
    get steady() {
      // Known for half a span, not faster now than then by more than `gathering`, and the newest step in line with it.
      const then = longs[0];
      return long !== null && step <= long * o.accelerating && !!then && longs[longs.length - 1]!.t - then.t >= o.span / 2 && long <= then.v * o.gathering;
    },
  };
}
