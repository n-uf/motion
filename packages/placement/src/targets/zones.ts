/**
 * A pane's drop zones: a centre rectangle (put it in the pane's place, merge or swap) and four edge trapezoids (put
 * it beside the pane on that side), formed by the diagonals from each pane corner to the nearest corner of the
 * centre. The five zones tile the pane with no gaps and no overlaps.
 *
 * Meant for `@n-uf/motion/drag`'s `placeOf(target, point, previous)`: one target per pane, its place the zone under
 * the pointer, the previous zone held for `hysteresis` px past its boundary so a pointer resting on a boundary
 * doesn't flicker. A zone that takes no drop is the consumer's to answer with a null place.
 */
import type { Point, Rect, Size } from "../geometry";

export type PaneZone = "center" | "top" | "right" | "bottom" | "left";

/** The edge zones in their tie-break order: at an exact diagonal the first wins (a corner resolves to `top`). */
export const PANE_EDGES: readonly Exclude<PaneZone, "center">[] = ["top", "right", "bottom", "left"];

export interface PaneZoneOptions {
  /** The centre rectangle's share of each pane axis (0.05 to 0.95); `centreX` / `centreY` override one axis. */
  readonly centre?: number;
  readonly centreX?: number;
  readonly centreY?: number;
  /** The least the centre spans on either axis, px (a small pane keeps a usable centre). */
  readonly centreMin?: number;
  /** How far past its boundary the previous zone holds, px. */
  readonly hysteresis?: number;
  /** Device pixels per px: the centre's edges snap to that grid, as the browser draws them. */
  readonly pixelRatio?: number;
}

export const PANE_ZONE_DEFAULTS: Required<Omit<PaneZoneOptions, "centreX" | "centreY">> = { centre: 0.34, centreMin: 24, hysteresis: 6, pixelRatio: 1 };

/** The centre rectangle of a pane of `size`, in pane-local px (origin at the pane's top-left corner). */
export interface PaneCentre {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const snap = (v: number, ratio: number): number => Math.round(v * ratio) / ratio;

/** Where the centre rectangle of a pane of `size` lies, by these options. */
export function paneCentre(size: Size, options: PaneZoneOptions = {}): PaneCentre {
  const o = { ...PANE_ZONE_DEFAULTS, ...options };
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  const ratio = o.pixelRatio > 0 ? o.pixelRatio : 1;
  const rx = clamp(o.centreX ?? o.centre, 0.05, 0.95);
  const ry = clamp(o.centreY ?? o.centre, 0.05, 0.95);
  const cw = Math.min(width, Math.max(width * rx, Math.min(o.centreMin, width)));
  const ch = Math.min(height, Math.max(height * ry, Math.min(o.centreMin, height)));
  return { width, height, left: snap((width - cw) / 2, ratio), top: snap((height - ch) / 2, ratio), right: snap((width + cw) / 2, ratio), bottom: snap((height + ch) / 2, ratio) };
}

/** How deep past the centre a point is toward each edge, as a share of that edge's band (positive: in that band). */
function depths(p: Point, c: PaneCentre): { zone: Exclude<PaneZone, "center">; depth: number }[] {
  return [
    { zone: "top", depth: (c.top - p.y) / Math.max(c.top, 1) },
    { zone: "right", depth: (p.x - c.right) / Math.max(c.width - c.right, 1) },
    { zone: "bottom", depth: (p.y - c.bottom) / Math.max(c.height - c.bottom, 1) },
    { zone: "left", depth: (c.left - p.x) / Math.max(c.left, 1) },
  ];
}

/** The zone a pane-local point is in, by position alone. */
function rawZone(p: Point, c: PaneCentre): PaneZone {
  if (p.x >= c.left && p.x <= c.right && p.y >= c.top && p.y <= c.bottom) return "center";
  let best: PaneZone = "center";
  let deepest = 0;
  for (const d of depths(p, c)) {
    if (d.depth > deepest) {
      deepest = d.depth;
      best = d.zone;
    }
  }
  return best;
}

/** `p` moved `by` px into `zone` (toward the pane's middle for the centre). */
function toward(p: Point, zone: PaneZone, by: number, c: PaneCentre): Point {
  if (zone === "left") return { x: p.x - by, y: p.y };
  if (zone === "right") return { x: p.x + by, y: p.y };
  if (zone === "top") return { x: p.x, y: p.y - by };
  if (zone === "bottom") return { x: p.x, y: p.y + by };
  const dx = c.width / 2 - p.x;
  const dy = c.height / 2 - p.y;
  const len = Math.hypot(dx, dy);
  if (len <= by || len === 0) return { x: c.width / 2, y: c.height / 2 };
  return { x: p.x + (dx / len) * by, y: p.y + (dy / len) * by };
}

/**
 * The zone of `rect` (a pane, in the same coordinates as `point`) the point is in. With a `previous` zone, the point
 * has to be `hysteresis` px past that zone's boundary before the zone changes: no time-based debounce, only geometry.
 */
export function paneZone(rect: Rect, point: Point, previous: PaneZone | null = null, options: PaneZoneOptions = {}): PaneZone {
  const c = paneCentre(rect, options);
  const p = { x: point.x - rect.x, y: point.y - rect.y };
  const raw = rawZone(p, c);
  const by = Math.max(0, options.hysteresis ?? PANE_ZONE_DEFAULTS.hysteresis);
  if (previous === null || by === 0 || previous === raw) return raw;
  return rawZone(toward(p, previous, by, c), c) === previous ? previous : raw;
}
