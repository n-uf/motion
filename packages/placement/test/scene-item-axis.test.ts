/**
 * `SceneItemLayout.axis`: the axis every item lies along, reported by `solve` so a host never infers it from the form
 * (a toolbar group's icons form is a row in a bar and a column in a column).
 */
import { describe, expect, it } from "vitest";
import { floatAt, moveTo, orient, solve, type Scene, type SceneItem } from "../src/scene";
import { form, windowScene } from "./scene-fixture";

/** A toolbar group: a 88 × 28 row, and upright a 36 × 107 strip of icons. */
const toolbar: SceneItem = {
  id: "tb",
  kind: "group",
  used: 12,
  forms: { row: [form("row", 60, 88, 28), form("icons", 40, 40, 28), form("menu", 0, 0, 0)], column: [form("icons", 107, 107, 36), form("menu", 0, 0, 0)] },
};

describe("the axis each item lies along (SceneItemLayout.axis)", () => {
  const s = windowScene();
  const withToolbar: Scene = { ...s, items: { ...s.items, tb: toolbar }, floats: [] };
  const axisOfItems = (sc: Scene) => Object.fromEntries(Object.entries(solve(sc).items).map(([id, l]) => [id, l.axis]));

  it("a bar's items lie along a row, a column's along a column", () => {
    const axes = axisOfItems(s);
    for (const id of ["title", "controls", "views", "tools", "zoom", "readout"]) expect(axes[id], id).toBe("row");
    for (const id of ["pages", "findings", "marks"]) expect(axes[id], id).toBe("column");
  });

  it("a toolbar group in its bar's icons form is a row, not a column", () => {
    // Narrow stage: the bar gives its groups up to their icons forms.
    let found = 0;
    for (let w = 640; w >= 260; w -= 10) {
      for (const [id, it] of Object.entries(solve(windowScene(w)).items)) {
        if (it.edge === "toolbar" && it.formKind === "icons") {
          expect(it.axis, `${id} at ${w}`).toBe("row");
          found++;
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("an item in a bar's » menu lies along its bar's axis", () => {
    let found = 0;
    for (let w = 400; w >= 120; w -= 10) {
      for (const it of Object.values(solve(windowScene(w)).items)) {
        if (it.edge === "toolbar" && it.inMenu) {
          expect(it.axis).toBe("row");
          found++;
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("a group docked in a column lies along a column", () => {
    const docked = moveTo(s, "tools", { edge: "right", at: 0 });
    expect(solve(docked).items.tools).toMatchObject({ edge: "right", axis: "column" });
  });

  it("a rail tab lies along a column", () => {
    const railed: Scene = { ...s, rails: { left: { width: 30, accepts: ["panel"] } } };
    const folded = { ...railed, items: { ...railed.items, pages: { ...railed.items.pages!, from: 1 } } };
    expect(solve(folded).items.pages).toMatchObject({ formKind: "rail", tab: true, axis: "column" });
  });

  it("a float lies along its orient, both ways", () => {
    const up = floatAt(withToolbar, "tb", { x: 300, y: 300, width: 36, height: 107 }, "column");
    expect(solve(up).items.tb).toMatchObject({ floating: true, axis: "column" });
    expect(solve(orient(up, "tb", "row")).items.tb).toMatchObject({ floating: true, axis: "row" });
    // No orient given: its item's first axis (a group declared row first floats as a row; a panel as a column).
    expect(solve(floatAt(withToolbar, "tb")).items.tb!.axis).toBe("row");
    expect(solve(floatAt(s, "notes", { x: 400, y: 200, width: 200, height: 300 })).items.notes!.axis).toBe("column");
    expect(solve(floatAt(s, "views", undefined, "column")).items.views).toMatchObject({ formKind: "icons", axis: "column" });
  });

  it("every item reports one", () => {
    for (const sc of [s, withToolbar, floatAt(withToolbar, "tb"), moveTo(s, "tools", { edge: "right", at: 0 }), windowScene(300)]) for (const [id, it] of Object.entries(solve(sc).items)) expect(["row", "column"], id).toContain(it.axis);
  });
});
