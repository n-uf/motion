/**
 * `stops()` is remembered per scene object. That is sound only while a scene is an immutable value, so the first test
 * freezes generated scenes deeply and runs everything the library does with one (a throw in strict mode is a mutation);
 * the rest check what the memory promises: the same answer, a new array each call, a miss for another scene or other
 * options, and no solve at all the second time.
 */
import { describe, expect, it } from "vitest";
import { close, fold, keep, moveTo, open, readScene, refusals, resize, solve, stops, storeScene, targets, use, type Scene, type SceneLayout, type SceneTarget } from "../src/scene";
import { modelScene } from "./model-scene";

function deepFreeze<T>(x: T): T {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as object)) deepFreeze(v);
  }
  return x;
}

const draggable = (s: Scene): string[] => Object.keys(s.items).filter((id) => !s.items[id]!.fixed && !s.items[id]!.closed);
const summary = (list: readonly SceneTarget[]): unknown[] => list.map((t) => [t.id, t.place, t.hit, t.slot ?? null]);

describe("a scene is an immutable value", () => {
  it("solve, targets, stops, refusals, every change and the store leave a deeply frozen scene alone", () => {
    let calls = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = deepFreeze(modelScene(seed, seed % 3 === 0, seed % 4 === 0, seed % 5 === 0));
      const l = deepFreeze(solve(s));
      for (const id of draggable(s)) {
        const ts = targets(s, id, { previous: l, endReach: 12 });
        refusals(s, id);
        stops(s, id);
        for (const t of ts) if (t.place.kind !== "none") t.after({ x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 });
        for (const next of [fold(s, id, true), fold(s, id, false), close(s, id), open(s, id), use(s, id), keep(s, id, true)]) solve(next, { previous: l });
        const t = ts.find((x) => x.place.kind === "gap" || x.place.kind === "column" || x.place.kind === "rail");
        if (t && (t.place.kind === "gap" || t.place.kind === "column" || t.place.kind === "rail")) moveTo(s, id, t.place);
        calls++;
      }
      const f = s.floats[0];
      if (f) resize(s, f.id, { x: f.rect.x, y: f.rect.y, width: f.rect.width + 10, height: f.rect.height }, { right: true });
      readScene(storeScene(s), s);
    }
    expect(calls).toBeGreaterThan(200);
  });
});

describe("stops() is remembered per scene", () => {
  const scene = modelScene(3);
  const id = draggable(scene)[0]!;

  it("answers as an unremembered call does (a copy of the scene is another object, so it is solved afresh)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = modelScene(seed);
      for (const g of draggable(s)) {
        const cold = stops(structuredClone(s), g);
        expect(summary(stops(s, g)), `seed ${seed} ${g}`).toEqual(summary(cold));
        expect(summary(stops(s, g))).toEqual(summary(cold));
      }
    }
  });

  it("gives a new array each call, over the same targets, so sorting or emptying yours changes nothing", () => {
    const a = stops(scene, id);
    expect(a.length).toBeGreaterThan(0);
    const b = stops(scene, id);
    expect(b).not.toBe(a);
    expect(b).toEqual(a);
    a.reverse();
    a.length = 0;
    expect(stops(scene, id)).toEqual(b);
    expect(stops(scene, id)[0]).toBe(b[0]);
  });

  it("solves once: the second call on a scene is a lookup", () => {
    const s = modelScene(7);
    const g = draggable(s)[1]!;
    const t0 = performance.now();
    stops(s, g);
    const cold = performance.now() - t0;
    let again = Infinity;
    for (let k = 0; k < 5; k++) {
      const t1 = performance.now();
      stops(s, g);
      again = Math.min(again, performance.now() - t1);
    }
    expect(again).toBeLessThan(Math.max(0.05, cold / 5));
  });

  it("is a miss for another scene object (a change), another item, and other options", () => {
    // A change (kept), so a new scene object (a hand fold may be nothing for an item with no folded form).
    const changed = keep(scene, id, true);
    expect(changed).not.toBe(scene);
    expect(summary(stops(changed, id))).toEqual(summary(stops(structuredClone(changed), id)));
    const other = draggable(scene)[1]!;
    expect(summary(stops(scene, other))).toEqual(summary(stops(structuredClone(scene), other)));
    const reach = { endReach: 12 };
    expect(summary(stops(scene, id, reach))).toEqual(summary(stops(structuredClone(scene), id, reach)));
    const prev: SceneLayout = solve(scene);
    const withPrev = { previous: prev };
    expect(summary(stops(scene, id, withPrev))).toEqual(summary(stops(structuredClone(scene), id, withPrev)));
    // The same options asked again, by value, hit; a float size changes the float stop.
    const small = stops(scene, id, { floatSize: { width: 120, height: 80 } });
    const large = stops(scene, id, { floatSize: { width: 400, height: 300 } });
    const floatOf = (l: readonly SceneTarget[]): SceneTarget | undefined => l.find((t) => t.place.kind === "float");
    if (floatOf(small) && floatOf(large)) expect(floatOf(small)!.after({ x: 300, y: 300 }).layout.items[id]?.rect.width).not.toBe(floatOf(large)!.after({ x: 300, y: 300 }).layout.items[id]?.rect.width);
  });

  it("throws as before for an invalid scene, and remembers nothing of it", () => {
    const bad: Scene = { ...scene, edges: [...scene.edges, { ...scene.edges[0]!, id: "column:left" }] };
    expect(() => stops(bad, id)).toThrow();
    expect(() => stops(bad, id)).toThrow();
  });
});
