/**
 * An emptied side column that the scene still declares as an edge (no `column: true`, as the lab's document window
 * declares its two side columns) is a lane like an empty column of a kit's dynamic columns: its guide under "all" is
 * the column's box at real size, whichever panel is held elsewhere.
 */
import { describe, expect, it } from "vitest";
import { solve, type Scene } from "../src/scene";
import { lanes } from "./pitched-lanes";
import { bar, byId, column, controls, panel, title } from "./scene-fixture";

const COL = { accepts: ["panel"], cross: { min: 120, max: 400, rail: 30 }, gap: 6, pad: { start: 6, end: 6 } };
/** The lab's window in short: a title bar, a left column holding Pages, Findings and Notes, and an empty right column. */
const emptiedRight = (): Scene => ({
  stage: { x: 0, y: 0, width: 1080, height: 640 },
  edges: [bar("title", "top", 0, ["title", "controls"]), column("left", "left", 1, ["pages", "findings", "notes"], COL), column("right", "right", 1, [], COL)],
  items: byId([title(), controls(), panel("pages", 1), panel("findings", 2), panel("notes", 3)]),
  floats: [],
  floatKinds: ["panel"],
  sideColumns: "one",
});

describe("lanes(): an emptied side column that is a declared edge", () => {
  it("has a box at its real size while a panel is held elsewhere (not held in it), as an empty column of dynamic columns does", () => {
    const s = emptiedRight();
    const right = lanes(s, "notes", { previous: solve(s) }).lanes.find((l) => l.id === "right")!;
    expect(right.spots.length).toBe(1);
    const boxes = right.marks.filter((m) => m.kind === "box");
    expect(boxes.map((m) => m.id)).toEqual(["right/box/^|$"]);
    expect(boxes[0]!.rect).toEqual(right.rect);
  });

  it("keeps that box with `spot` held in its own lane's spot or another's, and as a thin striped edge under `emptyLanes: \"edge\"`", () => {
    const s = emptiedRight();
    const previous = solve(s);
    const at = lanes(s, "notes", { previous, spot: "left/start/findings|$" }).lanes.find((l) => l.id === "right")!;
    expect(at.marks.some((m) => m.kind === "box")).toBe(true);
    const edge = lanes(s, "notes", { previous, emptyLanes: "edge" }).lanes.find((l) => l.id === "right")!;
    expect(edge.marks.some((m) => m.kind === "hatch")).toBe(true);
  });

  it("holds the panel in it: no mark lies over the held panel", () => {
    const s = emptiedRight();
    const held = lanes(s, "notes", { previous: solve(s), spot: "right/start" }).lanes.find((l) => l.id === "right")!;
    expect(held.marks.filter((m) => m.kind === "box")).toEqual([]);
  });
});
