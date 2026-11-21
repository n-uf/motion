/**
 * A geometry for the landing model's tests over plain regions: a spot lands at its listed landing, the float (where
 * given) at `float(point)`. A host's docking layer gives the real one (`@n-uf/docking`'s `dockDrag`).
 */
import type { LandingGeometry, LandingRegions, LandingState } from "../src/drag";
import type { Point, Rect } from "../src/shapes";

export function listed(regions: LandingRegions, float?: (p: Point) => Rect | null): LandingGeometry {
  return {
    regions,
    landingOf: (s: LandingState): Rect | null => {
      if (s.kind === "float") return float ? float(s.point) : null;
      return regions.lanes.find((l) => l.id === s.lane)?.spots.find((x) => x.id === s.spot)?.landing ?? null;
    },
  };
}
