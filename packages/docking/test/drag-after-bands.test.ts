/**
 * `after(state)`'s marks read one layout, the band of a lane its layout doesn't draw included (decision 0003): an empty
 * edge's marks lie along its band in that layout (its extent there, clipped at the edges drawn across it there), not
 * along its band as seen, which only the hit rect reads. And under "all" no guide drawn in the layout that creates it
 * lies over the held landing on screen.
 */
import { describe, expect, it } from "vitest";
import type { Rect } from "@n-uf/placement";
import { dockDrag, solve, type DockLayout, type DockState } from "../src";
import { windows } from "./lift-windows";

type Axis = "x" | "y";
const lo = (r: Rect, a: Axis): number => (a === "x" ? r.x : r.y);
const hi = (r: Rect, a: Axis): number => (a === "x" ? r.x + r.width : r.y + r.height);
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;

/** An empty edge's band along its axis in `layout`: its extent there, cut at each edge drawn across its middle there. */
function bandIn(s: DockState, layout: DockLayout, id: string, axis: Axis, across: number): [number, number] {
  const e = layout.edges[id]!.rect;
  let a = lo(e, axis);
  let b = hi(e, axis);
  const mid = (a + b) / 2;
  const x: Axis = axis === "x" ? "y" : "x";
  for (const o of s.edges) {
    const d = layout.edges[o.id];
    if (o.id === id || !d || d.cross <= 1e-6) continue;
    const vertical = o.side === "left" || o.side === "right";
    if ((axis === "x") !== vertical) continue;
    if (!(lo(d.rect, x) < across - 1e-6 && across < hi(d.rect, x) - 1e-6)) continue;
    if ((lo(d.rect, axis) + hi(d.rect, axis)) / 2 <= mid) a = Math.max(a, hi(d.rect, axis));
    else b = Math.min(b, lo(d.rect, axis));
  }
  return [a, b];
}

describe("after(state): an undrawn lane's marks lie along its band in that layout", () => {
  it("for every spot state, an empty edge holding no item there spans its band in that layout with its marks", () => {
    let n = 0;
    const bad: string[] = [];
    for (const w of windows()) {
      const previous = solve(w.state);
      const own = previous.items[w.dragged];
      if (!own || own.inMenu || own.floating) continue;
      const drag = dockDrag(w.state, w.dragged, { ...w.options, previous, grab: { x: own.rect.width / 2, y: own.rect.height / 2 } });
      for (const l of drag.regions.lanes)
        for (const sp of l.spots) {
          if (sp.slide) continue;
          const a = drag.after({ kind: "spot", spot: sp.id, point: { x: 0, y: 0 } });
          for (const o of drag.regions.lanes) {
            const e = a.layout.edges[o.id];
            const edge = w.state.edges.find((x) => x.id === o.id);
            if (!e || !edge || e.cross > 1e-6 || o.id === l.id || (w.options.emptyLanes ?? "real") !== "real") continue;
            // Only a lane its own spot draws whole (no item and no refused stretch on it, one box).
            const marks = a.marks.filter((m) => m.lane === o.id);
            if (marks.length !== 1 || marks[0]!.kind !== "box" || o.refused.length > 0) continue;
            const across = o.axis === "x" ? marks[0]!.rect.y + marks[0]!.rect.height / 2 : marks[0]!.rect.x + marks[0]!.rect.width / 2;
            const [b0, b1] = bandIn(w.state, a.layout, o.id, o.axis, across);
            const m0 = lo(marks[0]!.rect, o.axis);
            const m1 = hi(marks[0]!.rect, o.axis);
            // Cut only around items docked in bars and toolbar rails (they stay): the box's ends are the band's, or an item's.
            // (Or at another lane's marks: between two undrawn lanes the bar keeps the corner.)
            const stays = [
              ...Object.entries(a.layout.items).filter(([id, it]) => id !== w.dragged && !it.floating && !it.inMenu && it.rect.width > 0).map(([, it]) => it.rect),
              ...a.marks.filter((m) => m.lane !== o.id).map((m) => m.rect),
            ];
            const endAt = (v: number, band: number): boolean => Math.abs(v - band) <= 1 || stays.some((r) => Math.abs(hi(r, o.axis) - v) <= 1 || Math.abs(lo(r, o.axis) - v) <= 1);
            n++;
            if (!endAt(m0, b0) || !endAt(m1, b1) || m0 < b0 - 1 || m1 > b1 + 1) bad.push(`${w.name}, ${sp.id} held: ${o.id} marks ${m0.toFixed(0)}→${m1.toFixed(0)}, band ${b0.toFixed(0)}→${b1.toFixed(0)}`);
          }
        }
    }
    expect(n).toBeGreaterThan(50);
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('under "all", no guide drawn in the layout that creates it lies over the held landing on screen', () => {
    let n = 0;
    const bad: string[] = [];
    for (const w of windows()) {
      const previous = solve(w.state);
      const own = previous.items[w.dragged];
      if (!own || own.inMenu || own.floating) continue;
      const drag = dockDrag(w.state, w.dragged, { ...w.options, previous, grab: { x: own.rect.width / 2, y: own.rect.height / 2 } });
      for (const l of drag.regions.lanes)
        for (const sp of l.spots) {
          const state = { kind: "spot" as const, spot: sp.id, point: { x: sp.landing.x + own.rect.width / 2, y: sp.landing.y + own.rect.height / 2 } };
          const landing = drag.landingOf(state);
          if (!landing) continue;
          const gs = drag.guides({ state, guides: drag.regions.lanes.map((x) => ({ lane: x.id, state })) });
          n++;
          for (const g of gs) if (g.kind !== "line" && overlaps(g.rect, landing)) bad.push(`${w.name}, ${sp.id}: ${g.id} over the landing`);
        }
    }
    expect(n).toBeGreaterThan(200);
    expect(bad.slice(0, 8)).toEqual([]);
  });
});
