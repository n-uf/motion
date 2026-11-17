/**
 * The order `solve` lays edges in, and the small number helpers every phase shares. Internal to the scene: `targets`
 * ranks the space each edge owns by the same order (`layKeys`, `pushes`).
 */
import { zoneOf } from "../helpers";
import type { Edge, Scene, Zone } from "../model";

export const finite = (x: number | undefined, fallback: number): number => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
export const px = (x: number | undefined): number => Math.max(0, finite(x, 0));

/** A left or right edge. */
export const isSide = (e: Edge): boolean => e.side === "left" || e.side === "right";

/** What give-way weighs an edge by: whether an item of it is kept, its newest use, its ring. */
export interface GiveWayRank {
  readonly kept: boolean;
  readonly age: number;
  readonly edge: Edge;
}

/**
 * The give-way order, for columns by width and bars by height alike: unkept before kept, the one whose newest use is
 * oldest first, the outer first. Ties stay as they are (a sort keeps them in order).
 */
export const giveWayOrder = (a: GiveWayRank, b: GiveWayRank): number =>
  Number(a.kept) - Number(b.kept) || a.age - b.age || finite(a.edge.ring, 0) - finite(b.edge.ring, 0);

/** The order edges are cut in: full bars (top, bottom), columns (left, right), between bars (top, bottom); each by ring. */
export function cutOrder(edges: readonly Edge[]): Edge[] {
  const phase = (e: Edge): number => (e.side === "left" || e.side === "right" ? 1 : e.span === "between" ? 2 : 0);
  const sideRank = (e: Edge): number => (e.side === "top" || e.side === "left" ? 0 : 1);
  return edges
    .map((e, i) => ({ e, i }))
    .sort((a, b) => phase(a.e) - phase(b.e) || sideRank(a.e) - sideRank(b.e) || finite(a.e.ring, 0) - finite(b.e.ring, 0) || a.i - b.i)
    .map((x) => x.e);
}

/**
 * Where `solve` lays an edge in its laying order: `phase` 0 full bars outside the inset, 1 the other full bars, 2 the
 * sides, 3 the `between` bars, 4 overlay edges (laid over the content, pushing nothing); `at`, its place in the cut
 * order. Internal to the scene: `targets` ranks the space each edge owns by it.
 */
export interface LayKey {
  readonly phase: number;
  readonly side: string;
  readonly at: number;
}

/** Each edge's `LayKey`. */
export function layKeys(scene: Scene): Map<string, LayKey> {
  const phase = (e: Edge): number => (e.mode === "overlay" ? 4 : isSide(e) ? 2 : e.span === "between" ? 3 : e.outsideInset === true ? 0 : 1);
  return new Map(cutOrder(scene.edges).map((e, at) => [e.id, { phase: phase(e), side: e.side, at }]));
}

/**
 * Whether the edge laid at `a` takes its space before the edge at `b` can, so that filling `a` pushes `b`: a reserved
 * edge of an earlier phase, or one laid before it on the same side (the outer ring). Edges laid independently (the two
 * sides, top and bottom, any overlay edge) push neither way.
 */
export function pushes(a: LayKey, b: LayKey): boolean {
  if (a.phase === 4 || b.phase === 4) return false;
  if (a.phase !== b.phase) return a.phase < b.phase;
  return a.side === b.side && a.at < b.at;
}

const ZONE_RANK: Record<Zone, number> = { start: 0, center: 1, end: 2 };

/** The ids of an edge in drawing order: its items stably sorted by zone. */
export function zoneSorted(scene: Scene, ids: readonly string[]): string[] {
  return ids
    .map((id, i) => ({ id, i, z: ZONE_RANK[zoneOf(scene.items[id])] }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((x) => x.id);
}
