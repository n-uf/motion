/**
 * The landing model (`@n-uf/motion/drag`) over `lanes()`: the two together, on a window with a toolbar bar and a toolbar
 * rail, swept at more speeds than the landing rows (`LANDING_CASES`, ./cases-landing.test.ts) play, and what a frame
 * shows is what the drop commits.
 */
import { createLandingModel, type LandingFrame, type LandingOptions } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/geometry";
import { lanes, solve, SPOT_PITCH, type Scene, type SceneItem } from "../src/scene";
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
/**
 * As a real mouse and page: the pointer sampled every 12 ms (steps of 7 px at 600 px/s), the model updated on 60 Hz
 * frames with the latest sample, every frame kept (the last one before each hop included).
 */
function runMouse(sc: Scene, id: string, keys: readonly (readonly [number, number, number])[]): { p: Point; f: LandingFrame }[] {
  const m = createLandingModel(optionsFor(id, sc));
  const out: { p: Point; f: LandingFrame }[] = [];
  const at = (t: number): Point => {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1]![0] < t) i++;
    const a = keys[i]!;
    const b = keys[Math.min(i + 1, keys.length - 1)]!;
    const u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 1;
    return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u };
  };
  for (let t = 0; t <= keys.at(-1)![0] + 1e-6; t += 1000 / 60) {
    const p = at(Math.floor(t / 12) * 12);
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
  // The lab's toolbar lengths along a bar: they differ, so a swap passes a longer or a shorter neighbor.
  const sized = (id: string, used: number, w: number): SceneItem => {
    const g0 = group(id, used);
    return { ...g0, forms: { ...g0.forms, row: [{ ...g0.forms.row![0]!, main: { min: w, natural: w } }, ...g0.forms.row!.slice(1)] } };
  };
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
    items: byId([title(), sized("tz", 1, 161), controls(), sized("tools", 2, 158), sized("zoom", 3, 161), sized("views", 4, 227), sized("review", 5, 230), panel("pages", 6), panel("notes", 7), panel("findings", 8)]),
    floats: [],
    floatKinds: ["panel", "group"],
    columns: { left: COL, right: COL },
    sideColumns: "one",
  };
}

