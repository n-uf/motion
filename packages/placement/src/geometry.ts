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

/** The centre of a rect. */
export const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
