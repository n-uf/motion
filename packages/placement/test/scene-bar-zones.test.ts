/**
 * Revision 8: a horizontal bar's leading, center and trailing zones are picked by thirds of the bar, the nearest gap
 * within; an empty bar's strip is three zone targets; a title bar is a constrained host (a toolbar fits there in its
 * first form without pushing the title under its natural width, or that zone has no target).
 */
import { describe, expect, it } from "vitest";
import { solve, targets, type Scene, type SceneTarget } from "../src/scene";
import { windowScene } from "./scene-fixture";

const inside = (h: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) => p.x >= h.x - 1e-6 && p.x <= h.x + h.width + 1e-6 && p.y >= h.y - 1e-6 && p.y <= h.y + h.height + 1e-6;
const zoneAt = (ts: SceneTarget[], edge: string, p: { x: number; y: number }): string | undefined => {
  const t = ts.filter((x) => x.place.kind === "gap" && (x.place as { edge: string }).edge === edge && inside(x.hit, p)).sort((a, b) => a.hit.width * a.hit.height - b.hit.width * b.hit.height)[0];
  return t ? (t.place as { zone: string }).zone : undefined;
};
/** The window with `ids` moved into the edge `to` (taken out of the others), fixed items kept around them. */
function put(s: Scene, to: string, ids: string[]): Scene {
  return {
    ...s,
    edges: s.edges.map((e) => {
      const rest = e.items.filter((x) => !ids.includes(x));
      if (e.id !== to) return { ...e, items: rest };
      const fixed = rest.filter((x) => s.items[x]?.fixed);
      return { ...e, items: [...fixed.filter((x) => s.items[x]!.align !== "end"), ...ids, ...fixed.filter((x) => s.items[x]!.align === "end")] };
    }),
  };
}
const align = (s: Scene, id: string, a: "start" | "center" | "end"): Scene => ({ ...s, items: { ...s.items, [id]: { ...s.items[id]!, align: a } } });

describe("a bar's zones by thirds", () => {
  it("the title bar: left third leading (right after the title's natural width), middle centred, right trailing (before the controls)", () => {
    const s = put(windowScene(), "toolbar", ["tools", "zoom"]);
    const ts = targets(s, "views");
    const y = 16;
    for (let x = 0; x < 1110; x += 6) expect(zoneAt(ts, "titlebar", { x, y })).toBe(x < 400 ? "start" : x <= 800 ? "center" : "end");
    const slot = (zone: string) => ts.find((t) => t.place.kind === "gap" && (t.place as { edge: string }).edge === "titlebar" && (t.place as { zone: string }).zone === zone)!.after({ x: 0, y: 0 }).layout;
    expect(slot("start").items.views!.rect.x).toBe(160);
    expect(slot("start").items.title!.rect.width).toBe(160);
    const c = slot("center").items.views!.rect;
    expect(c.x + c.width / 2).toBe(600);
    const e = slot("end").items.views!.rect;
    expect(e.x + e.width).toBe(1116);
  });

  it("center: centred in the free span when the bar's true centre isn't clear of the leading items", () => {
    // Three leading toolbars end at 760, past the bar's middle: the center toolbar sits centred between them and the controls.
    const s = align(align(put(windowScene(), "titlebar", ["tools", "zoom", "marks", "search"]), "search", "center"), "zoom", "start");
    const l = solve(s);
    const lo = l.items.marks!.rect.x + l.items.marks!.rect.width;
    const hi = l.items.controls!.rect.x;
    const r = l.items.search!.rect;
    expect(lo).toBeGreaterThan(600 - r.width / 2);
    expect(r.x + r.width / 2).toBeCloseTo((lo + hi) / 2, 6);
  });

  it("a title bar too full offers no zone: a toolbar may not push the title under its natural width", () => {
    // 160 + 4 × 200 + 84 leaves 156: Views fits only by shrinking the title toward its 80 px minimum, which is refused.
    const s = put(windowScene(), "titlebar", ["tools", "zoom", "marks", "search"]);
    const ts = targets(s, "views");
    expect(ts.filter((t) => (t.place as { edge?: string }).edge === "titlebar")).toEqual([]);
    expect(solve(s).items.title!.rect.width).toBeGreaterThanOrEqual(160);
  });

  it("a bar with a toolbar at its start takes others to its right too: middle and right thirds are center and trailing", () => {
    const s = align(put(windowScene(), "toolbar", ["zoom"]), "zoom", "start");
    const ts = targets(s, "views");
    const bar = solve(s).edges.toolbar!.rect;
    const y = bar.y + bar.height / 2;
    expect(zoneAt(ts, "toolbar", { x: bar.width / 6, y })).toBe("start");
    expect(zoneAt(ts, "toolbar", { x: bar.width / 2, y })).toBe("center");
    expect(zoneAt(ts, "toolbar", { x: (5 * bar.width) / 6, y })).toBe("end");
    // The gap after Zoom has a point of its own in the leading third.
    const after = ts.find((t) => t.id === "gap:toolbar:start:1")!;
    expect(after.hit.width).toBeGreaterThan(0);
  });

  it("every target's slot is its landing, and a title bar's slot never covers the title's natural rect or the controls", () => {
    for (const s of [put(windowScene(), "toolbar", ["tools", "zoom"]), align(put(windowScene(), "titlebar", ["tools"]), "tools", "center"), align(put(windowScene(), "titlebar", ["tools"]), "tools", "end")]) {
      for (const t of targets(s, "views")) {
        if (t.place.kind !== "gap" || (t.place as { edge: string }).edge !== "titlebar") continue;
        const a = t.after({ x: 0, y: 0 }).layout;
        expect(t.slot).toEqual(a.items.views!.rect);
        const v = a.items.views!.rect;
        expect(v.x).toBeGreaterThanOrEqual(160);
        expect(v.x + v.width).toBeLessThanOrEqual(a.items.controls!.rect.x);
        expect(a.items.title!.rect.width).toBeGreaterThanOrEqual(160);
      }
    }
  });
});
