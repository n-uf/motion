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
import { shuffle } from "./stack-fixture";
import { same } from "./tiling-fixture";

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

/** A random tree over panes 0..n-1 (shuffled), each split with a random axis (or none) and a random ratio (or none). */
function randomTree(rnd: () => number, n: number): Split<number> | null {
  const ids = shuffle(rnd, Array.from({ length: n }, (_, i) => i));
  const grow = (panes: readonly number[]): Split<number> => {
    if (panes.length === 1) return { pane: panes[0]! };
    const cut = 1 + Math.floor(rnd() * (panes.length - 1));
    const axis = (["x", "y", undefined] as const)[Math.floor(rnd() * 3)];
    const ratio = rnd() < 0.3 ? undefined : 0.1 + rnd() * 0.8;
    return { a: grow(panes.slice(0, cut)), b: grow(panes.slice(cut)), ...(axis ? { axis } : {}), ...(ratio === undefined ? {} : { ratio }) };
  };
  return n === 0 ? null : grow(ids);
}

/** The rect the panes of `node` cover together in `layout` (a subtree covers its rect exactly). */
function bounds(layout: ReadonlyMap<number, Rect>, node: Split<number>): Rect {
  const rs = panesOf(node).map((p) => layout.get(p)!);
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  return { x: x0, y: y0, width: Math.max(...rs.map((r) => r.x + r.width)) - x0, height: Math.max(...rs.map((r) => r.y + r.height)) - y0 };
}

/**
 * Every split's two sides are exactly the rects the spec gives them (the gutter's middle at `extent * ratio`), down to
 * every pane. A side with no room is zero along the axis, never negative.
 */
function gapsExact(layout: ReadonlyMap<number, Rect>, node: Split<number>, rect: Rect, gap: number): string[] {
  if ("pane" in node) return near(layout.get(node.pane)!, rect) ? [] : [`pane ${node.pane}: ${JSON.stringify(layout.get(node.pane))} != ${JSON.stringify(rect)}`];
  const s = sides(node, rect, gap);
  return [...gapsExact(layout, node.a, s.a, gap), ...gapsExact(layout, node.b, s.b, gap)];
}

type Branch = Exclude<Split<number>, { readonly pane: number }>;
/** A split's axis in `rect`: its own, else the rect's longer side. */
const axisOf = (node: Branch, rect: Rect): "x" | "y" => node.axis ?? (rect.width >= rect.height ? "x" : "y");

/**
 * The rects the spec gives a split's two sides in `rect`: the gutter's middle at `extent * ratio`, so the first side
 * is `extent * ratio` less half the gap and the second starts half a gap past it (neither below 0).
 */
function sides(node: Branch, rect: Rect, gap: number): { a: Rect; b: Rect } {
  const x = axisOf(node, rect) === "x";
  const along = x ? rect.width : rect.height;
  const ratio = Math.min(1, Math.max(0, node.ratio ?? 0.5));
  const first = Math.max(0, along * ratio - gap / 2);
  const second = Math.max(0, along * (1 - ratio) - gap / 2);
  const start = along * ratio + gap / 2;
  return {
    a: x ? { ...rect, width: first } : { ...rect, height: first },
    b: x ? { ...rect, x: rect.x + start, width: second } : { ...rect, y: rect.y + start, height: second },
  };
}

/** The rect the spec gives `target`, a node of `tree`, in `rect`. */
function rectOfNode(tree: Split<number>, target: Split<number>, rect: Rect, gap: number): Rect {
  if (tree === target) return rect;
  if ("pane" in tree) throw new Error("target is not in the tree");
  const s = sides(tree, rect, gap);
  const inA = panesOf(target).every((p) => panesOf(tree.a).includes(p));
  return rectOfNode(inA ? tree.a : tree.b, target, inA ? s.a : s.b, gap);
}

const near = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.width - b.width) < 1e-9 && Math.abs(a.height - b.height) < 1e-9;

