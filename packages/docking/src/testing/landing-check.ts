/**
 * A type-level conformance check: docking's lanes are a richer shape than the plain data `@n-uf/motion/drag`'s landing
 * model reads (each spot also carries its drop and `after()`, each lane its refused stretches), and they stay
 * assignable to it. `AssertLanding<DockRegions>` compiles only while that holds, so a consumer that wires the two
 * together can pin it in its own type check:
 *
 *   type Wired = AssertLanding<DockRegions>;
 *
 * A type-only import: nothing of motion is in the built JavaScript, and `@n-uf/docking` itself never imports it.
 */
import type { LandingGeometry, LandingRegions } from "@n-uf/motion/drag";

/** `R`, when it is assignable to motion's `LandingRegions`; a type error otherwise. */
export type AssertLanding<R extends LandingRegions> = R;

/**
 * `G`, when it is assignable to motion's `LandingGeometry` (the regions, `landingOf`, `spotsOf`); a type error
 * otherwise. `AssertGeometry<DockDrag>` pins that a drag is handed to `createLandingModel` as it is.
 */
export type AssertGeometry<G extends LandingGeometry> = G;
