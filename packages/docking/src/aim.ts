/**
 * Aim order: where a drag along an edge stops meaning one place and starts meaning the next. The one rule both
 * `targets()` (its tiles) and `lanes()` (its spots' stretches) cut by, so a pointer picks the same side of a neighbor
 * whichever a host reads.
 *
 * - A panel column (a side edge that is not compact) takes a panel by halves: between two places that share a
 *   neighbor, the cut is that neighbor's middle as drawn.
 * - A bar or a toolbar rail takes the nearest landing (decision 0001, the hand rule): halfway across the gap between
 *   the two landings, so the pointer is at the landing it picks. Where the two landings overlap (the neighbor between
 *   them shorter than the item), the cut is made where the item is held (`grab`): halfway between the points the pointer
 *   would hold in each, kept within `slack` of their overlap.
 */
import { EPS, clamp, type Axis, type Point, type Rect } from "@n-uf/placement";
import type { DockEdge } from "./model";

/** The pitch of the spots over a bar's free stretches, px: a quarter of a typical toolbar's length (158 px in the lab). */
export const SPOT_PITCH = 40;
/** How near a sliding spot's snap point a landing snaps to it, px (`DockLaneOptions.snapDistance`). */
export const SNAP_DISTANCE = 8;

/** Where `r` starts along `axis`. */
export const lo = (r: Rect, axis: Axis): number => (axis === "x" ? r.x : r.y);
/** `r`'s length along `axis`. */
export const len = (r: Rect, axis: Axis): number => (axis === "x" ? r.width : r.height);

/**
 * Whether an edge's places are cut by halves of the items drawn (a panel column), not by the landings. A toolbar tray at
 * a column's foot cuts by halves too, like its column.
 */
export function cutsByHalves(edge: Pick<DockEdge, "side" | "compact">): boolean {
  return (edge.side === "left" || edge.side === "right") && !edge.compact;
}

/** How far past two overlapping landings' overlap their cut may lie, px: half the pitch (`SPOT_PITCH` by default). */
export function aimSlack(pitch: number | undefined): number {
  return Math.max(0, pitch === undefined || !Number.isFinite(pitch) ? SPOT_PITCH : pitch) / 2;
}

/**
 * Where the pointer holds the item, as a share of its width and height: along its own length (its longer side, as it is
 * now) the grab's share, across it the middle. Without a grab, or without a rect, the middle each way.
 */
export function grabShare(own: Rect | undefined, grab: Point | undefined): { readonly x: number; readonly y: number } {
  const shareOf = (g: number | undefined, size: number): number => (g === undefined || !Number.isFinite(g) || size <= EPS ? 0.5 : clamp(g / size, 0, 1));
  const w = own?.width ?? 0;
  const h = own?.height ?? 0;
  return { x: w >= h ? shareOf(grab?.x, w) : 0.5, y: h > w ? shareOf(grab?.y, h) : 0.5 };
}

/**
 * The landing past a growing neighbor as the pointer meets it: `landing` (a drop's landing beside the neighbor, which may
 * start inside it, at its natural length, where the drop takes its slack) moved on to start where the neighbor ends as
 * drawn (`drawnStart`, past its gap), but no later than `latestStart` (the item still fits before what follows). A cut
 * is made with this landing, so the place before the neighbor keeps the pointer over the neighbor as drawn.
 */
export function metPastGrowing(landing: Rect, axis: Axis, drawnStart: number, latestStart: number): Rect {
  const start = Math.max(lo(landing, axis), Math.min(drawnStart, latestStart));
  return axis === "x" ? { ...landing, x: start } : { ...landing, y: start };
}

/**
 * The cut along `axis` between two adjacent places, `a` before `b`, by their landings (`a`'s facing its end, `b`'s its
 * start). `shared`: the neighbor between them as drawn, on an edge cut by halves; its middle is the cut. Else halfway
 * across the gap between the landings, or, where they overlap, at the grab (`held`, its share along the lane), kept
 * within `slack` of the overlap.
 */
export function aimCut(a: Rect, b: Rect, axis: Axis, held: number, slack: number, shared?: Rect): number {
  if (shared) return lo(shared, axis) + len(shared, axis) / 2;
  const aEnd = lo(a, axis) + len(a, axis);
  const bStart = lo(b, axis);
  const across = (aEnd + bStart) / 2;
  if (!(bStart < aEnd - EPS)) return across;
  const s = Math.max(0, slack);
  return clamp(across + ((held - 0.5) * (len(a, axis) + len(b, axis))) / 2, bStart - s, aEnd + s);
}
