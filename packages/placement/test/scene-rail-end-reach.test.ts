/**
 * Reach only adds. `endReach` extends an edge's first and last zone targets outward past the edge's ends; it never
 * replaces or shrinks a zone's own span along the edge. A compact rail meeting a bar at its foot (or its head) keeps
 * its end (or start) third as a target whatever the reach: the zone's slot lies in the zone's own room, and the reach
 * strip past the stage joins that slot's target. Past an empty bar's band the strip reaches on; past a bar holding
 * items it stops at the bar's edge. The rail's predicted entry runs its full length, inset or not.
 */
import { describe, expect, it } from "vitest";
import { lanes, refusals, targets, type Edge, type Scene, type SceneItem } from "../src/scene";

type Rect = { x: number; y: number; width: number; height: number };
type Side = "left" | "right";
type At = "end" | "start";
type Bar = "empty" | "holding" | "absent";

const form = (kind: string, main: number, cross: number) => ({ kind, main: { min: main, natural: main }, cross: { natural: cross } });
const group = (id: string, main: number): SceneItem =>
  ({
    id,
    kind: "group",
    used: 1,
    forms: { row: [form("row", main, 28), form("menu", 0, 0)], column: [form("icons", main, 28), form("menu", 0, 0)] },
    floatSizes: { row: { width: main + 8, height: 34 }, column: { width: 34, height: main + 2 } },
  }) as unknown as SceneItem;
const panel = (id: string): SceneItem =>
  ({
    id,
    kind: "panel",
    used: 1,
    forms: {
      column: [
        { kind: "open", main: { min: 160, natural: 420, grows: true }, cross: { natural: 280, min: 200 } },
        { kind: "header", main: { min: 38, natural: 38 }, cross: { natural: 280, min: 32 } },
        { kind: "rail", main: { min: 59, natural: 59 }, cross: { natural: 32 } },
      ],
    },
    floatSize: { width: 280, height: 420 },
  }) as unknown as SceneItem;

interface Case {
  readonly w: number;
  readonly h: number;
  /** The side of the compact rail (and of the column beside it). */
  readonly side: Side;
  /** Which end of the rail the bar lies across: its foot (a bottom bar) or its head (a top bar). */
  readonly at: At;
  readonly bar: Bar;
  readonly inset: number;
  /** The bar laid inside the inset (the rail outside it): the bar's own reach strip then lies across the rail's own span. */
  readonly barInside?: boolean;
}

const RAIL = "rail";
const BAR = "bar";
const column = () => ({ accepts: ["panel"], cross: { min: 200, max: 560, rail: 32 }, gap: 0, hitBand: "middle" as const });

/** A stage, a compact empty rail on one side, a column with one panel inside it, a bar across one of the rail's ends, a toolbar held as a float. */
function sceneOf(c: Case): Scene {
  const edges: Edge[] = [
    { id: RAIL, side: c.side, ring: 0, accepts: ["group"], compact: true, items: [], cross: { min: 28, max: 28, rail: 28 }, gap: 4, outsideInset: true } as Edge,
    { id: `${c.side}-0`, side: c.side, ring: 1, column: true, items: ["pages"], accepts: ["panel"], cross: { min: 200, max: 560, rail: 32 }, gap: 0, hitBand: "middle" } as Edge,
  ];
  if (c.bar !== "absent")
    edges.unshift({
      id: BAR,
      side: c.at === "end" ? "bottom" : "top",
      ring: 0,
      accepts: ["group"],
      menu: { main: 24 },
      items: c.bar === "holding" ? ["held"] : [],
      cross: { min: 41, max: 41, rail: 41 },
      gap: 8,
      pad: { start: 8, end: 8 },
      outsideInset: !c.barInside,
    } as Edge);
  return {
    stage: { x: 0, y: 0, width: c.w, height: c.h },
    edges,
    items: { pages: panel("pages"), tools: group("tools", 107), held: group("held", 120) },
    floats: [{ id: "tools", rect: { x: c.w / 2, y: c.h / 2, width: 34, height: 109 }, orient: "column" }],
    floatKinds: ["panel", "group"],
    columns: { left: column(), right: column() },
    rails: { left: { width: 32, accepts: ["panel"] }, right: { width: 32, accepts: ["panel"] } },
    contentMin: { width: 320, height: 240 },
    sideColumns: "one",
    foldedColumnDrop: "end",
    inset: { top: c.inset, right: c.inset, bottom: c.inset, left: c.inset },
    insetWhen: "docked",
    gutter: 0,
  } as unknown as Scene;
}