/** The node that holds `pane` as a direct child, and that child's sibling. */
function parentOf(node: Split<number>, pane: number): { parent: Split<number>; sibling: Split<number> } | null {
  if ("pane" in node) return null;
  if ("pane" in node.a && node.a.pane === pane) return { parent: node, sibling: node.b };
  if ("pane" in node.b && node.b.pane === pane) return { parent: node, sibling: node.a };
  return parentOf(node.a, pane) ?? parentOf(node.b, pane);
}

// The arrangers as they were before ./tiling (9754d88, dock/arrange.ts), copied verbatim as the oracle.
function oldMasterStack<K>(ids: readonly K[], area: Rect, gap: number, ratio = 0.5): Map<K, Rect> {
  const out = new Map<K, Rect>();
  if (ids.length === 0) return out;
  if (ids.length === 1) {
    out.set(ids[0]!, { ...area });
    return out;
  }
  const mw = (area.width - gap) * ratio;
  out.set(ids[0]!, { x: area.x, y: area.y, width: mw, height: area.height });
  const k = ids.length - 1;
  const sh = (area.height - gap * (k - 1)) / k;
  ids.slice(1).forEach((id, i) => out.set(id, { x: area.x + mw + gap, y: area.y + i * (sh + gap), width: area.width - mw - gap, height: sh }));
  return out;
}
function oldDwindle(area: Rect, n: number, gap: number): Rect[] {
  const out: Rect[] = [];
  let cur = { ...area };
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(cur);
      break;
    }
    if (cur.width >= cur.height) {
      const w = (cur.width - gap) / 2;
      out.push({ x: cur.x, y: cur.y, width: w, height: cur.height });
      cur = { x: cur.x + w + gap, y: cur.y, width: w, height: cur.height };
    } else {
      const h = (cur.height - gap) / 2;
      out.push({ x: cur.x, y: cur.y, width: cur.width, height: h });
      cur = { x: cur.x, y: cur.y + h + gap, width: cur.width, height: h };
    }
  }
  return out;
}

/** No pane outside the area, no two overlapping, and (with no gap) their areas sum to the area's: full coverage. */
function covers(rects: readonly Rect[], whole: Rect, gap: number): string[] {
  const out: string[] = [];
  const e = 1e-6;
  for (const r of rects) {
    // Panes of no size too (a split with no room for its gap): never negative; one may sit up to half a gap past the end.
    if (r.width < 0 || r.height < 0) out.push(`negative ${JSON.stringify(r)}`);
    if (r.width === 0 || r.height === 0) continue;
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
  it("a split with no room for its gap lays both sides at no size: the second half a gap past the middle", () => {
    const tree: Split<string> = { a: { pane: "a" }, b: { pane: "b" }, axis: "x" };
    const l = layoutSplit(tree, { x: 10, y: 20, width: 4, height: 50 }, { gap: 6 });
    expect([l.get("a"), l.get("b")]).toEqual([
      { x: 10, y: 20, width: 0, height: 50 },
      { x: 15, y: 20, width: 0, height: 50 },
    ]);
    const tall = layoutSplit({ ...tree, axis: "y" }, { x: 10, y: 20, width: 50, height: 3 }, { gap: 6 });
    expect(tall.get("b")).toEqual({ x: 10, y: 24.5, width: 50, height: 0 });
    // With room, the second side starts a gap after the first, as ever.
    expect(layoutSplit(tree, { x: 10, y: 20, width: 106, height: 50 }, { gap: 6 }).get("b")).toEqual({ x: 66, y: 20, width: 50, height: 50 });
  });

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

  it("pane targets: one per pane, the dragged one left out, ids by key", () => {
    const l = layoutSplit(splitFromOrder([1, 2, 3]), AREA);
    expect(paneTargets(l, { except: 2 }).map((t) => [t.id, t.pane, t.priority])).toEqual([["pane:1", 1, 2], ["pane:3", 3, 2]]);
    expect(paneTargets(l, { key: (p) => `w${p}` }).map((t) => t.id)).toEqual(["pane:w1", "pane:w2", "pane:w3"]);
  });

  it("a single pane: it fills the area, a side drop splits it, the center puts the new one first", () => {
    const one: Split<string> = { pane: "a" };
    expect(layoutSplit(one, AREA).get("a")).toEqual(AREA);
    expect(removePane(one, "a")).toBeNull();
    const left = layoutSplit(dropOnPane(one, "b", "a", "left"), AREA);
    expect([left.get("b"), left.get("a")]).toEqual([{ ...AREA, width: 450 }, { ...AREA, x: 460, width: 450 }]);
    expect(panesOf(dropOnPane(one, "b", "a", "center"))).toEqual(["b", "a"]);
  });

  it("a drop on itself, or on a pane that isn't there, changes nothing (a missing dragged pane is added)", () => {
    const t = splitFromOrder(["a", "b", "c"]);
    for (const r of REGIONS) expect(dropOnPane(t, "b", "b", r)).toBe(t);
    expect(dropOnPane(t, "a", "z", "left")).toBe(t);
    expect(panesOf(dropOnPane(t, "x", "z", "center"))).toEqual(["a", "b", "c", "x"]);
    expect(swapPanes(t, "a", "z")).toBe(t);
  });

  it("the ratio is clamped and no size is negative, however wide the gap", () => {
    const l = layoutSplit({ a: { pane: 1 }, b: { pane: 2 }, axis: "x", ratio: 1.7 }, AREA);
    expect([l.get(1)!.width, l.get(2)!.width]).toEqual([900, 0]);
    const tight = layoutSplit(splitFromOrder([1, 2, 3]), { x: 0, y: 0, width: 4, height: 3 }, { gap: 10 });
    expect([...tight.values()].every((r) => r.width >= 0 && r.height >= 0)).toBe(true);
  });
});

