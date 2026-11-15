/** Toolbar shapes in a column: a group's words wrap to the column; vertical (a rail, a vertical float) means icons. */
import { describe, expect, it } from "vitest";
import { solve, targets, type Scene, type SceneItem } from "../src/scene";
import { byId, column, form, group, panel, WORDS, wrapForm } from "./scene-fixture";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
/** A left column whose open panel sets its width to `wide`, with a group of wrapping words below it. */
function scene(wide: number, height = 600, more: Partial<SceneItem> = {}): Scene {
  const p = panel("p", 2, {}, wide);
  const narrow: SceneItem = { ...p, forms: { ...p.forms, column: [{ ...p.forms.column![0]!, cross: { natural: wide, min: Math.min(wide, 40) } }, ...p.forms.column!.slice(1)] } };
  return {
    stage: r(0, 0, 1000, height),
    edges: [column("l", "left", 0, ["p", "g"], { cross: { min: 40, max: 480, rail: 30 } })],
    items: byId([narrow, group("g", 1, more), group("h", 3)]),
    floats: [{ id: "h", rect: r(500, 100, 200, 40) }],
    floatKinds: ["group"],
  };
}

describe("a group's words wrap in a column edge", () => {
  it("rows at several column widths, beside the grip (a hanging indent); the layout reports rows and the grip cell", () => {
    for (const [wide, lines, width] of [[260, [[0, 1, 2]], 144], [100, [[0, 1], [2]], 100]] as const) {
      const l = solve(scene(wide));
      expect(l.edges.l!.cross).toBe(wide);
      const h = lines.length * 28;
      expect(l.items.g).toMatchObject({ formKind: "wrap", rect: r(0, 600 - h, width, h), rows: lines, grip: r(0, 600 - h, 16, 28) });
    }
  });

  it("too narrow for two words per row (one word alone on a row that isn't the last) it takes its icons", () => {
    expect(solve(scene(60)).items.g!.formKind).toBe("icons");
    expect(solve(scene(50)).items.g!.formKind).toBe("icons");
  });

  it("an icons form with a grip reports it on top", () => {
    const s = scene(60);
    const icons = { ...s.items.g!.forms.column![1]!, grip: 12 };
    const l = solve({ ...s, items: { ...s.items, g: { ...s.items.g!, forms: { ...s.items.g!.forms, column: [s.items.g!.forms.column![0]!, icons, s.items.g!.forms.column![2]!] } } } });
    const g = l.items.g!;
    expect(g.grip).toEqual(r(g.rect.x, g.rect.y, g.rect.width, 12));
  });

  it("a size clamp reads the wrap form's cross.min (no word clipped at a size under it)", () => {
    const s = scene(260);
    const setter = { ...wrapForm, setsCross: true };
    const sized: Scene = { ...s, edges: [{ ...s.edges[0]!, items: ["g"], size: 30 }], items: { ...s.items, g: { ...s.items.g!, forms: { ...s.items.g!.forms, column: [setter, ...s.items.g!.forms.column!.slice(1)] } } } };
    // cross.min of the words is 100 (two per row beside the 16 px grip): the size clamps up to it.
    expect(solve(sized).edges.l!.cross).toBe(100);
  });

  it("an item with only wrap forms is left out of a vertical float, with a note", () => {
    const s = scene(260);
    const only: Scene = { ...s, items: { ...s.items, h: { ...s.items.h!, forms: { ...s.items.h!.forms, column: [wrapForm] } } } };
    const l = solve(only);
    expect(l.items.h).toBeUndefined();
    expect(l.notes).toContainEqual({ code: "no-vertical-form", id: "h" });
  });

  it("gives way first when it is the oldest, by its computed length", () => {
    // 100 wide: the words take 2 rows (56). Panel min 120 + 56 = 176: at 170 one item gives way, the group first.
    expect(solve(scene(100, 180)).items.g!.formKind).toBe("wrap");
    const l = solve(scene(100, 170));
    expect(l.items.g!.formKind).not.toBe("wrap");
    expect(l.items.p!.formKind).toBe("open");
    expect(l.notes.find((n) => n.code === "form-down")).toMatchObject({ edge: "l", id: "g" });
  });

  it("preview = result: a drop's slot is the wrapped rect", () => {
    const s = scene(100);
    const t = targets(s, "h").filter((x) => x.place.kind === "gap");
    expect(t.length).toBeGreaterThan(0);
    for (const x of t) {
      const a = x.after({ x: 0, y: 0 });
      expect(a.layout.items.h).toMatchObject({ formKind: "wrap", rect: x.slot });
      expect(x.slot!.height).toBe(56);
      expect(solve(a.scene)).toEqual(a.layout);
    }
  });

  it("N1: a word 1 px wider changes no other rect", () => {
    const before = solve(scene(260));
    const wider = scene(260, 600, { forms: { ...group("g", 1).forms, column: [{ ...wrapForm, wrap: { ...WORDS, widths: [41, 40, 40] } }, ...group("g", 1).forms.column!.slice(1)] } });
    const after = solve(wider, { previous: before });
    for (const id of ["p", "h"]) expect(after.items[id]!.rect).toEqual(before.items[id]!.rect);
    expect(after.items.g!.rect).toEqual({ ...before.items.g!.rect, width: before.items.g!.rect.width + 1 });
  });
});

describe("vertical means icons", () => {
  it("a vertical float shows icons; a row float keeps its words", () => {
    const l = solve(scene(260));
    expect(l.items.h).toMatchObject({ floating: true, formKind: "icons", form: 1, rect: r(500, 100, 28, 84) });
    const row = solve({ ...scene(260), floats: [{ id: "h", rect: r(500, 100, 200, 40), orient: "row" }] });
    expect(row.items.h!.formKind).toBe("row");
  });

  it("a column that is a rail shows its groups as icons", () => {
    const s = scene(260);
    const folded: Scene = { ...s, items: { ...s.items, p: { ...s.items.p!, from: 1 } } };
    const l = solve(folded);
    expect(l.edges.l!.tabs).toEqual(["p"]);
    expect(l.items.g!.formKind).toBe("icons");
  });

  it("the fixture's groups have no stacked form in a column: wrap, icons, menu", () => {
    expect(group("x", 0).forms.column!.map((f) => f.kind)).toEqual(["wrap", "icons", "menu"]);
    expect(form("icons", 84, 84, 28).kind).toBe("icons");
  });
});
