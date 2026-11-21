/**
 * Docking's lanes and motion's landing model: two shapes, one rule. `DockRegions` (with its lanes, spots and marks) stays
 * assignable to `@n-uf/motion/drag`'s `LandingRegions`, checked here by the type checker and at run time on real lanes,
 * and `AssertLanding` is the same check a consumer can pin.
 */
import { createLandingModel, type LandingFrame, type LandingGeometry, type LandingGuideRef, type LandingLane, type LandingRegions, type LandingRelease, type LandingSpot, type LandingState } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { dockDrag, solve, type DockDrag, type DockGuideFrame, type DockGuideRef, type DockHeld, type DockLane, type DockRegions, type DockSpot } from "../src";
import type { AssertGeometry, AssertLanding } from "../src/testing";
import { windowState } from "./fixture";

/** Compiles only when `A` is assignable to `B`. */
type Assignable<A extends B, B> = A;

// The type-level checks: a type error here fails the package's type check. Docking's output fits motion's option, and
// motion's states, releases and frames fit what docking reads back.
export type Checks = [
  AssertLanding<DockRegions>,
  AssertGeometry<DockDrag>,
  Assignable<DockRegions, LandingRegions>,
  Assignable<DockLane, LandingLane>,
  Assignable<DockSpot, LandingSpot>,
  Assignable<DockDrag, LandingGeometry>,
  Assignable<LandingGuideRef, DockGuideRef>,
  Assignable<LandingState, DockHeld>,
  Assignable<NonNullable<LandingRelease>, DockHeld>,
  Assignable<LandingFrame, DockGuideFrame>,
];

describe("a drag is what the landing model reads", () => {
  it("a window's drag feeds the landing model as it is, and its frames and releases go back to it", () => {
    const s = windowState();
    const previous = solve(s);
    const drag = dockDrag(s, "tools", { previous });
    const model = createLandingModel({ ...drag, placeGuides: "all" });
    const f = model.update({ x: 1, y: 1 }, 0);
    expect(drag.regions.lanes.length).toBeGreaterThan(0);
    expect(Array.isArray(drag.guides(f))).toBe(true);
    const r = model.release({ x: 1, y: 1 }, 0);
    expect(drag.after(r)).toBeTruthy();
  });
});
