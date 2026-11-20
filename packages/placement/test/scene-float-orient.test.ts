/**
 * A float turned to the other orient takes that orient's size: the frame is never the old orient's rect around the new
 * orient's content. The sizes are per orient (`SceneItem.floatSizes`), and a stored scene with the old single
 * `floatSize` reads into them.
 */
import { describe, expect, it } from "vitest";
import { floatAt, floatSizeOf, orient, readScene, resize, solve, storeScene, targets, type Scene, type SceneItem } from "../src/scene";
import { form, windowScene } from "./scene-fixture";

/** A toolbar group: a 88 × 28 row, and upright a 36 × 107 strip of icons. */
const toolbar = (id = "tb", more: Partial<SceneItem> = {}): SceneItem => ({
  id,
  kind: "group",
  used: 12,
  forms: { row: [form("row", 60, 88, 28), form("icons", 40, 40, 28), form("menu", 0, 0, 0)], column: [form("icons", 107, 107, 36), form("menu", 0, 0, 0)] },
  ...more,
});

/** A card that grows along both orients, so a hand resize means something in each. */
const card = (id = "card"): SceneItem => ({
  id,
  kind: "panel",
  used: 13,
  forms: { column: [form("open", 120, 240, 260, { grows: true, crossMin: 180 }), form("header", 28, 28, 260)], row: [form("open", 120, 300, 200, { grows: true, crossMin: 100 }), form("header", 28, 28, 200)] },
});

function base(): Scene {
  const s = windowScene();
  return { ...s, items: { ...s.items, tb: toolbar(), card: card() }, floats: [] };
}

const sizeOf = (s: Scene, id: string) => {
  const r = solve(s).items[id]!.rect;
  return { width: r.width, height: r.height };
};
const upright = { width: 36, height: 107 };
const flat = { width: 88, height: 28 };

describe("a float turned to the other orient", () => {
  it("a toolbar float turned to a row, and back: the frame is the form's size each way", () => {
    const up = floatAt(base(), "tb", { x: 300, y: 300, width: 36, height: 107 }, "column");
    expect(sizeOf(up, "tb")).toEqual(upright);
    const row = orient(up, "tb", "row");
    expect(row.floats[0]!.rect).toMatchObject(flat);
    expect(solve(row).items.tb).toMatchObject({ floating: true, formKind: "row", rect: { x: 300, y: 300, ...flat } });
    const back = orient(row, "tb", "column");
    expect(solve(back).items.tb!.rect).toEqual(solve(up).items.tb!.rect);
    expect(solve(orient(back, "tb", "row")).items.tb!.rect).toEqual(solve(row).items.tb!.rect);
  });

  it("a float given no orient lies in its item's first axis; turning it keeps it a frame of its own size", () => {
    const flatFirst = floatAt(base(), "tb", { x: 120, y: 200, width: 88, height: 28 });
    expect(sizeOf(orient(flatFirst, "tb", "column"), "tb")).toEqual(upright);
    expect(sizeOf(orient(orient(flatFirst, "tb", "column"), "tb", "row"), "tb")).toEqual(flat);
  });

  it("an anchored float keeps its anchor and takes the new size", () => {
    // (An item that declares `floatSizes`: one that declares none turns keeping its rect.)
    const s = base();
    const anchored = floatAt({ ...s, items: { ...s.items, tb: toolbar("tb", { floatSizes: { row: flat } }) } }, "tb", undefined, "column");
    expect(anchored.floats[0]!.anchor).toBe("content-top-right");
    const row = orient(anchored, "tb", "row");
    expect(row.floats[0]!.anchor).toBe("content-top-right");
    const l = solve(row).items.tb!.rect;
    const content = solve(row).content;
    expect({ width: l.width, height: l.height }).toEqual(flat);
    expect(l.x + l.width).toBe(content.x + content.width);
  });

  it("a float already in that orient is the scene itself", () => {
    const up = floatAt(base(), "tb", { x: 300, y: 300, width: 36, height: 107 }, "column");
    expect(orient(up, "tb", "column")).toBe(up);
    const none = base();
    expect(orient(none, "tb", "row")).toBe(none);
  });

  it("a hand-resized float keeps its size for each orient across turns", () => {
    const start = floatAt(base(), "card", { x: 300, y: 100, width: 300, height: 400 }, "column");
    const grown = resize(start, "card", { x: 300, y: 100, width: 400, height: 450 });
    expect(grown.items.card!.floatSizes).toEqual({ column: { width: 400, height: 450 } });
    // Across: its own default until the user sizes it there.
    const across = orient(grown, "card", "row");
    expect(sizeOf(across, "card")).toEqual(floatSizeOf(card(), "row"));
    const wide = resize(across, "card", { x: 300, y: 100, width: 520, height: 160 });
    expect(wide.items.card!.floatSizes).toEqual({ column: { width: 400, height: 450 }, row: { width: 520, height: 160 } });
    expect(sizeOf(wide, "card")).toEqual({ width: 520, height: 160 });
    const upAgain = orient(wide, "card", "column");
    expect(sizeOf(upAgain, "card")).toEqual({ width: 400, height: 450 });
    expect(sizeOf(orient(upAgain, "card", "row"), "card")).toEqual({ width: 520, height: 160 });
  });

  it("a float whose rect was set by hand, not through floatAt, comes back at that rect", () => {
    const raw: Scene = { ...base(), items: { ...base().items, card: { ...card(), floatSizes: {} } }, floats: [{ id: "card", rect: { x: 200, y: 120, width: 333, height: 301 }, orient: "column" }] };
    const there = orient(raw, "card", "row");
    expect(sizeOf(there, "card")).toEqual(floatSizeOf(card(), "row"));
    expect(solve(orient(there, "card", "column")).items.card!.rect).toEqual(solve(raw).items.card!.rect);
  });
});

