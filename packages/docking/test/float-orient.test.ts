/**
 * A float turned to the other orient takes that orient's size: the frame is never the old orient's rect around the new
 * orient's content. The sizes are per orient (`DockItem.floatSizes`), and a stored state with the old single
 * `floatSize` reads into them.
 */
import { describe, expect, it } from "vitest";
import { floatAt, floatSizeOf, orientFloat, readDockState, resizeFloat, solve, storeDockState, targets, type DockItem, type DockState } from "../src";
import { form, windowState } from "./fixture";

/** A toolbar group: a 88 × 28 row, and upright a 36 × 107 strip of icons. */
const toolbar = (id = "tb", more: Partial<DockItem> = {}): DockItem => ({
  id,
  kind: "group",
  used: 12,
  forms: { row: [form("row", 60, 88, 28), form("icons", 40, 40, 28), form("menu", 0, 0, 0)], column: [form("icons", 107, 107, 36), form("menu", 0, 0, 0)] },
  ...more,
});

/** A card that grows along both orients, so a hand resize means something in each. */
const card = (id = "card"): DockItem => ({
  id,
  kind: "panel",
  used: 13,
  forms: { column: [form("open", 120, 240, 260, { grows: true, crossMin: 180 }), form("header", 28, 28, 260)], row: [form("open", 120, 300, 200, { grows: true, crossMin: 100 }), form("header", 28, 28, 200)] },
});

function base(): DockState {
  const s = windowState();
  return { ...s, items: { ...s.items, tb: toolbar(), card: card() }, floats: [] };
}

const sizeOf = (s: DockState, id: string) => {
  const r = solve(s).items[id]!.rect;
  return { width: r.width, height: r.height };
};
const upright = { width: 36, height: 107 };
const flat = { width: 88, height: 28 };

describe("a float turned to the other orient", () => {
  it("a toolbar float turned to a row, and back: the frame is the form's size each way", () => {
    const up = floatAt(base(), "tb", { x: 300, y: 300, width: 36, height: 107 }, "column");
    expect(sizeOf(up, "tb")).toEqual(upright);
    const row = orientFloat(up, "tb", "row");
    expect(row.floats[0]!.rect).toMatchObject(flat);
    expect(solve(row).items.tb).toMatchObject({ floating: true, formKind: "row", rect: { x: 300, y: 300, ...flat } });
    const back = orientFloat(row, "tb", "column");
    expect(solve(back).items.tb!.rect).toEqual(solve(up).items.tb!.rect);
    expect(solve(orientFloat(back, "tb", "row")).items.tb!.rect).toEqual(solve(row).items.tb!.rect);
  });

  it("a float given no orient lies in its item's first axis; turning it keeps it a frame of its own size", () => {
    const flatFirst = floatAt(base(), "tb", { x: 120, y: 200, width: 88, height: 28 });
    expect(sizeOf(orientFloat(flatFirst, "tb", "column"), "tb")).toEqual(upright);
    expect(sizeOf(orientFloat(orientFloat(flatFirst, "tb", "column"), "tb", "row"), "tb")).toEqual(flat);
  });

  it("an anchored float keeps its anchor and takes the new size", () => {
    // (An item that declares `floatSizes`: one that declares none turns keeping its rect.)
    const s = base();
    const anchored = floatAt({ ...s, items: { ...s.items, tb: toolbar("tb", { floatSizes: { row: flat } }) } }, "tb", undefined, "column");
    expect(anchored.floats[0]!.anchor).toBe("content-top-right");
    const row = orientFloat(anchored, "tb", "row");
    expect(row.floats[0]!.anchor).toBe("content-top-right");
    const l = solve(row).items.tb!.rect;
    const content = solve(row).content;
    expect({ width: l.width, height: l.height }).toEqual(flat);
    expect(l.x + l.width).toBe(content.x + content.width);
  });

  it("a float already in that orient is the state itself", () => {
    const up = floatAt(base(), "tb", { x: 300, y: 300, width: 36, height: 107 }, "column");
    expect(orientFloat(up, "tb", "column")).toBe(up);
    const none = base();
    expect(orientFloat(none, "tb", "row")).toBe(none);
  });

  it("a hand-resized float keeps its size for each orient across turns", () => {
    const start = floatAt(base(), "card", { x: 300, y: 100, width: 300, height: 400 }, "column");
    const grown = resizeFloat(start, "card", { x: 300, y: 100, width: 400, height: 450 });
    expect(grown.items.card!.floatSizes).toEqual({ column: { width: 400, height: 450 } });
    // Across: its own default until the user sizes it there.
    const across = orientFloat(grown, "card", "row");
    expect(sizeOf(across, "card")).toEqual(floatSizeOf(card(), "row"));
    const wide = resizeFloat(across, "card", { x: 300, y: 100, width: 520, height: 160 });
    expect(wide.items.card!.floatSizes).toEqual({ column: { width: 400, height: 450 }, row: { width: 520, height: 160 } });
    expect(sizeOf(wide, "card")).toEqual({ width: 520, height: 160 });
    const upAgain = orientFloat(wide, "card", "column");
    expect(sizeOf(upAgain, "card")).toEqual({ width: 400, height: 450 });
    expect(sizeOf(orientFloat(upAgain, "card", "row"), "card")).toEqual({ width: 520, height: 160 });
  });

  it("a float whose rect was set by hand, not through floatAt, comes back at that rect", () => {
    const raw: DockState = { ...base(), items: { ...base().items, card: { ...card(), floatSizes: {} } }, floats: [{ id: "card", rect: { x: 200, y: 120, width: 333, height: 301 }, orient: "column" }] };
    const there = orientFloat(raw, "card", "row");
    expect(sizeOf(there, "card")).toEqual(floatSizeOf(card(), "row"));
    expect(solve(orientFloat(there, "card", "column")).items.card!.rect).toEqual(solve(raw).items.card!.rect);
  });
});

