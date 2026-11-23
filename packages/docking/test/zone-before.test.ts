/**
 * At one landing, the dock in the zone the neighbor before it lies in wins (`zoneIn`, the one reading both paths and the
 * sliding spot's snap points take), read from where that neighbor is laid out, not from its stored `align`.
 *
 * A group whose `align` is `"start"` on a bar whose start zone takes only panels lies in another zone: here the center
 * (which takes groups), its stored `align` unchanged. Docking the held group right after it, the center dock (after it
 * in the center) and the end dock (first in the end, before the end-zone neighbor) land at one start, the end group
 * pushed against the center one. The center dock wins, as the zone the neighbor lies in; read from `align` ("start")
 * neither dock's zone would match it, and the tie would fall to their order.
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, targets, type DockItem, type DockState } from "../src";
import { bar, byId, form } from "./fixture";

const tb = (id: string, len: number, more: Partial<DockItem> = {}): DockItem => ({ id, kind: "group", used: 1, forms: { row: [form("row", len, len, 31), form("menu", 0, 0, 0)], column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] }, ...more });

const state: DockState = {
  stage: { x: 0, y: 0, width: 600, height: 400 },
  edges: [bar("bar", "top", 0, ["x", "y"], { accepts: ["panel", "group"], zoneAccepts: { start: ["panel"], center: ["group"], end: ["group"] }, cross: { min: 31, max: 31, rail: 31 }, gap: 4, pad: { start: 8, end: 8 } })],
  items: byId([tb("x", 200, { align: "start" }), tb("y", 200, { align: "end" }), tb("g", 150)]),
  floats: [{ id: "g", rect: { x: 100, y: 200, width: 150, height: 31 } }],
  floatKinds: ["group", "panel"],
};

describe("the zone of the neighbor before a landing is where it lies", () => {
  it("x, stored align start, lies in the center; of the center and end docks at one start after it, the center dock wins", () => {
    const seen = solve(state);
    expect(state.items.x!.align).toBe("start");
    expect(seen.items.x!.zone).toBe("center");
    const lane = lanes(state, "g").lanes.find((l) => l.id === "bar")!;
    const after = lane.spots.filter((s) => s.id.includes("/x|y"));
    expect(after.map((s) => s.id)).toEqual(["bar/center/x|y"]);
    const spot = after[0]!;
    expect(spot.target.place).toEqual({ kind: "gap", edge: "bar", zone: "center", at: 1 });
    // The end dock lands at that same start: it is the same landing, taken by the center dock.
    const committed = spot.target.after({ x: spot.landing.x + 10, y: spot.landing.y + 10 }, { x: 10, y: 10 }).layout;
    expect(committed.items.g!.zone).toBe("center");
    const endDock = targets(state, "g").find((t) => t.id === "gap:bar:end:0")!;
    expect(endDock.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout.items.g!.rect.x).toBeCloseTo(spot.landing.x, 6);
  });
});
