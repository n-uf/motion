/**
 * The states the landing model names, on its own (no docking): the Near lane's would-land state, the corner owner by
 * reach under "all", and the trail gate reading `landingOf` the spot held. The geometry here lands a spot somewhere
 * other than its listed landing where it matters, so each rule is pinned to what the model reads.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, LANDING_APPROACH, type LandingFrame, type LandingOptions, type LandingRegions, type LandingState } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * A 1000 × 640 window: a bottom bar (y 600–640) with two spots, `A` (x 0–500, sliding: it lands where the hand is) and
 * `B` (x 500–1000, fixed; another key, so a change between them reflows), and a refused strip right above the bar
 * (y 520–600, x 600–1000) next to open content.
 */
function regions(): LandingRegions {
  return {
    lanes: [
      {
        id: "bottom",
        rect: rect(0, 600, 1000, 40),
        axis: "x",
        spots: [
          { id: "bottom/A", along: [0, 500], landing: rect(8, 604, 100, 32), others: "a" },
          { id: "bottom/B", along: [500, 1000], landing: rect(600, 604, 100, 32), others: "b" },
        ],
        refused: [],
      },
    ],
    refused: [rect(600, 520, 400, 80)],
    content: rect(0, 0, 1000, 600),
    blocked: [rect(600, 520, 400, 80)],
    stage: rect(0, 0, 1000, 640),
    item: { width: 100, height: 32 },
  };
}
/** `A` lands at the hand (its start at the pointer less 50, clamped to 0–400); `B` at its listed landing. */
const atHand = (s: LandingState): Rect | null => (s.kind !== "spot" ? null : s.spot === "bottom/A" ? rect(Math.min(400, Math.max(0, s.point.x - 50)), 604, 100, 32) : rect(600, 604, 100, 32));
const opts = (more: Partial<LandingOptions> = {}): LandingOptions => ({ regions: regions(), landingOf: atHand, ...more });

/** Frames along `points` at `speed` px/ms, every 8 ms, then `rest` ms still. */
function play(o: LandingOptions, points: readonly Point[], speed: number, rest = 0): { p: Point; f: LandingFrame }[] {
  const m = createLandingModel(o);
  const out: { p: Point; f: LandingFrame }[] = [];
  let t = 0;
  out.push({ p: points[0]!, f: m.update(points[0]!, t) });
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / speed / 8));
    for (let i = 1; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      out.push({ p, f: m.update(p, (t += 8)) });
    }
  }
  for (let r = 8; r <= rest; r += 8) out.push({ p: points.at(-1)!, f: m.update(points.at(-1)!, (t += 8)) });
  return out;
}

describe("landing model: the states it names", () => {
  it('"near": an approached lane stands for the state the pointer would land in there, the spot it picks along it', () => {
    // In open space, 4 px above the bar (within the 6 px it acquires at), over A's stretch and then B's.
    for (const [x, spot] of [
      [300, "bottom/A"],
      [550, "bottom/B"],
    ] as const) {
      const p = { x, y: 596 };
      const last = play(opts({ placeGuides: "near" }), [{ x, y: 300 }, p], 0.2, 40).at(-1)!.f;
      expect([last.region, last.lane]).toEqual(["open", null]);
      expect(last.guides).toEqual([{ lane: "bottom", state: { kind: "spot", lane: "bottom", spot, point: p } }]);
    }
  });

  it('"all": over a refused place the corner goes to the nearest lane within reach, switching exactly at reach', () => {
    const reach = LANDING_APPROACH.reach;
    const ownerAt = (d: number): string | undefined => {
      const p = { x: 800, y: 600 - d };
      const f = play(opts({ placeGuides: "all" }), [{ x: 800, y: 530 }, p], 0.2, 40).at(-1)!.f;
      expect([d, f.region, f.lane]).toEqual([d, "refused", null]);
      return f.guides.find((g) => g.state !== f.state)?.lane;
    };
    expect(ownerAt(reach - 1)).toBe("bottom");
    expect(ownerAt(reach)).toBe("bottom");
    expect(ownerAt(reach + 1)).toBeUndefined();
    // The owner stands for its would-land state: the spot the pointer picks along it.
    const p = { x: 800, y: 600 - reach };
    const f = play(opts({ placeGuides: "all" }), [{ x: 800, y: 530 }, p], 0.2, 40).at(-1)!.f;
    expect(f.guides.find((g) => g.lane === "bottom")!.state).toEqual({ kind: "spot", lane: "bottom", spot: "bottom/B", point: p });
  });

  it("the trail gate reads landingOf the spot held: a sliding landing at the hand doesn't trail, so a fast reflowing change waits", () => {
    const home = { lane: "bottom", spot: "bottom/A" };
    // Held on A at x 300, then fast (0.6 px/ms) to 520, past the cut at 500 and its 6 px margin.
    const path = [{ x: 300, y: 620 }, { x: 520, y: 620 }];
    const fast = play(opts({ home }), path, 0.6);
    const past = fast.filter((x) => x.p.x > 506);
    expect(past.length).toBeGreaterThan(0);
    // A lands at the hand, clamped at 400–500: within 40 px of the pointer at 520, so the spot holds.
    for (const x of past) expect([Math.round(x.p.x), x.f.spot]).toEqual([Math.round(x.p.x), "bottom/A"]);
    // The listed landing (x 8–108) would read as trailing: with a geometry that lands A there, the change is taken.
    const listed = play(opts({ home, landingOf: (s) => (s.kind === "spot" && s.spot === "bottom/A" ? rect(8, 604, 100, 32) : atHand(s)) }), path, 0.6);
    expect(listed.filter((x) => x.p.x > 506).some((x) => x.f.spot === "bottom/B")).toBe(true);
  });
});
