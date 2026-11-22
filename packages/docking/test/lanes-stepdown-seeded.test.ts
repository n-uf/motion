/**
 * Seeded bars and toolbar rails (2 to 5 toolbars, some stepping down, some keeping room, some at the end; the held one
 * docked or floating) for the stretch as the room the drop makes and its marks: the cases a review found, and a sweep.
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, type DockEdge, type DockState, type DockItem } from "../src";
import { bar, byId, form, seeded } from "./fixture";

/** `fixed`: each form's length is fixed (its min is its natural length), on a 480 to 1080 px window. */
function gen(seed: number, rail = false, fixed = false): { state: DockState; held: string } {
  const r = seeded(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const n = 2 + Math.floor(r() * 4);
  const width = 480 + Math.floor(r() * (fixed ? 600 : 900));
  const ids = Array.from({ length: n }, (_, i) => `g${i}`);
  const items: DockItem[] = ids.map((id, i) => {
    const nat = 60 + Math.floor(r() * 300);
    const mid = Math.max(40, Math.floor(nat * (0.3 + r() * 0.5)));
    const ic = 30 + Math.floor(r() * 60);
    const forms = [form("row", fixed ? nat : Math.min(nat, 120), nat, 31)];
    if (r() < 0.8) forms.push(form("icons", mid, mid, 31));
    if (r() < 0.6) forms.push(form("icons", ic, ic, 31));
    forms.push(form("menu", 0, 0, 0));
    return {
      id,
      kind: "group",
      used: i + 1,
      forms: { row: forms, column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] },
      ...(r() < 0.4 ? { align: "end" as const } : {}),
      ...(r() < 0.3 ? { space: Math.floor(r() * 80) } : {}),
    };
  });
  const held = ids[Math.floor(r() * n)]!;
  const docked = r() < 0.6;
  const edgeItems = ids.filter((id) => id !== held || docked);
  const edge: DockEdge = rail
    ? { id: "rail", side: "left", ring: 0, accepts: ["group"], items: edgeItems, cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } }
    : bar("bar", "bottom", 0, edgeItems, { cross: { min: 31, max: 31, rail: 31 }, gap: pick([0, 4, 8, 12]), pad: { start: 8, end: 8 }, menu: { main: 24 } });
  return {
    state: { stage: { x: 0, y: 0, width: rail ? 700 : width, height: rail ? width : 660 }, edges: [edge], items: byId(items), floats: docked ? [] : [{ id: held, rect: { x: 300, y: 53, width: 36, height: 107 } }], floatKinds: ["group"] },
    held,
  };
}

const lanesOf = (seed: number, rail = false, more: { stretchPositions?: "free" | "pitched" } = {}, fixed = false) => {
  const { state, held } = gen(seed, rail, fixed);
  const previous = solve(state);
  const own = previous.items[held]!.rect;
  return { state, held, previous, regions: lanes(state, held, { previous, grab: { x: own.width / 2, y: own.height / 2 }, ...more }) };
};

