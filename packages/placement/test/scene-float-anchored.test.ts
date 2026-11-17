/** Anchored floats keep clear of the floats before them: a group sent to Float never lands on one already floating. */
import { describe, expect, it } from "vitest";
import { floatAt, moveTo, solve, type FloatAnchor, type Scene, type SceneFloat } from "../src/scene";
import { group, panel, seeded, windowScene } from "./scene-fixture";

type R = { x: number; y: number; width: number; height: number };
const overlaps = (a: R, b: R) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-3 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-3;
const same = (a: R, b: R) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const ANCHORS: readonly FloatAnchor[] = ["content-top-left", "content-top", "content-top-right", "content-right", "content-bottom-right", "content-bottom", "content-bottom-left", "content-left"];

/** The window scene with no float, plus a vertical strip group (`strip`) and two more groups that may float. */
function base(width = 1200, height = 800): Scene {
  const s = windowScene(width, height);
  return {
    ...s,
    items: { ...s.items, strip: group("strip", 9, { floatOrient: "column" }), g1: group("g1", 10), g2: group("g2", 11) },
    floats: [],
  };
}

/** Every laid float's rect, in stacking order. */
const floatRects = (s: Scene): [string, R][] => {
  const l = solve(s);
  return l.floats.map((id) => [id, l.items[id]!.rect]);
};

describe("an anchored float and the floats before it", () => {
  it("a group sent to Float lands beside a strip that already floats at the same corner", () => {
    const strip = floatAt(base(), "strip");
    const [[, at]] = floatRects(strip) as [[string, R]];
    const both = moveTo(strip, "g1", { kind: "float" });
    expect(both.floats.map((f) => [f.id, f.anchor])).toEqual([
      ["strip", "content-top-right"],
      ["g1", "content-top-right"],
    ]);
    const rects = Object.fromEntries(floatRects(both));
    // The strip keeps its place; the group takes the nearest clear place beside it.
    expect(rects.strip).toEqual(at);
    expect(overlaps(rects.g1!, rects.strip!)).toBe(false);
    expect(solve(both).notes.filter((n) => n.code === "float-covers")).toEqual([]);
  });

  it("a second group sent to Float lands beside the first, and the first stays put", () => {
    const one = moveTo(base(), "g1", { kind: "float" });
    const first = floatRects(one)[0]![1];
    const two = moveTo(one, "g2", { kind: "float" });
    const rects = Object.fromEntries(floatRects(two));
    expect(rects.g1).toEqual(first);
    expect(overlaps(rects.g2!, rects.g1!)).toBe(false);
    // And a third (the strip) clears both.
    const three = Object.fromEntries(floatRects(moveTo(two, "strip", { kind: "float" })));
    expect(overlaps(three.strip!, three.g1!) || overlaps(three.strip!, three.g2!)).toBe(false);
    expect([three.g1, three.g2]).toEqual([rects.g1, rects.g2]);
  });

  it("an anchored float clears a float the user placed by hand before it", () => {
    const corner = solve(floatAt(base(), "g1")).items.g1!.rect;
    const hand = floatAt(base(), "g2", corner);
    const s = moveTo(hand, "g1", { kind: "float" });
    const rects = Object.fromEntries(floatRects(s));
    expect(rects.g2).toEqual(corner);
    expect(overlaps(rects.g1!, rects.g2!)).toBe(false);
  });

  it("a float placed by hand keeps its rect, even over an anchored float before it", () => {
    const anchored = floatAt(base(), "g1");
    const at = solve(anchored).items.g1!.rect;
    const s = floatAt(anchored, "g2", at);
    const rects = Object.fromEntries(floatRects(s));
    expect(rects.g1).toEqual(at);
    expect(rects.g2).toEqual(at);
  });

  it("earlier floats win: the order of `scene.floats` decides which one moves", () => {
    const a: SceneFloat = { id: "g1", rect: { x: 0, y: 0, width: 200, height: 28 }, anchor: "content-top-right" };
    const b: SceneFloat = { id: "g2", rect: { x: 0, y: 0, width: 200, height: 28 }, anchor: "content-top-right" };
    const ab = Object.fromEntries(floatRects({ ...base(), floats: [a, b] }));
    const ba = Object.fromEntries(floatRects({ ...base(), floats: [b, a] }));
    expect(ab.g1).toEqual(ba.g2);
    expect(ab.g2).toEqual(ba.g1);
    expect(ab.g1).not.toEqual(ab.g2);
  });

  it("with no clear place, it lies where it would with no float before it (it never covers a docked item instead)", () => {
    // A stage the floats fill: the second has nowhere clear of both, so it takes the place it takes alone.
    const tiny: Scene = { stage: { x: 0, y: 0, width: 300, height: 100 }, edges: [], items: { g1: group("g1", 1), g2: group("g2", 2) }, floats: [], floatKinds: ["group"] };
    const big = { width: 300, height: 100 };
    const a: SceneFloat = { id: "g1", rect: { x: 0, y: 0, ...big }, anchor: "content-top-left" };
    const b: SceneFloat = { id: "g2", rect: { x: 0, y: 0, ...big }, anchor: "content-top-left" };
    const alone = solve({ ...tiny, floats: [b] }).items.g2!.rect;
    const l = solve({ ...tiny, floats: [a, b] });
    expect(l.items.g2!.rect).toEqual(alone);
  });
});

