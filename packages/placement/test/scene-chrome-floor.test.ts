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
});
