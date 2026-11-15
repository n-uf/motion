/**
 * Gap hits tile an edge: on bars, rails and a column's tray, every point of the length is in some gap's hit, except over
 * a non-growing fixed item (window controls, a readout); only over a panel's body a gap is a band.
 */
import { describe, expect, it } from "vitest";
import { refusals, reservedRect, solve, targets, type Scene, type SceneTarget } from "../src/scene";
import { byId, column, group, panel, windowScene } from "./scene-fixture";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const inside = (h: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) => p.x >= h.x - 1e-6 && p.x <= h.x + h.width + 1e-6 && p.y >= h.y - 1e-6 && p.y <= h.y + h.height + 1e-6;
const gapsOf = (ts: SceneTarget[], edge: string) => ts.filter((t) => t.place.kind === "gap" && (t.place as { edge: string }).edge === edge);
/** The points along an edge, every 4 px, not covered by any of its gap hits. */
function dead(ts: SceneTarget[], edge: string, points: { x: number; y: number }[]): { x: number; y: number }[] {
  const hits = gapsOf(ts, edge).map((t) => t.hit);
  return points.filter((p) => !hits.some((h) => inside(h, p)));
}

describe("gap hits tile short-item edges", () => {
  it("a compact rail with one toolbar: every point down it is some gap (top, between, middle, bottom)", () => {
    const s: Scene = {
      stage: r(0, 0, 1000, 600),
      edges: [{ id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["a"], cross: { min: 30, max: 30, rail: 30 }, compact: true }, column("col", "left", 1, ["p"])],
      items: byId([group("a", 1), group("b", 2), panel("p", 3)]),
      floats: [{ id: "b", rect: r(500, 100, 200, 40) }],
      floatKinds: ["group"],
    };
    const ts = targets(s, "b");
    const pts = Array.from({ length: 150 }, (_, i) => ({ x: 15, y: i * 4 }));
    expect(dead(ts, "rail", pts)).toEqual([]);
    const ids = gapsOf(ts, "rail").map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["gap:rail:start:0", "gap:rail:start:1", "gap:rail:center:0", "gap:rail:end:0"]));
    // A little way inside the rail, over the column, still the rail.
    expect(gapsOf(ts, "rail").some((t) => inside(t.hit, { x: 40, y: 300 }))).toBe(true);
  });

  it("the bars: every point along the toolbar and the title bar is some gap, except over the reserved rects", () => {
    const s = windowScene();
    const l = solve(s);
    const ts = targets(s, "search");
    const along = (e: string) => {
      const rr = l.edges[e]!.rect;
      return Array.from({ length: Math.floor(rr.width / 4) + 1 }, (_, i) => ({ x: rr.x + i * 4, y: rr.y + rr.height / 2 }));
    };
    expect(dead(ts, "toolbar", along("toolbar"))).toEqual([]);
    // The window controls and the title's natural rect (its text) are reserved, no drop place (Revision 9).
    // Where Search fits nowhere in a zone, that stretch is a refusal: covered too, never dead.
    const reserved = ["controls", "title"].map((id) => reservedRect(s, l, id));
    const refused = refusals(s, "search").filter((x) => x.edge === "titlebar").map((x) => x.hit);
    const off = dead(ts, "titlebar", along("titlebar")).filter((p) => !reserved.some((q) => inside(q, p)) && !refused.some((q) => inside(q, p)));
    expect(off).toEqual([]);
  });

  it("a column's tray: from just under the panels to the column's foot, every point is the tray's gap; a panel's body is not", () => {
    const zoneAccepts = { start: ["panel"], end: ["group"] };
    const s: Scene = {
      stage: r(0, 0, 1000, 600),
      edges: [column("col", "left", 0, ["p", "g"], { zoneAccepts })],
      items: byId([panel("p", 1), group("g", 0, { align: "end" }), group("h", 2)]),
      floats: [{ id: "h", rect: r(500, 100, 200, 40) }],
      floatKinds: ["group"],
    };
    const l = solve(s);
    const p = l.items.p!.rect;
    const ts = targets(s, "h");
    const tray = Array.from({ length: 40 }, (_, i) => ({ x: 20, y: p.y + p.height + 12 + i * 4 })).filter((q) => q.y <= 600);
    expect(dead(ts, "col", tray)).toEqual([]);
    expect(dead(ts, "col", [{ x: 20, y: p.y + p.height / 2 }])).toHaveLength(1);
  });
});
