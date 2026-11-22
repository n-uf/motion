/**
 * The landing model's Near guides show a lane only where the pointer can enter it: the lane holds the pointer (also on
 * its own refused stretch), or the pointer is inside it and hasn't entered yet (pending), or the pointer is in open
 * space within `approach.reach` of it, which defaults to the entry margin (`LANDING_MARGINS.exit`, 12 px). Over a
 * refused place outside the lane no Near guide shows, however near or far the lane behind it lies.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, LANDING_APPROACH, LANDING_MARGINS, LANDING_TOUCH_MARGINS, type LandingFrame, type LandingLane, type LandingOptions, type LandingRegions } from "../src/drag";
import { listed, NEAR } from "./listed-geometry";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * A 1080 × 640 window: an empty 30 px left rail (y 32–608) whose band lies over a 250 px panel column that takes
 * toolbars nowhere (refused), and a bottom bar (y 604–640) with room along it. Open space is the page between them.
 */
function window(): LandingRegions {
  const rail: LandingLane = {
    id: "rail",
    rect: rect(0, 32, 30, 576),
    axis: "y",
    spots: [{ id: "rail/end", along: [32, 608], landing: rect(0, 32, 30, 102) }],
    refused: [],
  };
  const bottom: LandingLane = {
    id: "bottom",
    rect: rect(0, 604, 1080, 36),
    axis: "x",
    spots: [{ id: "bottom/start", along: [0, 1080], landing: rect(8, 604, 102, 36) }],
    refused: [],
  };
  const column = rect(0, 32, 250, 572);
  return {
    lanes: [rail, bottom],
    refused: [column],
    content: rect(250, 32, 830, 572),
    blocked: [column],
    stage: rect(0, 0, 1080, 640),
  };
}
const FLOAT = (p: Point): Rect => rect(p.x - 51, p.y - 15, 102, 30);
const options = (more: Partial<LandingOptions> = {}): LandingOptions => ({ ...listed(window(), FLOAT), preview: NEAR, ...more });

/** Keys [ms, x, y] linearly between, a frame every 8 ms; the last frame. */
function last(o: LandingOptions, keys: readonly (readonly [number, number, number])[]): { f: LandingFrame; p: Point } {
  const m = createLandingModel(o);
  let f!: LandingFrame;
  let p!: Point;
  for (let t = 0; t <= keys.at(-1)![0] + 1e-6; t += 8) {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1]![0] < t) i++;
    const a = keys[i]!;
    const b = keys[Math.min(i + 1, keys.length - 1)]!;
    const u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 1;
    p = { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u };
    f = m.update(p, t);
  }
  return { f, p };
}
/** From the page at (600, 300) down to (600, y), slowly, then still for 200 ms. */
const down = (y: number): [number, number, number][] => [[0, 600, 300], [600, 600, y], [800, 600, y]];
const lanesOf = (f: LandingFrame): string[] => [...new Set(f.guides.map((g) => g.lane))];

