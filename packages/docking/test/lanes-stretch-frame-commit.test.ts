/**
 * A sliding spot's frame is its commit. Over a free stretch the landing model's frame (`landingOf` its state), its
 * release's `after` and the spot's `target.after(point, grab)` are one computation (`LaneSlide`): the start at the
 * pointer less the grab, clamped to the stretch, the nearest snap point within the snap distance, else a whole pixel. So
 * for any pointer and any grab, fractional or not, the rect the frame drew is the rect the drop commits.
 */
import { describe, expect, it } from "vitest";
import { createLandingModel } from "@n-uf/motion/drag";
import { dockDrag, lanes, solve, type DockEdge, type DockLane, type DockSpot, type DockState } from "../src";
import { bar, byId, group } from "./fixture";

type Host = "bar" | "rail";
type Zone = "start" | "end";

/** Two toolbars `a` then `c` on a bar or a left rail, `gap` px of free room between them, both in `zone`. */
function pair(host: Host, zone: Zone, gap: number): DockState {
  const edge: DockEdge =
    host === "bar"
      ? bar("top", "top", 0, ["a", "c"])
      : { id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["a", "c"], cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } };
  const align = zone === "end" ? { align: "end" as const } : {};
  return {
    stage: { x: 0, y: 0, width: 1000, height: 700 },
    edges: [edge, bar("bottom", "bottom", 0, ["g"])],
    items: byId([{ ...group("a", 1), ...align, ...(zone === "end" ? { space: gap } : {}) }, { ...group("c", 2), ...align, ...(zone === "start" ? { space: gap } : {}) }, group("g", 3)]),
    floats: [],
    floatKinds: ["group"],
  };
}

/** Fractional neighbors: a leading toolbar keeping 3.4 px and a stage 1030.2 wide put a stretch's ends off the pixel grid. */
function fractional(width = 1030.2, lead = 3.4): DockState {
  return {
    stage: { x: 0, y: 0, width, height: 700 },
    edges: [bar("top", "top", 0, ["a", "b", "c"]), bar("bottom", "bottom", 0, ["g"])],
    items: byId([{ ...group("a", 1), space: lead }, group("b", 2), { ...group("c", 3), space: 300, align: "end" }, group("g", 4)]),
    floats: [],
    floatKinds: ["group"],
  };
}

const states = (): [string, DockState, string][] => [
  ...(["bar", "rail"] as const).flatMap((h) => (["start", "end"] as const).flatMap((z) => [90].map((gap): [string, DockState, string] => [`${h} ${z} ${gap}`, pair(h, z, gap), "c"]))),
  ...(["bar", "rail"] as const).flatMap((h) => (["start", "end"] as const).map((z): [string, DockState, string] => [`${h} ${z} held a`, pair(h, z, 90), "a"])),
  ["fractional", fractional(), "c"],
  // A center dock a fraction of a pixel past a stretch's start: two snap points there.
  ["fractional center dock", fractional(1032.6, 0), "c"],
];

describe("a sliding spot: the frame is the commit", () => {
  for (const [name, s, held] of states())
    it(`${name}: for every fractional pointer and grab, the frame's rect is the committed rect and release().at is where both start`, () => {
      const seen = solve(s);
      const own = seen.items[held]!.rect;
      let compared = 0;
      for (const [fx, fy] of [
        [0.1, 0.5],
        [0.5, 0.2],
        [0.77, 0.9],
      ] as const) {
        const grab = { x: own.width * fx + 0.37, y: own.height * fy + 0.21 };
        const drag = dockDrag(s, held, { previous: seen, grab, stretchPositions: "free" });
        const regions = drag.regions;
        expect(regions.lanes).toEqual(lanes(s, held, { previous: seen, grab, stretchPositions: "free" }).lanes);
        for (const lane of regions.lanes as readonly DockLane[]) {
          const ax = lane.axis;
          for (const spot of lane.spots as readonly DockSpot[]) {
            const slide = spot.slide;
            if (!slide) continue;
            // The listed slide carries the grain the landing model rounds by.
            expect(slide.step, spot.id).toBe(1);
            const m = createLandingModel({ ...drag, home: { lane: lane.id, spot: spot.id } });
            const across = ax === "x" ? lane.rect.y + lane.rect.height / 2 : lane.rect.x + lane.rect.width / 2;
            const at = (a: number) => (ax === "x" ? { x: a, y: across } : { x: across, y: a });
            let t = 0;
            // The pointer sweeps the spot's stretch in 1.37 px steps (its two ends and a margin past each included).
            for (let a = spot.along[0] + 0.25; a < spot.along[1]; a += 1.37) {
              const p = at(a);
              const f = m.update(p, (t += 8));
              if (f.spot !== spot.id || !f.landing) continue;
              const committed = spot.target.after(p, grab).layout.items[held]!.rect;
              const label = `${spot.id} pointer ${a} grab ${grab.x},${grab.y}`;
              for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(f.landing[k] - committed[k]), `${label} ${k}`).toBeLessThan(1e-6);
              const start = f.landing[ax];
              // Whole pixels, unless it is a snap point of the spot.
              expect(Number.isInteger(start) || slide.snaps.some((q) => Math.abs(q - start) < 1e-9), `${label}: ${start}`).toBe(true);
              expect(start, label).toBeGreaterThanOrEqual(Math.min(slide.from, slide.to) - 1e-9);
              expect(start, label).toBeLessThanOrEqual(Math.max(slide.from, slide.to) + 1e-9);
              const r = m.release(p, t);
              expect(r, label).toMatchObject({ kind: "spot", lane: lane.id, spot: spot.id, point: p });
              expect(drag.after(r).landing![ax], label).toBe(start);
              compared++;
            }
          }
        }
      }
      expect(compared, name).toBeGreaterThan(60);
    });
});
