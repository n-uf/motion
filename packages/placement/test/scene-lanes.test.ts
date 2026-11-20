/**
 * `lanes()`: the lanes, spots and stretches a landing model reads. Placement's share of the landing model's properties:
 * the stretches tile each lane, a spot's landing is what its drop commits, ids are stable and unique, no spot is of
 * another kind's lane, a column's stretches end at the middle of its panels (halves), the pitched spots on a bar's free
 * stretches land where they aim, and the document region excludes what is docked.
 */
import { describe, expect, it } from "vitest";
import { lanes, refusals, solve, SPOT_PITCH, targets, type Regions, type Scene } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";
import { createLandingModel } from "@n-uf/motion/drag";
import { FLUSH, INSET, kitScene } from "./kit-scene";
import { modelScene } from "./model-scene";
import { bar, byId, group } from "./scene-fixture";

const scenes = (): [string, Scene][] => [
  ["window A", winScene(WINDOW_A, { size: 300 })],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed): [string, Scene] => [`model ${seed}`, modelScene(seed, seed % 2 === 0, seed % 3 === 0, false)]),
];
const movable = (s: Scene): string[] => Object.keys(s.items).filter((k) => !s.items[k]!.fixed && !s.items[k]!.closed).slice(0, 4);
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

describe("lanes()", () => {
  it("each lane's stretches tile it, in order, from end to end", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const r = lanes(s, id, { previous: solve(s) });
        for (const l of r.lanes) {
          const start = l.axis === "x" ? l.rect.x : l.rect.y;
          const end = start + (l.axis === "x" ? l.rect.width : l.rect.height);
          expect(near(l.spots[0]!.along[0], start), `${name} ${id} ${l.id} start`).toBe(true);
          expect(near(l.spots.at(-1)!.along[1], end), `${name} ${id} ${l.id} end`).toBe(true);
          for (let i = 1; i < l.spots.length; i++) expect(near(l.spots[i]!.along[0], l.spots[i - 1]!.along[1]), `${name} ${id} ${l.id} ${i}`).toBe(true);
          for (const sp of l.spots) expect(sp.along[1] + 1e-6 >= sp.along[0], `${name} ${id} ${sp.id}`).toBe(true);
        }
      }
  });

  it("a spot's landing is what its drop commits, and its ids are unique", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const r = lanes(s, id, { previous: solve(s) });
        const ids = r.lanes.flatMap((l) => l.spots.map((sp) => sp.id));
        expect(new Set(ids).size, `${name} ${id}`).toBe(ids.length);
        for (const l of r.lanes)
          for (const sp of l.spots) {
            if (sp.home) continue;
            expect(sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout.items[id]?.rect, `${name} ${id} ${sp.id}`).toEqual(sp.landing);
          }
      }
  });

  it("no spot lies in a lane that doesn't take the item's kind", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const kind = s.items[id]!.kind;
        for (const l of lanes(s, id).lanes) {
          const edge = s.edges.find((e) => e.id === l.id);
          if (edge) expect(edge.accepts.includes(kind), `${name} ${id} ${l.id}`).toBe(true);
        }
      }
  });

  it("ids survive the window growing: every spot keeps its id", () => {
    for (const [name, s] of scenes().slice(0, 4))
      for (const id of movable(s)) {
        const before = lanes(s, id).lanes.flatMap((l) => l.spots.filter((sp) => !sp.pitched).map((sp) => sp.id));
        const grown: Scene = { ...s, stage: { ...s.stage, width: s.stage.width + 120 } };
        const after = new Set(lanes(grown, id).lanes.flatMap((l) => l.spots.map((sp) => sp.id)));
        for (const sid of before) expect(after.has(sid), `${name} ${id} ${sid}`).toBe(true);
      }
  });

  it("a column's stretches end at the middle of its panels as drawn (halves)", () => {
    const s = winScene(WINDOW_A, { size: 300 });
    for (const id of movable(s).filter((k) => s.items[k]!.kind === "panel")) {
      const r = lanes(s, id, { previous: solve(s) });
      const l = solve(s);
      for (const lane of r.lanes) {
        const panels = Object.entries(l.items).filter(([k, it]) => k !== id && it.edge === lane.id && it.formKind === "open");
        for (let i = 1; i < lane.spots.length; i++) {
          const cut = lane.spots[i]!.along[0];
          const between = panels.filter(([, it]) => it.rect.y + it.rect.height / 2 > lane.spots[i - 1]!.landing.y + lane.spots[i - 1]!.landing.height / 2 && it.rect.y + it.rect.height / 2 < lane.spots[i]!.landing.y + lane.spots[i]!.landing.height / 2);
          if (between.length) expect(between.some(([, it]) => near(it.rect.y + it.rect.height / 2, cut)), `${id} ${lane.id} ${i}`).toBe(true);
        }
      }
    }
  });

  it("one generation: its refusals are refusals()'s, and every spot that isn't pitched is one of targets()", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const o = { previous: solve(s) };
        const r = lanes(s, id, o);
        expect(r.refusals.map((x) => x.id), `${name} ${id}`).toEqual(refusals(s, id, o).map((x) => x.id));
        const ids = new Set(targets(s, id, o).map((t) => t.id));
        for (const sp of r.lanes.flatMap((l) => l.spots)) if (!sp.pitched) expect(ids.has(sp.target.id), `${name} ${id} ${sp.id}`).toBe(true);
      }
  });

  it("the document region leaves out every drawn edge and docked item", () => {
    for (const [name, s] of scenes().slice(0, 4)) {
      const id = movable(s)[0]!;
      const r: Regions = lanes(s, id);
      const l = solve(s);
      for (const e of Object.values(l.edges)) if (e.cross > 0) expect(r.blocked.some((b) => b === e.rect || (b.x === e.rect.x && b.y === e.rect.y && b.width === e.rect.width)), `${name} ${e.rect.x}`).toBe(true);
    }
  });
});

