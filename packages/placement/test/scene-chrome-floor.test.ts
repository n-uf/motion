/**
 * `contentMin.chromeWidth`: a lower floor for chrome. Toolbar rails and side toolbar bars may narrow the content down to
 * it while the panel columns keep their width and move aside; below it a column shrinks as without it.
 */
import { describe, expect, it } from "vitest";
import { solve, type Edge, type Scene } from "../src/scene";
import { byId, column, group, panel } from "./scene-fixture";

const COL = { accepts: ["panel"], cross: { min: 180, max: 480, rail: 30 } };
/** A toolbar rail at a window edge, 30 px wide, holding `items`. */
const rail = (id: string, side: "left" | "right", items: string[]): Edge => ({ id, side, ring: 0, accepts: ["group"], items, cross: { min: 30, max: 30, rail: 30 }, compact: true });
/** A further toolbar edge on the left, `w` px wide. */
const sideBar = (w: number): Edge => ({ id: "bar-left", side: "left", ring: 2, accepts: ["group"], items: ["g-bar"], cross: { min: w, max: w, rail: w } });

/**
 * Kit-like: an 870 px window, one panel column per side (263 px each), so the content is 344 (320 and 24 of padding),
 * exactly `contentMin.width`. `rails` adds toolbar rails at the window's edges: both leave 284 (260 and the padding),
 * the chrome floor `F`.
 */
const F = 284;
function kit(rails: readonly ("left" | "right")[], floor?: number, extra?: Edge, width = 870): Scene {
  const edges: Edge[] = [
    column("left-0", "left", 1, ["p"], { column: true, accepts: ["panel"] }),
    column("right-0", "right", 1, ["q"], { column: true, accepts: ["panel"] }),
    ...rails.map((s) => rail(`tools-${s}`, s, [`g-${s}`])),
    ...(extra ? [extra] : []),
  ];
  return {
    stage: { x: 0, y: 0, width, height: 700 },
    edges,
    items: byId([panel("p", 1, {}, 263), panel("q", 2, {}, 263), group("g-left", 3), group("g-right", 4), group("g-bar", 5)]),
    floats: [],
    floatKinds: ["panel", "group"],
    columns: { left: COL, right: COL },
    rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
    contentMin: { width: 344, height: 200, ...(floor !== undefined ? { chromeWidth: floor } : {}) },
  };
}

const widths = (s: Scene) => {
  const l = solve(s);
  return { left: l.edges["left-0"]!.rect.width, right: l.edges["right-0"]!.rect.width, content: l.content.width, l };
};

