/**
 * `lanes()` for a landing model's guides and gates: which spots move another item, the guide marks in the layout as
 * drawn (never over an item), refused stretches at least the item's length, and pitched spots on a toolbar rail.
 */
import { describe, expect, it } from "vitest";
import type { Rect } from "../src/geometry";
import { lanes, solve, SPOT_PITCH, type Scene } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";
import { modelScene } from "./model-scene";
import { bar, byId, group } from "./scene-fixture";

const scenes = (): [string, Scene][] => [
  ["window A", winScene(WINDOW_A, { size: 300 })],
  ...[1, 2, 3, 4, 5, 6].map((seed): [string, Scene] => [`model ${seed}`, modelScene(seed, seed % 2 === 0, seed % 3 === 0, false)]),
];
const movable = (s: Scene): string[] => Object.keys(s.items).filter((k) => !s.items[k]!.fixed && !s.items[k]!.closed).slice(0, 4);
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;
const len = (r: Rect, axis: "x" | "y"): number => (axis === "x" ? r.width : r.height);

/** A 1200 px top bar with a start item a; g held from the bottom bar. */
const barWin = (): Scene => ({
  stage: { x: 0, y: 0, width: 1200, height: 700 },
  edges: [bar("top", "top", 0, ["a"]), bar("bottom", "bottom", 0, ["g"])],
  items: byId([group("a", 1), group("g", 2)]),
  floats: [],
  floatKinds: ["group"],
});

describe("lanes(): which spots move another item", () => {
  it("before the bar's first item moves it; after it, at the end, or at a pitch past it doesn't", () => {
    const s = barWin();
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    expect(top.spots.find((sp) => sp.id === "top/start/^|a")?.moves).toBe(true);
    const after = top.spots.filter((sp) => sp.id.startsWith("top/start/a|") || sp.id.startsWith("top/end/"));
    expect(after.length).toBeGreaterThan(3);
    for (const sp of after) expect(sp.moves, sp.id).toBe(false);
  });

  it("a spot that moves nothing draws every other item where the layout with the item lifted does", () => {
    for (const [name, s] of scenes().slice(0, 3))
      for (const id of movable(s)) {
        const r = lanes(s, id, { previous: solve(s) });
        const quiet = r.lanes.flatMap((l) => l.spots.filter((sp) => !sp.moves && !sp.home));
        const layouts = quiet.map((sp) => sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout);
        // Two quiet spots draw the others alike: a change between them moves only the held item.
        for (let i = 1; i < layouts.length; i++)
          for (const [k, it] of Object.entries(layouts[0]!.items)) {
            const other = layouts[i]!.items[k];
            if (k === id || it.floating || it.inMenu || !other || other.inMenu) continue;
            const d = Math.max(Math.abs(it.rect.x - other.rect.x), Math.abs(it.rect.y - other.rect.y), Math.abs(it.rect.width - other.rect.width), Math.abs(it.rect.height - other.rect.height));
            expect(d, `${name} ${id} ${quiet[i]!.id} ${k}`).toBeLessThan(0.5);
          }
      }
  });
});

describe("lanes(): guide marks", () => {
  it("never lie over an item drawn on the lane, as seen or with a spot held, and a box fits the item", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const prev = solve(s);
        const seen = lanes(s, id, { previous: prev });
        const check = (ls: typeof seen.lanes, drawn: ReturnType<typeof solve>, spot: string): void => {
          for (const l of ls) {
            const items = Object.values(drawn.items).filter((it) => it.edge === l.id && !it.inMenu && !it.floating && it.rect.width > 0 && it.rect.height > 0);
            const itemLen = Math.min(...l.spots.map((sp) => len(sp.landing, l.axis)));
            for (const m of l.marks) {
              for (const it of items) expect(overlaps(m.rect, it.rect), `${name} ${id} ${spot} ${l.id} ${m.kind}`).toBe(false);
              if (m.kind === "box") expect(len(m.rect, l.axis) + 1e-6, `${name} ${id} ${l.id}`).toBeGreaterThanOrEqual(itemLen);
            }
          }
        };
        check(seen.lanes, prev, "seen");
        for (const l of seen.lanes.slice(0, 3)) {
          const sp = l.spots[Math.floor(l.spots.length / 2)]!;
          const held = lanes(s, id, { previous: prev, spot: sp.id });
          check(held.lanes.filter((x) => x.id === l.id), sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout, sp.id);
        }
      }
  });

  it("a bar with room shows a box over its free stretch, and lines between items that touch", () => {
    const s: Scene = { ...barWin(), edges: [bar("top", "top", 0, ["a", "b"]), bar("bottom", "bottom", 0, ["g"])], items: byId([group("a", 1), group("b", 3), group("g", 2)]) };
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    expect(top.marks.filter((m) => m.kind === "box").length).toBeGreaterThan(0);
    expect(top.marks.filter((m) => m.kind === "line").length).toBe(1);
  });

  it("every refused stretch in a lane is at least the item's length", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s))
        for (const l of lanes(s, id).lanes) {
          const itemLen = Math.min(...l.spots.map((sp) => len(sp.landing, l.axis)));
          for (const f of l.refused) expect(f.along[1] - f.along[0] + 1e-6, `${name} ${id} ${l.id}`).toBeGreaterThanOrEqual(itemLen);
        }
  });
});

describe("lanes(): pitched spots on a toolbar rail", () => {
  it("a compact rail gets spots at the pitch over its free stretch, like a bar", () => {
    const s: Scene = {
      stage: { x: 0, y: 0, width: 1000, height: 700 },
      edges: [bar("bottom", "bottom", 0, ["g"]), { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: ["t"], cross: { min: 30, max: 30, rail: 30 }, compact: true }],
      items: byId([group("t", 1), group("g", 2)]),
      floats: [],
      floatKinds: ["group"],
    };
    const rail = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "rail-left")!;
    expect(rail.axis).toBe("y");
    const pitched = rail.spots.filter((sp) => sp.pitched);
    expect(pitched.length).toBeGreaterThan(3);
    for (let i = 1; i < pitched.length; i++) expect(pitched[i]!.landing.y - pitched[i - 1]!.landing.y).toBeGreaterThanOrEqual(SPOT_PITCH / 2);
  });
});