describe("pitched spots on a bar's free stretches", () => {
  /** A 1200 px top bar with one start item a; g held from the bottom bar. */
  const win = (): Scene => ({
    stage: { x: 0, y: 0, width: 1200, height: 700 },
    edges: [bar("top", "top", 0, ["a"]), bar("bottom", "bottom", 0, ["g"])],
    items: byId([group("a", 1), group("g", 2)]),
    floats: [],
    floatKinds: ["group"],
  });

  /** The worst distance from a point of a lane's free stretches (not over an item) to its spot's landing. */
  const worst = (s: Scene, lane: string): number => {
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === lane)!;
    const items = Object.entries(solve(s).items).filter(([id, it]) => id !== "g" && it.edge === lane).map(([, it]) => it.rect);
    let w = 0;
    for (const sp of top.spots)
      for (let x = sp.along[0]; x <= sp.along[1]; x += 4) if (!items.some((r) => x >= r.x && x <= r.x + r.width)) w = Math.max(w, Math.max(0, sp.landing.x - x, x - (sp.landing.x + sp.landing.width)));
    return w;
  };

  it("fill the free stretch at the pitch, land where they aim, and put the toolbar within a pitch of any free point", () => {
    const s = win();
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const pitched = top.spots.filter((sp) => sp.pitched);
    expect(pitched.length).toBeGreaterThan(5);
    expect(worst(s, "top")).toBeLessThanOrEqual(SPOT_PITCH);
    // A pitched spot's drop keeps it there.
    for (const sp of pitched) expect(sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).scene.items.g!.space).toBeGreaterThan(0);
  });

  it("an empty bar gets them too, over its whole length", () => {
    const s: Scene = { ...win(), edges: [bar("top", "top", 0, []), bar("bottom", "bottom", 0, ["g"])], items: byId([group("g", 2)]) };
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    expect(top.spots.filter((sp) => sp.pitched).length).toBeGreaterThan(10);
    expect(worst(s, "top")).toBeLessThanOrEqual(SPOT_PITCH);
  });

  it("keep their ids while the window grows", () => {
    const s = win();
    const ids = (sc: Scene): string[] => lanes(sc, "g").lanes.flatMap((l) => l.spots.filter((sp) => sp.pitched).map((sp) => sp.id));
    const before = ids(s).filter((id) => id.startsWith("top/start/"));
    const after = new Set(ids({ ...s, stage: { ...s.stage, width: 1320 } }));
    for (const id of before) expect(after.has(id), id).toBe(true);
  });

  it("none with the pitch off", () => {
    const s = win();
    expect(lanes(s, "g", { pitch: 0 }).lanes.flatMap((l) => l.spots).some((sp) => sp.pitched)).toBe(false);
  });
});

