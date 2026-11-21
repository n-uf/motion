/** ./tiling, master and stack: the count and side of the master area, its ratio clamp, and a split that lays out so. */
import { describe, expect, it } from "vitest";
import { area as areaOf, type Rect } from "../index";
import { layoutSplit, layoutSplitTree, masterStack, orderTargets, type PaneSide, type Split } from "../src/tiling";
import { randomTree, same, seeded, unsound } from "./tiling-fixture";

const AREA: Rect = { x: 0, y: 0, width: 1000, height: 600 };
const rects = <K>(l: Map<K, Rect>, ...keys: K[]): Rect[] => keys.map((k) => l.get(k)!);

describe("masterStack: count and side", () => {
  it("the default is one master on the left: 0.5 of the room less the gap, the rest stacked in equal rows", () => {
    const l = masterStack(["a", "b", "c"], AREA, { gap: 10, ratio: 0.6 });
    expect(rects(l, "a", "b", "c")).toEqual([
      { x: 0, y: 0, width: 594, height: 600 },
      { x: 604, y: 0, width: 396, height: 295 },
      { x: 604, y: 305, width: 396, height: 295 },
    ]);
  });

  it("count 2 stacks two panes in the master column", () => {
    const l = masterStack(["a", "b", "c", "d"], AREA, { gap: 10, ratio: 0.6, count: 2 });
    expect(rects(l, "a", "b", "c", "d")).toEqual([
      { x: 0, y: 0, width: 594, height: 295 },
      { x: 0, y: 305, width: 594, height: 295 },
      { x: 604, y: 0, width: 396, height: 295 },
      { x: 604, y: 305, width: 396, height: 295 },
    ]);
  });

  it("right puts the stack first in space, the master after the stack's width", () => {
    const l = masterStack(["a", "b", "c"], AREA, { gap: 10, ratio: 0.6, side: "right" });
    expect(rects(l, "a", "b")).toEqual([
      { x: 406, y: 0, width: 594, height: 600 },
      { x: 0, y: 0, width: 396, height: 295 },
    ]);
  });

  it("top is a row: its panes side by side, the stack's row below", () => {
    const l = masterStack(["a", "b", "c"], AREA, { gap: 10, ratio: 0.6, side: "top" });
    expect(rects(l, "a", "b", "c")).toEqual([
      { x: 0, y: 0, width: 1000, height: 354 },
      { x: 0, y: 364, width: 495, height: 236 },
      { x: 505, y: 364, width: 495, height: 236 },
    ]);
  });

  it("bottom puts the stack's row first", () => {
    const l = masterStack(["a", "b"], AREA, { gap: 10, ratio: 0.6, side: "bottom" });
    expect(rects(l, "a", "b")).toEqual([
      { x: 0, y: 246, width: 1000, height: 354 },
      { x: 0, y: 0, width: 1000, height: 236 },
    ]);
  });

  it("with no stack, all the panes fill the area stacked along the side's cross axis", () => {
    expect(rects(masterStack(["a", "b"], AREA, { gap: 10, count: 3 }), "a", "b")).toEqual([
      { x: 0, y: 0, width: 1000, height: 295 },
      { x: 0, y: 305, width: 1000, height: 295 },
    ]);
    for (const side of ["top", "bottom"] as const)
      expect(rects(masterStack(["a", "b"], AREA, { gap: 10, count: 2, side }), "a", "b")).toEqual([
        { x: 0, y: 0, width: 495, height: 600 },
        { x: 505, y: 0, width: 495, height: 600 },
      ]);
    expect(masterStack(["a"], AREA, { gap: 10, side: "top" }).get("a")).toEqual(AREA);
    expect(masterStack([], AREA).size).toBe(0);
  });

  it("the count is rounded and kept within 1..n; NaN is 1", () => {
    const widths = (count: number): number[] => [...masterStack([1, 2, 3, 4], AREA, { count, ratio: 0.6 }).values()].map((r) => r.width);
    expect(widths(1.6)).toEqual(widths(2));
    expect(widths(0)).toEqual(widths(1));
    expect(widths(-4)).toEqual(widths(1));
    expect(widths(Number.NaN)).toEqual(widths(1));
    expect(widths(9)).toEqual([1000, 1000, 1000, 1000]);
  });
});