describe("seeded bars: marks and stretches", () => {
  it("bar#9, the held toolbar docked, no spot held: gives way is judged in the layout the marks are drawn in (as seen)", () => {
    const { regions, previous } = lanesOf(9);
    // g0 (held) is docked at 58 keeping room before it; g1 is drawn after it at 172.
    expect(previous.items.g0!.edge).toBe("bar");
    expect(previous.items.g1!.rect.x).toBe(172);
    const bar9 = regions.lanes.find((l) => l.id === "bar")!;
    // Before g1: a drop there leaves g1 where it is drawn, so the box is plain (lifting g0 closes g1 up toward the
    // room, which is no giving way).
    expect(bar9.marks.filter((m) => m.id.includes("/^|g1")).map((m) => m.kind)).toEqual(["box"]);
    // After g1: a drop there moves g1 from where it is drawn (172) to the bar's start, away from that room.
    expect(bar9.marks.filter((m) => m.givesWay).map((m) => `${m.id} ${m.givesWay}`)).toEqual(["bar/hatch/g1|$:before g1"]);
  });

  it("bar#1: a stretch with room for the item at one start only is no sliding spot: the plain dock stays a spot of its own", () => {
    const ids = lanesOf(1).regions.lanes.find((l) => l.id === "bar")!.spots.map((s) => s.id);
    expect(ids).toContain("bar/start/g3|g1");
    expect(ids.some((id) => id.startsWith("bar/start/g3|g1@slide"))).toBe(false);
  });

  it("bar#2: the item's own place in a stretch with room for it only there keeps its id and zone, no slide", () => {
    const home = lanesOf(2).regions.lanes.find((l) => l.id === "bar")!.spots.find((s) => s.home)!;
    expect(home.id).toBe("bar/end/g3|g2");
    expect(home.slide).toBeUndefined();
  });

  it("no sliding spot is a point: every slide's range is at least a pixel (seeds 1 to 200, bars and rails)", () => {
    const points: string[] = [];
    for (let seed = 1; seed <= 200; seed++)
      for (const rail of [false, true])
        for (const l of lanesOf(seed, rail).regions.lanes) for (const s of l.spots) if (s.slide && s.slide.to - s.slide.from < 1) points.push(`${rail ? "rail" : "bar"}#${seed} ${s.id} [${s.slide.from}, ${s.slide.to}]`);
    expect(points).toEqual([]);
  });

  it("fixed forms, bar#108: the item's own place, a single start between g0 and g2, is a home spot (both modes)", () => {
    for (const stretchPositions of ["free", "pitched"] as const) {
      const { regions, previous } = lanesOf(108, false, { stretchPositions }, true);
      const home = regions.lanes.find((l) => l.id === "bar")!.spots.find((s) => s.home);
      expect(home, stretchPositions).toBeDefined();
      expect(home!.landing.x).toBeCloseTo(previous.items.g1!.rect.x, 3);
      expect(home!.slide).toBeUndefined();
    }
  });

  it("fixed forms, bar#610: the room between g2 and g1 with a single start (g2 steps down) is a plain dock at 293, with its box and striped end", () => {
    const l = lanesOf(610, false, {}, true).regions.lanes.find((x) => x.id === "bar")!;
    const spot = l.spots.find((s) => s.id === "bar/start/g2|g1");
    expect(spot, l.spots.map((s) => s.id).join(", ")).toBeDefined();
    expect(spot!.slide).toBeUndefined();
    expect(spot!.landing.x).toBeCloseTo(293, 0);
    expect(l.marks.filter((m) => m.id.includes("/g2|g1")).map((m) => `${m.kind} ${m.givesWay ?? ""}`.trim())).toEqual(["box", "hatch g2"]);
  });

  /** The landings a pitched lane offers that the free lanes reach by no spot within 1 px and no slide's range. */
  const unreachable = (seed: number, rail: boolean, fixed: boolean): string[] => {
    const key = `${fixed ? "fixed " : ""}${rail ? "rail" : "bar"}#${seed}`;
    const pitched = lanesOf(seed, rail, { stretchPositions: "pitched" }, fixed).regions.lanes;
    const free = lanesOf(seed, rail, { stretchPositions: "free" }, fixed).regions.lanes;
    const out: string[] = [];
    for (const pl of pitched) {
      const fl = free.find((l) => l.id === pl.id);
      const at = (r: { x: number; y: number }) => (pl.axis === "x" ? r.x : r.y);
      for (const s of pl.spots) {
        const x = at(s.landing);
        const ok = fl?.spots.some((f) => (f.slide ? x >= f.slide.from - 1 && x <= f.slide.to + 1 : Math.abs(at(f.landing) - x) <= 1));
        if (!ok) out.push(`${key} ${s.id} at ${x.toFixed(1)}`);
      }
    }
    return out;
  };

  it("every landing reachable pitched is reachable free: a spot within 1 px or inside a slide's range (seeds 1 to 300, default and fixed forms, bars and rails; and the review's bar#227 and rail#457)", () => {
    const missing: string[] = [...unreachable(227, false, false), ...unreachable(457, true, false)];
    for (let seed = 1; seed <= 300; seed++) for (const fixed of [false, true]) for (const rail of [false, true]) missing.push(...unreachable(seed, rail, fixed));
    expect(missing).toEqual([]);
  });
});
