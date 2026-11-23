/**
 * At a corner a lane not drawn gives way to an edge that is. An empty bar's lane is the band its drop would draw; where a
 * drawn rail stands across its end, the lane stops at the rail's side (as its marks already do), so a pointer coming down
 * the rail is in the rail's lane, not the bar's.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createLandingModel } from "@n-uf/motion/drag";
import { dockDrag, lanes, solve, type DockEdge, type DockItem, type DockState } from "../src";

const form = (kind: string, main: number, cross: number) => ({ kind, main: { min: main, natural: main }, cross: { natural: cross } });
const group = (id: string, main: number) => ({
  id,
  kind: "group",
  used: 1,
  forms: { row: [form("row", main, 28), form("menu", 0, 0)], column: [form("icons", main, 30), form("menu", 0, 0)] },
});

/** An empty top bar (not drawn), a drawn left rail and a drawn right rail, a drawn bottom bar. */
const state = (): DockState =>
  ({
    stage: { x: 0, y: 0, width: 800, height: 600 },
    edges: [
      { id: "bar:top", side: "top", ring: 0, accepts: ["group"], gap: 8, pad: { start: 8, end: 8 }, cross: { min: 31, max: 31, rail: 31 }, items: [] },
      { id: "bar:left", side: "left", ring: 0, accepts: ["group"], zones: ["start"], compact: true, gap: 4, cross: { min: 30, max: 30, rail: 30 }, items: ["a", "b"] },
      { id: "bar:right", side: "right", ring: 0, accepts: ["group"], zones: ["start"], compact: true, gap: 4, cross: { min: 30, max: 30, rail: 30 }, items: ["z"] },
      { id: "bar:bottom", side: "bottom", ring: 0, accepts: ["group"], gap: 8, pad: { start: 8, end: 8 }, cross: { min: 31, max: 31, rail: 31 }, items: ["d"] },
    ],
    items: { a: group("a", 100), b: group("b", 100), z: group("z", 100), d: group("d", 200) },
    floats: [],
    floatKinds: ["group"],
  }) as unknown as DockState;

const right = (r: { x: number; width: number }) => r.x + r.width;

describe("lanes(): at a corner an empty bar's lane gives way to a drawn rail", () => {
  it("an empty top bar's lane stops at the drawn left and right rails' inner sides", () => {
    const s = state();
    const previous = solve(s);
    const r = lanes(s, "z", { previous, grab: { x: 15, y: 8 }, endReach: 24 });
    const top = r.lanes.find((l) => l.id === "bar:top")!;
    const left = r.lanes.find((l) => l.id === "bar:left")!;
    const rightRail = r.lanes.find((l) => l.id === "bar:right")!;
    expect(previous.edges["bar:top"]!.cross).toBe(0);
    expect(top.rect.x).toBeGreaterThanOrEqual(right(left.rect) - 1e-6);
    expect(right(top.rect)).toBeLessThanOrEqual(rightRail.rect.x + 1e-6);
  });

  it("between two edges not drawn the corner is as it was: the top bar's lane keeps its whole width", () => {
    const s = state();
    const bare = { ...s, edges: s.edges.map((e) => (e.id === "bar:left" || e.id === "bar:right" ? { ...e, items: [] } : e)), items: { d: s.items.d } } as DockState;
    const previous = solve(bare);
    const r = lanes(bare, "d", { previous, grab: { x: 15, y: 8 }, endReach: 24 });
    const top = r.lanes.find((l) => l.id === "bar:top")!;
    expect([top.rect.x, top.rect.width]).toEqual([0, 800]);
  });

  it("a pointer gliding along the empty top bar, then down into the left rail 20 px below its top, lands in the rail", () => {
    const s = state();
    const previous = solve(s);
    const grab = { x: 15, y: 8 };
    const m = createLandingModel({ ...dockDrag(s, "z", { previous, grab, endReach: 24 }) });
    const rail = previous.edges["bar:left"]!.rect;
    let t = 0;
    let p = { x: 400, y: 15 };
    m.update(p, t);
    const go = (to: { x: number; y: number }) => {
      const from = p;
      const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2.4);
      for (let i = 1; i <= n; i++) {
        p = { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n };
        m.update(p, (t += 16));
      }
    };
    // Along the bar's band to the rail's inner side, then down the rail.
    go({ x: rail.x + rail.width + 4, y: 15 });
    go({ x: rail.x + rail.width / 2, y: rail.y + 20 });
    for (let i = 0; i < 40; i++) m.update(p, (t += 16));
    expect([m.frame.region, m.frame.lane]).toEqual(["lane", "bar:left"]);
  });
});