describe("masterStack: the ratio", () => {
  const masterWidth = (ratio: number | undefined): number => masterStack([1, 2], AREA, { gap: 10, ...(ratio === undefined ? {} : { ratio }) }).get(1)!.width;

  it("is clamped to 0.05..0.95 of the room the gap leaves; a non-finite one is 0.5", () => {
    expect(masterWidth(0.99)).toBeCloseTo(990 * 0.95, 9);
    expect(masterWidth(0)).toBeCloseTo(990 * 0.05, 9);
    expect(masterWidth(-1)).toBeCloseTo(990 * 0.05, 9);
    expect(masterWidth(Number.NaN)).toBe(495);
    expect(masterWidth(Number.POSITIVE_INFINITY)).toBe(495);
    expect(masterWidth(undefined)).toBe(495);
    expect(masterWidth(0.3)).toBeCloseTo(297, 9);
  });

  it("a gap wider than the area leaves no size below 0", () => {
    for (const r of masterStack([1, 2, 3], { x: 0, y: 0, width: 5, height: 4 }, { gap: 10 }).values()) expect([r.width >= 0, r.height >= 0]).toEqual([true, true]);
  });
});

describe("a split that lays its panes out as master and stack", () => {
  const nested: Split<number> = {
    id: "m",
    a: { id: "inner", a: { pane: 1 }, b: { pane: 2 }, axis: "y", ratio: 0.9 },
    b: { a: { pane: 3 }, b: { pane: 4 }, axis: "x", ratio: 0.1 },
    ratio: 0.6,
    master: { count: 2, side: "left" },
  };

  it("lays its panes flat through masterStack with its ratio and the gap, ignoring nested splits and the handle", () => {
    const { panes, splits } = layoutSplitTree(nested, AREA, { gap: 10, handle: 6 });
    expect(rects(panes, 1, 2, 3, 4)).toEqual([...masterStack([1, 2, 3, 4], AREA, { gap: 10, ratio: 0.6, count: 2 }).values()]);
    // Only the split itself is reported, its ratio the clamped master share.
    expect([...splits.keys()]).toEqual(["m"]);
    expect(splits.get("m")).toMatchObject({ rect: AREA, axis: "x", ratio: 0.6 });
  });

  it("reports the ratio as clamped, the axis by the side, and the gap between the two areas as its divider", () => {
    const top: Split<number> = { ...nested, ratio: 4, master: { side: "top" } };
    const { splits } = layoutSplitTree(top, AREA, { gap: 10 });
    expect(splits.get("m")).toMatchObject({ axis: "y", ratio: 0.95 });
    // 590 * 0.95 = 560.5 for the master row, then the gap.
    expect(splits.get("m")!.divider).toEqual({ x: 0, y: 560.5, width: 1000, height: 10 });
    const alone = layoutSplitTree({ id: "s", a: { pane: 1 }, b: { pane: 2 }, master: { count: 3 } }, AREA, { gap: 10 });
    expect(alone.splits.get("s")!.divider).toBeNull();
  });

  it("its own gap replaces the layout's gap; a split without master inside a master split changes nothing", () => {
    const own = layoutSplit({ ...nested, gap: 0 }, AREA, { gap: 10 });
    expect(rects(own, 1, 2, 3, 4)).toEqual([...masterStack([1, 2, 3, 4], AREA, { gap: 0, ratio: 0.6, count: 2 }).values()]);
    const other = layoutSplit({ a: { pane: 9 }, b: nested, axis: "x", ratio: 0.5 }, AREA, { gap: 10 });
    expect(other.get(9)).toEqual({ x: 0, y: 0, width: 495, height: 600 });
    // The four panes lie in the right half: a master column of 0.6 of 485 (291), the gap, the stack of 194.
    expect(same(other.get(1)!, { x: 505, y: 0, width: 291, height: 295 })).toBe(true);
    expect(same(other.get(3)!, { x: 806, y: 0, width: 194, height: 295 })).toBe(true);
  });

  it("takes only the count and side from `master`: a ratio or gap there (past the types) changes nothing", () => {
    const sneaky = { count: 1, ratio: 0.9, gap: 50 } as unknown as NonNullable<Extract<Split<number>, { a: unknown }>["master"]>;
    const split: Split<number> = { id: "m", a: { pane: 1 }, b: { pane: 2 }, ratio: 0.3, master: sneaky };
    const { panes, splits } = layoutSplitTree(split, AREA, { gap: 10 });
    // The room is 990: the master column is 0.3 of it, and the divider sits right after it.
    expect(panes.get(1)!.width).toBeCloseTo(297, 9);
    expect(panes.get(2)!.x).toBeCloseTo(307, 9);
    expect(splits.get("m")!.divider).toEqual({ x: 297, y: 0, width: 10, height: 600 });
  });

  it("measures the reported ratio from the master's side: on the right the divider is after the stack", () => {
    const split: Split<number> = { id: "m", a: { pane: 1 }, b: { pane: 2 }, ratio: 0.3, master: { side: "right" } };
    const { panes, splits } = layoutSplitTree(split, AREA, { gap: 10 });
    expect(splits.get("m")!.ratio).toBe(0.3);
    expect(splits.get("m")!.divider!.x).toBeCloseTo(693, 9);
    expect(splits.get("m")!.divider!.width).toBeCloseTo(10, 9);
    expect(panes.get(1)!.x).toBeCloseTo(703, 9);
  });
});

