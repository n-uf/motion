import { describe, expect, expectTypeOf, it } from "vitest";
import { clampInto, overlap, rect, type Rect } from "../src/geometry";
import { fitFloat, readFloats, stackFloatTarget, storeFloats, type FloatFit, type StackFloat } from "../src/stack";
import { seeded } from "./stack-fixture";

const stage = rect(0, 0, 900, 500);
/** A column down the left (240 wide) under a bar along the top (32 tall): the docked content a float keeps clear of. */
const column = rect(0, 32, 240, 468);
const bar = rect(0, 0, 900, 32);
const covered = (r: Rect, avoid: readonly Rect[]): number[] => avoid.flatMap((a, i) => (overlap(r, a) > 1e-6 ? [i] : []));
const inStage = (r: Rect, s: Rect = stage): boolean => r.x >= s.x - 1e-9 && r.y >= s.y - 1e-9 && r.x + r.width <= s.x + s.width + 1e-9 && r.y + r.height <= s.y + s.height + 1e-9;

describe("fitFloat", () => {
  it("leaves a float that is inside the stage and clear of the docked content where it is", () => {
    const fit = fitFloat(rect(400, 100, 200, 150), stage, [column, bar]);
    expect(fit).toEqual({ rect: rect(400, 100, 200, 150), clamped: false, snapped: false, covers: [] });
    // Touching the docked content is clear.
    expect(fitFloat(rect(240, 32, 200, 150), stage, [column, bar]).snapped).toBe(false);
  });

  it("C17: clamps into the stage from any side, the size unchanged", () => {
    const w = 200;
    const h = 150;
    const cases: [string, Rect, Rect][] = [
      ["above", rect(400, -300, w, h), rect(400, 0, w, h)],
      ["below", rect(400, 900, w, h), rect(400, 350, w, h)],
      ["beside, past the right edge", rect(2000, 100, w, h), rect(700, 100, w, h)],
      ["beside, past the left edge", rect(-500, 100, w, h), rect(0, 100, w, h)],
      ["past a corner", rect(2000, 2000, w, h), rect(700, 350, w, h)],
    ];
    for (const [name, want, to] of cases) {
      const fit = fitFloat(want, stage);
      expect(fit.rect, name).toEqual(to);
      expect(fit.clamped, name).toBe(true);
    }
    // A stage that doesn't start at the origin, a float larger than it: the top-left corner stays on the stage's.
    const off = rect(100, 50, 300, 200);
    expect(fitFloat(rect(0, 0, 500, 300), off).rect).toEqual(rect(100, 50, 500, 300));
    expect(fitFloat(rect(1000, 1000, 50, 50), off).rect).toEqual(rect(350, 200, 50, 50));
  });

  it("C7: a float over docked content moves beside it, to the nearest clear place inside the stage", () => {
    // Over the middle of the column: the nearest side is its right edge.
    const over = fitFloat(rect(100, 200, 200, 150), stage, [column, bar]);
    expect(over.rect).toEqual(rect(240, 200, 200, 150));
    expect(over).toMatchObject({ snapped: true, clamped: false, covers: [] });
    // Over the bar: below it.
    const under = fitFloat(rect(500, 10, 200, 150), stage, [column, bar]);
    expect(under.rect).toEqual(rect(500, 32, 200, 150));
    // Over both (the corner): beside the column and below the bar, whichever is nearer in all.
    const corner = fitFloat(rect(100, 10, 200, 150), stage, [column, bar]);
    expect(covered(corner.rect, [column, bar])).toEqual([]);
    expect(inStage(corner.rect)).toBe(true);
    // Moved only as far as it must: the same size, no further than the column's width.
    expect(corner.rect.width).toBe(200);
    expect(Math.hypot(corner.rect.x - 100, corner.rect.y - 10)).toBeLessThanOrEqual(240);
  });

  it("moves clamped first: a float past an edge that is then over docked content still ends clear and inside", () => {
    const fit = fitFloat(rect(-80, 200, 200, 150), stage, [column, bar]);
    expect(fit.clamped).toBe(true);
    expect(fit.snapped).toBe(true);
    expect(fit.rect).toEqual(rect(240, 200, 200, 150));
  });

  it("between two stacks it takes the gap: beside the one it covers, never over the other", () => {
    const right = rect(660, 32, 240, 468);
    const fit = fitFloat(rect(150, 200, 200, 150), stage, [column, right]);
    expect(covered(fit.rect, [column, right])).toEqual([]);
    expect(fit.rect).toEqual(rect(240, 200, 200, 150));
    expect(fitFloat(rect(600, 200, 200, 150), stage, [column, right]).rect).toEqual(rect(460, 200, 200, 150));
  });

  it("with no clear place the float stays where it covers least and says what it covers", () => {
    // A stage 260 wide with a 240 column: a 200 wide float has 20 px clear. Nothing fits beside it.
    const narrow = rect(0, 0, 260, 400);
    const fit = fitFloat(rect(0, 100, 200, 150), narrow, [rect(0, 0, 240, 400)]);
    expect(fit.covers).toEqual([0]);
    expect(inStage(fit.rect, narrow)).toBe(true);
    // The least covered: against the right edge, 180 px of its 200 over the column.
    expect(fit.rect.x).toBe(60);
  });

  it("ignores empty and non-number avoid rects, and stays total on non-numbers", () => {
    expect(fitFloat(rect(100, 100, 50, 50), stage, [rect(100, 100, 0, 0)]).snapped).toBe(false);
    const fit = fitFloat(rect(NaN, 100, 50, NaN), stage, [column]);
    expect(Number.isFinite(fit.rect.x + fit.rect.y + fit.rect.width + fit.rect.height)).toBe(true);
    expect(fitFloat(rect(10, 10, 50, 50), rect(0, 0, NaN, 100)).rect.width).toBe(50);
  });

  it("sweep: always inside the stage, clear when a clear place exists, and fitting a fit changes nothing", () => {
    const rand = seeded(11);
    let snapped = 0;
    for (let trial = 0; trial < 300; trial++) {
      const colW = 30 + Math.floor(rand() * 330);
      const barH = 28 + Math.floor(rand() * 20);
      const avoid = [rect(0, barH, colW, 500 - barH), rect(0, 0, 900, barH)];
      const want = rect(Math.floor(rand() * 1500) - 300, Math.floor(rand() * 900) - 200, 60 + Math.floor(rand() * 240), 30 + Math.floor(rand() * 240));
      const fit: FloatFit = fitFloat(want, stage, avoid);
      expect(inStage(fit.rect), JSON.stringify(want)).toBe(true);
      expect(fit.rect.width).toBe(want.width);
      expect(fit.rect.height).toBe(want.height);
      // A clear place exists (the area right of the column and below the bar is 900 - colW by 500 - barH, the float fits).
      expect(covered(fit.rect, avoid), JSON.stringify([want, avoid])).toEqual([]);
      expect(fit.covers).toEqual([]);
      expect(fitFloat(fit.rect, stage, avoid).rect).toEqual(fit.rect);
      if (fit.snapped) snapped++;
    }
    // The sweep reaches the snap, not only the clamp.
    expect(snapped).toBeGreaterThan(50);
  });

  it("clamped is true also when a position that wasn't a number was replaced", () => {
    expect(fitFloat(rect(NaN, 100, 50, 50), stage).clamped).toBe(true);
    expect(fitFloat(rect(100, Infinity, 50, 50), stage).clamped).toBe(true);
    expect(fitFloat(rect(100, 100, 50, 50), stage).clamped).toBe(false);
    expect(fitFloat(rect(100, 100, NaN, 50), stage).clamped).toBe(false);
  });

  /** The old search, for small cases: every edge-aligned place crossed, the least covered first, then the nearest. */
  function brute(want: Rect, area: Rect, avoid: readonly Rect[]): { far: number; left: number } {
    const inside = clampInto(want, area);
    const lo = (v: number, from: number, to: number): number => Math.min(Math.max(v, from), Math.max(from, to));
    const xs = [inside.x, area.x, area.x + area.width - want.width];
    const ys = [inside.y, area.y, area.y + area.height - want.height];
    for (const a of avoid) {
      xs.push(a.x - want.width, a.x + a.width);
      ys.push(a.y - want.height, a.y + a.height);
    }
    let best: { far: number; left: number } | null = null;
    for (const y of new Set(ys.map((v) => lo(v, area.y, area.y + area.height - want.height)))) {
      for (const x of new Set(xs.map((v) => lo(v, area.x, area.x + area.width - want.width)))) {
        const cand = rect(x, y, want.width, want.height);
        const left = avoid.reduce((s, a) => s + overlap(cand, a), 0);
        const far = Math.hypot(x - inside.x, y - inside.y);
        const clear = left <= 1e-3;
        if (!best || (clear ? 0 : left) < best.left - 1e-3 || (Math.abs((clear ? 0 : left) - best.left) <= 1e-3 && far < best.far - 1e-9)) best = { far, left: clear ? 0 : left };
      }
    }
    return best!;
  }

  it("agrees with a search over every place on small cases: as near as any clear place, else as little covered", () => {
    const rand = seeded(5);
    let crowded = 0;
    for (let trial = 0; trial < 400; trial++) {
      const n = 1 + Math.floor(rand() * 6);
      const avoid = Array.from({ length: n }, () => rect(Math.floor(rand() * 700), Math.floor(rand() * 400), 20 + Math.floor(rand() * 260), 20 + Math.floor(rand() * 200)));
      // Some trials give a float big enough that no place may be clear.
      const big = rand() < 0.25;
      const want = rect(Math.floor(rand() * 900), Math.floor(rand() * 500), big ? 300 + Math.floor(rand() * 500) : 40 + Math.floor(rand() * 200), big ? 200 + Math.floor(rand() * 280) : 30 + Math.floor(rand() * 150));
      const fit = fitFloat(want, stage, avoid);
      const want0 = brute(want, stage, avoid);
      const inside = clampInto(want, stage);
      const far = Math.hypot(fit.rect.x - inside.x, fit.rect.y - inside.y);
      const left = covered(fit.rect, avoid).reduce((s, i) => s + overlap(fit.rect, avoid[i]!), 0);
      const label = JSON.stringify([want, avoid]);
      if (want0.left === 0) {
        expect(covered(fit.rect, avoid), label).toEqual([]);
        expect(fit.covers, label).toEqual([]);
        expect(far, label).toBeCloseTo(want0.far, 6);
      } else {
        crowded++;
        expect(left, label).toBeCloseTo(want0.left, 1);
        expect(fit.covers.length > 0, label).toBe(true);
      }
    }
    // The cases reach both answers.
    expect(crowded).toBeGreaterThan(5);
    expect(crowded).toBeLessThan(300);
  });

  it("stays fast with many docked rects: 300 take well under a frame, and a crowded stage is bounded", () => {
    const rand = seeded(9);
    // A column, a bar, 280 small items packed on the right and 20 scattered over the pages: the float is dropped over the column.
    const small = (x0: number, w: number): Rect => rect(x0 + Math.floor(rand() * w), 40 + Math.floor(rand() * 440), 8 + Math.floor(rand() * 14), 8 + Math.floor(rand() * 14));
    const avoid = [column, bar, ...Array.from({ length: 280 }, () => small(620, 250)), ...Array.from({ length: 20 }, () => small(250, 340))];
    const want = rect(100, 200, 120, 90);
    let best = Infinity;
    let fit = fitFloat(want, stage, avoid);
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      fit = fitFloat(want, stage, avoid);
      best = Math.min(best, performance.now() - t0);
    }
    expect(covered(fit.rect, avoid)).toEqual([]);
    expect(inStage(fit.rect)).toBe(true);
    expect(best).toBeLessThan(8);
    // Where nothing is clear (a float too big for the gaps), the answer is bounded too.
    const t1 = performance.now();
    const full = fitFloat(rect(300, 100, 300, 420), stage, avoid);
    expect(performance.now() - t1).toBeLessThan(250);
    expect(full.covers.length).toBeGreaterThan(0);
  });

  it("leaves out the rects that can't touch the float, and reports indexes into the whole `avoid` list", () => {
    // Outside the stage, empty, or NaN: none is in the way, and none changes the answer.
    const far = [rect(2000, 2000, 100, 100), rect(10, 10, 0, 50), rect(NaN, 0, 10, 10)];
    expect(fitFloat(rect(100, 100, 50, 50), stage, [...far, column]).rect).toEqual(rect(240, 100, 50, 50));
    // A float bigger than the stage can reach past it: a rect there still counts, with its own index.
    const fit = fitFloat(rect(0, 0, 1000, 600), stage, [rect(950, 10, 30, 30)]);
    expect(fit.covers).toEqual([0]);
  });
});

