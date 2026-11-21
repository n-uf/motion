/**
 * `DockItem.length`: the length a person asked an item to have, per axis. `solve` hands it to the edge's stack, the stored
 * form round-trips it, and the verbs `dividers`, `resizeBetween`, `resetBetween` and `resetLengths` trade it between the
 * items of an edge on top of `@n-uf/placement/stack`'s.
 */
import { describe, expect, it } from "vitest";
import { closeItem, dividers, openItem, readDockState, resetBetween, resetLengths, resizeBetween, solve, storeDockState, type DockItem, type DockLayout, type DockState } from "../src";
import { bar, byId, column, group, panel, windowState } from "./fixture";

const stateOf = (items: readonly DockItem[], height = 800): DockState => ({
  stage: { x: 0, y: 0, width: 1200, height },
  edges: [column("left", "left", 0, items.map((i) => i.id))],
  items: byId(items),
  floats: [],
  floatKinds: [],
});
const tall = (l: DockLayout, id: string): number => l.items[id]!.rect.height;
const three = (): DockState => stateOf([panel("a", 1), panel("b", 2), panel("c", 3)]);
const withLength = (s: DockState, id: string, length: NonNullable<DockItem["length"]>): DockState => ({ ...s, items: { ...s.items, [id]: { ...s.items[id]!, length } } });

describe("DockItem.length in solve", () => {
  it("is read by the edge's stack: spare length goes in proportion to the asked lengths", () => {
    let s = three();
    s = withLength(withLength(withLength(s, "a", { column: 400 }), "b", { column: 150 }), "c", { column: 150 });
    const l = solve(s);
    expect(tall(l, "a") / tall(l, "b")).toBeCloseTo(400 / 150, 6);
    expect(tall(l, "b")).toBeCloseTo(tall(l, "c"), 6);
    expect(tall(l, "a") + tall(l, "b") + tall(l, "c")).toBeCloseTo(l.edges.left!.rect.height, 6);
  });

  it("a length for the other axis, or none, is today's layout", () => {
    const s = three();
    const row = { ...s, items: Object.fromEntries(Object.entries(s.items).map(([id, it]) => [id, { ...it, length: { row: 999 } }])) };
    expect(solve(row)).toEqual(solve(s));
  });
});

describe("DockItem.length in the stored state", () => {
  it("round-trips, JSON included, and the layout is the same", () => {
    const s = withLength(withLength(three(), "a", { column: 311.5 }), "b", { column: 0, row: 40 });
    const stored = storeDockState(s);
    expect(stored.items.a!.length).toEqual({ column: 311.5 });
    expect(stored.items.b!.length).toEqual({ column: 0, row: 40 });
    expect(stored.items.c!.length).toBeUndefined();
    const read = readDockState(JSON.parse(JSON.stringify(stored)), three());
    expect(read.dropped).toEqual([]);
    expect(read.state.items.a!.length).toEqual({ column: 311.5 });
    expect(read.state.items.b!.length).toEqual({ column: 0, row: 40 });
    expect(read.state.items.c!.length).toBeUndefined();
    expect(solve(read.state)).toEqual(solve(s));
  });

  it("an older store has none: the items read with none, whatever base had", () => {
    const base = withLength(three(), "a", { column: 500 });
    const stored = storeDockState(three());
    expect(Object.values(stored.items).every((it) => !("length" in it))).toBe(true);
    const read = readDockState(stored, base);
    expect(read.dropped).toEqual([]);
    expect(read.state.items.a!.length).toBeUndefined();
  });

  it("what can't be used is dropped and listed", () => {
    const stored = storeDockState(three());
    const bad = {
      ...stored,
      items: {
        ...stored.items,
        a: { ...stored.items.a!, length: { column: -3, row: 20 } },
        b: { ...stored.items.b!, length: { column: Infinity, depth: 4 } },
        c: { ...stored.items.c!, length: 7 },
      },
    } as unknown;
    const read = readDockState(bad, three());
    expect(read.state.items.a!.length).toEqual({ row: 20 });
    expect(read.state.items.b!.length).toBeUndefined();
    expect(read.state.items.c!.length).toBeUndefined();
    expect([...read.dropped].sort()).toEqual(["item:a:length:column", "item:b:length:column", "item:b:length:depth", "item:c:length"].sort());
  });

  it("closing and reopening an item keeps its length", () => {
    const s = withLength(three(), "b", { column: 222 });
    expect(openItem(closeItem(s, "b"), "b").items.b!.length).toEqual({ column: 222 });
    expect(solve(openItem(closeItem(s, "b"), "b"))).toEqual(solve(s));
  });
});

