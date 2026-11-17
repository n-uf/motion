/**
 * The least a target's hit keeps, so a pointer can reach it (`EDGE_KINDS[kind].minHit`: 12 px across, its narrow
 * side, by 24 px along, its long side). Clipping lays the virtual edges' tiles last, from what the others leave, so a
 * column line beside a rail strip can be left a sliver. After every tile is placed, a target whose largest piece is
 * under its minimum grows into what is beside it, as far as the minimum needs:
 * - only inside its own zone (its tiles with its edge tiled on its own: a column line's band, a gap's tile);
 * - from space no target holds (the float's), and from a target that keeps its own minimum after the cut (the
 *   lowest-ranked owner's surplus);
 * - never over home, a drop strip, a `none` rect, a refusal, the chrome or past the stage, and (but for a column line,
 *   whose band lies across the columns by design) never over another drawn edge: those don't give way.
 * Where nothing can spare the space the target stays as it is: still a stop, still in "Move to".
 */
import { EPS, area, rect, subtract, type Rect } from "../../geometry";
import type { Ctx, SceneRefusal, SceneTarget } from "./model";
import { parseTargetId } from "./ids";
import { EDGE_KINDS, edgeKindOf, type EdgeKind } from "./kinds";

/** A hit's least size: its narrow side `across`, its long side `along`, px. */
interface MinHit {
  readonly across: number;
  readonly along: number;
}

/** The kind whose `minHit` a target keeps: its edge's, a column line's or a rail stop's. */
function kindOf(c: Ctx, t: SceneTarget): EdgeKind | null {
  const p = parseTargetId(t.id);
  if (!p) return null;
  if (p.kind === "column") return "columnLine";
  if (p.kind === "rail") return "railStop";
  if (p.kind === "gap" || p.kind === "strip") {
    const e = c.scene.edges.find((x) => x.id === p.edge);
    return e ? edgeKindOf(c.scene, e) : null;
  }
  return null;
}

const largest = (ps: readonly Rect[]): Rect => ps.reduce((a, p) => (area(p) > area(a) ? p : a));
/** Whether `r` keeps `m`: its narrow side at least `across`, its long side at least `along`. */
const keepsMinHit = (r: Rect, m: MinHit): boolean => Math.min(r.width, r.height) >= m.across - EPS && Math.max(r.width, r.height) >= m.along - EPS;
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EPS;
const cut = (ps: readonly Rect[], g: Rect): Rect[] => ps.flatMap((p) => subtract(p, g)).filter((p) => p.width >= 1 && p.height >= 1);
const piecesOf = (t: { readonly hit: Rect; readonly hits?: readonly Rect[] }): readonly Rect[] => t.hits ?? [t.hit];
const withPieces = <T extends { readonly hit: Rect; readonly hits?: readonly Rect[] }>(t: T, ps: readonly Rect[]): T => {
  const { hits: _h, ...rest } = t;
  return { ...rest, hit: largest(ps), ...(ps.length > 1 ? { hits: ps } : {}) } as T;
};

/** The ways `r` can grow by `d` on one axis: all on one side, all on the other, or half on each. */
function growths(r: Rect, axis: "x" | "y", d: number): Rect[][] {
  const [lo, hi] = axis === "x" ? [rect(r.x - d, r.y, d, r.height), rect(r.x + r.width, r.y, d, r.height)] : [rect(r.x, r.y - d, r.width, d), rect(r.x, r.y + r.height, r.width, d)];
  const h = d / 2;
  const halves = axis === "x" ? [rect(r.x - h, r.y, h, r.height), rect(r.x + r.width, r.y, h, r.height)] : [rect(r.x, r.y - h, r.width, h), rect(r.x, r.y + r.height, r.width, h)];
  return [[lo], [hi], halves];
}

