/**
 * A tile keeps its place among its own rail's tiles. A column folded whole into its side's declared rail draws its members
 * as that rail's tiles; one of them held offers the same gaps among them as the same column drawn as a rail with no `rails`
 * declared, under every declaration a host adds (`foldedColumnDrop`, `sideColumns`).
 */
import { describe, expect, it } from "vitest";
import { solve, targets, type DockDrop, type DockItem, type DockState } from "../src";

/** Four panels in a kit-shaped window: Pages and Notes on the left, `right` folded on the right (a rail's tiles). */
function window(o: { rails: boolean; folded?: boolean; one?: boolean; right?: string[] }): DockState {
  const right = o.right ?? ["findings", "annotations"];
  const card = { min: 200, max: 560, natural: 280 };
  const items: Record<string, DockItem> = {};
  for (const [i, id] of ["pages", "notes", ...right].entries())
    items[id] = {
      id,
      kind: "panel",
      used: i + 1,
      ...(right.includes(id) ? { from: 2 } : {}),
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
    stage: { x: 0, y: 0, width: 1440, height: 900 },
    edges: [
      { id: "left-0", side: "left", ring: 0, column: true, items: ["pages", "notes"], ...template },
      { id: "right-0", side: "right", ring: 0, column: true, items: right, ...template },
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

  it("an item from another column gets no gap among the rail's tiles: its places are the rail's, as they were", () => {
    for (const d of [{ folded: false, one: false }, { folded: true, one: false }]) {
      const s = window({ rails: true, ...d });
      expect(gapsOn(s, "pages", "right-0").map((t) => t.id)).toEqual(d.folded ? ["gap:right-0:start:2"] : []);
    }
  });
});
