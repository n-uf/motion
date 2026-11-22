/** ./tiling, the master area's clamps a host reuses: `masterRatio` and `masterCount`, the ones `masterStack` applies. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { layoutSplitTree, masterCount, masterRatio, masterStack, type Split } from "../src/tiling";
import { seeded } from "./tiling-fixture";

const AREA: Rect = { x: 0, y: 0, width: 1000, height: 400 };

describe("masterRatio", () => {
  it("is clamped to 0.05..0.95, a ratio left out or not finite is 0.5", () => {
    expect(masterRatio(0.3)).toBe(0.3);
    expect(masterRatio(0)).toBe(0.05);
    expect(masterRatio(-4)).toBe(0.05);
    expect(masterRatio(1)).toBe(0.95);
    expect(masterRatio(7)).toBe(0.95);
    expect(masterRatio(0.05)).toBe(0.05);
    expect(masterRatio(0.95)).toBe(0.95);
    expect(masterRatio(undefined)).toBe(0.5);
    expect(masterRatio(Number.NaN)).toBe(0.5);
    expect(masterRatio(Number.POSITIVE_INFINITY)).toBe(0.5);
    expect(masterRatio(Number.NEGATIVE_INFINITY)).toBe(0.5);
  });

  it("is the share masterStack gives the master area, in a row and in a column", () => {
    const rnd = seeded(31);
    for (let i = 0; i < 300; i++) {
      const ratio = rnd() < 0.2 ? [Number.NaN, undefined, -1, 2, 0][Math.floor(rnd() * 5)] : rnd();
      const left = masterStack(["m", "s"], AREA, { ratio, count: 1 });
      expect(left.get("m")!.width).toBeCloseTo(AREA.width * masterRatio(ratio), 9);
      const top = masterStack(["m", "s"], AREA, { ratio, count: 1, side: "top" });
      expect(top.get("m")!.height).toBeCloseTo(AREA.height * masterRatio(ratio), 9);
    }
  });

  it("is the ratio a master split reports", () => {
    for (const ratio of [0, 0.4, 1, Number.NaN, 12]) {
      const tree: Split<string> = { a: { pane: "a" }, b: { pane: "b" }, id: "s", ratio, master: { count: 1 } };
      expect(layoutSplitTree(tree, AREA).splits.get("s")!.ratio).toBe(masterRatio(ratio));
    }
  });
});

describe("masterCount", () => {
  it("rounds the requested count and keeps it within 1..n; left out or NaN is 1", () => {
    expect(masterCount(undefined, 5)).toBe(1);
    expect(masterCount(Number.NaN, 5)).toBe(1);
    expect(masterCount(2, 5)).toBe(2);
    expect(masterCount(2.4, 5)).toBe(2);
    expect(masterCount(2.5, 5)).toBe(3);
    expect(masterCount(0, 5)).toBe(1);
    expect(masterCount(-3, 5)).toBe(1);
    expect(masterCount(9, 5)).toBe(5);
    expect(masterCount(Number.POSITIVE_INFINITY, 5)).toBe(5);
    expect(masterCount(Number.NEGATIVE_INFINITY, 5)).toBe(1);
  });

  it("with no panes (or a count over n) the least is 1, never 0", () => {
    expect(masterCount(3, 0)).toBe(1);
    expect(masterCount(undefined, 0)).toBe(1);
    expect(masterCount(4, 2)).toBe(2);
  });

  it("is how many panes masterStack takes as masters", () => {
    const rnd = seeded(8);
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 7);
      const count = rnd() < 0.15 ? [Number.NaN, undefined, -2, 99][Math.floor(rnd() * 4)] : rnd() * 9 - 1;
      const panes = Array.from({ length: n }, (_, k) => k);
      const placed = masterStack(panes, AREA, { count, ratio: 0.4 });
      // The masters are the panes in the first area (x from 0 on the left side); the rest sit right of it.
      const masters = panes.filter((p) => placed.get(p)!.x === 0).length;
      expect(masters).toBe(masterCount(count, n));
    }
  });
});
