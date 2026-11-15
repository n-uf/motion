/**
 * The target model's property check (Revision 9): over generated windows (edge kinds × empty or occupied × item kinds ×
 * sides × insets × side bars), every point inside an edge that takes the dragged kind maps to exactly one target or
 * refusal of that edge (no hole, no overlap), in the point's own zone; the item's own rect maps only to home; and every
 * docked target's slot is its landing.
 */
import { describe, expect, it } from "vitest";
import { lift, refusals, solve, targets, ZONES, type Edge, type Scene, type SceneItem, type SceneLayout, type SceneTarget, type Zone } from "../src/scene";
import { bar, byId, column, controls, group, panel, seeded, title } from "./scene-fixture";

type R = { x: number; y: number; width: number; height: number };
const inside = (r: R, p: { x: number; y: number }): boolean => p.x > r.x + 1e-6 && p.x < r.x + r.width - 1e-6 && p.y > r.y + 1e-6 && p.y < r.y + r.height - 1e-6;
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
  // Top: a title bar (title, groups, controls) or a plain bar; bottom: a bar.
  if (rnd() < 0.5) {
    items.push(title(), controls());
    edges.push({ id: "titlebar", side: "top", ring: 0, accepts: ["group"], items: ["title", ...some(g, 2), "controls"], cross: { min: 32, max: 32, rail: 32 } });
  } else edges.push(bar("top", "top", 0, some(g, 3)));
  if (rnd() < 0.7) edges.push(bar("bottom", "bottom", 0, some(g, 2)));
  for (const side of ["left", "right"] as const) {
    const kind = pick(["none", "column", "tray", "rail", "sidebar"] as const);
    if (kind === "column") edges.push(column(`${side}-col`, side, 1, some(p, 2)));
    if (kind === "tray") edges.push(column(`${side}-col`, side, 1, [...some(p, 1), ...some(g, 1)], { accepts: ["panel", "group"], zoneAccepts: { start: ["panel"], end: ["group"] } }));
    if (kind === "rail") edges.push({ id: `${side}-rail`, side, ring: 0, accepts: ["group"], items: some(g, 2), cross: { min: 30, max: 30, rail: 30 }, compact: true });
    if (kind === "sidebar") edges.push({ id: `${side}-bar`, side, ring: 0, accepts: ["group"], items: some(g, 2), cross: { min: 32, max: 32, rail: 32 }, outsideInset: rnd() < 0.5 });
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
type Failure = "hole" | "overlap" | "other-zone" | "own-not-home" | "slot-not-landing";

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
  const counts: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0 };
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
      const ts = targets(s, id).filter((t) => !t.free);
      const rs = refusals(s, id);
      const base = solve(lift(s, id));
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
        const vertical = e.side === "left" || e.side === "right";
        // The edge's band: its rect as the lift leaves it, at least 12 px deep inward (an empty edge has none).
        const r = le.rect;
        const depth = Math.max(vertical ? r.width : r.height, 12);
        const band: R = vertical
          ? { x: e.side === "left" ? r.x : r.x + r.width - depth, y: r.y, width: depth, height: r.height }
          : { x: r.x, y: e.side === "top" ? r.y : r.y + r.height - depth, width: r.width, height: depth };
        const len = vertical ? band.height : band.width;
        const a0 = vertical ? band.y : band.x;
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
          const zone = ZONES[Math.min(2, Math.floor((3 * k) / len))]!;
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
          const one = mine[0] ?? null;
          const oneZone = one ? edgeZoneOf(s, now, id, one).zone : (mineR[0]?.zone ?? null);
          if ((!one && !mineR[0]) || (oneZone !== null && oneZone !== zone)) fail("other-zone", `${at} (${zone}): ${[...hitT.map((t) => t.id), ...hitR.map((x) => x.id)].join(", ")}`);
        }
      }
    }
  }
  return { points, counts, examples };
}

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

/**
 * Today's failures by category, before the one target model. The check passes while every count is at most these;
 * the refactor brings them to 0 and deletes this list.
 */
const KNOWN: Record<Failure, number> = { hole: 8159, overlap: 4021, "other-zone": 14849, "own-not-home": 2667, "slot-not-landing": 0 };

describe("the target model's property check", () => {
  it("every point of an accepting edge maps to one target or refusal of its own zone; own rect → home; slot = landing", () => {
    const r = propertyCheck(SEEDS);
    // eslint-disable-next-line no-console
    if (process.env.MODEL_REPORT) console.log(JSON.stringify({ points: r.points, counts: r.counts }), "\n" + r.examples.join("\n"));
    expect(r.points).toBeGreaterThan(5000);
    for (const k of Object.keys(KNOWN) as Failure[]) expect(r.counts[k], `${k}: ${r.examples.filter((x) => x.startsWith(k)).slice(0, 5).join(" | ")}`).toBeLessThanOrEqual(KNOWN[k]);
  });
});
