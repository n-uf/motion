/**
 * The target model's property check: over generated windows (edge kinds × empty or occupied × item kinds ×
 * sides × insets × side bars), every point inside an edge that takes the dragged kind maps to exactly one target or
 * refusal of that edge (no hole, no overlap), in the point's own zone; the item's own rect maps only to home; and every
 * docked target's slot is its landing.
 */
import { describe, expect, it } from "vitest";
import { lift, refusals, solve, targets, type Edge, type Scene, type SceneItem, type SceneLayout, type SceneTarget, type Zone } from "../src/scene";
import { lostSlots, opensEmpty, zoneExtents } from "../src/scene/targets";
import { bar, byId, column, controls, group, panel, seeded, title } from "./scene-fixture";

type R = { x: number; y: number; width: number; height: number };
/** Half-open, so two tiles that meet share no point. */
const inside = (r: R, p: { x: number; y: number }): boolean => p.x >= r.x - 1e-9 && p.x < r.x + r.width - 1e-9 && p.y >= r.y - 1e-9 && p.y < r.y + r.height - 1e-9;
const same = (a: R, b: R): boolean => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

/** A generated window: a top bar (plain or title), a bottom bar, each side one edge kind, maybe a side bar; floats of each kind. */
export function modelScene(seed: number): Scene {
  const rnd = seeded(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const items: SceneItem[] = [];
  const edges: Edge[] = [];
  let n = 0;
  const g = (): string => {
    const id = `g${n++}`;
    const w = 60 + Math.floor(rnd() * 120);
    items.push({
      ...group(id, Math.floor(rnd() * 50), rnd() < 0.4 ? { align: pick(["start", "center", "end"] as const) } : {}),
      forms: { row: [{ kind: "row", main: { min: w, natural: w }, cross: { natural: 28 } }, { kind: "icons", main: { min: 40, natural: 40 }, cross: { natural: 28 } }, { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } }], column: [{ kind: "icons", main: { min: 84, natural: 84 }, cross: { natural: 28 } }, { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } }] },
    });
    return id;
  };
  const p = (): string => {
    const id = `p${n++}`;
    items.push(panel(id, Math.floor(rnd() * 50), rnd() < 0.2 ? { from: 1 } : {}, 200 + Math.floor(rnd() * 80)));
    return id;
  };
  const some = (make: () => string, max: number): string[] => (rnd() < 0.35 ? [] : Array.from({ length: 1 + Math.floor(rnd() * max) }, make));
  // Every fifth group made for an edge is closed: a member that draws nothing but still bounds its gaps.
  const gEdge = (): string => {
    const id = g();
    if (n % 5 === 3) items[items.length - 1] = { ...items[items.length - 1]!, closed: true };
    return id;
  };
  // Top: a title bar (title, groups, controls) or a plain bar; bottom: a bar.
  if (rnd() < 0.5) {
    items.push(title(), controls());
    edges.push({ id: "titlebar", side: "top", ring: 0, accepts: ["group"], items: ["title", ...some(gEdge, 2), "controls"], cross: { min: 32, max: 32, rail: 32 } });
  } else edges.push(bar("top", "top", 0, some(gEdge, 3)));
  if (rnd() < 0.7) edges.push(bar("bottom", "bottom", 0, some(gEdge, 2)));
  for (const side of ["left", "right"] as const) {
    const kind = pick(["none", "column", "tray", "rail", "sidebar"] as const);
    if (kind === "column") edges.push(column(`${side}-col`, side, 1, some(p, 2)));
    if (kind === "tray") edges.push(column(`${side}-col`, side, 1, [...some(p, 1), ...some(gEdge, 1)], { accepts: ["panel", "group"], zoneAccepts: { start: ["panel"], end: ["group"] } }));
    if (kind === "rail") edges.push({ id: `${side}-rail`, side, ring: 0, accepts: ["group"], items: some(gEdge, 2), cross: { min: 30, max: 30, rail: 30 }, compact: true });
    if (kind === "sidebar") edges.push({ id: `${side}-bar`, side, ring: 0, accepts: ["group"], items: some(gEdge, 2), cross: { min: 32, max: 32, rail: 32 }, outsideInset: rnd() < 0.5 });
  }
  // Floats of each kind, so every edge has a kind to take.
  const fg = g();
  const fp = p();
  const W = 700 + Math.floor(rnd() * 700);
  const H = 500 + Math.floor(rnd() * 300);
  const inset = rnd() < 0.4 ? 12 : 0;
  // Every third window has rails: its side columns are dynamic and fold into their rail to keep the content's minimum.
  const rails = seed % 3 === 0;
  return {
    stage: { x: 0, y: 0, width: W, height: H },
    edges: rails ? edges.map((e) => (e.id.endsWith("-col") ? { ...e, column: true } : e)) : edges,
    ...(rails ? { rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } }, contentMin: { width: W - 250, height: 200 } } : {}),
    items: byId(items),
    floats: [
      { id: fg, rect: { x: W / 2, y: H / 2, width: 200, height: 40 } },
      { id: fp, rect: { x: W / 2, y: H / 3, width: 220, height: 200 } },
    ],
    floatKinds: ["group", "panel"],
    columns: { left: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } }, right: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } } },
    gutter: 8,
    ...(inset ? { inset: { left: inset, right: inset, top: inset, bottom: inset } } : {}),
  };
}

/** The categories a point can fail by. */
type Failure = "hole" | "overlap" | "other-zone" | "own-not-home" | "slot-not-landing" | "duplicate-id" | "virtual-hole" | "virtual-overlap" | "refusal-order" | "lost-slot";

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
export function propertyCheck(seeds: readonly number[]): { points: number; counts: Record<Failure, number>; examples: string[] } {
  const counts: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0, "duplicate-id": 0, "virtual-hole": 0, "virtual-overlap": 0, "refusal-order": 0, "lost-slot": 0 };
  const examples: string[] = [];
  const fail = (k: Failure, msg: string): void => {
    counts[k]++;
    if (examples.length < 40) examples.push(`${k}: ${msg}`);
  };
  let points = 0;
  for (const seed of seeds) {
    const s = modelScene(seed);
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
      // Preview = landing, once per docked target.
      for (const t of ts) {
        if (t.place.kind === "home" || t.place.kind === "none" || !t.slot) continue;
        const landed = t.after({ x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 }).layout.items[id]?.rect;
        if (!landed || !same(landed, t.slot)) fail("slot-not-landing", `seed ${seed} ${id} ${t.id}`);
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
        const hits = [...ts.filter((t) => inside(t.hit, pt)).map((t) => t.id), ...rs.filter((x) => inside(x.hit, pt)).map((x) => x.id)];
        if (hits.length === 0) fail("virtual-hole", `seed ${seed} drag ${id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}`);
        else if (hits.length > 1) fail("virtual-overlap", `seed ${seed} drag ${id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}: ${hits.join(", ")}`);
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
          const hitT = ts.filter((t) => inside(t.hit, pt));
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
const KNOWN: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0, "duplicate-id": 0, "virtual-hole": 0, "virtual-overlap": 0, "refusal-order": 0, "lost-slot": 0 };

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
