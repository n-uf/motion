/**
 * The landing model (`@n-uf/motion/drag`) over `lanes()`: the two together, on a window with a toolbar bar and a toolbar
 * rail, swept at more speeds than the landing rows (`LANDING_CASES`, ./cases-landing.test.ts) play, and what a frame
 * shows is what the drop commits.
 */
import { createLandingModel, type LandingFrame, type LandingOptions } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/geometry";
import { lanes, solve, SPOT_PITCH, type Scene } from "../src/scene";
import { bar, byId, column, controls, group, panel, title } from "./scene-fixture";

/** A 1080×640 window: a top bar (y 0–36) with a at its start, a toolbar rail at the left (x 0–30, y 36–640): tools, zoom. */
const scene: Scene = {
  stage: { x: 0, y: 0, width: 1080, height: 640 },
  edges: [bar("top", "top", 0, ["a"]), { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: ["tools", "zoom"], cross: { min: 30, max: 30, rail: 30 }, compact: true }],
  items: byId([group("a", 1), group("tools", 2), group("zoom", 3)]),
  floats: [],
  floatKinds: ["group"],
};
const GRAB = { x: 10, y: 10 };

/** The model's options for a drag of `id` from its own place. */
function optionsFor(id: string, sc: Scene = scene): LandingOptions {
  const previous = solve(sc);
  const regions = lanes(sc, id, { previous });
  const home = regions.lanes.flatMap((l) => l.spots.filter((sp) => sp.home).map((sp) => ({ lane: l.id, spot: sp.id })))[0];
  return {
    regions,
    regionsFor: (spot) => lanes(sc, id, { previous, spot }),
    floatLanding: (p) => regions.float?.after(p, GRAB).layout.items[id]?.rect ?? null,
    ...(home ? { home } : {}),
    placeGuides: "near",
  };
}

/** Drive keys [ms, x, y] (linear between) every 8 ms; every frame with its point. */
function run(id: string, keys: readonly (readonly [number, number, number])[]): { p: Point; f: LandingFrame }[] {
  return runOn(scene, id, keys);
}
function runOn(sc: Scene, id: string, keys: readonly (readonly [number, number, number])[]): { p: Point; f: LandingFrame }[] {
  const m = createLandingModel(optionsFor(id, sc));
  const out: { p: Point; f: LandingFrame }[] = [];
  for (let t = 0; t <= keys.at(-1)![0] + 1e-6; t += 8) {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1]![0] < t) i++;
    const a = keys[i]!;
    const b = keys[Math.min(i + 1, keys.length - 1)]!;
    const u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 1;
    const p = { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u };
    out.push({ p, f: m.update(p, t) });
  }
  return out;
}
/** Keys through `points` at `speed` px/ms, then a rest of `rest` ms. */
function path(points: readonly Point[], speed: number, rest = 0): [number, number, number][] {
  const out: [number, number, number][] = [[0, points[0]!.x, points[0]!.y]];
  let t = 0;
  for (let i = 1; i < points.length; i++) {
    t += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y) / speed;
    out.push([t, points[i]!.x, points[i]!.y]);
  }
  if (rest > 0) out.push([t + rest, points.at(-1)!.x, points.at(-1)!.y]);
  return out;
}

/**
 * A document window like the lab's: a title bar (a fixed title, a toolbar, fixed controls), an empty top bar, a bottom
 * bar of two toolbars, toolbar rails at both sides (tools and zoom at the left), panel columns inside them.
 */
function labWindow(): Scene {
  const COL = { accepts: ["panel"], cross: { min: 180, max: 480, rail: 30 } };
  const rail = (id: string, side: "left" | "right", items: string[]): Scene["edges"][number] => ({ id, side, ring: 0, accepts: ["group"], items, cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } });
  return {
    stage: { x: 0, y: 0, width: 1080, height: 640 },
    edges: [
      bar("title", "top", 0, ["title", "tz", "controls"]),
      bar("top", "top", 1, []),
      bar("bottom", "bottom", 0, ["views", "review"]),
      rail("rail-left", "left", ["tools", "zoom"]),
      rail("rail-right", "right", []),
      column("left", "left", 1, ["pages", "notes"], { column: true, accepts: ["panel"] }),
      column("right", "right", 1, ["findings"], { column: true, accepts: ["panel"] }),
    ],
    items: byId([title(), group("tz", 1), controls(), group("tools", 2), group("zoom", 3), group("views", 4), group("review", 5), panel("pages", 6), panel("notes", 7), panel("findings", 8)]),
    floats: [],
    floatKinds: ["panel", "group"],
    columns: { left: COL, right: COL },
    sideColumns: "one",
  };
}

