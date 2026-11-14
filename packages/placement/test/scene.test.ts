import { describe, expect, it } from "vitest";
import { solve, use, type Scene, type SceneItem } from "../src/scene";
import { bar, byId, column, controls, form, group, panel, readout, title, windowScene } from "./scene-fixture";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const codes = (s: Scene) => solve(s).notes.map((n) => n.code);

describe("the window fixture", () => {
  const l = solve(windowScene());

  it("cuts the stage ring by ring: full bars, then columns, then bars between them", () => {
    expect(l.edges.titlebar!.rect).toEqual(r(0, 0, 1200, 32));
    expect(l.edges.toolbar!.rect).toEqual(r(0, 32, 1200, 36));
    expect(l.edges.left!.rect).toEqual(r(0, 68, 260, 732));
    expect(l.edges.right!.rect).toEqual(r(940, 68, 260, 732));
    expect(l.edges.status!.rect).toEqual(r(260, 772, 680, 28));
    expect(l.content).toEqual(r(260, 68, 680, 704));
    expect(l.notes).toEqual([]);
  });

  it("draws the fixed title growing to the fixed controls at the end of the title bar", () => {
    expect(l.items.title!.rect).toEqual(r(0, 0, 1116, 32));
    expect(l.items.controls!.rect).toEqual(r(1116, 0, 84, 32));
    expect(l.items.title!.fixed).toBe(true);
  });

  it("packs zones: start items from the start, end items from the end, a center item on the edge's middle", () => {
    expect(l.items.views!.rect.x).toBe(8);
    expect(l.items.tools!.rect.x).toBe(212);
    expect(l.items.zoom!.rect.x + l.items.zoom!.rect.width).toBe(1192);
    expect(l.items.readout!.rect.x + 36).toBe(600);
    expect(l.items.search!.rect.x + l.items.search!.rect.width).toBe(932);
  });

  it("a group in a column takes its own width (C28), an open panel spans it", () => {
    expect(l.items.findings!.rect.width).toBe(260);
    expect(l.items.marks!.rect).toEqual(r(940, 704, 84, 96));
  });

  it("a float lies where it is, clear of everything docked", () => {
    expect(l.items.notes).toMatchObject({ rect: r(500, 200, 280, 320), floating: true, formKind: "open" });
    expect(l.floats).toEqual(["notes"]);
  });
});

describe("cutting the stage", () => {
  const base = (edges: Scene["edges"], items: SceneItem[]): Scene => ({ stage: r(0, 0, 1000, 600), edges, items: byId(items), floats: [], floatKinds: [] });

  it("an overlay edge lies over the content and leaves it as it is", () => {
    const s = base([column("left", "left", 0, ["a"], { mode: "overlay" }), bar("top", "top", 0, ["g"])], [panel("a", 1), group("g", 2)]);
    const l = solve(s);
    expect(l.content).toEqual(r(0, 36, 1000, 564));
    expect(l.edges.left!.rect).toEqual(r(0, 36, 260, 564));
  });

  it("a between bar runs between the columns; a full one across the stage", () => {
    const s = base([column("left", "left", 0, ["a"]), bar("full", "bottom", 0, ["g"]), bar("mid", "bottom", 1, ["h"], { span: "between" })], [panel("a", 1), group("g", 2), group("h", 3)]);
    const l = solve(s);
    expect(l.edges.full!.rect).toEqual(r(0, 564, 1000, 36));
    expect(l.edges.mid!.rect).toEqual(r(260, 528, 740, 36));
    expect(l.edges.left!.rect).toEqual(r(0, 0, 260, 564));
  });

  it("an edge with nothing in it takes no room", () => {
    const s = base([column("left", "left", 0, []), bar("top", "top", 0, [])], []);
    const l = solve(s);
    expect(l.content).toEqual(r(0, 0, 1000, 600));
    expect(l.edges.left!.cross).toBe(0);
  });

  it("the stage's offset carries into every rect", () => {
    const s: Scene = { ...windowScene(), stage: r(100, 50, 1200, 800) };
    expect(solve(s).edges.titlebar!.rect).toEqual(r(100, 50, 1200, 32));
    expect(solve(s).items.pages!.rect.x).toBe(100);
  });

  it("an id an edge lists twice, or one the items lack, is noted and left out", () => {
    const s = base([column("left", "left", 0, ["a", "x"]), column("right", "right", 0, ["a"])], [panel("a", 1)]);
    expect(codes(s)).toEqual(["unknown-item", "twice"]);
    expect(solve(s).items.a!.edge).toBe("left");
  });
});

