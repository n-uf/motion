/**
 * Stretch positions (`LaneOptions.stretchPositions`). `"free"` is the default and gives exactly what no option gives;
 * `"pitched"` gives spots at a pitch and no sliding spot.
 * `"free"` gives each free stretch of a bar or a toolbar rail one sliding spot: its range runs from flush against the
 * neighbor before it to flush against the one after it, its `after(point, grab)` lands the item's start at the pointer
 * less the grab, clamped and snapped, with the neighbor unmoved, and a release at the press point is home. Over bars and
 * rails, start and end zones.
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, type Edge, type Lane, type LaneOptions, type Scene } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";
import { createLandingModel } from "@n-uf/motion/drag";
import { FLUSH, INSET, kitScene } from "./kit-scene";
import { modelScene } from "./model-scene";
import { bar, byId, group, windowScene } from "./scene-fixture";

type Host = "bar" | "rail";
type Zone = "start" | "end";
type Pt = { x: number; y: number };

/** Two toolbars `a` then `c` on a bar or a left rail, `gap` px of free room between them, both in `zone`. */
function pair(host: Host, zone: Zone, gap: number): Scene {
  const edge: Edge =
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

const lo = (r: Pt, ax: "x" | "y"): number => r[ax];
const ln = (r: { width: number; height: number }, ax: "x" | "y"): number => (ax === "x" ? r.width : r.height);
const scenes = (): [string, Scene][] => [
  ["window A", winScene(WINDOW_A, { size: 300 })],
  ["window", windowScene()],
  ["kit flush", kitScene(FLUSH, { W: 590, H: 757 })],
  ["kit inset", kitScene(INSET, { W: 1100, H: 760 })],
  ...[1, 2, 3, 4, 5, 6].map((seed): [string, Scene] => [`model ${seed}`, modelScene(seed, seed % 2 === 0, seed % 3 === 0, false)]),
  ...(["bar", "rail"] as const).flatMap((h) => (["start", "end"] as const).map((z): [string, Scene] => [`${h} ${z}`, pair(h, z, 90)])),
];
const movable = (s: Scene): string[] => Object.keys(s.items).filter((k) => !s.items[k]!.fixed && !s.items[k]!.closed).slice(0, 4);
/** What a host reads of a lane: spots without their targets (functions), and the marks. */
const plain = (ls: readonly Lane[]) => ls.map((l) => ({ ...l, spots: l.spots.map(({ target, ...sp }) => ({ ...sp, target: target.id })) }));

describe("stretch positions: the default and pitched", () => {
  it('"free" gives exactly the spots, stretches and marks the default gives, held spots included', () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const own = solve(s).items[id]?.rect;
        const o: LaneOptions = { previous: solve(s), ...(own ? { grab: { x: own.width / 3, y: own.height / 3 } } : {}) };
        const def = lanes(s, id, o);
        const free = lanes(s, id, { ...o, stretchPositions: "free" });
        expect(plain(free.lanes), `${name} ${id}`).toEqual(plain(def.lanes));
        for (const l of def.lanes.slice(0, 3))
          for (const sp of l.spots.filter((x) => x.slide).slice(0, 2)) expect(plain(lanes(s, id, { ...o, stretchPositions: "free", spot: sp.id }).lanes), `${name} ${id} ${sp.id}`).toEqual(plain(lanes(s, id, { ...o, spot: sp.id }).lanes));
        expect(def.lanes.some((l) => l.spots.some((sp) => sp.pitched)), `${name} ${id}`).toBe(false);
      }
  });

  it('"pitched" gives spots at a pitch and no sliding spot, on the same lanes and stretches as the default', () => {
    let pitchedSpots = 0;
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const own = solve(s).items[id]?.rect;
        const o: LaneOptions = { previous: solve(s), ...(own ? { grab: { x: own.width / 3, y: own.height / 3 } } : {}) };
        const pitched = lanes(s, id, { ...o, stretchPositions: "pitched" });
        expect(pitched.lanes.some((l) => l.spots.some((sp) => sp.slide)), `${name} ${id}`).toBe(false);
        expect(pitched.lanes.map((l) => l.id).sort(), `${name} ${id}`).toEqual(lanes(s, id, o).lanes.map((l) => l.id).sort());
        pitchedSpots += pitched.lanes.flatMap((l) => l.spots).filter((sp) => sp.pitched).length;
      }
    expect(pitchedSpots).toBeGreaterThan(0);
  });
});

