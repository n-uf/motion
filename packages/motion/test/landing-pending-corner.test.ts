/**
 * The pending lane at a corner where two lanes overlap: inside both and entering neither, the pending lane holds while
 * the pointer stays inside it, and the other lane takes over only once it is deeper by `margins.spot` (6 px). So a
 * wobble across the corner's diagonal never flips `pending`, nor the Near guides with it.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, type LandingFrame, type LandingRegions } from "../src/drag";
import { listed, NEAR } from "./listed-geometry";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/** An 800 × 600 window: an empty top bar's band (y 0–36) and an empty left rail's (x 0–30) overlapping at the corner. */
const regions = (): LandingRegions => ({
  lanes: [
    { id: "top", rect: rect(0, 0, 800, 36), axis: "x", spots: [{ id: "top/start", along: [0, 800], landing: rect(0, 0, 100, 36) }], refused: [] },
    { id: "rail", rect: rect(0, 0, 30, 600), axis: "y", spots: [{ id: "rail/start", along: [0, 600], landing: rect(0, 0, 30, 100) }], refused: [] },
  ],
  refused: [],
  content: rect(30, 36, 770, 564),
  blocked: [],
  stage: rect(0, 0, 800, 600),
});

/** The frames along `path`, 6 px each 8 ms (0.75 px/ms: never slow, never still, so neither lane is entered). */
function frames(path: readonly Point[]): LandingFrame[] {
  const m = createLandingModel({ ...listed(regions()), preview: NEAR });
  const out: LandingFrame[] = [m.update(path[0]!, 0)];
  let t = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let k = 1; k <= n; k++) out.push(m.update({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, (t += 8)));
  }
  return out;
}

describe("landing model: the pending lane holds at a corner where two lanes overlap", () => {
  it("a zigzag inside both lanes, between a point deeper in the bar and one a pixel deeper in the rail: the bar stays pending, its guides stay", () => {
    const zig = [0, 1, 2, 3, 4].flatMap(() => [{ x: 20, y: 27 }, { x: 26, y: 21 }]);
    const fs = frames([{ x: 300, y: 300 }, { x: 26, y: 21 }, ...zig]);
    const inside = fs.filter((f) => f.pending);
    expect(inside.length).toBeGreaterThan(10);
    expect(fs.every((f) => f.lane === null)).toBe(true);
    expect(new Set(inside.map((f) => f.pending))).toEqual(new Set(["top"]));
    for (const f of inside) expect([...new Set(f.guides.map((g) => g.lane))]).toEqual(["top"]);
  });

  it("the other lane takes over once it is deeper by the spot margin", () => {
    // Down the rail, out of the bar's band: deeper in the rail by more than 6 px, then out of the bar altogether.
    const fs = frames([{ x: 300, y: 300 }, { x: 26, y: 21 }, { x: 10, y: 32 }]);
    expect(fs.at(-1)!.pending).toBe("rail");
  });
});
