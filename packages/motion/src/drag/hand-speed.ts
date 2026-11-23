import type { Point } from "../shapes";

/**
 * The hand's speed, the one estimate a landing model's gates read when they ask "fast or slow": the slide count into a
 * touching lane, its entry (`slid`), the settle rule after a fling and the slow-path gate. Speeds are px/ms, as a landing
 * model's gates are.
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
 * A gap of `gap` ms or more between two samples is a rest or a stroke the host lost samples of, and the hand tells them
 * apart by what it saw (decision record 0014):
 * - **A rest** starts the hand again: the samples before it never count. It is a rest when the pointer was seen standing
 *   still for `still` ms of it (`hold`: a host that updates per frame reports a rest as it happens), or when the pointer
 *   moved across it less than `carry` times the hand's speed so far (a host that sends nothing while the pointer rests),
 *   or when the hand has no speed yet.
 * - **A lost stretch** (the pointer moved across it at about the hand's speed: frames the host dropped) carries the hand
 *   on: the lost frames are filled in on a straight line at the gap's mean speed, so `long`, `speed` and `steady` read as
 *   if they had come. A shorter interval of `fill` frames or more is filled in the same way.
 *
 * Either way the gap's own `step` is unknown (Infinity) unless it is no longer than `slowStep` px (a hand creeping a
 * pixel at a time, which reads slow): a gap may end a rest, so it is never a slow step, and a rest is never averaged into
 * the next fling. Across a lost stretch `speed` and `steady` read its mean, so a slide through it counts on.
 *
 * An interval under `SAME_SAMPLE` (1 ms) between two samples is the same sample (a release read a fraction of a
 * millisecond after the last frame): it keeps the previous step and speed, as a repeated point does, instead of reading
 * its few pixels over 1 ms as a slow step.
 *
 * Internal to the landing model (not exported from `./drag`).
 */
export interface HandSpeed {
  /** A distinct sample of the pointer at `t` ms. */
  push(p: Point, t: number): void;
  /** The pointer seen where its last sample was, at `t` ms (a repeated sample): standing still since. */
  hold(t: number): void;
  /** Forget every sample: the next one starts the hand. */
  reset(): void;
  readonly step: number;
  readonly long: number | null;
  readonly speed: number;
  readonly steady: boolean;
}

/** The crawl threshold: the longest step over a gap that still reads slow, a length in px (not a speed). */
const HAND_SLOW_STEP = 3;

export interface HandSpeedOptions {
  /** How long the samples `long` reads must span, ms. */
  readonly span: number;
  /** How many steps they must hold, at least. */
  readonly steps: number;
  /** A gap between two samples this long or longer is a rest or a lost stretch, ms. */
  readonly gap: number;
  /**
   * The longest step over a gap that still reads as the speed it is, px (`HAND_SLOW_STEP`, 3 by default; a length, not
   * a speed, so a landing model's `gates.stepSpeed` does not set it): a hand creeping a pixel or two at a time reads
   * slow; a longer step over a gap (a fling out of a rest) is unknown.
   */
  readonly slowStep: number;
  /** How long the pointer seen standing still makes a gap a rest, whatever it moved across it, ms. */
  readonly still: number;
  /**
   * The least share of the hand's speed so far the pointer must move at across a gap for the gap to be a lost stretch
   * rather than a rest.
   */
  readonly carry: number;
  /** An interval this many frames long or longer (a frame: the longest interval of the samples held) is filled in. */
  readonly fill: number;
  /** How much faster than `long` the newest step may be and the hand still be steady (a slide). */
  readonly accelerating: number;
  /** How much faster `long` may read than half a span before and the hand still be steady (not gathering speed). */
  readonly gathering: number;
}

/**
 * The defaults: at least 48 ms and 5 steps (48 ms at 125 Hz, 80 ms at 60 Hz), so a fling at 2.4 px/ms whose timestamps
 * are off by up to half a frame at 125 Hz, or a third at 60 Hz, still reads above 2 px/ms; a gap of 40 ms (more than
 * two 60 Hz frames with their timestamps half a frame off; a landing model takes the smaller of it and its `pause`); a
 * rest seen for 20 ms (more than a 60 Hz frame, so the repeated sample a host sends within the frame of a move is no
 * rest); a lost stretch at half the hand's speed or more (a rest of 40 ms or more ends with one frame's step, a third of
 * the gap at most, so a hand resuming at its speed reads as resting); filled from two and a half frames (a frame whose
 * timestamps are off by half a frame lasts two at most, so jitter alone is never filled); steady up to 1.5 times.
 */
export const HAND_SPEED: HandSpeedOptions = { span: 48, steps: 5, gap: 40, slowStep: HAND_SLOW_STEP, still: 20, carry: 0.5, fill: 2.5, accelerating: 1.5, gathering: 1.25 };

/** The most frames a lost stretch is filled with: the newest ones (more than the span and a half reads). */
const FILL_MAX = 32;

