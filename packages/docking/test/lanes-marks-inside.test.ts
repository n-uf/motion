/**
 * A lane's marks never lie outside its lane's rect: a mark shows where a drop goes, and a drop is possible only inside
 * the lane's hit rect. So no stretch of an empty bar's mark runs on past where its lane gives way to a drawn edge, and
 * at a corner between two empty edges the lane that owns the corner is the only one with marks there.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lanes, solve, type DockEdge, type DockItem, type DockState } from "../src";
import { bar, byId, form, seeded } from "./fixture";
import { modelState } from "./model-window";

type R = { x: number; y: number; width: number; height: number };
const overlaps = (a: R, b: R): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;
const within = (m: R, l: R): boolean => m.x >= l.x - 1e-6 && m.y >= l.y - 1e-6 && m.x + m.width <= l.x + l.width + 1e-6 && m.y + m.height <= l.y + l.height + 1e-6;

/** One call of `lanes()`: as seen, or with a spot held (the lane that spot is in). */
interface Frame {
  readonly where: string;
  readonly lanes: ReturnType<typeof lanes>["lanes"];
  readonly heldLane?: string;
  /** The layout the held spot's drop draws (where its lane's marks are drawn). */
  readonly heldLayout?: ReturnType<typeof solve>;
  /** The layout as seen. */
  readonly seen: ReturnType<typeof solve>;
}

/**
 * Every way a lane's marks break the rule in `ls`, as strings (empty: none). `edgeIds`: the lanes of real edges. A lane's
 * marks lie inside its rect in the layout they are drawn in: its rect as seen; in a held frame, every lane's in the held
 * spot's own layout (`heldLayout`), where its edge may have moved: there the edge as drawn when it is drawn. An empty
 * edge lane with one spot, but the held one, is drawn in that spot's after-entry layout (its marks predicted, as seen
 * and in a held frame alike), so there.
 */
function broken(frame: Frame, edgeIds: ReadonlySet<string>): string[] {
  const { where, lanes: ls, heldLayout } = frame;
  const bad: string[] = [];
  const edge = ls.filter((l) => edgeIds.has(l.id));
  for (const l of edge) {
    const own = l.id !== frame.heldLane && (frame.seen.edges[l.id]?.cross ?? 0) <= 1e-6 && l.spots.length === 1 ? l.spots[0]!.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout : undefined;
    const predicted = own && (own.edges[l.id]?.cross ?? 0) > 1e-6 ? own : undefined;
    const moved = (predicted ?? heldLayout)?.edges[l.id];
    const r = moved && moved.cross > 1e-6 ? moved.rect : l.rect;
    for (const m of l.marks) if (!within(m.rect, r)) bad.push(`${where}: ${m.id} outside its lane ${l.id}`);
    // The corner clip is one rule for the hit rect and the marks: along its axis an empty lane's marks stay inside its
    // `rect` (the layout as seen decides where it gives way), with a spot held in it too, whatever edge that drop draws.
    if ((frame.seen.edges[l.id]?.cross ?? 0) > 1e-6) continue;
    const a0 = l.axis === "x" ? l.rect.x : l.rect.y;
    const a1 = a0 + (l.axis === "x" ? l.rect.width : l.rect.height);
    for (const m of l.marks) {
      const m0 = l.axis === "x" ? m.rect.x : m.rect.y;
      const m1 = m0 + (l.axis === "x" ? m.rect.width : m.rect.height);
      if (m0 < a0 - 1e-6 || m1 > a1 + 1e-6) bad.push(`${where}: ${m.id} past its lane ${l.id}'s clip`);
    }
  }
  const all = edge.flatMap((l) => l.marks.map((m) => ({ lane: l.id, m })));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) if (all[i]!.lane !== all[j]!.lane && overlaps(all[i]!.m.rect, all[j]!.m.rect)) bad.push(`${where}: ${all[i]!.m.id} over ${all[j]!.m.id}`);
  return bad;
}

/** The frames of a drag of `id`: as seen, and with every spot held, each way an empty lane is drawn. */
function frames(s: DockState, id: string, extra: { grab?: { x: number; y: number }; endReach?: number } = {}, label = ""): Frame[] {
  const previous = solve(s);
  const out: Frame[] = [];
  for (const emptyLanes of ["real", "edge"] as const) {
    const base = lanes(s, id, { previous, emptyLanes, ...extra });
    out.push({ where: `${label} ${id} ${emptyLanes} seen`, lanes: base.lanes, seen: previous });
    for (const l of base.lanes) for (const sp of l.spots) out.push({ where: `${label} ${id} ${emptyLanes} ${sp.id}`, lanes: lanes(s, id, { previous, emptyLanes, spot: sp.id, ...extra }).lanes, heldLane: l.id, heldLayout: sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout, seen: previous });
  }
  return out;
}

