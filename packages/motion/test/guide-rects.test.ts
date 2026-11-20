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

  it("a clear rect with a non-finite x, y, width or height is ignored: boxes stay, thin guides keep finite fields", () => {
    const box: PlacedGuide = { kind: "box", rect: rect(100, 3, 200, 33) };
    const line: PlacedGuide = { kind: "line", rect: rect(400, 3, 2, 33) };
    const plain = guideRects([box, line], { inside, inset: 2 });
    for (const bad of [rect(NaN, 0, 10, 10), rect(0, Infinity, 10, 10), rect(0, 0, NaN, 10), rect(0, 0, 10, -Infinity)]) {
      const got = guideRects([box, line], { inside, inset: 2, clear: [bad, { rect: bad, clearance: 0 }] });
      expect(got.map((g) => g.rect), JSON.stringify(bad)).toEqual(plain.map((g) => g.rect));
      for (const g of got) for (const v of Object.values(g.rect)) expect(Number.isFinite(v)).toBe(true);
    }
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
      // Each clear rect plain (the options' clearance) or with a clearance of its own (0, 1, 2 or 5).
      const optionClearance = [0, 1, 2, 5][Math.floor(rnd() * 4)]!;
      const specs = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
        const r = rect(rnd() * 1000, rnd() * 600, 20 + rnd() * 200, 20 + rnd() * 200);
        const own = [undefined, 0, 1, 2, 5][Math.floor(rnd() * 5)];
        return { r, own, want: own ?? optionClearance };
      });
      const clear = specs.map((c) => (c.own === undefined ? c.r : { rect: c.r, clearance: c.own }));
      for (const g of guideRects([guide], { inside, inset: 2, clear, clearance: optionClearance, minThickness: 0 })) {
        kept++;
        if (g === guide) same++;
        for (const { r: c, want } of specs) {
          const gapX = Math.max(c.x - (g.rect.x + g.rect.width), g.rect.x - (c.x + c.width));
          const gapY = Math.max(c.y - (g.rect.y + g.rect.height), g.rect.y - (c.y + c.height));
          expect(Math.max(gapX, gapY), `${kind} ${JSON.stringify(g.rect)} vs ${JSON.stringify(c)} at clearance ${want}`).toBeGreaterThanOrEqual(want - 1e-6);
        }
      }
    }
    expect(kept).toBeGreaterThan(500);
    expect(same).toBeGreaterThan(50);
  });

  it("a clear rect's `kinds` name the guide kinds it constrains (default all): a box may lie over what a thin guide keeps clear of", () => {
    const area = rect(0, 0, 400, 100);
    const content = rect(100, 10, 60, 30);
    const guides: PlacedGuide[] = [
      { kind: "box", rect: rect(0, 10, 150, 30) },
      { kind: "hatch", rect: rect(94, 10, 8, 30) },
      { kind: "line", rect: rect(94, 50, 8, 30) },
    ];
    // Constraining the thin kinds only: the box lies over the content, the thin guide is cut back flush against it.
    const thinOnly = guideRects(guides, { inside: area, clear: [{ rect: content, clearance: 0, kinds: ["line", "hatch"] }] });
    expect(thinOnly[0]!.rect).toEqual(rect(2, 10, 148, 30));
    expect(thinOnly[1]!.rect).toEqual(rect(94, 10, 6, 30));
    // The line at y 50 is clear of the content already: as given.
    expect(thinOnly[2]).toBe(guides[2]);
    // All kinds by default, and `kinds: ["box"]` leaves the thin guides alone.
    const all = guideRects(guides, { inside: area, clear: [{ rect: content, clearance: 0 }] });
    expect(all[0]!.rect).toEqual(rect(2, 10, 98, 30));
    expect(all[1]!.rect).toEqual(rect(94, 10, 6, 30));
    const boxOnly = guideRects(guides, { inside: area, clear: [{ rect: content, clearance: 0, kinds: ["box"] }] });
    expect(boxOnly[0]!.rect).toEqual(rect(2, 10, 98, 30));
    expect(boxOnly[1]).toBe(guides[1]);
  });

  it("clearance is per clear rect: a plain rect keeps the default gap, `{ rect, clearance: 0 }` lets a guide run flush", () => {
    const area = rect(0, 0, 400, 100);
    const flush = { rect: rect(100, 10, 60, 30), clearance: 0 };
    // A box beside content it may touch ends at it; beside a plain rect it ends 2 px short.
    expect(guideRects([{ kind: "box", rect: rect(0, 10, 100, 30) }], { inside: area, clear: [flush] })[0]!.rect).toEqual(rect(2, 10, 98, 30));
    expect(guideRects([{ kind: "box", rect: rect(0, 10, 100, 30) }], { inside: area, clear: [flush.rect] })[0]!.rect).toEqual(rect(2, 10, 96, 30));
    // Both kinds in one call: the thin edge runs flush against the content (5 px), but keeps its 2 px from the held
    // item's outline further along (here the outline sits over the strip's lower half, so the strip is thinned beside it).
    const content = { rect: rect(8, 40, 230, 500), clearance: 0 };
    const held = rect(0, 300, 20, 100);
    const [edge, line] = guideRects([{ kind: "hatch", rect: rect(0, 40, 8, 250) }, { kind: "hatch", rect: rect(0, 310, 8, 200) }], { inside, inset: 2, clear: [content, held] });
    expect(edge!.rect).toEqual(rect(3, 40, 5, 250));
    // Over the held item's outline the strip has no room: it stays dropped, as a plain rect (2 px) says.
    expect(line).toBeUndefined();
    // The options' clearance is the plain rect's; a rect's own clearance wins over it.
    expect(guideRects([{ kind: "box", rect: rect(0, 10, 100, 30) }], { inside: area, clear: [flush], clearance: 5 })[0]!.rect).toEqual(rect(2, 10, 98, 30));
    expect(guideRects([{ kind: "box", rect: rect(0, 10, 100, 30) }], { inside: area, clear: [flush.rect], clearance: 5 })[0]!.rect).toEqual(rect(2, 10, 93, 30));
    expect(guideRects([{ kind: "box", rect: rect(0, 10, 100, 30) }], { inside: area, clear: [{ rect: flush.rect, clearance: 5 }], clearance: 0 })[0]!.rect).toEqual(rect(2, 10, 93, 30));
  });
});
