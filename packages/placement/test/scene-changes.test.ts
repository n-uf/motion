import { describe, expect, it } from "vitest";
import { close, floatAt, fold, keep, lift, moveTo, open, orient, raise, readScene, resize, solve, storeScene, use, type Scene } from "../src/scene";
import { STORED_WINDOW, windowScene } from "./scene-fixture";

const s = windowScene();
const edge = (sc: Scene, id: string) => sc.edges.find((e) => e.id === id)!;

describe("pure changes", () => {
  it("lift is the scene while an item is held: the item gone, an emptied dynamic column deleted, rings closed up", () => {
    const template = { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } };
    const cols: Scene = {
      ...s,
      columns: { left: template },
      edges: [...s.edges.filter((e) => e.id !== "left"), { id: "a", side: "left", ring: 0, column: true, items: ["pages"], ...template }, { id: "b", side: "left", ring: 1, column: true, items: ["notes"], ...template }],
      floats: [],
    };
    const held = lift(cols, "pages");
    expect(held.edges.some((e) => e.items.includes("pages"))).toBe(false);
    expect(held.edges.find((e) => e.id === "a")).toBeUndefined();
    expect(held.edges.find((e) => e.id === "b")!.ring).toBe(0);
    expect(solve(held).items.pages).toBeUndefined();
    // A float is lifted too; an item placed nowhere gives the scene back as it was.
    expect(lift(s, "notes").floats).toEqual([]);
    expect(lift(s, "nobody")).toBe(s);
  });

  it("moveTo docks an item before the at-th item of a zone, and the zone becomes its align", () => {
    const m = moveTo(s, "views", { edge: "toolbar", zone: "end", at: 0 });
    expect(edge(m, "toolbar").items).toEqual(["tools", "views", "zoom"]);
    expect(m.items.views!.align).toBe("end");
    expect(edge(s, "toolbar").items).toEqual(["views", "tools", "zoom"]);
    const back = moveTo(m, "views", { edge: "toolbar", zone: "start", at: 0 });
    expect(edge(back, "toolbar").items).toEqual(["views", "tools", "zoom"]);
    expect(back.items.views!.align).toBeUndefined();
  });

  it("moveTo takes an item out of its float and opens an empty zone", () => {
    const m = moveTo(s, "notes", { edge: "left", at: 1 });
    expect(m.floats).toEqual([]);
    expect(edge(m, "left").items).toEqual(["pages", "notes"]);
    const c = moveTo(s, "views", { edge: "toolbar", zone: "center", at: 0 });
    expect(edge(c, "toolbar").items).toEqual(["tools", "views", "zoom"]);
  });

  it("moveTo refuses a fixed item, an unknown edge and a kind the edge doesn't take (deny by default)", () => {
    expect(moveTo(s, "title", { edge: "toolbar", at: 0 })).toBe(s);
    expect(moveTo(s, "views", { edge: "nowhere", at: 0 })).toBe(s);
    expect(moveTo(s, "pages", { edge: "toolbar", at: 0 })).toBe(s);
    expect(moveTo(s, "pages", { edge: "titlebar", at: 0 })).toBe(s);
  });

  it("floatAt floats on top, records the size; with no rect it anchors at its last size", () => {
    const f = floatAt(s, "pages", { x: 300, y: 300, width: 240, height: 200 });
    expect(f.floats.map((x) => x.id)).toEqual(["notes", "pages"]);
    expect(f.items.pages!.floatSize).toEqual({ width: 240, height: 200 });
    expect(edge(f, "left").items).toEqual([]);
    const again = floatAt(moveTo(f, "pages", { edge: "left", at: 0 }), "pages");
    expect(again.floats.at(-1)).toEqual({ id: "pages", rect: { x: 0, y: 0, width: 240, height: 200 }, anchor: "content-top-right" });
    expect(floatAt(s, "title", { x: 0, y: 0, width: 10, height: 10 })).toBe(s);
    const noFloat = { ...s, floatKinds: [] };
    expect(floatAt(noFloat, "pages")).toBe(noFloat);
  });

  it("fold, keep, open, close, use, raise, orient and resize", () => {
    expect(fold(s, "pages", true).items.pages!.from).toBe(1);
    expect(fold(fold(s, "pages", true), "pages", false).items.pages!.from).toBeUndefined();
    expect(fold(s, "title", true)).toBe(s);
    expect(keep(s, "pages", true).items.pages!.kept).toBe(true);
    expect(keep(s, "pages", false)).toBe(s);
    expect(close(s, "pages").items.pages!.closed).toBe(true);
    expect(open(close(s, "pages"), "pages").items.pages!.closed).toBeUndefined();
    expect(close(s, "controls")).toBe(s);
    expect(use(s, "pages").items.pages!.used).toBe(9);
    const two = floatAt(s, "pages", { x: 0, y: 0, width: 100, height: 100 });
    expect(raise(two, "notes").floats.map((f) => f.id)).toEqual(["pages", "notes"]);
    expect(raise(two, "pages")).toBe(two);
    expect(raise(two, "notes").items).toBe(two.items);
    expect(orient(s, "notes", "row").floats[0]!.orient).toBe("row");
    expect(edge(resize(s, "left", 320), "left").size).toBe(320);
    expect(edge(resize(resize(s, "left", 320), "left", Number.NaN), "left").size).toBeUndefined();
  });

  it("raise and use under previous reshape nothing (C23)", () => {
    const before = solve(s);
    for (const next of [raise(s, "notes"), use(s, "pages"), use(s, "zoom")]) {
      const after = solve(next, { previous: before });
      for (const id of Object.keys(before.items)) expect(after.items[id]!.rect).toEqual(before.items[id]!.rect);
    }
  });
});

