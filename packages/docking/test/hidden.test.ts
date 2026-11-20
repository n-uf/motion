/**
 * `DockEdge.hidden`: an edge kept in the state with its items but not in the window (view state, the host's each time it
 * builds the state). It takes no room, has no targets, refusals or stops, its items have none and draw nothing,
 * `moveTo` into it is refused, and the store keeps its items but never `hidden`. Everything else is as if the edge and
 * its items were not in the state.
 */
import { describe, expect, it } from "vitest";
import { dockHome, moveTo, readDockState, refusals, solve, stops, storeDockState, targets, type DockEdge, type DockState, type DockLayout } from "../src";
import { FLUSH, INSET, kitState } from "./kit-window";
import { modelState } from "./model-window";
import { bar, byId, column, group, panel } from "./fixture";

const J = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "function" ? undefined : x));

/** `s` with edge `id` hidden (and changed by `edit`), and the same state with that edge and its items removed. */
function pair(s: DockState, id: string, edit: (e: DockEdge) => DockEdge = (e) => e): { hidden: DockState; removed: DockState; items: readonly string[] } {
  const e = s.edges.find((x) => x.id === id)!;
  const items = e.items;
  const hidden: DockState = { ...s, edges: s.edges.map((x) => (x.id === id ? { ...edit(x), hidden: true } : x)) };
  const removed: DockState = { ...s, edges: s.edges.filter((x) => x.id !== id), items: Object.fromEntries(Object.entries(s.items).filter(([k]) => !items.includes(k))) };
  return { hidden, removed, items };
}

/**
 * A release layout in terms that don't depend on a hidden edge beside it: each edge's ring as its rank among the edges
 * of its side the layout draws, and the ids of edges the drop made (not in `before`) as "new". Beside a hidden edge, a
 * column a drop makes or removes numbers its side around the hidden edge, and a new column's id skips the hidden one's.
 */
function relative(l: DockLayout, before: ReadonlySet<string>): string {
  const rank = new Map<string, number>();
  for (const side of ["left", "right", "top", "bottom"]) {
    Object.entries(l.edges)
      .filter(([, e]) => e.side === side)
      .sort(([, a], [, b]) => a.ring - b.ring)
      .forEach(([id], i) => rank.set(id, i));
  }
  let out = J({ ...l, edges: Object.fromEntries(Object.entries(l.edges).map(([id, e]) => [id, { ...e, ring: rank.get(id) }])) });
  for (const id of Object.keys(l.edges)) if (!before.has(id)) out = out.split(`"${id}"`).join('"new"');
  return out;
}

/**
 * What a drag of `id` shows: every target (with the layout a release makes) and refusal, and the stops. With
 * `relativeLayouts`, the release layouts of the targets that make a column are compared by `relative`.
 */
const look = (s: DockState, id: string, relativeLayouts = false): string => {
  const before = new Set(s.edges.map((e) => e.id));
  return J([
    targets(s, id).map((t) => {
      const l = t.after({ x: 300, y: 200 }, { x: 10, y: 10 }).layout;
      const layout = relativeLayouts && (t.place.kind === "column" || t.place.kind === "rail") ? relative(l, before) : J(l);
      return [t.id, t.priority, t.hit, t.hits, t.slot, t.marker, t.place, layout];
    }),
    refusals(s, id),
    stops(s, id).map((t) => t.id),
  ]);
};

const states = (): DockState[] => [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((seed) => [modelState(seed), modelState(seed, true), modelState(seed, false, false, true)]),
  kitState(INSET, { W: 1200 }),
  kitState(FLUSH, { W: 1440, anchor: true }),
];

