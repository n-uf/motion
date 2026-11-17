/** Anchored floats keep clear of the floats before them: a group sent to Float never lands on one already floating. */
import { describe, expect, it } from "vitest";
import { FLOAT_ANCHORS, anchorName, floatAt, moveTo, raise, readScene, solve, storeScene, type Scene, type SceneFloat } from "../src/scene";
import { group, panel, seeded, windowScene } from "./scene-fixture";

type R = { x: number; y: number; width: number; height: number };
const overlaps = (a: R, b: R) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-3 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-3;
const same = (a: R, b: R) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

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

describe("an anchored float and the other floats", () => {
  it("a group sent to Float lands beside a strip that already floats at the same corner", () => {
    const strip = floatAt(base(), "strip");
    const [[, at]] = floatRects(strip) as [[string, R]];
    // "strip" sorts before "tools": the strip keeps the corner, the group takes the nearest clear place beside it.
    const both = moveTo(strip, "tools", { kind: "float" });
    expect(both.floats.map((f) => [f.id, f.anchor])).toEqual([
      ["strip", "content-top-right"],
      ["tools", "content-top-right"],
    ]);
    const rects = Object.fromEntries(floatRects(both));
    expect(rects.strip).toEqual(at);
    expect(overlaps(rects.tools!, rects.strip!)).toBe(false);
    expect(solve(both).notes.filter((n) => n.code === "float-covers")).toEqual([]);
  });

  it("among anchored floats the smaller id keeps the corner, whichever floated first", () => {
    const strip = floatAt(base(), "strip");
    const both = moveTo(strip, "g1", { kind: "float" });
    const rects = Object.fromEntries(floatRects(both));
    expect(rects.g1).toEqual(solve(floatAt(base(), "g1")).items.g1!.rect);
    expect(overlaps(rects.g1!, rects.strip!)).toBe(false);
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

  it("an anchored float clears a float the user placed by hand, before or after it in the stack", () => {
    const corner = solve(floatAt(base(), "g1")).items.g1!.rect;
    const hand = floatAt(base(), "g2", corner);
    const s = moveTo(hand, "g1", { kind: "float" });
    const rects = Object.fromEntries(floatRects(s));
    expect(rects.g2).toEqual(corner);
    expect(overlaps(rects.g1!, rects.g2!)).toBe(false);
    // The hand float later in the stack: the same rects.
    expect(Object.fromEntries(floatRects({ ...s, floats: [...s.floats].reverse() }))).toEqual(rects);
  });

  it("a float placed by hand keeps its rect; the anchored float under it moves beside it", () => {
    const anchored = floatAt(base(), "g1");
    const at = solve(anchored).items.g1!.rect;
    const s = floatAt(anchored, "g2", at);
    const rects = Object.fromEntries(floatRects(s));
    expect(rects.g2).toEqual(at);
    expect(overlaps(rects.g1!, rects.g2!)).toBe(false);
  });

  it("the stacking order decides nothing: the smaller id wins among anchored floats", () => {
    const a: SceneFloat = { id: "g1", rect: { x: 0, y: 0, width: 200, height: 28 }, anchor: "content-top-right" };
    const b: SceneFloat = { id: "g2", rect: { x: 0, y: 0, width: 200, height: 28 }, anchor: "content-top-right" };
    const ab = Object.fromEntries(floatRects({ ...base(), floats: [a, b] }));
    const ba = Object.fromEntries(floatRects({ ...base(), floats: [b, a] }));
    expect(ab).toEqual(ba);
    expect(ab.g1).toEqual(solve({ ...base(), floats: [a] }).items.g1!.rect);
    expect(overlaps(ab.g1!, ab.g2!)).toBe(false);
  });

  it("raise reshapes nothing: an anchored float under a hand float it avoids stays put when raised", () => {
    const corner = solve(floatAt(base(), "g1")).items.g1!.rect;
    const a: SceneFloat = { id: "g1", rect: { x: 0, y: 0, width: 200, height: 28 }, anchor: "content-top-right" };
    const b: SceneFloat = { id: "g2", rect: { ...corner } };
    const s: Scene = { ...base(), floats: [a, b] };
    const before = Object.fromEntries(floatRects(s));
    expect(before.g2).toEqual(corner);
    expect(overlaps(before.g1!, before.g2!)).toBe(false);
    for (const id of ["g1", "g2"]) expect(Object.fromEntries(floatRects(raise(s, id)))).toEqual(before);
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
    out = moveTo(out, id, hand ? { kind: "float", rect: at } : { kind: "float", rect: at, anchor: pick(FLOAT_ANCHORS) });
  }
  return out;
}

describe("an anchor with an offset", () => {
  const one = (anchor: SceneFloat["anchor"]): Scene => ({ ...base(), floats: [{ id: "g1", rect: { x: 0, y: 0, width: 200, height: 28 }, ...(anchor ? { anchor } : {}) }] });
  const at = (s: Scene) => solve(s).items.g1!.rect;

  it("anchorName gives the name with or without an offset", () => {
    expect(anchorName("content-left")).toBe("content-left");
    expect(anchorName({ at: "content-top-right", dy: 12 })).toBe("content-top-right");
  });

  it("lies at its anchor moved by dx and dy, and follows the content", () => {
    const plain = at(one("content-top-right"));
    expect(at(one({ at: "content-top-right" }))).toEqual(plain);
    expect(at(one({ at: "content-top-right", dy: 12 }))).toEqual({ ...plain, y: plain.y + 12 });
    expect(at(one({ at: "content-top-right", dx: -20, dy: 12 }))).toEqual({ ...plain, x: plain.x - 20, y: plain.y + 12 });
    // A wider window: it keeps the same offset from the corner.
    const wide = (s: Scene): Scene => ({ ...s, stage: { ...s.stage, width: 1500 } });
    expect(at(wide(one({ at: "content-top-right", dy: 12 })))).toEqual({ ...at(wide(one("content-top-right"))), y: plain.y + 12 });
    // An offset that isn't a number is no offset.
    expect(at(one({ at: "content-bottom-left", dx: Number.NaN }))).toEqual(at(one("content-bottom-left")));
  });

  it("moveTo takes it, and it keeps clear of what floats are kept clear of", () => {
    const s = moveTo(base(), "g1", { kind: "float", anchor: { at: "content-top-right", dy: 12 } });
    expect(s.floats.find((f) => f.id === "g1")!.anchor).toEqual({ at: "content-top-right", dy: 12 });
    const plain = solve(moveTo(base(), "g1", { kind: "float" })).items.g1!.rect;
    expect(solve(s).items.g1!.rect).toEqual({ ...plain, y: plain.y + 12 });
    // Pushed up into the bars, it is moved back clear of them.
    const up = solve(moveTo(base(), "g1", { kind: "float", anchor: { at: "content-top-right", dy: -30 } }));
    expect(up.items.g1!.rect.y).toBe(plain.y);
    expect(up.notes).toContainEqual({ code: "float-moved", id: "g1" });
  });

  it("round-trips through storeScene and readScene; the clamp never turns it into a pixel position", () => {
    const s: Scene = { ...base(), floats: [{ id: "g1", rect: { x: 5000, y: -300, width: 200, height: 28 }, anchor: { at: "content-top-right", dx: -8, dy: 12 } }, { id: "g2", rect: { x: 0, y: 0, width: 200, height: 28 }, anchor: "content-bottom" }] };
    const stored = storeScene(s);
    expect(stored.floats.map((f) => f.anchor)).toEqual([{ at: "content-top-right", dx: -8, dy: 12 }, "content-bottom"]);
    const read = readScene(JSON.parse(JSON.stringify(stored)), base());
    expect(read.dropped).toEqual([]);
    expect(read.scene.floats.map((f) => f.anchor)).toEqual([{ at: "content-top-right", dx: -8, dy: 12 }, "content-bottom"]);
    // The stored x is far outside the stage; the float still lies by its anchor and offset.
    expect(solve(read.scene).items.g1).toEqual(solve(s).items.g1);
    expect(storeScene(read.scene)).toEqual(storeScene(readScene(stored, base()).scene));
  });

  it("readScene drops what it can't use and lists it", () => {
    const stored = (anchor: unknown) => ({ v: 1, edges: [], items: {}, floats: [{ id: "g1", x: 10, y: 10, width: 200, height: 28, anchor }] });
    const read = (anchor: unknown) => readScene(stored(anchor), base());
    expect(read({ at: "content-top", dx: "12", dy: 4 }).scene.floats[0]!.anchor).toEqual({ at: "content-top", dy: 4 });
    expect(read({ at: "content-top", dx: "12", dy: 4 }).dropped).toEqual(["float:g1:anchor:dx"]);
    expect(read({ at: "content-top", z: 1 }).dropped).toEqual(["float:g1:anchor:z"]);
    expect(read({ at: "nowhere", dy: 4 }).scene.floats[0]!.anchor).toBeUndefined();
    expect(read({ at: "nowhere", dy: 4 }).dropped).toEqual(["float:g1:anchor"]);
    expect(read("nowhere").dropped).toEqual(["float:g1:anchor"]);
    expect(read("content-left").scene.floats[0]!.anchor).toBe("content-left");
    // null and an array are no anchor: dropped and listed, the float kept at its rect.
    for (const bad of [null, ["content-top", 4], [], 12]) {
      const r = read(bad);
      expect(r.scene.floats[0]).toEqual({ id: "g1", rect: { x: 10, y: 10, width: 200, height: 28 } });
      expect(r.dropped).toEqual(["float:g1:anchor"]);
    }
  });
});

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

  it("an anchored float never overlaps a float that wins over it (one placed by hand, an anchored one with a smaller id) when room exists", () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const s = generated(seed, true);
      const l = solve(s);
      const anchored = new Set(s.floats.filter((f) => f.anchor).map((f) => f.id));
      for (const id of l.floats) {
        if (!anchored.has(id)) continue;
        for (const other of l.floats) {
          if (other === id || (anchored.has(other) && other > id)) continue;
          checked++;
          if (overlaps(l.items[id]!.rect, l.items[other]!.rect)) throw new Error(`seed ${seed}: ${id} covers ${other}`);
        }
      }
      expect(l.notes.filter((n) => n.code === "float-covers")).toEqual([]);
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("raise changes no rect: raising each float in turn leaves every rect as it was", () => {
    let raised = 0;
    for (const roomy of [false, true]) {
      for (const seed of SEEDS) {
        let s = generated(seed, roomy);
        const rects = (x: Scene) => Object.fromEntries(floatRects(x));
        const before = rects(s);
        for (const f of [...s.floats]) {
          s = raise(s, f.id);
          raised++;
          const after = rects(s);
          if (JSON.stringify(Object.entries(after).sort()) !== JSON.stringify(Object.entries(before).sort())) throw new Error(`seed ${seed} roomy ${roomy}: raising ${f.id} moved a float`);
        }
      }
    }
    expect(raised).toBeGreaterThan(1000);
  });

  it("the layout is the same on every run, and the same whatever the stacking order", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const s = generated(seed, false);
      expect(solve(s)).toEqual(solve(generated(seed, false)));
      const flipped = solve({ ...s, floats: [...s.floats].reverse() });
      for (const f of s.floats) expect(flipped.items[f.id]?.rect).toEqual(solve(s).items[f.id]?.rect);
    }
  });
});
