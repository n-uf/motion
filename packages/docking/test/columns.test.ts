/**
 * Dynamic columns, one rail per side, column give-way by `contentMin`, riding bars, `homeFor` and `stops`; and the
 * pinned width thresholds of two document windows (`fixtures/window-*.json`), through a small adapter from their
 * intent forms (card, bar, rail) to the library's forms.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { closeItem, dockHome, foldItem, homeFor, markUsed, moveTo, openItem, readDockState, solve, stops, storeDockState, targets, type DockEdge, type DockState, type DockItem, type DockLayout } from "../src";
import type { StackForm } from "@n-uf/placement/stack";
import { byId, column as fixtureColumn, panel } from "./fixture";

/** One panel (least width 180) and a column template (160) on each side: floating, docked, docked with no rails. */
function sheetStates() {
  const tpl = { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } };
  const base = (edges: DockEdge[], floats: DockState["floats"], rails = true): DockState => ({
    stage: { x: 0, y: 0, width: 520, height: 600 },
    edges,
    items: byId([panel("p", 1)]),
    floats,
    floatKinds: ["panel"],
    columns: { left: tpl, right: tpl },
    ...(rails ? { rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } } } : {}),
    contentMin: { width: 340, height: 200 },
    gutter: 8,
  });
  const col: DockEdge = { ...fixtureColumn("left-0", "left", 0, ["p"]), column: true, accepts: ["panel"], cross: tpl.cross };
  return { floating: base([], [{ id: "p", rect: { x: 10, y: 10, width: 200, height: 200 } }]), docked: base([col], []), noRails: base([col], [], false) };
}

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): Fixture => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")) as Fixture;

// --- the adapter ---------------------------------------------------------------------------------------------------

interface RawState {
  extends?: string;
  stage?: { x: number; y: number; w: number; h: number };
  contentMin?: { width: number; height: number };
  handFold?: "bar" | "ride";
  floatKinds?: string[];
  columns?: Record<"left" | "right", { accepts: string[]; cross: { min: number; max: number; rail: number }; gap: number }>;
  rails?: Record<"left" | "right", { width: number; accepts: string[] }>;
  pad?: { start: number; end: number };
  items?: Record<string, null | { kind?: string; used?: number; forms?: { column: string[] }; from?: number }>;
  edges?: { id: string; side: "left" | "right"; ring: number; column: boolean; items: string[] }[];
}
interface Expect {
  stage: { w: number; h: number };
  layout: { columns?: Partial<Record<"left" | "right", string[][]>>; rails?: Partial<Record<"left" | "right", string[]>>; contentWidthAtLeast?: number };
}
interface Fixture {
  _numbers: { barMain?: number };
  states: Record<string, { state: RawState; expect: Expect[] | unknown[]; variants?: { name: string; state: RawState; expect: unknown }[] }>;
}

/** A raw state with its `extends` chain merged (items merge by id; `null` removes one). */
function flatten(f: Fixture, raw: RawState): RawState {
  if (!raw.extends) return raw;
  const base = flatten(f, f.states[raw.extends]!.state);
  const items = { ...base.items };
  for (const [id, v] of Object.entries(raw.items ?? {})) {
    if (v === null) delete items[id];
    else items[id] = { ...(items[id] ?? {}), ...v };
  }
  return { ...base, ...raw, items, extends: undefined };
}

/** card: an open form that grows and sets the column's width at its minimum; bar: a header `barMain` long; rail: a rail tab. */
function adapt(f: Fixture, raw0: RawState, width?: number): DockState {
  const raw = flatten(f, raw0);
  const left = raw.columns!.left;
  const barMain = f._numbers.barMain ?? 30;
  const formOf = (name: string): StackForm =>
    name === "card"
      ? { kind: "open", main: { min: 120, natural: 300, grows: true }, cross: { natural: left.cross.min, min: left.cross.min } }
      : name === "bar"
        ? { kind: "header", main: { min: barMain, natural: barMain }, cross: { natural: left.cross.min, min: 60 } }
        : { kind: "rail", main: { min: 32, natural: 32 }, cross: { natural: left.cross.rail } };
  const items: Record<string, DockItem> = {};
  for (const [id, v] of Object.entries(raw.items ?? {})) {
    if (!v) continue;
    items[id] = { id, kind: v.kind!, used: v.used!, forms: { column: v.forms!.column.map(formOf) }, ...(v.from !== undefined ? { from: v.from } : {}) };
  }
  const edges: DockEdge[] = raw.edges!.filter((e) => e.items.some((id) => items[id])).map((e) => {
    const t = raw.columns![e.side];
    return { id: e.id, side: e.side, ring: e.ring, column: e.column, items: e.items.filter((id) => items[id]), accepts: t.accepts, cross: t.cross, gap: t.gap };
  });
  return {
    stage: { x: 0, y: 0, width: width ?? raw.stage!.w, height: raw.stage!.h },
    edges,
    items,
    floats: [],
    floatKinds: raw.floatKinds ?? [],
    columns: raw.columns!,
    rails: raw.rails!,
    contentMin: raw.contentMin!,
    handFold: raw.handFold ?? "bar",
    inset: { left: raw.pad?.start ?? 0, right: raw.pad?.end ?? 0 },
    gutter: left.gap,
  };
}

