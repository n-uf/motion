/**
 * `cutEdges`: the stage cut into bands in list order. Pinned by properties over generated cuts: the reserved bands and
 * the leftover tile the stage (their areas sum to its area, none overlaps another), every band lies inside the stage,
 * an `over` band lies inside the leftover's room and never shortens it, and the order decides each corner.
 */
import { describe, expect, it } from "vitest";
import { area, overlaps, rect, type Rect } from "../index";
import { cutEdges, type BandSide, type EdgeBand } from "../src/stack";
import { seeded } from "./scene-fixture";

const SIDES: readonly BandSide[] = ["top", "right", "bottom", "left"];
const inside = (r: Rect, s: Rect): boolean => r.x >= s.x - 1e-9 && r.y >= s.y - 1e-9 && r.x + r.width <= s.x + s.width + 1e-9 && r.y + r.height <= s.y + s.height + 1e-9;

function bandsOf(seed: number): EdgeBand[] {
  const rnd = seeded(seed);
  return Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) => ({
    id: `b${i}`,
    side: SIDES[Math.floor(rnd() * 4)]!,
    size: Math.floor(rnd() * 260),
    ...(rnd() < 0.4 ? { gap: Math.floor(rnd() * 12) } : {}),
    ...(rnd() < 0.25 ? { mode: "over" as const } : {}),
  }));
}

describe("cutEdges", () => {
  it("a top band cut before a left one takes the corner; cut after it, the left one does", () => {
    const stage = rect(0, 0, 800, 600);
    const topFirst = cutEdges(stage, [
      { id: "top", side: "top", size: 40 },
      { id: "left", side: "left", size: 200 },
    ]);
    expect(topFirst.bands.top).toEqual(rect(0, 0, 800, 40));
    expect(topFirst.bands.left).toEqual(rect(0, 40, 200, 560));
    expect(topFirst.rest).toEqual(rect(200, 40, 600, 560));
    const leftFirst = cutEdges(stage, [
      { id: "left", side: "left", size: 200 },
      { id: "top", side: "top", size: 40 },
    ]);
    expect(leftFirst.bands.left).toEqual(rect(0, 0, 200, 600));
    expect(leftFirst.bands.top).toEqual(rect(200, 0, 600, 40));
    expect(leftFirst.rest).toEqual(rect(200, 40, 600, 560));
  });

  it("a gap follows a band that takes room; a band of no size takes no gap; a band never takes more than the room", () => {
    const c = cutEdges(rect(0, 0, 300, 200), [
      { id: "a", side: "left", size: 100, gap: 8 },
      { id: "b", side: "left", size: 0, gap: 8 },
      { id: "c", side: "right", size: 1000, gap: 8 },
    ]);
    expect(c.bands.a).toEqual(rect(0, 0, 100, 200));
    expect(c.bands.b).toEqual(rect(108, 0, 0, 200));
    expect(c.bands.c).toEqual(rect(108, 0, 192, 200));
    expect(c.rest.width).toBe(0);
  });

  it("an over band lies over the leftover without shortening it; two on one side lie side by side", () => {
    const c = cutEdges(rect(0, 0, 400, 300), [
      { id: "bar", side: "top", size: 30 },
      { id: "o1", side: "top", size: 20, mode: "over" },
      { id: "o2", side: "top", size: 20, mode: "over" },
    ]);
    expect(c.rest).toEqual(rect(0, 30, 400, 270));
    expect(c.bands.o1).toEqual(rect(0, 30, 400, 20));
    expect(c.bands.o2).toEqual(rect(0, 50, 400, 20));
  });

  it("the reserved bands and the leftover tile the stage, inside it, overlapping nothing (seeds 1–400)", () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const rnd = seeded(seed * 7);
      const stage = rect(Math.floor(rnd() * 50), Math.floor(rnd() * 50), 200 + Math.floor(rnd() * 900), 150 + Math.floor(rnd() * 700));
      const bands = bandsOf(seed);
      const c = cutEdges(stage, bands);
      const reserved = bands.filter((b) => b.mode !== "over");
      const parts = [...reserved.map((b) => c.bands[b.id]!), c.rest];
      for (const b of bands) if (!inside(c.bands[b.id]!, stage)) bad.push(`seed ${seed}: ${b.id} outside the stage`);
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (overlaps(parts[i]!, parts[j]!)) bad.push(`seed ${seed}: parts ${i} and ${j} overlap`);
      // Without gaps they cover the stage exactly.
      if (reserved.every((b) => !b.gap) && Math.abs(parts.reduce((s, r) => s + area(r), 0) - area(stage)) > 1e-6) bad.push(`seed ${seed}: the parts don't cover the stage`);
      for (const b of bands) if (b.mode === "over" && !inside(c.bands[b.id]!, stage)) bad.push(`seed ${seed}: ${b.id} outside`);
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it("each corner follows the order: the band cut first along either side of it owns it (seeds 1–200)", () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const stage = rect(0, 0, 1000, 800);
      const bands = bandsOf(seed).filter((b) => b.mode !== "over" && b.size > 0);
      const c = cutEdges(stage, bands);
      for (const [h, v] of [["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]] as const) {
        const first = bands.find((b) => b.side === h || b.side === v);
        if (!first || c.bands[first.id]!.width === 0 || c.bands[first.id]!.height === 0) continue;
        const corner = { x: v === "left" ? 0.5 : 999.5, y: h === "top" ? 0.5 : 799.5 };
        const r = c.bands[first.id]!;
        if (!(corner.x >= r.x && corner.x <= r.x + r.width && corner.y >= r.y && corner.y <= r.y + r.height)) bad.push(`seed ${seed}: ${h}-${v} corner not ${first.id}'s`);
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });
});