describe("where the master options live", () => {
  it("the order layouts take count and side (orderTargets passes them on); a split tree's options do not", () => {
    const ts = orderTargets(masterStack, ["a", "b", "c"], "x", AREA, { gap: 10, count: 2, side: "top" });
    expect(ts[0]!.layout.get("x")).toEqual(masterStack(["x", "a", "b", "c"], AREA, { gap: 10, count: 2, side: "top" }).get("x"));
    // The split tree reads them from the split's `master`, never from the layout's options: a type error.
    // @ts-expect-error count belongs to a split's `master`
    layoutSplit({ pane: 1 }, AREA, { count: 2 });
    // @ts-expect-error side belongs to a split's `master`
    layoutSplitTree({ pane: 1 }, AREA, { side: "top" });
  });
});

describe("master and stack, seeded sweeps", () => {
  const SIDES: PaneSide[] = ["left", "right", "top", "bottom"];

  it("every pane is inside the area, none is negative, no two overlap; with no gap they cover it", () => {
    const rnd = seeded(61);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rnd() * 9);
      const whole: Rect = { x: rnd() * 50, y: rnd() * 50, width: 50 + rnd() * 1500, height: 50 + rnd() * 900 };
      const gap = rnd() < 0.4 ? 0 : Math.floor(rnd() * 16);
      const l = masterStack(Array.from({ length: n }, (_, k) => k), whole, { gap, ratio: rnd() * 1.2 - 0.1, count: Math.floor(rnd() * 5), side: SIDES[Math.floor(rnd() * 4)]! });
      expect(l.size).toBe(n);
      expect(unsound([...l.values()], whole)).toEqual([]);
      if (gap === 0) expect([...l.values()].reduce((s, r) => s + areaOf(r), 0)).toBeCloseTo(areaOf(whole), 4);
    }
  });

  it("a tree with master splits in it stays sound", () => {
    const rnd = seeded(63);
    for (let i = 0; i < 300; i++) {
      const whole: Rect = { x: 0, y: 0, width: 300 + rnd() * 1200, height: 200 + rnd() * 700 };
      const l = layoutSplit(randomTree(rnd, 2 + Math.floor(rnd() * 8), { master: 0.4, gap: 0.2 }), whole, { gap: Math.floor(rnd() * 10) });
      expect(unsound([...l.values()], whole)).toEqual([]);
    }
  });
});