const union = (a: Rect, gs: readonly Rect[]): Rect => {
  const x0 = Math.min(a.x, ...gs.map((g) => g.x));
  const y0 = Math.min(a.y, ...gs.map((g) => g.y));
  return rect(x0, y0, Math.max(a.x + a.width, ...gs.map((g) => g.x + g.width)) - x0, Math.max(a.y + a.height, ...gs.map((g) => g.y + g.height)) - y0);
};

/**
 * Whether `grow` may be taken for target `i` of `targets`: inside the stage, clear of the chrome and of every target
 * that doesn't give way, and every other target it covers keeping its own minimum after the cut.
 */
function mayGrow(c: Ctx, targets: readonly SceneTarget[], i: number, grow: readonly Rect[], minOf: (t: SceneTarget) => MinHit | null, zone: readonly Rect[], away: readonly Rect[]): boolean {
  const s = c.scene.stage;
  for (const g of grow) {
    if (g.x < s.x - EPS || g.y < s.y - EPS || g.x + g.width > s.x + s.width + EPS || g.y + g.height > s.y + s.height + EPS) return false;
    if ([...(c.scene.chrome ?? []), ...away].some((r) => overlaps(r, g))) return false;
    // Only within its own zone: the tile it had before clipping (its reach included), never past it.
    if (zone.reduce<Rect[]>((ps, z) => ps.flatMap((p) => subtract(p, z)), [g]).some((p) => area(p) > EPS)) return false;
  }
  return targets.every((o, j) => {
    if (j === i || o.free || !piecesOf(o).some((p) => grow.some((g) => overlaps(p, g)))) return true;
    // Home, a drop strip and a `none` rect keep their space.
    if (o.place.kind === "home" || o.place.kind === "none" || o.strip) return false;
    const m = minOf(o);
    const left = grow.reduce<Rect[]>((ps, g) => cut(ps, g), [...piecesOf(o)]);
    return !!m && left.length > 0 && keepsMinHit(largest(left), m);
  });
}

/**
 * Growth across over part of `l`'s length: the strip beside it on one side cut where something keeps its space, the
 * longest run left (at least `m.along` long) taken, checked again as a whole. Null when no side has such a run.
 */
function partialGrowth(c: Ctx, targets: readonly SceneTarget[], i: number, l: Rect, axis: "x" | "y", d: number, m: MinHit, minOf: (t: SceneTarget) => MinHit | null, zone: readonly Rect[], away: readonly Rect[]): Rect[] | null {
  const along = axis === "x" ? ([l.y, l.y + l.height] as const) : ([l.x, l.x + l.width] as const);
  let best: Rect | null = null;
  for (const [side] of growths(l, axis, d)) {
    const g = side!;
    const strip = (a: number, b: number): Rect => (axis === "x" ? rect(g.x, a, g.width, b - a) : rect(a, g.y, b - a, g.height));
    // Where along the strip something lies: the seams the strip is cut at.
    const cuts = new Set<number>([along[0], along[1]]);
    for (const o of targets)
      for (const p of piecesOf(o))
        if (overlaps(p, g)) for (const v of axis === "x" ? [p.y, p.y + p.height] : [p.x, p.x + p.width]) if (v > along[0] && v < along[1]) cuts.add(v);
    const marks = [...cuts].sort((a, b) => a - b);
    let runStart: number | null = null;
    const runs: [number, number][] = [];
    for (let k = 0; k < marks.length - 1; k++) {
      const ok = mayGrow(c, targets, i, [strip(marks[k]!, marks[k + 1]!)], minOf, zone, away);
      if (ok && runStart === null) runStart = marks[k]!;
      if (!ok && runStart !== null) {
        runs.push([runStart, marks[k]!]);
        runStart = null;
      }
    }
    if (runStart !== null) runs.push([runStart, marks[marks.length - 1]!]);
    for (const [a, b] of runs.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))) {
      if (b - a < m.along - EPS) break;
      const r = strip(a, b);
      if (mayGrow(c, targets, i, [r], minOf, zone, away) && (!best || area(r) > area(best))) best = r;
      break;
    }
  }
  return best ? [best] : null;
}

