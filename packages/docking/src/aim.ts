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
 *
 * Each landing lies in the layout its own drop commits (a growing neighbor as that commit draws it, given way); a place
 * over free room cuts from its range's ends, the room its drop makes. Which places exist is read in the room, growth
 * off; no cut is read from insertion lines, as drawn or with the growth off; what is drawn is `shown(frame)`.
 */
import { EPS, clamp, type Axis, type Point, type Rect } from "@n-uf/placement";
import type { DockEdge, DockLayout, Zone } from "./model";

/** The pitch of the spots over a bar's free stretches, px: a quarter of a typical toolbar's length (158 px in the lab). */
export const SPOT_PITCH = 40;
/** How near a sliding spot's snap point a landing snaps to it, px (`DockLaneOptions.snapDistance`). */
export const SNAP_DISTANCE = 8;

/** Where `r` starts along `axis`. */
export const lo = (r: Rect, axis: Axis): number => (axis === "x" ? r.x : r.y);
/** `r`'s length along `axis`. */
export const len = (r: Rect, axis: Axis): number => (axis === "x" ? r.width : r.height);

/**
 * The zone `id` lies in, in `layout`: the start zone where it lies in none (no neighbor there, or one not laid out). The
 * one reading of a neighbor's zone: which zones a room between two neighbors takes, and at one landing the dock in the
 * zone of the neighbor before it first.
 */
export function zoneIn(layout: DockLayout, id: string | undefined): Zone {
  return (id === undefined ? undefined : layout.items[id]?.zone) ?? "start";
}

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

/**
 * The cut after each of `n` places in order along an edge (`n - 1` of them), `cut(i, j)` the cut between places `i` and
 * `j`. A place whose cut after it would lie before its cut before it is nearer no pointer: it is left out of the cutting
 * (unless `pinned`, the item's own place, or the first or last), its neighbors cut between themselves, and its own cuts
 * are that one cut, so it has no stretch and moves no other cut. The rest are kept in order and within `[min, max]`.
 */
export function crossFreeCuts(n: number, cut: (i: number, j: number) => number, pinned: (i: number) => boolean, min = -Infinity, max = Infinity): number[] {
  const active = Array.from({ length: n }, (_, i) => i);
  for (let changed = true; changed; ) {
    changed = false;
    for (let k = 1; k + 1 < active.length; k++) {
      const [p, q, r] = [active[k - 1]!, active[k]!, active[k + 1]!];
      if (!pinned(q) && cut(q, r) < cut(p, q) - EPS) {
        active.splice(k, 1);
        changed = true;
        break;
      }
    }
  }
  const kept: number[] = [];
  for (let k = 0; k + 1 < active.length; k++) kept.push(clamp(Math.max(cut(active[k]!, active[k + 1]!), kept[k - 1] ?? min), min, max));
  // The cut after each place: an active one's own, a left-out one's the cut between its active neighbors.
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => kept[active.findIndex((j) => j > i) - 1]!);
}

/** The starts a sliding range is sampled at: `a`, every `sample` px after it, and the last start that fits (`b - w`). */
export function rangeTries(a: number, b: number, w: number, sample: number): number[] {
  const tries = [a];
  for (let x0 = a + sample; x0 < b - w - EPS; x0 += sample) tries.push(x0);
  if (b - w > a + EPS) tries.push(b - w);
  return tries;
}
