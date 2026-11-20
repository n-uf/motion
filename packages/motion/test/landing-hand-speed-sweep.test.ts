/**
 * Slide or fling, swept: a toolbar lifted from its grip at the bottom bar's start, directly under an empty rail that
 * touches the bar (its band over a column that takes no toolbar), moved straight up the rail. Hands at 125 Hz and 60 Hz
 * (8 and 16 ms frames), their timestamps off by 0 to 50% of a frame, starting from the lift, after a rest of 100 to
 * 1000 ms, or from a hesitation and a ramp of 30 or 60 ms. The properties:
 *
 * - (a) every slide at 0.6 to 1.9 px/ms enters the rail, within a span and a half of the hand's speed plus `path`;
 * - (b) every fling at 2.4 px/ms or faster never enters before the hand settles, and an immediate release goes home;
 * - (c) a rest of 80 ms after the fling docks it.
 *
 * Every gate that asks fast or slow reads one estimate, the hand's speed (`createHandSpeed`).
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, LANDING_GATES, type LandingLane, type LandingModel, type LandingRegions } from "../src/drag";
import { HAND_SPEED } from "../src/drag/hand-speed";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const regions = (): LandingRegions => {
  const bottom: LandingLane = { id: "bottom", rect: rect(0, 599, 868, 31), axis: "x", spots: [{ id: "bottom/home", along: [0, 868], landing: rect(8, 599, 362, 31) }], refused: [] };
  const rail: LandingLane = { id: "rail-left", rect: rect(0, 0, 30, 599), axis: "y", spots: [{ id: "rail-left/start", along: [0, 599], landing: rect(0, 242, 30, 121) }], refused: [] };
  return { lanes: [bottom, rail], refused: [], content: rect(0, 0, 868, 599), blocked: [rect(12, 12, 220, 575)], stage: rect(0, 0, 868, 630), item: { width: 362, height: 31 } };
};
const START: Point = { x: 25, y: 614 };

interface Hand {
  /** px/ms once up to speed. */
  readonly v: number;
  readonly dt: number;
  /** The timestamps' error, a share of a frame. */
  readonly jitter: number;
  /** Still at the lift point before moving, ms (samples repeat the point). */
  readonly rest: number;
  /** From still to `v`, linearly, ms (0: at `v` at once). */
  readonly ramp: number;
  readonly seed: number;
}

/** Plays `hand` up the rail for `travel` px; where (px slid) the rail took it, or -1, and the model. */
function play(hand: Hand, travel: number): { entered: number; model: LandingModel; t: number; at: Point } {
  let s = hand.seed * 7919 + 17;
  const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: START, grab: { x: 17, y: 15 } });
  m.update(START, 0);
  let k = 0;
  let y = START.y;
  let entered = -1;
  let t = 0;
  const stamp = (): number => Math.max(t + 0.5, hand.dt * (k + hand.jitter * (2 * rnd() - 1)));
  while (hand.rest > 0 && hand.dt * (k + 1) <= hand.rest) {
    k++;
    t = stamp();
    m.update(START, t);
  }
  const moveFrom = hand.dt * k;
  while (START.y - y < travel) {
    k++;
    const real = hand.dt * k - moveFrom;
    const v = hand.ramp > 0 ? Math.min(hand.v, (hand.v * real) / hand.ramp) : hand.v;
    y -= v * hand.dt;
    t = stamp();
    if (m.update({ x: START.x, y }, t).lane === "rail-left" && entered < 0) entered = START.y - y;
  }
  return { entered, model: m, t, at: { x: START.x, y } };
}

const JITTERS = [0, 0.2, 0.35, 0.5];
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

