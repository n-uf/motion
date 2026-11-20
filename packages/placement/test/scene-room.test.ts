/**
 * Room belongs to the stretch: a placed item (one that keeps room, `SceneItem.space`) stays placed, a flush item stays
 * flush. A dock into a placed item's room consumes it (the item moves only by what the room lacks), and an item leaving
 * gives its room back (the placed item stays where it is drawn; flush items close up toward their zone's own end).
 * Spots over free stretches are measured with the held item lifted: a spot that lands in free room moves nothing else.
 */
import { describe, expect, it } from "vitest";
import { lanes, lift, moveTo, solve, type Scene, type SceneItem } from "../src/scene";
import { bar, byId, form, group } from "./scene-fixture";

type Host = "bar" | "rail";
const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
};
const sized = (id: string, used: number, w: number, more: Partial<SceneItem> = {}): SceneItem => ({ ...group(id, used), forms: { row: [form("row", w, w, 28)], column: [form("icons", w, w, 28)] }, ...more });
const railEdge = (items: string[]) => ({ id: "rail", side: "left" as const, ring: 0, accepts: ["group"], items, cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } });

/** A bar or a left rail of 1–4 groups in start and end zones, some keeping room, some fixed; `x` held here or elsewhere. */
function gen(seed: number, host: Host): Scene {
  const r = rng(seed);
  const n = 1 + Math.floor(r() * 4);
  const ids = Array.from({ length: n }, (_, i) => `i${i}`);
  const items = ids.map((id, i) => {
    const zone = r() < 0.6 ? "start" : "end";
    return sized(id, i + 1, 40 + Math.floor(r() * 80), { ...(zone === "end" ? { align: "end" as const } : {}), ...(r() < 0.5 ? { space: 20 + Math.floor(r() * 120) } : {}), ...(r() < 0.1 ? { fixed: true } : {}) });
  });
  // Edge order: start items first, end items after (as a stored scene has them).
  const order = [...ids.filter((id) => !items.find((i) => i.id === id)!.align), ...ids.filter((id) => items.find((i) => i.id === id)!.align === "end")];
  const x = sized("x", 9, 70, r() < 0.3 ? { space: 30 } : {});
  const same = r() < 0.5;
  if (same) order.splice(Math.floor(r() * (order.filter((id) => !items.find((i) => i.id === id)!.align).length + 1)), 0, "x");
  const edge = host === "bar" ? bar("top", "top", 0, order) : railEdge(order);
  return { stage: { x: 0, y: 0, width: 900 + Math.floor(r() * 300), height: 700 }, edges: [edge, bar("bottom", "bottom", 0, same ? ["g"] : ["g", "x"])], items: byId([...items, x, group("g", 3)]), floats: [], floatKinds: ["group"] };
}

const lo = (r: { x: number; y: number }, ax: "x" | "y"): number => r[ax];
const len = (r: { width: number; height: number }, ax: "x" | "y"): number => (ax === "x" ? r.width : r.height);

