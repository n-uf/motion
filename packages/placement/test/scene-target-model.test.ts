/**
 * The target model's property check: over generated windows (edge kinds × empty or occupied × item kinds ×
 * sides × insets × side bars), every point inside an edge that takes the dragged kind maps to exactly one target or
 * refusal of that edge (no hole, no overlap), in the point's own zone; the item's own rect maps only to home; and every
 * docked target's slot is its landing.
 */
import { describe, expect, it } from "vitest";
import { lift, refusals, solve, targets, type Edge, type Scene, type SceneItem, type SceneLayout, type SceneTarget, type Zone } from "../src/scene";
import { opensEmpty, zoneExtents } from "../src/scene/targets";
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
  return {
    stage: { x: 0, y: 0, width: W, height: H },
    edges,
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
type Failure = "hole" | "overlap" | "other-zone" | "own-not-home" | "slot-not-landing" | "duplicate-id";

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
  const counts: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0, "duplicate-id": 0 };
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
      const base = solve(lift(s, id));
      // Ids are unique per call: every target's, and every refusal's.
      for (const ids of [all.map((t) => t.id), rs.map((x) => x.id)]) {
        const twice = ids.filter((x, i) => ids.indexOf(x) !== i);
        if (twice.length) fail("duplicate-id", `seed ${seed} ${id} ${twice.join(", ")}`);
      }
      // Preview = landing, once per docked target.
      for (const t of ts) {
        if (t.place.kind === "home" || t.place.kind === "none" || !t.slot) continue;
        const landed = t.after({ x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 }).layout.items[id]?.rect;
        if (!landed || !same(landed, t.slot)) fail("slot-not-landing", `seed ${seed} ${id} ${t.id}`);
      }
      const own = now.items[id];
      const ownRect = own?.edge && !own.floating ? own.rect : null;
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
const KNOWN: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0, "duplicate-id": 0 };

/** Every edge renamed to an id with ":" in it: the same targets and refusals, under the renamed ids. */
export function colonRenameDiffs(seeds: readonly number[]): string[] {
  const out: string[] = [];
  const J = JSON.stringify;
  const renamed = (id: string): string => id.replace(/^(gap|strip|refuse):([^:]+)/, "$1:x:$2");
  for (const seed of seeds) {
    const s = modelScene(seed);
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
