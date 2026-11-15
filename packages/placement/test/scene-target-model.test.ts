/**
 * The target model's property check: over generated windows (edge kinds × empty or occupied × item kinds ×
 * sides × insets × side bars), every point inside an edge that takes the dragged kind maps to exactly one target or
 * refusal of that edge (no hole, no overlap), in the point's own zone; the item's own rect maps only to home; and every
 * docked target's slot is its landing.
 */
import { describe, expect, it } from "vitest";
import { lift, refusals, solve, targets, type Scene, type SceneLayout, type SceneTarget, type Zone } from "../src/scene";
import { lostSlots, opensEmpty, zoneExtents } from "../src/scene/targets";
import { targetAt } from "@n-uf/motion/drag";
import { modelScene } from "./model-scene";
import { bar, byId, column, group, panel } from "./scene-fixture";

type R = { x: number; y: number; width: number; height: number };
/** Half-open, so two tiles that meet share no point. */
const inside = (r: R, p: { x: number; y: number }): boolean => p.x >= r.x - 1e-9 && p.x < r.x + r.width - 1e-9 && p.y >= r.y - 1e-9 && p.y < r.y + r.height - 1e-9;
/** A target's zone: its pieces (`hits`) when it has them, else its `hit`. */
const zoneOfT = (t: { hit: R; hits?: readonly R[] }): readonly R[] => t.hits ?? [t.hit];
const inTarget = (t: { hit: R; hits?: readonly R[] }, p: { x: number; y: number }): boolean => zoneOfT(t).some((r) => inside(r, p));
const same = (a: R, b: R): boolean => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

export { modelScene };

/** The categories a point can fail by. */
type Failure = "hole" | "overlap" | "other-zone" | "own-not-home" | "slot-not-landing" | "duplicate-id" | "virtual-hole" | "virtual-overlap" | "refusal-order" | "lost-slot" | "refused-owns" | "seen-hole";

/** The edge a target or refusal belongs to, and its zone (null: no zone). */
function edgeZoneOf(s: Scene, l: SceneLayout, id: string, t: SceneTarget): { edge: string | null; zone: Zone | null } {
  const p = t.place;
  if (p.kind === "gap") return { edge: p.edge, zone: p.zone };
  if (p.kind === "home") {
    // A home target's edge is the dragged item's own; its zone is the item's.
    const m = /^(?:gap|strip):([^:]+):(start|center|end)/.exec(t.id);
    if (m) return { edge: m[1]!, zone: m[2] as Zone };
    const it = l.items[id];
    return { edge: it?.edge ?? null, zone: (s.items[id]?.align as Zone | undefined) ?? "start" };
  }
  return { edge: null, zone: null };
}