describe("fixed items", () => {
  const titled = (width: number): Scene => ({
    stage: r(0, 0, width, 400),
    edges: [{ ...bar("t", "top", 0, ["title", "a", "b", "controls"]), accepts: ["group"] }],
    items: byId([title(), controls(), group("a", 1), group("b", 2)]),
    floats: [],
    floatKinds: [],
  });

  it("shrink toward their min and never change form; the others give way around them", () => {
    const l = solve(titled(500));
    expect(l.items.title!.form).toBe(0);
    expect(l.items.controls!.rect.width).toBe(84);
    expect(l.items.title!.rect.width).toBeGreaterThanOrEqual(80);
    expect(l.items.a!.formKind).toBe("icons");
  });

  it("a stage too short for them overflows instead of folding them", () => {
    const l = solve(titled(150));
    expect(l.items.title!.formKind).toBe("row");
    expect(l.items.controls!.formKind).toBe("row");
    expect(l.notes.some((n) => n.code === "overflow")).toBe(true);
  });
});

describe("columns", () => {
  const one = (items: SceneItem[], more: Partial<Scene["edges"][number]> = {}): Scene => ({
    stage: r(0, 0, 1000, 600),
    edges: [column("left", "left", 0, items.map((i) => i.id), more)],
    items: byId(items),
    floats: [],
    floatKinds: [],
  });

  it("a column where nothing sets the width is a rail: its panels are rail tabs", () => {
    const l = solve(one([panel("a", 1, { from: 1 }), panel("b", 2, { from: 1 }), group("g", 3)]));
    expect(l.edges.left!.cross).toBe(30);
    expect(l.edges.left!.tabs).toEqual(["a", "b"]);
    expect(l.items.a).toMatchObject({ formKind: "rail", tab: true });
    expect(l.items.g!.formKind).toBe("icons");
  });

  it("with railShowsClosed, closed items are rail tabs too, marked closed", () => {
    const l = solve(one([panel("a", 1, { from: 1 }), panel("b", 2, { closed: true })], { railShowsClosed: true }));
    expect(l.edges.left!.tabs).toEqual(["a", "b"]);
    expect(l.items.b).toMatchObject({ closed: true, tab: true });
    const plain = solve(one([panel("a", 1, { from: 1 }), panel("b", 2, { closed: true })]));
    expect(plain.items.b).toBeUndefined();
  });

  it("a closed item takes no room", () => {
    const l = solve(one([panel("a", 1), panel("b", 2, { closed: true })]));
    expect(l.items.a!.rect.height).toBe(600);
  });

  it("the user's size is clamped to the widest open setter's cross.min and the column's max", () => {
    expect(solve(one([panel("a", 1)], { size: 340 })).edges.left!.cross).toBe(340);
    expect(solve(one([panel("a", 1)], { size: 100 })).edges.left!.cross).toBe(180);
    expect(solve(one([panel("a", 1)], { size: 900 })).edges.left!.cross).toBe(480);
    // A rail ignores it.
    expect(solve(one([panel("a", 1, { from: 1 })], { size: 340 })).edges.left!.cross).toBe(30);
  });

  it("open panels share the height through grows", () => {
    const l = solve(one([panel("a", 1), panel("b", 2)]));
    expect(l.items.a!.rect.height).toBe(300);
    expect(l.items.b!.rect).toEqual(r(0, 300, 260, 300));
  });
});

describe("give-way", () => {
  it("a kept item with no smaller form never folds: it overflows", () => {
    const solid: SceneItem = { id: "k", kind: "group", used: 0, kept: true, forms: { row: [form("row", 400, 400, 28)] } };
    const s: Scene = { stage: r(0, 0, 300, 300), edges: [bar("t", "top", 0, ["k"])], items: byId([solid]), floats: [], floatKinds: [] };
    const l = solve(s);
    expect(l.items.k!.form).toBe(0);
    expect(l.notes.map((n) => n.code)).toEqual(["overflow"]);
  });

  it("a press (use) under previous changes no rect (C23)", () => {
    const s: Scene = { ...windowScene(860, 500) };
    const before = solve(s);
    const after = solve(use(s, "views"), { previous: before });
    for (const id of Object.keys(before.items)) expect(after.items[id]!.rect).toEqual(before.items[id]!.rect);
  });

  it("under previous, a form whose kind changed starts over and a size change keeps its place (N1)", () => {
    const s = windowScene(700, 600);
    const before = solve(s);
    const grown = { ...s, items: { ...s.items, tools: { ...s.items.tools!, forms: { ...s.items.tools!.forms, row: [form("row", 182, 202, 28), ...s.items.tools!.forms.row!.slice(1)] } } } };
    const kept = solve(grown, { previous: before });
    expect(kept.items.tools!.form).toBe(before.items.tools!.form);
    const swapped = { ...s, items: { ...s.items, tools: { ...s.items.tools!, forms: { ...s.items.tools!.forms, row: [form("stacked", 60, 60, 28), form("menu", 0, 0, 0)] } } } };
    expect(solve(swapped, { previous: before }).items.tools!.formKind).toBe("stacked");
  });
});