const ask = (endReach: number) => ({ endReach, grab: { x: 16, y: 8 } });
const piecesOf = (t: { hit: Rect; hits?: readonly Rect[] }): readonly Rect[] => t.hits ?? [t.hit];
const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
const railTargets = (s: Scene, r: number) => targets(s, "tools", ask(r)).filter((t) => t.id.startsWith(`strip:${RAIL}:`) || t.id.startsWith(`gap:${RAIL}:`));

/** Lines down the rail's band, its outer, middle and inner part (the outer one inside an inset's strip). */
const railLines = (c: Case): number[] => [2, 14, 26].map((d) => (c.side === "left" ? d : c.w - d));

/** Per sample point down the rail's band: the rail targets holding it, the other targets holding it, the refusals holding it. */
function sample(s: Scene, c: Case, r: number) {
  const all = targets(s, "tools", ask(r)).filter((t) => !t.free);
  const mine = all.filter((t) => t.id.startsWith(`strip:${RAIL}:`) || t.id.startsWith(`gap:${RAIL}:`));
  const others = all.filter((t) => !mine.includes(t));
  const refused = refusals(s, "tools", ask(r));
  const out: { x: number; y: number; mine: string[]; others: string[]; other: boolean; refused: string[] }[] = [];
  for (const x of railLines(c))
    for (let y = 0.5; y < c.h; y += 3) {
      const o = others.filter((t) => piecesOf(t).some((p) => inside(p, x, y))).map((t) => t.id);
      out.push({
        x,
        y,
        mine: mine.filter((t) => piecesOf(t).some((p) => inside(p, x, y))).map((t) => t.id),
        others: o,
        other: o.length > 0,
        refused: refused.filter((q) => piecesOf(q).some((p) => inside(p, x, y))).map((q) => q.id),
      });
    }
  return out;
}

const minimal = (inset: number): Case => ({ w: 800, h: 600, side: "left", at: "end", bar: "empty", inset });

describe("endReach on a compact rail with a bar at its foot", () => {
  for (const inset of [0, 12])
    it(`the rail's end third keeps its end target and the predicted entry runs the full rail (inset ${inset})`, () => {
      const c = minimal(inset);
      const s = sceneOf(c);
      for (const r of [0, 24]) {
        const end = railTargets(s, r).find((t) => t.id === `strip:${RAIL}:end`);
        expect(end, `endReach ${r}`).toBeDefined();
        // A point in the rail's end third, above the bar's band.
        expect(piecesOf(end!).some((p) => inside(p, 14, 480)), `endReach ${r}: ${JSON.stringify(piecesOf(end!))}`).toBe(true);
        expect(refusals(s, "tools", ask(r)).some((q) => piecesOf(q).some((p) => inside(p, 14, 480))), `endReach ${r}`).toBe(false);
        const lane = lanes(s, "tools", ask(r)).lanes.find((l) => l.id === RAIL)!;
        const entry = lane.entry ?? lane.marks;
        expect(entry.length, `endReach ${r}`).toBeGreaterThan(0);
        const top = Math.min(...entry.map((m) => m.rect.y));
        const foot = Math.max(...entry.map((m) => m.rect.y + m.rect.height));
        expect([top, foot], `endReach ${r}`).toEqual([0, 600]);
      }
    });

  it("the reach strip past the stage joins the end target; without the bar the end target is one stretch", () => {
    const s = sceneOf(minimal(0));
    const end = railTargets(s, 24).find((t) => t.id === `strip:${RAIL}:end`)!;
    expect(piecesOf(end).some((p) => inside(p, 14, 610))).toBe(true);
    const bare = sceneOf({ ...minimal(0), bar: "absent" });
    const whole = railTargets(bare, 24).find((t) => t.id === `strip:${RAIL}:end`)!;
    expect(piecesOf(whole).some((p) => p.y <= 400 + 1e-6 && p.y + p.height >= 624 - 1e-6)).toBe(true);
  });
});

