/**
 * The Near lane's guide leaves out the held toolbar at its landing. Where the landing lies at its clamp (a sliding
 * spot's start, the bar's padding before it), the part left before it is a stub no longer than `MIN_BOX_LENGTH` (8 px):
 * no room, so it is not drawn (a host's `guideRects`, insetting it, would read it as a box across the lane and keep it).
 * A part of 10 px or more is drawn. The part after the landing keeps its id, `<id>#2`.
 */
import { describe, expect, it } from "vitest";
import type { Rect } from "../src/shapes";
import { createLandingModel, type LandingLane, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/** An empty 31 px top bar over an 868 px window: one sliding spot from x 8 to 758 (a 102 px toolbar), its box 0–868. */
function regions(): LandingRegions {
  const top: LandingLane = {
    id: "top",
    rect: rect(0, 0, 868, 31),
    axis: "x",
    spots: [{ id: "top/start/^|$@slide", along: [0, 868], landing: rect(8, 0, 102, 31), slide: { from: 8, to: 758, snaps: [8, 758] } }],
    refused: [],
    marks: [{ id: "top/box/^|$", kind: "box", rect: rect(0, 0, 868, 31) }],
  };
  return { lanes: [top], refused: [], content: rect(0, 31, 868, 600), blocked: [], stage: rect(0, 0, 868, 631), item: { width: 102, height: 31 } };
}

/** Held in the bar (entered slowly from below at x `x`, the grab at the toolbar's middle), the bar's guides. */
function heldAt(x: number) {
  const m = createLandingModel({ regions: regions(), grab: { x: 51, y: 15 }, placeGuides: "near" });
  let t = 0;
  for (let y = 120; y >= 15; y -= 1) m.update({ x, y }, (t += 8));
  for (let k = 0; k < 10; k++) m.update({ x, y: 15 }, (t += 8));
  return m.frame;
}

describe("landing model: the Near guide cut at the landing leaves no stub", () => {
  it("away from the clamp: the part before the landing is <id>, the part after <id>#2, both flush with the landing", () => {
    const f = heldAt(300);
    expect(f.lane).toBe("top");
    const l = f.landing!;
    expect(f.guides.map((g) => [g.id, g.rect])).toEqual([
      ["top/box/^|$", rect(0, 0, l.x, 31)],
      ["top/box/^|$#2", rect(l.x + l.width, 0, 868 - l.x - l.width, 31)],
    ]);
  });

  it("at the clamp (the landing at the bar's padding, x 8): no 8 px stub before it, the part after it alone, <id>#2", () => {
    const f = heldAt(40);
    expect(f.lane).toBe("top");
    expect(f.landing!.x).toBe(8);
    expect(f.guides.map((g) => [g.id, g.rect])).toEqual([["top/box/^|$#2", rect(110, 0, 758, 31)]]);
  });

  it("a little past the clamp (the landing at x 25): the 25 px before it is drawn, <id>, though shorter than the bar is thick", () => {
    const f = heldAt(76);
    expect(f.landing!.x).toBe(25);
    expect(f.guides.map((g) => [g.id, g.rect])).toEqual([
      ["top/box/^|$", rect(0, 0, 25, 31)],
      ["top/box/^|$#2", rect(127, 0, 741, 31)],
    ]);
  });
});
