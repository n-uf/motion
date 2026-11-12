/** The dock's arrangers tile their area exactly; natural-height columns; the minimum-size give-way. */
import { describe, expect, it } from "vitest";
import { overlap, type Rect } from "../index";
import { columnHeights, dwindle, giveWay, masterStack, share } from "../src/dock/arrange";

const GAP = 6;

/** The rects lie inside the area, never overlap, and fill it but for the gaps (within a pixel per tile). */
function tilesExactly(rects: readonly Rect[], area: Rect): string[] {
  const out: string[] = [];
  for (const r of rects) if (r.x < area.x - 0.01 || r.y < area.y - 0.01 || r.x + r.width > area.x + area.width + 0.01 || r.y + r.height > area.y + area.height + 0.01) out.push(`outside: ${JSON.stringify(r)}`);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i]!, rects[j]!) > 0.01) out.push(`overlap ${i} ${j}`);
  // Each rect reaches the area's edge or keeps exactly a gap from a neighbour beside it, on every side.
  const along = (a0: number, a1: number, b0: number, b1: number): boolean => Math.min(a1, b1) - Math.max(a0, b0) > 0.01;
  const touches = (r: Rect, side: "l" | "r" | "t" | "b"): boolean => {
    const edge = { l: r.x, r: r.x + r.width, t: r.y, b: r.y + r.height }[side];
    const wall = { l: area.x, r: area.x + area.width, t: area.y, b: area.y + area.height }[side];
    if (Math.abs(edge - wall) < 0.01) return true;
    return rects.some((o) => {
      if (o === r) return false;
      const beside = side === "l" || side === "r" ? along(r.y, r.y + r.height, o.y, o.y + o.height) : along(r.x, r.x + r.width, o.x, o.x + o.width);
      return beside && { l: Math.abs(o.x + o.width + GAP - r.x), r: Math.abs(r.x + r.width + GAP - o.x), t: Math.abs(o.y + o.height + GAP - r.y), b: Math.abs(r.y + r.height + GAP - o.y) }[side] < 0.01;
    });
  };
  for (const r of rects) for (const side of ["l", "r", "t", "b"] as const) if (!touches(r, side)) out.push(`${JSON.stringify(r)} leaves a hole on its ${side}`);
  const used = rects.reduce((s, r) => s + r.width * r.height, 0);
  if (used > area.width * area.height + 0.01) out.push("more than the area");
  return out;
}

describe("layouts tile their area", () => {
  const areas: Rect[] = [{ x: 6, y: 6, width: 948, height: 548 }, { x: 0, y: 40, width: 400, height: 900 }];
  it("masterStack", () => {
    const fails: string[] = [];
    for (const area of areas) for (let n = 1; n <= 9; n++) fails.push(...tilesExactly([...masterStack(Array.from({ length: n }, (_, i) => i), area, GAP).values()], area).map((m) => `${n}: ${m}`));
    expect(fails).toEqual([]);
  });
  it("dwindle", () => {
    const fails: string[] = [];
    for (const area of areas) for (let n = 1; n <= 9; n++) fails.push(...tilesExactly(dwindle(area, n, GAP), area).map((m) => `${n}: ${m}`));
    expect(fails).toEqual([]);
  });

  it("master and stack gives the master its ratio", () => {
    const m = masterStack([1, 2, 3], { x: 0, y: 0, width: 1006, height: 500 }, GAP, 0.6).get(1)!;
    expect(m.width).toBeCloseTo(600);
    expect(dwindle({ x: 0, y: 0, width: 300, height: 900 }, 2, GAP)[0]!.width).toBe(300);
  });
});

describe("columns of natural heights", () => {
  it("each item at its minimum, the last taking the rest", () => {
    expect(columnHeights(500, [100, 150, 80], GAP)).toEqual([100, 150, 500 - 12 - 250]);
  });
  it("an even share when the minimums don't fit", () => {
    expect(columnHeights(300, [200, 200], GAP)).toEqual([147, 147]);
  });
  it("share keeps minimums and splits the rest in proportion", () => {
    expect(share(600, [100, 200])).toEqual([200, 400]);
    expect(share(300, [100, 200])).toEqual([100, 200]);
  });
});

describe("the give-way", () => {
  const min = { width: 200, height: 100 };
  // Equal columns over 650 px: three keep 200 px each, four don't.
  const lay = (kept: readonly string[]) => {
    const w = (650 - GAP * (kept.length - 1)) / kept.length;
    return new Map(kept.map((k, i) => [k, { x: i * (w + GAP), y: 0, width: w, height: 300 }]));
  };
  it("the newest tile that breaks a minimum floats, until the rest fit", () => {
    const age = (k: string) => Number(k.slice(1));
    expect(giveWay(["t1", "t4", "t2", "t3"], lay, () => min, age)).toEqual({ kept: ["t1", "t2", "t3"], floats: ["t4"] });
    expect(giveWay(["t1", "t2"], lay, () => min, age)).toEqual({ kept: ["t1", "t2"], floats: [] });
  });
  it("one tile is always kept", () => {
    expect(giveWay(["a", "b"], lay, () => ({ width: 2000, height: 1 }), (k) => (k === "a" ? 1 : 2))).toEqual({ kept: ["a"], floats: ["b"] });
  });
});