describe("stackFloatTarget", () => {
  const input = { id: "notes", stage, size: { width: 200, height: 150 }, avoid: [column, bar] };

  it("is a free, priority 3 target in the drag shape whose hit covers the whole plane", () => {
    const t = stackFloatTarget(input);
    // Its id names the item and its kind says what it is, so it can't be mistaken for ./desk's "float" target.
    expect([t.id, t.kind, t.priority, t.free, t.item, t.label, t.slot]).toEqual(["float:notes", "float", 3, true, "notes", "Float here", undefined]);
    for (const p of [{ x: -5000, y: -5000 }, { x: 450, y: 250 }, { x: 99999, y: -3 }, { x: 0, y: 1e6 }]) {
      expect(p.x >= t.hit.x && p.x <= t.hit.x + t.hit.width && p.y >= t.hit.y && p.y <= t.hit.y + t.hit.height).toBe(true);
    }
    expect(stackFloatTarget({ ...input, label: "Tear off" }).label).toBe("Tear off");
  });

  it("C17: a pointer past the stage's edge drops a float clamped into the stage; it never returns nothing", () => {
    const t = stackFloatTarget(input);
    const grab = { x: 20, y: 10 };
    const above = t.make({ x: 500, y: -400 }, grab);
    // Clamped to the stage's top, which is the bar: it lands just below the bar.
    expect(above.rect).toEqual(rect(480, 32, 200, 150));
    expect(above.fit).toMatchObject({ clamped: true, snapped: true });
    const below = t.make({ x: 500, y: 1400 }, grab);
    expect(below.rect).toEqual(rect(480, 350, 200, 150));
    const right = t.make({ x: 5000, y: 200 }, grab);
    expect(right.rect).toEqual(rect(700, 190, 200, 150));
    const left = t.make({ x: -300, y: 300 }, grab);
    // Past the left edge it is over the column, then beside it.
    expect(left.rect.x).toBe(240);
    for (const d of [above, below, right, left]) {
      expect(inStage(d.rect)).toBe(true);
      expect(covered(d.rect, [column, bar])).toEqual([]);
    }
  });

  it("C7: the drop's rect is clear of the docked content; the preview and the drop are the same answer", () => {
    const t = stackFloatTarget(input);
    // The pointer holds the float's right side just right of the column, so its body lies over the column.
    const d = t.make({ x: 300, y: 200 }, { x: 190, y: 10 });
    expect(d.fit.snapped).toBe(true);
    expect(d.rect).toEqual(rect(240, 190, 200, 150));
    expect(t.make({ x: 300, y: 200 }, { x: 190, y: 10 })).toEqual(d);
  });

  it("holds the float by the middle when no grab is given, and never resizes it", () => {
    const t = stackFloatTarget(input);
    expect(t.make({ x: 500, y: 250 }).rect).toEqual(rect(400, 175, 200, 150));
    const big = stackFloatTarget({ ...input, size: { width: 2000, height: 1000 } });
    expect(big.make({ x: 500, y: 250 }).rect).toMatchObject({ width: 2000, height: 1000 });
  });

  it("types: the target is the drag shape, free and at priority 3", () => {
    const t = stackFloatTarget(input);
    expectTypeOf(t.priority).toEqualTypeOf<3>();
    expectTypeOf(t.free).toEqualTypeOf<true>();
    expectTypeOf(t.hit).toEqualTypeOf<Rect>();
  });
});