// The clip only hands the corner over: an empty edge's lane gives way to a drawn edge that takes the held item there,
// and loses nothing else. Its spots are cut over the band whole and then clipped, so no spot is left with no stretch and
// every landing a pointer reached outside such a drawn edge before the clip it reaches still.

type P = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
const here = dirname(fileURLToPath(import.meta.url));
const EPS = 1e-6;
const inside = (p: P, r: Box): boolean => p.x > r.x + EPS && p.x < r.x + r.width - EPS && p.y > r.y + EPS && p.y < r.y + r.height - EPS;
const seededRandom = (s: number) => () => ((s = (s * 1103515245 + 12345) % 2147483648), s / 2147483648);
const fform = (kind: string, min: number, natural: number, cross: number) => ({ kind, main: { min, natural }, cross: { natural: cross } });

/** A seeded window: top and bottom bars, two side rails, sometimes an inner top bar and a floating item; any edge may be empty. */
function cornerState(seed: number): DockState {
  const r = seededRandom(seed * 9973 + 17);
  const pick = (a: number, b: number) => Math.round(a + r() * (b - a));
  const W = pick(560, 1300);
  const H = pick(420, 900);
  let n = 0;
  const items: DockItem[] = [];
  const mk = (): string => {
    const id = `g${n++}`;
    const L = pick(50, 280);
    const row = [fform("row", L, L, pick(24, 34))];
    if (r() < 0.6) row.push(fform("icons", Math.max(30, Math.round(L * 0.4)), Math.max(30, Math.round(L * 0.4)), 28));
    row.push(fform("menu", 0, 0, 0));
    const C = pick(40, 200);
    items.push({ id, kind: "group", used: n, forms: { row, column: [fform("icons", C, C, pick(26, 30)), fform("menu", 0, 0, 0)] }, ...(r() < 0.3 ? { align: "end" as const } : {}) } as DockItem);
    return id;
  };
  const fill = (p: number, max: number) => (r() < p ? Array.from({ length: pick(1, max) }, mk) : []);
  const barCross = pick(28, 40);
  const edges: DockEdge[] = [
    { id: "bar:top", side: "top", ring: 0, accepts: ["group"], items: fill(0.5, 3), cross: { min: barCross, max: barCross, rail: barCross }, gap: pick(0, 8), pad: { start: 8, end: 8 } } as DockEdge,
    { id: "bar:bottom", side: "bottom", ring: 0, accepts: ["group"], items: fill(0.5, 3), cross: { min: barCross, max: barCross, rail: barCross }, gap: pick(0, 8), pad: { start: 8, end: 8 } } as DockEdge,
    { id: "bar:left", side: "left", ring: 0, accepts: ["group"], compact: true, items: fill(0.5, 2), cross: { min: 30, max: 30, rail: 30 }, gap: 4, pad: { start: 4, end: 4 } } as DockEdge,
    { id: "bar:right", side: "right", ring: 0, accepts: ["group"], compact: true, items: fill(0.5, 2), cross: { min: 30, max: 30, rail: 30 }, gap: 4, pad: { start: 4, end: 4 } } as DockEdge,
  ];
  if (r() < 0.35) edges.push({ id: "bar:inner", side: "top", ring: 1, accepts: ["group"], items: fill(0.5, 2), cross: { min: 32, max: 32, rail: 32 }, gap: 4, pad: { start: 8, end: 8 } } as DockEdge);
  const floats: { id: string; rect: Box }[] = [];
  if (r() < 0.4 || n === 0) floats.push({ id: mk(), rect: { x: Math.round(W / 2), y: Math.round(H / 2), width: 36, height: 107 } });
  return { stage: { x: 0, y: 0, width: W, height: H }, edges, items: Object.fromEntries(items.map((i) => [i.id, i])), floats, floatKinds: ["group"] } as unknown as DockState;
}

/** A window with an empty top bar over two drawn panel columns, a title bar and a bottom bar of toolbars, empty side rails. */
const columnsState = (): DockState => JSON.parse(readFileSync(join(here, "fixtures", "columns-corner.json"), "utf8")) as DockState;

