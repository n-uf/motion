/** `use(scene, id)` is idempotent: the newest item gives back the scene itself; any other, or a tie, bumps. */
import { describe, expect, it } from "vitest";
import { use, type Scene } from "../src/scene";
import { bar, byId, group } from "./scene-fixture";

const scene = (ages: Record<string, number>): Scene => ({
  stage: { x: 0, y: 0, width: 800, height: 400 },
  edges: [bar("top", "top", 0, Object.keys(ages))],
  items: byId(Object.entries(ages).map(([id, used]) => group(id, used))),
  floats: [],
  floatKinds: ["group"],
});

describe("use", () => {
  it("on the item already strictly newest, gives back the same scene", () => {
    const s = scene({ a: 1, b: 2, c: 5 });
    expect(use(s, "c")).toBe(s);
  });

  it("on another item, makes it the newest", () => {
    const s = scene({ a: 1, b: 2, c: 5 });
    const u = use(s, "a");
    expect(u).not.toBe(s);
    expect(u.items.a!.used).toBe(6);
    expect(use(u, "a")).toBe(u);
  });

  it("a tie with another item is not newest: it bumps", () => {
    const s = scene({ a: 3, b: 3 });
    const u = use(s, "a");
    expect(u.items.a!.used).toBe(4);
    expect(u.items.b!.used).toBe(3);
  });

  it("an unknown id, or an item with no usable age, as before", () => {
    const s = scene({ a: 1 });
    expect(use(s, "nope")).toBe(s);
    const odd: Scene = { ...s, items: { a: { ...s.items.a!, used: Number.NaN } } };
    expect(use(odd, "a").items.a!.used).toBe(1);
  });
});
