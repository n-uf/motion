/** ./tiling, minimum floors and fixed lengths: the options of `layoutSplit` and `layoutSplitTree` read per split. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { layoutSplit, layoutSplitTree, type Split } from "../src/tiling";
import { randomTree, seeded, unsound } from "./tiling-fixture";

const AREA: Rect = { x: 0, y: 0, width: 1000, height: 600 };
const leaf = <K>(pane: K): Split<K> => ({ pane });
const pair = (extra: object = {}): Split<string> => ({ id: "s", a: leaf("a"), b: leaf("b"), axis: "x", ...extra });
/** The length a pane is fixed to, by name. */
const fixedBy = (lengths: Record<string, { length: number; keep?: boolean }>) => (child: Split<string>) => ("pane" in child ? lengths[child.pane] : undefined);

describe("minimum floors", () => {
  it("a ratio under the floor is raised to it: 0.02 of 1000 with a floor of 40, the net off, a gutter of 10", () => {
    const l = layoutSplit(pair({ ratio: 0.02 }), AREA, { gap: 10, floor: () => ({ min: 40, net: false }) });
    // The floor counts against the room less the gutter, 990: 40 / 990 of 1000 less half the gutter.
    expect(l.get("a")!.width).toBeCloseTo(35.40404, 5);
    expect(l.get("b")!.x).toBeCloseTo(45.40404, 5);
  });

  it("the net keeps a ratio within 0.05..0.95 unless a side says net: false", () => {
    const floor = (net: boolean) => () => ({ min: 40, net });
    expect(layoutSplit(pair({ ratio: 0.02 }), AREA, { gap: 10, floor: floor(true) }).get("a")!.width).toBeCloseTo(45, 9);
    expect(layoutSplit(pair({ ratio: 0.02 }), AREA, { gap: 10, floor: () => ({ min: 40 }) }).get("a")!.width).toBeCloseTo(45, 9);
    expect(layoutSplit(pair({ ratio: 0.99 }), AREA, { gap: 10, floor: floor(true) }).get("b")!.width).toBeCloseTo(45, 9);
    // One side off turns the net off for the split.
    const mixed = layoutSplit(pair({ ratio: 0.02 }), AREA, { gap: 10, floor: (child) => ("pane" in child && child.pane === "b" ? { min: 40, net: false } : { min: 40 }) });
    expect(mixed.get("a")!.width).toBeCloseTo(35.40404, 5);
  });

  it("each side has its own floor", () => {
    const l = layoutSplit(pair({ ratio: 0.1 }), AREA, { gap: 10, floor: (child) => ({ min: "pane" in child && child.pane === "a" ? 300 : 100, net: false }) });
    expect(l.get("a")!.width).toBeCloseTo(1000 * (300 / 990) - 5, 9);
    const high = layoutSplit(pair({ ratio: 0.95 }), AREA, { gap: 10, floor: (child) => ({ min: "pane" in child && child.pane === "a" ? 300 : 100, net: false }) });
    expect(high.get("b")!.width).toBeCloseTo(1000 * (100 / 990) - 5, 9);
  });

  it("floors that cannot both fit leave the ratio at 0.5", () => {
    const l = layoutSplit(pair({ ratio: 0.9 }), { x: 0, y: 0, width: 100, height: 50 }, { gap: 10, floor: () => ({ min: 60, net: false }) });
    expect([l.get("a")!.width, l.get("b")!.x]).toEqual([45, 55]);
    // With the net on, a floor of 60 in 90 asks for 0.67 and at most 0.33: no room for both.
    expect(layoutSplit(pair({ ratio: 0.2 }), { x: 0, y: 0, width: 100, height: 50 }, { gap: 10, floor: () => ({ min: 60 }) }).get("a")!.width).toBe(45);
  });

  it("a room under 1 px for the floors counts as 1", () => {
    const l = layoutSplit(pair({ ratio: 0.3 }), { x: 0, y: 0, width: 4, height: 50 }, { gap: 10, floor: () => ({ min: 0.4, net: false }) });
    // avail = max(4 - 10, 1) = 1: 0.4 and 0.6 of it; the ratio 0.3 is raised to 0.4.
    expect(l.get("b")!.x).toBeCloseTo(4 * 0.4 + 5, 9);
  });

  it("is asked of each split's two direct children, with the axis in effect and the split", () => {
    const seen: string[] = [];
    const tree: Split<string> = { a: leaf("a"), b: { a: leaf("b"), b: leaf("c") } };
    layoutSplit(tree, { x: 0, y: 0, width: 1000, height: 400 }, {
      floor: (child, axis, split) => {
        seen.push(`${"pane" in child ? child.pane : "split"}:${axis}:${split === tree ? "root" : "inner"}`);
        return { min: 0 };
      },
    });
    expect(seen).toEqual(["a:x:root", "split:x:root", "b:x:inner", "c:x:inner"]);
  });

  it("with no floor option the ratio is only clamped to 0..1: no net", () => {
    expect(layoutSplit(pair({ ratio: 0.02 }), AREA, { gap: 10 }).get("a")!.width).toBeCloseTo(15, 9);
  });

  it("a split's own gap and the handle count in the room the floors are measured against", () => {
    const l = layoutSplit(pair({ ratio: 0.02, gap: 16 }), AREA, { gap: 10, handle: 4, floor: () => ({ min: 40, net: false }) });
    // gutter 20, room 980.
    expect(l.get("a")!.width).toBeCloseTo(1000 * (40 / 980) - 10, 9);
  });
});

