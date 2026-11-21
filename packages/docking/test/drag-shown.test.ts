/**
 * `shown(frame)`: the layout a landing frame draws, and the one every guide of the frame is cut in. While the room is
 * open it is `after(state).layout`; a float frame's room is not open (its gap closes on release, decision 0003), so the
 * window is drawn at rest and the guides are cut there, not in the float's commit layout (the column closed up).
 */
import { describe, expect, it } from "vitest";
import type { Rect } from "@n-uf/placement";
import { dockDrag, solve, type DockGuideFrame, type DockHeld, type DockState } from "../src";
import { byId, panel, windowState } from "./fixture";

const fmt = (r: Rect): string => `${r.x},${r.y} ${r.width}x${r.height}`;

/** A 1200x800 window with a right column holding p1, p2 and p3. */
function threePanels(): DockState {
  const base = windowState(1200, 800);
  return {
    ...base,
    edges: base.edges.map((e) => (e.id === "right" ? { ...e, items: ["p1", "p2", "p3"] } : e)),
    items: { ...base.items, ...byId([panel("p1", 1), panel("p2", 2), panel("p3", 3)]) },
    floats: [],
  };
}

describe("shown(frame) and guides(frame) of a float frame", () => {
  const s = threePanels();
  const previous = solve(s);
  const drag = dockDrag(s, "p2", { previous, grab: { x: 20, y: 10 } });
  const held: DockHeld = { kind: "float", point: { x: 500, y: 300 } };
  const frame = (room: boolean): DockGuideFrame => ({ state: held, room, guides: ["right", "left"].map((lane) => ({ lane, state: held })) });
  const rows = (room: boolean): string[] => drag.guides(frame(room)).filter((m) => m.lane === "right").map((m) => `${m.kind} ${fmt(m.rect)}`);

  it("with the room closed the window is drawn at rest, and the guides are cut in it", () => {
    expect(drag.shown(frame(false))).toBe(drag.after(null).layout);
    expect(drag.after(held).layout).not.toBe(drag.after(null).layout);
    const atRest = drag.after(null).marks.filter((m) => m.lane === "right");
    expect(drag.guides(frame(false)).filter((m) => m.lane === "right")).toEqual(atRest);
    // The rest column draws p2's slot whole (a box, lines at its two joints), not the closed-up column's one joint.
    expect(rows(false)).toContain("box 940,312 260x244");
    expect(rows(false)).not.toContain("line 940,434 260x0");
  });

  it("with the room open the layout is the float's commit layout, and the guides are cut in it", () => {
    expect(drag.shown(frame(true))).toBe(drag.after(held).layout);
    expect(drag.guides(frame(true)).filter((m) => m.lane === "right")).toEqual(drag.after(held).marks.filter((m) => m.lane === "right"));
    expect(rows(true)).toContain("line 940,434 260x0");
  });

  it("a spot frame is its state's layout with the room open, and the window at rest with it closed", () => {
    const sp = drag.regions.lanes.find((l) => l.id === "right")!.spots.find((x) => !x.home)!;
    const spot: DockHeld = { kind: "spot", spot: sp.id, point: { x: sp.landing.x + 20, y: sp.landing.y + 10 } };
    expect(drag.shown({ state: spot, room: true })).toBe(drag.after(spot).layout);
    expect(drag.shown({ state: spot, room: false })).toBe(drag.after(null).layout);
    expect(drag.shown({ state: null, room: true })).toBe(drag.after(null).layout);
  });
});
