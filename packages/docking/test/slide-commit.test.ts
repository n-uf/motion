/**
 * A landing counts for a place only where its own commit is that place (`SlideRoom.place`, read by both paths' sliding
 * ranges): the edge's shown items in order and the items in the ». So no range end, and no tile cut from one, is read
 * from a landing that commits another place (a neighbor pushed into the », the edge reordered).
 *
 * Within the room a drop makes no dock reaches such a landing: the solver keeps a dock's space to the edge's spare
 * length (a start past it lands short of where it was aimed, which `landsAt` refuses), and the neighbors' forms don't
 * depend on the space. The property over the seeded bars and the captured windows is `slide-range-one`; here one bar
 * shows both halves of the rule.
 */
import { describe, expect, it } from "vitest";
import { solve, targets, type DockItem, type DockState } from "../src";
import { liftItem } from "../src/changes";
import { landsAt, slideRange, slideRoom, type SlideEdge } from "../src/slide";
import { bar, byId, form } from "./fixture";

/** A toolbar `len` px long that goes to the » when the bar has no room for it. */
const tb = (id: string, len: number, used: number): DockItem => ({ id, kind: "group", used, forms: { row: [form("row", len, len, 31), form("menu", 0, 0, 0)], column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] } });

// A 600 px bottom bar: a, the held g, c and d, all in the start zone, with 22 px to spare once g is docked.
const state: DockState = {
  stage: { x: 0, y: 0, width: 600, height: 400 },
  edges: [bar("bar", "bottom", 0, ["a", "g", "c", "d"], { cross: { min: 31, max: 31, rail: 31 }, gap: 4, pad: { start: 8, end: 8 }, menu: { main: 24 } })],
  items: byId([tb("a", 150, 4), tb("g", 100, 3), tb("c", 150, 2), tb("d", 150, 1)]),
  floats: [],
  floatKinds: ["group"],
};
const base = solve(liftItem(state, "g"));
const drawn = base.edges.bar!.rect;
const se: SlideEdge = { state, dragged: "g", e: state.edges[0]!, axis: "x", base, drawn, middle: drawn.x + drawn.width / 2, fixed: [], prev: {} };

describe("a landing counts for its place only where it commits that place", () => {
  it("the room after d: its place is a c d g with nothing in the », and every landing of its range commits it", () => {
    const room = slideRoom(se, "d", undefined, ["a", "c", "d"], 100)!;
    expect(room.place).toBe("a c d g » ");
    const range = slideRange(se, room, 10)!;
    expect(range.to).toBeGreaterThan(range.from);
    for (const x0 of [range.from, range.to]) {
      const l = range.land(x0)!.result.layout;
      expect(Object.values(l.items).some((it) => it.inMenu), `landing at ${x0}`).toBe(false);
    }
    // What the tiles' target of that place commits is the same place.
    const t = targets(state, "g").find((x) => x.place.kind === "gap" && x.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout.items.g!.rect.x > base.items.d!.rect.x)!;
    const l = t.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
    expect(["a", "c", "d", "g"].map((id) => l.items[id]!.inMenu ?? false)).toEqual([false, false, false, false]);
  });

  it("a landing whose commit is another place does not count: read against the place a g c d, the room after d has no range", () => {
    const room = slideRoom(se, "d", undefined, ["a", "c", "d"], 100)!;
    const other = slideRoom(se, "a", "c", ["a"], 100)!;
    expect(other.place).toBe("a g c d » ");
    // Every start after d lands where aimed, each committing a c d g: none is a landing of the place a g c d.
    expect(landsAt(se, { edge: "bar", zone: "start", at: room.atOf("start"), space: 0 }, room.a)).not.toBeNull();
    expect(slideRange(se, { ...room, place: other.place! }, 10)).toBeNull();
  });

  it("a start past the spare length lands short of where it was aimed, so the room's own test refuses it", () => {
    // 40 px of space is more than the 22 the bar spares: the solver keeps 22, the item lands 18 px short.
    const room = slideRoom(se, "a", "c", ["a"], 100)!;
    expect(landsAt(se, { edge: "bar", zone: "start", at: 1, space: 40 }, room.a + 40)).toBeNull();
    expect(landsAt(se, { edge: "bar", zone: "start", at: 1, space: 22 }, room.a + 22)).not.toBeNull();
  });
});

describe("a fixed item that steps may go to the » for a landing: it is no part of the place", () => {
  // A 420 px bottom bar: a, the held g and f, a fixed readout that steps (`stepping`), whose next step is the ». With g
  // docked f has no room and goes to the », as `landsAt` lets it.
  const f: DockItem = { id: "f", kind: "group", used: 0.5, align: "end", fixed: true, stepping: true, forms: { row: [form("row", 200, 200, 31), form("menu", 0, 0, 0)], column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] } };
  const narrow: DockState = {
    stage: { x: 0, y: 0, width: 420, height: 400 },
    edges: [bar("bar", "bottom", 0, ["a", "g", "f"], { cross: { min: 31, max: 31, rail: 31 }, gap: 4, pad: { start: 8, end: 8 }, menu: { main: 24 } })],
    items: byId([tb("a", 150, 4), tb("g", 100, 3), f]),
    floats: [],
    floatKinds: ["group"],
  };
  const lifted = solve(liftItem(narrow, "g"));
  const rect = lifted.edges.bar!.rect;
  const fixedF = Object.entries(lifted.items).filter(([id, it]) => id === "f" && !it.inMenu).map(([id, it]) => ({ id, r: it.rect }));
  const nse: SlideEdge = { state: narrow, dragged: "g", e: narrow.edges[0]!, axis: "x", base: lifted, drawn: rect, middle: rect.x + rect.width / 2, fixed: fixedF, prev: {} };

  it("a landing that steps f to the » commits the place a g, as one with f shown does", () => {
    expect(lifted.items.f!.inMenu).toBeFalsy();
    const room = slideRoom(nse, "a", "f", ["a"], 100)!;
    const hit = landsAt(nse, { edge: "bar", zone: "start", at: room.atOf("start"), space: 0 }, room.a)!;
    expect(hit.layout.items.f!.inMenu).toBe(true);
    expect(hit.layout.items.f!.edge).toBe("bar");
    // Read against the place a g (f shown, as the lift leaves it, or in the »: no part of it), the landings count.
    expect(slideRange(nse, { ...room, place: "a g » " }, 10)).not.toBeNull();
  });
});