/** Per side: the open columns' items (outer first), and the rail's segments. */
function shape(s: DockState, l: DockLayout) {
  const out = { columns: { left: [] as string[][], right: [] as string[][] }, rails: { left: [] as string[], right: [] as string[] } };
  for (const side of ["left", "right"] as const) {
    for (const e of s.edges.filter((x) => x.side === side).sort((a, b) => a.ring - b.ring)) {
      const el = l.edges[e.id]!;
      if (!el.folded && !el.rides && el.cross > 0) out.columns[side].push(e.items.filter((id) => !s.items[id]!.closed));
    }
    out.rails[side] = (l.rails[side]?.segments ?? []).map((x) => x.id);
  }
  return out;
}

for (const file of ["window-a.json", "window-b.json"]) {
  describe(`pinned thresholds: ${file}`, () => {
    const f = fixture(file);
    for (const [name, sc] of Object.entries(f.states)) {
      for (const ex of sc.expect as Expect[]) {
        if (!ex.layout.columns && !ex.layout.rails) continue;
        it(`${name} at ${ex.stage.w}`, () => {
          const s = adapt(f, sc.state, ex.stage.w);
          const l = solve(s);
          const got = shape(s, l);
          for (const side of ["left", "right"] as const) {
            if (ex.layout.columns?.[side]) expect(got.columns[side]).toEqual(ex.layout.columns[side]);
            if (ex.layout.rails?.[side]) expect(got.rails[side]).toEqual(ex.layout.rails[side]);
          }
          if (ex.layout.contentWidthAtLeast !== undefined) expect(l.content.width).toBeGreaterThanOrEqual(ex.layout.contentWidthAtLeast);
          // The same thresholds hold when the stage shrinks a pixel at a time from the start (`previous` carried).
          let previous = solve(adapt(f, sc.state, 1400));
          for (let w = 1400; w >= ex.stage.w; w -= 7) previous = solve(adapt(f, sc.state, w), { previous });
          const walked = shape(s, solve(s, { previous }));
          expect(walked).toEqual(got);
        });
      }
    }
  });
}

describe("hand folds (window A)", () => {
  const f = fixture("window-a.json");
  const hf = f.states["three-hand-folded"]!;

  it("a member folded by hand is a 30 px bar in place; the card takes the height it leaves", () => {
    const s = adapt(f, hf.state);
    const l = solve(s);
    expect(l.items.annotations).toMatchObject({ formKind: "header" });
    expect(l.items.annotations!.rect.height).toBe(30);
    expect(l.items.annotations!.rect.width).toBe(l.edges["left-0"]!.rect.width);
    expect(l.items.pages!.formKind).toBe("open");
    expect(l.items.pages!.rect.height).toBe(800 - 30 - 12);
  });

  it("ride: a one-panel column folded by hand is a bar over the side's first open column, at its width, taking no width", () => {
    const v = hf.variants!.find((x) => x.name === "ride")!;
    const s = adapt(f, v.state);
    const l = solve(s);
    expect(l.items.annotations).toMatchObject({ rides: "left-0", folded: "hand", formKind: "header" });
    expect(l.items.annotations!.rect.width).toBe(l.edges["left-0"]!.rect.width);
    const without = solve({ ...s, edges: s.edges.filter((e) => e.id !== "left-1") });
    expect(l.content).toEqual(without.content);
    expect(l.items.pages!.rect.y).toBe(30);
  });

  it("all folded: the column goes to the rail", () => {
    const v = hf.variants!.find((x) => x.name === "all-folded")!;
    const s = adapt(f, v.state);
    expect(shape(s, solve(s))).toMatchObject({ columns: { left: [] }, rails: { left: ["pages", "annotations"] } });
  });

  it("the rail shows a column's segments in zone order, as the column shows its items", () => {
    const v = hf.variants!.find((x) => x.name === "all-folded")!;
    const s = adapt(f, v.state);
    const pagesAtEnd: DockState = { ...s, items: { ...s.items, pages: { ...s.items.pages!, align: "end" } } };
    expect(shape(pagesAtEnd, solve(pagesAtEnd)).rails.left).toEqual(["annotations", "pages"]);
  });
});

