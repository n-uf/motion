/**
 * The shapes every entry shares. Plain data: a rect is a top-left corner and a size, in whatever px the consumer
 * lays out in (stage, window or host coordinates). The same shape as @n-uf/motion's, so the two compose without
 * either importing the other.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/** The area two rects share (0 when apart). */
export const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** `r` moved (not resized) to lie inside `area`; one larger than the area keeps its top-left corner on the area's. */
export const clampInto = (r: Rect, area: Rect): Rect => ({
  ...r,
  x: Math.min(Math.max(r.x, area.x), Math.max(area.x, area.x + area.width - r.width)),
  y: Math.min(Math.max(r.y, area.y), Math.max(area.y, area.y + area.height - r.height)),
});

/** The center of a rect. */
export const center = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The tolerance the geometry compares with, px. */
export const EPS = 1e-6;

/** A rect that covers any point a page can see (a float target's hit). */
export const PLANE: Rect = rect(-1e9, -1e9, 2e9, 2e9);

/** A rect's area (a negative side counts as 0). */
export const area = (r: Rect): number => Math.max(0, r.width) * Math.max(0, r.height);

/** Whether two rects share more than `eps` each way (touching edges don't overlap). */
export const overlaps = (a: Rect, b: Rect, eps = EPS): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > eps && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > eps;

/** Whether `p` lies in `r`, its edges included (within `eps`). */
export const contains = (r: Rect, p: Point, eps = EPS): boolean => p.x >= r.x - eps && p.x <= r.x + r.width + eps && p.y >= r.y - eps && p.y <= r.y + r.height + eps;

/** `v` within `lo..hi` (`lo` wins when `hi` is under it). */
export const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** `r` less `cut`, as disjoint rects: the parts beside the cut whole, then above and below it within its width. */
export function subtract(r: Rect, cut: Rect): Rect[] {
  if (!overlaps(r, cut)) return [r];
  const right = r.x + r.width;
  const bottom = r.y + r.height;
  const x0 = Math.max(r.x, cut.x);
  const x1 = Math.min(right, cut.x + cut.width);
  return [
    rect(r.x, r.y, x0 - r.x, r.height),
    rect(x1, r.y, right - x1, r.height),
    rect(x0, r.y, x1 - x0, Math.min(bottom, cut.y) - r.y),
    rect(x0, Math.max(r.y, cut.y + cut.height), x1 - x0, bottom - Math.max(r.y, cut.y + cut.height)),
  ].filter((p) => area(p) > EPS);
}
