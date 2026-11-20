import { describe, expect, it } from "vitest";
import type { Rect } from "../src/shapes";
import { createLandingModel, type LandingLane, type LandingRegions } from "../src/drag";
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * The hold through a touching lane is for crossing a corner. A fast flick up an empty rail from the bar under it doesn't
 * enter the rail (a fling is no entry), so the bar still holds; but far beyond it (more than `path`, 40 px, past its exit
 * margin) the frame says so: held but refused, the lane kept (its guides stay), no spot, no landing, nothing pending, and
 * a release goes home. The host shows its "Can't go here" tag.
 */
describe("landing model: far beyond the held lane, the frame is held but refused", () => {
  const regions = (): LandingRegions => {
    const bottom: LandingLane = { id: "bottom", rect: rect(0, 599, 868, 31), axis: "x", spots: [{ id: "bottom/home", along: [0, 868], landing: rect(8, 599, 362, 31) }], refused: [] };
    const rail: LandingLane = { id: "rail-left", rect: rect(0, 0, 30, 599), axis: "y", spots: [{ id: "rail-left/start", along: [0, 599], landing: rect(0, 242, 30, 121) }], refused: [] };
    return { lanes: [bottom, rail], refused: [], content: rect(0, 0, 868, 599), blocked: [rect(12, 12, 220, 575)], stage: rect(0, 0, 868, 630), item: { width: 362, height: 31 } };
  };
  it("a flick up the rail, held 288 px from its bar, shows the refused place and releases home", () => {
    const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 }, grab: { x: 17, y: 15 } });
    m.update({ x: 25, y: 614 }, 0);
    for (let i = 1; i <= 7; i++) m.update({ x: 25 - (11 * i) / 7, y: 614 - (313 * i) / 7 }, 16 * i);
    const f = m.frame;
    expect(f.region).toBe("refused"); // the host's "Can't go here" tag shows for refused with no `pending`
    expect(f.pending).toBeUndefined();
    expect(f.landing).toBeNull();
    expect(m.release()).toBeNull(); // goes home
    expect(f.lane).toBe("bottom");
    expect(f.spot).toBeNull();
  });
});