describe("stretch positions: free", () => {
  it("the lanes stay sound: stretches tile each lane, ids are unique, a spot's landing is what its drop there commits", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const r = lanes(s, id, { previous: solve(s), stretchPositions: "free" });
        const ids = r.lanes.flatMap((l) => l.spots.map((sp) => sp.id));
        expect(new Set(ids).size, `${name} ${id}`).toBe(ids.length);
        for (const l of r.lanes) {
          const start = l.axis === "x" ? l.rect.x : l.rect.y;
          const end = start + ln(l.rect, l.axis);
          expect(Math.abs(l.spots[0]!.along[0] - start), `${name} ${id} ${l.id}`).toBeLessThan(1e-6);
          expect(Math.abs(l.spots.at(-1)!.along[1] - end), `${name} ${id} ${l.id}`).toBeLessThan(1e-6);
          for (let i = 1; i < l.spots.length; i++) expect(Math.abs(l.spots[i]!.along[0] - l.spots[i - 1]!.along[1])).toBeLessThan(1e-6);
          expect(l.spots.some((sp) => sp.pitched), `${name} ${id} ${l.id}`).toBe(false);
          for (const sp of l.spots) {
            if (!sp.slide || sp.home) continue;
            // The listed landing is where a pointer holding the item there lands it.
            const grab = { x: sp.landing.width / 2, y: sp.landing.height / 2 };
            const point = { x: sp.landing.x + grab.x, y: sp.landing.y + grab.y };
            const own = solve(s).items[id]!.rect;
            const g = { x: (own.width * grab.x) / sp.landing.width, y: (own.height * grab.y) / sp.landing.height };
            const got = sp.target.after(point, g).layout.items[id]!.rect;
            expect(Math.abs(lo(got, l.axis) - lo(sp.landing, l.axis)), `${name} ${id} ${sp.id}`).toBeLessThanOrEqual(1);
          }
        }
      }
  });

  for (const host of ["bar", "rail"] as const)
    for (const zone of ["start", "end"] as const)
      for (const gap of [40, 90, 200])
        for (const held of ["a", "c"] as const)
          describe(`${host}, ${zone} zone, ${gap} px apart, ${held} held`, () => {
            const s = pair(host, zone, gap);
            const seen = solve(s);
            const ax = host === "bar" ? "x" : "y";
            const edge = host === "bar" ? "top" : "rail";
            const other = held === "a" ? "c" : "a";
            const own = seen.items[held]!.rect;
            const nb = seen.items[other]!.rect;
            const w = ln(own, ax);
            const grab = { x: own.width * 0.3, y: own.height * 0.3 };
            const offset = ax === "x" ? grab.x : grab.y;
            const regions = lanes(s, held, { previous: seen, grab, stretchPositions: "free" });
            const lane = regions.lanes.find((l) => l.id === edge)!;
            const slides = lane.spots.filter((sp) => sp.slide);
            const e = s.edges.find((x) => x.id === edge)!;
            const edgeStart = lo(seen.edges[edge]!.rect, ax) + (e.pad?.start ?? 0);
            const edgeEnd = lo(seen.edges[edge]!.rect, ax) + ln(seen.edges[edge]!.rect, ax) - (e.pad?.end ?? 0);
            // The free stretches with the held item lifted (its neighbor stays where it is drawn): before and after it.
            const rooms = [
              [edgeStart, lo(nb, ax) - 4],
              [lo(nb, ax) + ln(nb, ax) + 4, edgeEnd],
            ].filter(([p, q]) => q! - p! >= w - 1e-6) as [number, number][];

            it("one sliding spot per free stretch, its range flush against the neighbors either side", () => {
              expect(slides.map((sp) => [Math.round(sp.slide!.from), Math.round(sp.slide!.to)])).toEqual(rooms.map(([p, q]) => [Math.round(p), Math.round(q - w)]));
              for (const sp of slides) {
                expect(sp.id.endsWith("@slide")).toBe(true);
                // Its ends snap, unless the item's own place lies within twice the snap distance (home wins there).
                const near = (v: number): boolean => !!sp.home && v !== lo(own, ax) && Math.abs(v - lo(own, ax)) <= 16;
                if (!near(sp.slide!.from)) expect(sp.slide!.snaps).toContain(sp.slide!.from);
                if (!near(sp.slide!.to)) expect(sp.slide!.snaps).toContain(sp.slide!.to);
                expect(sp.slide!.snapDistance).toBe(8);
              }
            });

            it("after(pointer) lands at the pointer less the grab, clamped and snapped, the neighbor unmoved", () => {
              expect(slides.length).toBe(rooms.length);
              for (const sp of slides) {
                const { from, to, snaps } = sp.slide!;
                const tries = [from - 30, from + 3, from + 7.9, from + 9.4, (from + to) / 2 + 0.4, to - 7, to + 40];
                for (const x of tries) {
                  const pointer = ax === "x" ? { x: x + offset, y: own.y + grab.y } : { x: own.x + grab.x, y: x + offset };
                  const after = sp.target.after(pointer, grab).layout;
                  const clamped = Math.min(to, Math.max(from, x));
                  const snap = snaps.filter((q) => Math.abs(q - clamped) <= 8).sort((p, q) => Math.abs(p - clamped) - Math.abs(q - clamped))[0];
                  const want = snap ?? Math.round(clamped);
                  expect(Math.abs(lo(after.items[held]!.rect, ax) - want), `${sp.id} at ${x}`).toBeLessThanOrEqual(0.5);
                  expect(after.items[held]!.edge).toBe(edge);
                  expect(Math.abs(lo(after.items[other]!.rect, ax) - lo(nb, ax)), `${sp.id} at ${x}: ${other} moved`).toBeLessThanOrEqual(0.5);
                }
              }
            });

            it("a release at the press point is home, and a ±6 px wobble there too", () => {
              const home = lane.spots.find((sp) => sp.home)!;
              expect(home.slide, home.id).toBeDefined();
              expect(home.slide!.snaps).toContain(lo(own, ax));
              expect(lo(home.landing, ax)).toBe(lo(own, ax));
              const press = { x: own.x + grab.x, y: own.y + grab.y };
              // Its drop there changes nothing.
              const after = home.target.after(press, grab);
              expect(after.layout.items[held]!.rect).toEqual(own);
              expect(after.scene.items[held]!.space ?? 0).toBe(s.items[held]!.space ?? 0);
              // The landing model, fed these regions and the grab: press, wobble, release.
              const m = createLandingModel({ regions, regionsFor: (spot) => lanes(s, held, { previous: seen, grab, stretchPositions: "free", spot }), home: { lane: edge, spot: home.id }, grab });
              let t = 0;
              m.update(press, t);
              for (let k = 0; k < 8; k++) for (const d of [6, -6]) m.update(ax === "x" ? { x: press.x + d, y: press.y } : { x: press.x, y: press.y + d }, (t += 16));
              for (let k = 0; k < 10; k++) m.update(ax === "x" ? { x: press.x + 5, y: press.y } : { x: press.x, y: press.y + 5 }, (t += 8));
              expect(m.release()).toEqual({ kind: "spot", lane: edge, spot: home.id, home: true, at: lo(own, ax) });
              // Away along the stretch and released: that is no longer home, and its drop lands where the frame showed.
              const room = home.slide!;
              const aim = Math.round((room.from + room.to) / 2) === Math.round(lo(own, ax)) ? room.from + 20 : (room.from + room.to) / 2;
              if (Math.abs(aim - lo(own, ax)) <= 8) return;
              const to = ax === "x" ? { x: aim + offset, y: press.y } : { x: press.x, y: aim + offset };
              const n = Math.ceil(Math.abs(lo(to, ax) - lo(press, ax)) / 1.6);
              for (let i = 1; i <= n; i++) m.update({ x: press.x + ((to.x - press.x) * i) / n, y: press.y + ((to.y - press.y) * i) / n }, (t += 8));
              for (let k = 0; k < 10; k++) m.update(to, (t += 8));
              const r = m.release();
              expect(r).toMatchObject({ kind: "spot", lane: edge, spot: home.id, home: false });
              const landed = home.target.after(to, grab).layout.items[held]!.rect;
              expect(Math.abs(lo(landed, ax) - (r as { at: number }).at)).toBeLessThanOrEqual(0.5);
              expect(Math.abs(lo(m.frame.landing!, ax) - lo(landed, ax))).toBeLessThanOrEqual(0.5);
            });
          });
});