describe("lanes() with a spot held", () => {
  it("a column's stretches end at the middle of its panels as drawn in that spot's layout (halves)", () => {
    // Findings held over Annotations and Pages in the left column.
    const s = winScene(WINDOW_A, { size: 300, columns: { left: [["annotations", "pages"]], right: [["findings"]] } });
    const prev = solve(s);
    const left = lanes(s, "findings", { previous: prev }).lanes.find((l) => l.id === "left-0")!;
    for (const held of left.spots) {
      const lane = lanes(s, "findings", { previous: prev, spot: held.id }).lanes.find((l) => l.id === "left-0")!;
      const drawn = held.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
      const middles = ["annotations", "pages"].map((id) => drawn.items[id]!.rect).map((r) => r.y + r.height / 2);
      const cuts = lane.spots.slice(1).map((sp) => sp.along[0]);
      expect(cuts.map(Math.round), held.id).toEqual(middles.map(Math.round));
    }
  });

  it("every cut lies inside its lane and in order", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const prev = solve(s);
        const r = lanes(s, id, { previous: prev });
        for (const l of r.lanes)
          for (const held of l.spots.slice(0, 3)) {
            const lane = lanes(s, id, { previous: prev, spot: held.id }).lanes.find((x) => x.id === l.id)!;
            const start = l.axis === "x" ? lane.rect.x : lane.rect.y;
            const end = start + (l.axis === "x" ? lane.rect.width : lane.rect.height);
            for (const sp of lane.spots) {
              expect(sp.along[0] <= sp.along[1] + 1e-6, `${name} ${id} ${sp.id}`).toBe(true);
              expect(sp.along[0] >= start - 1e-6 && sp.along[1] <= end + 1e-6, `${name} ${id} ${sp.id}`).toBe(true);
            }
          }
      }
  });

  it("is remembered: the same scene and options give the same lanes, and a held spot reworks only its lane's stretches (the others' marks follow its layout)", () => {
    const s = winScene(WINDOW_A, { size: 300 });
    const prev = solve(s);
    const a = lanes(s, "pages", { previous: prev });
    expect(lanes(s, "pages", { previous: prev }).lanes).toBe(a.lanes);
    const held = a.lanes.find((l) => l.id === "left-0")!.spots.find((sp) => !sp.home)!;
    const b = lanes(s, "pages", { previous: prev, spot: held.id });
    const stretches = (l: (typeof a.lanes)[number]) => ({ id: l.id, rect: l.rect, spots: l.spots.map((sp) => [sp.id, sp.along]), refused: l.refused });
    for (const l of b.lanes) if (l.id !== "left-0") expect(stretches(l)).toEqual(stretches(a.lanes.find((x) => x.id === l.id)!));
  });
});

