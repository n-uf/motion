/** ./tiling: order layouts, the split tree and its drops, pane drop regions, the targets; with property sweeps. */
import { describe, expect, it } from "vitest";
import { area, overlap, type Rect } from "../index";
import {
  columns,
  dropOnPane,
  grid,
  layoutSplit,
  masterStack,
  orderTargets,
  paneRegion,
  paneTargets,
  panesOf,
  removePane,
  splitFromOrder,
  splitPane,
  swapPanes,
  type PaneRegion,
  type Split,
} from "../src/tiling";

const AREA: Rect = { x: 10, y: 20, width: 900, height: 600 };
const REGIONS: readonly PaneRegion[] = ["center", "top", "right", "bottom", "left"];

/** A small seeded random source, so a failing sweep replays. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A random tree over panes 0..n-1, with random axes (or none) and ratios (or none). */
function randomTree(rnd: () => number, n: number): Split<number> | null {
  let t: Split<number> | null = null;
  for (let id = 0; id < n; id++) {
    const panes: number[] = panesOf(t);
    const at: number | null = panes.length ? panes[Math.floor(rnd() * panes.length)]! : null;
    const side = (["top", "right", "bottom", "left", undefined] as const)[Math.floor(rnd() * 5)];
    t = splitPane(t, at, id, side);
  }
  return t;
}

/** No pane outside the area, no two overlapping, and (with no gap) their areas sum to the area's: full coverage. */
function covers(rects: readonly Rect[], whole: Rect, gap: number): string[] {
  const out: string[] = [];
  const e = 1e-6;
  for (const r of rects) {
    if (r.x < whole.x - e || r.y < whole.y - e || r.x + r.width > whole.x + whole.width + e || r.y + r.height > whole.y + whole.height + e) out.push(`outside ${JSON.stringify(r)}`);
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i]!, rects[j]!) > e) out.push(`overlap ${i} ${j}`);
  const used = rects.reduce((s, r) => s + area(r), 0);
  if (gap === 0 && Math.abs(used - area(whole)) > 1e-3) out.push(`covers ${used} of ${area(whole)}`);
  return out;
}

describe("order layouts", () => {
  it("master and stack: the master takes its ratio, the stack the rest", () => {
    const l = masterStack(["a", "b", "c"], AREA, { gap: 10, ratio: 0.6 });
    expect(l.get("a")).toEqual({ x: 10, y: 20, width: 534, height: 600 });
    expect(l.get("c")).toEqual({ x: 554, y: 325, width: 356, height: 295 });
  });

  it("columns and grid cover the area with no gap", () => {
    for (const n of [1, 2, 3, 5, 7]) {
      const panes = Array.from({ length: n }, (_, i) => i);
      for (const arrange of [masterStack, columns, grid]) expect(covers([...arrange(panes, AREA).values()], AREA, 0)).toEqual([]);
    }
  });

  it("insertion targets: one per index, each slot the dragged pane's rect there", () => {
    const ts = orderTargets(columns, ["a", "b"], "x", AREA);
    expect(ts.map((t) => t.id)).toEqual(["at:0", "at:1", "at:2"]);
    expect(ts[1]!.slot).toEqual({ x: 310, y: 20, width: 300, height: 600 });
    expect([...ts[1]!.layout.keys()]).toEqual(["a", "x", "b"]);
    expect(covers(ts.map((t) => t.hit), AREA, 0)).toEqual([]);
  });
});

