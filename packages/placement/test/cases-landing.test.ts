/**
 * The landing rows on the reference host with motion's landing model, and the ratchet on the rows a host skips: the
 * count may only fall, and from the deadline (or the breaking release) every row runs.
 */
import { createLandingModel } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { createLandingHost, LANDING_CASES, LANES_DEADLINE, LANES_SINCE, lanesRatchet, runLandingCases } from "../src/scene/cases";
import pkg from "../package.json";

/** The landing rows the reference host skips: none. A host's suite keeps its own count, which may only fall. */
const BASELINE = 0;
const today = (): string => new Date().toISOString().slice(0, 10);

describe("the landing rows", () => {
  it("every row passes on the reference host with motion's landing model, none skipped", async () => {
    const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel }));
    for (const r of results) expect(r.failures, r.id).toEqual([]);
    const skipped = results.filter((r) => r.skipped).length;
    expect(lanesRatchet({ skipped, baseline: BASELINE, today: today() })).toEqual([]);
  });

  it("every row needs lanes from the first version that has them, and has a unique id", () => {
    expect(new Set(LANDING_CASES.map((r) => r.id)).size).toBe(LANDING_CASES.length);
    for (const r of LANDING_CASES) expect(r.requires.lanes.since, r.id).toBe(LANES_SINCE);
  });

  it("a host on an older library skips them, and says why", async () => {
    const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel, version: "26.11.20" }));
    expect(results.every((r) => r.ok && r.skipped?.includes(LANES_SINCE))).toBe(true);
  });

  it("this package's version is the first with lanes or later", () => {
    const [a, b, c] = pkg.version.split(".").map(Number);
    const [x, y, z] = LANES_SINCE.split(".").map(Number);
    expect(a! * 1e6 + b! * 1e3 + c! + 1).toBeGreaterThanOrEqual(x! * 1e6 + y! * 1e3 + z!);
  });
});

describe("the ratchet on skipped landing rows", () => {
  it("the count may only fall", () => {
    expect(lanesRatchet({ skipped: 3, baseline: 3, today: "2026-11-20" })).toEqual([]);
    expect(lanesRatchet({ skipped: 2, baseline: 3, today: "2026-11-20" })).toEqual([]);
    expect(lanesRatchet({ skipped: 4, baseline: 3, today: "2026-11-20" })).toHaveLength(1);
  });

  it("from the deadline, or at the breaking release, every row runs", () => {
    expect(LANES_DEADLINE).toBe("2026-12-31");
    expect(lanesRatchet({ skipped: 1, baseline: 3, today: "2026-12-30" })).toEqual([]);
    expect(lanesRatchet({ skipped: 1, baseline: 3, today: LANES_DEADLINE })).toHaveLength(1);
    expect(lanesRatchet({ skipped: 1, baseline: 3, today: "2026-12-01", breaking: true })).toHaveLength(1);
    expect(lanesRatchet({ skipped: 0, baseline: 0, today: "2027-02-01", breaking: true })).toEqual([]);
  });
});
