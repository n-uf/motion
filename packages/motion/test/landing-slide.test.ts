/**
 * Sliding spots: a free stretch exposed as one spot (`LandingSpot.slide`). Over it the landing follows the pointer less
 * the grab, clamped to the stretch and snapped to its ends and the item's own place within the snap distance; a step
 * comes only where the order changes (passing a neighbor); a release reads where the landing starts (`at`) once.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, SNAP_DISTANCE, type LandingFrame, type LandingOptions, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * A bar (x 0–1000, y 0–32) holding one neighbor `n` (x 400–500) and the held item (100 × 28) at x 150, 4 px gaps, 8 px
 * pads: the stretch before `n` slides from 8 to 296 (home at 150), the one after it from 504 to 892.
 */
function regions(): LandingRegions {
  const lane = rect(0, 0, 1000, 32);
  return {
    lanes: [
      {
        id: "top",
        rect: lane,
        axis: "x",
        spots: [
          { id: "top/start/^|n@slide", along: [0, 450], landing: rect(150, 2, 100, 28), others: "n", slide: { from: 8, to: 296, snaps: [8, 150, 296] } },
          { id: "top/start/n|$@slide", along: [450, 1000], landing: rect(504, 2, 100, 28), others: "n", slide: { from: 504, to: 892, snaps: [504, 892] } },
        ],
        refused: [],
      },
    ],
    refused: [],
    content: rect(0, 32, 1000, 568),
    blocked: [lane],
    stage: rect(0, 0, 1000, 600),
    item: { width: 100, height: 28 },
  };
}
const HOME = { lane: "top", spot: "top/start/^|n@slide" };
const GRAB = { x: 30, y: 14 };
const PRESS = { x: 150 + GRAB.x, y: 16 };
const opts = (more: Partial<LandingOptions> = {}): LandingOptions => ({ regions: regions(), home: HOME, grab: GRAB, ...more });

/** Every 8 ms from the press through `points` at `speed` px/ms, then `rest` ms held still: each frame and the release. */
function drive(o: LandingOptions, points: readonly Point[], speed = 0.2, rest = 200) {
  const m = createLandingModel(o);
  const frames: { p: Point; f: LandingFrame }[] = [];
  let t = 0;
  frames.push({ p: points[0]!, f: m.update(points[0]!, t) });
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (speed * 8)));
    for (let i = 1; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      frames.push({ p, f: m.update(p, (t += 8)) });
    }
  }
  for (let s = 0; s < rest; s += 8) frames.push({ p: points.at(-1)!, f: m.update(points.at(-1)!, (t += 8)) });
  return { frames, release: m.release() };
}
const at = (x: number): Point => ({ x, y: PRESS.y });

describe("landing model: sliding spots", () => {
  it("glides freely: along the stretch the landing starts at the pointer less the grab (distance 0), with no steps", () => {
    const { frames } = drive(opts(), [PRESS, at(326)]);
    let free = 0;
    for (const { p, f } of frames) {
      expect(f.spot).toBe(HOME.spot);
      const want = Math.min(296, Math.max(8, p.x - GRAB.x));
      const snapped = [8, 150, 296].some((q) => Math.abs(q - want) <= SNAP_DISTANCE);
      if (snapped) continue;
      expect(f.landing!.x).toBeCloseTo(want, 9);
      // The pointer holds the landing where the item was grabbed.
      expect(f.landing!.x + GRAB.x - p.x).toBeCloseTo(0, 9);
      free++;
    }
    expect(free).toBeGreaterThan(50);
  });

  it("snaps within the snap distance to either end and to the item's own place, and clamps past the ends", () => {
    const land = (x: number): number => drive(opts(), [PRESS, at(x + GRAB.x)]).frames.at(-1)!.f.landing!.x;
    expect(land(8 + 5)).toBe(8);
    expect(land(296 - 7)).toBe(296);
    expect(land(150 + 7)).toBe(150);
    expect(land(150 - 8)).toBe(150);
    expect(land(150 + 9)).toBe(159);
    expect(land(8 + 9)).toBe(17);
    // Past an end: clamped to it.
    expect(land(-40)).toBe(8);
    // In the stretch after the neighbor, its own ends.
    expect(land(504 + 6)).toBe(504);
    expect(land(892 - 8)).toBe(892);
    // A snap distance of its own.
    const narrow = regions();
    const spots = narrow.lanes[0]!.spots.map((s) => ({ ...s, slide: { ...s.slide!, snapDistance: 2 } }));
    const o = opts({ regions: { ...narrow, lanes: [{ ...narrow.lanes[0]!, spots }] } });
    expect(drive(o, [PRESS, at(157 + GRAB.x)]).frames.at(-1)!.f.landing!.x).toBe(157);
  });

  it("a press, a wobble of ±6 px and a release is home", () => {
    const wobble: Point[] = [PRESS];
    for (let k = 0; k < 6; k++) wobble.push(at(PRESS.x + 6), at(PRESS.x - 6));
    for (const end of [PRESS.x + 6, PRESS.x - 6, PRESS.x + 3]) {
      const { frames, release } = drive(opts(), [...wobble, at(end)], 0.3, 40);
      expect(release).toEqual({ kind: "spot", lane: "top", spot: HOME.spot, home: true, at: 150 });
      expect(frames.every(({ f }) => f.spot === HOME.spot)).toBe(true);
    }
    // Pressed off its middle, with no grab given: the middle, so the press at its middle is home.
    expect(drive(opts({ grab: undefined }), [at(200), at(206), at(200)]).release).toEqual({ kind: "spot", lane: "top", spot: HOME.spot, home: true, at: 150 });
  });

  it("passing a neighbor is one step, and the landing follows the pointer again past it", () => {
    const { frames } = drive(opts(), [PRESS, at(760)]);
    const steps = frames.map(({ f }) => f.spot).filter((s, i, a) => i === 0 || s !== a[i - 1]);
    expect(steps).toEqual(["top/start/^|n@slide", "top/start/n|$@slide"]);
    const last = frames.at(-1)!;
    expect(last.f.landing!.x).toBe(760 - GRAB.x);
  });

  it("release() gives where the landing starts, whole px, and home only at the item's own place", () => {
    expect(drive(opts(), [PRESS, at(250.4)]).release).toEqual({ kind: "spot", lane: "top", spot: HOME.spot, home: false, at: 220 });
    expect(drive(opts(), [PRESS, at(250.6)]).release).toEqual({ kind: "spot", lane: "top", spot: HOME.spot, home: false, at: 221 });
    expect(drive(opts(), [PRESS, at(700)]).release).toEqual({ kind: "spot", lane: "top", spot: "top/start/n|$@slide", home: false, at: 670 });
    // A spot with no slide releases as before: no `at`.
    const plain = regions();
    const spots = plain.lanes[0]!.spots.map(({ slide: _s, ...s }) => s);
    expect(drive(opts({ regions: { ...plain, lanes: [{ ...plain.lanes[0]!, spots }] } }), [PRESS, at(250)]).release).toEqual({ kind: "spot", lane: "top", spot: HOME.spot, home: true });
  });
});
