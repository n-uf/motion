import { describe, expect, it } from "vitest";
import type { Rect } from "../src/shapes";
import { createLandingModel, type LandingLane, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * A host's flick: a toolbar lifted from its grip at the bottom bar's start (x 25, directly under the empty left rail),
 * flicked at 3 px/ms up the rail to its middle and let go at once. The window is a host kit's: 868 wide, a 31 px bottom bar
 * (the item's home), an empty 30 px rail whose band lies over the left column (which takes no toolbar).
 */
describe("landing model: a fast flick up a rail from the bar under it", () => {
  const regions = (): LandingRegions => {
    const bottom: LandingLane = { id: "bottom", rect: rect(0, 599, 868, 31), axis: "x", spots: [{ id: "bottom/home", along: [0, 868], landing: rect(8, 599, 362, 31) }], refused: [] };
    const rail: LandingLane = { id: "rail-left", rect: rect(0, 0, 30, 599), axis: "y", spots: [{ id: "rail-left/start", along: [0, 599], landing: rect(0, 242, 30, 121) }], refused: [] };
    return { lanes: [bottom, rail], refused: [], content: rect(0, 0, 868, 599), blocked: [rect(12, 12, 220, 575)], stage: rect(0, 0, 868, 630), item: { width: 362, height: 31 } };
  };
  const flick = (restMs: number) => {
    // (The fast slide rule is capped at `gates.slide`, 2 px/ms: this flick is 24 px per 8 ms.)
    const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 }, grab: { x: 17, y: 15 } });
    m.update({ x: 25, y: 614 }, 0);
    // 3 px/ms, a frame every 16 ms: 48 px a frame, from (25, 614) to (14, 301) in 7 frames.
    for (let i = 1; i <= 7; i++) m.update({ x: 25 - (11 * i) / 7, y: 614 - (313 * i) / 7 }, 16 * i);
    // The hand stays at (14, 301) for `restMs`, a frame every 16 ms.
    for (let t = 112 + 16; t <= 112 + restMs; t += 16) m.update({ x: 14, y: 301 }, t);
    return m;
  };

  it("let go at once, it is no entry: the item stays where it was held (a fast pass docks nowhere)", () => {
    const m = flick(0);
    expect(m.frame.lane).not.toBe("rail-left");
    expect(m.release()).toMatchObject({ kind: "spot", lane: "bottom", home: true });
  });

  it("held there past `pause`, the rail takes it by its still gate", () => {
    const m = flick(80);
    expect(m.frame.lane).toBe("rail-left");
    expect(m.release()).toMatchObject({ kind: "spot", lane: "rail-left", spot: "rail-left/start", home: false });
  });
});