/**
 * Generated scenes: the window at a random size, its panels and groups floated in a random order, each anchored to a
 * random corner or side, or (now and then) at a rect of its own. `roomy`: small floats on a large stage, so a clear
 * place always exists.
 */
function generated(seed: number, roomy: boolean): Scene {
  const rnd = seeded(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const W = roomy ? 1400 + Math.floor(rnd() * 400) : 420 + Math.floor(rnd() * 900);
  const H = roomy ? 900 + Math.floor(rnd() * 200) : 300 + Math.floor(rnd() * 500);
  const s = base(W, H);
  const pool = ["notes", "strip", "g1", "g2", "views", "tools", "marks"];
  const n = 2 + Math.floor(rnd() * (roomy ? 3 : 5));
  let out: Scene = { ...s, items: { ...s.items, notes: panel("notes", 3) } };
  for (let i = 0; i < n && pool.length > 0; i++) {
    const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
    const size = roomy ? { width: 80 + rnd() * 80, height: 28 + rnd() * 92 } : { width: 80 + rnd() * 260, height: 28 + rnd() * 260 };
    const hand = rnd() < 0.2;
    const at = { x: rnd() * W, y: rnd() * H, ...size };
    out = moveTo(out, id, hand ? { kind: "float", rect: at } : { kind: "float", rect: at, anchor: pick(ANCHORS) });
  }
  return out;
}

describe("anchored floats, over generated scenes", () => {
  const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

  it("two anchored floats never overlap exactly", () => {
    let pairs = 0;
    for (const roomy of [false, true]) {
      for (const seed of SEEDS) {
        const s = generated(seed, roomy);
        const l = solve(s);
        const anchored = s.floats.filter((f) => f.anchor && l.items[f.id]?.floating).map((f) => [f.id, l.items[f.id]!.rect] as const);
        for (let i = 0; i < anchored.length; i++) for (let j = 0; j < i; j++) {
          pairs++;
          if (same(anchored[i]![1], anchored[j]![1])) throw new Error(`seed ${seed} roomy ${roomy}: ${anchored[i]![0]} lies exactly on ${anchored[j]![0]}`);
        }
      }
    }
    expect(pairs).toBeGreaterThan(300);
  });

  it("an anchored float never overlaps an earlier float when room exists", () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const s = generated(seed, true);
      const l = solve(s);
      const anchored = new Set(s.floats.filter((f) => f.anchor).map((f) => f.id));
      l.floats.forEach((id, i) => {
        if (!anchored.has(id)) return;
        for (const before of l.floats.slice(0, i)) {
          checked++;
          if (overlaps(l.items[id]!.rect, l.items[before]!.rect)) throw new Error(`seed ${seed}: ${id} covers ${before}`);
        }
      });
      expect(l.notes.filter((n) => n.code === "float-covers")).toEqual([]);
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("the layout is the same on every run (pure, order-stable)", () => {
    for (const seed of SEEDS.slice(0, 50)) expect(solve(generated(seed, false))).toEqual(solve(generated(seed, false)));
  });
});
