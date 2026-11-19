/**
 * The landing rows on the reference host with motion's landing model, and the ratchet on the rows a host skips: the
 * count may only fall, and from the deadline (or the breaking release) every row runs.
 */
import { createLandingModel } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { createLandingHost, GRAB_SINCE, LANDING_CASES, LANES_DEADLINE, LANES_SINCE, LAST_WITHOUT_LANES, lanesRatchet, runLandingCases } from "../src/scene/cases";
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

  it("every row needs lanes from the first version that has them (the back-home rows, the grab's), and has a unique id", () => {
    expect(new Set(LANDING_CASES.map((r) => r.id)).size).toBe(LANDING_CASES.length);
    for (const r of LANDING_CASES) expect(r.requires.lanes.since, r.id).toBe(r.id.startsWith("landing-back-home") ? GRAB_SINCE : LANES_SINCE);
  });

  it("a host on an older library skips them, and says why", async () => {
    for (const version of ["26.11.20", LAST_WITHOUT_LANES]) {
      const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel, version }));
      expect(results.every((r) => r.ok && !!r.skipped), version).toBe(true);
      results.forEach((r, i) => expect(r.skipped, r.id).toContain(LANDING_CASES[i]!.requires.lanes.since));
    }
  });

  it("a host on 26.11.45 runs the rows lanes() had then and skips the grab's", async () => {
    const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel, version: LANES_SINCE }));
    expect(results.filter((r) => r.skipped).map((r) => r.id)).toEqual(LANDING_CASES.filter((r) => r.requires.lanes.since === GRAB_SINCE).map((r) => r.id));
    for (const r of results) expect(r.failures, r.id).toEqual([]);
  });

  it("lanes are needed from after the last published version without them, and from no later than this package's release", () => {
    const n = (v: string): number => {
      const [a, b, c] = v.split(".").map(Number);
      return a! * 1e6 + b! * 1e3 + c!;
    };
    expect(n(LANES_SINCE)).toBeGreaterThan(n(LAST_WITHOUT_LANES));
    // At release the package's version is past the last one without lanes: then the rows must need no later one.
    if (n(pkg.version) > n(LAST_WITHOUT_LANES)) expect(n(LANES_SINCE)).toBeLessThanOrEqual(n(pkg.version));
    // The grab's rows: after the first release with lanes, and no later than this package's release once it is past it.
    expect(n(GRAB_SINCE)).toBeGreaterThan(n(LANES_SINCE));
    if (n(pkg.version) > n(LANES_SINCE)) expect(n(GRAB_SINCE)).toBeLessThanOrEqual(n(pkg.version));
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

  it("today must be a YYYY-MM-DD date (the dates compare as strings)", () => {
    for (const today of ["2026-12-31T00:00:00Z", "12/31/2026", "2026-1-5", ""]) expect(lanesRatchet({ skipped: 0, baseline: 0, today }), today).toHaveLength(1);
  });
});
