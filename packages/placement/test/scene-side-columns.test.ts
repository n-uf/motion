/** `Scene.sideColumns: "one"`: a side has at most one column; `mergeSideColumns` merges a stored second one. */
import { describe, expect, it } from "vitest";
import { mergeSideColumns, solve, targets, type Scene } from "../src/scene";
import { byId, column, panel } from "./scene-fixture";

/** Two columns on the left (a, then b further in), none on the right, a panel floating. */
const two = (declared = true): Scene => ({
  stage: { x: 0, y: 0, width: 1200, height: 800 },
  edges: [column("left-0", "left", 0, ["a"], { column: true, accepts: ["panel"] }), column("left-1", "left", 1, ["b"], { column: true, accepts: ["panel"] })],
  items: byId([panel("a", 1), panel("b", 2), panel("f", 3)]),
  floats: [{ id: "f", rect: { x: 500, y: 200, width: 240, height: 300 } }],
  floatKinds: ["panel"],
  columns: { left: { accepts: ["panel"], cross: { min: 180, max: 400, rail: 30 } }, right: { accepts: ["panel"], cross: { min: 180, max: 400, rail: 30 } } },
  ...(declared ? { sideColumns: "one" as const } : {}),
});
const lines = (s: Scene, id: string, side: "left" | "right") => targets(s, id, { previous: solve(s) }).filter((t) => t.place.kind === "column" && t.place.side === side);

describe("sideColumns: one", () => {
  it("offers no new column on a side that has one, and still offers the first on a side that has none", () => {
    expect(lines(two(false), "f", "left").length).toBeGreaterThan(0);
    expect(lines(two(), "f", "left")).toEqual([]);
    expect(lines(two(), "f", "right").length).toBeGreaterThan(0);
    // The item still goes into the side's column, by its gaps.
    expect(targets(two(), "f").some((t) => t.place.kind === "gap" && t.place.edge === "left-0")).toBe(true);
  });

  it("an item alone in the side's only column gets the same lines as without it: lifted, the side has no column", () => {
    const one = (declared: boolean): Scene => ({ ...two(declared), edges: [two().edges[0]!], items: byId([panel("a", 1), panel("f", 3)]) });
    expect(lines(one(true), "a", "left").map((t) => t.id)).toEqual(lines(one(false), "a", "left").map((t) => t.id));
  });
});

describe("mergeSideColumns", () => {
  it("merges a side's columns into the outermost, in ring order, and closes the rings", () => {
    const m = mergeSideColumns(two());
    const left = m.edges.filter((e) => e.side === "left");
    expect(left.map((e) => [e.id, e.ring, e.items])).toEqual([["left-0", 0, ["a", "b"]]]);
    expect(solve(m).items.b!.edge).toBe("left-0");
  });

  it("three columns, a rail and an anchor beside them: the columns merge into the outermost, its size kept; the rail and the anchor stay", () => {
    const base = two(false);
    const s: Scene = {
      ...base,
      edges: [
        { id: "rail", side: "left", ring: 0, accepts: ["group"], items: [], cross: { min: 30, max: 30, rail: 30 }, compact: true },
        { id: "anchor", side: "left", ring: 1, accepts: [], items: ["thumbs"], cross: { min: 60, max: 60, rail: 60 } },
        column("left-0", "left", 2, ["a"], { column: true, accepts: ["panel"], size: 280 }),
        column("left-1", "left", 3, ["b"], { column: true, accepts: ["panel"], size: 200 }),
        column("left-2", "left", 4, ["c"], { column: true, accepts: ["panel"] }),
      ],
      items: byId([panel("a", 1), panel("b", 2), panel("c", 3), panel("f", 4), { id: "thumbs", kind: "thumbs", used: 0, fixed: true, forms: { column: [] } }]),
    };
    const m = mergeSideColumns(s);
    expect(m.edges.map((e) => [e.id, e.ring, e.items, e.size ?? null])).toEqual([
      ["rail", 0, [], null],
      ["anchor", 1, ["thumbs"], null],
      ["left-0", 2, ["a", "b", "c"], 280],
    ]);
  });

  it("returns the same scene when no side has two columns", () => {
    const s = mergeSideColumns(two());
    expect(mergeSideColumns(s)).toBe(s);
  });
});