describe("lanes(): a lane's marks lie inside its lane's rect", () => {
  it("a window with empty top bar and side rails between two columns: the bar's marks stop where its lane does, no two lanes' marks overlap", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const s = JSON.parse(readFileSync(join(here, "fixtures", "empty-corners.json"), "utf8")) as DockState;
    const bad: string[] = [];
    const edgeIds = new Set(s.edges.map((e) => e.id));
    const seen = lanes(s, "tools", { previous: solve(s), grab: { x: 17, y: 9 }, endReach: 24 }).lanes;
    // The repro: the bar's lane is narrowed to the room between the columns, so its marks are too.
    const top = seen.find((l) => l.id === "bar:top")!;
    expect(top.marks.length).toBeGreaterThan(0);
    for (const m of top.marks) expect(within(m.rect, top.rect), m.id).toBe(true);
    for (const f of frames(s, "tools", { grab: { x: 17, y: 9 }, endReach: 24 })) bad.push(...broken(f, edgeIds));
    expect(bad.slice(0, 6)).toEqual([]);
  });

  it("a spot held on an empty top bar between two drawn rails that take the item: its marks stop at the rails' inner sides, as its lane does", () => {
    const g = (id: string, main: number) => ({ id, kind: "group", used: 1, forms: { row: [form("row", main, main, 28), form("menu", 0, 0, 0)], column: [form("icons", main, main, 30), form("menu", 0, 0, 0)] } }) as DockItem;
    const s: DockState = {
      stage: { x: 0, y: 0, width: 800, height: 600 },
      edges: [
        { id: "bar:top", side: "top", ring: 0, accepts: ["group"], gap: 8, pad: { start: 8, end: 8 }, cross: { min: 31, max: 31, rail: 31 }, items: [] },
        { id: "bar:left", side: "left", ring: 0, accepts: ["group"], zones: ["start"], compact: true, gap: 4, cross: { min: 30, max: 30, rail: 30 }, items: ["a"] },
        { id: "bar:right", side: "right", ring: 0, accepts: ["group"], zones: ["start"], compact: true, gap: 4, cross: { min: 30, max: 30, rail: 30 }, items: ["z"] },
        { id: "bar:bottom", side: "bottom", ring: 0, accepts: ["group"], gap: 8, pad: { start: 8, end: 8 }, cross: { min: 31, max: 31, rail: 31 }, items: ["d"] },
      ] as DockEdge[],
      items: byId([g("a", 100), g("z", 100), g("d", 200)]),
      floats: [],
      floatKinds: ["group"],
    };
    const previous = solve(s);
    const seen = lanes(s, "d", { previous }).lanes.find((l) => l.id === "bar:top")!;
    expect([seen.rect.x, seen.rect.x + seen.rect.width]).toEqual([30, 770]);
    for (const sp of seen.spots) {
      const top = lanes(s, "d", { previous, spot: sp.id }).lanes.find((l) => l.id === "bar:top")!;
      expect(top.marks.length).toBeGreaterThan(0);
      for (const m of top.marks) expect([m.id, m.rect.x >= 30 - 1e-6 && m.rect.x + m.rect.width <= 770 + 1e-6]).toEqual([m.id, true]);
    }
  });

  it("over generated windows (every edge kind, floating and docked held items), every mark lies inside its lane and no two edge lanes' marks overlap", () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 40; seed++)
      for (const flush of [false, true]) {
        const s = modelState(seed, flush);
        const held = Object.values(s.items).filter((i) => !i.fixed && !i.closed && i.kind === "group").map((i) => i.id).slice(0, 2);
        const edgeIds = new Set(s.edges.map((e) => e.id));
        for (const id of held) for (const f of frames(s, id, {}, `model ${seed}${flush ? " flush" : ""}`)) bad.push(...broken(f, edgeIds));
      }
    expect(bad.slice(0, 6)).toEqual([]);
  });

  it("over seeded bars and rails of toolbars, the lanes() of every lane: every mark inside its lane", () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 60; seed++)
      for (const rail of [false, true]) {
        const r = seeded(seed);
        const n = 2 + Math.floor(r() * 4);
        const ids = Array.from({ length: n }, (_, i) => `g${i}`);
        const items: DockItem[] = ids.map((id, i) => {
          const nat = 60 + Math.floor(r() * 300);
          return { id, kind: "group", used: i + 1, forms: { row: [form("row", Math.min(nat, 120), nat, 31), form("icons", 40 + Math.floor(r() * 40), 40, 31), form("menu", 0, 0, 0)], column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] }, ...(r() < 0.4 ? { align: "end" as const } : {}) } as DockItem;
        });
        const held = ids[Math.floor(r() * n)]!;
        const docked = r() < 0.6;
        const members = ids.filter((id) => id !== held || docked);
        const edge: DockEdge = rail ? { id: "rail", side: "left", ring: 0, accepts: ["group"], items: members, cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } } : bar("bar", "bottom", 0, members, { cross: { min: 31, max: 31, rail: 31 }, gap: 8, pad: { start: 8, end: 8 }, menu: { main: 24 } });
        const s: DockState = { stage: { x: 0, y: 0, width: rail ? 700 : 900, height: rail ? 900 : 660 }, edges: [edge], items: byId(items), floats: docked ? [] : [{ id: held, rect: { x: 300, y: 53, width: 36, height: 107 } }], floatKinds: ["group"] };
        for (const f of frames(s, held, {}, `bar ${seed}${rail ? " rail" : ""}`)) bad.push(...broken(f, new Set([edge.id])));
      }
    expect(bad.slice(0, 6)).toEqual([]);
  });

  it("with a spot held, another lane's marks follow its edge where that drop moved it, none lost", () => {
    const s = modelState(2, true);
    const previous = solve(s);
    const sp = lanes(s, "g0", { previous }).lanes.find((l) => l.id === "left-bar")!.spots[0]!;
    const after = sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
    expect(after.edges["left-col"]!.rect.x).toBeGreaterThan(previous.edges["left-col"]!.rect.x);
    const col = lanes(s, "g0", { previous, spot: sp.id }).lanes.find((l) => l.id === "left-col")!;
    expect(col.marks.map((m) => m.id).sort()).toEqual(["left-col/line/^|left-p", "left-col/line/left-p|$"]);
    for (const m of col.marks) expect(within(m.rect, after.edges["left-col"]!.rect)).toBe(true);
  });
});