describe("a toolbar moved along an occupied bar or rail stays at the hand", () => {
  it("in every sweep both ways at 0.15–3 px/ms, the landing is never more than 48 px from the pointer while its lane holds it", () => {
    const s = labWindow();
    const l = solve(s);
    // Each toolbar along its own lane, end to end and back (the pointer over fixed chrome, where nothing lands, left out).
    const fixed = Object.entries(l.items).filter(([id]) => s.items[id]!.fixed).map(([, it]) => it.rect);
    const sweeps: [string, string, Point, Point][] = [
      ["views", "bottom", { x: 30, y: 622 }, { x: 1050, y: 622 }],
      ["tools", "rail-left", { x: 15, y: 70 }, { x: 15, y: 600 }],
      ["tz", "title", { x: 240, y: 16 }, { x: 990, y: 16 }],
    ];
    for (const [id, lane, a, b] of sweeps) {
      const g = l.items[id]!.rect;
      const press = { x: g.x + Math.min(10, g.width / 2), y: g.y + Math.min(10, g.height / 2) };
      for (const speed of [0.15, 0.3, 0.6, 1.2, 3])
        for (const [p0, p1] of [[a, b], [b, a]] as const) {
          let worst = 0;
          for (const { p, f } of runOn(s, id, path([press, p0, p1], speed, 80))) {
            if (f.lane !== lane || !f.landing || fixed.some((r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height)) continue;
            const l2 = f.landing;
            worst = Math.max(worst, Math.hypot(Math.max(l2.x - p.x, 0, p.x - (l2.x + l2.width)), Math.max(l2.y - p.y, 0, p.y - (l2.y + l2.height))));
          }
          expect([id, speed, p0.x, p0.y, Math.round(worst) <= 48 ? "ok" : Math.round(worst)]).toEqual([id, speed, p0.x, p0.y, "ok"]);
        }
    }
  });
});

describe("the landing model over lanes(), at more speeds than the landing rows", () => {
  it("the window's edge docks at 0.6–3 px/ms, on it and up to 40 px past it", () => {
    for (const speed of [0.6, 1.5, 3])
      for (const end of [{ x: 0, y: 400 }, { x: -10, y: 400 }, { x: -40, y: 400 }]) {
        const f = run("a", path([{ x: 500, y: 400 }, end], speed, 40)).at(-1)!.f;
        expect([speed, end.x, f.region, f.lane]).toEqual([speed, end.x, "lane", "rail-left"]);
      }
  });

  it("a fast hand along the bar's free stretch, 450–1200 px/s, keeps the item within a pitch of the hand", () => {
    for (const speed of [0.45, 0.8, 1.2]) {
      const frames = run("a", path([{ x: 110, y: 18 }, { x: 970, y: 18 }], speed));
      for (const { p, f } of frames) {
        expect(f.lane, `${speed} ${p.x}`).toBe("top");
        const l = f.landing!;
        expect(Math.max(0, l.x - p.x, p.x - (l.x + l.width)), `${speed} ${p.x}`).toBeLessThanOrEqual(SPOT_PITCH);
      }
    }
  });

  it("a hand across docked items at 0.3–3 px/ms, both ways, trails no further than a slow one does, plus 40 px", () => {
    const crowded: Scene = { ...scene, edges: [bar("top", "top", 0, ["a", "b", "c"]), scene.edges[1]!], items: byId([group("a", 1), group("b", 4), group("c", 5), group("tools", 2), group("zoom", 3)]) };
    const worst = (keys: [number, number, number][]): number => {
      const frames = runOn(crowded, "zoom", keys);
      return Math.max(...frames.filter(({ f }) => f.lane === "top" && f.landing).map(({ p, f }) => Math.max(0, f.landing!.x - p.x, p.x - (f.landing!.x + f.landing!.width))));
    };
    for (const [a, b] of [[40, 1040], [1040, 40]] as const) {
      const pts = [{ x: a, y: 18 }, { x: b, y: 18 }];
      const slow = worst(path(pts, 0.05));
      for (const speed of [0.3, 0.6, 1.2, 3]) expect(worst(path(pts, speed)), `${a}→${b} @${speed}`).toBeLessThanOrEqual(slow + 40);
    }
  });

  it("what a frame shows is what the drop commits", () => {
    const byId = new Map(lanes(scene, "zoom", { previous: solve(scene) }).lanes.flatMap((l) => l.spots).map((sp) => [sp.id, sp] as const));
    const frames = run("zoom", path([{ x: 15, y: 160 }, { x: 15, y: 18 }, { x: 900, y: 18 }, { x: 15, y: 18 }, { x: 15, y: 500 }], 0.3, 40));
    for (const { f } of frames) {
      if (f.region !== "lane" || !f.spot) continue;
      const sp = byId.get(f.spot)!;
      if (sp.home) continue;
      expect(sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout.items.zoom?.rect, f.spot).toEqual(f.landing);
    }
  });
});