/** Runs the check over `seeds`; returns the failure counts per category and a few examples. */
export function propertyCheck(seeds: readonly number[], flush = false, middle = false): { points: number; counts: Record<Failure, number>; examples: string[] } {
  const counts: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0, "duplicate-id": 0, "virtual-hole": 0, "virtual-overlap": 0, "refusal-order": 0, "lost-slot": 0, "refused-owns": 0, "seen-hole": 0 };
  const examples: string[] = [];
  const fail = (k: Failure, msg: string): void => {
    counts[k]++;
    if (examples.length < 40) examples.push(`${k}: ${msg}`);
  };
  let points = 0;
  for (const seed of seeds) {
    const s = modelScene(seed, flush, middle);
    const now = solve(s);
    for (const id of Object.keys(s.items)) {
      const it = s.items[id]!;
      if (it.fixed || it.closed) continue;
      // `home:<id>` is an alias of home's tile, for hosts that read it (home's only tile when no slot is home).
      const all = targets(s, id).filter((t) => !t.free);
      const slotHome = all.some((t) => t.place.kind === "home" && !t.id.startsWith("home:"));
      const ts = all.filter((t) => !(slotHome && t.id.startsWith("home:")));
      const rs = refusals(s, id);
      // Every slot the filter keeps, with room in its zone, keeps a hit.
      for (const x of lostSlots(s, id)) fail("lost-slot", `seed ${seed} drag ${id} ${x}`);
      // A target is a place a pointer can be: a zone under 1 px each way, or 1 px² in all, is as good as lost.
      for (const t of all) {
        const pieces = zoneOfT(t);
        if (pieces.some((p) => p.width < 1 || p.height < 1) || pieces.reduce((n, p) => n + p.width * p.height, 0) < 1) fail("lost-slot", `seed ${seed} drag ${id} ${t.id}: a sub-pixel hit ${JSON.stringify(t.hit)}`);
      }
      const lifted = lift(s, id);
      const base = solve(lifted);
      // Ids are unique per call: every target's, and every refusal's.
      for (const ids of [all.map((t) => t.id), rs.map((x) => x.id)]) {
        const twice = ids.filter((x, i) => ids.indexOf(x) !== i);
        if (twice.length) fail("duplicate-id", `seed ${seed} ${id} ${twice.join(", ")}`);
      }
      // A zone's refusals are numbered by where they lie along the edge: `refuse:<edge>:<zone>`, then `:1`, `:2`, …
      for (const r of rs) {
        const n = r.id === `refuse:${r.edge}:${r.zone}` ? 0 : Number(r.id.slice(`refuse:${r.edge}:${r.zone}:`.length));
        const side = s.edges.find((e) => e.id === r.edge)?.side;
        const vertical = side ? side === "left" || side === "right" : r.edge.startsWith("rail:");
        const at = (x: typeof r): [number, number] => (vertical ? [x.hit.y, x.hit.x] : [x.hit.x, x.hit.y]);
        const earlier = (x: typeof r): boolean => at(x)[0] < at(r)[0] || (at(x)[0] === at(r)[0] && at(x)[1] < at(r)[1]);
        const before = rs.filter((x) => x.edge === r.edge && x.zone === r.zone && earlier(x)).length;
        if (n !== before) fail("refusal-order", `seed ${seed} ${id} ${r.id} is number ${before} along its edge`);
      }
      // A refused place owns nothing against other edges: a side's rail that refuses every drop of the item (it offers
      // no rail target) changes no other target. Without it (its rail not taking the kind) every other target is the same.
      for (const side of ["left", "right"] as const) {
        if (!s.rails?.[side]?.accepts.includes(it.kind) || !s.columns?.[side]?.accepts.includes(it.kind)) continue;
        if (!rs.some((r) => r.edge === `rail:${side}`) || all.some((t) => t.id.startsWith(`rail:${side}:`))) continue;
        const rails = { ...s.rails, [side]: { ...s.rails[side]!, accepts: s.rails[side]!.accepts.filter((k) => k !== it.kind) } };
        const key = (list: readonly SceneTarget[]): string => JSON.stringify(list.map((t) => [t.id, t.hit]));
        if (key(all) !== key(targets({ ...s, rails }, id).filter((t) => !t.free))) fail("refused-owns", `seed ${seed} drag ${id}: the refused rail:${side} moves other targets`);
      }
      // A refusal owns nothing, whether its zone has targets or not: it never lies on another edge's drawn rect.
      for (const r of rs) {
        for (const [eid, e] of Object.entries(base.edges)) {
          if (eid === r.edge || e.rect.width <= 1e-6 || e.rect.height <= 1e-6) continue;
          const w = Math.min(r.hit.x + r.hit.width, e.rect.x + e.rect.width) - Math.max(r.hit.x, e.rect.x);
          const h = Math.min(r.hit.y + r.hit.height, e.rect.y + e.rect.height) - Math.max(r.hit.y, e.rect.y);
          if (w > 1e-6 && h > 1e-6) fail("refused-owns", `seed ${seed} drag ${id}: ${r.id} lies on ${eid}`);
        }
      }
      // And a bar's zone that refuses every drop of the item (no target of that zone) changes no other target; without
      // it (the zone not taking the kind) every target is the same.
      for (const e of s.edges) {
        if ((e.side !== "top" && e.side !== "bottom") || !e.accepts.includes(it.kind)) continue;
        for (const z of ["start", "center", "end"] as const) {
          if (!rs.some((r) => r.edge === e.id && r.zone === z) || all.some((t) => t.id.startsWith(`gap:${e.id}:${z}:`) || t.id === `strip:${e.id}:${z}`)) continue;
          const zoneAccepts = Object.fromEntries((["start", "center", "end"] as const).map((x) => [x, x === z ? [] : (e.zoneAccepts?.[x] ?? e.accepts)]));
          const s2: Scene = { ...s, edges: s.edges.map((x) => (x === e ? { ...x, zoneAccepts } : x)) };
          const key = (list: readonly SceneTarget[]): string => JSON.stringify(list.map((t) => [t.id, t.hit]));
          if (key(all) !== key(targets(s2, id).filter((t) => !t.free))) fail("refused-owns", `seed ${seed} drag ${id}: the refused zone ${e.id}:${z} moves other targets`);
        }
      }
      // Preview = landing, from every piece of a docked target's zone.
      for (const t of ts) {
        if (t.place.kind === "home" || t.place.kind === "none" || !t.slot) continue;
        for (const h of zoneOfT(t)) {
          const landed = t.after({ x: h.x + h.width / 2, y: h.y + h.height / 2 }).layout.items[id]?.rect;
          if (!landed || !same(landed, t.slot)) fail("slot-not-landing", `seed ${seed} ${id} ${t.id}`);
        }
        // `hit` is the largest of the pieces.
        if (t.hits && !t.hits.some((h) => same(h, t.hit) && t.hits!.every((o) => o.width * o.height <= h.width * h.height + 1e-9))) fail("slot-not-landing", `seed ${seed} ${id} ${t.id}: hit isn't its largest piece`);
      }
      // The virtual edges: points either side of each column line, and down the rail where it lies or would lie, map to
      // exactly one target or refusal: never to nothing (a hole the float fills) and never to two.
      const virtualPoints: { x: number; y: number }[] = [];
      for (const side of ["left", "right"] as const) {
        if (!s.columns?.[side]?.accepts.includes(it.kind)) continue;
        const open = lifted.edges.filter((e) => e.side === side && e.column === true).flatMap((e) => base.edges[e.id] ?? []).filter((x) => !x.folded && !x.rides && x.cross > 0);
        const xs = open.length ? open.flatMap((x) => [x.rect.x, x.rect.x + x.rect.width]) : [side === "left" ? base.content.x : base.content.x + base.content.width];
        for (const x of xs) for (let y = base.content.y + 3; y < base.content.y + base.content.height - 3; y += 6) virtualPoints.push({ x: x - 11, y }, { x: x + 11, y });
        const rail = base.rails[side]?.rect ?? base.railPlaces[side];
        if (!rail || !s.rails?.[side]?.accepts.includes(it.kind)) continue;
        const rx = base.rails[side] ? rail.x + rail.width / 2 : side === "left" ? rail.x + 5 : rail.x + rail.width - 5;
        for (let y = rail.y + 3; y < rail.y + rail.height - 3; y += 6) virtualPoints.push({ x: rx, y });
      }
      const own = now.items[id];
      const ownRect = own?.edge && !own.floating ? own.rect : null;
      // A panel's body (but for a band at each end) is its column's, and no drop place: the float's.
      const anyBody = Object.values(base.items).filter((x) => x.edge && x.formKind === "open" && !x.floating).map((x) => ({ x: x.rect.x, y: x.rect.y + 12, width: x.rect.width, height: x.rect.height - 24 }));
      for (const pt of virtualPoints) {
        // The item's own rect is home's (the own-not-home category checks it).
        if (!inside(s.stage, pt) || (s.chrome ?? []).some((c) => inside(c, pt)) || (ownRect && inside(ownRect, pt)) || anyBody.some((b) => inside(b, pt))) continue;
        points++;
        const hits = [...ts.filter((t) => inTarget(t, pt)).map((t) => t.id), ...rs.filter((x) => inside(x.hit, pt)).map((x) => x.id)];
        if (hits.length === 0) fail("virtual-hole", `seed ${seed} drag ${id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}`);
        else if (hits.length > 1) fail("virtual-overlap", `seed ${seed} drag ${id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}: ${hits.join(", ")}`);
      }
      // What the user sees: until a target shows, the host draws the layout as it is now. Every point under an edge's
      // rect as it is now (but the item's own edge) maps to a target or a refusal: a stretch is owned by what is seen
      // there, and refuses where its owner has no slot. Panel bodies, fixed items and chrome stay no drop place.
      const nowBody = Object.values(now.items).filter((x) => x.edge && x.formKind === "open" && !x.floating).map((x) => ({ x: x.rect.x, y: x.rect.y + 12, width: x.rect.width, height: x.rect.height - 24 }));
      const fixedRects = [...Object.values(now.items), ...Object.values(base.items)].filter((x) => x.fixed).map((x) => x.rect);
      for (const [eid, e] of Object.entries(now.edges)) {
        if (eid === own?.edge || e.rect.width < 1 || e.rect.height < 1) continue;
        for (let x = e.rect.x + 3; x < e.rect.x + e.rect.width - 1; x += 6)
          for (let y = e.rect.y + 3; y < e.rect.y + e.rect.height - 1; y += 6) {
            const pt = { x, y };
            if (!inside(s.stage, pt) || [...(s.chrome ?? []), ...anyBody, ...nowBody, ...fixedRects].some((r) => inside(r, pt)) || (ownRect && inside(ownRect, pt))) continue;
            points++;
            if (!ts.some((t) => inTarget(t, pt)) && !rs.some((r) => inside(r.hit, pt))) fail("seen-hole", `seed ${seed} drag ${id} under ${eid} at ${x.toFixed(0)},${y.toFixed(0)}`);
          }
      }
      for (const e of s.edges) {
        if (!e.accepts.includes(it.kind)) continue;
        const le = base.edges[e.id];
        if (!le || le.folded || le.rides) continue;
        // An empty edge that doesn't open to the kind (a tray column to a toolbar) has no tiles for it.
        if (le.stack.items.length === 0 && !opensEmpty(s, e, it.kind)) continue;
        const vertical = e.side === "left" || e.side === "right";
        // The edge's band: its rect as the lift leaves it, at least 12 px deep inward (an empty edge has none).
        const r = le.rect;
        const depth = Math.max(vertical ? r.width : r.height, 12);
        const band: R = vertical
          ? { x: e.side === "left" ? r.x : r.x + r.width - depth, y: r.y, width: depth, height: r.height }
          : { x: r.x, y: e.side === "top" ? r.y : r.y + r.height - depth, width: r.width, height: depth };
        const len = vertical ? band.height : band.width;
        const a0 = vertical ? band.y : band.x;
        // The zones as the model tiles them: thirds where zones only align, the solver's spans where items fill.
        const extents = zoneExtents(s, id, e.id);
        // Fixed items, other edges and chrome take their own rects: not this edge's points.
        const others = Object.entries(base.edges).filter(([oid, o]) => oid !== e.id && o.rect.width > 0 && o.rect.height > 0).map(([, o]) => o.rect);
        const fixed = Object.values(base.items).filter((x) => x.edge === e.id && x.fixed).map((x) => x.rect);
        // Panel bodies, but for a band at each end, aren't drop places.
        const bodies = Object.entries(base.items).filter(([, x]) => x.edge === e.id && x.formKind === "open").map(([, x]) => (vertical ? { x: x.rect.x, y: x.rect.y + 12, width: x.rect.width, height: x.rect.height - 24 } : x.rect));
        for (let k = 3; k < len - 3; k += 6) {
          const along = a0 + k;
          const cross = vertical ? band.x + band.width / 2 : band.y + band.height / 2;
          const pt = vertical ? { x: cross, y: along } : { x: along, y: cross };
          if ([...others, ...fixed, ...bodies, ...(s.chrome ?? [])].some((o) => inside(o, pt))) continue;
          if (ownRect && !inside(ownRect, pt) && [...Object.values(base.items)].some((x) => x !== own && x.edge && x.edge !== e.id && inside(x.rect, pt))) continue;
          points++;
          const zone = extents.find((z) => along >= z.a - 1e-9 && along < z.b - 1e-9)?.zone ?? null;
          const hitT = ts.filter((t) => inTarget(t, pt));
          const hitR = rs.filter((x) => inside(x.hit, pt));
          const mine = hitT.filter((t) => {
            const ez = edgeZoneOf(s, now, id, t);
            return ez.edge === e.id || (t.place.kind === "home" && ez.edge === null);
          });
          const mineR = hitR.filter((x) => x.edge === e.id);
          const at = `seed ${seed} drag ${id} ${e.id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}`;
          if (ownRect && inside(ownRect, pt)) {
            if (!hitT.length || hitT.some((t) => t.place.kind !== "home") || hitR.length) fail("own-not-home", `${at}: ${[...hitT.map((t) => t.id), ...hitR.map((x) => x.id)].join(", ") || "nothing"}`);
            continue;
          }
          const all = hitT.length + hitR.length;
          if (all === 0) {
            fail("hole", at);
            continue;
          }
          if (all > 1) {
            fail("overlap", `${at}: ${[...hitT.map((t) => t.id), ...hitR.map((x) => x.id)].join(", ")}`);
            continue;
          }
          // One tile of another edge (a corner a full bar owns, a column line, the rail) owns the point: fine.
          const one = mine[0] ?? null;
          if (!one && !mineR[0]) continue;
          // Home's tile may run across zones: the stretches beside the item with no slot of their own are home's.
          if (one?.place.kind === "home") continue;
          const oneZone = one ? edgeZoneOf(s, now, id, one).zone : (mineR[0]?.zone ?? null);
          if (oneZone !== null && zone !== null && oneZone !== zone) fail("other-zone", `${at} (${zone}): ${[...hitT.map((t) => t.id), ...hitR.map((x) => x.id)].join(", ")}`);
        }
      }
    }
  }
  return { points, counts, examples };
}

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

