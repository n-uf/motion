/**
 * `SceneEdgeLayout.items`: an edge's items in its stack order (zones in order, then the order within each zone), exactly
 * the ids the layout draws for the edge. A host reads the order from it, never by sorting rects.
 */
import { describe, expect, it } from "vitest";
import { ZONES, close, moveTo, solve, type Scene, type SceneLayout } from "../src/scene";
import { CASES } from "../src/scene/cases";
import { bar, byId, column, group, panel, windowScene } from "./scene-fixture";
import { modelScene } from "./model-scene";

const ZONE_RANK = Object.fromEntries(ZONES.map((z, i) => [z, i]));

/** The order the scene's own data gives: the edge's items by zone, ties in the edge's order, those the layout draws. */
function expected(s: Scene, l: SceneLayout, edgeId: string): string[] {
  const edge = s.edges.find((e) => e.id === edgeId)!;
  const drawn = new Set(Object.entries(l.items).filter(([, it]) => it.edge === edgeId).map(([id]) => id));
  return edge.items
    .map((id, i) => ({ id, i, z: ZONE_RANK[s.items[id]?.align ?? "start"]! }))
    .filter((x) => drawn.has(x.id))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((x) => x.id);
}

function check(s: Scene, l: SceneLayout, what: string): number {
  let n = 0;
  for (const [id, e] of Object.entries(l.edges)) {
    expect(e.items, `${what} edge ${id}`).toEqual(expected(s, l, id));
    // Exactly what the layout draws for it: nothing missing, nothing twice.
    expect(new Set(e.items).size).toBe(e.items.length);
    expect(e.items.length, `${what} edge ${id}`).toBe(Object.values(l.items).filter((it) => it.edge === id).length);
    // Every item in the menu is listed, in its place.
    for (const m of e.menu?.items ?? []) expect(e.items).toContain(m);
    // Every rail tab is listed too.
    for (const t of e.tabs) expect(e.items).toContain(t);
    n += e.items.length;
  }
  return n;
}

describe("SceneEdgeLayout.items", () => {
  it("lists the items of every edge in zone order, over generated windows (every mode) and the cases' windows", () => {
    let listed = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const s = modelScene(seed, seed % 3 === 0, seed % 4 === 0, seed % 5 === 0);
      listed += check(s, solve(s), `model ${seed}`);
    }
    for (const row of CASES) listed += check(row.scene, solve(row.scene), `case ${row.id}`);
    expect(listed).toBeGreaterThan(1000);
  });

  it("the center zone and the end zone come after the start zone, whatever the order the edge was declared in", () => {
    const s: Scene = {
      stage: { x: 0, y: 0, width: 1200, height: 400 },
      edges: [bar("top", "top", 0, ["e1", "c1", "s1", "e2", "s2", "c2"])],
      items: byId([group("s1", 1), group("s2", 2), group("c1", 3, { align: "center" }), group("c2", 4, { align: "center" }), group("e1", 5, { align: "end" }), group("e2", 6, { align: "end" })]),
      floats: [],
      floatKinds: ["group"],
    };
    const l = solve(s);
    expect(l.edges.top!.items).toEqual(["s1", "s2", "c1", "c2", "e1", "e2"]);
    // The rects say the same.
    const xs = l.edges.top!.items.map((id) => l.items[id]!.rect.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("keeps an item in the » menu at its place, and leaves a closed one out", () => {
    const narrow: Scene = { ...windowScene(300, 500) };
    const l = solve(narrow);
    const toolbar = l.edges.toolbar!;
    expect(toolbar.menu?.items.length ?? 0).toBeGreaterThan(0);
    expect(toolbar.items).toEqual(["views", "tools", "zoom"].filter((id) => l.items[id]));
    const closed = solve(close(windowScene(), "tools"));
    expect(closed.edges.toolbar!.items).toEqual(["views", "zoom"]);
  });

  it("lists the members of a column folded into its rail, and of one riding, in zone order", () => {
    const tpl = { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } };
    const col = (id: string, ring: number, items: string[]) => ({ ...column(id, "left", ring, items), column: true, accepts: ["panel"], cross: tpl.cross });
    const base: Scene = {
      stage: { x: 0, y: 0, width: 900, height: 600 },
      edges: [col("left-0", 0, ["a", "b"]), col("left-1", 1, ["c"])],
      items: byId([panel("a", 1, { from: 1 }), panel("b", 2, { from: 1 }), panel("c", 3)]),
      floats: [],
      floatKinds: ["panel"],
      columns: { left: tpl, right: tpl },
      rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
      contentMin: { width: 340, height: 200 },
    };
    const railed = solve(base);
    expect(railed.edges["left-0"]).toMatchObject({ folded: "hand", items: ["a", "b"] });
    const ride = solve({ ...base, handFold: "ride" });
    expect(ride.edges["left-0"]).toMatchObject({ rides: "left-1", items: ["a", "b"] });
    expect(check(base, railed, "railed") + check({ ...base, handFold: "ride" }, ride, "ride")).toBeGreaterThan(0);
  });

  it("follows a move: the item takes its new place in the order of the edge it lands in", () => {
    const s = windowScene();
    const moved = moveTo(s, "zoom", { kind: "gap", edge: "toolbar", zone: "start", at: 0 });
    const l = solve(moved);
    expect(l.edges.toolbar!.items[0]).toBe("zoom");
    expect(check(moved, l, "moved")).toBeGreaterThan(0);
  });
});