describe("landing model: Near guides show a lane only where the pointer can enter it", () => {
  it("the approach's default reach is the entry margin, 12 px", () => {
    expect(LANDING_APPROACH.reach).toBe(LANDING_MARGINS.exit);
    expect(LANDING_APPROACH.reach).toBe(12);
  });

  it("over a refused place no lane's guides show, however near or far the lane behind it lies", () => {
    for (const x of [60, 140, 240]) {
      const { f } = last(options(), [[0, 600, 300], [400, x, 300], [700, x, 300]]);
      expect([x, f.region, lanesOf(f)]).toEqual([x, "refused", []]);
    }
  });

  it("in open space a lane's guides show only within reach of its rect: 4 px above the bottom bar, not 40", () => {
    // (Acquired within `reach - margins.spot`, 6 px, and kept to `reach`, 12 px: see the blink test below.)
    const near = last(options(), down(600));
    expect([near.f.region, lanesOf(near.f)]).toEqual(["open", ["bottom"]]);
    const far = last(options(), down(564));
    expect([far.f.region, lanesOf(far.f)]).toEqual(["open", []]);
  });

  it("a host that wants the early guide sets `approach.reach`", () => {
    const early = last(options({ approach: { reach: 80 } }), down(564));
    expect([early.f.region, lanesOf(early.f)]).toEqual(["open", ["bottom"]]);
  });

  it("a lane the pointer is inside but hasn't entered (pending) shows its guides, also over a refused place", () => {
    // A fast pass across the rail's band over the column: no room opens, the rail is pending, the place under it is refused.
    const m = createLandingModel(options());
    let f!: LandingFrame;
    for (let k = 0; k <= 21; k++) f = m.update({ x: 140 - k * 6, y: 300 }, k * 8);
    expect(f.pending).toBe("rail");
    expect(f.region).toBe("refused");
    expect(lanesOf(f)).toEqual(["rail"]);
  });

  it("the held lane's guides show on its own refused stretch too, the lane held", () => {
    const r = window();
    const lane = { ...r.lanes[0]!, refused: [{ along: [300, 400] as const }] };
    const o = options({ regions: { ...r, lanes: [lane, r.lanes[1]!] } });
    const { f } = last(o, [[0, 600, 300], [600, 15, 350], [900, 15, 350]]);
    expect([f.region, f.lane, lanesOf(f)]).toEqual(["refused", "rail", ["rail"]]);
  });

  it("at the reach's edge the guide never blinks: acquired within `reach - spot` (6 px), kept to `reach` (12 px)", () => {
    const m = createLandingModel(options());
    const shown: boolean[] = [];
    let t = 0;
    // Down to 4 px above the bottom bar (acquired), then a jitter across 12 px from it, 11 and 13 px, ten times.
    for (let y = 300; y <= 600; y += 2) m.update({ x: 600, y }, (t += 8));
    expect(lanesOf(m.frame)).toEqual(["bottom"]);
    for (let k = 0; k < 20; k++) shown.push(m.update({ x: 600, y: k % 2 ? 591 : 593 }, (t += 8)).guides.length > 0);
    // At 13 px it lets go once (only within reach), and at 11 px it is not acquired again.
    const flips = shown.filter((s, i) => i > 0 && s !== shown[i - 1]).length;
    expect(flips).toBeLessThanOrEqual(1);
    expect(shown.at(-1)).toBe(false);
  });

  it("the band never collapses: a lane is acquired within max(reach - spot, reach / 2), so a small reach or wide touch margins still show it", () => {
    // `reach` 6: acquired within 3 px (6 - 6 would be 0, never shown).
    expect(lanesOf(last(options({ approach: { reach: 6, keep: 6 } }), down(602)).f)).toEqual(["bottom"]);
    expect(lanesOf(last(options({ approach: { reach: 6, keep: 6 } }), down(600)).f)).toEqual([]);
    // Touch margins (`spot` 8) with the default reach 12: acquired within 6 px (12 - 8 would be 4).
    expect(lanesOf(last(options({ margins: LANDING_TOUCH_MARGINS }), down(599)).f)).toEqual(["bottom"]);
    expect(lanesOf(last(options({ margins: LANDING_TOUCH_MARGINS }), down(597)).f)).toEqual([]);
  });

  it("a guide goes once the pointer is past the reach: approached at 4 px and taken back up into the page, none lingers", () => {
    const m = createLandingModel(options());
    const seen: string[][] = [];
    const keys: [number, number, number][] = [[0, 600, 300], [300, 600, 600], [500, 600, 600], [900, 600, 520]];
    for (let t = 0; t <= 900; t += 8) {
      let i = 0;
      while (i < keys.length - 1 && keys[i + 1]![0] < t) i++;
      const a = keys[i]!;
      const b = keys[Math.min(i + 1, keys.length - 1)]!;
      const u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 1;
      const p = { x: 600, y: a[2] + (b[2] - a[2]) * u };
      const f = m.update(p, t);
      if (604 - p.y > 12) seen.push(lanesOf(f));
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const l of seen) expect(l).toEqual([]);
  });
});
