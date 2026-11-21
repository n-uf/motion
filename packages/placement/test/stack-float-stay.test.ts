/**
 * `fitFloat(…, { stay: true })`: a float left where it is asked, only moved inside the stage. Pinned by properties over
 * generated rects: it is the asked rect clamped into the stage, never snapped, `covers` lists exactly the `avoid` rects it
 * covers there, and where nothing is covered it is the same fit as without the option.
 */
import { describe, expect, it } from "vitest";
import { clampInto, overlaps, rect, type Rect } from "../index";
import { fitFloat } from "../src/stack";

/** A small seeded generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("fitFloat with stay", () => {
  const stage = rect(0, 0, 900, 500);
  const column = rect(0, 32, 240, 468);

  it("lies where it is asked, over a docked column, and says what it covers", () => {
    const want = rect(180, 100, 200, 120);
    const fit = fitFloat(want, stage, [column], { stay: true });
    expect(fit).toEqual({ rect: want, clamped: false, snapped: false, covers: [0], searchCapped: false });
    // Without it, the float goes beside the column.
    expect(fitFloat(want, stage, [column]).rect.x).toBe(240);
  });

  it("is only moved inside the stage", () => {
    const fit = fitFloat(rect(800, -40, 200, 120), stage, [column], { stay: true });
    expect(fit.rect).toEqual(rect(700, 0, 200, 120));
    expect(fit.clamped).toBe(true);
    expect(fit.covers).toEqual([]);
  });

  it("over generated rects: the clamped asked rect, its covers exact; with nothing covered, the plain fit", () => {
    const rnd = seeded(42);
    let covering = 0;
    for (let i = 0; i < 500; i++) {
      const avoid: Rect[] = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => rect(rnd() * 800, rnd() * 450, 20 + rnd() * 200, 20 + rnd() * 200));
      const want = rect(-100 + rnd() * 1000, -100 + rnd() * 600, 40 + rnd() * 300, 30 + rnd() * 200);
      const fit = fitFloat(want, stage, avoid, { stay: true });
      expect(fit.rect).toEqual(clampInto(want, stage));
      expect(fit.snapped).toBe(false);
      const under = avoid.flatMap((a, k) => (overlaps(fit.rect, a, 1e-3) ? [k] : []));
      expect(fit.covers).toEqual(under);
      if (under.length === 0) expect(fit).toEqual(fitFloat(want, stage, avoid));
      else covering++;
    }
    expect(covering).toBeGreaterThan(100);
  });
});