describe("the split tree", () => {
  it("dwindle splits along the longer side", () => {
    const l = layoutSplit(splitFromOrder(["a", "b", "c"]), { x: 0, y: 0, width: 800, height: 500 });
    expect([l.get("a"), l.get("b"), l.get("c")]).toEqual([
      { x: 0, y: 0, width: 400, height: 500 },
      { x: 400, y: 0, width: 400, height: 250 },
      { x: 400, y: 250, width: 400, height: 250 },
    ]);
  });

  it("a side drop writes its axis: a wide pane split on top stacks, whatever its shape", () => {
    const t = dropOnPane(splitFromOrder(["a"]), "b", "a", "top");
    expect(t).toEqual({ a: { pane: "b" }, b: { pane: "a" }, axis: "y", ratio: 0.5 });
    expect(layoutSplit(t, { x: 0, y: 0, width: 800, height: 200 }).get("b")).toEqual({ x: 0, y: 0, width: 800, height: 100 });
  });

  it("the center swaps a pane in the tree, and takes the place of one from outside", () => {
    const t = splitFromOrder(["a", "b", "c"]);
    expect(panesOf(dropOnPane(t, "a", "c", "center"))).toEqual(["c", "b", "a"]);
    expect(panesOf(dropOnPane(t, "x", "b", "center"))).toEqual(["a", "x", "b", "c"]);
  });

  it("a pane split from nothing, or beside a pane that isn't there, is never lost", () => {
    expect(splitPane(null, "a", "b")).toEqual({ pane: "b" });
    expect(panesOf(splitPane(splitFromOrder(["a"]), "z", "b", "left"))).toEqual(["b", "a"]);
    expect(panesOf(swapPanes(splitFromOrder(["a", "b"]), "a", "b"))).toEqual(["b", "a"]);
  });

  it("pane targets: one per pane, the dragged one left out", () => {
    const l = layoutSplit(splitFromOrder([1, 2, 3]), AREA);
    expect(paneTargets(l, 2).map((t) => [t.id, t.pane, t.priority])).toEqual([["pane:1", 1, 2], ["pane:3", 3, 2]]);
  });
});

describe("pane drop regions", () => {
  it("the middle is the center; each side band is its side", () => {
    const pane = { x: 100, y: 100, width: 200, height: 200 };
    const at = (x: number, y: number): PaneRegion => paneRegion(pane, { x: 100 + x, y: 100 + y });
    expect([at(100, 100), at(10, 100), at(190, 100), at(100, 10), at(100, 190)]).toEqual(["center", "left", "right", "top", "bottom"]);
    expect(paneRegion(pane, { x: 237, y: 200 }, "center")).toBe("center");
    expect(paneRegion(pane, { x: 237, y: 200 }, "center", { center: 0.2 })).toBe("right");
  });
});

describe("properties (seeded sweeps)", () => {
  it("layoutSplit: no holes, no overlaps, full coverage, for random trees", () => {
    const rnd = random(7);
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 9);
      const tree = randomTree(rnd, n);
      const rects = [...layoutSplit(tree, AREA).values()];
      expect(rects.length).toBe(n);
      expect(covers(rects, AREA, 0)).toEqual([]);
      expect(covers([...layoutSplit(tree, AREA, { gap: 8 }).values()], AREA, 8)).toEqual([]);
    }
  });

  it("dropOnPane keeps the set of panes", () => {
    const rnd = random(11);
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 7);
      const tree = randomTree(rnd, n);
      const inside = rnd() < 0.5;
      const dragged = inside ? Math.floor(rnd() * n) : n;
      const at = Math.floor(rnd() * n);
      const region = REGIONS[Math.floor(rnd() * 5)]!;
      const after = panesOf(dropOnPane(tree, dragged, at, region)).sort((a, b) => a - b);
      expect(after).toEqual(Array.from({ length: inside ? n : n + 1 }, (_, k) => k));
    }
  });

  it("removePane then splitPane round-trips the pane count", () => {
    const rnd = random(13);
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 7);
      const tree = randomTree(rnd, n);
      const pane = Math.floor(rnd() * n);
      const rest = removePane(tree, pane);
      expect(panesOf(rest).length).toBe(n - 1);
      const at = panesOf(rest)[Math.floor(rnd() * (n - 1))]!;
      const back = splitPane(rest, at, pane, (["top", "right", "bottom", "left", undefined] as const)[Math.floor(rnd() * 5)]);
      expect(panesOf(back).length).toBe(n);
    }
  });
});
