/**
 * Docking's lanes and motion's landing model: two shapes, one rule. `DockRegions` (with its lanes, spots and marks) stays
 * assignable to `@n-uf/motion/drag`'s `LandingRegions`, checked here by the type checker and at run time on real lanes,
 * and `AssertLanding` is the same check a consumer can pin.
 */
import { createLandingModel, type LandingLane, type LandingMark, type LandingRegions, type LandingSpot } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { lanes, solve, type DockLane, type DockMark, type DockRegions, type DockSpot } from "../src";
import type { AssertLanding } from "../src/testing";
import { windowState } from "./fixture";

/** Compiles only when `A` is assignable to `B`. */
type Assignable<A extends B, B> = A;

// The type-level checks: a type error here fails the package's type check.
export type Checks = [
  AssertLanding<DockRegions>,
  Assignable<DockRegions, LandingRegions>,
  Assignable<DockLane, LandingLane>,
  Assignable<DockSpot, LandingSpot>,
  Assignable<DockMark, LandingMark>,
];

describe("DockRegions is what the landing model reads", () => {
  it("the lanes of a window feed the landing model as they are", () => {
    const s = windowState();
    const previous = solve(s);
    const regions: LandingRegions = lanes(s, "tools", { previous });
    const model = createLandingModel({ regions });
    expect(regions.lanes.length).toBeGreaterThan(0);
    expect(typeof model).toBe("object");
  });
});
