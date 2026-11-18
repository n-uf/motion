/**
 * `Edge.hidden`: an edge that is part of the scene's stored state but not of the window. It takes no room, has no
 * targets, refusals or stops, its items have none and draw nothing, `moveTo` into it is refused, and the store keeps
 * it and its items. Everything else is exactly as if the edge and its items were not in the scene.
 */
import { describe, expect, it } from "vitest";
import { dockHome, moveTo, readScene, refusals, solve, stops, storeScene, targets, type Edge, type Scene } from "../src/scene";
import { FLUSH, INSET, kitScene } from "./kit-scene";
import { modelScene } from "./model-scene";
import { bar, byId, column, group, panel } from "./scene-fixture";

const J = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "function" ? undefined : x));

/** `s` with edge `id` hidden (and changed by `edit`), and the same scene with that edge and its items removed. */
function pair(s: Scene, id: string, edit: (e: Edge) => Edge = (e) => e): { hidden: Scene; removed: Scene; items: readonly string[] } {
  const e = s.edges.find((x) => x.id === id)!;
  const items = e.items;
  const hidden: Scene = { ...s, edges: s.edges.map((x) => (x.id === id ? { ...edit(x), hidden: true } : x)) };
  const removed: Scene = { ...s, edges: s.edges.filter((x) => x.id !== id), items: Object.fromEntries(Object.entries(s.items).filter(([k]) => !items.includes(k))) };
  return { hidden, removed, items };
}

/**
 * What a drag of `id` shows: every target (with the layout a release makes) and refusal, and the stops. With `rings`
 * false, the release layouts' edge rings are left out: a column a drop makes beside a hidden edge on the same side takes
 * a ring past the hidden one's, so its number differs from the scene without it, though nothing lies elsewhere. With
 * `layouts` false they are left out altogether: beside a hidden dynamic column, a new column also takes another id.
 */
const look = (s: Scene, id: string, rings = true, layouts = true): string =>
  J([
    targets(s, id).map((t) => {
      const l = t.after({ x: 300, y: 200 }, { x: 10, y: 10 }).layout;
      const layout = !layouts ? null : rings ? l : { ...l, edges: Object.fromEntries(Object.entries(l.edges).map(([k, e]) => [k, { ...e, ring: 0 }])) };
      return [t.id, t.priority, t.hit, t.hits, t.slot, t.marker, t.place, layout];
    }),
    refusals(s, id),
    stops(s, id).map((t) => t.id),
  ]);

const scenes = (): Scene[] => [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((seed) => [modelScene(seed), modelScene(seed, true), modelScene(seed, false, false, true)]),
  kitScene(INSET, { W: 1200 }),
  kitScene(FLUSH, { W: 1440, anchor: true }),
];

