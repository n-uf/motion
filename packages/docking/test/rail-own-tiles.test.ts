/**
 * A tile keeps its place among its own rail's tiles. A column folded whole into its side's declared rail draws its members
 * as that rail's tiles; one of them held offers the same gaps among them as the same column drawn as a rail with no `rails`
 * declared, under every declaration a host adds (`foldedColumnDrop`, `sideColumns`).
 */
import { describe, expect, it } from "vitest";
import { solve, targets, type DockDrop, type DockItem, type DockState } from "../src";

/** Four panels in a kit-shaped window: Pages and Notes on the left, `right` folded on the right (a rail's tiles). */
function window(o: { rails: boolean; folded?: boolean; one?: boolean; right?: string[]; outer?: string[]; width?: number; hand?: string[] }): DockState {
  const right = o.right ?? ["findings", "annotations"];
  // A second folded column, outside the first on the same side: its tiles follow the first column's in the one rail.
  const outer = o.outer ?? [];
  const card = { min: 200, max: 560, natural: 280 };
  const items: Record<string, DockItem> = {};
  for (const [i, id] of ["pages", "notes", ...right, ...outer].entries())
    items[id] = {
      id,
      kind: "panel",
      used: i + 1,
      ...((o.hand ?? [...right, ...outer]).includes(id) ? { from: 2 } : {}),
      forms: {
        column: [
          { kind: "open", main: { min: 120, natural: 300, grows: true }, cross: { natural: card.natural, min: card.min } },
          { kind: "header", main: { min: 34, natural: 34 }, cross: { natural: card.natural, min: 32 } },
          { kind: "rail", main: { min: 36, natural: 36 }, cross: { natural: 32 } },
        ],
      },
      floatSizes: { column: { width: card.natural, height: 440 } },
    } as DockItem;
  const template = { accepts: ["panel"], cross: { min: card.min, max: card.max, rail: 32 }, gap: 0 };
  return {
    stage: { x: 0, y: 0, width: o.width ?? 1440, height: 900 },
    edges: [
      { id: "left-0", side: "left", ring: 0, column: true, items: ["pages", "notes"], ...template },
      { id: "right-0", side: "right", ring: 0, column: true, items: right, ...template },
      ...(outer.length ? [{ id: "right-1", side: "right" as const, ring: 1, column: true, items: outer, ...template }] : []),
    ],
    items,
    floats: [],
    floatKinds: ["panel"],
    columns: { left: template, right: template },
    ...(o.rails ? { rails: { left: { width: 32, accepts: ["panel"] }, right: { width: 32, accepts: ["panel"] } } } : {}),
    contentMin: { width: 320, height: 240 },
    ...(o.one ? { sideColumns: "one" as const } : {}),
    ...(o.folded ? { foldedColumnDrop: "end" as const } : {}),
    gutter: 0,
  } as DockState;
}

/** The held item's gaps among `edge`'s members (its own place is `home`, not a gap). */
const gapsOn = (s: DockState, id: string, edge: string): DockDrop[] => targets(s, id).filter((t) => t.place.kind === "gap" && t.place.edge === edge);
const ids = (ts: readonly DockDrop[]): string[] => ts.map((t) => t.id).sort();
const homes = (s: DockState, id: string): number => targets(s, id).filter((t) => t.place.kind === "home" && !t.id.startsWith("home:")).length;

/** The docked targets whose hit holds the point `p` (the float's whole plane aside). */
const under = (s: DockState, held: string, p: { x: number; y: number }): DockDrop[] =>
  targets(s, held).filter((t) => t.place.kind !== "float").filter((t) => (t.hits ?? [t.hit]).some((h) => p.x >= h.x && p.x < h.x + h.width && p.y >= h.y && p.y < h.y + h.height));
const mid = (r: { x: number; y: number; width: number; height: number }) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const DECLARED = [
  { name: "rails", folded: false, one: false },
  { name: "rails and foldedColumnDrop", folded: true, one: false },
  { name: "rails and sideColumns", folded: false, one: true },
  { name: "rails, foldedColumnDrop and sideColumns", folded: true, one: true },
];

