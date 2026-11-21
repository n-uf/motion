/**
 * Docking's output fits the landing model's option, at the type level: neither package imports the other, so only this
 * check (run by `tsc -p tsconfig.test.json`) says a host can hand one to the other as it is.
 */
import type { LandingOptions } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { DockRegions } from "../src";

/** What a host passes the landing model from a drag's lanes, with no conversion. */
type Fits<A, B> = [A] extends [B] ? true : false;
const regionsFit: Fits<DockRegions, LandingOptions["regions"]> = true;
const regionsForFits: Fits<(spot: string) => DockRegions, NonNullable<LandingOptions["regionsFor"]>> = true;

describe("docking's output fits motion's option", () => {
  it("the regions and the regions per spot", () => {
    expect([regionsFit, regionsForFits]).toEqual([true, true]);
  });
});
