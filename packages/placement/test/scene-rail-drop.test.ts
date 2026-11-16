/**
 * Rail docking for a kind with a rail drop policy (`Scene.railDrop`): one drop strip per side whose rail takes the
 * kind, spring-loaded, owning its rect; the side's rail is `Scene.rails` where declared, else its rail column.
 */
import { describe, expect, it } from "vitest";
import { solve, stops, targets, type Scene, type SceneTarget } from "../src/scene";
import { bar, byId, column, group, panel } from "./scene-fixture";

const W = 1000;
const H = 600;

/** A document window: icon rails at both window edges (groups), panel columns inside them, a bottom bar. */
function docScene(right: string[] = ["c"], left: string[] = ["a", "b"], more: Partial<Scene> = {}): Scene {
  const cols = { zoneAccepts: { start: ["panel"], end: ["group"] } };
  return {
    stage: { x: 0, y: 0, width: W, height: H },
    edges: [
      bar("bottom", "bottom", 0, ["g1"]),
      { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: [], cross: { min: 30, max: 30, rail: 30 }, compact: true },
      { id: "rail-right", side: "right", ring: 0, accepts: ["group"], items: [], cross: { min: 30, max: 30, rail: 30 }, compact: true },
      column("left", "left", 1, left, cols),
      column("right", "right", 1, right, cols),
    ],
    items: byId([panel("a", 1), panel("b", 2), panel("c", 3), group("g1", 4), group("g2", 5)]),
    floats: [{ id: "g2", rect: { x: 400, y: 200, width: 200, height: 28 } }],
    floatKinds: ["panel", "group"],
    ...more,
  };
}
const withPolicy = (s: Scene, policy: NonNullable<Scene["railDrop"]>[string] = {}): Scene => ({ ...s, railDrop: { panel: policy } });
const rails = (ts: readonly SceneTarget[]): SceneTarget[] => ts.filter((t) => t.place.kind === "rail");
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;

