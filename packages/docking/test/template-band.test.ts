/**
 * `ColumnTemplate.hitBand`: the columns a side's template makes (a drop on a column line, `moveTo` a new column,
 * `dockHome`, a stored column read back) split their panels the template's way. With `"middle"` a drop on a card's
 * upper half is the gap before it, on its lower half the gap after it.
 */
import { targetAt } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { moveTo, readDockState, solve, storeDockState, targets, type DockState, type DockDrop } from "../src";
import { WINDOW_A, winState } from "../src/testing";

const base = winState(WINDOW_A, { width: 1400, height: 800 });
const middle = (s: DockState): DockState => ({ ...s, columns: { left: { ...s.columns!.left!, hitBand: "middle" }, right: { ...s.columns!.right!, hitBand: "middle" } } });
// The window's columns as the template made them (dynamic columns carry no hitBand of their own).
const state = middle(base);

/** For each card of `edge` in order: the target at a quarter and at three quarters of its height. */
function halves(s: DockState, dragged: string, edge: string): { upper: string | null; lower: string | null }[] {
  const l = solve(s);
  const ts: DockDrop[] = targets(s, dragged, { previous: l });
  return s.edges
    .find((e) => e.id === edge)!
    .items.filter((id) => id !== dragged)
    .map((id) => {
      const r = l.items[id]!.rect;
      const at = (f: number) => targetAt(ts, { x: r.x + r.width / 2, y: r.y + r.height * f })?.id ?? null;
      return { upper: at(0.25), lower: at(0.75) };
    });
}

describe("ColumnTemplate.hitBand", () => {
  it("by default a gap over a card is a band about its line, and the card's body is no gap", () => {
    const gap = targets(base, "findings").find((t) => t.id === "gap:left-0:start:1")!;
    expect(gap.hit.height).toBeLessThan(60);
    expect(halves(base, "findings", "left-0").every((h) => !h.upper?.startsWith("gap:") && !h.lower?.startsWith("gap:"))).toBe(true);
  });

  it("\"middle\": a card's upper half is the gap before it, its lower half the gap after it", () => {
    expect(halves(state, "findings", "left-0")).toEqual([
      { upper: "gap:left-0:start:0", lower: "gap:left-0:start:1" },
      { upper: "gap:left-0:start:1", lower: "gap:left-0:start:2" },
    ]);
  });

  it("a column the template makes inherits it: by a drop, by moveTo, and read back from the store", () => {
    // `findings` into a new left column (a column line's drop is `moveTo` a column place), then `annotations` below it;
    // `notes`, dragged, stays on the other side.
    const four = middle(winState(WINDOW_A, { width: 1400, height: 800, columns: { left: [["pages", "annotations"]], right: [["findings", "notes"]] } }));
    const made = moveTo(moveTo(four, "findings", { kind: "column", side: "left", ring: 1 }), "annotations", { kind: "gap", edge: "left-1", zone: "start", at: 1 });
    const col = made.edges.find((e) => e.id === "left-1")!;
    expect(col.hitBand).toBe("middle");
    expect(col.items).toEqual(["findings", "annotations"]);
    expect(halves(made, "notes", "left-1")).toEqual([
      { upper: "gap:left-1:start:0", lower: "gap:left-1:start:1" },
      { upper: "gap:left-1:start:1", lower: "gap:left-1:start:2" },
    ]);
    // The drop through the column line's target makes the same column.
    const line = targets(state, "findings").find((t) => t.place.kind === "column" && t.place.side === "left" && t.place.ring === 1)!;
    expect(line.after({ x: 0, y: 0 }).state.edges.find((e) => e.id === "left-1")?.hitBand).toBe("middle");
    // Stored and read back against a base that lacks the column: made again from the template.
    const read = readDockState(JSON.parse(JSON.stringify(storeDockState(made))), state);
    expect(read.state.edges.find((e) => e.id === "left-1")?.hitBand).toBe("middle");
  });

  it("an edge's own hitBand wins over its template's; the default stays as it was", () => {
    const own = { ...state, edges: state.edges.map((e) => (e.id === "left-0" ? { ...e, hitBand: 24 } : e)) };
    expect(halves(own, "findings", "left-0")).toEqual(halves(base, "findings", "left-0"));
    expect(targets(base, "findings").map((t) => [t.id, t.hit])).toEqual(targets({ ...base, columns: { ...base.columns, left: { ...base.columns!.left! } } }, "findings").map((t) => [t.id, t.hit]));
  });
});