describe("DockEdge.hidden", () => {
  it("an undrawn overlay bar with stored items, hidden: no target or refusal on it, and everything else as with the bar removed", () => {
    let bars = 0;
    for (const s of states()) {
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

  it("side columns and compact rails, hidden, take no room either: the window lays out and targets as without them", () => {
    let edges = 0;
    for (const s of states()) {
      for (const e of s.edges.filter((x) => (x.side === "left" || x.side === "right") && !x.items.some((id) => s.items[id]!.fixed))) {
        const { hidden, removed } = pair(s, e.id);
        expect(J(solve(hidden)), e.id).toBe(J(solve(removed)));
        const id = Object.keys(removed.items).find((k) => !removed.items[k]!.fixed && !removed.items[k]!.closed);
        // Every target's release layout as without the edge; those that make a column, by their relative rings and ids.
        if (id) expect(look(hidden, id, true), `${e.id} drag ${id}`).toBe(look(removed, id, true));
        edges++;
      }
    }
    expect(edges).toBeGreaterThan(20);
  });

  const small = (): DockState => ({
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
      expect(a.state.edges.find((e) => e.id === "hid")).toEqual(s.edges.find((e) => e.id === "hid"));
      expect(J(solve(a.state))).toBe(J(a.layout));
    }
    expect(targets(s, "c").length).toBeGreaterThan(0);
  });

  it("a target that commits nothing (home, a blocked rect) gives back the state itself, with a hidden edge in it", () => {
    const s: DockState = { ...small(), blocked: [{ x: 400, y: 300, width: 40, height: 40 }] };
    const ts = targets(s, "a");
    const home = ts.filter((t) => t.place.kind === "home");
    const none = ts.filter((t) => t.place.kind === "none");
    expect(home.length).toBeGreaterThan(0);
    expect(none.length).toBe(1);
    for (const t of [...home, ...none]) {
      const a = t.after({ x: 0, y: 0 });
      expect(a.state).toBe(s);
      expect(J(a.layout)).toBe(J(solve(s)));
    }
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
    const s: DockState = {
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
      const left = a.state.edges.filter((e) => e.side === "left");
      const ids = left.map((e) => e.id);
      expect(new Set(ids).size, ids.join()).toBe(ids.length);
      expect(new Set(left.map((e) => e.ring)).size, J(left.map((e) => [e.id, e.ring]))).toBe(left.length);
      const made = left.find((e) => e.items.includes("r"))!;
      expect(["left-0", "left-1"]).not.toContain(made.id);
      expect(a.state.edges.find((e) => e.id === "left-0")).toMatchObject({ hidden: true, items: ["q"] });
      // The preview is the result.
      expect(J(solve(a.state))).toBe(J(a.layout));
      // Stored and read back over the starting state (the host's, which hides left-0): both columns and their items.
      const read = readDockState(JSON.parse(JSON.stringify(storeDockState(a.state))), s);
      expect(read.dropped).toEqual([]);
      const shape = (sc: DockState) => J(sc.edges.map((e) => [e.id, e.side, e.ring, e.items, e.hidden === true]).sort());
      expect(shape(read.state)).toBe(shape(a.state));
    }
    // The same move made on the stored state directly sees the hidden column too.
    const direct = moveTo(s, "r", { kind: "column", side: "left", ring: 0 });
    const left = direct.edges.filter((e) => e.side === "left");
    expect(left.map((e) => e.id).sort()).toEqual(["left-0", "left-1", "left-2"]);
    expect(new Set(left.map((e) => e.ring)).size).toBe(3);
  });

  describe("a hidden edge listed after the shown ones, at a lower ring, keeps its place in the ring order", () => {
    const tpl = { accepts: ["panel"], cross: { min: 160, max: 400 } };
    const state = (): DockState => ({
      stage: { x: 0, y: 0, width: 1400, height: 600 },
      edges: [
        column("left-1", "left", 1, ["p"], { column: true }),
        column("left-2", "left", 2, ["x"], { column: true }),
        { id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["g"], cross: { min: 30, max: 30, rail: 30 }, compact: true, hidden: true },
      ],
      items: byId([panel("p", 1), panel("x", 2), panel("r", 3), group("g", 4)]),
      floats: [{ id: "r", rect: { x: 700, y: 200, width: 260, height: 200 } }],
      floatKinds: ["panel"],
      columns: { left: tpl, right: tpl },
    });
    const ringsOf = (s: DockState): Record<string, number> => Object.fromEntries(s.edges.filter((e) => e.side === "left").map((e) => [e.id, e.ring]));

    it("a column removed (p dragged out, left-1 goes): the rail stays outermost, left-2 after it", () => {
      const s = state();
      const a = targets(s, "p").find((t) => t.place.kind === "float")!.after({ x: 700, y: 300 });
      expect(ringsOf(a.state)).toEqual({ "left-2": 1, rail: 0 });
      expect(J(solve(a.state))).toBe(J(a.layout));
    });

    it("a column made (a drop on the line between left-1 and left-2): the rail stays outermost", () => {
      const s = state();
      const t = targets(s, "r").find((x) => x.id === "column:left:1")!;
      expect(t).toBeDefined();
      const a = t.after({ x: 0, y: 300 });
      const rings = ringsOf(a.state);
      const made = a.state.edges.find((e) => e.items.includes("r"))!.id;
      expect(rings.rail).toBe(0);
      expect(rings["left-1"]).toBeLessThan(rings[made]!);
      expect(rings[made]).toBeLessThan(rings["left-2"]!);
      expect(new Set(Object.values(rings)).size).toBe(3 + 1);
      expect(J(solve(a.state))).toBe(J(a.layout));
    });

    it("a drop that makes or removes no column changes no ring", () => {
      const s = state();
      for (const t of targets(s, "r").filter((x) => x.place.kind === "gap" || x.place.kind === "home" || x.place.kind === "float")) {
        expect(ringsOf(t.after({ x: 300, y: 300 }).state), t.id).toEqual(ringsOf(s));
      }
    });
  });

  it("the store keeps a hidden edge's items, never hidden itself: read back, hidden comes from base", () => {
    const s = small();
    const stored = storeDockState(s);
    expect(stored.edges.find((e) => e.id === "hid")).toEqual({ id: "hid", side: "bottom", ring: 0, items: ["b"] });
    // Read over a base that shows the bar: shown, with its stored items.
    const shownBase: DockState = { ...s, edges: s.edges.map((e) => ({ ...e, items: e.id === "hid" ? [] : e.items, hidden: false })) };
    const shown = readDockState(JSON.parse(JSON.stringify(stored)), shownBase);
    expect(shown.dropped).toEqual([]);
    expect(shown.state.edges.find((e) => e.id === "hid")).toMatchObject({ hidden: false, items: ["b"] });
    // Read over a base that hides it: hidden, with them.
    expect(readDockState(JSON.parse(JSON.stringify(stored)), small()).state.edges.find((e) => e.id === "hid")).toMatchObject({ hidden: true, items: ["b"] });
    // A stored hidden (an older store, or another writer's) is ignored and listed.
    const withHidden = { ...stored, edges: stored.edges.map((e) => (e.id === "hid" ? { ...e, hidden: true } : e)) };
    const read = readDockState(withHidden, shownBase);
    expect(read.dropped).toContain("edge:hid:hidden");
    expect(read.state.edges.find((e) => e.id === "hid")!.hidden).toBe(false);
  });
});