describe("property: reach only adds, over a sweep of rails and bars", () => {
  const cases: Case[] = [];
  for (const [w, h] of [
    [800, 600],
    [640, 480],
    [1024, 700],
  ] as const)
    for (const side of ["left", "right"] as const)
      for (const at of ["end", "start"] as const)
        for (const bar of ["empty", "holding", "absent"] as const) {
          for (const inset of [0, 12]) cases.push({ w, h, side, at, bar, inset });
          if (bar !== "absent") cases.push({ w, h, side, at, bar, inset: 12, barInside: true });
        }

  it(`every point of the rail's own span is one of its zone targets, none refused for reach (${cases.length} scenes)`, () => {
    for (const c of cases) {
      const s = sceneOf(c);
      const base = sample(s, c, 0);
      const entry0 = lanes(s, "tools", ask(0)).lanes.find((l) => l.id === RAIL)?.entry;
      // A reach past the bar's thickness too, where a bar holds items: the strip must stop at it, not pass it.
      for (const r of c.bar === "holding" ? [0, 12, 24, 60] : [0, 12, 24]) {
        const tag = `${JSON.stringify(c)} endReach ${r}`;
        const now = r === 0 ? base : sample(s, c, r);
        now.forEach((p, i) => {
          const was = base[i]!;
          // One owner at most for every point of the rail's band: no two targets overlap there.
          expect(p.mine.length + p.others.length, `${tag} x ${p.x} y ${p.y}: ${JSON.stringify(p)}`).toBeLessThanOrEqual(1);
          // A point of the rail's own span (on no other edge's target) is the rail's: one zone target, never refused.
          // (Past a bar holding items inside the inset, the inset's strip is nobody's, with or without reach.)
          if (!p.other && !(c.bar === "holding" && c.barInside)) expect(p.mine.length, `${tag} x ${p.x} y ${p.y}: ${JSON.stringify(p)}`).toBe(1);
          // (The inner line of an inset rail lies over the column's refusal, which is not the rail's.)
          if (p.mine.length > 0 || was.mine.length > 0) expect(p.refused, `${tag} x ${p.x} y ${p.y}`).toEqual([]);
          // Reach never shrinks a target: what a zone's target holds at endReach 0 it holds at any reach.
          if (was.mine.length === 1) expect(p.mine, `${tag} x ${p.x} y ${p.y}`).toEqual(was.mine);
        });
        // The predicted entry runs as far as it does without reach.
        if (entry0) {
          const entry = lanes(s, "tools", ask(r)).lanes.find((l) => l.id === RAIL)?.entry;
          expect(entry, tag).toBeDefined();
          const span = (ms: readonly { rect: Rect }[]) => [Math.min(...ms.map((m) => m.rect.y)), Math.max(...ms.map((m) => m.rect.y + m.rect.height))];
          expect(span(entry!), tag).toEqual(span(entry0));
        }
      }
    }
  });

  it("past a bar holding items the reach strip stops at the bar's edge", () => {
    for (const at of ["end", "start"] as const) {
      const c: Case = { w: 800, h: 600, side: "left", at, bar: "holding", inset: 0 };
      const s = sceneOf(c);
      // 24 is within the bar's 41 px; 60 goes past it.
      for (const r of [24, 60]) {
        const ts = railTargets(s, r);
        const outside = ts.some((t) => piecesOf(t).some((p) => (at === "end" ? p.y + p.height > 600 + 1e-6 : p.y < -1e-6)));
        expect(outside, `${at} endReach ${r}: ${JSON.stringify(ts.map((t) => [t.id, piecesOf(t)]))}`).toBe(false);
      }
    }
  });
});