describe("lanes(): a rail drop strip's lane is the strip at the window's side", () => {
  for (const [name, k] of [
    ["flush", FLUSH],
    ["inset", INSET],
  ] as const)
    it(`${name}: with a column docked at the side, the side's rail lane is the strip (railStripWidth), not the column; a panel brought fast into the column and held lands by halves there`, () => {
      const s: Scene = { ...kitScene(k, { W: 1400, H: 800 }), railDrop: { panel: { railStripWidth: 24 } } };
      const previous = solve(s);
      const rs = lanes(s, "findings", { previous });
      for (const side of ["left", "right"] as const) {
        const rail = rs.lanes.find((l) => l.id === `rail:${side}`)!;
        const strip = rail.spots[0]!.target.strip!;
        expect([side, rail.rect]).toEqual([side, strip]);
        expect(rail.rect.width).toBe(24);
      }
      // Findings brought fast (1.5 px/ms) from its own column into the left column's middle and held there: it settles
      // in that column (by halves), never the rail.
      const col = previous.edges["left-0"]!.rect;
      const own = previous.items.findings!.rect;
      const press = { x: own.x + 20, y: own.y + 10 };
      const home = rs.lanes.flatMap((l) => l.spots.filter((sp) => sp.home).map((sp) => ({ lane: l.id, spot: sp.id })))[0];
      for (const y of [200, 300, 500]) {
        const mm = createLandingModel({ regions: rs, regionsFor: (spot) => lanes(s, "findings", { previous, spot }), ...(home ? { home } : {}) });
        const to = { x: col.x + col.width / 2, y };
        const n = Math.ceil(Math.hypot(to.x - press.x, to.y - press.y) / 1.5 / 8);
        let t = 0;
        mm.update(press, t);
        for (let i = 1; i <= n; i++) mm.update({ x: press.x + ((to.x - press.x) * i) / n, y: press.y + ((to.y - press.y) * i) / n }, (t += 8));
        for (let i = 0; i < 30; i++) mm.update(to, (t += 8));
        expect([y, mm.frame.lane]).toEqual([y, "left-0"]);
      }
    });

  for (const [name, k] of [
    ["flush", FLUSH],
    ["inset", INSET],
  ] as const)
    it(`${name}: the strip owns its rect: a panel settled in it lands in the rail, even where the strip lies over the column's edge`, () => {
      const s: Scene = { ...kitScene(k, { W: 1400, H: 800 }), railDrop: { panel: { railStripWidth: 32 } } };
      const previous = solve(s);
      const rs = lanes(s, "findings", { previous });
      const rail = rs.lanes.find((l) => l.id === "rail:left")!;
      expect(rail.owns).toBe(true);
      const own = previous.items.findings!.rect;
      const press = { x: own.x + 20, y: own.y + 10 };
      const home = rs.lanes.flatMap((l) => l.spots.filter((sp) => sp.home).map((sp) => ({ lane: l.id, spot: sp.id })))[0];
      for (const speed of [0.3, 1.5])
        for (const y of [200, 400]) {
          const m = createLandingModel({ regions: rs, regionsFor: (spot) => lanes(s, "findings", { previous, spot }), ...(home ? { home } : {}) });
          // Into the left column's middle, then out to the strip's middle at the window's edge, and settled there.
          const col = previous.edges["left-0"]!.rect;
          const via = { x: col.x + col.width / 2, y };
          const to = { x: rail.rect.x + rail.rect.width / 2, y };
          let t = 0;
          m.update(press, t);
          for (const [a, b] of [
            [press, via],
            [via, to],
          ] as const) {
            const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / speed / 8);
            for (let i = 1; i <= n; i++) m.update({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, (t += 8));
          }
          for (let i = 0; i < 30; i++) m.update(to, (t += 8));
          expect([speed, y, m.frame.lane, m.release()?.kind]).toEqual([speed, y, "rail:left", "spot"]);
        }
    });
});

describe("lanes(): what blocks the open space, and virtual lanes", () => {
  it("the chrome and a drawn declared rail are blocked", () => {
    const s: Scene = { ...winScene(WINDOW_A, { size: 300 }), chrome: [{ x: 600, y: 0, width: 80, height: 30 }] };
    const r = lanes(s, "pages");
    expect(r.blocked.some((b) => b.x === 600 && b.y === 0 && b.width === 80)).toBe(true);
    const l = solve(s);
    for (const rail of Object.values(l.rails)) if (rail && rail.rect.width > 0 && rail.rect.height > 0) expect(r.blocked).toContainEqual(rail.rect);
  });

  it("a new column's lane is keyed by the column it lies beside, not its ring", () => {
    const s = winScene(WINDOW_A, { size: 300 });
    const ids = lanes(s, "pages").lanes.map((l) => l.id).filter((id) => id.startsWith("column:"));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(/^column:(left|right):(\$|[^0-9].*)$/.test(id), id).toBe(true);
  });
});