/**
 * The shortest interval between two samples that is two samples, ms. A shorter one (a release read a fraction of a
 * millisecond after the last frame, or two timestamps of one frame) is the same sample seen twice: its distance over so
 * short a time says nothing about how fast the hand moves, whatever its timestamps' precision.
 */
const SAME_SAMPLE = 1;

/**
 * The speed over an interval of `dt` ms that covered `distance` px, px/ms: the distance over the time, or `previous`
 * when the interval is shorter than `SAME_SAMPLE` (a repeated point keeps the last step the same way).
 */
function speedOver(distance: number, dt: number, previous: number): number {
  return dt < SAME_SAMPLE ? previous : distance / dt;
}

export function createHandSpeed(options: Partial<HandSpeedOptions> = {}): HandSpeed {
  const o = { ...HAND_SPEED, ...options };
  let samples: { p: Point; t: number }[] = [];
  /** The newest step as `speed` and `steady` read it: across a lost stretch, its mean. */
  let newest = Infinity;
  /** The newest step as `step` reads it: across a gap, unknown unless a crawl. */
  let step = Infinity;
  let long: number | null = null;
  /** `long` as it read at the samples of the last span, oldest first. */
  let longs: { t: number; v: number }[] = [];
  /** When the pointer was last seen standing still at the newest sample (`hold`), or null. */
  let heldTo: number | null = null;
  const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
  /** The path over the samples held. */
  const path = (): number => {
    let sum = 0;
    for (let i = 1; i < samples.length; i++) sum += dist(samples[i - 1]!.p, samples[i]!.p);
    return sum;
  };
  /** The hand's speed so far: `long`, else over the samples held (two at least), else null. */
  const sofar = (): number | null => {
    if (long !== null) return long;
    const first = samples[0]!;
    const lastT = samples[samples.length - 1]!.t;
    return samples.length > 1 && lastT > first.t ? path() / (lastT - first.t) : null;
  };
  /** One sample into the window (a real one, or a lost frame filled in). */
  const add = (p: Point, t: number): void => {
    const last = samples[samples.length - 1];
    if (!last) newest = step = Infinity;
    else {
      const d = dist(last.p, p);
      newest = speedOver(d, t - last.t, newest);
      step = speedOver(d, t - last.t, step);
    }
    samples.push({ p, t });
    // Keep the newest samples that span the window, and no more.
    while (samples.length > o.steps + 1 && t - samples[1]!.t >= o.span) samples.shift();
    const first = samples[0]!;
    if (samples.length > o.steps && t - first.t >= o.span) {
      long = path() / (t - first.t);
      longs.push({ t, v: long });
      while (longs.length > 1 && t - longs[1]!.t >= o.span / 2) longs.shift();
    } else long = null;
  };
  return {
    push(p, t) {
      const last = samples[samples.length - 1];
      const seenStill = !!last && heldTo !== null && heldTo - last.t >= o.still;
      heldTo = null;
      if (!last) {
        add(p, t);
        return;
      }
      const d = dist(last.p, p);
      const dt = t - last.t;
      // The gap's own step: it may end a rest, so it is unknown unless it is a crawl.
      const across = d <= o.slowStep ? speedOver(d, dt, step) : Infinity;
      if (dt >= o.gap) {
        const v = sofar();
        if (seenStill || v === null || d / dt < v * o.carry) {
          // A rest: the hand starts again here.
          samples = [{ p, t }];
          newest = step = across;
          long = null;
          longs = [];
          return;
        }
      }
      // A lost stretch, or an interval of `fill` frames or more the pointer didn't rest in: the frames the host lost,
      // filled in on a straight line at the mean speed across it. A frame is the longest interval held, so a jittered
      // frame never fills in more frames than were lost: the span `long` reads still holds `steps` frames of real time,
      // and a fling whose timestamps jitter still never reads slow across it.
      let frame = 1;
      for (let i = 1; i < samples.length; i++) frame = Math.max(frame, samples[i]!.t - samples[i - 1]!.t);
      if (!seenStill && samples.length > 1 && (dt >= o.gap || dt >= o.fill * frame)) {
        const n = Math.floor(dt / frame);
        for (let i = Math.max(1, n - FILL_MAX); i < n; i++) add({ x: last.p.x + ((p.x - last.p.x) * i) / n, y: last.p.y + ((p.y - last.p.y) * i) / n }, last.t + (dt * i) / n);
      }
      add(p, t);
      if (dt >= o.gap) step = across;
    },
    hold(t) {
      const last = samples[samples.length - 1];
      if (last && t > last.t) heldTo = t;
    },
    reset() {
      samples = [];
      newest = step = Infinity;
      long = null;
      longs = [];
      heldTo = null;
    },
    get step() {
      return step;
    },
    get long() {
      return long;
    },
    get speed() {
      return long === null ? newest : Math.max(newest, long);
    },
    get steady() {
      // Known for half a span, not faster now than then by more than `gathering`, and the newest step in line with it.
      const then = longs[0];
      return long !== null && newest <= long * o.accelerating && !!then && longs[longs.length - 1]!.t - then.t >= o.span / 2 && long <= then.v * o.gathering;
    },
  };
}