describe("a float's size by orient", () => {
  it("floatSizeOf: the size set for that orient, else the legacy floatSize in the orient it was set in, else the form's natural size", () => {
    const tb = toolbar();
    expect(floatSizeOf(tb, "row")).toEqual(flat);
    expect(floatSizeOf(tb, "column")).toEqual(upright);
    const sized = toolbar("tb", { floatSizes: { column: { width: 40, height: 120 } } });
    expect(floatSizeOf(sized, "column")).toEqual({ width: 40, height: 120 });
    expect(floatSizeOf(sized, "row")).toEqual(flat);
    // On an item that declares `floatSizes`, the old single size belongs to the orient the float is in.
    const both = toolbar("tb", { floatSize: { width: 50, height: 130 }, floatSizes: {} });
    expect(floatSizeOf(both, "column", "column")).toEqual({ width: 50, height: 130 });
    expect(floatSizeOf(both, "row", "column")).toEqual(flat);
    expect(floatSizeOf(both, "row", "row")).toEqual({ width: 50, height: 130 });
    // An item that declares none reads it as before them: in any orient.
    const legacy = toolbar("tb", { floatSize: { width: 50, height: 130 } });
    expect(floatSizeOf(legacy, "row", "column")).toEqual({ width: 50, height: 130 });
    expect(floatSizeOf(legacy)).toEqual({ width: 50, height: 130 });
  });

  it("floatAt with a rect and the float's resize write the size for the orient the float is in", () => {
    const placed = floatAt(base(), "card", { x: 10, y: 10, width: 330, height: 410 }, "row");
    expect(placed.items.card!.floatSizes).toEqual({ row: { width: 330, height: 410 } });
    expect(floatAt(placed, "card", { x: 50, y: 60, width: 340, height: 420 }).items.card!.floatSizes).toEqual({ row: { width: 340, height: 420 } });
  });

  it("a drag's float target takes the size for the orient it lands in", () => {
    const sized: Scene = { ...base(), items: { ...base().items, card: { ...card(), floatSizes: { column: { width: 400, height: 450 }, row: { width: 520, height: 160 } } } } };
    const landed = (sc: Scene, o?: "row" | "column") => targets(sc, "card", o ? { floatOrient: o } : {}).find((x) => x.id === "float:card")!.after({ x: 600, y: 400 }).layout.items.card!;
    // Not floating yet: the size set for the orient it lands in.
    expect(landed(sized, "row").rect).toMatchObject({ width: 520, height: 160 });
    expect(landed(sized, "column").rect).toMatchObject({ width: 400, height: 450 });
    // Floating as a column, carried to a row: the row's size, not the column's rect.
    const floating = floatAt(sized, "card", { x: 100, y: 100, width: 400, height: 450 }, "column");
    expect(landed(floating, "row").rect).toMatchObject({ width: 520, height: 160 });
    expect(landed(floating).rect).toMatchObject({ width: 400, height: 450 });
  });

  it("is stored and read back", () => {
    const s = resize(orient(resize(floatAt(base(), "card", { x: 300, y: 100, width: 300, height: 400 }, "column"), "card", { x: 300, y: 100, width: 400, height: 450 }), "card", "row"), "card", { x: 300, y: 100, width: 520, height: 160 });
    const stored = JSON.parse(JSON.stringify(storeScene(s)));
    expect(stored.items.card.floatSizes).toEqual({ column: { width: 400, height: 450 }, row: { width: 520, height: 160 } });
    const read = readScene(stored, base());
    expect(read.dropped).toEqual([]);
    expect(read.scene.items.card!.floatSizes).toEqual(s.items.card!.floatSizes);
    expect(storeScene(read.scene)).toEqual(storeScene(s));
    expect(solve(read.scene)).toEqual(solve(s));
  });

  it("drops a floatSizes field that isn't a size, by orient", () => {
    const stored = { v: 1, edges: [], floats: [], items: { card: { used: 1, floatSizes: { row: { width: 10, height: 0 }, column: { width: 5, height: 6 }, diagonal: { width: 1, height: 1 } } } } };
    const read = readScene(stored, base());
    expect(read.scene.items.card!.floatSizes).toEqual({ column: { width: 5, height: 6 } });
    expect(read.dropped).toEqual(expect.arrayContaining(["item:card:floatSizes:row", "item:card:floatSizes:diagonal"]));
  });
});