describe("the stored form", () => {
  it("round-trips", () => {
    const changed = resize(fold(keep(floatAt(moveTo(s, "tools", { edge: "toolbar", at: 0 }), "notes", { x: 520, y: 180, width: 300, height: 340 }), "marks", true), "notes", true), "left", 320);
    const stored = JSON.parse(JSON.stringify(storeScene(changed)));
    const read = readScene(stored, s);
    expect(read.dropped).toEqual([]);
    expect(storeScene(read.scene)).toEqual(storeScene(changed));
    expect(solve(read.scene)).toEqual(solve(changed));
  });

  it("reads the v1 fixture over the window", () => {
    const read = readScene(STORED_WINDOW, s);
    expect(read.dropped).toEqual([]);
    expect(edge(read.scene, "toolbar").items).toEqual(["tools", "views", "zoom"]);
    expect(edge(read.scene, "left").size).toBe(320);
    expect(read.scene.items.notes).toMatchObject({ from: 1, used: 10, floatSize: { width: 300, height: 340 } });
    expect(read.scene.items.marks!.kept).toBe(true);
    expect(solve(read.scene).edges.left!.cross).toBe(320);
  });

  it("never throws, and lists what it drops", () => {
    expect(readScene(null, s)).toEqual({ scene: s, dropped: [], error: "not an object" });
    expect(readScene({ v: 2 }, s).error).toBe("unknown version 2 (this reads version 1)");
    const bad = {
      v: 1,
      extra: true,
      edges: [
        { id: "ghost", side: "left", ring: 0, items: [] },
        { id: "toolbar", side: "top", ring: 1, items: ["pages", "views", "title", "views", 7] },
      ],
      floats: [
        { id: "notes", x: 9000, y: 9000, width: 300, height: 300, pinned: true },
        { id: "title", x: 0, y: 0, width: 10, height: 10 },
      ],
      items: { pages: { used: "x", from: 0 }, nobody: { used: 1 }, zoom: { align: "middle", odd: 1 } },
    };
    const read = readScene(bad, s);
    expect(read.dropped).toEqual(["extra", "item:pages:used", "item:pages:from", "item:nobody", "item:zoom:odd", "item:zoom:align", "edge:ghost", "edge:toolbar:pages", "edge:toolbar:title", "edge:toolbar:views", "edge:toolbar:7", "pinned:notes", "float:title"]);
    // Fixed items stay where base has them; items placed nowhere go home.
    expect(edge(read.scene, "titlebar").items).toEqual(["title", "controls"]);
    expect(edge(read.scene, "toolbar").items).toEqual(["views", "tools", "zoom"]);
    expect(edge(read.scene, "left").items).toEqual(["pages"]);
    // Clamped into the stage on read.
    expect(read.scene.floats[0]!.rect).toEqual({ x: 900, y: 500, width: 300, height: 300 });
    expect(readScene({ get v() { throw new Error("boom"); } }, s).error).toBe("unreadable: boom");
  });

  it("keeps trailing fixed items last when the store has more items", () => {
    const read = readScene({ v: 1, edges: [{ id: "toolbar", side: "top", ring: 1, items: ["views", "tools", "zoom", "marks"] }], floats: [], items: {} }, s);
    expect(edge(read.scene, "toolbar").items).toEqual(["views", "tools", "zoom", "marks"]);
    expect(edge(read.scene, "right").items).toEqual(["findings"]);
  });

  it("keeps a stored order exactly: a drop after a fixed item in the start zone round-trips", () => {
    // The toolbar holds two groups and a fixed readout in the start zone; a group dropped after the readout.
    const fx: Scene = { ...s, items: { ...s.items, readout: { ...s.items.readout!, align: "start" } }, edges: s.edges.map((e) => (e.id === "toolbar" ? { ...e, items: ["views", "tools", "readout"] } : e.id === "status" ? { ...e, items: ["search"] } : e)) };
    const dropped = moveTo(fx, "marks", { edge: "toolbar", zone: "start", at: 3 });
    expect(edge(dropped, "toolbar").items).toEqual(["views", "tools", "readout", "marks"]);
    const read = readScene(JSON.parse(JSON.stringify(storeScene(dropped))), fx);
    expect(read.dropped).toEqual([]);
    expect(edge(read.scene, "toolbar").items).toEqual(["views", "tools", "readout", "marks"]);
    expect(solve(read.scene)).toEqual(solve(dropped));
    // A fixed item the store lacks goes back to its base place.
    const lacking = readScene({ v: 1, edges: [{ id: "toolbar", side: "top", ring: 1, items: ["tools", "views"] }], floats: [], items: {} }, fx);
    expect(edge(lacking.scene, "toolbar").items).toEqual(["tools", "views", "readout"]);
  });

  it("stores no pinned field", () => {
    expect(JSON.stringify(storeScene(s))).not.toContain("pinned");
  });

  it("clamps a float on read by what solve draws: a folded float by its bar; one larger than the stage keeps its stored size, drawn shrunk to fit", () => {
    // No edges, so nothing moves the float but the stage.
    const folded = { ...s, edges: [], items: { ...s.items, notes: { ...s.items.notes!, from: 1 } } };
    const near = readScene({ v: 1, edges: [], floats: [{ id: "notes", x: 500, y: 780, width: 300, height: 340 }], items: { notes: { used: 3, from: 1 } } }, folded);
    // The bar is 28 tall: it lands at 772, where solve draws it, not 340 px up.
    expect(near.scene.floats[0]!.rect).toEqual({ x: 500, y: 772, width: 300, height: 340 });
    expect(solve(near.scene).items.notes!.rect.y).toBe(772);
    const tall = readScene({ v: 1, edges: [], floats: [{ id: "notes", x: 100, y: 100, width: 300, height: 900 }], items: {} }, { ...s, edges: [] });
    expect(tall.scene.floats[0]!.rect).toEqual({ x: 100, y: 0, width: 300, height: 900 });
    // Revision 7: solve shrinks a float larger than the stage (less the inset) to fit it.
    expect(solve(tall.scene).items.notes!.rect.height).toBe(s.stage.height);
  });
});