describe("dynamic columns", () => {
  const f = fixture("window-a.json");
  const s = adapt(f, f.states.three!.state);

  it("an item moved into a new column keeps its zone (end, center) when the column takes it there", () => {
    for (const align of ["end", "center"] as const) {
      const aligned: DockState = { ...s, items: { ...s.items, annotations: { ...s.items.annotations!, align } } };
      const m = moveTo(aligned, "annotations", { kind: "column", side: "right", ring: 0 });
      expect(m.items.annotations!.align).toBe(align);
      expect(m.edges.find((e) => e.items.includes("annotations"))!.items).toEqual(["annotations"]);
      expect(solve(m).items.annotations!.zone).toBe(align);
    }
    // A start item stays without an align.
    expect(moveTo(s, "annotations", { kind: "column", side: "right", ring: 0 }).items.annotations!.align).toBeUndefined();
  });

  it("a column place makes a new column from the side's template; an emptied one is deleted and rings close up", () => {
    const m = moveTo(s, "annotations", { kind: "column", side: "right", ring: 0 });
    const right = m.edges.filter((e) => e.side === "right").sort((a, b) => a.ring - b.ring);
    expect(right.map((e) => [e.ring, e.items])).toEqual([[0, ["annotations"]], [1, ["findings"]]]);
    expect(right[0]!).toMatchObject({ column: true, accepts: ["panel"], cross: { min: 220, max: 640, rail: 32 }, gap: 12 });
    const back = moveTo(m, "findings", { kind: "column", side: "left", ring: Infinity });
    expect(back.edges.filter((e) => e.side === "right").map((e) => [e.ring, e.items])).toEqual([[0, ["annotations"]]]);
    expect(back.edges.filter((e) => e.side === "left").map((e) => [e.ring, e.items])).toEqual([[0, ["pages", "annotations"].filter((x) => x !== "annotations")], [1, ["findings"]]]);
  });

  it("a rail place docks folded: a new column holding the item folded by hand, shown in the rail", () => {
    const m = moveTo(s, "findings", { kind: "rail", side: "left", ring: 0 });
    const l = solve(m);
    expect(l.items.findings).toMatchObject({ rail: "left", folded: "hand", formKind: "rail" });
    expect(m.items.findings!.from).toBe(1);
  });

  it("refuses a side without a template and a kind its template or rail doesn't take", () => {
    expect(moveTo({ ...s, columns: {} }, "pages", { kind: "column", side: "left", ring: 0 })).toEqual({ ...s, columns: {} });
    const noRail = { ...s, rails: { left: { width: 32, accepts: [] } } };
    expect(moveTo(noRail, "pages", { kind: "rail", side: "left", ring: 0 })).toBe(noRail);
  });

  it("a use under previous flips no column fold (C23), though the ages changed which column is oldest", () => {
    const narrow = adapt(f, f.states.three!.state, 700);
    const before = solve(narrow);
    expect(shape(narrow, before).rails.left).toEqual(["pages", "annotations"]);
    const pressed = markUsed(markUsed(narrow, "pages"), "annotations");
    const after = solve(pressed, { previous: before });
    for (const id of Object.keys(before.items)) expect(after.items[id]!.rect).toEqual(before.items[id]!.rect);
    // Without previous the ages decide anew.
    expect(shape(pressed, solve(pressed)).rails.right).toEqual(["findings"]);
  });

  it("room coming back unfolds in the reverse of give-way order", () => {
    let previous = solve(adapt(f, f.states.three!.state, 500));
    expect(shape(adapt(f, f.states.three!.state, 500), previous).rails).toEqual({ left: ["pages", "annotations"], right: ["findings"] });
    previous = solve(adapt(f, f.states.three!.state, 700), { previous });
    expect(shape(adapt(f, f.states.three!.state, 700), previous).columns.right).toEqual([["findings"]]);
    previous = solve(adapt(f, f.states.three!.state, 900), { previous });
    expect(shape(adapt(f, f.states.three!.state, 900), previous).columns.left).toEqual([["pages", "annotations"]]);
  });

  it("close and open keep the item's place", () => {
    const c = closeItem(s, "annotations");
    expect(shape(c, solve(c)).columns.left).toEqual([["pages"]]);
    expect(openItem(c, "annotations").edges).toEqual(s.edges);
  });

  it("columns shrink toward their minimum before any folds", () => {
    const wide: DockState = { ...s, edges: s.edges.map((e) => ({ ...e, size: 400 })), stage: { ...s.stage, width: 1000 } };
    const l = solve(wide);
    expect(l.notes.filter((n) => n.code === "column-shrunk").length).toBeGreaterThan(0);
    expect(l.notes.some((n) => n.code === "column-folded")).toBe(false);
    expect(l.content.width).toBeGreaterThanOrEqual(320);
  });
});