describe("a scene stored with the old single floatSize", () => {
  const stored = (orientOf: "row" | "column", at: { width: number; height: number }) => ({
    v: 1,
    edges: [],
    floats: [{ id: "tb", x: 300, y: 300, ...at, orient: orientOf }],
    items: { tb: { used: 12, floatSize: { ...at } } },
  });

  it("reads as before the per-orient sizes (the item declares none): its floatSize kept, framed at its stored rect", () => {
    const read = readScene(stored("column", upright), base());
    expect(read.dropped).toEqual([]);
    expect(read.scene.items.tb!.floatSizes).toBeUndefined();
    expect(read.scene.items.tb!.floatSize).toEqual(upright);
    expect(sizeOf(read.scene, "tb")).toEqual(upright);
    // Turned, it keeps its rect, as before the per-orient sizes.
    expect(sizeOf(orient(read.scene, "tb", "row"), "tb")).toEqual(upright);
  });

  it("a turn keeps its rect and its floatSize, as before; turned back it is as it was", () => {
    const read = readScene(stored("row", flat), base());
    expect(read.scene.items.tb!.floatSize).toEqual(flat);
    const up = orient(read.scene, "tb", "column");
    expect(up.items.tb!.floatSizes).toBeUndefined();
    expect(up.items.tb!.floatSize).toEqual(flat);
    expect(sizeOf(up, "tb")).toEqual(flat);
    expect(solve(orient(up, "tb", "row")).items.tb!.rect).toEqual(solve(read.scene).items.tb!.rect);
    // Once it declares `floatSizes`, the old size is read for the orient its float is in only, and a turn takes the
    // other orient's size.
    const carried: Scene = { ...base(), items: { ...base().items, tb: toolbar("tb", { floatSize: flat, floatSizes: {} }) }, floats: [{ id: "tb", rect: { x: 300, y: 300, ...flat } }] };
    expect(sizeOf(carried, "tb")).toEqual(flat);
    const turned = orient(carried, "tb", "column");
    expect(sizeOf(turned, "tb")).toEqual(upright);
    expect(turned.items.tb!.floatSize).toBeUndefined();
    expect(turned.items.tb!.floatSizes).toEqual({ row: flat });
    expect(sizeOf(orient(turned, "tb", "row"), "tb")).toEqual(flat);
  });

  it("an item not floating reads it as it is (it declares no floatSizes); one that declares them takes it for its own orient", () => {
    const read = readScene({ v: 1, edges: [], floats: [], items: { card: { used: 1, floatSize: { width: 310, height: 380 } } } }, base());
    expect(read.scene.items.card!.floatSizes).toBeUndefined();
    expect(read.scene.items.card!.floatSize).toEqual({ width: 310, height: 380 });
    expect(read.dropped).toEqual([]);
    const declared = readScene({ v: 1, edges: [], floats: [], items: { card: { used: 1, floatSize: { width: 310, height: 380 }, floatSizes: { row: { width: 500, height: 150 } } } } }, base());
    expect(declared.scene.items.card!.floatSizes).toEqual({ column: { width: 310, height: 380 }, row: { width: 500, height: 150 } });
  });
});

