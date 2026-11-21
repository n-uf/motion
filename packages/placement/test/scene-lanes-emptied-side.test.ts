/**
 * `sideColumns: "one"` with column templates: lifting a lone panel empties its side's declared column, which is still
 * that side's column, the place a drop there takes. No `column:<side>:$` lane is offered for the same place, so the
 * side has one lane and under "all" no two lanes draw the same rect. A side with no declared column still offers one.
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, targets, type Edge, type Rect, type Scene } from "../src/scene";
import { FLUSH, INSET, kitScene, type KitShape } from "./kit-scene";

/** The kit-shaped window with both side columns declared (no `column: true`), so a lifted lone panel leaves its column. */
function declared(k: KitShape, drop?: "left" | "right"): Scene {
  const s = kitScene(k, { left: [["pages", "notes"]], right: [["findings"]] });
  const edges: Edge[] = s.edges.filter((e) => e.side !== drop).map(({ column: _column, ...e }) => e);
  return { ...s, edges, sideColumns: "one" };
}
const SHAPES = [
  ["flush", FLUSH],
  ["inset", INSET],
] as const;
const same = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;

describe.each(SHAPES)("lanes(), an emptied declared side column, %s window", (_name, k) => {
  it("lifting the lone panel leaves the side one lane, held elsewhere or not: its emptied column, no `column:right:$`", () => {
    const s = declared(k);
    const previous = solve(s);
    for (const spot of [undefined, "left-0/start/pages|notes", "right-0/start"]) {
      const r = lanes(s, "findings", { previous, ...(spot ? { spot } : {}) });
      const right = r.lanes.filter((l) => l.id === "right-0" || l.id.startsWith("column:right"));
      expect(right.map((l) => l.id), `spot ${spot}`).toEqual(["right-0"]);
    }
  });

  it("draws no two lanes with equal mark rects under \"all\"", () => {
    const s = declared(k);
    const previous = solve(s);
    for (const spot of [undefined, "left-0/start/pages|notes"]) {
      const r = lanes(s, "findings", { previous, ...(spot ? { spot } : {}) });
      const marks = r.lanes.flatMap((l) => l.marks.map((m) => ({ lane: l.id, id: m.id, rect: m.rect })));
      const twins = marks.flatMap((a, i) => marks.slice(i + 1).filter((b) => a.lane !== b.lane && same(a.rect, b.rect)).map((b) => `${a.id} = ${b.id}`));
      expect(twins, `spot ${spot}`).toEqual([]);
    }
  });

  it("offers no new column at that side's targets either, and drops into the emptied column", () => {
    const s = declared(k);
    const ts = targets(s, "findings", { previous: solve(s) }).map((t) => t.id);
    expect(ts.some((id) => id.startsWith("column:right"))).toBe(false);
    expect(ts).toContain("home:findings");
  });

  it("the kit twin's dynamic columns (`column: true`, the lone panel's column deleted by the lift) offer the side one lane too", () => {
    const s: Scene = { ...kitScene(k), sideColumns: "one" };
    const previous = solve(s);
    for (const spot of [undefined, "left-0/start/pages|notes"]) {
      const r = lanes(s, "findings", { previous, ...(spot ? { spot } : {}) });
      expect(r.lanes.filter((l) => l.id === "right-0" || l.id.startsWith("column:right")).map((l) => l.id), `spot ${spot}`).toEqual(["right-0"]);
    }
  });

  it("a side with no declared column still gets its `column:<side>:$` lane", () => {
    const s = declared(k, "right");
    const previous = solve(s);
    for (const spot of [undefined, "left-0/start/pages|notes"]) {
      const r = lanes(s, "findings", { previous, ...(spot ? { spot } : {}) });
      expect(r.lanes.some((l) => l.id === "column:right:$"), `spot ${spot}`).toBe(true);
    }
  });

  it("a side whose column keeps another panel is unchanged: no new column there, the other side's lone column stays one lane", () => {
    const s = declared(k);
    const previous = solve(s);
    const r = lanes(s, "pages", { previous });
    const side = (n: string) => r.lanes.filter((l) => l.id === `${n}-0` || l.id.startsWith(`column:${n}`)).map((l) => l.id);
    expect(side("left")).toEqual(["left-0"]);
    expect(side("right")).toEqual(["right-0"]);
  });
});
