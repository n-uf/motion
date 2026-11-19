/**
 * `lanes()`: the lanes, spots and stretches a landing model reads. Placement's share of the landing model's properties:
 * the stretches tile each lane, a spot's landing is what its drop commits, ids are stable and unique, no spot is of
 * another kind's lane, a column's stretches end at the middle of its panels (halves), the pitched spots on a bar's free
 * stretches land where they aim, and the document region excludes what is docked.
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, SPOT_PITCH, type Regions, type Scene } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";
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

  it("is remembered: the same scene and options give the same lanes, and a held spot reworks only its lane", () => {
    const s = winScene(WINDOW_A, { size: 300 });
    const prev = solve(s);
    const a = lanes(s, "pages", { previous: prev });
    expect(lanes(s, "pages", { previous: prev }).lanes).toBe(a.lanes);
    const held = a.lanes.find((l) => l.id === "left-0")!.spots.find((sp) => !sp.home)!;
    const b = lanes(s, "pages", { previous: prev, spot: held.id });
    for (const l of b.lanes) if (l.id !== "left-0") expect(a.lanes).toContain(l);
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
