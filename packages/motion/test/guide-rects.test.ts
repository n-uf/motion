/**
 * `guideRects`: guides drawn inside the window by the inset. A box is clipped; a thin guide keeps its thickness and
 * moves inside (never clipped thinner), and is thinned only to stay clear of the content, the same on both sides.
 */
import { describe, expect, it } from "vitest";
import { guideRects, type PlacedGuide } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const inside = rect(1, 1, 1078, 638);

describe("guideRects", () => {
  it("a line at a bar's far end keeps its 2 px, moved inside; at the head it stays as it is", () => {
    const tail: PlacedGuide = { kind: "line", rect: rect(1076, 0, 2, 36) };
    const head: PlacedGuide = { kind: "line", rect: rect(8, 0, 2, 36) };
    const [t, h] = guideRects([tail, head], { inside, inset: 2 });
    expect(t!.rect).toEqual(rect(1075, 3, 2, 33));
    expect(h!.rect).toEqual(rect(8, 3, 2, 33));
  });

  it("a box is clipped to the inside by the inset", () => {
    const [b] = guideRects([{ kind: "box", rect: rect(-10, 0, 100, 36) }], { inside, inset: 2 });
    expect(b!.rect).toEqual(rect(3, 3, 87, 33));
  });

  it("a thin striped edge on either side of the window: the same thickness, between the inset and the content", () => {
    // 8 px strips along the left and right edges, over columns whose content starts 8 px in (x 8 and x 1072).
    const left: PlacedGuide = { kind: "hatch", rect: rect(0, 40, 8, 500) };
    const right: PlacedGuide = { kind: "hatch", rect: rect(1072, 40, 8, 500) };
    const content = [rect(8, 40, 230, 500), rect(842, 40, 230, 500)];
    const [l, r] = guideRects([left, right], { inside, inset: 2, clear: content });
    expect(l!.rect).toEqual(rect(3, 40, 5, 500));
    expect(r!.rect).toEqual(rect(1072, 40, 5, 500));
    expect(l!.rect.width).toBe(r!.rect.width);
  });

  it("a thin guide with less room than its least thickness is left out", () => {
    const g = guideRects([{ kind: "hatch", rect: rect(0, 40, 8, 500) }], { inside, inset: 2, clear: [rect(4, 40, 200, 500)] });
    expect(g).toEqual([]);
  });

  it("every guide lies inside by the inset, and a thin one keeps its thickness when nothing is to keep clear of", () => {
    let s = 7;
    const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < 2000; i++) {
      const kind = (["line", "box", "hatch"] as const)[Math.floor(rnd() * 3)]!;
      const thin = 1 + rnd() * 9;
      const long = 20 + rnd() * 400;
      const across = rnd() < 0.5;
      const r = across ? rect(-20 + rnd() * 1120, -20 + rnd() * 680, thin, long) : rect(-20 + rnd() * 1120, -20 + rnd() * 680, long, thin);
      for (const g of guideRects([{ kind, rect: r }], { inside, inset: 2, minThickness: 0 })) {
        expect(g.rect.x).toBeGreaterThanOrEqual(3 - 1e-9);
        expect(g.rect.y).toBeGreaterThanOrEqual(3 - 1e-9);
        expect(g.rect.x + g.rect.width).toBeLessThanOrEqual(1077 + 1e-9);
        expect(g.rect.y + g.rect.height).toBeLessThanOrEqual(637 + 1e-9);
        // Its thickness: the input's shorter side, measured on the same axis.
        if (kind !== "box") expect(across ? g.rect.width : g.rect.height).toBeCloseTo(thin, 9);
      }
    }
  });
});