interface Case {
  readonly key: string;
  readonly state: DockState;
  readonly held: string;
  readonly mode: "free" | "pitched";
  readonly share: number;
}

/** The seeds whose windows put an empty edge against a drawn one in every way the clip met, and a few plain ones. */
const SEEDS = [1, 2, 3, 15, 20, 22, 25, 28, 47, 62, 67];

function cases(): Case[] {
  const out: Case[] = [];
  const add = (key: string, state: DockState, helds: readonly string[]) => {
    for (const held of helds) for (const mode of ["free", "pitched"] as const) for (const share of [0.02, 0.5]) out.push({ key: `${key}|${held}|${mode}|${share}`, state, held, mode, share });
  };
  for (const seed of SEEDS) {
    const state = cornerState(seed);
    add(`s${seed}`, state, Object.keys(state.items).slice(0, 2));
  }
  add("columns", columnsState(), ["g1", "g2", "p1"]);
  return out;
}

/** The drag of a case: its regions, the model's options and the grab. */
function drag(c: Case) {
  const seen = solve(c.state);
  const own = seen.items[c.held]!.rect;
  const grab = own.width >= own.height ? { x: own.width * c.share, y: own.height / 2 } : { x: own.width / 2, y: own.height * c.share };
  const opts = { previous: seen, grab, stretchPositions: c.mode };
  const d = dockDrag(c.state, c.held, opts);
  const regions = d.regions;
  const home = regions.lanes.flatMap((l) => l.spots.filter((s) => s.home).map((s) => ({ lane: l.id, spot: s.id })))[0];
  const model = () => createLandingModel({ ...d, ...(home ? { home } : {}) });
  return { seen, regions, model };
}

/**
 * Per lane, the spots a slow sweep along its middle reaches: from the window's middle to one end, to the other, and back,
 * turning at the side of a drawn edge that takes the item (the lane's own aside), so it never comes from inside one.
 */
function sweep(c: Case): Record<string, string[]> {
  const { seen, regions, model } = drag(c);
  const taking = regions.lanes.flatMap((l) => {
    const e = seen.edges[l.id];
    return e && e.cross > EPS ? [{ id: l.id, rect: e.rect }] : [];
  });
  const st = c.state.stage;
  const out: Record<string, string[]> = {};
  for (const lane of regions.lanes) {
    const ax = lane.axis;
    const across = ax === "x" ? lane.rect.y + lane.rect.height / 2 : lane.rect.x + lane.rect.width / 2;
    const at = (a: number): P => (ax === "x" ? { x: a, y: across } : { x: across, y: a });
    const middle = (ax === "x" ? st.x + st.width / 2 : st.y + st.height / 2);
    let smin = ax === "x" ? st.x : st.y;
    let smax = smin + (ax === "x" ? st.width : st.height);
    for (const d of taking) {
      if (d.id === lane.id) continue;
      const a0 = ax === "x" ? d.rect.x : d.rect.y;
      const a1 = a0 + (ax === "x" ? d.rect.width : d.rect.height);
      if (!inside(at((a0 + a1) / 2), d.rect)) continue;
      if (a1 <= middle) smin = Math.max(smin, a1);
      else if (a0 >= middle) smax = Math.min(smax, a0);
    }
    const m = model();
    const reached = new Set<string>();
    let t = 0;
    const step = (p: P) => {
      const f = m.update(p, (t += 16));
      if (f.region === "lane" && f.lane === lane.id && f.spot) reached.add(f.spot);
    };
    let cur = (smin + smax) / 2;
    for (let k = 0; k < 10; k++) step(at(cur));
    for (const to of [smin + 0.5, smax - 0.5, (smin + smax) / 2]) {
      const n = Math.ceil(Math.abs(to - cur) / 2);
      const from = cur;
      for (let k = 1; k <= n; k++) step(at(from + ((to - from) * k) / n));
      cur = to;
      for (let k = 0; k < 6; k++) step(at(cur));
    }
    out[lane.id] = [...reached].sort();
  }
  return out;
}

const SWEEP_FIXTURE = join(here, "fixtures", "corner-sweep-before-clip.json");