describe("a legacy floatSize in memory is not lost", () => {
  /** The base scene with the card's old single size, set in its own orient (column, its first axis). */
  const legacy = (): Scene => {
    const s = base();
    return { ...s, items: { ...s.items, card: { ...s.items.card!, floatSize: { width: 333, height: 444 } } } };
  };
  const size = { width: 333, height: 444 };

  it("floatAt with no rect in the other orient frames it at that size, as before; a turn and back keeps it", () => {
    const row = floatAt(legacy(), "card", undefined, "row");
    expect(row.items.card!.floatSize).toEqual(size);
    expect(row.items.card!.floatSizes).toBeUndefined();
    expect(sizeOf(row, "card")).toEqual(size);
    // Turned, it keeps its rect, as before the per-orient sizes, and turned back it is as it was.
    const col = orient(row, "card", "column");
    expect(sizeOf(col, "card")).toEqual(size);
    expect(sizeOf(orient(col, "card", "row"), "card")).toEqual(size);
  });

  it("readScene leaves a base item's legacy floatSize as it is (the item declares no floatSizes)", () => {
    const read = readScene({ v: 1, edges: [], floats: [], items: {} }, legacy());
    expect(read.scene.items.card!.floatSize).toEqual(size);
    expect(read.scene.items.card!.floatSizes).toBeUndefined();
  });
});

describe("an item that declares no floatSizes is framed as before the per-orient sizes", () => {
  /** A toolbar with only the old single size, a row's, floating upright at a stored rect of its own. */
  const upright40 = { width: 40, height: 120 };
  const undeclared = (): Scene => ({ ...base(), items: { ...base().items, tb: toolbar("tb", { floatSize: flat }) }, floats: [{ id: "tb", rect: { x: 300, y: 300, ...upright40 }, orient: "column" }] });

  it("floated upright with only a row floatSize: its frame is its stored rect, the first form", () => {
    expect(solve(undeclared()).items.tb).toMatchObject({ floating: true, rect: { x: 300, y: 300, ...upright40 } });
    expect(floatSizeOf(undeclared().items.tb!, "column")).toEqual(flat);
  });

  it("a stored scene with no floatSizes reads and renders as before: the stored rect, its floatSize kept", () => {
    const stored = { v: 1, edges: [], floats: [{ id: "tb", x: 300, y: 300, ...upright40, orient: "column" }], items: { tb: { used: 12, floatSize: flat } } };
    const read = readScene(stored, { ...base(), items: { ...base().items, tb: toolbar("tb") } });
    expect(read.dropped).toEqual([]);
    expect(read.scene.items.tb!.floatSizes).toBeUndefined();
    expect(read.scene.items.tb!.floatSize).toEqual(flat);
    expect(sizeOf(read.scene, "tb")).toEqual(upright40);
  });

  it("an item that declares floatSizes keeps the per-orient frame: upright, its form's natural size, whatever the rect", () => {
    const s = undeclared();
    const declared: Scene = { ...s, items: { ...s.items, tb: toolbar("tb", { floatSizes: { row: flat } }) } };
    expect(sizeOf(declared, "tb")).toEqual(upright);
  });

  it("orient() on it keeps its rect, as before: an explicit 200 x 60 turned and back is 200 x 60", () => {
    const s: Scene = { ...base(), items: { ...base().items, tb: toolbar("tb") }, floats: [{ id: "tb", rect: { x: 300, y: 300, width: 200, height: 60 }, orient: "row" }] };
    const up = orient(s, "tb", "column");
    expect(up.floats[0]!.rect).toEqual({ x: 300, y: 300, width: 200, height: 60 });
    expect(up.items.tb!.floatSizes).toBeUndefined();
    const back = orient(up, "tb", "row");
    expect(sizeOf(back, "tb")).toEqual({ width: 200, height: 60 });
  });
});