describe("homeFor", () => {
  const f = fixture("window-a.json");
  const start = adapt(f, f.states.three!.state);

  it("dockHome restores the start fold too: a Move to › rail, then Dock, brings the panel back open", () => {
    const railed = moveTo(start, "findings", { kind: "rail", side: "left", ring: 0 });
    expect(solve(railed).items.findings!.formKind).toBe("rail");
    const docked = dockHome(railed, "findings", start);
    expect(docked.items.findings!.from).toBeUndefined();
    expect(solve(docked).items.findings!.formKind).toBe("open");
    // A start fold is restored as well.
    const foldedStart = foldItem(start, "annotations", true);
    expect(dockHome(foldItem(foldedStart, "annotations", false), "annotations", foldedStart).items.annotations!.from).toBe(1);
  });

  it("dockHome restores the fold of a dynamic column's only item, already at its home place", () => {
    // Findings is right-0's only item: lifting it deletes the column, so moveTo can't re-dock it; it is home already.
    const folded = foldItem(start, "findings", true);
    expect(folded.items.findings!.from).toBe(1);
    const docked = dockHome(folded, "findings", start);
    expect(docked.items.findings!.from).toBeUndefined();
    expect(docked.edges.find((e) => e.id === "right-0")!.items).toEqual(["findings"]);
  });

  it("is the place the start state gives: the same edge and neighbour, a new column at its ring, or its float", () => {
    const moved = moveTo(start, "annotations", { kind: "gap", edge: "right-0", at: 1 });
    const home = homeFor(moved, "annotations", start)!;
    expect(home).toEqual({ kind: "gap", edge: "left-0", zone: "start", at: 1 });
    expect(moveTo(moved, "annotations", home).edges).toEqual(start.edges);
    const gone = moveTo(start, "findings", { kind: "gap", edge: "left-0", at: 2 });
    expect(homeFor(gone, "findings", start)).toEqual({ kind: "column", side: "right", ring: 0 });
    const floated = { ...start, floats: [{ id: "findings", rect: { x: 10, y: 10, width: 200, height: 200 } }], edges: start.edges.filter((e) => e.id !== "right-0") };
    expect(homeFor(start, "findings", floated)).toEqual({ kind: "float", rect: { x: 10, y: 10, width: 200, height: 200 } });
    expect(homeFor(start, "nobody", start)).toBeNull();
  });

  it("a pruned column's id reused by a new column isn't home: Dock gives the item its own column at its ring again", () => {
    // Findings joins the left column (right-0 is pruned), then Pages opens a new right column: it is right-0 again.
    const joined = moveTo(start, "findings", { kind: "gap", edge: "left-0", at: 2 });
    expect(joined.edges.some((e) => e.id === "right-0")).toBe(false);
    const reused = moveTo(joined, "pages", { kind: "column", side: "right", ring: 0 });
    expect(reused.edges.find((e) => e.id === "right-0")!.items).toEqual(["pages"]);
    expect(homeFor(reused, "findings", start)).toEqual({ kind: "column", side: "right", ring: 0 });
    // Docked: Findings in its own outermost right column, Pages inside it.
    const docked = dockHome(reused, "findings", start);
    const right = docked.edges.filter((e) => e.side === "right").sort((a, b) => a.ring - b.ring);
    expect(right.map((e) => e.items)).toEqual([["findings"], ["pages"]]);
  });
});

