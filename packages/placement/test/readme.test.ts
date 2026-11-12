/** The README's examples, run as written (their console output checked). */
import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, createDesk, liftOut } from "../src/dock";
import { deskDrop, deskTargets } from "../src/targets";
import { layoutTree, setSplitRatio, splitLeaf, treeFromOrder } from "../src/tiling";
import { arrangement, layoutHost } from "../src/toolbar";

describe("README examples", () => {
  it("tiling", () => {
    const area = { x: 0, y: 0, width: 1006, height: 600 };
    let tree = treeFromOrder([1, 2]);
    tree = splitLeaf(tree, 2, 3, false);
    tree = setSplitRatio(tree, 1, 0.6);
    const rects = layoutTree(tree, area, 6);
    expect([rects.get(1)!.width, rects.get(3)!.y]).toEqual([600, 303]);
  });

  it("a desk", () => {
    const desk = createDesk({
      panels: [
        { id: 1, title: "Files", natural: 160 },
        { id: 2, title: "Outline", natural: 200 },
        { id: 3, title: "History", natural: 160 },
      ],
      start: { left: [1, 2], right: [], bottom: [3] },
    });
    const docks = desk.constructionOf("docks");
    const { items, notes } = docks.layout(docks.initial([1, 2]), { width: 960, height: 420 }, DEFAULT_OPTIONS);
    expect([items.get("panel:3")!.look, notes]).toEqual(["header", ["bottom dock folded to its header"]]);
  });

  it("toolbar groups", () => {
    const a = arrangement({ top: { start: ["file", "edit"], end: ["share"] } });
    const size = (_id: string, _vertical: boolean, collapsed: boolean) => ({ along: collapsed ? 30 : 120, across: 28 });
    const top = layoutHost(a.top, "top", { length: 320, thickness: 34, lead: 8, tail: 8 }, size);
    expect(top.overflow).toEqual(["share"]);
  });

  it("drop targets", () => {
    const desk = createDesk({
      panels: [{ id: 1, title: "Files", natural: 160 }, { id: 2, title: "Outline", natural: 200 }],
      start: { left: [1, 2], right: [], bottom: [] },
    });
    const c = desk.constructionOf("dockTear");
    const key = "panel:2";
    const input = { c, s0: liftOut(c.initial([1]), key), key, size: { width: 1200, height: 700 }, opt: DEFAULT_OPTIONS };
    const targets = deskTargets(input);
    const float = targets.find((t) => t.id === "float")!;
    const drop = deskDrop(input, float, { x: 600, y: 300 }, { x: 20, y: 10 });
    expect([drop.label, drop.slot.x, drop.slot.y]).toEqual(["Float here", 580, 290]);
  });
});