describe("a float's size by orient", () => {
  it("floatSizeOf: the size set for that orient, else the form's natural size", () => {
    const tb = toolbar();
    expect(floatSizeOf(tb, "row")).toEqual(flat);
    expect(floatSizeOf(tb, "column")).toEqual(upright);
    const sized = toolbar("tb", { floatSizes: { column: { width: 40, height: 120 } } });
    expect(floatSizeOf(sized, "column")).toEqual({ width: 40, height: 120 });
    expect(floatSizeOf(sized, "row")).toEqual(flat);
  });

  it("floatAt with a rect and the float's resize write the size for the orient the float is in", () => {
    const placed = floatAt(base(), "card", { x: 10, y: 10, width: 330, height: 410 }, "row");
    expect(placed.items.card!.floatSizes).toEqual({ row: { width: 330, height: 410 } });
    expect(floatAt(placed, "card", { x: 50, y: 60, width: 340, height: 420 }).items.card!.floatSizes).toEqual({ row: { width: 340, height: 420 } });
  });

  it("a drag's float target takes the size for the orient it lands in", () => {
    const sized: DockState = { ...base(), items: { ...base().items, card: { ...card(), floatSizes: { column: { width: 400, height: 450 }, row: { width: 520, height: 160 } } } } };
    const landed = (sc: DockState, o?: "row" | "column") => targets(sc, "card", o ? { floatOrient: o } : {}).find((x) => x.id === "float:card")!.after({ x: 600, y: 400 }).layout.items.card!;
    // Not floating yet: the size set for the orient it lands in.
    expect(landed(sized, "row").rect).toMatchObject({ width: 520, height: 160 });
    expect(landed(sized, "column").rect).toMatchObject({ width: 400, height: 450 });
    // Floating as a column, carried to a row: the row's size, not the column's rect.
    const floating = floatAt(sized, "card", { x: 100, y: 100, width: 400, height: 450 }, "column");
    expect(landed(floating, "row").rect).toMatchObject({ width: 520, height: 160 });
    expect(landed(floating).rect).toMatchObject({ width: 400, height: 450 });
  });

  it("is stored and read back", () => {
    const s = resizeFloat(orientFloat(resizeFloat(floatAt(base(), "card", { x: 300, y: 100, width: 300, height: 400 }, "column"), "card", { x: 300, y: 100, width: 400, height: 450 }), "card", "row"), "card", { x: 300, y: 100, width: 520, height: 160 });
    const stored = JSON.parse(JSON.stringify(storeDockState(s)));
    expect(stored.items.card.floatSizes).toEqual({ column: { width: 400, height: 450 }, row: { width: 520, height: 160 } });
    const read = readDockState(stored, base());
    expect(read.dropped).toEqual([]);
    expect(read.state.items.card!.floatSizes).toEqual(s.items.card!.floatSizes);
    expect(storeDockState(read.state)).toEqual(storeDockState(s));
    expect(solve(read.state)).toEqual(solve(s));
  });

  it("drops a floatSizes field that isn't a size, by orient", () => {
    const stored = { v: 1, edges: [], floats: [], items: { card: { used: 1, floatSizes: { row: { width: 10, height: 0 }, column: { width: 5, height: 6 }, diagonal: { width: 1, height: 1 } } } } };
    const read = readDockState(stored, base());
    expect(read.state.items.card!.floatSizes).toEqual({ column: { width: 5, height: 6 } });
    expect(read.dropped).toEqual(expect.arrayContaining(["item:card:floatSizes:row", "item:card:floatSizes:diagonal"]));
  });
});