describe("column and rail targets", () => {
  const f = fixture("window-a.json");
  const s = adapt(f, f.states.three!.state);

  it("gestures P2 and P3: a drop into another column at a position, then back above", () => {
    const t = targets(s, "annotations").find((x) => x.id === "gap:right-0:start:1")!;
    const a = t.after({ x: 0, y: 0 });
    expect(shape(a.state, a.layout).columns).toEqual({ left: [["pages"]], right: [["findings", "annotations"]] });
    expect(a.layout.items.annotations!.rect).toEqual(t.slot);
    const p1 = targets(s, "pages").find((x) => x.id === "gap:right-0:start:1")!.after({ x: 0, y: 0 });
    expect(shape(p1.state, p1.layout).columns).toEqual({ left: [["annotations"]], right: [["findings", "pages"]] });
    const p2 = targets(p1.state, "pages", { previous: p1.layout }).find((x) => x.id === "gap:left-0:start:0")!.after({ x: 0, y: 0 });
    expect(shape(p2.state, p2.layout).columns).toEqual({ left: [["pages", "annotations"]], right: [["findings"]] });
  });

  it("gesture P5: the gap beside the item's own place is its home: nothing changes, no slot", () => {
    const t = targets(s, "annotations").find((x) => x.id === "gap:left-0:start:1")!;
    expect(t.place.kind).toBe("home");
    expect(t.slot).toBeUndefined();
    expect(t.after({ x: 0, y: 0 }).state).toBe(s);
  });

  it("gesture P6: a column line outside the right column makes a new outermost column", () => {
    const t = targets(s, "annotations").find((x) => x.place.kind === "column" && x.place.side === "right" && x.place.ring === 0)!;
    const a = t.after({ x: 0, y: 0 });
    expect(shape(a.state, a.layout).columns).toEqual({ left: [["pages"]], right: [["annotations"], ["findings"]] });
    expect(a.layout.items.annotations!.rect).toEqual(t.slot);
  });

  it("gesture P9: a segment on its own side's rail changes nothing", () => {
    const narrow = adapt(f, f.states.three!.state, 700);
    const rail = targets(narrow, "annotations").filter((x) => x.id.startsWith("rail:left"));
    expect(rail.length).toBeGreaterThan(0);
    for (const t of rail) expect(t.after({ x: 0, y: 0 }).state).toBe(narrow);
  });

  it("a rail target docks folded into another side's rail", () => {
    const narrow = adapt(f, f.states.three!.state, 700);
    const t = targets(narrow, "findings").find((x) => x.id.startsWith("rail:left"))!;
    const a = t.after({ x: 0, y: 0 });
    expect(a.layout.items.findings).toMatchObject({ rail: "left" });
  });

  it("kinds deny by default (P13): no rail, column or gap target for a kind the side doesn't take", () => {
    const g: DockItem = { id: "tools", kind: "group", used: 9, forms: { column: [{ kind: "icons", main: { min: 80, natural: 80 }, cross: { natural: 28 } }] } };
    const withGroup: DockState = { ...s, items: { ...s.items, tools: g }, floats: [{ id: "tools", rect: { x: 400, y: 100, width: 100, height: 40 } }], floatKinds: ["panel", "group"] };
    expect(targets(withGroup, "tools").map((t) => t.id)).toEqual(["float:tools"]);
  });

  it("gesture P10: a floating item has no home, so a move of 40 px inside its own rect moves it", () => {
    const g: DockItem = { id: "tools", kind: "group", used: 9, forms: { column: [{ kind: "icons", main: { min: 80, natural: 80 }, cross: { natural: 28 } }] } };
    const sc: DockState = { ...s, items: { ...s.items, tools: g }, floats: [{ id: "tools", rect: { x: 400, y: 100, width: 100, height: 200 } }], floatKinds: ["panel", "group"] };
    const ts = targets(sc, "tools");
    expect(ts.some((t) => t.place.kind === "home")).toBe(false);
    const f = ts.find((t) => t.id === "float:tools")!;
    const a = f.after({ x: 450, y: 240 }, { x: 50, y: 100 });
    expect(a.layout.items.tools!.rect).toMatchObject({ x: 400, y: 140 });
    expect(a.state.floats[0]!.rect.y).toBe(140);
  });

  it("preview = result for every target, and stops come in reading order without home", () => {
    for (const w of [1120, 800, 700, 500]) {
      const sc = adapt(f, f.states.three!.state, w);
      const previous = solve(sc);
      for (const id of Object.keys(sc.items)) {
        for (const t of targets(sc, id, { previous, endReach: 24 })) {
          const a = t.after({ x: 300, y: 300 });
          expect(solve(a.state, { previous })).toEqual(a.layout);
          // A drop never leaves an item in two places or in none.
          const placed = [...a.state.edges.flatMap((e) => e.items), ...a.state.floats.map((x) => x.id)];
          expect(placed.sort()).toEqual(Object.keys(sc.items).sort());
        }
        const st = stops(sc, id, { previous });
        expect(st.some((t) => t.place.kind === "home" || t.place.kind === "none")).toBe(false);
        const sides = st.map((t) => (t.place.kind === "float" ? 9 : t.place.kind === "gap" ? (sc.edges.find((e) => e.id === (t.place as { edge: string }).edge)!.side === "left" ? 0 : 3) : (t.place as { side: string }).side === "left" ? 0 : 3));
        expect([...sides].sort((a, b) => a - b)).toEqual(sides);
      }
    }
  });
});