describe("a tile among its own rail's tiles", () => {
  it("the declared rail draws the column's members as its tiles (the state the gaps are asked in)", () => {
    const l = solve(window({ rails: true }));
    expect(l.edges["right-0"]!.folded).toBeTruthy();
    expect(l.rails.right!.segments.map((s) => s.id)).toEqual(["findings", "annotations"]);
  });

  for (const d of DECLARED) {
    it(`offers the gaps the column drawn as a rail offers, under ${d.name}`, () => {
      const drawn = window({ rails: false, folded: d.folded, one: d.one });
      const railed = window({ rails: true, folded: d.folded, one: d.one });
      for (const held of ["findings", "annotations"]) {
        const want = ids(gapsOn(drawn, held, "right-0"));
        expect(want.length, `${held} drawn as a rail`).toBeGreaterThan(0);
        expect(ids(gapsOn(railed, held, "right-0")), `${held} in the declared rail`).toEqual(want);
        // Its own place stays one place: home (the rail stop, as before).
        expect(homes(railed, held), held).toBe(1);
      }
    });
  }

  it("a drop before the first tile moves the held one there, still a tile in the rail", () => {
    const s = window({ rails: true, folded: true, one: true });
    const first = gapsOn(s, "annotations", "right-0").find((t) => t.place.kind === "gap" && t.place.at === 0)!;
    expect(first).toBeDefined();
    const a = first.after({ x: 0, y: 0 });
    expect(a.state.edges.find((e) => e.id === "right-0")!.items).toEqual(["annotations", "findings"]);
    expect(a.state.items.annotations!.from).toBe(2);
    expect(a.layout.items.annotations).toMatchObject({ rail: "right", formKind: "rail", edge: "right-0" });
    expect(a.layout.rails.right!.segments.map((x) => x.id)).toEqual(["annotations", "findings"]);
  });

  it("the gaps of a longer rail: one before each tile and one after the last, but the tile's own place", () => {
    const s = window({ rails: true, right: ["findings", "annotations", "marks"] });
    const drawn = window({ rails: false, right: ["findings", "annotations", "marks"] });
    for (const held of ["findings", "annotations", "marks"]) expect(ids(gapsOn(s, held, "right-0")), held).toEqual(ids(gapsOn(drawn, held, "right-0")));
    expect(ids(gapsOn(s, "annotations", "right-0"))).toEqual(["gap:right-0:start:0", "gap:right-0:start:2"]);
    const last = gapsOn(s, "findings", "right-0").find((t) => t.place.kind === "gap" && t.place.at === 2)!;
    expect(last.after({ x: 0, y: 0 }).state.edges.find((e) => e.id === "right-0")!.items).toEqual(["annotations", "marks", "findings"]);
  });

  it("each gap lies along the rail, at its tile's edge", () => {
    const s = window({ rails: true });
    const rail = solve(s).rails.right!.rect;
    for (const t of gapsOn(s, "annotations", "right-0")) {
      expect(t.hit.y).toBeGreaterThanOrEqual(rail.y - 1);
      expect(t.hit.y + t.hit.height).toBeLessThanOrEqual(rail.y + rail.height + 1);
    }
  });

  describe("two folded columns in one rail: the gaps reach only over the held tile's own column", () => {
    const two = (): DockState => window({ rails: true, outer: ["p1", "p2"] });
    it("the rail draws the first column's tiles, then the second's", () => {
      const l = solve(two());
      expect(l.rails.right!.segments.map((s) => [s.id, s.edge])).toEqual([["findings", "right-0"], ["annotations", "right-0"], ["p1", "right-1"], ["p2", "right-1"]]);
    });

    for (const held of ["p1", "p2"]) {
      it(`${held} held: over the other column's tiles the place is home, over its own column's tiles its gaps`, () => {
        const s = two();
        const l = solve(s);
        for (const other of ["findings", "annotations"]) {
          const over = under(s, held, mid(l.items[other]!.rect));
          expect(over.map((t) => [t.id, t.place.kind]), `${held} over ${other}`).toEqual([[expect.stringMatching(/^rail:right:/), "home"]]);
        }
        // Its own column's run: every place there is one of its gaps or home; none lies outside the run.
        const run = ["p1", "p2"].map((id) => l.items[id]!.rect);
        const [y0, y1] = [Math.min(...run.map((r) => r.y)), Math.max(...run.map((r) => r.y + r.height))];
        for (const t of gapsOn(s, held, "right-1")) for (const h of t.hits ?? [t.hit]) expect(h.y >= y0 - 1e-6 && h.y + h.height <= y1 + 1e-6, `${t.id} ${JSON.stringify(h)} in ${y0}..${y1}`).toBe(true);
      });
    }

    it("the gaps among the held tile's own column still move it", () => {
      const s = two();
      const t = gapsOn(s, "p2", "right-1").find((x) => x.place.kind === "gap" && x.place.at === 0)!;
      expect(t).toBeDefined();
      const a = t.after({ x: 0, y: 0 });
      expect(a.state.edges.find((e) => e.id === "right-1")!.items).toEqual(["p2", "p1"]);
      expect(a.layout.items.p2).toMatchObject({ rail: "right", formKind: "rail" });
    });
  });

  it("the held tile's own interval is home's, so the next tile's leading half is home's, as in a column drawn as a rail", () => {
    // Annotations held between Findings and Marks: the gap after Marks starts at Marks' middle (Marks' leading half is
    // home's), not at the end of Annotations, whether the column is drawn as a rail or is the declared rail's.
    for (const rails of [false, true]) {
      const s = window({ rails, right: ["findings", "annotations", "marks"] });
      const marks = solve(s).items.marks!.rect;
      const gap = gapsOn(s, "annotations", "right-0").find((t) => t.place.kind === "gap" && t.place.at === 2)!;
      expect(gap.hit.y, rails ? "declared rail" : "drawn as a rail").toBeCloseTo(marks.y + marks.height / 2, 3);
    }
  });

  it("the rail's home lies beside the held tile, within the rail; its after() is the layout as it is; no point of the run is left over", () => {
    const s = window({ rails: true, right: ["findings", "annotations", "marks"] });
    const l = solve(s);
    const rail = l.rails.right!.rect;
    const own = l.items.annotations!.rect;
    const ts = targets(s, "annotations");
    const homeRail = ts.filter((t) => t.place.kind === "home" && t.id.startsWith("rail:right:"));
    expect(homeRail).toHaveLength(1);
    const t = homeRail[0]!;
    // It keeps the rail stop's precedence (1), though a column's gaps (2) lie beside its pieces.
    expect(t.priority).toBe(1);
    // Home is a place: nothing changes, and the layout is the one on the screen.
    const a = t.after({ x: 0, y: 0 });
    expect(a.state).toBe(s);
    expect(a.layout).toEqual(l);
    expect(ts.find((x) => x.id === "home:annotations")!.after({ x: 0, y: 0 }).state).toBe(s);
    // Beside the held tile (the tile itself is `home:annotations`'s), and in the rail.
    for (const h of t.hits ?? [t.hit]) {
      expect(h.x >= rail.x - 1e-6 && h.x + h.width <= rail.x + rail.width + 1e-6, `${JSON.stringify(h)} in the rail ${JSON.stringify(rail)}`).toBe(true);
      expect(h.y + h.height <= own.y + 1e-6 || h.y >= own.y + own.height - 1e-6, `${JSON.stringify(h)} beside ${JSON.stringify(own)}`).toBe(true);
    }
    expect(ts.find((x) => x.id === "home:annotations")!.hit).toEqual(own);
    // Every point down the rail's tiles belongs to exactly one place: the held tile's own, a gap among its column's tiles, or
    // the rail's home.
    const end = Math.max(...l.rails.right!.segments.map((x) => x.rect.y + x.rect.height));
    for (let y = rail.y + 0.5; y < end; y += 1) expect(under(s, "annotations", { x: rail.x + rail.width / 2, y }).map((x) => x.id), `y ${y}`).toHaveLength(1);
  });

  it("in a window too narrow for the tile to stay folded, no gap of its column is offered where the drop would open it", () => {
    // Two columns on the left (the inner one empty), one riding bar and one open panel in the outer; both sides' columns
    // fold by width. Lifting `a` lets the outer column's `b` ride; a drop after `b` opens `a` there, so it is no place.
    const form = { column: [
      { kind: "open", main: { min: 120, natural: 240, grows: true }, cross: { natural: 280, min: 180 } },
      { kind: "header", main: { min: 28, natural: 28 }, cross: { natural: 280, min: 60 } },
      { kind: "rail", main: { min: 28, natural: 28 }, cross: { natural: 30 } },
    ] };
    const panel = (id: string, used: number, from?: number): DockItem => ({ id, kind: "panel", used, forms: form, ...(from ? { from } : {}) }) as DockItem;
    const tpl = { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } };
    const s = {
      stage: { x: 0, y: 0, width: 615, height: 626 },
      edges: [
        { id: "left-0", side: "left", ring: 0, column: true, items: [], ...tpl },
        { id: "left-1", side: "left", ring: 1, column: true, items: ["a", "b"], ...tpl },
        { id: "right-0", side: "right", ring: 0, column: true, items: ["c", "d"], ...tpl },
      ],
      items: { a: panel("a", 0), b: panel("b", 23, 1), c: panel("c", 36), d: panel("d", 44) },
      floats: [],
      floatKinds: ["panel"],
      columns: { left: tpl, right: tpl },
      rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
      contentMin: { width: 336, height: 200 },
      handFold: "ride",
      gutter: 0,
    } as DockState;
    const l = solve(s);
    expect(l.items.a).toMatchObject({ rail: "left", edge: "left-1" });
    const own = gapsOn(s, "a", "left-1");
    // Every gap offered keeps the tile a tile of the rail.
    for (const t of own) expect(t.after({ x: 0, y: 0 }).layout.items.a, t.id).toMatchObject({ rail: "left", edge: "left-1" });
    // The drop after `b` opens it (it is no longer folded by hand): not offered.
    const after = targets(s, "a").find((t) => t.id === "gap:left-1:start:1");
    expect(after === undefined || after.place.kind === "home").toBe(true);
  });

  it("a column with a tray of toolbars (its end zone): the places of its run lie in the rail, never over the content beside it", () => {
    // Narrow: only the left column fits open; the right one (the least used) folds into the rail by width, with no hand
    // fold, its tray's toolbar a tile of it too.
    const base = window({ rails: true, width: 700, hand: [], right: ["annotations"] });
    const tools = { id: "tools", kind: "group", used: 43, forms: { column: [{ kind: "icons", main: { min: 84, natural: 84 }, cross: { natural: 28 } }] } } as DockItem;
    const s: DockState = {
      ...base,
      items: { ...base.items, tools, annotations: { ...base.items.annotations!, used: 22 }, pages: { ...base.items.pages!, used: 47 }, notes: { ...base.items.notes!, used: 48 } },
      edges: base.edges.map((e) => (e.id === "right-0" ? { ...e, accepts: ["panel", "group"], zoneAccepts: { start: ["panel"], end: ["group"] }, items: [...e.items, "tools"] } : e)),
      floatKinds: ["panel", "group"],
    };
    expect(solve(s).rails.right?.segments.map((x) => x.id)).toEqual(["annotations", "tools"]);
    const rail = solve(s).rails.right!.rect;
    for (const held of ["annotations"]) {
      for (const t of targets(s, held).filter((x) => x.place.kind !== "float" && x.id.startsWith("rail:right:"))) {
        for (const h of t.hits ?? [t.hit]) expect(h.x >= rail.x - 1e-6 && h.x + h.width <= rail.x + rail.width + 1e-6 && h.y >= rail.y - 1e-6 && h.y + h.height <= rail.y + rail.height + 1e-6, `${held} ${t.id} ${JSON.stringify(h)} in the rail ${JSON.stringify(rail)}`).toBe(true);
      }
    }
  });

  it("an item from another column gets no gap among the rail's tiles: its places are the rail's, as they were", () => {
    for (const d of [{ folded: false, one: false }, { folded: true, one: false }]) {
      const s = window({ rails: true, ...d });
      expect(gapsOn(s, "pages", "right-0").map((t) => t.id)).toEqual(d.folded ? ["gap:right-0:start:2"] : []);
    }
  });
});