describe("contentMin.chromeWidth", () => {
  it("the kit-like window lays out at the panels' minimum: content 344, columns 263", () => {
    expect(widths(kit([], F))).toMatchObject({ left: 263, right: 263, content: 344 });
  });

  for (const sides of [["left"], ["right"], ["left", "right"]] as const) {
    it(`a toolbar rail at ${sides.join(" and ")} moves the columns aside at their width and narrows the content, quietly`, () => {
      const w = widths(kit(sides, F));
      expect([w.left, w.right]).toEqual([263, 263]);
      expect(w.content).toBe(344 - 30 * sides.length);
      expect(w.l.notes.some((n) => n.code === "column-shrunk" || n.code === "column-folded")).toBe(false);
      // The columns moved: each lies beside its rail, not at the window's edge.
      if ((sides as readonly string[]).includes("left")) expect(w.l.edges["left-0"]!.rect.x).toBe(30);
      // Within the allowance a toolbar rail never flips a host to its narrow layout.
      expect(w.l.notes.some((n) => n.code === "content-narrow" || n.code === "no-column-room")).toBe(false);
      expect(w.l.columnRoom).toBe(true);
      // Without the floor, the same rail shrinks a column, as before.
      const old = widths(kit(sides));
      expect(old.content).toBe(344);
      expect(old.left + old.right).toBe(526 - 30 * sides.length);
    });
  }

  it("a further rail-sized cost, below the floor, shrinks a column as before; the content stays at the floor, quietly", () => {
    const w = widths(kit(["left", "right"], F, sideBar(30)));
    expect(w.l.edges["bar-left"]!.rect.width).toBe(30);
    expect(w.content).toBe(F);
    expect(w.left + w.right).toBe(526 - 30);
    expect(w.l.notes.some((n) => n.code === "column-shrunk")).toBe(true);
    expect(w.l.notes.some((n) => n.code === "content-narrow")).toBe(false);
    expect(w.l.columnRoom).toBe(true);
  });

  /** The kit scene with columns that never give way (no side rails to fold into), so the content takes what is left. */
  const fixedColumns = (s: Scene): Scene => {
    const { rails: _r, ...rest } = s;
    return rest;
  };

  it("content-narrow fires below the floor, and its min is the floor", () => {
    const w = widths(fixedColumns(kit(["left", "right"], F, sideBar(30))));
    expect([w.left, w.right]).toEqual([263, 263]);
    expect(w.content).toBe(F - 30);
    expect(w.l.notes.find((n) => n.code === "content-narrow")).toMatchObject({ width: F - 30, min: F });
  });

  it("content-narrow fires for the columns' own need, with no chrome at all, at contentMin.width", () => {
    const w = widths(fixedColumns(kit([], F, undefined, 840)));
    expect(w.content).toBe(314);
    expect(w.l.notes.find((n) => n.code === "content-narrow")).toMatchObject({ width: 314, min: 344 });
  });

  it("a floor above the panels' minimum, or one that isn't a number, changes nothing", () => {
    const base = JSON.stringify(solve(kit(["left"])));
    expect(JSON.stringify(solve({ ...kit(["left"]), contentMin: { width: 344, height: 200 } }))).toBe(base);
    for (const f of [400, Number.NaN]) {
      const s = kit(["left"], f);
      expect(JSON.stringify(solve(s))).toBe(base);
    }
  });

  it("at narrow widths, a rail or a side bar within the allowance doesn't flip columnRoom: the columns are as without it", () => {
    // At 540 px both columns are folded and columnRoom is true; a 30 px rail or bar turned it false before the allowance.
    for (const width of [560, 540]) {
      const plain = solve(kit([], F, undefined, width));
      expect(plain.columnRoom, `${width}`).toBe(true);
      for (const s of [kit(["left"], F, undefined, width), kit([], F, sideBar(30), width)]) {
        const l = solve(s);
        expect(l.columnRoom, `${width}`).toBe(true);
        expect(l.notes.some((n) => n.code === "no-column-room"), `${width}`).toBe(false);
        expect(l.content.width, `${width}`).toBe(plain.content.width - 30);
        for (const id of ["left-0", "right-0"]) expect(l.edges[id]?.rect.width, `${width} ${id}`).toBe(plain.edges[id]?.rect.width);
      }
    }
  });

  it("a hidden rail, or one lending its items through showIn, takes no width and no allowance", () => {
    const deck: Edge = { id: "deck", side: "top", ring: 0, accepts: ["group"], items: [], cross: { min: 36, max: 36, rail: 36 } };
    for (const lend of [false, true]) {
      const s = kit(["left", "right"], F, deck);
      const hidden: Scene = { ...s, edges: s.edges.map((e) => (e.id === "tools-left" ? { ...e, hidden: true, ...(lend ? { showIn: "deck" } : {}) } : e)) };
      const w = widths(hidden);
      expect([w.left, w.right]).toEqual([263, 263]);
      expect(w.content).toBe(344 - 30);
      expect(w.l.notes.some((n) => n.code === "content-narrow")).toBe(false);
    }
  });

  it("with chrome, a column folds into its declared rail as before: the fold's rail is the panels' cost, not chrome's", () => {
    const w = widths(kit(["left", "right"], F, undefined, 600));
    expect(w.l.notes.some((n) => n.code === "column-folded")).toBe(true);
    // The rails (60), a folded column's rail (30) and the open column leave the content at the floor.
    expect(w.content).toBe(F);
    expect(w.l.notes.some((n) => n.code === "content-narrow")).toBe(false);
  });

  it("an outsideInset side bar is chrome with no gutter after it", () => {
    // An 8 px gutter after each column: the window is 16 px wider, so the content is 344 again.
    const base = { ...kit([], F, undefined, 886), gutter: 8 };
    const bar: Edge = { ...sideBar(30), ring: 0, outsideInset: true };
    const a = solve(base);
    const b = solve({ ...base, edges: [...base.edges, bar] });
    expect(b.edges["left-0"]!.rect.width).toBe(a.edges["left-0"]!.rect.width);
    expect(b.edges["right-0"]!.rect.width).toBe(a.edges["right-0"]!.rect.width);
    expect(b.content.width).toBe(a.content.width - 30);
    expect(b.notes.some((n) => n.code === "content-narrow" || n.code === "column-shrunk")).toBe(false);
  });

  it("solving again from its own layout changes nothing (the previous fixpoint), at every width", () => {
    for (const width of [870, 840, 600, 560]) {
      for (const s of [kit(["left", "right"], F, undefined, width), kit(["left"], F, sideBar(30), width)]) {
        const l = solve(s);
        const again = solve(s, { previous: l });
        expect(JSON.stringify(again.edges), `${width}`).toBe(JSON.stringify(l.edges));
        expect(again.content, `${width}`).toEqual(l.content);
        expect(again.notes.filter((n) => n.code !== "content-changed").map((n) => n.code), `${width}`).toEqual(l.notes.map((n) => n.code));
      }
    }
  });

  it("a floor of zero lets chrome take all the content; a negative one counts as zero", () => {
    const zero = widths(kit(["left", "right"], 0, sideBar(200)));
    expect([zero.left, zero.right]).toEqual([263, 263]);
    expect(zero.content).toBe(344 - 60 - 200);
    expect(zero.l.notes.some((n) => n.code === "content-narrow")).toBe(false);
    expect(JSON.stringify(solve(kit(["left", "right"], -10, sideBar(200))))).toBe(JSON.stringify(zero.l));
  });
});