describe("Edge.hidden", () => {
  it("an undrawn overlay bar with stored items, hidden: no target or refusal on it, and everything else as with the bar removed", () => {
    let bars = 0;
    for (const s of scenes()) {
      for (const e of s.edges.filter((x) => (x.side === "top" || x.side === "bottom") && x.items.length > 0 && !x.items.some((id) => s.items[id]!.fixed))) {
        const { hidden, removed, items } = pair(s, e.id, (x) => ({ ...x, mode: "overlay", zoneAccepts: {} }));
        expect(J(solve(hidden)), e.id).toBe(J(solve(removed)));
        const l = solve(hidden);
        expect(l.edges[e.id]).toBeUndefined();
        for (const id of items) expect(l.items[id]).toBeUndefined();
        for (const id of Object.keys(removed.items).filter((k) => !removed.items[k]!.fixed && !removed.items[k]!.closed)) {
          expect(targets(hidden, id).some((t) => t.id.includes(`:${e.id}:`))).toBe(false);
          expect(refusals(hidden, id).some((r) => r.edge === e.id)).toBe(false);
          expect(look(hidden, id), `${e.id} drag ${id}`).toBe(look(removed, id));
        }
        bars++;
      }
    }
    expect(bars).toBeGreaterThan(20);
  });

  it("side columns and compact rails, hidden, take no room either: the window lays out as without them", () => {
    let edges = 0;
    for (const s of scenes()) {
      for (const e of s.edges.filter((x) => (x.side === "left" || x.side === "right") && !x.items.some((id) => s.items[id]!.fixed))) {
        const { hidden, removed } = pair(s, e.id);
        expect(J(solve(hidden)), e.id).toBe(J(solve(removed)));
        const id = Object.keys(removed.items).find((k) => !removed.items[k]!.fixed && !removed.items[k]!.closed);
        if (id) expect(look(hidden, id, false, e.column !== true), `${e.id} drag ${id}`).toBe(look(removed, id, false, e.column !== true));
        edges++;
      }
    }
    expect(edges).toBeGreaterThan(20);
  });

  const small = (): Scene => ({
    stage: { x: 0, y: 0, width: 900, height: 500 },
    edges: [column("left", "left", 0, ["p"]), bar("top", "top", 0, ["a"]), { ...bar("hid", "bottom", 0, ["b"]), hidden: true }],
    items: byId([panel("p", 1), group("a", 2), group("b", 3), group("c", 4)]),
    floats: [],
    floatKinds: ["group"],
  });

  it("a hidden edge's item has no targets, refusals or stops; a drop's result keeps the hidden edge and its items", () => {
    const s = small();
    expect([targets(s, "b"), refusals(s, "b"), stops(s, "b")]).toEqual([[], [], []]);
    for (const t of targets(s, "c")) {
      const a = t.after({ x: 300, y: 200 });
      expect(a.scene.edges.find((e) => e.id === "hid")).toEqual(s.edges.find((e) => e.id === "hid"));
      expect(J(solve(a.scene))).toBe(J(a.layout));
    }
    expect(targets(s, "c").length).toBeGreaterThan(0);
  });

  it("moveTo into a hidden edge is refused, as into one that doesn't take the kind; so is docking home into it", () => {
    const s = small();
    expect(moveTo(s, "c", { edge: "hid", zone: "start", at: 0 })).toBe(s);
    const start = small();
    const away = moveTo(start, "b", { edge: "top", zone: "start", at: 0 });
    const hiddenHome = { ...away, edges: away.edges.map((e) => (e.id === "hid" ? { ...e, hidden: true } : e)) };
    expect(dockHome(hiddenHome, "b", start)).toBe(hiddenHome);
  });

  it("a drop that makes a column beside a hidden dynamic column gives it a fresh id and ring; the store keeps both", () => {
    const tpl = { accepts: ["panel"], cross: { min: 160, max: 400 } };
    const s: Scene = {
      stage: { x: 0, y: 0, width: 1200, height: 600 },
      edges: [{ ...column("left-0", "left", 0, ["q"]), column: true, hidden: true }, column("left-1", "left", 1, ["p"], { column: true }), bar("top", "top", 0, [])],
      items: byId([panel("p", 1), panel("q", 2), panel("r", 3)]),
      floats: [{ id: "r", rect: { x: 600, y: 200, width: 260, height: 200 } }],
      floatKinds: ["panel"],
      columns: { left: tpl, right: tpl },
    };
    const lines = targets(s, "r").filter((t) => t.place.kind === "column" && t.place.side === "left");
    expect(lines.length).toBeGreaterThan(0);
    for (const t of lines) {
      const a = t.after({ x: 10, y: 300 });
      const left = a.scene.edges.filter((e) => e.side === "left");
      const ids = left.map((e) => e.id);
      expect(new Set(ids).size, ids.join()).toBe(ids.length);
      expect(new Set(left.map((e) => e.ring)).size, J(left.map((e) => [e.id, e.ring]))).toBe(left.length);
      const made = left.find((e) => e.items.includes("r"))!;
      expect(["left-0", "left-1"]).not.toContain(made.id);
      expect(a.scene.edges.find((e) => e.id === "left-0")).toMatchObject({ hidden: true, items: ["q"] });
      // The preview is the result.
      expect(J(solve(a.scene))).toBe(J(a.layout));
      // Stored and read back over the starting scene: both columns, the hidden one still hidden.
      const read = readScene(JSON.parse(JSON.stringify(storeScene(a.scene))), s);
      expect(read.dropped).toEqual([]);
      const shape = (sc: Scene) => J(sc.edges.map((e) => [e.id, e.side, e.ring, e.items, e.hidden === true]).sort());
      expect(shape(read.scene)).toBe(shape(a.scene));
    }
    // The same move made on the stored scene directly sees the hidden column too.
    const direct = moveTo(s, "r", { kind: "column", side: "left", ring: 0 });
    const left = direct.edges.filter((e) => e.side === "left");
    expect(left.map((e) => e.id).sort()).toEqual(["left-0", "left-1", "left-2"]);
    expect(new Set(left.map((e) => e.ring)).size).toBe(3);
  });

  it("storeScene / readScene keep hidden and its items; an entry without it keeps base's; another value is dropped", () => {
    const s = small();
    const stored = storeScene(s);
    expect(stored.edges.find((e) => e.id === "hid")).toEqual({ id: "hid", side: "bottom", ring: 0, items: ["b"], hidden: true });
    expect(stored.edges.find((e) => e.id === "top")!.hidden).toBeUndefined();
    const base: Scene = { ...s, edges: s.edges.map((e) => ({ ...e, items: [], hidden: false })) };
    const read = readScene(JSON.parse(JSON.stringify(stored)), base);
    expect(read.dropped).toEqual([]);
    expect(read.scene.edges.find((e) => e.id === "hid")).toMatchObject({ hidden: true, items: ["b"] });
    // A store from before: no hidden on the entry, base's kept.
    const old = { ...stored, edges: stored.edges.map(({ hidden: _h, ...e }) => e) };
    expect(readScene(old, small()).scene.edges.find((e) => e.id === "hid")!.hidden).toBe(true);
    const bad = { ...stored, edges: stored.edges.map((e) => (e.id === "hid" ? { ...e, hidden: "yes" } : e)) };
    expect(readScene(bad, base).dropped).toContain("edge:hid:hidden");
  });
});
