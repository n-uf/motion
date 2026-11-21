/**
 * The nearest pane in a direction: the rule a host moves focus by. See docs/placement.md, Entry: tiling.
 */
import type { Rect } from "../geometry";

/** A direction on the plane: `"up"` is toward smaller y. */
export type Direction = "left" | "right" | "up" | "down";

/**
 * The pane nearest `from` in `direction`, or null when none lies that way. A candidate's center has to be strictly on
 * that side of `from`'s center. Its score is the center distance along the direction, plus a quarter of the center
 * distance across it, plus 100 when it does not overlap `from` across the direction (the overlap strictly above 0);
 * the lowest score wins, ties to the first in the map's order. A pane that is not in `rects` has no neighbor.
 *
 * The host chooses which rects to pass. Rects laid out in a unit square (a tree laid out in `{ x: 0, y: 0, width: 1,
 * height: 1 }`) make the answer independent of the area's size, the gaps and the fixed lengths (a length in px does
 * not fit a unit square, so its split goes by its ratio); it still follows the tree's ratios.
 */
export function neighbor<K>(rects: ReadonlyMap<K, Rect>, from: K, direction: Direction): K | null {
  const origin = rects.get(from);
  if (!origin) return null;
  const horizontal = direction === "left" || direction === "right";
  // Centers and ends as the sum of two edges, the arithmetic a tiling engine's edge rects use.
  const center = (r: Rect, x: boolean): number => (x ? (r.x + (r.x + r.width)) / 2 : (r.y + (r.y + r.height)) / 2);
  const reach = (r: Rect, x: boolean): [number, number] => (x ? [r.x, r.x + r.width] : [r.y, r.y + r.height]);
  const fromAlong = center(origin, horizontal);
  const fromAcross = center(origin, !horizontal);
  const [originStart, originEnd] = reach(origin, !horizontal);
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  let best: K | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [key, r] of rects) {
    if (key === from) continue;
    const along = center(r, horizontal);
    if (sign < 0 ? along >= fromAlong : along <= fromAlong) continue;
    const [start, end] = reach(r, !horizontal);
    const overlap = Math.max(0, Math.min(originEnd, end) - Math.max(originStart, start));
    const score = Math.abs(along - fromAlong) + Math.abs(center(r, !horizontal) - fromAcross) * 0.25 + (overlap > 0 ? 0 : 100);
    if (score < bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}
