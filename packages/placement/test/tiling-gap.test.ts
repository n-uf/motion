/** ./tiling, the gap rule: the gutter's middle sits at `extent * ratio`; a non-finite ratio is 0.5. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { layoutSplit, type Split } from "../src/tiling";
import { randomTree, seeded, unsound } from "./tiling-fixture";

const AREA: Rect = { x: 0, y: 0, width: 1000, height: 600 };
const two = (extra: object = {}): Split<string> => ({ a: { pane: "a" }, b: { pane: "b" }, axis: "x", ...extra });

describe("the gap rule", () => {
  it("1000 wide at 0.3 with a gap of 10: the first side 295, the second 695 wide from 305", () => {
    const l = layoutSplit(two({ ratio: 0.3 }), AREA, { gap: 10 });
    expect(l.get("a")).toEqual({ x: 0, y: 0, width: 295, height: 600 });
    expect(l.get("b")).toEqual({ x: 305, y: 0, width: 695, height: 600 });
  });

  it("the middle of the gap sits at the ratio, along y too, from a rect that doesn't start at 0", () => {
    const l = layoutSplit({ a: { pane: 1 }, b: { pane: 2 }, axis: "y", ratio: 0.25 }, { x: 40, y: 20, width: 300, height: 800 }, { gap: 16 });
    expect(l.get(1)).toEqual({ x: 40, y: 20, width: 300, height: 192 });
    expect(l.get(2)).toEqual({ x: 40, y: 228, width: 300, height: 592 });
  });

  it("at 0.5 both sides are equal, as the old rule had them", () => {
    const l = layoutSplit(two(), AREA, { gap: 10 });
    expect([l.get("a")!.width, l.get("b")!.width, l.get("b")!.x]).toEqual([495, 495, 505]);
  });

  it("a side too short for half the gap is 0 wide, the other keeps its room", () => {
    const l = layoutSplit(two({ ratio: 0.002 }), AREA, { gap: 10 });
    expect(l.get("a")!.width).toBe(0);
    expect(l.get("b")!.x).toBeCloseTo(7, 9);
    expect(l.get("b")!.width).toBeCloseTo(993, 9);
    const far = layoutSplit(two({ ratio: 1 }), AREA, { gap: 10 });
    expect([far.get("a")!.width, far.get("b")!.width, far.get("b")!.x]).toEqual([995, 0, 1005]);
  });

  it("the ratio is clamped to 0..1 before it is used", () => {
    expect(layoutSplit(two({ ratio: -3 }), AREA, { gap: 10 }).get("b")).toEqual({ x: 5, y: 0, width: 995, height: 600 });
    expect(layoutSplit(two({ ratio: 9 }), AREA).get("a")!.width).toBe(1000);
  });

  it("a negative or non-finite gap is no gap", () => {
    for (const gap of [-8, Number.NaN, Number.NEGATIVE_INFINITY]) expect(layoutSplit(two({ ratio: 0.3 }), AREA, { gap }).get("b")).toEqual({ x: 300, y: 0, width: 700, height: 600 });
  });
});

describe("a non-finite ratio", () => {
  it("is 0.5: NaN and infinities give a half split, never NaN rects", () => {
    for (const ratio of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const l = layoutSplit(two({ ratio }), AREA, { gap: 10 });
      expect(l.get("a")).toEqual({ x: 0, y: 0, width: 495, height: 600 });
      expect(l.get("b")).toEqual({ x: 505, y: 0, width: 495, height: 600 });
    }
  });
});

describe("the gap rule, seeded sweeps", () => {
  it("with no floor the gutter's middle sits at extent * ratio and each side is what the middle leaves it", () => {
    const rnd = seeded(41);
    for (let i = 0; i < 500; i++) {
      const gap = Math.floor(rnd() * 20);
      const ratio = rnd() < 0.1 ? Number.NaN : rnd();
      const x = rnd() < 0.5;
      const area: Rect = { x: rnd() * 50, y: rnd() * 50, width: 20 + rnd() * 1500, height: 20 + rnd() * 900 };
      const l = layoutSplit({ a: { pane: 1 }, b: { pane: 2 }, axis: x ? "x" : "y", ratio }, area, { gap });
      const r = Number.isFinite(ratio) ? ratio : 0.5;
      const extent = x ? area.width : area.height;
      const origin = x ? area.x : area.y;
      const [a, b] = [l.get(1)!, l.get(2)!];
      const [aStart, aLength, bStart, bLength] = x ? [a.x, a.width, b.x, b.width] : [a.y, a.height, b.y, b.height];
      expect(aStart).toBe(origin);
      expect(aLength).toBeCloseTo(Math.max(0, extent * r - gap / 2), 9);
      expect(bStart).toBeCloseTo(origin + extent * r + gap / 2, 9);
      expect(bLength).toBeCloseTo(Math.max(0, extent * (1 - r) - gap / 2), 9);
      // Where both sides have room, the gutter is exactly the gap and its middle is at the ratio.
      if (aLength > 0 && bLength > 0) {
        expect(bStart - (aStart + aLength)).toBeCloseTo(gap, 9);
        expect(aStart + aLength + gap / 2).toBeCloseTo(origin + extent * r, 9);
      }
    }
  });

  it("random trees: no size is negative, no two panes overlap, and every pane with room is inside the area", () => {
    const rnd = seeded(43);
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 9);
      const area: Rect = { x: rnd() * 50, y: rnd() * 50, width: 30 + rnd() * 1500, height: 30 + rnd() * 900 };
      const l = layoutSplit(randomTree(rnd, n), area, { gap: Math.floor(rnd() * 20) });
      expect(l.size).toBe(n);
      expect(unsound([...l.values()], area)).toEqual([]);
    }
  });
});