describe("lanes(): the corner clip loses no landing", () => {
  it("no spot of any lane has a zero-length stretch", () => {
    const bad: string[] = [];
    for (const c of cases()) for (const l of drag(c).regions.lanes) for (const s of l.spots) if (s.along[1] - s.along[0] <= EPS) bad.push(`${c.key} ${s.id}`);
    expect(bad.slice(0, 6)).toEqual([]);
  });

  it("the spots a slow sweep reaches are the ones it reached before the clip, apart from points on a drawn edge that takes the item", () => {
    const now = Object.fromEntries(cases().map((c) => [c.key, sweep(c)]));
    // Recorded on the release before the clip (26.11.51) with RECORD_CORNER_SWEEP=1.
    if (process.env.RECORD_CORNER_SWEEP) return void writeFileSync(SWEEP_FIXTURE, `${JSON.stringify(now, null, 1)}\n`);
    const before = JSON.parse(readFileSync(SWEEP_FIXTURE, "utf8")) as Record<string, Record<string, string[]>>;
    const diff: string[] = [];
    for (const [key, ls] of Object.entries(before))
      for (const [lane, spots] of Object.entries(ls)) {
        const got = new Set(now[key]?.[lane] ?? []);
        for (const s of spots) if (!got.has(s)) diff.push(`${key} ${lane}: lost ${s}`);
        for (const s of got) if (!spots.includes(s)) diff.push(`${key} ${lane}: added ${s}`);
      }
    // One aim order: in s20 a start-zone dock and a center dock land at one start after g2, and the dock in the zone
    // beside the stretch (the start zone, g2's) is that spot now, in the lanes as in a sliding spot's snaps.
    const ONE_AIM_ORDER = new Set([
      "s20|g0|pitched|0.02 bar:top: lost bar:top/center/g2|$",
      "s20|g0|pitched|0.02 bar:top: added bar:top/start/g2|$",
      "s20|g0|pitched|0.5 bar:top: lost bar:top/center/g2|$",
      "s20|g0|pitched|0.5 bar:top: added bar:top/start/g2|$",
      // A sliding dock counts the dropped item as just used, as every drop does: in s2 the room a drop after g2 makes on
      // the left bar is then longer than one start, so that place (the same neighbors) is a sliding spot, no plain dock.
      "s2|g0|free|0.02 bar:left: lost bar:left/start/g2|$",
      "s2|g0|free|0.02 bar:left: added bar:left/start/g2|$@slide",
      "s2|g0|free|0.5 bar:left: lost bar:left/start/g2|$",
      "s2|g0|free|0.5 bar:left: added bar:left/start/g2|$@slide",
    ]);
    expect(diff.filter((d) => !ONE_AIM_ORDER.has(d)).slice(0, 8)).toEqual([]);
    // (Every listed change still happens: none is stale.)
    expect([...ONE_AIM_ORDER].filter((d) => !diff.includes(d))).toEqual([]);
  }, 300_000);

  it("a corner beside a drawn panel column, which refuses a toolbar, stays the empty top bar's lane", () => {
    const s = columnsState();
    const c: Case = { key: "columns", state: s, held: "g1", mode: "free", share: 0.5 };
    const { seen, regions, model } = drag(c);
    const top = regions.lanes.find((l) => l.id === "bar:top")!;
    expect(seen.edges["bar:top"]!.cross).toBe(0);
    expect(regions.lanes.some((l) => l.id === "col-left" || l.id === "col-right")).toBe(false);
    const got: string[] = [];
    for (const id of ["col-left", "col-right"]) {
      const col = seen.edges[id]!.rect;
      for (const dy of [6, 20]) {
        const p = { x: col.x + col.width / 2, y: col.y + dy };
        if (!inside(p, { ...top.rect, x: col.x, width: col.width })) continue;
        expect(inside(p, top.rect), `${id}+${dy} in the top bar's lane`).toBe(true);
        const m = model();
        const st = s.stage;
        const from = { x: st.x + st.width / 2, y: st.y + st.height / 2 };
        let t = 0;
        m.update(from, t);
        const n = Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 1.2);
        for (let k = 1; k <= n; k++) m.update({ x: from.x + ((p.x - from.x) * k) / n, y: from.y + ((p.y - from.y) * k) / n }, (t += 8));
        let f = m.update(p, (t += 8));
        for (let k = 0; k < 20; k++) f = m.update(p, (t += 8));
        got.push(`${id}+${dy} ${f.region} ${f.lane ?? ""}`);
      }
    }
    expect(got.length).toBeGreaterThan(0);
    expect(got).toEqual(got.map((g) => `${g.split(" ")[0]} lane bar:top`));
  });
});
