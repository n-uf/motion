/**
 * Reach only adds, as an area: a target's own hit at `endReach: 0`, every piece of it, is still inside its hit at a larger
 * reach. The reach strips past an edge's ends extend a target's hit; they never take area from another target's own hit,
 * real edges' and the virtual column lines' alike. Over inset scenes (a strip of the window's own edge around the
 * content), with bars across the columns' ends: the virtual `column:<side>:0` line in the inset strip keeps its corner
 * points where a bar's reach strip lies over the strip.
 */
import { EPS, area, rect, subtract, type Rect } from "@n-uf/placement";
import { describe, expect, it } from "vitest";
import { targets, type DockDropOptions, type DockEdge, type DockState } from "../src";
import { byId, column, panel } from "./fixture";
import { sweepWindows } from "./one-layout-windows";

type Bar = "empty" | "holding" | "absent";
interface Case {
  readonly w: number;
  readonly h: number;
  readonly sides: "left" | "right" | "both";
  readonly columns: 1 | 2;
  readonly foot: Bar;
  readonly head: Bar;
  readonly inset: number;
}

const cols = { accepts: ["panel"], cross: { min: 220, max: 640, rail: 32 } };
const word = (id: string) => ({
  id,
  kind: "group",
  used: 1,
  forms: { row: [{ kind: "row", main: { min: 120, natural: 120 }, cross: { natural: 28 } }, { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } }] },
});

function stateOf(c: Case): DockState {
  const bar = (id: string, side: "top" | "bottom", state: Bar): DockEdge[] =>
    state === "absent" ? [] : [{ id, side, ring: 0, accepts: ["group", "panel"], items: state === "holding" ? [`${id}-w`] : [], cross: { min: 28, max: 28, rail: 28 } } as DockEdge];
  const sides = c.sides === "both" ? (["left", "right"] as const) : ([c.sides] as const);
  const edges: DockEdge[] = [];
  const items = [panel("x", 9, {}, 290)];
  for (const side of sides)
    for (let ring = 0; ring < c.columns; ring++) {
      const id = `${side}${ring}`;
      const held = side === sides[0] && ring === 0 ? ["p1", "p2"] : [`${id}-p`];
      for (const p of held) items.push(panel(p, 1 + items.length, {}, 290));
      edges.push({ ...column(id, side, ring, held), column: true, accepts: ["panel"], cross: cols.cross, size: 290 } as DockEdge);
    }
  return {
    stage: { x: 0, y: 0, width: c.w, height: c.h },
    edges: [...bar("foot", "bottom", c.foot), ...bar("head", "top", c.head), ...edges],
    items: { ...byId(items), "foot-w": word("foot-w"), "head-w": word("head-w"), g: word("g") },
    floats: [
      { id: "x", rect: { x: c.w / 2 - 145, y: 100, width: 290, height: 300 } },
      { id: "g", rect: { x: c.w / 2 - 64, y: 40, width: 128, height: 34 } },
    ],
    floatKinds: ["panel", "group"],
    columns: { left: cols, right: cols },
    contentMin: { width: 320, height: 240 },
    inset: { top: c.inset, right: c.inset, bottom: c.inset, left: c.inset },
  } as unknown as DockState;
}

/** Area of `a`'s pieces that `b`'s pieces do not cover. */
function uncovered(a: readonly Rect[], b: readonly Rect[]): number {
  return a.reduce((n, p) => n + b.reduce<Rect[]>((rest, q) => rest.flatMap((r) => subtract(r, q)), [p]).reduce((m, r) => m + area(r), 0), 0);
}

const hitsOf = (t: { hit: Rect; hits?: readonly Rect[] }): readonly Rect[] => t.hits ?? [t.hit];

/** The targets of `dragged` at `endReach`, by id. */
const byIdAt = (s: DockState, dragged: string, endReach: number): Map<string, readonly Rect[]> => new Map(targets(s, dragged, { endReach }).map((t) => [t.id, hitsOf(t)]));

/**
 * Where reach takes something: per target at `endReach` 0, the area of its pieces (`hits`, else `hit`) its pieces at
 * `reach` no longer cover.
 */
function losses(s: DockState, dragged: string, options: DockDropOptions, reach: number): string[] {
  const at = (r: number) => new Map(targets(s, dragged, { ...options, endReach: r }).map((t) => [t.id, t]));
  const base = at(0);
  const now = at(reach);
  const out: string[] = [];
  for (const [id, t] of base) {
    const m = now.get(id);
    const lost = uncovered(hitsOf(t), m ? hitsOf(m) : []);
    if (lost > 1) out.push(`${id} loses ${lost.toFixed(0)} px2`);
  }
  return out;
}

describe("reach only adds: a target's hit at endReach 0 stays inside its hit at a larger reach", () => {
  const cases: Case[] = [];
  for (const [w, h] of [
    [1275, 580],
    [1024, 700],
  ] as const)
    for (const sides of ["left", "right", "both"] as const)
      for (const columns of [1, 2] as const)
        for (const foot of ["empty", "holding", "absent"] as const)
          for (const head of ["empty", "holding", "absent"] as const) cases.push({ w, h, sides, columns, foot, head, inset: 12 });

  it(`inset scenes, ${cases.length} states, a panel and a toolbar held, endReach 8, 24 and 60: no target loses area`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const s = stateOf(c);
      for (const dragged of ["x", "g"]) for (const r of [8, 24, 60]) bad.push(...losses(s, dragged, {}, r).map((m) => `${JSON.stringify(c)} ${dragged} endReach ${r}: ${m}`));
    }
    expect(bad.slice(0, 20), `${bad.length} losses`).toEqual([]);
  });

  it("the sweep's windows (the corpus), each at endReach 0 and at its own reach: no target loses area", () => {
    const bad: string[] = [];
    let n = 0;
    for (const w of sweepWindows()) {
      n++;
      const { endReach, ...options } = (w.options ?? {}) as DockDropOptions;
      bad.push(...losses(w.state, w.dragged, { ...options, previous: w.previous }, endReach ?? 24).map((m) => `${w.name}: ${m}`));
    }
    expect(n).toBeGreaterThan(50);
    expect(bad.slice(0, 20), `${bad.length} losses`).toEqual([]);
  });

  it("the inset strip's column line keeps its corner points under a bar's reach strip", () => {
    const s = stateOf({ w: 1275, h: 580, sides: "left", columns: 1, foot: "empty", head: "empty", inset: 12 });
    const id = "column:left:0";
    const at0 = byIdAt(s, "x", 0).get(id);
    expect(at0, "the line has a hit at reach 0").toBeDefined();
    for (const r of [8, 24, 60]) {
      const now = byIdAt(s, "x", r).get(id) ?? [];
      expect(uncovered(at0!, now), `endReach ${r}`).toBeLessThan(EPS * 100);
      // Its corner points, just inside the inset's top and bottom.
      for (const y of [13, 541]) {
        const p = rect(1, y, 1, 1);
        expect(uncovered([p], at0!), `point (1, ${y}) is the line's at endReach 0`).toBe(0);
        expect(uncovered([p], now), `point (1, ${y}) at endReach ${r}`).toBe(0);
      }
    }
  });
});