/** No failure of any kind (before the one target model: 8159 holes, 4021 overlaps, 14849 other-zone, 2667 own-not-home). */
const KNOWN: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0, "duplicate-id": 0, "virtual-hole": 0, "virtual-overlap": 0, "refusal-order": 0, "lost-slot": 0, "refused-owns": 0, "seen-hole": 0 };

/** Every edge renamed to an id with ":" in it: the same targets and refusals, under the renamed ids. */
export function colonRenameDiffs(seeds: readonly number[]): string[] {
  const out: string[] = [];
  const J = JSON.stringify;
  for (const seed of seeds) {
    const s = modelScene(seed);
    const real = new Set(s.edges.map((e) => e.id));
    const renamed = (id: string): string => id.replace(/^(gap|strip|refuse):([^:]+)/, (all, kind: string, edge: string) => (real.has(edge) ? `${kind}:x:${edge}` : all));
    const s2: Scene = { ...s, edges: s.edges.map((e) => ({ ...e, id: `x:${e.id}` })) };
    for (const id of Object.keys(s.items)) {
      if (s.items[id]!.fixed || s.items[id]!.closed) continue;
      const a = J([targets(s, id).map((t) => [renamed(t.id), t.hit, t.slot]), refusals(s, id).map((r) => [renamed(r.id), r.hit, r.reason])]);
      const b = J([targets(s2, id).map((t) => [t.id, t.hit, t.slot]), refusals(s2, id).map((r) => [r.id, r.hit, r.reason])]);
      if (a !== b) out.push(`seed ${seed} drag ${id}`);
    }
  }
  return out;
}

