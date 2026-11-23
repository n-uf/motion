/**
 * A pane's drop regions: a center rectangle (a drop there swaps with the pane) and four side trapezoids (a drop there
 * splits the pane on that side), formed by the diagonals from each pane corner to the nearest corner of the center.
 * The five regions cover the pane with no gaps and no overlaps.
 *
 * Meant for `@n-uf/motion/drag`'s `placeOf(target, point, previous)`: one target per pane (`paneTargets`), its place
 * the region under the pointer, the previous region held for `hysteresis` px past its boundary so a pointer resting on
 * a boundary doesn't flicker. A region that takes no drop is the consumer's to answer with a null place.
 */
import { clamp, type Point, type Rect, type Size } from "../geometry";
import type { Side } from "../side";

export type PaneRegion = "center" | Side;

/** The sides in their tie-break order: at an exact diagonal the first wins (a corner resolves to `top`). */
export const PANE_SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

export interface PaneRegionOptions {
  /** The center rectangle's share of each pane axis (0.05 to 0.95); `centerX` / `centerY` override one axis. */
  readonly center?: number;
  readonly centerX?: number;
  readonly centerY?: number;
  /** The least the center spans on either axis, px (a small pane keeps a usable center). */
  readonly centerMin?: number;
  /** How far past its boundary the previous region holds, px. */
  readonly hysteresis?: number;
  /** Device pixels per px: the center's edges snap to that grid, as the browser draws them. */
  readonly pixelRatio?: number;
  /**
   * The pane's center rectangle as the host already has it (pane-local px, as `paneCenter` gives), used as it is in
   * place of measuring: `center`, `centerX`, `centerY`, `centerMin` and `pixelRatio` are not read. Only `paneRegion`
   * reads it; its `width` and `height` are the pane's own size for the hold toward the middle.
   */
  readonly paneCenter?: PaneCenter;
}

export const PANE_REGION_DEFAULTS: Required<Omit<PaneRegionOptions, "centerX" | "centerY" | "paneCenter">> = { center: 0.34, centerMin: 24, hysteresis: 6, pixelRatio: 1 };

/** The center rectangle of a pane of `size`, in pane-local px (origin at the pane's top-left corner). */
export interface PaneCenter {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const snap = (v: number, ratio: number): number => Math.round(v * ratio) / ratio;

/** Where the center rectangle of a pane of `size` lies, by these options. */
export function paneCenter(size: Size, options: PaneRegionOptions = {}): PaneCenter {
  const o = { ...PANE_REGION_DEFAULTS, ...options };
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  const ratio = o.pixelRatio > 0 ? o.pixelRatio : 1;
  const rx = clamp(o.centerX ?? o.center, 0.05, 0.95);
  const ry = clamp(o.centerY ?? o.center, 0.05, 0.95);
  const cw = Math.min(width, Math.max(width * rx, Math.min(o.centerMin, width)));
  const ch = Math.min(height, Math.max(height * ry, Math.min(o.centerMin, height)));
  return { width, height, left: snap((width - cw) / 2, ratio), top: snap((height - ch) / 2, ratio), right: snap((width + cw) / 2, ratio), bottom: snap((height + ch) / 2, ratio) };
}

/** How deep past the center a point is toward each side, as a share of that side's band (positive: in that band). */
function depths(p: Point, c: PaneCenter): { side: Side; depth: number }[] {
  return [
    { side: "top", depth: (c.top - p.y) / Math.max(c.top, 1) },
    { side: "right", depth: (p.x - c.right) / Math.max(c.width - c.right, 1) },
    { side: "bottom", depth: (p.y - c.bottom) / Math.max(c.height - c.bottom, 1) },
    { side: "left", depth: (c.left - p.x) / Math.max(c.left, 1) },
  ];
}

/** The region a pane-local point is in, by position alone. */
function rawRegion(p: Point, c: PaneCenter): PaneRegion {
  if (p.x >= c.left && p.x <= c.right && p.y >= c.top && p.y <= c.bottom) return "center";
  let best: PaneRegion = "center";
  let deepest = 0;
  for (const d of depths(p, c)) {
    if (d.depth > deepest) {
      deepest = d.depth;
      best = d.side;
    }
  }
  return best;
}

/** `p` moved `by` px into `region` (toward the pane's middle for the center). */
function toward(p: Point, region: PaneRegion, by: number, c: PaneCenter): Point {
  if (region === "left") return { x: p.x - by, y: p.y };
  if (region === "right") return { x: p.x + by, y: p.y };
  if (region === "top") return { x: p.x, y: p.y - by };
  if (region === "bottom") return { x: p.x, y: p.y + by };
  const dx = c.width / 2 - p.x;
  const dy = c.height / 2 - p.y;
  const len = Math.hypot(dx, dy);
  if (len <= by || len === 0) return { x: c.width / 2, y: c.height / 2 };
  return { x: p.x + (dx / len) * by, y: p.y + (dy / len) * by };
}

/**
 * The drop region of `pane` (in the same coordinates as `point`) the point is in. With a `previous` region, the point
 * has to be `hysteresis` px past that region's boundary before the region changes: no time-based debounce, only
 * geometry. A host that has measured the center itself passes it as `options.paneCenter`; the same center gives the
 * same region as the one measured here.
 */
export function paneRegion(pane: Rect, point: Point, previous: PaneRegion | null = null, options: PaneRegionOptions = {}): PaneRegion {
  const c = options.paneCenter ?? paneCenter(pane, options);
  const p = { x: point.x - pane.x, y: point.y - pane.y };
  const raw = rawRegion(p, c);
  const by = Math.max(0, options.hysteresis ?? PANE_REGION_DEFAULTS.hysteresis);
  if (previous === null || by === 0 || previous === raw) return raw;
  return rawRegion(toward(p, previous, by, c), c) === previous ? previous : raw;
}
