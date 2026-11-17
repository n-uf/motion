/**
 * A pane's drop zones, the old names of `@n-uf/placement/tiling`'s pane drop regions. Each wraps the tiling function
 * and maps the old option names; all are deprecated and go when this entry does.
 */
import type { Point, Rect, Size } from "../geometry";
import { PANE_REGION_DEFAULTS, PANE_SIDES, paneCenter, paneRegion, type PaneCenter, type PaneRegion, type PaneRegionOptions, type PaneSide } from "../tiling";

/** @deprecated Use `PaneRegion` from `@n-uf/placement/tiling`. */
export type PaneZone = PaneRegion;

/** @deprecated Use `PANE_SIDES` from `@n-uf/placement/tiling`. */
export const PANE_EDGES: readonly PaneSide[] = PANE_SIDES;

/** @deprecated Use `PaneRegionOptions` from `@n-uf/placement/tiling` (`center`, `centerX`, `centerY`, `centerMin`). */
export interface PaneZoneOptions {
  readonly centre?: number;
  readonly centreX?: number;
  readonly centreY?: number;
  readonly centreMin?: number;
  readonly hysteresis?: number;
  readonly pixelRatio?: number;
}

const R = PANE_REGION_DEFAULTS;
/** @deprecated Use `PANE_REGION_DEFAULTS` from `@n-uf/placement/tiling`. */
export const PANE_ZONE_DEFAULTS: Required<Omit<PaneZoneOptions, "centreX" | "centreY">> = { centre: R.center, centreMin: R.centerMin, hysteresis: R.hysteresis, pixelRatio: R.pixelRatio };

/** @deprecated Use `PaneCenter` from `@n-uf/placement/tiling`. */
export type PaneCentre = PaneCenter;

/** The old option names as the new ones. */
const regionOptions = (o: PaneZoneOptions): PaneRegionOptions => ({
  ...(o.centre === undefined ? {} : { center: o.centre }),
  ...(o.centreX === undefined ? {} : { centerX: o.centreX }),
  ...(o.centreY === undefined ? {} : { centerY: o.centreY }),
  ...(o.centreMin === undefined ? {} : { centerMin: o.centreMin }),
  ...(o.hysteresis === undefined ? {} : { hysteresis: o.hysteresis }),
  ...(o.pixelRatio === undefined ? {} : { pixelRatio: o.pixelRatio }),
});

/** @deprecated Use `paneCenter` from `@n-uf/placement/tiling`. */
export const paneCentre = (size: Size, options: PaneZoneOptions = {}): PaneCenter => paneCenter(size, regionOptions(options));

/** @deprecated Use `paneRegion` from `@n-uf/placement/tiling`. */
export const paneZone = (rect: Rect, point: Point, previous: PaneZone | null = null, options: PaneZoneOptions = {}): PaneZone => paneRegion(rect, point, previous, regionOptions(options));