describe("room belongs to the stretch", () => {
  for (const host of ["bar", "rail"] as const)
    it(`${host}: a spot that lands in free room moves nothing else on its edge (seeds 1–150)`, () => {
      const bad: string[] = [];
      for (let seed = 1; seed <= 150; seed++) {
        const s = gen(seed, host);
        const seen = solve(s);
        const edge = host === "bar" ? "top" : "rail";
        const ax = host === "bar" ? "x" : "y";
        const base = solve(lift(s, "x"), { previous: seen });
        const gap = 4;
        const others = Object.entries(base.items).filter(([id, it]) => id !== "x" && it.edge === edge && !it.inMenu);
        const lane = lanes(s, "x", { previous: seen }).lanes.find((l) => l.id === edge);
        for (const sp of lane?.spots ?? []) {
          if (sp.home) continue;
          const a0 = lo(sp.landing, ax);
          const a1 = a0 + len(sp.landing, ax);
          // In free room: clear of every other item (and its gap) as the lifted layout has it.
          const free = others.every(([, it]) => a1 + gap <= lo(it.rect, ax) + 0.5 || lo(it.rect, ax) + len(it.rect, ax) + gap <= a0 + 0.5);
          if (!free) continue;
          const after = sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
          for (const [id, it] of others) {
            const now = after.items[id];
            if (!now || Math.abs(lo(now.rect, ax) - lo(it.rect, ax)) > 1) bad.push(`seed ${seed} ${sp.id}: ${id} ${lo(it.rect, ax)} → ${now ? lo(now.rect, ax) : "gone"}`);
          }
        }
      }
      expect(bad.slice(0, 8)).toEqual([]);
    });

  for (const host of ["bar", "rail"] as const)
    it(`${host}: an item leaving its edge gives its room back: items before it and the first placed one after it stay (seeds 1–150)`, () => {
      const bad: string[] = [];
      for (let seed = 1; seed <= 150; seed++) {
        const s = gen(seed, host);
        const edgeId = host === "bar" ? "top" : "rail";
        const ax = host === "bar" ? "x" : "y";
        const edge = s.edges.find((e) => e.id === edgeId)!;
        const seen = solve(s);
        for (const id of edge.items) {
          if (s.items[id]!.fixed || seen.items[id]?.inMenu) continue;
          const zone = s.items[id]!.align ?? "start";
          const after = solve(lift(s, id));
          const k = edge.items.indexOf(id);
          const step = zone === "end" ? -1 : 1;
          // The items toward the zone's own end don't move; past the flush ones, the first placed item doesn't move.
          const keep: string[] = edge.items.filter((o, j) => (s.items[o]!.align ?? "start") === zone && (step === 1 ? j < k : j > k));
          for (let j = k + step; j >= 0 && j < edge.items.length; j += step) {
            const o = edge.items[j]!;
            if ((s.items[o]!.align ?? "start") !== zone) break;
            if ((s.items[o]!.space ?? 0) > 0) {
              keep.push(o);
              break;
            }
          }
          for (const o of keep) {
            const a = seen.items[o];
            const b = after.items[o];
            if (!a || !b || a.inMenu || b.inMenu) continue;
            if (Math.abs(lo(a.rect, ax) - lo(b.rect, ax)) > 1) bad.push(`seed ${seed} lift ${id}: ${o} ${lo(a.rect, ax)} → ${lo(b.rect, ax)}`);
          }
        }
      }
      expect(bad.slice(0, 8)).toEqual([]);
    });

  it("a dock into a placed item's room moves it only by what the room lacks", () => {
    // Top bar: a (start, 100), then c (start, 100) keeping 150 of room before it; g docks before c.
    for (const [w, room] of [
      [80, 150],
      [140, 150],
      [200, 150],
      [146, 150],
    ] as const) {
      const s: Scene = { stage: { x: 0, y: 0, width: 1000, height: 600 }, edges: [bar("top", "top", 0, ["a", "c"]), bar("bottom", "bottom", 0, ["g"])], items: byId([sized("a", 1, 100), sized("c", 2, 100, { space: room }), sized("g", 3, w)]), floats: [], floatKinds: ["group"] };
      const before = solve(s).items.c!.rect.x;
      const after = solve(moveTo(s, "g", { edge: "top", zone: "start", at: 1 }));
      expect([w, after.items.c!.rect.x - before]).toEqual([w, Math.max(0, w + 4 - room)]);
      // It lands at the room's start, right after a.
      expect([w, after.items.g!.rect.x]).toEqual([w, solve(s).items.a!.rect.x + 100 + 4]);
    }
  });

  it("an end-zone flush pair losing a member closes up toward the end; a placed end item stays", () => {
    // Top bar end zone: p, q flush (q at the end), r keeping 60 of room after it, before p.
    const s: Scene = { stage: { x: 0, y: 0, width: 1000, height: 600 }, edges: [bar("top", "top", 0, ["r", "p", "q"]), bar("bottom", "bottom", 0, ["g"])], items: byId([sized("r", 1, 80, { align: "end", space: 60 }), sized("p", 2, 90, { align: "end" }), sized("q", 3, 90, { align: "end" }), sized("g", 4, 50)]), floats: [], floatKinds: ["group"] };
    const seen = solve(s);
    // q leaves: p closes up to the end (moves right by q's length and the gap); r stays where it is drawn.
    const noQ = solve(moveTo(s, "q", { edge: "bottom", at: 1 }));
    expect(noQ.items.p!.rect.x - seen.items.p!.rect.x).toBe(90 + 4);
    expect(noQ.items.r!.rect.x).toBe(seen.items.r!.rect.x);
    // p leaves: q stays at the end; r stays where it is drawn.
    const noP = solve(moveTo(s, "p", { edge: "bottom", at: 1 }));
    expect(noP.items.q!.rect.x).toBe(seen.items.q!.rect.x);
    expect(noP.items.r!.rect.x).toBe(seen.items.r!.rect.x);
  });

  it("a start-zone flush item between the leaving item and a placed one closes up; the placed one stays", () => {
    // Rail: x, n flush after it, m keeping 50 of room after n.
    const s: Scene = { stage: { x: 0, y: 0, width: 1000, height: 700 }, edges: [railEdge(["x", "n", "m"]), bar("bottom", "bottom", 0, ["g"])], items: byId([sized("x", 1, 70), sized("n", 2, 60), sized("m", 3, 60, { space: 50 }), sized("g", 4, 50)]), floats: [], floatKinds: ["group"] };
    const seen = solve(s);
    const after = solve(lift(s, "x"));
    expect(seen.items.n!.rect.y - after.items.n!.rect.y).toBe(70 + 4);
    expect(after.items.m!.rect.y).toBe(seen.items.m!.rect.y);
  });

  it("a bar with a fixed center item and an end item keeping room still offers end-zone spots up to the edge's end", () => {
    // The shape of the review's seed: a fixed center item, an end item keeping room before the bar's end.
    const s: Scene = {
      stage: { x: 0, y: 0, width: 921, height: 600 },
      edges: [bar("top", "top", 0, ["c", "e"]), bar("bottom", "bottom", 0, ["x", "g"])],
      items: byId([sized("c", 1, 66, { align: "center", fixed: true }), sized("e", 2, 158, { align: "end", space: 171 }), sized("x", 3, 90), sized("g", 4, 50)]),
      floats: [],
      floatKinds: ["group"],
    };
    const seen = solve(s);
    const top = lanes(s, "x", { previous: seen }).lanes.find((l) => l.id === "top")!;
    const endEdge = seen.edges.top!.rect.x + seen.edges.top!.rect.width - 8;
    // A spot flush at the bar's end (after e, e keeping its room) and one flush against e's end side. (The stretch
    // between the fixed center item and e lies next to a center item: no spot there.)
    const ends = top.spots.map((sp) => Math.round(sp.landing.x + sp.landing.width));
    expect(ends.some((x) => Math.abs(x - endEdge) <= 1)).toBe(true);
    const eEnd = seen.items.e!.rect.x + seen.items.e!.rect.width;
    expect(top.spots.some((sp) => Math.abs(sp.landing.x - (eEnd + 4)) <= 1)).toBe(true);
  });
});