describe("the stored form carries the columns", () => {
  const f = fixture("window-a.json");
  const s = adapt(f, f.states.three!.state);

  it("round-trips a column the user made, its ring and size", () => {
    const m = foldItem(moveTo(s, "annotations", { kind: "column", side: "right", ring: 0 }), "pages", true);
    const sized = { ...m, edges: m.edges.map((e) => (e.items.includes("annotations") ? { ...e, size: 300 } : e)) };
    const stored = JSON.parse(JSON.stringify(storeDockState(sized)));
    expect(stored.edges.find((e: { items: string[] }) => e.items.includes("annotations"))).toMatchObject({ column: true, ring: 0, size: 300 });
    const read = readDockState(stored, s);
    expect(read.dropped).toEqual([]);
    expect(storeDockState(read.state)).toEqual(storeDockState(sized));
    expect(solve(read.state)).toEqual(solve(sized));
  });

  it("drops a stored column on a side with no template, and the item goes home", () => {
    const read = readDockState({ v: 1, edges: [{ id: "top-9", side: "top", ring: 0, items: ["pages"], column: true }], floats: [], items: {} }, s);
    expect(read.dropped).toEqual(["edge:top-9"]);
    expect(read.state.edges.find((e) => e.id === "left-0")!.items).toEqual(["pages", "annotations"]);
  });
});

describe("C29 across the whole state", () => {
  const f = fixture("window-a.json");
  const base = adapt(f, f.states.three!.state, 1120);
  // A bar between the columns with a fixed 200 px readout (its min).
  const readout: DockItem = { id: "readout", kind: "readout", used: 0, fixed: true, align: "center", forms: { row: [{ kind: "row", main: { min: 200, natural: 200 }, cross: { natural: 28 } }] } };
  const status: DockEdge = { id: "status", side: "bottom", ring: 0, span: "between", accepts: [], items: ["readout"], cross: { min: 28, max: 28, rail: 28 } };
  const s: DockState = { ...base, edges: [...base.edges, status], items: { ...base.items, readout }, contentMin: { width: 10, height: 10 } };

  it("no target squeezes a fixed item in another edge under its min", () => {
    const l = solve(s);
    expect(l.items.readout!.rect.width).toBe(200);
    for (const t of targets(s, "pages")) {
      if (t.place.kind === "home") continue;
      const a = t.after({ x: 0, y: 0 }).layout;
      expect(a.items.readout!.rect.width).toBeGreaterThanOrEqual(199.5);
    }
    // Narrow enough that a new column between would leave the bar under 200: that line is refused.
    const narrow = { ...s, stage: { ...s.stage, width: 780 } };
    const free = targets({ ...narrow, edges: narrow.edges.filter((e) => e.id !== "status") }, "pages").filter((t) => t.place.kind === "column").map((t) => t.id);
    const held = targets(narrow, "pages").filter((t) => t.place.kind === "column").map((t) => t.id);
    expect(held.length).toBeLessThan(free.length);
  });

  it("a column or rail target whose landing covers chrome is skipped", () => {
    const lines = targets(base, "annotations").filter((t) => t.place.kind === "column");
    const one = lines[0]!;
    const keepClear = [one.after({ x: 0, y: 0 }).layout.items.annotations!.rect];
    const ids = targets({ ...base, keepClear }, "annotations").map((t) => t.id);
    expect(ids).not.toContain(one.id);
  });
});

