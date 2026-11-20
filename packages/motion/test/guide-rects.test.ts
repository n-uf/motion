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
    // Each keeps the 2 px `clearance` from the content: 3 px thick between the inset and it, the same on both sides.
    expect(l!.rect).toEqual(rect(3, 40, 3, 500));
    expect(r!.rect).toEqual(rect(1074, 40, 3, 500));
    expect(l!.rect.width).toBe(r!.rect.width);
  });

  it("a guide already inside comes back as given (the same object), and a non-finite inset is the default", () => {
    const gs: PlacedGuide[] = [
      { kind: "box", rect: rect(10.123456789, 20, 83.39249760564417, 36) },
      { kind: "line", rect: rect(500.1, 3, 2, 33.7) },
      { kind: "hatch", rect: rect(3, 40, 8, 500) },
    ];
    const out = guideRects(gs, { inside, inset: 2 });
    expect(out.every((g, i) => g === gs[i])).toBe(true);
    expect(guideRects([{ kind: "box", rect: rect(0, 0, 50, 50) }], { inside, inset: Number.NaN })[0]!.rect).toEqual(rect(3, 3, 47, 47));
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

  it("a box keeps `clearance` px clear of a clear rect: cut on the side that faces it, the largest part kept", () => {
    const clear = [rect(100, 10, 60, 30)];
    const area = rect(0, 0, 400, 100);
    // The repro: the box ends where the clear rect starts and comes back 2 px short of it; the line over the seam has
    // no room left and stays dropped.
    const out = guideRects([{ kind: "box", rect: rect(0, 10, 100, 30) }, { kind: "line", rect: rect(99, 10, 2, 30) }], { inside: area, clear });
    expect(out.map((g) => g.kind)).toEqual(["box"]);
    expect(out[0]!.rect).toEqual(rect(2, 10, 96, 30));
    // The box's own side: a clear rect over its right part leaves the left part, over its left part the right part.
    expect(guideRects([{ kind: "box", rect: rect(20, 10, 100, 30) }], { inside: area, clear: [rect(80, 0, 100, 100)] })[0]!.rect).toEqual(rect(20, 10, 58, 30));
    expect(guideRects([{ kind: "box", rect: rect(20, 10, 100, 30) }], { inside: area, clear: [rect(0, 0, 60, 100)] })[0]!.rect).toEqual(rect(62, 10, 58, 30));
    // Above or below, whichever part is larger.
    expect(guideRects([{ kind: "box", rect: rect(20, 10, 100, 80) }], { inside: area, clear: [rect(0, 70, 400, 30)] })[0]!.rect).toEqual(rect(20, 10, 100, 58));
    // Nothing left: the box is dropped. A `clearance` of its own, 0 for none.
    expect(guideRects([{ kind: "box", rect: rect(20, 10, 40, 30) }], { inside: area, clear: [rect(0, 0, 200, 100)] })).toEqual([]);
    expect(guideRects([{ kind: "box", rect: rect(0, 10, 100, 30) }], { inside: area, clear, clearance: 0 })[0]!.rect).toEqual(rect(2, 10, 98, 30));
    expect(guideRects([{ kind: "box", rect: rect(0, 10, 100, 30) }], { inside: area, clear, clearance: 5 })[0]!.rect).toEqual(rect(2, 10, 93, 30));
  });

  it("no guide, box or thin, comes within `clearance` of a clear rect; a guide clear of them all comes back as the same object", () => {
    let s = 11;
    const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let kept = 0;
    let same = 0;
    for (let i = 0; i < 3000; i++) {
      const kind = (["line", "box", "hatch"] as const)[Math.floor(rnd() * 3)]!;
      const thin = 2 + rnd() * 8;
      const long = 20 + rnd() * 300;
      const across = rnd() < 0.5;
      const w = kind === "box" ? 20 + rnd() * 200 : across ? thin : long;
      const h = kind === "box" ? 20 + rnd() * 200 : across ? long : thin;
      const guide: PlacedGuide = { kind, rect: rect(3 + rnd() * 800, 3 + rnd() * 480, w, h) };
      const clear = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => rect(rnd() * 1000, rnd() * 600, 20 + rnd() * 200, 20 + rnd() * 200));
      const clearance = [0, 1, 2, 5][Math.floor(rnd() * 4)]!;
      for (const g of guideRects([guide], { inside, inset: 2, clear, clearance, minThickness: 0 })) {
        kept++;
        if (g === guide) same++;
        for (const c of clear) {
          const gapX = Math.max(c.x - (g.rect.x + g.rect.width), g.rect.x - (c.x + c.width));
          const gapY = Math.max(c.y - (g.rect.y + g.rect.height), g.rect.y - (c.y + c.height));
          expect(Math.max(gapX, gapY), `${kind} ${JSON.stringify(g.rect)} vs ${JSON.stringify(c)} at clearance ${clearance}`).toBeGreaterThanOrEqual(clearance - 1e-6);
        }
      }
    }
    expect(kept).toBeGreaterThan(500);
    expect(same).toBeGreaterThan(50);
  });
});