describe("the dock verbs over an edge", () => {
  const s = three();
  const l = solve(s);

  it("dividers: one per pair of neighboring open panels, in stage px, with the edge's id", () => {
    const list = dividers(s, l);
    expect(list.map((d) => [d.edge, d.before, d.after])).toEqual([["left", "a", "b"], ["left", "b", "c"]]);
    const a = l.items.a!.rect;
    expect(list[0]!.rect).toEqual({ x: a.x, y: a.y + a.height, width: a.width, height: 0 });
    expect(list[0]!.range.min).toBeCloseTo(-(tall(l, "a") - 120), 6);
    expect(list[0]!.range.max).toBeCloseTo(tall(l, "b") - 120, 6);
  });

  it("dividers over an edge at an offset are in stage px, not stack px", () => {
    const base = three();
    const offset: DockState = { ...base, edges: [bar("top", "top", 0, ["tools"]), ...base.edges], items: { ...base.items, tools: group("tools", 9) } };
    const lay = solve(offset);
    const a = lay.items.a!.rect;
    expect(a.y).toBeGreaterThan(0);
    const d = dividers(offset, lay)[0]!;
    expect(d.rect).toEqual({ x: a.x, y: a.y + a.height, width: a.width, height: 0 });
  });

  it("resizeBetween moves delta from after to before; nothing else moves", () => {
    const next = resizeBetween(s, "a", "b", 30, { layout: l });
    const n = solve(next);
    expect(tall(n, "a")).toBeCloseTo(tall(l, "a") + 30, 6);
    expect(tall(n, "b")).toBeCloseTo(tall(l, "b") - 30, 6);
    expect(tall(n, "c")).toBeCloseTo(tall(l, "c"), 6);
    expect(n.edges.left!.rect).toEqual(l.edges.left!.rect);
    // The state's other fields are as they were; only the lengths are new.
    expect(next.edges).toBe(s.edges);
    expect(next.items.a).not.toBe(s.items.a);
    expect(Object.keys(next.items)).toEqual(Object.keys(s.items));
  });

  it("needs no layout: it solves the state itself, and a layout that was stored and read back is solved again", () => {
    const direct = resizeBetween(s, "a", "b", 30);
    expect(direct).toEqual(resizeBetween(s, "a", "b", 30, { layout: l }));
    const copy = JSON.parse(JSON.stringify(l)) as DockLayout;
    expect(resizeBetween(s, "a", "b", 30, { layout: copy })).toEqual(direct);
    expect(dividers(s, copy)).toEqual(dividers(s, l));
  });

  it("clamps to the least and gives back the same state when nothing changes", () => {
    const far = solve(resizeBetween(s, "a", "b", 10_000));
    expect(tall(far, "b")).toBeCloseTo(120, 6);
    expect(resizeBetween(s, "a", "b", 0)).toBe(s);
    expect(resizeBetween(s, "a", "zzz", 10)).toBe(s);
    expect(resizeBetween(s, "a", "c", 10)).toBe(s);
    expect(resizeBetween(s, "b", "a", 10)).toBe(s);
    const atLeast = resizeBetween(s, "a", "b", 10_000);
    expect(resizeBetween(atLeast, "a", "b", 5)).toBe(atLeast);
  });

  it("an item in another edge, or a float, is never a pair", () => {
    const w = windowState();
    expect(resizeBetween(w, "pages", "findings", 10)).toBe(w);
    expect(resizeBetween(w, "pages", "notes", 10)).toBe(w);
  });

  it("resetBetween gives the pair its natural split back, nothing else moving; resetLengths clears the edge", () => {
    const dragged = resizeBetween(s, "a", "b", 60);
    const reset = solve(resetBetween(dragged, "a", "b"));
    expect(tall(reset, "a")).toBeCloseTo(tall(l, "a"), 6);
    expect(tall(reset, "b")).toBeCloseTo(tall(l, "b"), 6);
    expect(tall(reset, "c")).toBeCloseTo(tall(l, "c"), 6);
    expect(resetBetween(s, "a", "b")).toBe(s);
    const cleared = resetLengths(dragged, "left");
    expect(Object.values(cleared.items).every((it) => it.length === undefined)).toBe(true);
    expect(solve(cleared)).toEqual(l);
    expect(resetLengths(s, "left")).toBe(s);
    expect(resetLengths(dragged, "nope")).toBe(dragged);
  });

  it("resetLengths keeps an item's length for the other axis", () => {
    const both = withLength(s, "a", { column: 300, row: 50 });
    expect(resetLengths(both, "left").items.a!.length).toEqual({ row: 50 });
    const rowOnly = withLength(s, "a", { row: 50 });
    expect(resetLengths(rowOnly, "left")).toBe(rowOnly);
  });

  it("a collapsed panel between two open ones gives one divider across it", () => {
    const folded = stateOf([panel("a", 1), panel("b", 2, { from: 1 }), panel("c", 3)]);
    const list = dividers(folded, solve(folded));
    expect(list.map((d) => [d.before, d.after])).toEqual([["a", "c"]]);
    const moved = solve(resizeBetween(folded, "a", "c", 25));
    expect(tall(moved, "b")).toBe(28);
  });

  it("a group beside the panels takes no part", () => {
    const mixed = stateOf([panel("a", 1), group("g", 2), panel("c", 3)]);
    expect(dividers(mixed, solve(mixed)).map((d) => [d.before, d.after])).toEqual([["a", "c"]]);
  });
});
