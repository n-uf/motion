/**
 * A shared corner is drawn by exactly one lane, whatever a host's lanes reach. The windows with an empty bar and empty
 * side rails (the real window, the kit window, the corner fixtures, the lab's windows with the top or bottom bar empty)
 * have their rails' lanes cut short by a host at both ends, by 0, 15, 32 and 71 px, so a lane may stop short of a bar's
 * band, reach half into it or all the way. With the pointer near either rail (8 and 4 px off it, or held in it, at its
 * head, middle and foot), near a bar or near neither, under guides "all" every point of every corner is covered by
 * exactly one drawn mark (a guide inside its own lane's rect, a line at its drawn thickness), under "near" by at most
 * one: never none, never two.
 */
import { createLandingModel, type LandingFrame } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "@n-uf/placement";
import { solve } from "../src";
import { dragOf, windows, type Drag } from "./lift-windows";

const inside = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 - x0 > 1e-6 && y1 - y0 > 1e-6 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
};
const covers = (r: Rect, p: Point): boolean => p.x >= r.x - 1e-6 && p.x <= r.x + r.width + 1e-6 && p.y >= r.y - 1e-6 && p.y <= r.y + r.height + 1e-6;
/** A line thinner than 2 px is drawn 2 px thick, centered on its place. */
function thick(r: Rect, kind: string): Rect {
  const vertical = r.width <= r.height;
  const own = vertical ? r.width : r.height;
  if (kind !== "line" || own >= 2) return r;
  const d = (2 - own) / 2;
  return vertical ? { x: r.x - d, y: r.y, width: 2, height: r.height } : { x: r.x, y: r.y - d, width: r.width, height: 2 };
}

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

/** The windows with empty bars and empty rails whose predictions share corners (a window with a drawn bar has fewer). */
const NAMES = [
  "kit: window 1, columns both sides",
  "real window, empty side rails",
  "empty-corners.json, tools",
  "columns-corner.json, g3",
  "lab: views and review in the top bar, tools",
  "lab: the title bar full, tools",
  "lab: the title bar full, zoom",
];
const WINDOWS = windows().filter((w) => NAMES.includes(w.name));
/** How far a host's rail lanes are cut short at each end, px. */
const CUTS = [0, 15, 32, 71];

describe("a shared corner of two empty lanes is covered by exactly one drawn mark, whatever the rails' lanes reach", () => {
  it("the windows are there", () => expect(WINDOWS.length).toBe(NAMES.length));
  for (const w of WINDOWS) {
    const d = dragOf(w)!;
    const seen = solve(w.state, { previous: d.options.previous! });
    const emptyIds = new Set(d.regions.lanes.filter((l) => w.state.edges.some((e) => e.id === l.id) && (seen.edges[l.id]?.cross ?? 0) <= 1e-6).map((l) => l.id));
    // Each rail with a prediction, and the empty bars it shares a corner with that lie across its column.
    const pairs = d.regions.lanes
      .filter((r) => r.axis === "y" && r.entry && r.corners)
      .flatMap((r) => r.corners!.map((id) => d.regions.lanes.find((l) => l.id === id)!).filter((b) => b.axis === "x" && emptyIds.has(b.id) && b.rect.x <= r.rect.x + 1 && b.rect.x + b.rect.width >= r.rect.x + r.rect.width - 1).map((b) => ({ r, b })));
    for (const cut of CUTS) {
      it(`${w.name}: rails' lanes cut ${cut} px short at both ends`, () => {
        expect(pairs.length).toBeGreaterThan(0);
        const rails = new Set(pairs.map((p) => p.r.id));
        const regions = { ...d.regions, lanes: d.regions.lanes.map((l) => (rails.has(l.id) ? { ...l, rect: { ...l.rect, y: l.rect.y + cut, height: l.rect.height - 2 * cut } } : l)) };
        const stage = d.regions.stage;
        // The pointer: beside each rail 8 and 4 px off it, and held in it, 200 px from its head, at its middle and 200 px from its foot (the landing then lies clear of the corners: the item over a corner is the hand cases'); beside each bar; far.
        const pointers: Point[] = [{ x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 }];
        for (const { r } of pairs) {
          const left = r.rect.x + r.rect.width / 2 < stage.x + stage.width / 2;
          const edge = left ? r.rect.x + r.rect.width : r.rect.x;
          for (const y of [r.rect.y + 200, r.rect.y + r.rect.height / 2, r.rect.y + r.rect.height - 200]) pointers.push({ x: edge + (left ? 8 : -8), y }, { x: edge + (left ? 4 : -4), y }, { x: r.rect.x + r.rect.width / 2, y });
        }
        // One held pointer per rail near each end (70 px from it): the item lies over a corner there, so a point under
        // that frame's own landing is skipped, and every other point must still be covered once.
        const nearEnd = new Set<Point>();
        for (const { r } of pairs)
          for (const y of [r.rect.y + cut + 70, r.rect.y + r.rect.height - cut - 70]) {
            const q = { x: r.rect.x + r.rect.width / 2, y };
            pointers.push(q);
            nearEnd.add(q);
          }
        for (const { b } of pairs) pointers.push({ x: 400, y: b.rect.y < stage.y + stage.height / 2 ? b.rect.y + b.rect.height + 8 : b.rect.y - 8 });
        const drawn = (f: LandingFrame) =>
          f.guides.flatMap((g) => {
            const r = inside(thick(g.rect, g.kind), regions.lanes.find((l) => l.id === g.lane)!.rect);
            return r ? [{ lane: g.lane, rect: r }] : [];
          });
        for (const to of pointers) {
          for (const mode of ["all", "near"] as const) {
            const f = settled(d, regions, mode, to);
            const marks = drawn(f);
            for (const { r, b } of pairs)
              for (const dx of [4, 15, r.rect.width - 4])
                for (const dy of [4, 15, b.rect.height - 4]) {
                  const p = { x: r.rect.x + dx, y: b.rect.y + dy };
                  // (Where neither lane's rect reaches the point, a host draws nothing there.)
                  if (![r, b].some((l) => covers(regions.lanes.find((x) => x.id === l.id)!.rect, p))) continue;
                  if (nearEnd.has(to) && f.landing && covers(f.landing, p)) continue;
                  const n = marks.filter((m) => covers(m.rect, p)).map((m) => m.lane);
                  const at = `${mode}, pointer ${to.x},${to.y} (${f.lane ?? "-"}/${f.region}), corner ${r.id}/${b.id} at ${p.x},${p.y}: ${n.join("+") || "none"}`;
                  if (mode === "all") expect(n.length, at).toBe(1);
                  else expect(n.length, at).toBeLessThanOrEqual(1);
                }
          }
        }
      });
    }
  }
});
