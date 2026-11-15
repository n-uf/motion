/**
 * A closed item is not a removed one: closing items and opening them again at the same width gives the layout from
 * before the close. Items opened together keep their ages among themselves (each newer than every item that stayed
 * open), so the give-way order among them is the one they had.
 */
import { describe, expect, it } from "vitest";
import { solve, type Scene, type SceneLayout } from "../src/scene";
import { modelScene } from "./model-scene";
import { byId, column, panel } from "./scene-fixture";

/** What a host draws: every item's rect and form, the edges' rects and folds, the rails. */
const drawn = (l: SceneLayout) =>
  JSON.stringify({
    items: Object.entries(l.items)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, it]) => [id, it.rect, it.form, it.edge ?? null, it.rail ?? null, it.inMenu ?? false]),
    edges: Object.entries(l.edges)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, e]) => [id, e.rect, e.folded ?? null]),
    rails: l.rails,
  });
const setClosed = (s: Scene, ids: readonly string[], closed: boolean): Scene => ({ ...s, items: { ...s.items, ...Object.fromEntries(ids.map((id) => [id, { ...s.items[id]!, closed }])) } });

/** Three panel columns, Pages and Annotations on the left and Findings on the right, folding into their rails. */
const separate = (width: number): Scene => ({
  stage: { x: 0, y: 0, width, height: 600 },
  edges: [column("l0", "left", 0, ["pages"], { column: true }), column("l1", "left", 1, ["annotations"], { column: true }), column("r0", "right", 0, ["findings"], { column: true })],
  items: byId([panel("pages", 1), panel("annotations", 2), panel("findings", 3)]),
  floats: [],
  floatKinds: ["panel"],
  columns: { left: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } }, right: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } } },
  rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
  contentMin: { width: 300, height: 200 },
  gutter: 8,
});

describe("closing is not removing", () => {
  it("every panel closed at 560, then opened at 620: Findings open, Pages and Annotations folded, as a stateless solve", () => {
    const all = ["pages", "annotations", "findings"];
    const l700 = solve(separate(700));
    const l560 = solve(setClosed(separate(560), all, true), { previous: l700 });
    const l620 = solve(separate(620), { previous: l560 });
    expect(drawn(l620)).toBe(drawn(solve(separate(620))));
    expect(l620.edges.r0!.folded).toBeUndefined();
    expect([l620.edges.l0!.folded, l620.edges.l1!.folded]).toEqual(["auto", "auto"]);
  });

  it("closing every panel of some columns and opening them again at the same width gives the layout from before the close", () => {
    // Whole columns: an item opened beside items that stayed open in its edge is a request to show it (the newest
    // there), so only a column closed whole comes back exactly as it was.
    let cases = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = modelScene(seed, seed % 2 === 0);
      const before = solve(s);
      // Each column's panels drawn open (not in a rail, not riding, not in a » menu).
      const cols = s.edges
        .map((e) => e.items.filter((id) => s.items[id]!.kind === "panel" && !s.items[id]!.closed && before.items[id]?.edge && !before.items[id]!.rail && !before.items[id]!.rides && !before.items[id]!.inMenu))
        .filter((ids) => ids.length > 0);
      // Every column alone, and every two together, closed and opened again.
      const subsets = [...cols, ...cols.flatMap((a, i) => cols.slice(i + 1).map((b) => [...a, ...b]))];
      for (const ids of subsets) {
        const closed = solve(setClosed(s, ids, true), { previous: before });
        const again = solve(s, { previous: closed });
        expect(drawn(again), `seed ${seed}, closing ${ids.join(" and ")}`).toBe(drawn(before));
        cases++;
      }
    }
    expect(cases).toBeGreaterThan(100);
  });
});
