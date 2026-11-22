/**
 * A geometry for the landing model's tests over plain regions: a spot lands at its listed landing, the float (where
 * given) at `float(point)`. A host's docking layer gives the real one (`@n-uf/docking`'s `dockDrag`).
 */
import type { DragPreview, LandingGeometry, LandingHeld, LandingRegions, PlaceGuides } from "../src/drag";
import type { Point, Rect } from "../src/shapes";

/** A preview whose guide level is `level` (its mode is beside the point: the model reads only the level). */
export const guided = (level: PlaceGuides): DragPreview => ({ mode: "placeholder", placeGuides: level });
/** The Near level, the one most landing tests run at. */
export const NEAR: DragPreview = guided("near");

export function listed(regions: LandingRegions, float?: (p: Point) => Rect | null): LandingGeometry {
  return {
    regions,
    landingOf: (s: LandingHeld): Rect | null => {
      if (s.kind === "float") return float ? float(s.point) : null;
      return regions.lanes.find((l) => l.id === s.lane)?.spots.find((x) => x.id === s.spot)?.landing ?? null;
    },
  };
}