describe("the floats' stored form", () => {
  const floats: StackFloat[] = [
    { id: "notes", rect: rect(300, 120, 220, 160) },
    { id: "pages", rect: rect(40.5, 60, 200, 180) },
  ];

  it("C13: places and sizes survive a round trip through JSON, in stacking order", () => {
    const saved = JSON.stringify(storeFloats(floats));
    expect(saved).toBe('{"v":1,"floats":[{"id":"notes","x":300,"y":120,"width":220,"height":160},{"id":"pages","x":40.5,"y":60,"width":200,"height":180}]}');
    for (const known of [undefined, ["notes", "pages"]]) {
      const read = readFloats(JSON.parse(saved), known);
      expect(read).toEqual({ ok: true, floats, dropped: [] });
    }
    expect(readFloats(storeFloats([]))).toEqual({ ok: true, floats: [], dropped: [] });
  });

  it("C16: a float has no pinned flag: the store writes none, a float has none", () => {
    expect(JSON.stringify(storeFloats(floats))).not.toContain("pinned");
    expect(Object.keys(storeFloats(floats).floats[0]!).sort()).toEqual(["height", "id", "width", "x", "y"]);
    expect(Object.keys(floats[0]!).sort()).toEqual(["id", "rect"]);
    // Even a float someone built with the flag, cast, stores without it.
    const sneaky = [{ id: "a", rect: rect(0, 0, 10, 10), pinned: true }] as unknown as StackFloat[];
    expect(JSON.stringify(storeFloats(sneaky))).not.toContain("pinned");
  });

  it("C16: an old stored pinned: true loads as a plain float, and the key is listed as ignored", () => {
    const old = { v: 1, floats: [{ id: "navigator", x: 700, y: 40, width: 180, height: 200, pinned: true }, { id: "notes", x: 10, y: 20, width: 100, height: 50, pinned: false }, { id: "pages", x: 1, y: 2, width: 3, height: 4 }] };
    const read = readFloats(old);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.floats).toEqual([
      { id: "navigator", rect: rect(700, 40, 180, 200) },
      { id: "notes", rect: rect(10, 20, 100, 50) },
      { id: "pages", rect: rect(1, 2, 3, 4) },
    ]);
    for (const f of read.floats) expect(Object.keys(f).sort()).toEqual(["id", "rect"]);
    expect(read.dropped).toEqual(["pinned:navigator", "pinned:notes"]);
    // Stored again, it is gone.
    expect(JSON.stringify(storeFloats(read.floats))).not.toContain("pinned");
  });

  it("never throws: bad data is an error, bad floats are dropped and listed", () => {
    for (const bad of [null, undefined, 3, "x", [], { v: 2, floats: [] }, { v: "1", floats: [] }, { v: 1 }, { v: 1, floats: {} }]) expect(readFloats(bad).ok, String(JSON.stringify(bad))).toBe(false);
    expect(readFloats({ v: 2, floats: [] })).toEqual({ ok: false, error: "unknown version 2 (this reads version 1)" });
    const read = readFloats(
      {
        v: 1,
        extra: 1,
        floats: [
          { id: "a", x: 1, y: 2, width: 3, height: 4 },
          { id: "a", x: 9, y: 9, width: 9, height: 9 },
          { id: "b", x: "1", y: 2, width: 3, height: 4 },
          { id: "c", x: 1, y: 2, width: 0, height: 4 },
          { id: "d", x: NaN, y: 2, width: 3, height: 4 },
          { id: 5, x: 1, y: 2, width: 3, height: 4 },
          { id: "gone", x: 1, y: 2, width: 3, height: 4 },
          { id: "e", x: 1, y: 2, width: 3, height: 4, colour: "red" },
          null,
          [],
          7,
        ],
      },
      ["a", "b", "c", "d", "e"],
    );
    expect(read.ok && read.floats.map((f) => f.id)).toEqual(["a", "e"]);
    // A repeated id keeps its last entry (the list is in stacking order).
    expect(read.ok && read.floats[0]!.rect).toEqual(rect(9, 9, 9, 9));
    // The version in words: a string is quoted, as the stack's own reader says it.
    expect(readFloats({ v: "1", floats: [] })).toEqual({ ok: false, error: 'unknown version "1" (this reads version 1)' });
    expect(readFloats({ v: null, floats: [] })).toEqual({ ok: false, error: "unknown version object (this reads version 1)" });
    expect(read.ok && read.dropped).toEqual(["extra", "float:a", "float:b", "float:c", "float:d", "a float with no id", "float:gone", "float:e:colour", "a null where a float goes", "a list where a float goes", "a number where a float goes"]);
    // A throwing getter and a proxy don't throw either.
    const trap = { v: 1, get floats(): unknown { throw new Error("boom"); } };
    expect(readFloats(trap)).toEqual({ ok: false, error: "unreadable: boom" });
    expect(readFloats(new Proxy({}, { ownKeys() { throw new Error("no keys"); }, get() { return 1; } })).ok).toBe(false);
  });

  it("stores only floats it can read back: of a repeated id the last readable entry stays, and a bad rect is left out", () => {
    const stored = storeFloats([
      { id: "a", rect: rect(1, 2, 3, 4) },
      { id: "a", rect: rect(5, 6, 7, 8) },
      { id: "b", rect: rect(NaN, 0, 5, 5) },
      { id: "c", rect: rect(0, 0, 0, 5) },
      { id: "__proto__", rect: rect(0, 0, 5, 5) },
    ]);
    expect(stored.floats.map((f) => f.id)).toEqual(["a", "__proto__"]);
    expect(stored.floats[0]).toEqual({ id: "a", x: 5, y: 6, width: 7, height: 8 });
    // The last readable entry: a later one that can't be stored doesn't take the id away, and the order is the stacking order.
    expect(storeFloats([{ id: "a", rect: rect(1, 2, 3, 4) }, { id: "b", rect: rect(0, 0, 5, 5) }, { id: "a", rect: rect(NaN, 0, 5, 5) }]).floats.map((f) => [f.id, f.x])).toEqual([["a", 1], ["b", 0]]);
    expect(storeFloats([{ id: "a", rect: rect(1, 2, 3, 4) }, { id: "b", rect: rect(0, 0, 5, 5) }, { id: "a", rect: rect(9, 2, 3, 4) }]).floats.map((f) => [f.id, f.x])).toEqual([["b", 0], ["a", 9]]);
    const back = readFloats(JSON.parse(JSON.stringify(stored)));
    expect(back.ok && back.floats.map((f) => f.id)).toEqual(["a", "__proto__"]);
  });
});