/**
 * Every target grown to its kind's minimum where the space beside it can be spared, within its own zone (`zones`, by
 * id: its tiles with its edge tiled on its own, its reach included). A refusal keeps its space (it is a drawn edge's
 * or a zone's "No room here"), and a target of a real edge never grows over another drawn edge: only a column line,
 * whose band lies across the columns about it by design, may.
 */
export function withMinHit(c: Ctx, targets: readonly SceneTarget[], refusals: readonly SceneRefusal[], zones: ReadonlyMap<string, readonly Rect[]>): SceneTarget[] {
  const out = [...targets];
  const refused = refusals.flatMap(piecesOf);
  const minOf = (t: SceneTarget): MinHit | null => {
    const k = kindOf(c, t);
    return k ? EDGE_KINDS[k].minHit : null;
  };
  const drawn = Object.entries(c.now.edges).filter(([, e]) => e.rect.width > EPS && e.rect.height > EPS);
  for (let i = 0; i < out.length; i++) {
    const t = out[i]!;
    const m = minOf(t);
    const zone = zones.get(t.id);
    if (!m || !zone || t.free || t.strip || t.place.kind === "home" || t.place.kind === "none") continue;
    const ownEdge = t.place.kind === "gap" ? t.place.edge : (parseTargetId(t.id) as { edge?: string } | null)?.edge;
    // A virtual edge's band lies across the edges about it by design (`EDGE_KINDS[kind].virtual`): only it may grow
    // over another drawn edge.
    const k = kindOf(c, t);
    const away = [...refused, ...(k && EDGE_KINDS[k].virtual ? [] : drawn.filter(([id]) => id !== ownEdge).map(([, e]) => e.rect))];
    let l = largest(piecesOf(t));
    if (keepsMinHit(l, m)) continue;
    // The narrow side to `across`, then the long side to `along`, each where the space can be spared.
    const steps: ("across" | "along")[] = ["across", "along"];
    for (const step of steps) {
      const narrowX = l.width <= l.height;
      const axis: "x" | "y" = step === "across" ? (narrowX ? "x" : "y") : narrowX ? "y" : "x";
      const size = axis === "x" ? l.width : l.height;
      const d = (step === "across" ? m.across : m.along) - size;
      if (d <= EPS) continue;
      // The whole length first; across, failing that, the longest stretch of it whose side can be spared (as long as
      // the minimum along): a home band beside the line's end keeps its space, the rest of the line grows.
      let grow = growths(l, axis, d).find((g) => mayGrow(c, out, i, g, minOf, zone, away));
      if (!grow && step === "across") grow = partialGrowth(c, out, i, l, axis, d, m, minOf, zone, away) ?? undefined;
      if (!grow) continue;
      for (let j = 0; j < out.length; j++) {
        if (j === i || out[j]!.free) continue;
        const o = out[j]!;
        if (!piecesOf(o).some((p) => grow.some((g) => overlaps(p, g)))) continue;
        out[j] = withPieces(o, grow.reduce<Rect[]>((ps, g) => cut(ps, g), [...piecesOf(o)]));
      }
      // The grown piece: `l` widened over the stretch grown along (all of it, or the part that could be spared). Its
      // other pieces, and what is left of `l`, give that piece up, so no two of its pieces overlap.
      const g0 = grow[0]!;
      const span = axis === "x" ? rect(l.x, g0.y, l.width, g0.height) : rect(g0.x, l.y, g0.width, l.height);
      const grown = union(span, grow);
      const others = piecesOf(out[i]!).filter((p) => p !== l);
      out[i] = withPieces(out[i]!, [...cut([...others, l], grown), grown]);
      l = largest(piecesOf(out[i]!));
    }
  }
  return out;
}