describe("the target model's property check", () => {
  it("space ownership: a narrow column keeps its gaps inside its own rect; the column lines take the space beside it", () => {
    // A 30 px column (its panel in rail form): its outer line at 0 and its inner line at 30.
    const s: Scene = {
      stage: { x: 0, y: 0, width: 800, height: 500 },
      edges: [column("left0", "left", 0, ["p1"], { column: true })],
      items: byId([panel("p1", 1, { from: 1 }), group("g", 1)]),
      floats: [{ id: "g", rect: { x: 300, y: 200, width: 200, height: 40 } }],
      floatKinds: ["group", "panel"],
      columns: { left: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } } },
    };
    expect(solve(s).edges.left0!.rect.width).toBe(30);
    const ts = targets(s, "g");
    const hit = (id: string): R | undefined => ts.find((t) => t.id === id)?.hit;
    // The lines, at 0 and 30, each up to COLUMN_REACH from its line. A line owns half the hit band about it, ranked
    // where its new column would be laid: the outer line pushes the column (it owns 0..6 of it), the inner line is
    // pushed by it (the column keeps 24..30).
    expect(hit("column:left:0")).toEqual({ x: -22, y: 0, width: 28, height: 500 });
    expect(hit("column:left:1")).toEqual({ x: 30, y: 0, width: 22, height: 500 });
    // The column's gaps, inside the rest of its 30 px (their reach past it, where the wider column would be, is the
    // lines' first).
    const gaps = ts.filter((t) => t.id.startsWith("gap:left0:"));
    expect(gaps.map((t) => t.id).sort()).toEqual(["gap:left0:start:0", "gap:left0:start:1"]);
    for (const t of gaps) expect([t.hit.x, t.hit.x + t.hit.width]).toEqual([6, 30]);
    expect(lostSlots(s, "g")).toEqual([]);
  });

  it("a column line ranks among the sides: an empty full bar's band, laid before the sides, outranks it", () => {
    const s: Scene = {
      stage: { x: 0, y: 0, width: 800, height: 500 },
      edges: [bar("top", "top", 0, []), column("left0", "left", 1, ["p1"], { column: true })],
      items: byId([panel("p1", 1), group("g", 2)]),
      floats: [{ id: "g", rect: { x: 500, y: 200, width: 200, height: 40 } }],
      floatKinds: ["group", "panel"],
      columns: { left: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } } },
    };
    const top = solve(s).edges.top!.rect;
    const line = targets(s, "g").find((t) => t.id === "column:left:1")!;
    // The bar owns half the hit band below its boundary; the line's tile starts under it.
    expect(line.hit.y).toBe(top.y + 12);
  });

  it("a column line between two touching columns owns its band: the seam keeps a new-column target", () => {
    // Two columns side by side with no gutter: the line between them at their seam.
    const s: Scene = {
      stage: { x: 0, y: 0, width: 1000, height: 500 },
      edges: [column("left0", "left", 0, ["p1"], { column: true }), column("left1", "left", 1, ["p2"], { column: true })],
      items: byId([panel("p1", 1), panel("p2", 2), group("g", 3)]),
      floats: [{ id: "g", rect: { x: 700, y: 200, width: 200, height: 40 } }],
      floatKinds: ["group", "panel"],
      columns: { left: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } } },
      gutter: 0,
    };
    const l = solve(s);
    const seam = l.edges.left1!.rect.x;
    expect(l.edges.left0!.rect.x + l.edges.left0!.rect.width).toBe(seam);
    const line = targets(s, "g").find((t) => t.id === "column:left:1");
    // Its band about the seam is the line's against the inner column it would push; the outer column keeps its side.
    expect(line?.hit.x).toBe(seam);
    expect(line?.hit.width).toBe(6);
    expect(lostSlots(s, "g")).toEqual([]);
  });

  it("a refused place owns nothing: flush beside a side bar, the outer column line keeps its target over the refused rail", () => {
    // No inset; a side bar outside it, then a column; hand folds ride, so a drop into the empty rail (its place right
    // after the bar) would ride over the column, not show in the rail: the filter refuses it.
    const s: Scene = {
      stage: { x: 0, y: 0, width: 1000, height: 500 },
      edges: [{ id: "left-bar", side: "left", ring: 0, accepts: ["group"], items: ["g1"], cross: { min: 32, max: 32, rail: 32 }, outsideInset: true }, column("left-col", "left", 1, ["p1"], { column: true })],
      items: byId([group("g1", 1), panel("p1", 3), panel("p", 2)]),
      floats: [{ id: "p", rect: { x: 500, y: 100, width: 220, height: 200 } }],
      floatKinds: ["group", "panel"],
      columns: { left: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } } },
      rails: { left: { width: 30, accepts: ["panel"] } },
      handFold: "ride",
      gutter: 8,
    };
    const l = solve(s);
    const bar = l.edges["left-bar"]!.rect;
    expect(l.railPlaces.left!.x).toBe(bar.x + bar.width);
    const line = targets(s, "p").find((t) => t.id === "column:left:1");
    // The new column just inside the bar is offered, its hit starting at the bar's inner side.
    expect(line).toBeDefined();
    expect(line!.hit.x).toBe(bar.x + bar.width);
    expect(line!.hit.width).toBeGreaterThan(0);
    // The rail's refusal takes only what the other edges leave: here nothing, the column's rect being the column's.
    const rail = refusals(s, "p").filter((r) => r.edge === "rail:left");
    for (const r of rail) expect(r.hit.x).toBeGreaterThanOrEqual(line!.hit.x + line!.hit.width);
    expect(lostSlots(s, "p")).toEqual([]);
  });

  it("clipping changes a slot's shape, never who owns it: what is left of a slot's tile is all its own (hits)", () => {
    // The group's own place (home, in the bottom bar from x 8) takes a corner of the overlay column's last gap tile; what
    // is left is an L. The column owns its whole 30 px (drawn), so the whole L stays the gap's: `hits` holds its pieces,
    // `hit` the largest; nothing of it is refused. The column line outside it owns nothing of the column's drawn rect.
    const s: Scene = {
      stage: { x: 0, y: 0, width: 536, height: 869 },
      edges: [
        bar("bottom", "bottom", 0, ["g0"], { gap: 4, pad: { start: 8, end: 8 }, span: "between" }),
        column("left0", "left", 0, ["p1"], { mode: "overlay", column: true }),
        column("left1", "left", 1, [], { column: true }),
      ],
      items: byId([group("g0", 43), panel("p1", 29, { from: 1 })]),
      floats: [],
      floatKinds: ["panel", "group"],
      columns: { left: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } } },
      rails: { left: { width: 30, accepts: ["panel"] } },
      gutter: 0,
    };
    const l = solve(s);
    expect(l.edges.left0!.rect.width).toBe(30);
    const home = l.items.g0!.rect;
    const ts = targets(s, "g0");
    const gap = ts.find((t) => t.id === "gap:left0:start:1")!;
    const pieces = gap.hits ?? [gap.hit];
    // The L: the column's 30 px from the gap's line down to the bar, and the 8 px corner beside home below it.
    const areaOf = (rs: readonly R[]): number => rs.reduce((n, r) => n + r.width * r.height, 0);
    expect(areaOf(pieces)).toBeCloseTo(30 * (home.y - gap.hit.y) + home.x * home.height, 6);
    expect(pieces.some((p) => inside(p, { x: 4, y: home.y + 10 }))).toBe(true);
    expect(pieces.some((p) => inside(p, { x: 4, y: 400 }) || inside(p, { x: 20, y: 400 }))).toBe(true);
    expect(gap.hit).toEqual(pieces.reduce((a, p) => (p.width * p.height > a.width * a.height ? p : a)));
    expect(refusals(s, "g0").filter((r) => r.edge === "left0")).toEqual([]);
    // A host that reads one rect still finds the target there by `hits` (the pick rule tests every piece).
    expect(targetAt(ts, { x: 4, y: home.y + 10 })?.id).toBe("gap:left0:start:1");
    expect(lostSlots(s, "g0")).toEqual([]);
  });

  it("a refused zone owns nothing: an empty top bar's zone with only home's place leaves the column's top band to it", () => {
    // Seed 5, the group dragged out of the empty top bar: the bar's start zone has no place but home's, so its band over
    // the left column (y 12–24) is the column's: there the column refuses the group itself (its start zone takes panels).
    const s = modelScene(5);
    const col = solve(lift(s, "g0")).edges["left-col"]!.rect;
    const rs = refusals(s, "g0");
    expect(rs.filter((r) => r.edge === "top").some((r) => r.hit.x < col.x + col.width && r.hit.x + r.hit.width > col.x)).toBe(false);
    expect(rs.some((r) => r.edge === "left-col" && r.zone === "start" && r.reason === "not-accepted" && r.hit.y === col.y)).toBe(true);
  });

  it("a refused stretch owns nothing: an empty bottom bar's stretch with no slot of its own leaves a column's foot to it", () => {
    // Seed 359, the group dragged out of the bottom bar (0 high once lifted): its start zone has a slot, but past the
    // group's own place it has none. That stretch's band over the left column's foot is the column's: its last gap.
    const s = modelScene(359);
    const col = solve(lift(s, "g3")).edges["left-col"]!.rect;
    const on = (r: R): boolean => r.x < col.x + col.width && r.x + r.width > col.x && r.y < col.y + col.height && r.y + r.height > col.y;
    expect(refusals(s, "g3").filter((r) => r.edge === "bottom" && on(r.hit))).toEqual([]);
    const foot = targets(s, "g3").find((t) => t.id.startsWith("gap:left-col:") && t.hit.y + t.hit.height === col.y + col.height);
    expect(foot).toBeDefined();
  });

  it("an edge that only moves when the item lifts owns where it lies after the lift, not where it lay before", () => {
    // Flush seed 223: with the item docked, the left column is folded into the rail and the side bar lies inside it
    // (x 38–70); with the item lifted, the column opens at x 40–300 and the bar lies at the window's side. The bar's
    // place before the lift is the column's now: the column's gap keeps it, no hole is left there.
    const s = modelScene(223, true);
    expect(solve(s).edges["left-bar"]!.rect.x).toBe(38);
    // Dragging p4 the column opens at x 40: its first gap starts after the column line's band (to x 46). Dragging the
    // column's own panel the column goes: the column line at the content's edge (x 40) reaches there instead.
    const gap = targets(s, "p4").find((t) => t.id === "gap:left-col:start:0")!;
    expect(gap.hit.x).toBe(46);
    for (const id of ["p4", "left-p"]) {
      const hits = [...targets(s, id).filter((t) => !t.free).flatMap(zoneOfT), ...refusals(s, id).map((r) => r.hit)];
      // Up to the column line's reach (x 40 + 22); past it lies the content, the float's.
      for (let x = 39; x < 62; x += 2) expect(hits.filter((h) => inside(h, { x, y: 40 })).length, `${id} at ${x},40`).toBe(1);
    }
  });

  it("flush windows (no inset, a column inside each side bar, rails, riding folds) keep every category at zero", () => {
    const r = propertyCheck(Array.from({ length: 600 }, (_, i) => i + 1), true);
    // eslint-disable-next-line no-console
    if (process.env.MODEL_REPORT) console.log(JSON.stringify({ points: r.points, counts: r.counts }), "\n" + r.examples.join("\n"));
    expect(r.points).toBeGreaterThan(2000);
    for (const k of Object.keys(KNOWN) as Failure[]) expect(r.counts[k], `${k}: ${r.examples.filter((x) => x.startsWith(k)).slice(0, 5).join(" | ")}`).toBeLessThanOrEqual(KNOWN[k]);
  });

  it("windows whose columns and column templates split panels in halves (hitBand \"middle\") keep every category at zero", () => {
    for (const flush of [false, true]) {
      const r = propertyCheck(Array.from({ length: 300 }, (_, i) => i + 1), flush, true);
      // eslint-disable-next-line no-console
      if (process.env.MODEL_REPORT) console.log(JSON.stringify({ points: r.points, counts: r.counts }), "\n" + r.examples.join("\n"));
      expect(r.points).toBeGreaterThan(1000);
      for (const k of Object.keys(KNOWN) as Failure[]) expect(r.counts[k], `${flush ? "flush " : ""}${k}: ${r.examples.filter((x) => x.startsWith(k)).slice(0, 5).join(" | ")}`).toBeLessThanOrEqual(KNOWN[k]);
    }
  });

  it("an edge whose id holds ':' is an edge like any other (virtual edges are flagged, not named)", () => {
    expect(colonRenameDiffs(Array.from({ length: 40 }, (_, i) => i + 1))).toEqual([]);
  });

  it("every point of an accepting edge maps to one target or refusal of its own zone; own rect → home; slot = landing", () => {
    const r = propertyCheck(SEEDS);
    // eslint-disable-next-line no-console
    if (process.env.MODEL_REPORT) console.log(JSON.stringify({ points: r.points, counts: r.counts }), "\n" + r.examples.join("\n"));
    expect(r.points).toBeGreaterThan(5000);
    for (const k of Object.keys(KNOWN) as Failure[]) expect(r.counts[k], `${k}: ${r.examples.filter((x) => x.startsWith(k)).slice(0, 5).join(" | ")}`).toBeLessThanOrEqual(KNOWN[k]);
  });
});
