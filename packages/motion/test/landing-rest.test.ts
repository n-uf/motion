import { describe, expect, it } from "vitest";
import type { Rect } from "../src/shapes";
import { createLandingModel, type LandingLane, type LandingRegions } from "../src/drag";
import { listed } from "./listed-geometry";
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * A flick up an empty rail from the bar under it, then a rest. The rail's band lies over a column that takes nothing, so
 * its over-refused rule enters it on the first slow step, and the held bar's takeover consults the same rule: across the
 * rail (x 14 to 28, where the depth across it may be under the still gate's 8 px), let go at once it is refused and goes
 * home, and after an 80 ms rest the rail takes it.
 */
describe("landing model: a flick that rests in an empty rail's band docks in it", () => {
  const regions = (): LandingRegions => {
    const bottom: LandingLane = { id: "bottom", rect: rect(0, 599, 868, 31), axis: "x", spots: [{ id: "bottom/home", along: [0, 868], landing: rect(8, 599, 362, 31) }], refused: [] };
    const rail: LandingLane = { id: "rail-left", rect: rect(0, 0, 30, 599), axis: "y", spots: [{ id: "rail-left/start", along: [0, 599], landing: rect(0, 242, 30, 121) }], refused: [] };
    return { lanes: [bottom, rail], refused: [], content: rect(0, 0, 868, 599), blocked: [rect(12, 12, 220, 575)], stage: rect(0, 0, 868, 630) };
  };
  // Panels' grip at x 25, flicked at 3 px/ms straight up to (x, 301); the host updates every 16 ms with the same point.
  const flick = (x: number, restMs: number) => {
    const m = createLandingModel({ ...listed(regions()), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 } });
    m.update({ x: 25, y: 614 }, 0);
    for (let i = 1; i <= 7; i++) m.update({ x: 25 + ((x - 25) * i) / 7, y: 614 - (313 * i) / 7 }, 16 * i);
    const at = m.frame;
    for (let t = 128; t <= 112 + restMs; t += 16) m.update({ x, y: 301 }, t);
    return { at, m };
  };
  for (const x of [14, 22, 25, 28])
    it(`at x ${x}: let go at once it is refused and goes home; after 80 ms of rest the rail takes it`, () => {
      const { at, m } = flick(x, 0);
      expect([at.region, at.pending]).toEqual(["refused", undefined]);
      expect(m.release({ x, y: 301 }, 112)).toBeNull();
      const rested = flick(x, 80);
      expect(rested.m.frame.lane).toBe("rail-left");
      expect(rested.m.release({ x, y: 301 }, 192)).toMatchObject({ kind: "spot", lane: "rail-left" });
    });

  // A real hand's jitter after the flick: samples every 16 ms, `d` px apart. After the hand reads faster than
  // `gates.slideSpeed` no lane is entered by a slow-step gate until it has read slow for `pause` (60 ms); the hand's speed
  // reads a slow-down only once it has lasted its span (80 ms at 60 Hz). So the jitter docks nothing at once.
  for (const d of [0.3, 1.5, 3])
    it(`a flick then ${d} px of jitter: no entry before the hand reads slow for 60 ms, then the rail; let go at once it goes home`, () => {
      const make = () => {
        const m = createLandingModel({ ...listed(regions()), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 } });
        m.update({ x: 25, y: 614 }, 0);
        // 3 px/ms up to (14, 301), the last fast sample at 112 ms.
        for (let i = 1; i <= 7; i++) m.update({ x: 25 - (11 * i) / 7, y: 614 - (313 * i) / 7 }, 16 * i);
        return m;
      };
      const first = make();
      first.update({ x: 14, y: 301 + d }, 128);
      expect(first.frame.lane).not.toBe("rail-left");
      expect(first.release({ x: 14, y: 301 + d }, 128)).toBeNull();
      const m = make();
      const lanes: (string | null)[] = [];
      for (let k = 1; k <= 16; k++) lanes.push(m.update({ x: 14, y: 301 + (k % 2) * d }, 112 + 16 * k).lane);
      // Nothing for 60 ms of slow motion (samples at 128 to 160), nor until the hand reads slow; the rail by 304 ms.
      expect(lanes.slice(0, 3)).not.toContain("rail-left");
      expect(lanes.slice(11)).toEqual(Array(5).fill("rail-left"));
    });
});
