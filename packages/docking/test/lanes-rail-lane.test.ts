/**
 * An empty side rail's lane is the band its drop opens. `lanes()` gives an empty edge (not drawn) the rect its edge takes
 * once the held item has landed there: the edge's rect in the layout after the drop, so its width is the rail's own cross
 * (the widest cross of what it then holds, and the declared one), never the strip a `DockState.railDrop` would add. A
 * pointer in that lane is where the drop lands: nothing about it is earlier or wider than the rail it opens. Under
 * `emptyLanes: "edge"` only the marks change (a thin striped strip), never the lane's rect.
 *
 * Pinned over a real window (a document window with a panel column each side and an empty rail beside each, a toolbar
 * held: `fixtures/side-rails-empty.json`, 30 px rails) and a library window with 21 px rails.
 */
import type { Rect } from "@n-uf/placement";
import { describe, expect, it } from "vitest";
import { lanes, solve, type DockState } from "../src";
import { libraryState, realState, realWith } from "./rail-entry-windows";

const ORIGIN = { x: 0, y: 0 };

const sameRect =(a: Rect, b: Rect): void => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
  expect(a.width).toBeCloseTo(b.width, 6);
  expect(a.height).toBeCloseTo(b.height, 6);
};

const CASES: readonly { name: string; state: () => DockState; held: string; rails: readonly string[]; width: number }[] = [
  { name: "the real window, 30 px rails, a floating toolbar held", state: realState, held: "tools", rails: ["bar:left", "bar:right"], width: 30 },
  { name: "the real window, a toolbar held from its bottom bar", state: realState, held: "panels", rails: ["bar:left", "bar:right"], width: 30 },
  { name: "the real window with 21 px rails", state: () => realWith(21), held: "tools", rails: ["bar:left", "bar:right"], width: 21 },
  { name: "a library window, 30 px rails, a toolbar held from its bottom bar", state: () => libraryState(30), held: "tools", rails: ["rail-left", "rail-right"], width: 30 },
  { name: "a library window, 21 px rails, a toolbar held from its bottom bar", state: () => libraryState(21), held: "tools", rails: ["rail-left", "rail-right"], width: 21 },
];

describe("lanes(): an empty edge's lane is the band its drop opens", () => {
  for (const c of CASES)
    for (const emptyLanes of ["real", "edge"] as const)
      it(`${c.name}, emptyLanes "${emptyLanes}": each empty side rail's lane rect is its edge's rect after the drop, ${c.width} px wide`, () => {
        const s = c.state();
        const previous = solve(s);
        const r = lanes(s, c.held, { previous, grab: { x: 15, y: 8 }, endReach: 24, emptyLanes });
        for (const id of c.rails) {
          // Empty, so not drawn: the drop opens its band.
          expect(previous.edges[id]!.cross, `${id} before`).toBe(0);
          const lane = r.lanes.find((l) => l.id === id);
          expect(lane, id).toBeDefined();
          expect(lane!.spots).toHaveLength(1);
          const after = lane!.spots[0]!.target.after(ORIGIN, ORIGIN).layout.edges[id]!.rect;
          expect(after.width, `${id} after the drop`).toBe(c.width);
          sameRect(lane!.rect, after);
        }
      });
});
