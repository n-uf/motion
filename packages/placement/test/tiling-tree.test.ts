/** ./tiling, a split's gutter and identity: the handle, a split's own gap, ids and `layoutSplitTree`. */
import { describe, expect, it } from "vitest";
import { overlap, type Rect } from "../index";
import { layoutSplit, layoutSplitTree, type Split } from "../src/tiling";
import { randomTree, seeded } from "./tiling-fixture";

const AREA: Rect = { x: 0, y: 0, width: 1000, height: 600 };
const leaf = <K>(pane: K): Split<K> => ({ pane });

describe("the handle: a split's gutter is its gap and the room its divider takes", () => {
  const tree: Split<string> = { a: leaf("a"), b: leaf("b"), axis: "x", ratio: 0.3 };

  it("gap 6 and handle 4 lay out as a gap of 10", () => {
    const l = layoutSplit(tree, AREA, { gap: 6, handle: 4 });
    expect(l.get("a")).toEqual({ x: 0, y: 0, width: 295, height: 600 });
    expect(l.get("b")).toEqual({ x: 305, y: 0, width: 695, height: 600 });
  });

  it("the handle alone is a gutter; a negative or non-finite one is 0", () => {
    expect(layoutSplit(tree, AREA, { handle: 8 }).get("b")).toEqual({ x: 304, y: 0, width: 696, height: 600 });
    for (const handle of [-5, Number.NaN]) expect(layoutSplit(tree, AREA, { handle }).get("b")).toEqual({ x: 300, y: 0, width: 700, height: 600 });
  });
});

describe("a split's own gap", () => {
  const nested: Split<number> = { a: leaf(1), b: { a: leaf(2), b: leaf(3), axis: "y", gap: 20 }, axis: "x" };

  it("replaces the global gap for that split only", () => {
    const l = layoutSplit(nested, AREA, { gap: 10 });
    expect(l.get(1)).toEqual({ x: 0, y: 0, width: 495, height: 600 });
    expect(l.get(2)).toEqual({ x: 505, y: 0, width: 495, height: 290 });
    expect(l.get(3)).toEqual({ x: 505, y: 310, width: 495, height: 290 });
  });

  it("is 0 when set to 0, even under a global gap; the handle stays global and adds to it", () => {
    const tight: Split<number> = { a: leaf(1), b: leaf(2), axis: "x", gap: 0 };
    expect(layoutSplit(tight, AREA, { gap: 10 }).get(2)!.x).toBe(500);
    const l = layoutSplit(nested, AREA, { gap: 10, handle: 4 });
    expect(l.get(1)!.width).toBe(493);
    expect([l.get(2)!.height, l.get(3)!.y]).toEqual([288, 312]);
  });
});

describe("split ids and layoutSplitTree", () => {
  const tree: Split<number> = { id: "root", a: leaf(1), b: { id: "side", a: leaf(2), b: leaf(3), axis: "y", ratio: 0.25 }, axis: "x", ratio: 0.3 };

  it("reports each split that has an id: its box, axis, ratio and the strip between its two sides", () => {
    const { panes, splits } = layoutSplitTree(tree, AREA, { gap: 6, handle: 4 });
    expect([...splits.keys()]).toEqual(["root", "side"]);
    expect(splits.get("root")).toEqual({ rect: AREA, axis: "x", ratio: 0.3, divider: { x: 295, y: 0, width: 10, height: 600 } });
    const side = splits.get("side")!;
    expect(side.rect).toEqual({ x: 305, y: 0, width: 695, height: 600 });
    expect([side.axis, side.ratio]).toEqual(["y", 0.25]);
    // Along y: the middle at a quarter of 600 = 150, a gutter of 10 around it.
    expect(side.divider).toEqual({ x: 305, y: 145, width: 695, height: 10 });
    expect(panes.get(2)).toEqual({ x: 305, y: 0, width: 695, height: 145 });
  });

  it("reports the axis in effect (the longer side when the split has none) and a non-finite ratio as 0.5", () => {
    const { splits } = layoutSplitTree({ id: "w", a: leaf(1), b: leaf(2), ratio: Number.NaN }, { x: 0, y: 0, width: 100, height: 300 });
    expect([splits.get("w")!.axis, splits.get("w")!.ratio]).toEqual(["y", 0.5]);
  });

  it("layoutSplit is its panes, and a split with no id is not reported", () => {
    const plain: Split<number> = { a: leaf(1), b: leaf(2) };
    expect(layoutSplitTree(plain, AREA).splits.size).toBe(0);
    expect(layoutSplitTree(tree, AREA, { gap: 6 }).panes).toEqual(layoutSplit(tree, AREA, { gap: 6 }));
    expect(layoutSplitTree(null, AREA)).toEqual({ panes: new Map(), splits: new Map() });
  });

  it("a divider with no room is clipped to the box", () => {
    const { splits } = layoutSplitTree({ id: "s", a: leaf(1), b: leaf(2), axis: "x", ratio: 0 }, { x: 10, y: 0, width: 100, height: 50 }, { gap: 20 });
    expect(splits.get("s")!.divider).toEqual({ x: 10, y: 0, width: 10, height: 50 });
  });
});

describe("split geometry, seeded sweeps", () => {
  it("a divider is the gutter around the ratio, inside its box and clear of every pane; every id is reported", () => {
    const rnd = seeded(51);
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 8);
      const tree = randomTree(rnd, n, { id: 0.7, gap: 0.3 });
      const area: Rect = { x: rnd() * 40, y: rnd() * 40, width: 200 + rnd() * 1300, height: 150 + rnd() * 800 };
      const { panes, splits } = layoutSplitTree(tree, area, { gap: Math.floor(rnd() * 12), handle: Math.floor(rnd() * 6) });
      const ids = JSON.stringify(tree).match(/"id":"s\d+"/g) ?? [];
      expect(splits.size).toBe(ids.length);
      for (const s of splits.values()) {
        expect(s.ratio).toBeGreaterThanOrEqual(0);
        expect(s.ratio).toBeLessThanOrEqual(1);
        const d = s.divider!;
        expect(d.width).toBeGreaterThanOrEqual(0);
        expect(d.height).toBeGreaterThanOrEqual(0);
        expect(d.x).toBeGreaterThanOrEqual(s.rect.x - 1e-9);
        expect(d.y).toBeGreaterThanOrEqual(s.rect.y - 1e-9);
        expect(d.x + d.width).toBeLessThanOrEqual(s.rect.x + s.rect.width + 1e-9);
        expect(d.y + d.height).toBeLessThanOrEqual(s.rect.y + s.rect.height + 1e-9);
        for (const r of panes.values()) expect(overlap(d, r)).toBeLessThan(1e-6);
      }
    }
  });
});