describe("a state stored with the old single floatSize", () => {
  const stored = (orientOf: "row" | "column", at: { width: number; height: number }) => ({
    v: 1,
    edges: [],
    floats: [{ id: "tb", x: 300, y: 300, ...at, orient: orientOf }],
    items: { tb: { used: 12, floatSize: { ...at } } },
  });

  it("reads the same frames: the old size is `floatSizes` for the orient its float is in, the float at its stored rect", () => {
    for (const [o, at] of [
      ["column", upright],
      ["row", flat],
    ] as const) {
      const read = readDockState(stored(o, at), base());
      expect(read.dropped).toEqual([]);
      expect(read.state.items.tb!.floatSizes).toEqual({ [o]: at });
      expect(solve(read.state).items.tb!.rect).toEqual({ x: 300, y: 300, ...at });
      // It writes back as `floatSizes`, never the old field.
      expect(storeDockState(read.state).items.tb).toEqual({ used: 12, floatSizes: { [o]: at } });
    }
  });

  it("read, it turns as a declared float: the other orient's size, and back its own", () => {
    const read = readDockState(stored("row", flat), base());
    const up = orientFloat(read.state, "tb", "column");
    expect(sizeOf(up, "tb")).toEqual(upright);
    expect(solve(orientFloat(up, "tb", "row")).items.tb!.rect).toEqual(solve(read.state).items.tb!.rect);
  });

  it("an item not floating takes it for its own orient; a stored size for that orient wins over it", () => {
    const read = readDockState({ v: 1, edges: [], floats: [], items: { card: { used: 1, floatSize: { width: 310, height: 380 } } } }, base());
    expect(read.state.items.card!.floatSizes).toEqual({ column: { width: 310, height: 380 } });
    expect(read.dropped).toEqual([]);
    const declared = readDockState({ v: 1, edges: [], floats: [], items: { card: { used: 1, floatSize: { width: 310, height: 380 }, floatSizes: { row: { width: 500, height: 150 } } } } }, base());
    expect(declared.state.items.card!.floatSizes).toEqual({ column: { width: 310, height: 380 }, row: { width: 500, height: 150 } });
    const own = readDockState({ v: 1, edges: [], floats: [], items: { card: { used: 1, floatSize: { width: 310, height: 380 }, floatSizes: { column: { width: 320, height: 390 } } } } }, base());
    expect(own.state.items.card!.floatSizes).toEqual({ column: { width: 320, height: 390 } });
  });

  it("drops an old size that isn't a size", () => {
    const read = readDockState({ v: 1, edges: [], floats: [], items: { card: { used: 1, floatSize: { width: 0, height: 380 } } } }, base());
    expect(read.state.items.card!.floatSizes).toBeUndefined();
    expect(read.dropped).toContain("item:card:floatSize");
  });
});

describe("an item that declares no floatSizes is framed at its stored rect", () => {
  const upright40 = { width: 40, height: 120 };
  const undeclared = (): DockState => ({ ...base(), items: { ...base().items, tb: toolbar("tb") }, floats: [{ id: "tb", rect: { x: 300, y: 300, ...upright40 }, orient: "column" }] });

  it("floated upright at a rect of its own: its frame is that rect, the first form", () => {
    expect(solve(undeclared()).items.tb).toMatchObject({ floating: true, rect: { x: 300, y: 300, ...upright40 } });
    expect(floatSizeOf(undeclared().items.tb!, "column")).toEqual(upright);
  });

  it("an item that declares floatSizes keeps the per-orient frame: upright, its form's natural size, whatever the rect", () => {
    const s = undeclared();
    const declared: DockState = { ...s, items: { ...s.items, tb: toolbar("tb", { floatSizes: { row: flat } }) } };
    expect(sizeOf(declared, "tb")).toEqual(upright);
  });

  it("orientFloat() on it keeps its rect, as before: an explicit 200 x 60 turned and back is 200 x 60", () => {
    const s: DockState = { ...base(), items: { ...base().items, tb: toolbar("tb") }, floats: [{ id: "tb", rect: { x: 300, y: 300, width: 200, height: 60 }, orient: "row" }] };
    const up = orientFloat(s, "tb", "column");
    expect(up.floats[0]!.rect).toEqual({ x: 300, y: 300, width: 200, height: 60 });
    expect(up.items.tb!.floatSizes).toBeUndefined();
    const back = orientFloat(up, "tb", "row");
    expect(sizeOf(back, "tb")).toEqual({ width: 200, height: 60 });
  });
});
