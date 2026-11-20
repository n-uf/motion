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
    const anchored = floatAt(base(), "tb", undefined, "column");
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
    const raw: Scene = { ...base(), floats: [{ id: "card", rect: { x: 200, y: 120, width: 333, height: 301 }, orient: "column" }] };
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
    // The old single size belongs to the orient the float is in.
    const legacy = toolbar("tb", { floatSize: { width: 50, height: 130 } });
    expect(floatSizeOf(legacy, "column", "column")).toEqual({ width: 50, height: 130 });
    expect(floatSizeOf(legacy, "row", "column")).toEqual(flat);
    expect(floatSizeOf(legacy, "row", "row")).toEqual({ width: 50, height: 130 });
    // Asked with no orient: the item's own, as before.
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

  it("reads as the size for its float's orient", () => {
    const read = readScene(stored("column", upright), base());
    expect(read.dropped).toEqual([]);
    expect(read.scene.items.tb!.floatSizes).toEqual({ column: upright });
    expect(sizeOf(read.scene, "tb")).toEqual(upright);
    expect(sizeOf(orient(read.scene, "tb", "row"), "tb")).toEqual(flat);
  });

  it("heals in solve: the old size never follows its float to the other orient", () => {
    // Read for the orient its float is in, then a turn takes the other orient's size, and turned back it has its own.
    const read = readScene(stored("row", flat), base());
    expect(read.scene.items.tb!.floatSizes).toEqual({ row: flat });
    const up = orient(read.scene, "tb", "column");
    expect(sizeOf(up, "tb")).toEqual(upright);
    expect(sizeOf(orient(up, "tb", "row"), "tb")).toEqual(flat);
    // A scene that still carries the one `floatSize` (a host's own) is read for the orient its float is in only.
    const carried: Scene = { ...base(), items: { ...base().items, tb: toolbar("tb", { floatSize: flat }) }, floats: [{ id: "tb", rect: { x: 300, y: 300, ...flat } }] };
    expect(sizeOf(carried, "tb")).toEqual(flat);
    const turned = orient(carried, "tb", "column");
    expect(sizeOf(turned, "tb")).toEqual(upright);
    expect(turned.items.tb!.floatSize).toBeUndefined();
    expect(turned.items.tb!.floatSizes).toEqual({ row: flat });
    expect(sizeOf(orient(turned, "tb", "row"), "tb")).toEqual(flat);
  });

  it("an item not floating reads it as the size for its item's own orient", () => {
    const read = readScene({ v: 1, edges: [], floats: [], items: { card: { used: 1, floatSize: { width: 310, height: 380 } } } }, base());
    expect(read.scene.items.card!.floatSizes).toEqual({ column: { width: 310, height: 380 } });
    expect(read.dropped).toEqual([]);
  });
});
