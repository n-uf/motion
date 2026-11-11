/** Rect helpers both lab pages use. */
import type { Rect } from "@n-uf/motion";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Two rects the same within a hundredth of a pixel. */
export const same = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

/** The area two rects share (0 when apart). */
export const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** The point lies inside the rect, `inset` px in from its edges. */
export const inside = (r: Rect, px: number, py: number, inset = 0): boolean =>
  px >= r.x + inset && px <= r.x + r.width - inset && py >= r.y + inset && py <= r.y + r.height - inset;

export const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
