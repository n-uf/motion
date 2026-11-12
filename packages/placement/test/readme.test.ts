/** The README's examples, run as written (their console output checked). */
import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, createDesk, liftOut } from "../src/dock";
import { deskDrop, deskTargets } from "../src/targets";
import { arrangement, layoutHost } from "../src/toolbar";

describe("README examples", () => {
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
    expect([items.get("panel:3")!.look, notes.map((n) => n.code)]).toEqual(["header", ["bottom-folded"]]);
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
