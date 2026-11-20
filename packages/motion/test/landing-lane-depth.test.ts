/**
 * Depth is measured across a lane, not from its ends. How deep the pointer lies in a lane counts only the sides parallel
 * to the lane's axis that face into the stage (a rail's two long sides): its ends along its own axis never count, even
 * where they meet another lane. So a still pointer just above the end of a rail where it meets a bar is as deep in the
 * rail as anywhere else along it, while a fast pass across a thin rail or bar still opens nothing.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, type LandingFrame, type LandingLane, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const spot = (id: string, landing: Rect, along: readonly [number, number]) => ({ id, along, landing, others: "k" });

/** A 28 px rail at the left (y 0-550) ending at a 41 px deck bar (y 550-591) along the bottom; a refused column beside the rail. */
function window(): LandingRegions {
  const rail: LandingLane = { id: "rail", axis: "y", rect: rect(0, 0, 28, 550), refused: [], spots: [spot("rail/s", rect(0, 0, 28, 99), [0, 550])] };
  const deck: LandingLane = { id: "deck", axis: "x", rect: rect(0, 550, 1240, 41), refused: [], spots: [spot("deck/s", rect(8, 550, 99, 41), [0, 1240])] };
  return {
    lanes: [rail, deck],
    refused: [rect(28, 0, 280, 550)],
    content: rect(0, 0, 1240, 550),
    blocked: [rect(0, 0, 28, 550), rect(28, 0, 280, 550)],
    stage: rect(0, 0, 1240, 591),
    item: { width: 28, height: 99 },
  } as LandingRegions;
}

/** Plays `keys` (time ms, x, y) one frame each, in 16 ms steps between them. */
function play(keys: readonly (readonly [number, number, number])[]): { p: Point; f: LandingFrame }[] {
  const m = createLandingModel({ regions: window(), grab: { x: 14, y: 7 } });
  const out: { p: Point; f: LandingFrame }[] = [];
  let t = keys[0]![0];
  for (let k = 0; k < keys.length; k++) {
    const to = keys[k]!;
    const from = keys[Math.max(0, k - 1)]!;
    const n = k === 0 ? 1 : Math.max(1, Math.round((to[0] - from[0]) / 16));
    for (let i = 1; i <= n; i++) {
      const p = { x: from[1] + ((to[1] - from[1]) * i) / n, y: from[2] + ((to[2] - from[2]) * i) / n };
      out.push({ p, f: m.update(p, (t = from[0] + ((to[0] - from[0]) * i) / n)) });
    }
  }
  return out;
}
const path = (pts: readonly Point[], speed: number): [number, number, number][] => {
  let t = 0;
  return pts.map((p, i) => {
    if (i > 0) t += Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) / speed;
    return [t, p.x, p.y];
  });
};

describe("landing: depth counts across the lane, not from its ends", () => {
  it("a still pointer 6 px above the end of a rail where it meets a bar enters the rail", () => {
    // Over the document, then at the rail's middle line 6 px above its end, and held: 14 px from each long side.
    const keys: [number, number, number][] = [[0, 1200, 20], [600, 300, 413], [1100, 14, 544], [1700, 14, 544]];
    const last = play(keys).at(-1)!;
    expect([last.p, last.f.region, last.f.lane]).toEqual([{ x: 14, y: 544 }, "lane", "rail"]);
  });

  it("a fast pass across a thin rail, near its end, opens no room", () => {
    for (const speed of [1.5, 3, 5]) {
      const frames = play(path([{ x: 300, y: 544 }, { x: -30, y: 544 }], speed));
      expect(frames.some((x) => x.f.lane === "rail" && x.p.x >= 0), `${speed}`).toBe(false);
    }
  });

  it("a fast pass along the bar under the rail's end opens no rail", () => {
    for (const speed of [1.5, 3, 5]) {
      const frames = play(path([{ x: 400, y: 544 }, { x: 14, y: 544 }, { x: 14, y: 520 }], speed));
      expect(frames.some((x) => x.f.lane === "rail"), `${speed}`).toBe(false);
    }
  });
});
