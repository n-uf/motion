import { describe, expect, it } from "vitest";
import { createStack, readStack, storeStack, type StackState } from "../src/stack";

describe("the stack's stored form", () => {
  const state: StackState = {
    order: ["pages", "views", "findings", "zoom"],
    kept: ["findings"],
    closed: ["views"],
    used: ["zoom", "pages", "findings", "views"],
    forms: { pages: 1, zoom: 2 },
  };
  const same = (a: StackState, b: StackState): void => {
    expect([a.order, a.kept, a.closed, a.used]).toEqual([b.order, b.kept, b.closed, b.used]);
    expect({ ...a.forms }).toEqual({ ...b.forms });
  };

  it("C13: places, kept and closed items, the use order and chosen forms survive a round trip through JSON", () => {
    const saved = JSON.stringify(storeStack(state));
    expect(saved.startsWith('{"v":1,')).toBe(true);
    for (const known of [undefined, state.order]) {
      const read = readStack(JSON.parse(saved), known);
      expect(read.ok && read.dropped).toEqual([]);
      if (read.ok) same(read.state, state);
    }
  });

  it("the use order restores the give-way order: the first in `used` is the oldest", () => {
    const read = readStack(JSON.parse(JSON.stringify(storeStack(state))));
    expect(read.ok && read.state.used[0]).toBe("zoom");
    expect(read.ok && read.state.used.at(-1)).toBe("views");
  });

  it("stores plain data: the first form is the default and isn't kept, lists name only items of the order", () => {
    expect(storeStack(createStack(["a", "b"]))).toEqual({ v: 1, order: ["a", "b"], kept: [], closed: [], used: ["a", "b"], forms: {} });
    expect(storeStack({ order: ["a"], kept: ["gone", "a", "a"], closed: ["gone"], used: ["gone", "a"], forms: { a: 0, gone: 3 } })).toEqual({ v: 1, order: ["a"], kept: ["a"], closed: [], used: ["a"], forms: {} });
  });

  it("N4: a form is stored only as a whole number from 1", () => {
    const s = storeStack({ order: ["a", "b", "c", "d"], kept: [], closed: [], used: [], forms: { a: 1.5, b: -1, c: NaN, d: 2 } });
    expect(s.forms).toEqual({ d: 2 });
  });

  it("anything but an object of version 1 is a named error, never a throw", () => {
    expect(readStack(null)).toEqual({ ok: false, error: "not an object" });
    expect(readStack([])).toEqual({ ok: false, error: "not an object" });
    expect(readStack("{}")).toEqual({ ok: false, error: "not an object" });
    expect(readStack({ v: 2, order: [] })).toEqual({ ok: false, error: "unknown version 2 (this reads version 1)" });
    expect(readStack({ order: [] })).toEqual({ ok: false, error: "unknown version undefined (this reads version 1)" });
    expect(readStack({ v: 1 })).toEqual({ ok: false, error: "order is missing" });
    expect(readStack({ v: 1, order: "pages" })).toEqual({ ok: false, error: "order is missing" });
  });

  it("N5: a string version is quoted, so it can't pass for a number, and a long one is cut", () => {
    expect(readStack({ v: "1", order: [] })).toEqual({ ok: false, error: 'unknown version "1" (this reads version 1)' });
    const long = readStack({ v: "x".repeat(100), order: [] });
    expect(!long.ok && long.error.length).toBeLessThan(80);
  });

  it("never throws, whatever it is given", () => {
    const hostile = new Proxy({}, { get: () => { throw new Error("boom"); }, ownKeys: () => { throw new Error("boom"); } });
    const circular: Record<string, unknown> = { v: 1, order: [] };
    circular.self = circular;
    const values: unknown[] = [undefined, 0, 1, -1, NaN, 1n, Symbol("s"), () => 1, new Date(), /x/, hostile, circular, { v: 1n }, { v: 1, order: [1n, Symbol("x"), null, undefined, {}, []] }, { v: 1, order: ["a"], kept: 1n, forms: 5 }, { v: 1, order: ["a"], forms: { a: 1n } }, { v: 1, order: ["a"], forms: { a: -1 } }, { v: 1, order: ["a"], used: 3, closed: {} }];
    for (const v of values) {
      const r = readStack(v);
      expect(typeof r.ok).toBe("boolean");
    }
  });

  it("drops what it can't use and lists it", () => {
    const r = readStack({ v: 1, order: ["a", "b", "a", 3, "x"], kept: ["a", "a", "x", 7], closed: ["b", "q"], used: ["b", "z", "a"], forms: { a: 1, b: -1, c: 2, x: 1.5, y: "3", z: 0 }, zzz: 1 }, ["a", "b"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    same(r.state, { order: ["a", "b"], kept: ["a"], closed: ["b"], used: ["b", "a"], forms: { a: 1 } });
    expect(r.dropped).toEqual(expect.arrayContaining(["zzz", "a", "a number where an id goes", "x", "kept:x", "a number in kept", "closed:q", "used:z", "forms:b", "forms:c", "forms:x", "forms:y", "forms:z"]));
    expect(new Set(r.dropped).size).toBe(r.dropped.length);
  });

  it("N3: __proto__ and constructor keys in forms are dropped and listed, and pollute nothing", () => {
    const data = JSON.parse('{"v":1,"order":["a","__proto__","constructor"],"forms":{"__proto__":2,"constructor":3,"a":1}}');
    const r = readStack(data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect({ ...r.state.forms }).toEqual({ a: 1 });
    expect(r.dropped).toEqual(expect.arrayContaining(["forms:__proto__", "forms:constructor"]));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(r.state.forms)).toBeNull();
    // Writing them is refused too.
    expect(storeStack({ order: ["a", "__proto__"], kept: [], closed: [], used: [], forms: JSON.parse('{"__proto__":2,"a":1}') }).forms).toEqual({ a: 1 });
  });

  it("an item the consumer has and the stored order lacks is no error", () => {
    const r = readStack(storeStack(createStack(["a"])), ["a", "b"]);
    expect(r.ok && r.dropped).toEqual([]);
    if (r.ok) same(r.state, createStack(["a"]));
  });

  it("a field only a newer writer knows is skipped and reported, the rest is read", () => {
    const r = readStack({ ...storeStack(state), tabs: true });
    expect(r.ok && r.dropped).toEqual(["tabs"]);
    if (r.ok) same(r.state, state);
  });
});
