/** `markUsed(state, id)` is idempotent: the newest item gives back the state itself; any other, or a tie, bumps. */
import { describe, expect, it } from "vitest";
import { markUsed, type DockState } from "../src";
import { bar, byId, group } from "./fixture";

const state = (ages: Record<string, number>): DockState => ({
  stage: { x: 0, y: 0, width: 800, height: 400 },
  edges: [bar("top", "top", 0, Object.keys(ages))],
  items: byId(Object.entries(ages).map(([id, used]) => group(id, used))),
  floats: [],
  floatKinds: ["group"],
});

describe("use", () => {
  it("on the item already strictly newest, gives back the same state", () => {
    const s = state({ a: 1, b: 2, c: 5 });
    expect(markUsed(s, "c")).toBe(s);
  });

  it("on another item, makes it the newest", () => {
    const s = state({ a: 1, b: 2, c: 5 });
    const u = markUsed(s, "a");
    expect(u).not.toBe(s);
    expect(u.items.a!.used).toBe(6);
    expect(markUsed(u, "a")).toBe(u);
  });

  it("a tie with another item is not newest: it bumps", () => {
    const s = state({ a: 3, b: 3 });
    const u = markUsed(s, "a");
    expect(u.items.a!.used).toBe(4);
    expect(u.items.b!.used).toBe(3);
  });

  it("an unknown id, or an item with no usable age, as before", () => {
    const s = state({ a: 1 });
    expect(markUsed(s, "nope")).toBe(s);
    const odd: DockState = { ...s, items: { a: { ...s.items.a!, used: Number.NaN } } };
    expect(markUsed(odd, "a").items.a!.used).toBe(1);
  });
});
