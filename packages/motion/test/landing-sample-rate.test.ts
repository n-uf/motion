/**
 * The input rate, swept: a toolbar lifted from its grip at the bottom bar's start, directly under an empty rail that
 * touches the bar, moved straight up the rail at a constant speed, its pointer sampled at 60 Hz, 1 kHz, 2 kHz and 8 kHz
 * (timestamps exact). The properties:
 *
 * - (a) every slide at 0.6 to 1.9 px/ms enters the rail, within a span and a half of the hand's speed plus `path`, at
 *   every rate; at 1, 2 and 8 kHz (a span of 48 ms at all three) it enters at the same place, within a few samples' worth
 *   of travel;
 * - (b) every fling at 2.4 px/ms or faster never enters the rail while it lasts, at every rate;
 * - (c) a host that calls `update` per animation frame as well as per pointer sample (the last point repeated at 60 Hz)
 *   gets the very frames the pointer samples alone give.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, LANDING_GATES, type LandingLane, type LandingRegions } from "../src/drag";
import { HAND_SPEED } from "../src/drag/hand-speed";
import { listed } from "./listed-geometry";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const regions = (): LandingRegions => {
  const bottom: LandingLane = { id: "bottom", rect: rect(0, 599, 868, 31), axis: "x", spots: [{ id: "bottom/home", along: [0, 868], landing: rect(8, 599, 362, 31) }], refused: [] };
  const rail: LandingLane = { id: "rail-left", rect: rect(0, 0, 30, 599), axis: "y", spots: [{ id: "rail-left/start", along: [0, 599], landing: rect(0, 242, 30, 121) }], refused: [] };
  return { lanes: [bottom, rail], refused: [], content: rect(0, 0, 868, 599), blocked: [rect(12, 12, 220, 575)], stage: rect(0, 0, 868, 630) };
};
const START: Point = { x: 25, y: 614 };
const RATES = [60, 1000, 2000, 8000];
const TRAVEL = 560;

/** Drives the hand up the rail at `v` px/ms, one pointer sample per `1000 / hz` ms; the frames each update gave, and where (px up the rail) the rail took it, or -1. */
function drive(v: number, hz: number, frameHz = 0): { entered: number; frames: string[] } {
  const m = createLandingModel({ ...listed(regions()), home: { lane: "bottom", spot: "bottom/home" }, lift: START });
  const dt = 1000 / hz;
  const frames: string[] = [];
  m.update(START, 0);
  let entered = -1;
  let nextFrame = frameHz > 0 ? 1000 / frameHz : Infinity;
  let at = START;
  for (let k = 1; START.y - at.y < TRAVEL; k++) {
    const t = dt * k;
    // The animation frames that fall between the samples repeat the last point.
    while (nextFrame < t) {
      m.update(at, nextFrame);
      nextFrame += 1000 / frameHz;
    }
    at = { x: START.x, y: START.y - v * t };
    const f = m.update(at, t);
    frames.push(`${t.toFixed(3)} ${f.lane} ${f.spot} ${f.pending ?? "-"}`);
    if (f.lane === "rail-left" && entered < 0) entered = START.y - at.y;
  }
  return { entered, frames };
}

describe("the input rate, swept from the bar's corner up a touching rail", () => {
  it("(a) every slide at 0.6 to 1.9 px/ms enters the rail within a span and a half plus `path` at 60 Hz, 1, 2 and 8 kHz, and at the same place at 1 to 8 kHz", () => {
    const bad: string[] = [];
    for (const v of [0.6, 0.9, 1.2, 1.5, 1.9]) {
      const at: Record<number, number> = {};
      for (const hz of RATES) {
        const dt = 1000 / hz;
        const { entered } = drive(v, hz);
        at[hz] = entered;
        const span = Math.max(HAND_SPEED.span, HAND_SPEED.steps * dt);
        const bound = v * (1.5 * span + 7 * dt) + LANDING_GATES.path + 16;
        if (entered < 0 || entered > bound) bad.push(`${v} px/ms at ${hz} Hz: ${entered < 0 ? "never entered" : `entered at ${Math.round(entered)} px, over ${Math.round(bound)}`}`);
      }
      for (const hz of [1000, 2000]) if (Math.abs(at[hz]! - at[8000]!) > v * 4 + 1) bad.push(`${v} px/ms: entered at ${at[hz]!.toFixed(1)} px at ${hz} Hz, ${at[8000]!.toFixed(1)} px at 8 kHz`);
    }
    expect(bad).toEqual([]);
  });

  it("(b) every fling at 2.4 px/ms or faster never enters the rail while it lasts, at any rate", () => {
    const bad: string[] = [];
    for (const v of [2.4, 3, 4])
      for (const hz of RATES) {
        const { entered } = drive(v, hz);
        if (entered >= 0) bad.push(`${v} px/ms at ${hz} Hz: entered at ${Math.round(entered)} px`);
      }
    expect(bad).toEqual([]);
  });

  it("(c) a host updating per animation frame as well as per pointer sample gets the frames the pointer samples alone give", () => {
    const bad: string[] = [];
    for (const v of [1.2, 3])
      for (const hz of [1000, 2000, 8000]) {
        const alone = drive(v, hz).frames;
        const both = drive(v, hz, 60).frames;
        if (alone.join("\n") !== both.join("\n")) bad.push(`${v} px/ms at ${hz} Hz`);
      }
    expect(bad).toEqual([]);
  });
});
