/**
 * `contentMin.chromeWidth`: a lower floor for chrome. Toolbar rails and side toolbar bars may narrow the content down to
 * it while the panel columns keep their width and move aside; below it a column shrinks as without it.
 */
import { describe, expect, it } from "vitest";
import { solve, type Edge, type Scene } from "../src/scene";
import { byId, column, group, panel } from "./scene-fixture";

const COL = { accepts: ["panel"], cross: { min: 180, max: 480, rail: 30 } };
/** A toolbar rail at a window edge, 60 px wide, holding `items`. */
const rail = (id: string, side: "left" | "right", items: string[]): Edge => ({ id, side, ring: 0, accepts: ["group"], items, cross: { min: 60, max: 60, rail: 60 }, compact: true });

/**
 * Kit-like: an 870 px window, one panel column per side (263 px each), so the content is 344 (320 and 24 of padding),
 * exactly `contentMin.width`. `rails` adds toolbar rails at the window's edges.
 */
function kit(rails: readonly ("left" | "right")[], floor?: number, extra?: Edge): Scene {
  const edges: Edge[] = [
    column("left-0", "left", 1, ["p"], { column: true, accepts: ["panel"] }),
    column("right-0", "right", 1, ["q"], { column: true, accepts: ["panel"] }),
    ...rails.map((s) => rail(`tools-${s}`, s, [`g-${s}`])),
    ...(extra ? [extra] : []),
  ];
  return {
    stage: { x: 0, y: 0, width: 870, height: 700 },
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
    expect(widths(kit([], 200))).toMatchObject({ left: 263, right: 263, content: 344 });
  });

  for (const sides of [["left"], ["right"], ["left", "right"]] as const) {
    it(`a toolbar rail at ${sides.join(" and ")} moves the columns aside at their width and narrows the content`, () => {
      const w = widths(kit(sides, 200));
      expect([w.left, w.right]).toEqual([263, 263]);
      expect(w.content).toBe(344 - 60 * sides.length);
      expect(w.l.notes.some((n) => n.code === "column-shrunk" || n.code === "column-folded")).toBe(false);
      // The columns moved: each lies beside its rail, not at the window's edge.
      if ((sides as readonly string[]).includes("left")) expect(w.l.edges["left-0"]!.rect.x).toBe(60);
      // Without the floor, the same rail shrinks a column, as before.
      const old = widths(kit(sides));
      expect(old.content).toBe(344);
      expect(old.left + old.right).toBe(526 - 60 * sides.length);
    });
  }

  it("a third rail-sized cost, below the floor, shrinks a column as before", () => {
    const bar: Edge = { id: "bar-left", side: "left", ring: 2, accepts: ["group"], items: ["g-bar"], cross: { min: 60, max: 60, rail: 60 } };
    const w = widths(kit(["left", "right"], 200, bar));
    const barW = w.l.edges["bar-left"]!.rect.width;
    expect(barW).toBeGreaterThan(0);
    // Content at the floor; the rest of the bar's cost comes off the columns.
    expect(w.content).toBe(200);
    expect(w.left + w.right).toBe(870 - 120 - barW - 200);
    expect(w.left + w.right).toBeLessThan(526);
    expect(w.l.notes.some((n) => n.code === "column-shrunk")).toBe(true);
  });

  it("the panels' minimum still says whether a column has room, and the content under it is noted", () => {
    const { l } = widths(kit(["left", "right"], 200));
    expect(l.columnRoom).toBe(true);
    expect(l.notes.some((n) => n.code === "content-narrow")).toBe(true);
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
