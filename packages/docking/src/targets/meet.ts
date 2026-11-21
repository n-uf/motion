import { EPS, rect, type Rect } from "@n-uf/placement";

/** The part two rects share, or null when it has no area. Shared by the tiler and ownership. */
export function meet(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.width, b.x + b.width) - x;
  const h = Math.min(a.y + a.height, b.y + b.height) - y;
  return w > EPS && h > EPS ? rect(x, y, w, h) : null;
}