describe("slide or fling, swept from the bar's corner up a touching rail", () => {
  it("(a) every slide at 0.6 to 1.9 px/ms, from the lift, a rest or a ramp, enters the rail within a span and a half plus `path`", () => {
    const bad: string[] = [];
    let runs = 0;
    // (Up the rail to near its top, y 14.)
    const TRAVEL = 600;
    for (const v of [0.6, 0.9, 1.2, 1.5, 1.9])
      for (const dt of [8, 16])
        for (const jitter of JITTERS)
          for (const [rest, ramp] of [
            [0, 0],
            [300, 0],
            [40, 60],
          ] as const)
            for (const seed of SEEDS) {
              runs++;
              const { entered } = play({ v, dt, jitter, rest, ramp, seed }, TRAVEL);
              // The bound: the hand's speed read over its span (48 ms and 5 steps: 48 ms at 125 Hz, 80 ms at 60 Hz) and
              // steady for half a span more, then `path` (40 px), plus a few frames that read fast or gathering where the
              // timestamps jitter, plus what a ramp covers. Capped below the travel, so no cell is vacuous.
              const span = Math.max(HAND_SPEED.span, HAND_SPEED.steps * dt);
              const bound = v * (1.5 * span + 7 * dt + ramp / 2) + LANDING_GATES.path + 16;
              if (bound >= TRAVEL) bad.push(`${v} px/ms, ${dt} ms: the bound ${Math.round(bound)} px is past the travel`);
              if (entered < 0 || entered > bound) bad.push(`${v} px/ms, ${dt} ms, ±${jitter * 100}%, rest ${rest}, ramp ${ramp}, seed ${seed}: ${entered < 0 ? "never entered" : `entered at ${Math.round(entered)} px, over ${Math.round(bound)}`}`);
            }
    expect(runs).toBe(1440);
    expect(bad).toEqual([]);
  });

  it("(b) every fling at 2.4 px/ms or faster, from the lift, a rest or a slow start, never enters before it settles; an immediate release goes home", () => {
    const bad: string[] = [];
    let runs = 0;
    for (const v of [2.4, 3, 4])
      for (const dt of [8, 16])
        for (const jitter of JITTERS) {
          for (const [rest, ramp] of [
            [0, 0],
            [100, 0],
            [300, 0],
            [1000, 0],
            [40, 30],
            [40, 60],
          ] as const)
            for (const seed of SEEDS) {
              runs++;
              const { entered, model } = play({ v, dt, jitter, rest, ramp, seed }, 313);
              const where = `${v} px/ms, ${dt} ms, ±${jitter * 100}%, rest ${rest}, ramp ${ramp}, seed ${seed}`;
              if (entered >= 0) bad.push(`${where}: entered at ${Math.round(entered)} px`);
              else if (model.release() !== null) bad.push(`${where}: a release at once lands ${JSON.stringify(model.release())}`);
            }
        }
    expect(runs).toBe(1728);
    expect(bad).toEqual([]);
  });

  it("(c) a rest of 80 ms after the fling docks it in the rail", () => {
    const bad: string[] = [];
    for (const v of [2.4, 3, 4])
      for (const dt of [8, 16])
        for (const jitter of [0, 0.35])
          for (const seed of SEEDS) {
            const { model, t, at } = play({ v, dt, jitter, rest: 0, ramp: 0, seed }, 313);
            for (let r = dt; r <= 80; r += dt) model.update(at, t + r);
            if (model.frame.lane !== "rail-left") bad.push(`${v} px/ms, ${dt} ms, ±${jitter * 100}%, seed ${seed}: after 80 ms of rest, lane ${model.frame.lane}`);
          }
    expect(bad).toEqual([]);
  });

  it("(d) a hand creeping on whole pixels (one every 40 to 60 ms, each sample a gap) enters as soon as it is over the refused column", () => {
    const bad: string[] = [];
    for (const v of [0.016, 0.02, 0.025])
      for (const dt of [8, 16]) {
        const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: START, grab: { x: 17, y: 15 } });
        m.update(START, 0);
        let entered = -1;
        let y = START.y;
        for (let t = dt; t <= 4000 && entered < 0; t += dt) {
          const next = Math.round(START.y - v * t);
          // The host sends a sample only when the pointer moves a pixel.
          if (next === y) continue;
          y = next;
          if (m.update({ x: START.x, y }, t).lane === "rail-left") entered = START.y - y;
        }
        if (entered < 0 || entered > 40) bad.push(`${v} px/ms, ${dt} ms: ${entered < 0 ? "never entered" : `entered at ${entered} px`}`);
      }
    expect(bad).toEqual([]);
  });
});
