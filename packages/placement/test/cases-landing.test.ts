/**
 * The landing rows on the reference host with motion's landing model, and the ratchet on the rows a host skips: the
 * count may only fall, and from the deadline (or the breaking release) every row runs.
 */
import { createLandingModel } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { solve, type Scene, type SceneLayout } from "../src/scene";
import { createLandingHost, GRAB_SINCE, GRIP_SINCE, LANDING_CASES, ROOM_SINCE, STEP_SINCE, landingIssues, LANES_DEADLINE, LANES_SINCE, LAST_WITHOUT_LANES, lanesRatchet, runLandingCases, type LandingCaseFrame, type LandingCaseHost } from "../src/scene/cases";
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

  // The default is "free"; "pitched" is the other way a host asks. The rows hold either way, the drop committed through
  // `after(pointer, grab)` as a sliding spot's is.
  for (const stretchPositions of ["free", "pitched"] as const)
    it(`every row passes with stretchPositions "${stretchPositions}" too, none skipped`, async () => {
      const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel, stretchPositions }));
      for (const r of results) expect(r.failures, `${stretchPositions} ${r.id}`).toEqual([]);
      expect(results.filter((r) => r.skipped).length).toBe(0);
    });

  it("every row needs lanes from the first version that has them (the back-home rows, the grab's), and has a unique id", () => {
    expect(new Set(LANDING_CASES.map((r) => r.id)).size).toBe(LANDING_CASES.length);
    for (const r of LANDING_CASES) expect(r.requires.lanes.since, r.id).toBe(r.id.startsWith("landing-back-home") ? GRAB_SINCE : r.id.startsWith("landing-grip") ? GRIP_SINCE : r.id.startsWith("landing-room") ? ROOM_SINCE : r.id.startsWith("landing-step") ? STEP_SINCE : LANES_SINCE);
  });

  it("a host on an older library skips them, and says why", async () => {
    for (const version of ["26.11.20", LAST_WITHOUT_LANES]) {
      const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel, version }));
      expect(results.every((r) => r.ok && !!r.skipped), version).toBe(true);
      results.forEach((r, i) => expect(r.skipped, r.id).toContain(LANDING_CASES[i]!.requires.lanes.since));
    }
  });

  it("the back-home rows hold on a host with its own geometry (a 4 px gap in its rail): `home` compares with the host's layout at the press", async () => {
    const rows = LANDING_CASES.filter((r) => r.home);
    expect(rows.map((r) => r.id)).toEqual(["landing-back-home-bar", "landing-back-home-rail"]);
    const ref = createLandingHost({ landing: createLandingModel });
    // The host's own window: the rows' scene with a 4 px gap between the rail's items (its toolbars sit 4 px lower).
    const gapped = (s: Scene): Scene => ({ ...s, edges: s.edges.map((e) => (e.id === "rail-left" ? { ...e, gap: 4 } : e)) });
    const own: LandingCaseHost = { play: (row) => ref.play({ ...row, scene: gapped(row.scene) }) };
    for (const r of await runLandingCases(rows, own)) expect(r.failures, r.id).toEqual([]);
    // Without its layout at the press, the rail row would be measured against the row's own window and fail by the gap.
    const rail = rows.find((r) => r.id === "landing-back-home-rail")!;
    const played = await own.play(rail);
    expect(played.before!.items.zoom!.rect.y - solve(rail.scene).items.zoom!.rect.y).toBe(4);
    expect(landingIssues(rail, played.frames, played.layout).join()).toMatch(/not where it was/);
  });

  it("`home` fails an item that ends a spot over, on another edge, or among its items in another order", () => {
    const row = LANDING_CASES.find((r) => r.id === "landing-back-home-bar")!;
    const before = solve(row.scene);
    const frames: LandingCaseFrame[] = [{ t: 8, point: row.path[0]!, moving: false, region: "lane", lane: "top", spot: "top/start", landing: before.items.a!.rect, room: true }];
    const moved = (patch: Partial<SceneLayout["items"][string]>): SceneLayout => ({ ...before, items: { ...before.items, a: { ...before.items.a!, ...patch } } });
    expect(landingIssues(row, frames, before, before)).toEqual([]);
    expect(landingIssues(row, frames, moved({ rect: { ...before.items.a!.rect, x: before.items.a!.rect.x + 40 } }), before).join()).toMatch(/a is at 48,/);
    expect(landingIssues(row, frames, moved({ edge: "bottom" }), before).join()).toMatch(/a ends bottom, not where it was \(top\)/);
    // In another order among its items (tools and zoom swapped in the rail), its own rect unchanged.
    const rail = LANDING_CASES.find((r) => r.id === "landing-back-home-rail")!;
    const b2 = solve(rail.scene);
    const swapped: SceneLayout = { ...b2, items: { ...b2.items, tools: { ...b2.items.tools!, rect: { ...b2.items.tools!.rect, y: b2.items.zoom!.rect.y + 1 } } } };
    expect(landingIssues(rail, frames, swapped, b2).join()).toMatch(/rail-left holds zoom, tools, not tools, zoom as at the press/);
  });

  it("a host on 26.11.45 runs the rows lanes() had then and skips the grab's", async () => {
    const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel, version: LANES_SINCE }));
    expect(results.filter((r) => r.skipped).map((r) => r.id)).toEqual(LANDING_CASES.filter((r) => r.requires.lanes.since !== LANES_SINCE).map((r) => r.id));
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
    // The grip's rows: after the grab's, and no later than this package's release once it is past the grab's.
    expect(n(GRIP_SINCE)).toBeGreaterThan(n(GRAB_SINCE));
    if (n(pkg.version) > n(GRAB_SINCE) + 1) expect(n(GRIP_SINCE)).toBeLessThanOrEqual(n(pkg.version));
    // The room's rows: after the grip's, and no later than this package's release once it is past the grip's.
    expect(n(ROOM_SINCE)).toBeGreaterThan(n(GRIP_SINCE));
    if (n(pkg.version) > n(GRIP_SINCE) + 1) expect(n(ROOM_SINCE)).toBeLessThanOrEqual(n(pkg.version));
    // The step-down room's row: after the room's, and no later than this package's release once it is past the room's.
    expect(n(STEP_SINCE)).toBeGreaterThan(n(ROOM_SINCE));
    if (n(pkg.version) > n(ROOM_SINCE)) expect(n(STEP_SINCE)).toBeLessThanOrEqual(n(pkg.version));
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
