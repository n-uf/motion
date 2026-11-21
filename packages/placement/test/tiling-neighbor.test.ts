/** ./tiling, directional neighbor search over the rects of a layout. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { layoutSplit, neighbor, type Split } from "../src/tiling";
import { randomTree, seeded } from "./tiling-fixture";

type Direction = "left" | "right" | "up" | "down";
const DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];
const grid = new Map<string, Rect>([
  ["a", { x: 0, y: 0, width: 0.5, height: 0.5 }],
  ["b", { x: 0.5, y: 0, width: 0.5, height: 0.5 }],
  ["c", { x: 0, y: 0.5, width: 0.5, height: 0.5 }],
  ["d", { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }],
]);

describe("neighbor", () => {
  it("a 2 x 2 grid: the nearest pane that way, level with the pane before one off to a corner", () => {
    expect(DIRECTIONS.map((d) => neighbor(grid, "a", d))).toEqual([null, "b", null, "c"]);
    expect(DIRECTIONS.map((d) => neighbor(grid, "d", d))).toEqual(["c", null, "b", null]);
  });

  it("a candidate must be strictly beyond the pane's center", () => {
    const rects = new Map<string, Rect>([
      ["from", { x: 0, y: 0, width: 10, height: 10 }],
      ["same", { x: 2, y: 20, width: 6, height: 10 }],
    ]);
    // Its center x equals the pane's: not to the left or right; it is below.
    expect([neighbor(rects, "from", "left"), neighbor(rects, "from", "right"), neighbor(rects, "from", "down")]).toEqual([null, null, "same"]);
  });

  it("scores the center distance along the way, a quarter of the one across, and 100 more with no overlap across", () => {
    const rects = new Map<string, Rect>([
      ["from", { x: 0, y: 0, width: 0.2, height: 0.2 }],
      // Down and to the right with no overlap in y: 0.5 + 0.25 * 0.5 + 100.
      ["off", { x: 0.5, y: 0.5, width: 0.2, height: 0.2 }],
      // Level with it, further away: 0.85.
      ["level", { x: 0.9, y: 0, width: 0.1, height: 0.2 }],
    ]);
    expect(neighbor(rects, "from", "right")).toBe("level");
    // Without "level" the off-level pane is still the answer: the only one that way.
    rects.delete("level");
    expect(neighbor(rects, "from", "right")).toBe("off");
  });

  it("touching edges are no overlap across: a candidate sharing only an edge's line takes the 100", () => {
    const rects = new Map<string, Rect>([
      ["from", { x: 0, y: 0, width: 10, height: 10 }],
      ["touch", { x: 20, y: 10, width: 10, height: 10 }],
      ["far", { x: 60, y: 0, width: 10, height: 10 }],
    ]);
    expect(neighbor(rects, "from", "right")).toBe("far");
  });

  it("ties go to the first in the map's order; a pane that is not there, or alone, has no neighbor", () => {
    const rects = new Map<string, Rect>([
      ["from", { x: 0, y: 20, width: 10, height: 10 }],
      ["first", { x: 30, y: 0, width: 10, height: 10 }],
      ["second", { x: 30, y: 40, width: 10, height: 10 }],
    ]);
    // Both are 30 away along x and 20 across, neither overlapping: the same score.
    expect(neighbor(rects, "from", "right")).toBe("first");
    expect(neighbor(new Map([...rects].reverse()), "from", "right")).toBe("second");
    expect(neighbor(rects, "missing", "right")).toBeNull();
    expect(neighbor(new Map([["only", { x: 0, y: 0, width: 1, height: 1 }]]), "only", "up")).toBeNull();
  });

  it("rects laid out in the unit square depend on the tree's ratios only, not on gaps, sizes or fixed lengths", () => {
    const unit: Rect = { x: 0, y: 0, width: 1, height: 1 };
    const tree: Split<string> = { a: { pane: "l" }, b: { a: { pane: "t" }, b: { pane: "b" }, axis: "y", ratio: 0.9 }, axis: "x" };
    // The left pane is level with the right column's middle: the upper pane, 900 tall, has the nearer center.
    expect(neighbor(layoutSplit(tree, unit), "l", "right")).toBe("t");
    // A fixed length of 800 px does not fit in a unit square (so the split goes by its ratio); in px it makes "l" 800 wide
    // and shrinks the right column, but the neighbor is the same: the unit rects are the ones a host passes.
    const fixed = (child: Split<string>) => ("pane" in child && child.pane === "l" ? { length: 800 } : undefined);
    expect(neighbor(layoutSplit(tree, unit, { gap: 0.1, fixed }), "l", "right")).toBe("t");
    const wide = layoutSplit(tree, { x: 0, y: 0, width: 1000, height: 1000 }, { gap: 30, fixed });
    expect(wide.get("l")!.width).toBe(800);
    // Changing the ratio of the column does change it: the lower pane takes over when it is the taller.
    const lower: Split<string> = { ...tree, b: { a: { pane: "t" }, b: { pane: "b" }, axis: "y", ratio: 0.1 } };
    expect(neighbor(layoutSplit(lower, unit), "l", "right")).toBe("b");
  });
});

/** The rule written out again, with `Math.abs` and the engine's edge arithmetic (right = left + width). */
function reference(rects: ReadonlyMap<string, Rect>, from: string, direction: Direction): string | null {
  const f = rects.get(from);
  if (!f) return null;
  const cx = (r: Rect): number => (r.x + (r.x + r.width)) / 2;
  const cy = (r: Rect): number => (r.y + (r.y + r.height)) / 2;
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [k, r] of rects) {
    if (k === from) continue;
    const dx = cx(r) - cx(f);
    const dy = cy(r) - cy(f);
    const beyond = direction === "left" ? dx < 0 : direction === "right" ? dx > 0 : direction === "up" ? dy < 0 : dy > 0;
    if (!beyond) continue;
    const h = direction === "left" || direction === "right";
    const overlap = h ? Math.min(f.y + f.height, r.y + r.height) - Math.max(f.y, r.y) : Math.min(f.x + f.width, r.x + r.width) - Math.max(f.x, r.x);
    const score = (h ? Math.abs(dx) : Math.abs(dy)) + (h ? Math.abs(dy) : Math.abs(dx)) * 0.25 + (overlap > 0 ? 0 : 100);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

describe("neighbor, seeded sweeps", () => {
  it("is the lowest score among the panes beyond the center, over random layouts and random rect sets", () => {
    const rnd = seeded(91);
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 9);
      const area: Rect = { x: 0, y: 0, width: 400 + rnd() * 1000, height: 300 + rnd() * 700 };
      const l = layoutSplit(randomTree(rnd, n), area, { gap: Math.floor(rnd() * 8) });
      const named = new Map<string, Rect>([...l].map(([k, r]) => [`p${k}`, r]));
      const loose = new Map<string, Rect>(Array.from({ length: n }, (_, k) => [`p${k}`, { x: Math.floor(rnd() * 5) * 10, y: Math.floor(rnd() * 5) * 10, width: 10 + Math.floor(rnd() * 3) * 10, height: 10 + Math.floor(rnd() * 3) * 10 }] as [string, Rect]));
      for (const rects of [named, loose])
        for (const from of rects.keys())
          for (const d of DIRECTIONS) {
            const got = neighbor(rects, from, d);
            expect(got).toBe(reference(rects, from, d));
            if (got !== null) {
              const f = rects.get(from)!;
              const r = rects.get(got)!;
              const dx = r.x + r.width / 2 - (f.x + f.width / 2);
              const dy = r.y + r.height / 2 - (f.y + f.height / 2);
              expect(d === "left" ? dx < 0 : d === "right" ? dx > 0 : d === "up" ? dy < 0 : dy > 0).toBe(true);
            }
          }
    }
  });
});
