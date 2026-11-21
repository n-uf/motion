/**
 * A shared corner is drawn by exactly one lane, whatever a host's lanes reach. The windows with an empty bar and empty
 * side rails (the real window, the kit window, the corner fixtures) have their rails' lanes cut short by a host: from
 * `from` down, so a lane may stop short of the bar's band (or reach into it, or only part of the way). With the pointer
 * near either rail or the bar, or near neither, under guides "all" every point of the corner is covered by exactly one
 * drawn mark (a guide inside its own lane's rect), under "near" by at most one: never none, never two.
 */
import { createLandingModel, type LandingFrame } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/geometry";
import { solve } from "../src/scene";
import { dragOf, windows, type Drag } from "./lift-windows";

const inside = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 - x0 > 1e-6 && y1 - y0 > 1e-6 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
};
const covers = (r: Rect, p: Point): boolean => p.x >= r.x - 1e-6 && p.x <= r.x + r.width + 1e-6 && p.y >= r.y - 1e-6 && p.y <= r.y + r.height + 1e-6;

/** The last frame of a glide from the press to `to`, then a rest. */
function settled(d: Drag, regions: Drag["regions"], mode: "near" | "all", to: Point): LandingFrame {
  const m = createLandingModel({ regions, grab: d.grab, floatLanding: (p) => ({ x: p.x - d.grab.x, y: p.y - d.grab.y, width: d.size.width, height: d.size.height }), placeGuides: mode });
  let t = 0;
  m.update(d.press, 0);
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - d.press.x, to.y - d.press.y) / 0.15 / 8));
  for (let k = 1; k <= n; k++) m.update({ x: d.press.x + ((to.x - d.press.x) * k) / n, y: d.press.y + ((to.y - d.press.y) * k) / n }, (t += 8));
  let f!: LandingFrame;
  for (let k = 0; k < 30; k++) f = m.update(to, (t += 8));
  return f;
}

/** The windows with an empty bar and an empty rail at its end, for the bar and each rail whose predictions share a corner. */
const WINDOWS = windows().filter((w) => ["kit: window 1, columns both sides", "real window, empty side rails", "empty-corners-scene.json, tools", "columns-corner-scene.json, g3"].includes(w.name));

describe("a shared corner of two empty lanes is covered by exactly one drawn mark, whatever the rails' lanes reach", () => {
  it("the windows are there", () => expect(WINDOWS.length).toBe(4));
  for (const w of WINDOWS) {
    const d = dragOf(w)!;
    const seen = solve(w.scene, { previous: d.options.previous! });
    const empty = d.regions.lanes.filter((l) => w.scene.edges.some((e) => e.id === l.id) && (seen.edges[l.id]?.cross ?? 0) <= 1e-6);
    const bar = empty.find((l) => l.axis === "x" && l.id.endsWith("top"))!;
    const rails = empty.filter((l) => l.axis === "y" && l.corners?.includes(bar.id));
    for (const from of [0, bar.rect.height / 2, bar.rect.height, 71]) {
      it(`${w.name}: rails' lanes from y ${from}`, () => {
        // The rails' lanes cut short at their head, the bar's band at y 0–31 above them.
        const regions = { ...d.regions, lanes: d.regions.lanes.map((l) => (rails.some((r) => r.id === l.id) ? { ...l, rect: { ...l.rect, y: from, height: l.rect.y + l.rect.height - from } } : l)) };
        expect(rails.length).toBeGreaterThan(0);
        const pointers: Point[] = [
          { x: rails[0]!.rect.x + rails[0]!.rect.width + 8, y: 300 },
          { x: rails[rails.length - 1]!.rect.x - 8, y: 300 },
          { x: 400, y: bar.rect.y + bar.rect.height + 8 },
          { x: 400, y: 330 },
        ];
        for (const to of pointers)
          for (const mode of ["all", "near"] as const) {
            const f = settled(d, regions, mode, to);
            const marks = f.guides.flatMap((g) => {
              const r = inside(g.rect, regions.lanes.find((l) => l.id === g.lane)!.rect);
              return r ? [{ lane: g.lane, rect: r, kind: g.kind }] : [];
            });
            for (const r of rails)
              for (const dx of [4, 15, r.rect.width - 4])
                for (const dy of [4, 15, bar.rect.height - 4]) {
                  const p = { x: r.rect.x + dx, y: bar.rect.y + dy };
                  // (Under the item's landing a corner shows nothing: the item is there.)
                  if (f.landing && covers(f.landing, p)) continue;
                  const n = marks.filter((m) => m.kind !== "line" && covers(m.rect, p)).map((m) => m.lane);
                  const at = `${mode}, pointer ${to.x},${to.y}, corner ${r.id}/${bar.id} at ${p.x},${p.y}: ${n.join("+") || "none"}`;
                  if (mode === "all") expect(n.length, at).toBe(1);
                  else expect(n.length, at).toBeLessThanOrEqual(1);
                }
          }
      });
    }
  }
});
