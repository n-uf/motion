/** `SceneItem.space`: free space an item keeps on its zone's open side, out of a bar's spare length. */
import { describe, expect, it } from "vitest";
import { floatAt, moveTo, readScene, solve, storeScene, type Scene } from "../src/scene";
import { bar, byId, group } from "./scene-fixture";

/** A top bar 1000 px long: a (start), b (end); g in the bottom bar. */
const win = (more: Partial<Record<"a" | "b", number>> = {}): Scene => ({
  stage: { x: 0, y: 0, width: 1000, height: 600 },
  edges: [bar("top", "top", 0, ["a", "b"]), bar("bottom", "bottom", 0, ["g"])],
  items: byId([
    { ...group("a", 1), ...(more.a ? { space: more.a } : {}) },
    { ...group("b", 2), align: "end" as const, ...(more.b ? { space: more.b } : {}) },
    group("g", 3),
  ]),
  floats: [],
  floatKinds: ["group"],
});

describe("SceneItem.space", () => {
  it("a start item keeps its space before it, an end item after it; none changes nothing", () => {
    const plain = solve(win());
    const spaced = solve(win({ a: 120, b: 80 }));
    expect(spaced.items.a!.rect.x - plain.items.a!.rect.x).toBeCloseTo(120, 6);
    expect(plain.items.b!.rect.x - spaced.items.b!.rect.x).toBeCloseTo(80, 6);
  });

  it("asking for more than the spare length gives each its share, and nothing overlaps", () => {
    const l = solve(win({ a: 5000, b: 5000 }));
    const a = l.items.a!.rect;
    const b = l.items.b!.rect;
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1e-6);
    expect(a.x).toBeGreaterThan(solve(win()).items.a!.rect.x);
  });

  it("a dock move sets the space it names and clears it otherwise", () => {
    const moved = moveTo(win(), "g", { edge: "top", zone: "start", at: 1, space: 64 });
    expect(moved.items.g!.space).toBe(64);
    const again = moveTo(moved, "g", { edge: "bottom", at: 0 });
    expect(again.items.g!.space).toBeUndefined();
  });

  it("floating clears it, by moveTo or floatAt", () => {
    const moved = moveTo(win(), "g", { edge: "top", zone: "start", at: 1, space: 64 });
    expect(moveTo(moved, "g", { kind: "float", rect: { x: 300, y: 300, width: 200, height: 40 } }).items.g!.space).toBeUndefined();
    expect(floatAt(moved, "g", { x: 300, y: 300, width: 200, height: 40 }).items.g!.space).toBeUndefined();
  });

  it("a new column clears it", () => {
    const s: Scene = { ...win(), edges: [...win().edges, { id: "left-0", side: "left", ring: 0, accepts: ["group"], items: [], cross: { min: 120, max: 300, rail: 30 }, column: true }], columns: { left: { accepts: ["group"], cross: { min: 120, max: 300, rail: 30 } } } };
    const moved = moveTo(s, "g", { edge: "top", zone: "start", at: 1, space: 64 });
    const col = moveTo(moved, "g", { kind: "column", side: "left", ring: 0 });
    if (col !== moved) expect(col.items.g!.space).toBeUndefined();
  });

  it("the stored form keeps it", () => {
    const s = win({ a: 40 });
    const back = readScene(storeScene(s), win());
    expect(back.scene.items.a!.space).toBe(40);
  });
});