describe("fixed lengths along a split", () => {
  it("a fixed first child takes its length, the gutter is reserved, the sibling fills the rest", () => {
    const l = layoutSplit(pair({ ratio: 0.3 }), AREA, { gap: 6, handle: 4, fixed: fixedBy({ a: { length: 200 } }) });
    expect(l.get("a")).toEqual({ x: 0, y: 0, width: 200, height: 600 });
    expect(l.get("b")).toEqual({ x: 210, y: 0, width: 790, height: 600 });
  });

  it("a fixed second child sits at the end", () => {
    const l = layoutSplit(pair(), AREA, { gap: 10, fixed: fixedBy({ b: { length: 150 } }) });
    expect(l.get("a")).toEqual({ x: 0, y: 0, width: 840, height: 600 });
    expect(l.get("b")).toEqual({ x: 850, y: 0, width: 150, height: 600 });
  });

  it("a length that does not fit (with the gutter), or is not positive, falls back to the ratio", () => {
    for (const length of [990, 1200, 0, -5, Number.NaN]) {
      const l = layoutSplit(pair({ ratio: 0.3 }), AREA, { gap: 10, fixed: fixedBy({ a: { length } }) });
      expect(l.get("a")!.width).toBeCloseTo(295, 9);
    }
    expect(layoutSplit(pair({ ratio: 0.3 }), AREA, { gap: 10, fixed: fixedBy({ a: { length: 989 } }) }).get("a")!.width).toBe(989);
  });

  it("with two fixed children the first wins, and the second fills; the first one decides even when it does not fit", () => {
    const both = layoutSplit(pair(), AREA, { gap: 10, fixed: fixedBy({ a: { length: 200 }, b: { length: 300 } }) });
    expect([both.get("a")!.width, both.get("b")!.width]).toEqual([200, 790]);
    const first = layoutSplit(pair({ ratio: 0.3 }), AREA, { gap: 10, fixed: fixedBy({ a: { length: 0 }, b: { length: 300 } }) });
    expect(first.get("a")!.width).toBeCloseTo(295, 9);
    const keepOne = layoutSplit(pair(), AREA, { gap: 10, fixed: fixedBy({ a: { length: 200, keep: true }, b: { length: 300 } }) });
    expect(keepOne.get("b")!.width).toBe(790);
  });

  it("with two fixed children that both keep, each keeps its own length and the rest stays empty", () => {
    const l = layoutSplit(pair(), AREA, { gap: 10, fixed: fixedBy({ a: { length: 200, keep: true }, b: { length: 300, keep: true } }) });
    expect(l.get("a")).toEqual({ x: 0, y: 0, width: 200, height: 600 });
    expect(l.get("b")).toEqual({ x: 210, y: 0, width: 300, height: 600 });
    // A keep without a usable length is a fixed child like any other: the first wins.
    const unusable = layoutSplit(pair(), AREA, { gap: 10, fixed: fixedBy({ a: { length: 200, keep: true }, b: { length: 0, keep: true } }) });
    expect(unusable.get("b")).toEqual({ x: 210, y: 0, width: 790, height: 600 });
  });

  it("works down y, and is asked with the axis in effect", () => {
    const axes: string[] = [];
    const l = layoutSplit({ a: leaf("a"), b: leaf("b") }, { x: 0, y: 0, width: 300, height: 500 }, {
      gap: 8,
      fixed: (child, axis) => {
        axes.push(axis);
        return "pane" in child && child.pane === "a" ? { length: 120 } : undefined;
      },
    });
    expect(axes).toEqual(["y", "y"]);
    expect(l.get("b")).toEqual({ x: 0, y: 128, width: 300, height: 372 });
  });

  it("reports the boundary as a ratio, the middle of the gutter over the extent, and no divider", () => {
    const { splits } = layoutSplitTree(pair({ ratio: 0.3 }), AREA, { gap: 6, handle: 4, fixed: fixedBy({ a: { length: 200 } }) });
    expect(splits.get("s")).toEqual({ rect: AREA, axis: "x", ratio: 0.205, divider: null });
    const keep = layoutSplitTree(pair(), AREA, { gap: 10, fixed: fixedBy({ a: { length: 200, keep: true }, b: { length: 300, keep: true } }) }).splits.get("s")!;
    expect([keep.ratio, keep.divider]).toEqual([0.205, null]);
    // A length that did not apply leaves the ratio's divider.
    const fell = layoutSplitTree(pair({ ratio: 0.3 }), AREA, { gap: 10, fixed: fixedBy({ a: { length: 0 } }) }).splits.get("s")!;
    expect([fell.ratio, fell.divider]).toEqual([0.3, { x: 295, y: 0, width: 10, height: 600 }]);
  });

  it("a floor does not touch a split a fixed length decided", () => {
    const l = layoutSplit(pair(), AREA, { gap: 10, fixed: fixedBy({ a: { length: 20 } }), floor: () => ({ min: 300 }) });
    expect(l.get("a")!.width).toBe(20);
  });
});

