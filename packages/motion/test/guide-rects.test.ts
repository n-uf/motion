/**
 * `guideRects`: guides drawn inside the window by the inset. A box is clipped; a thin guide keeps its thickness and
 * moves inside (never clipped thinner), and is thinned only to stay clear of the content, the same on both sides.
 */
import { describe, expect, it } from "vitest";
import { guideRects, type PlacedGuide } from "../src/drag";
import type { Rect } from "../src/shapes";

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

  it("a box with a non-finite x, y, width or height, or a non-finite inside, is left out", () => {
    const wide = rect(0, 0, 1000, 200);
    for (const bad of [rect(NaN, 10, 300, 31), rect(100, NaN, 300, 31), rect(100, 10, NaN, 31), rect(100, 10, 300, NaN), rect(Infinity, 10, 300, 31)]) {
      expect(guideRects([{ kind: "box", rect: bad }], { inside: wide }), JSON.stringify(bad)).toEqual([]);
    }
    for (const badInside of [rect(NaN, 0, 1000, 200), rect(0, NaN, 1000, 200), rect(0, 0, NaN, 200)]) {
      expect(guideRects([{ kind: "box", rect: rect(100, 10, 300, 31) }], { inside: badInside }), JSON.stringify(badInside)).toEqual([]);
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

  it("a clear rect across a box's whole thickness, inside it, leaves both parts: the far one keeps a suffixed id", () => {
    // The kits' case: a 300 px box over the room on both sides of a 94 px held toolbar sliding inside it.
    const area = rect(0, 0, 1000, 200);
    const box = { id: "bar/box/a|b", kind: "box" as const, rect: rect(100, 10, 300, 31) };
    const out = guideRects([box], { inside: area, clear: [rect(180, 8, 94, 35)] });
    expect(out.map((g) => [g.id, g.rect])).toEqual([
      ["bar/box/a|b", rect(100, 10, 78, 31)],
      ["bar/box/a|b#2", rect(276, 10, 124, 31)],
    ]);
    // A part under `minLength` (8 px by default) is dropped; `minLength` is an option.
    expect(guideRects([box], { inside: area, clear: [rect(104, 8, 94, 35)] }).map((g) => g.rect)).toEqual([rect(200, 10, 200, 31)]);
    expect(guideRects([box], { inside: area, clear: [rect(104, 8, 94, 35)], minLength: 1 }).map((g) => g.rect)).toEqual([rect(100, 10, 2, 31), rect(200, 10, 200, 31)]);
    // Across a column's box (taller than wide) the same, above and below.
    const col = { kind: "box" as const, rect: rect(10, 100, 31, 300) };
    expect(guideRects([col], { inside: rect(0, 0, 200, 1000), clear: [rect(8, 180, 35, 94)] }).map((g) => g.rect)).toEqual([rect(10, 100, 31, 78), rect(10, 276, 31, 124)]);
  });

  it("no clear rect inside a box, across its whole thickness, loses the far part when that part is at least `minLength`", () => {
    let s = 5;
    const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let split = 0;
    for (let i = 0; i < 3000; i++) {
      const horizontal = rnd() < 0.5;
      const long = 60 + rnd() * 400;
      const thick = 20 + rnd() * 30;
      const at = 10 + rnd() * 200;
      const box = horizontal ? rect(at, 50, long, thick) : rect(50, at, thick, long);
      const len = 10 + rnd() * long * 0.8;
      const from = at + rnd() * (long - len);
      const gap = [0, 2, 5][Math.floor(rnd() * 3)]!;
      const k = horizontal ? rect(from, 48 - rnd() * 4, len, thick + 6) : rect(48 - rnd() * 4, from, thick + 6, len);
      const before = from - gap - at;
      const after = at + long - (from + len + gap);
      const out = guideRects([{ kind: "box", rect: box }], { inside: rect(0, 0, 1200, 1200), inset: 0, clear: [k], clearance: gap });
      const lengths = out.map((g) => (horizontal ? g.rect.width : g.rect.height));
      const want = [before, after].filter((x) => x >= 8);
      expect(lengths.length, `box ${JSON.stringify(box)} clear ${JSON.stringify(k)}`).toBe(want.length);
      lengths.forEach((l, j) => expect(l).toBeCloseTo(want[j]!, 6));
      if (want.length === 2) split++;
    }
    expect(split).toBeGreaterThan(500);
  });

  describe("one axis per box: several clear rects", () => {
    const area = rect(0, 0, 1000, 200);
    const box = { id: "b", kind: "box" as const, rect: rect(100, 10, 300, 31) };
    const shown = (gs: readonly { id?: string; rect: Rect }[]): unknown[] => gs.map((g) => [g.id, g.rect]);

    it("a box cut into three parts keeps all three, in either order of the clear rects, with ids by side", () => {
      // The second cut is narrower than the box is thick: the box's axis must not flip on the part it leaves.
      const wide = rect(120, 8, 50, 35);
      const narrow = rect(109, 8, 2, 35);
      const want = [
        ["b", rect(100, 10, 9, 31)],
        ["b#2", rect(111, 10, 9, 31)],
        ["b#3", rect(170, 10, 230, 31)],
      ];
      expect(shown(guideRects([box], { inside: area, clear: [wide, narrow], clearance: 0 }))).toEqual(want);
      expect(shown(guideRects([box], { inside: area, clear: [narrow, wide], clearance: 0 }))).toEqual(want);
    });

    it("parts under `minLength` are dropped, and the ids still follow the side", () => {
      const clear = [rect(101.6, 8, 18.4, 35), rect(126.4, 8, 50, 35)];
      for (const order of [clear, [clear[1]!, clear[0]!]]) {
        const out = guideRects([box], { inside: area, clear: order, clearance: 0 });
        expect(out.map((g) => g.id)).toEqual(["b#3"]);
        expect(out[0]!.rect.x).toBeCloseTo(176.4, 6);
        expect(out[0]!.rect.width).toBeCloseTo(223.6, 6);
      }
    });

    it("a corner cut keeps `minLength` too: the piece a corner leaves is dropped when short", () => {
      // A clear rect across the whole thickness leaves [100, 120]; a corner rect then leaves 6 px of it.
      const out = guideRects([box], { inside: area, clear: [rect(120, 8, 50, 35), rect(106, 8, 50, 32)], clearance: 0 });
      expect(shown(out)).toEqual([["b#2", rect(170, 10, 230, 31)]]);
    });

    it("a box no longer than it is thick takes the guide's axis, else the x axis", () => {
      const square = { kind: "box" as const, rect: rect(100, 100, 40, 40) };
      const clear = [rect(115, 90, 10, 60)];
      const along = guideRects([square], { inside: area, clear, clearance: 0 });
      expect(along.map((g) => g.rect)).toEqual([rect(100, 100, 15, 40), rect(125, 100, 15, 40)]);
      // Along y the same clear rect only cuts a corner of the box: the larger side is kept, no L-shape.
      const alongY = guideRects([{ ...square, axis: "y" as const }], { inside: area, clear, clearance: 0 });
      expect(alongY.map((g) => g.rect)).toEqual([rect(100, 100, 15, 40)]);
    });

    it("corner rects cut the parts the same in any order", () => {
      const clear = [rect(120, 8, 50, 35), rect(200, 8, 30, 20), rect(230, 22, 40, 30), rect(300, 30, 10, 20)];
      const want = shown(guideRects([box], { inside: area, clear, clearance: 0 }));
      expect(want.length).toBeGreaterThan(1);
      for (const order of [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) {
        expect(shown(guideRects([box], { inside: area, clear: order.map((i) => clear[i]!), clearance: 0 }))).toEqual(want);
      }
    });

    it("1 to 3 clear rects across the whole thickness equal a 1-D interval subtraction, in any order", () => {
      let s = 23;
      const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      const minLength = 8;
      let multi = 0;
      let cases = 0;
      for (let i = 0; i < 20000; i++) {
        const horizontal = rnd() < 0.5;
        const long = 60 + rnd() * 400;
        const thick = 20 + rnd() * 30;
        const at = 10 + rnd() * 200;
        const gap = [0, 2, 5][Math.floor(rnd() * 3)]!;
        const n = 1 + Math.floor(rnd() * 3);
        const ks: { from: number; len: number }[] = [];
        for (let j = 0; j < n; j++) {
          const len = 1 + rnd() * long * 0.4;
          ks.push({ from: at - len + rnd() * (long + len), len });
        }
        const toRect = (k: { from: number; len: number }): Rect => (horizontal ? rect(k.from, 48 - rnd() * 4, k.len, thick + 8) : rect(48 - rnd() * 4, k.from, thick + 8, k.len));
        const rects = ks.map(toRect);
        // The oracle: [at, at + long] less every grown interval that overlaps it, parts under minLength dropped.
        const hit = ks.map((k) => [k.from - gap, k.from + k.len + gap] as const).filter(([lo, hi]) => hi > at && lo < at + long).sort((p, q) => p[0] - q[0]);
        const merged: [number, number][] = [];
        for (const [lo, hi] of hit) {
          const last = merged[merged.length - 1];
          if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
          else merged.push([lo, hi]);
        }
        const want: { id: string; lo: number; hi: number }[] = [];
        let cursor = at;
        merged.forEach(([lo, hi], j) => {
          want.push({ id: j === 0 ? "g" : `g#${j + 1}`, lo: cursor, hi: Math.max(cursor, lo) });
          cursor = hi;
        });
        want.push({ id: merged.length === 0 ? "g" : `g#${merged.length + 1}`, lo: Math.min(cursor, at + long), hi: at + long });
        const wantParts = want.filter((p) => (merged.length === 0 ? p.hi - p.lo > 0 : p.hi - p.lo >= minLength));
        const g = { id: "g", kind: "box" as const, rect: horizontal ? rect(at, 50, long, thick) : rect(50, at, thick, long) };
        const run = (order: readonly Rect[]) => guideRects([g], { inside: rect(0, 0, 1200, 1200), inset: 0, clear: order, clearance: gap });
        const out = run(rects);
        const label = `case ${i}: ${JSON.stringify([g.rect, rects, gap])}`;
        expect(out.length, label).toBe(wantParts.length);
        out.forEach((o, j) => {
          const lo = horizontal ? o.rect.x : o.rect.y;
          const len = horizontal ? o.rect.width : o.rect.height;
          expect(o.id, label).toBe(wantParts[j]!.id);
          expect(lo, label).toBeCloseTo(wantParts[j]!.lo, 6);
          expect(lo + len, label).toBeCloseTo(wantParts[j]!.hi, 6);
          if (merged.length > 0) expect(len, label).toBeGreaterThanOrEqual(minLength - 1e-6);
        });
        const shuffled = rects.map((r) => [rnd(), r] as const).sort((p, q) => p[0] - q[0]).map(([, r]) => r);
        expect(shown(run(shuffled)), label).toEqual(shown(out));
        expect(shown(run([...rects].reverse())), label).toEqual(shown(out));
        cases++;
        if (out.length >= 2) multi++;
      }
      expect(cases).toBe(20000);
      expect(multi).toBeGreaterThan(5000);
    });

    it("ids follow the side as a held item slides across the box: the far part is always #2, the near part the id itself", () => {
      // A 94 px held rect (2 px clearance) crosses a 300 px box in 1 px steps, from first touching it to leaving it.
      let steps = 0;
      let both = 0;
      for (let h = 5; h <= 401; h++) {
        const out = guideRects([box], { inside: area, clear: [rect(h, 8, 94, 35)] });
        for (const g of out) {
          // The held item's own end, grown by the 2 px clearance, is the border between the sides.
          expect(g.id, `h ${h}`).toBe(g.rect.x >= h + 94 ? "b#2" : "b");
        }
        if (out.length === 2) both++;
        steps++;
      }
      expect(steps).toBe(397);
      expect(both).toBeGreaterThan(100);
    });

    it("a guide without a string id is split without a suffix, and an unchanged one comes back as it was", () => {
      const anon = { kind: "box" as const, rect: rect(100, 10, 300, 31) };
      const out = guideRects([anon], { inside: area, clear: [rect(180, 8, 94, 35)] });
      expect(out.map((g) => g.rect)).toEqual([rect(100, 10, 78, 31), rect(276, 10, 124, 31)]);
      expect(out.every((g) => !("id" in g))).toBe(true);
      expect(guideRects([box], { inside: area, clear: [rect(500, 8, 94, 35)] })[0]).toBe(box);
    });
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