describe("a just-opened item under previous", () => {
  const f = fixture("window-a.json");

  it("takes its largest form when it fits; only the item that must give way changes form", () => {
    const three = adapt(f, f.states.three!.state, 1120);
    // A short stage (230 px): one card and a bar fit the left column, two cards (120 + 12 + 120) don't. Annotations,
    // used longer ago than Pages, starts closed.
    const short: DockState = { ...three, stage: { ...three.stage, height: 230 }, items: { ...three.items, annotations: { ...three.items.annotations!, used: 0, closed: true } } };
    const before = solve(short);
    expect(before.items.annotations).toBeUndefined();
    expect(before.items.pages!.formKind).toBe("open");
    const after = solve(openItem(short, "annotations"), { previous: before });
    // It opens in its largest form; Pages is the one that must give way, to its bar; Findings keeps its form.
    expect(after.items.annotations!.formKind).toBe("open");
    expect(after.items.pages!.formKind).toBe("header");
    expect(after.items.findings!.formKind).toBe(before.items.findings!.formKind);
    // Roomy enough for both: nothing else changes form.
    const tall: DockState = { ...short, stage: { ...short.stage, height: 800 } };
    const tallBefore = solve(tall);
    const tallAfter = solve(openItem(tall, "annotations"), { previous: tallBefore });
    expect([tallAfter.items.annotations!.formKind, tallAfter.items.pages!.formKind, tallAfter.items.findings!.formKind]).toEqual(["open", "open", "open"]);
  });

  it("opening an item in a column give-way folded weighs that column anew: it opens and the older column folds", () => {
    const pair = adapt(f, f.states.pair!.state, 700);
    const withPages: DockState = { ...pair, items: { ...pair.items, pages: { id: "pages", kind: "panel", used: 0, closed: true, forms: pair.items.annotations!.forms } }, edges: pair.edges.map((e) => (e.id === "left-0" ? { ...e, items: ["pages", "annotations"] } : e)) };
    const before = solve(withPages);
    expect(before.items.annotations!.rail).toBe("left");
    const after = solve(openItem(withPages, "pages"), { previous: before });
    expect(after.items.pages!.formKind).toBe("open");
    expect(after.items.findings!.rail).toBe("right");
  });

  it("fresh: an edge or item listed is solved without previous", () => {
    const three = adapt(f, f.states.three!.state, 700);
    const before = solve(three);
    const pressed = markUsed(markUsed(three, "pages"), "annotations");
    expect(solve(pressed, { previous: before }).items.findings!.rail).toBeUndefined();
    const fresh = solve(pressed, { previous: before, fresh: ["left-0", "right-0"] });
    expect(fresh.items.findings!.rail).toBe(solve(pressed).items.findings!.rail);
    expect(fresh.edges["left-0"]!.stack).toEqual(solve(pressed).edges["left-0"]!.stack);
  });
});

describe("columnRoom, the sheet signal", () => {
  it("gives the same answer floating and docked: the template's answer counts the least width its items need", () => {
    const { floating, docked } = sheetStates();
    const a = solve(floating);
    const b = solve(docked);
    expect(a.columnRoom).toBe(b.columnRoom);
    expect(a.columnRoom).toBe(false);
    // 340 + the panel's least width 180 (over the template's 160) + 8.
    expect(a.notes).toContainEqual({ code: "no-column-room", width: 520, need: 528 });
  });

  it("counts a docked column on a side with no rail: the template answer only applies with no column edge", () => {
    const { noRails } = sheetStates();
    const l = solve(noRails);
    expect(l.content.width).toBeLessThan(340);
    expect(l.columnRoom).toBe(false);
    expect(l.notes).toContainEqual({ code: "no-column-room", width: 520, need: 528 });
  });
});