describe("a toolbar moved along an occupied bar or rail stays at the hand", () => {
  /**
   * The worst distance from the pointer to the landing while `lane` holds `id`, the pointer over no fixed chrome (nothing
   * lands there; of a title that grows to fill the bar, only its natural length counts as chrome): on the frames just
   * before a hop (the next frame holds another spot) and on every other.
   */
  const worstAlong = (s: Scene, id: string, lane: string, keys: [number, number, number][], play: typeof runOn = runOn): { steady: number; beforeHop: number } => {
    const l = solve(s);
    const fixed = Object.entries(l.items)
      .filter(([k]) => s.items[k]!.fixed)
      .map(([k, it]) => {
        const main = s.items[k]!.forms.row?.[0]?.main;
        return main?.grows ? { ...it.rect, width: Math.min(it.rect.width, main.natural) } : it.rect;
      });
    const frames = play(s, id, keys);
    const out = { steady: 0, beforeHop: 0 };
    frames.forEach(({ p, f }, i) => {
      if (f.lane !== lane || !f.landing || fixed.some((r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height)) return;
      const l2 = f.landing;
      const d = Math.hypot(Math.max(l2.x - p.x, 0, p.x - (l2.x + l2.width)), Math.max(l2.y - p.y, 0, p.y - (l2.y + l2.height)));
      const next = frames[i + 1]?.f;
      const hop = !!next && next.lane === lane && next.spot !== f.spot;
      if (hop) out.beforeHop = Math.max(out.beforeHop, d);
      else out.steady = Math.max(out.steady, d);
    });
    return out;
  };
  const pressOn = (s: Scene, id: string): Point => {
    const g = solve(s).items[id]!.rect;
    return { x: g.x + Math.min(10, g.width / 2), y: g.y + Math.min(10, g.height / 2) };
  };
  // R12: within 48 px on every frame, but the single frame before a hop, which may reach 56 px (a long neighbor passed
  // with one 6 px margin everywhere, so no wobble flips the spot).
  const BOUND = 48;
  const BEFORE_HOP = 56;
  const ok = (w: { steady: number; beforeHop: number }): string => (Math.round(w.steady) <= BOUND && Math.round(w.beforeHop) <= BEFORE_HOP ? "ok" : `${Math.round(w.steady)} / ${Math.round(w.beforeHop)} before a hop`);

  it(`in every sweep both ways at 0.15–3 px/ms, the landing is within ${BOUND} px of the pointer while its lane holds it (${BEFORE_HOP} on the frame before a hop)`, () => {
    const s = labWindow();
    // Each toolbar along its own lane, end to end and back, over the title too (it grows to fill the bar).
    const sweeps: [string, string, Point, Point][] = [
      ["views", "bottom", { x: 30, y: 622 }, { x: 1050, y: 622 }],
      ["tools", "rail-left", { x: 15, y: 70 }, { x: 15, y: 600 }],
      ["tz", "title", { x: 20, y: 16 }, { x: 990, y: 16 }],
    ];
    for (const [id, lane, a, b] of sweeps)
      for (const speed of [0.15, 0.3, 0.6, 1.2, 3])
        for (const [p0, p1] of [[a, b], [b, a]] as const) expect([id, speed, p0.x, p0.y, ok(worstAlong(s, id, lane, path([pressOn(s, id), p0, p1], speed, 80)))]).toEqual([id, speed, p0.x, p0.y, "ok"]);
  });

  it(`the UI check's paths, as a mouse plays them too: zoom up a hand-made rail past tools, a toolbar along the title bar, tools from its float along the bottom bar, within ${BOUND} px (${BEFORE_HOP} before a hop)`, () => {
    // Tools and zoom dropped in the rail by hand: tools keeps 80 px before it, zoom (at the rail's end) 100 px after it.
    const base = labWindow();
    const rail: Scene = { ...base, items: { ...base.items, tools: { ...base.items.tools!, space: 80 }, zoom: { ...base.items.zoom!, align: "end", space: 100 } } };
    const tools = solve(rail).items.tools!.rect;
    // A title bar of the title and the controls (tz out of it): views taken from the bottom bar into it and along it.
    const title: Scene = { ...base, edges: base.edges.map((e) => (e.id === "title" ? { ...e, items: ["title", "controls"] } : e.id === "bottom" ? { ...e, items: ["views", "review", "tz"] } : e)) };
    // Tools floating, taken onto the bottom bar at its start and right along it, past views and review.
    const floating: Scene = { ...base, edges: base.edges.map((e) => (e.id === "rail-left" ? { ...e, items: ["zoom"] } : e)), floats: [{ id: "tools", rect: { x: 600, y: 300, width: 158, height: 28 } }] };
    for (const play of [runOn, runMouse])
      for (const speed of [0.15, 0.3, 0.6]) {
        const how = play === runOn ? "125 Hz" : "mouse";
        const z = pressOn(rail, "zoom");
        // Up past tools, then down to the rail's far end (zoom keeps its own 100 px there).
        expect(["rail", how, speed, ok(worstAlong(rail, "zoom", "rail-left", path([z, { x: z.x, y: z.y - 10 }, { x: z.x, y: tools.y - 50 }], speed, 300), play))]).toEqual(["rail", how, speed, "ok"]);
        expect(["rail end", how, speed, ok(worstAlong(rail, "zoom", "rail-left", path([z, { x: z.x, y: z.y + 10 }, { x: z.x, y: 632 }], speed, 300), play))]).toEqual(["rail end", how, speed, "ok"]);
        const v = pressOn(title, "views");
        expect(["title", how, speed, ok(worstAlong(title, "views", "title", path([v, { x: 420, y: 16 }, { x: 1000, y: 16 }, { x: 20, y: 16 }], speed, 300), play))]).toEqual(["title", how, speed, "ok"]);
        const t = pressOn(floating, "tools");
        expect(["bottom", how, speed, ok(worstAlong(floating, "tools", "bottom", path([t, { x: 40, y: 622 }, { x: 1040, y: 622 }], speed, 300), play))]).toEqual(["bottom", how, speed, "ok"]);
      }
  });
});

describe("guides across a hop", () => {
  it("no guide goes and comes back while its lane is held: a mark keeps its id as the held item hops past it", () => {
    const s = labWindow();
    const base = s;
    const rail: Scene = { ...base, items: { ...base.items, tools: { ...base.items.tools!, space: 80 }, zoom: { ...base.items.zoom!, align: "end", space: 100 } } };
    const g = (sc: Scene, id: string): Point => {
      const r = solve(sc).items[id]!.rect;
      return { x: r.x + 10, y: r.y + 10 };
    };
    const slides: [Scene, string, string, Point[]][] = [
      [s, "views", "bottom", [{ x: 30, y: 622 }, { x: 1050, y: 622 }, { x: 30, y: 622 }]],
      [rail, "zoom", "rail-left", [{ x: 15, y: 590 }, { x: 15, y: 60 }, { x: 15, y: 590 }]],
    ];
    for (const [sc, id, lane, pts] of slides)
      for (const speed of [0.15, 0.3, 0.6]) {
        const frames = runOn(sc, id, path([g(sc, id), ...pts], speed, 80)).filter(({ f }) => f.lane === lane);
        const seen: Set<string>[] = frames.map(({ f }) => new Set(f.guides.filter((x) => x.lane === lane).map((x) => x.id)));
        let blinks = 0;
        let note = "";
        // A host keeps guides 2 px clear of where the item is drawn: a line on the landing's own edge would come and go
        // with the item's glide. None is there.
        for (const { f } of frames)
          for (const x of f.guides)
            if (x.kind === "line" && f.landing) {
              const l = f.landing;
              const near = x.rect.x < l.x + l.width + 2 && l.x - 2 < x.rect.x + x.rect.width && x.rect.y < l.y + l.height + 2 && l.y - 2 < x.rect.y + x.rect.height;
              if (near) {
                blinks++;
                note ||= `${x.id} on the landing's edge`;
              }
            }
        for (let i = 1; i < seen.length; i++)
          for (const gid of seen[i - 1]!)
            if (!seen[i]!.has(gid) && seen.slice(i + 1, i + 13).some((x) => x.has(gid))) {
              blinks++;
              note ||= gid;
            }
        expect([id, speed, blinks, note]).toEqual([id, speed, 0, ""]);
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