describe("floats", () => {
  const s0 = windowScene();
  const at = (f: Scene["floats"][number], more: Partial<Scene> = {}): Scene => ({ ...s0, floats: [f], ...more });

  it("are kept inside the stage", () => {
    const l = solve(at({ id: "notes", rect: r(1100, 700, 280, 320) }));
    expect(l.items.notes!.rect.x + 280).toBeLessThanOrEqual(1200);
    expect(l.notes.map((n) => n.code)).toContain("float-clamped");
  });

  it("move clear of bars, fixed items, docked items and chrome (C27)", () => {
    const l = solve(at({ id: "notes", rect: r(500, 10, 200, 100) }, { chrome: [r(260, 68, 680, 40)] }));
    expect(l.items.notes!.rect.y).toBeGreaterThanOrEqual(108);
    expect(l.notes.map((n) => n.code)).toContain("float-moved");
  });

  it("an anchored float follows the content", () => {
    const f = { id: "notes", rect: r(0, 0, 200, 100), anchor: "content-top-right" as const };
    expect(solve(at(f)).items.notes!.rect).toEqual(r(740, 68, 200, 100));
    expect(solve({ ...at(f), stage: r(0, 0, 1000, 800) }).items.notes!.rect).toEqual(r(540, 68, 200, 100));
  });

  it("folded by hand, a float is its bar; with orient row it uses its row forms", () => {
    const folded = { ...s0, items: { ...s0.items, notes: { ...s0.items.notes!, from: 1 } } };
    expect(solve(at({ id: "notes", rect: r(500, 200, 280, 320) }, { items: folded.items })).items.notes).toMatchObject({ rect: r(500, 200, 280, 28), formKind: "header" });
    const row = solve(at({ id: "views", rect: r(500, 200, 200, 40), orient: "row" }, { edges: s0.edges.map((e) => ({ ...e, items: e.items.filter((x) => x !== "views") })) }));
    expect(row.items.views!.formKind).toBe("row");
  });

  it("a closed float keeps its rect but isn't drawn", () => {
    const closed = { ...s0, items: { ...s0.items, notes: { ...s0.items.notes!, closed: true } } };
    expect(solve(closed).items.notes).toBeUndefined();
  });
});

describe("speed", () => {
  it("a window of 10 edges and 30 items solves in well under 1 ms (median)", () => {
    const items: SceneItem[] = [title(), controls(), readout()];
    for (let i = 0; i < 27; i++) items.push(i % 3 === 0 ? panel(`p${i}`, i) : group(`g${i}`, i));
    const ids = items.slice(3).map((it) => it.id);
    const panels = ids.filter((id) => id.startsWith("p"));
    const groups = ids.filter((id) => id.startsWith("g"));
    const s: Scene = {
      stage: r(0, 0, 1400, 900),
      edges: [
        { id: "titlebar", side: "top", ring: 0, accepts: [], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } },
        bar("t1", "top", 1, groups.slice(0, 4)),
        bar("t2", "top", 2, groups.slice(4, 7)),
        bar("b1", "bottom", 0, ["readout", ...groups.slice(7, 10)]),
        bar("b2", "bottom", 1, groups.slice(10, 12), { span: "between" }),
        column("l1", "left", 0, panels.slice(0, 3)),
        column("l2", "left", 1, panels.slice(3, 5)),
        column("r1", "right", 0, panels.slice(5, 7)),
        column("r2", "right", 1, [...panels.slice(7), ...groups.slice(12, 14)]),
        bar("t3", "top", 3, groups.slice(14), { span: "between", mode: "overlay" }),
      ],
      items: byId(items),
      floats: [],
      floatKinds: [],
    };
    let previous = solve(s);
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      previous = solve({ ...s, stage: r(0, 0, 1400 - (i % 40), 900) }, { previous });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[100]!).toBeLessThan(1);
  });
});