describe("fixed lengths across a split", () => {
  it("a child with a fixed cross length takes it at the start of the cross axis", () => {
    const l = layoutSplit(pair({ ratio: 0.3 }), AREA, { gap: 10, fixedAcross: (child) => ("pane" in child && child.pane === "a" ? 100 : undefined) });
    expect(l.get("a")).toEqual({ x: 0, y: 0, width: 295, height: 100 });
    expect(l.get("b")).toEqual({ x: 305, y: 0, width: 695, height: 600 });
    const tall = layoutSplit({ a: leaf("a"), b: leaf("b"), axis: "y" }, AREA, { fixedAcross: (child) => ("pane" in child && child.pane === "b" ? 250 : undefined) });
    expect(tall.get("b")).toEqual({ x: 0, y: 300, width: 250, height: 300 });
  });

  it("an unusable length is ignored, and it combines with a fixed length along", () => {
    for (const across of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) expect(layoutSplit(pair(), AREA, { fixedAcross: () => across }).get("a")!.height).toBe(600);
    const l = layoutSplit(pair(), AREA, { gap: 10, fixed: fixedBy({ a: { length: 200 } }), fixedAcross: () => 90 });
    expect([l.get("a")!, l.get("b")!]).toEqual([{ x: 0, y: 0, width: 200, height: 90 }, { x: 210, y: 0, width: 790, height: 90 }]);
  });

  it("a cross length given to a split narrows what it lays its sides out in", () => {
    const tree: Split<string> = { a: leaf("a"), b: { a: leaf("b"), b: leaf("c"), axis: "y" }, axis: "x" };
    const l = layoutSplit(tree, AREA, { fixedAcross: (child) => ("pane" in child ? undefined : 200) });
    expect(l.get("b")).toEqual({ x: 500, y: 0, width: 500, height: 100 });
  });
});

