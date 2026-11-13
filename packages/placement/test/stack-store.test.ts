import { describe, expect, it } from "vitest";
import { createStack, readStack, storeStack, type StackState } from "../src/stack";

describe("the stack's stored form", () => {
  const state: StackState = { order: ["pages", "views", "findings", "zoom"], kept: ["findings"], forms: { pages: 1, zoom: 2 } };

  it("C13: a state survives a round trip through JSON", () => {
    const saved = JSON.stringify(storeStack(state));
    expect(saved.startsWith('{"v":1,')).toBe(true);
    const read = readStack(JSON.parse(saved));
    expect(read).toEqual({ ok: true, state, dropped: [] });
    expect(readStack(JSON.parse(saved), state.order)).toEqual({ ok: true, state, dropped: [] });
  });

  it("stores plain data: the first form is the default and isn't kept", () => {
    expect(storeStack(createStack(["a", "b"]))).toEqual({ v: 1, order: ["a", "b"], kept: [], forms: {} });
    expect(storeStack({ order: ["a"], kept: ["gone"], forms: { a: 0, gone: 3 } })).toEqual({ v: 1, order: ["a"], kept: [], forms: {} });
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

  it("never throws, whatever it is given", () => {
    const hostile = new Proxy({}, { get: () => { throw new Error("boom"); }, ownKeys: () => { throw new Error("boom"); } });
    const circular: Record<string, unknown> = { v: 1, order: [] };
    circular.self = circular;
    const values: unknown[] = [undefined, 0, 1, -1, NaN, 1n, Symbol("s"), () => 1, new Date(), /x/, hostile, circular, { v: 1n }, { v: 1, order: [1n, Symbol("x"), null, undefined, {}, []] }, { v: 1, order: ["a"], kept: 1n, forms: 5 }, { v: 1, order: ["a"], forms: { a: 1n } }, { v: 1, order: ["a"], forms: { a: -1 } }];
    for (const v of values) {
      const r = readStack(v);
      expect(typeof r.ok).toBe("boolean");
    }
  });

  it("drops what it can't use and lists it", () => {
    const r = readStack({ v: 1, order: ["a", "b", "a", 3, "x"], kept: ["a", "a", "x", 7], forms: { a: 1, b: -1, c: 2, x: 1.5, y: "3" }, zzz: 1 }, ["a", "b"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual({ order: ["a", "b"], kept: ["a"], forms: { a: 1 } });
    expect(r.dropped).toEqual(expect.arrayContaining(["zzz", "a", "a number where an id goes", "x", "kept:x", "a number in kept", "forms:b", "forms:c", "forms:x", "forms:y"]));
    expect(new Set(r.dropped).size).toBe(r.dropped.length);
  });

  it("an item the consumer has and the stored order lacks is no error", () => {
    const r = readStack(storeStack(createStack(["a"])), ["a", "b"]);
    expect(r).toEqual({ ok: true, state: { order: ["a"], kept: [], forms: {} }, dropped: [] });
  });

  it("a field only a newer writer knows is skipped and reported, the rest is read", () => {
    const r = readStack({ ...storeStack(state), tabs: true });
    expect(r.ok && r.dropped).toEqual(["tabs"]);
    expect(r.ok && r.state).toEqual(state);
  });
});