describe("the same rects as before ./tiling", () => {
  it("dwindle and master and stack match the old arrangers exactly (fuzzed)", () => {
    const rnd = random(3);
    for (let i = 0; i < 500; i++) {
      const a: Rect = { x: rnd() * 100, y: rnd() * 100, width: 50 + rnd() * 1900, height: 50 + rnd() * 1100 };
      const gap = Math.floor(rnd() * 12);
      const n = Math.floor(rnd() * 10);
      const ids = Array.from({ length: n }, (_, k) => k);
      // Where the old code gave a negative size (more panes than room for their gaps) the new one clamps to 0 instead.
      const old = oldDwindle(a, n, gap);
      // The gap rule puts the gutter's middle at the ratio (at 0.5, the old halves); the sums differ in the last bits.
      if (old.every((r) => r.width >= 0 && r.height >= 0)) {
        const now = [...layoutSplit(splitFromOrder(ids), a, { gap }).values()];
        expect(now.length).toBe(old.length);
        now.forEach((r, k) => expect(same(r, old[k]!)).toBe(true));
      }
      const ratio = 0.2 + rnd() * 0.6;
      expect(masterStack(ids, a, { gap, ratio })).toEqual(oldMasterStack(ids, a, gap, ratio));
      expect(masterStack(ids, a, { gap })).toEqual(oldMasterStack(ids, a, gap));
    }
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
  it("layoutSplit: no holes, no overlaps, full coverage, and exact gaps, for random trees and ratios", () => {
    const rnd = random(7);
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 9);
      const tree = randomTree(rnd, n)!;
      const rects = [...layoutSplit(tree, AREA).values()];
      expect(rects.length).toBe(n);
      expect(covers(rects, AREA, 0)).toEqual([]);
      const gap = 1 + Math.floor(rnd() * 10);
      const spaced = layoutSplit(tree, AREA, { gap });
      expect(covers([...spaced.values()], AREA, gap)).toEqual([]);
      expect(gapsExact(spaced, tree, AREA, gap)).toEqual([]);
    }
  });

  it("dropOnPane keeps the set of panes, and lays the dropped pane where its region says", () => {
    const rnd = random(11);
    const gap = 6;
    for (let i = 0; i < 400; i++) {
      const n = 2 + Math.floor(rnd() * 7);
      const tree = randomTree(rnd, n)!;
      const inside = rnd() < 0.5;
      const dragged = inside ? Math.floor(rnd() * n) : n;
      // `at` from the tree's panes, from outside it (n + 1), or `dragged` itself.
      const at = Math.floor(rnd() * (n + 2));
      const region = REGIONS[Math.floor(rnd() * 5)]!;
      const after = dropOnPane(tree, dragged, at, region);
      expect(panesOf(after).sort((a, b) => a - b)).toEqual(Array.from({ length: inside ? n : n + 1 }, (_, k) => k));
      if (at >= n || at === dragged) continue;
      const before = layoutSplit(tree, AREA, { gap });
      const l = layoutSplit(after, AREA, { gap });
      const d = l.get(dragged)!;
      const t = l.get(at)!;
      if (region === "center" && inside) {
        // A swap: each takes the other's rect.
        expect([near(d, before.get(at)!), near(t, before.get(dragged)!)]).toEqual([true, true]);
      } else if (region !== "center") {
        // A side: the two share `at`'s place (its rect once `dragged` is lifted out), `dragged` on that side of it.
        const place = (inside ? layoutSplit(removePane(tree, dragged), AREA, { gap }) : before).get(at)!;
        const h = region === "left" || region === "right";
        expect(h ? [d.y, d.height] : [d.x, d.width]).toEqual(h ? [t.y, t.height] : [t.x, t.width]);
        if ((h ? place.width : place.height) > gap) {
          // Room for both: a gap between them, and together they are the place.
          const together = bounds(l, { a: { pane: dragged }, b: { pane: at } });
          const first = region === "left" || region === "top" ? d : t;
          const second = first === d ? t : d;
          expect(h ? second.x - (first.x + first.width) : second.y - (first.y + first.height)).toBeCloseTo(gap, 9);
          expect(near(together, place)).toBe(true);
        } else {
          // A place no wider than the gap: the documented clamp, two panes of no size along the axis, none negative,
          // not overlapping.
          for (const r of [d, t]) expect([h ? r.width : r.height, r.width >= 0 && r.height >= 0]).toEqual([0, true]);
          expect(overlap(d, t)).toBe(0);
        }
      }
    }
  });

  it("removePane: the sibling takes the parent's rect; splitPane brings the count back", () => {
    const rnd = random(13);
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 7);
      const tree = randomTree(rnd, n)!;
      const pane = Math.floor(rnd() * n);
      const { parent, sibling } = parentOf(tree, pane)!;
      // The parent's rect as the spec gives it (its panes' bounds say nothing under the gap's clamp).
      const parentRect = rectOfNode(tree, parent, AREA, 4);
      const rest = removePane(tree, pane);
      expect(panesOf(rest).length).toBe(n - 1);
      if (parentRect) {
        // Every pane of the sibling lies as the sibling alone laid out in the parent's rect.
        const l = layoutSplit(rest, AREA, { gap: 4 });
        const alone = layoutSplit(sibling, parentRect, { gap: 4 });
        expect(panesOf(sibling).every((p) => near(l.get(p)!, alone.get(p)!))).toBe(true);
      }
      const at = panesOf(rest)[Math.floor(rnd() * (n - 1))]!;
      const back = splitPane(rest, at, pane, (["top", "right", "bottom", "left", undefined] as const)[Math.floor(rnd() * 5)]);
      expect(panesOf(back).length).toBe(n);
    }
  });

  it("paneRegion: the previous region only ever holds, it never invents one; no hysteresis ignores it", () => {
    const rnd = random(17);
    for (let i = 0; i < 2000; i++) {
      const pane = { x: rnd() * 50, y: rnd() * 50, width: 20 + rnd() * 400, height: 20 + rnd() * 400 };
      const p = { x: pane.x - 5 + rnd() * (pane.width + 10), y: pane.y - 5 + rnd() * (pane.height + 10) };
      const raw = paneRegion(pane, p);
      const previous = REGIONS[Math.floor(rnd() * 5)]!;
      expect([raw, previous]).toContain(paneRegion(pane, p, previous));
      expect(paneRegion(pane, p, raw)).toBe(raw);
      expect(paneRegion(pane, p, previous, { hysteresis: 0 })).toBe(raw);
    }
  });
});