describe("rail docking under a kind's rail drop policy", () => {
  it("with no policy, a window without declared rails has no rail target (as before)", () => {
    expect(rails(targets(docScene(), "c"))).toEqual([]);
  });

  it("an item alone in its column gets its side's rail: a strip at the window's side, spring-loaded, the slot its folded tile", () => {
    const s = withPolicy(docScene());
    const ts = targets(s, "c");
    const r = rails(ts);
    expect(r.map((t) => t.id)).toEqual(["rail:right:1"]);
    const t = r[0]!;
    expect(t.arm).toBe("dwell");
    expect(t.priority).toBe(1);
    expect(t.strip).toMatchObject({ x: W - 30, width: 30 });
    expect(t.hit).toEqual(t.strip);
    // The magnet: 6 px inward.
    expect(t.armedHit).toMatchObject({ x: W - 36, width: 36 });
    const after = t.after({ x: W - 10, y: 200 });
    const me = after.layout.items.c!;
    expect(me.tab).toBe(true);
    expect(me.edge).toBe("right");
    expect(after.layout.edges.right!.rect.width).toBe(30);
    // Preview = landing.
    expect(t.slot).toEqual(me.rect);
    expect(solve(after.scene).items.c!.rect).toEqual(me.rect);
    // The strip owns its rect: no other target (but the float) nor refusal lies on it, home included.
    for (const o of ts) if (o !== t && !o.free) for (const h of o.hits ?? [o.hit]) expect(overlap(h, t.strip!), o.id).toBe(false);
  });

  it("a side whose column keeps an open panel has no rail: no strip, no dead target", () => {
    const s = withPolicy(docScene());
    // b: the left column keeps a open; the right column keeps c open.
    expect(rails(targets(s, "b"))).toEqual([]);
    // c dragged: the left column keeps a and b open, so no left rail.
    expect(rails(targets(s, "c")).every((t) => t.place.kind === "rail" && t.place.side === "right")).toBe(true);
  });

  it("a rail that shows already takes a second panel; an item already in the rail has no target into it", () => {
    // b folded alone in the right column: it shows as a rail.
    const s = withPolicy(docScene(["b"], ["a", "c"], {}));
    const folded: Scene = { ...s, items: { ...s.items, b: { ...s.items.b!, from: 1 } } };
    expect(solve(folded).items.b!.tab).toBe(true);
    expect(rails(targets(folded, "b")).filter((t) => t.place.kind === "rail" && t.place.side === "right")).toEqual([]);
    const t = rails(targets(folded, "c")).find((x) => x.place.kind === "rail" && x.place.side === "right")!;
    expect(t).toBeDefined();
    const after = t.after({ x: W - 10, y: 300 });
    expect(after.layout.items.c!.tab && after.layout.items.b!.tab).toBe(true);
  });

  it("railStripWidth sets the strip (at least 24); 0 and railVisibility \"never\" turn it off cleanly", () => {
    expect(rails(targets(withPolicy(docScene(), { railStripWidth: 48 }), "c"))[0]!.strip).toMatchObject({ x: W - 48, width: 48 });
    expect(rails(targets(withPolicy(docScene(), { railStripWidth: 10 }), "c"))[0]!.strip).toMatchObject({ width: 24 });
    const none = targets(docScene(), "c");
    for (const off of [{ railStripWidth: 0 }, { railVisibility: "never" as const }]) {
      const ts = targets(withPolicy(docScene(), off), "c");
      expect(rails(ts)).toEqual([]);
      expect(JSON.stringify(ts.map((t) => [t.id, t.hit]))).toBe(JSON.stringify(none.map((t) => [t.id, t.hit])));
    }
  });

  it("another kind's targets never change with the panels' policy", () => {
    const key = (s: Scene): string => JSON.stringify(targets(s, "g1").map((t) => [t.id, t.hit, t.hits ?? null, t.slot ?? null]));
    expect(key(withPolicy(docScene(), { railStripWidth: 60, magnet: 20, floatNearEdge: false }))).toBe(key(docScene()));
  });

  it("floatNearEdge: false keeps a float's landing clear of the strip", () => {
    const s = withPolicy(docScene(), { floatNearEdge: false });
    const f = targets(s, "c").find((t) => t.free)!;
    const at = f.after({ x: W - 20, y: 300 }).layout.items.c!.rect;
    expect(at.x + at.width).toBeLessThanOrEqual(W - 30 + 1e-6);
    const near = targets(withPolicy(docScene()), "c").find((t) => t.free)!;
    const free = near.after({ x: W - 20, y: 300 }).layout.items.c!.rect;
    expect(free.x + free.width).toBeGreaterThan(W - 30);
  });

  it("the keyboard path: \"Move to › Rail\" is a stop, and its move folds the panel into the rail", () => {
    const s = withPolicy(docScene());
    const stop = stops(s, "c").find((t) => t.place.kind === "rail");
    expect(stop?.id).toBe("rail:right:1");
    expect(stop!.after({ x: 0, y: 0 }).layout.items.c!.tab).toBe(true);
  });

  it("a scene with declared rails: the strip lies where the rail lands, split at its stops", () => {
    const s: Scene = {
      ...docScene(),
      edges: docScene().edges.filter((e) => !e.compact).map((e) => (e.side === "left" || e.side === "right" ? { ...e, column: true } : e)),
      rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
      columns: { left: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } }, right: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } } },
    };
    const before = rails(targets(s, "b"));
    expect(before.every((t) => !t.arm)).toBe(true);
    const r = rails(targets(withPolicy(s), "b"));
    expect(r.length).toBeGreaterThan(0);
    for (const t of r) {
      expect(t.arm).toBe("dwell");
      expect(t.strip!.width).toBe(30);
      expect(t.slot).toEqual(t.after({ x: 0, y: 0 }).layout.items.b!.rect);
    }
  });
});