/** The ratio a floor gives, written out again from the rule (clampByMinSize). */
function clamped(ratio: number, extent: number, gutter: number, minA: number, minB: number, net: boolean): number {
  const avail = Math.max(extent - gutter, 1);
  const [lo, hi] = net ? [0.05, 0.95] : [0, 1];
  const boundedMin = Math.min(Math.max(minA / avail, lo), hi);
  const boundedMax = Math.max(Math.min(1 - minB / avail, hi), lo);
  return boundedMin > boundedMax ? 0.5 : Math.min(Math.max(ratio, boundedMin), boundedMax);
}

describe("floors and fixed lengths, seeded sweeps", () => {
  it("every split's ratio in effect is the clamp of its own ratio by its two sides' floors, or 0.5 where they cannot both fit", () => {
    const rnd = seeded(71);
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 8);
      const tree = randomTree(rnd, n, { id: 1, gap: 0 });
      const floors = new WeakMap<object, { min: number; net: boolean }>();
      const floor = (child: Split<number>) => {
        let f = floors.get(child);
        if (!f) floors.set(child, (f = { min: Math.floor(rnd() * 120), net: rnd() < 0.5 }));
        return f;
      };
      const gap = Math.floor(rnd() * 12);
      const handle = Math.floor(rnd() * 5);
      const area: Rect = { x: 0, y: 0, width: 150 + rnd() * 1500, height: 100 + rnd() * 900 };
      const { panes, splits } = layoutSplitTree(tree, area, { gap, handle, floor });
      expect(unsound([...panes.values()], area)).toEqual([]);
      const walk = (node: Split<number>): void => {
        if ("pane" in node) return;
        const s = splits.get(node.id!)!;
        const a = floor(node.a);
        const b = floor(node.b);
        const extent = s.axis === "x" ? s.rect.width : s.rect.height;
        const want = clamped(Number.isFinite(node.ratio ?? 0.5) ? (node.ratio ?? 0.5) : 0.5, extent, gap + handle, a.min, b.min, a.net && b.net);
        expect(s.ratio).toBeCloseTo(want, 12);
        walk(node.a);
        walk(node.b);
      };
      walk(tree);
    }
  });

  it("with fixed lengths along and across the layout stays sound, and a fixed child that fits has its length", () => {
    const rnd = seeded(73);
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 7);
      const tree = randomTree(rnd, n, { id: 0.5 });
      const lengths = new WeakMap<object, number>();
      const along = (child: Split<number>) => {
        if (!lengths.has(child)) lengths.set(child, rnd() < 0.3 ? 20 + Math.floor(rnd() * 300) : 0);
        const length = lengths.get(child)!;
        return length > 0 ? { length } : undefined;
      };
      const area: Rect = { x: 0, y: 0, width: 300 + rnd() * 1200, height: 300 + rnd() * 700 };
      const gap = Math.floor(rnd() * 10);
      const l = layoutSplit(tree, area, { gap, fixed: along, floor: () => ({ min: 20 }) });
      expect(unsound([...l.values()], area)).toEqual([]);
      // The root: when its first child is fixed and fits, that child spans exactly its length along the root's axis.
      if (!("pane" in tree) && "pane" in tree.a) {
        const length = along(tree.a)?.length;
        const x = (tree.axis ?? (area.width >= area.height ? "x" : "y")) === "x";
        if (length && length + gap < (x ? area.width : area.height)) expect(x ? l.get(tree.a.pane)!.width : l.get(tree.a.pane)!.height).toBe(length);
      }
    }
  });
});
