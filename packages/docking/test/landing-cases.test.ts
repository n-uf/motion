/** The landing rows on the reference host with motion's landing model: every row runs and passes. */
import { createLandingModel } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { solve, type DockState, type DockLayout } from "../src";
import { createLandingHost, LANDING_CASES, landingIssues, runLandingCases, type LandingCaseFrame, type LandingCaseHost } from "../src/testing";

describe("the landing rows", () => {
  it("every row passes on the reference host with motion's landing model, none skipped", async () => {
    const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel }));
    for (const r of results) expect(r.failures, r.id).toEqual([]);
    expect(results.filter((r) => r.skipped).map((r) => r.id)).toEqual([]);
  });

  // The default is "free"; "pitched" is the other way a host asks. The rows hold either way, the drop committed through
  // `after(pointer, grab)` as a sliding spot's is.
  for (const stretchPositions of ["free", "pitched"] as const)
    it(`every row passes with stretchPositions "${stretchPositions}" too, none skipped`, async () => {
      const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel, stretchPositions }));
      for (const r of results) expect(r.failures, `${stretchPositions} ${r.id}`).toEqual([]);
      expect(results.filter((r) => r.skipped).length).toBe(0);
    });

  it("every row has a unique id", () => {
    expect(new Set(LANDING_CASES.map((r) => r.id)).size).toBe(LANDING_CASES.length);
  });

  it("the back-home rows hold on a host with its own geometry (a 4 px gap in its rail): `home` compares with the host's layout at the press", async () => {
    const rows = LANDING_CASES.filter((r) => r.home);
    expect(rows.map((r) => r.id)).toEqual(["landing-back-home-bar", "landing-back-home-rail"]);
    const ref = createLandingHost({ landing: createLandingModel });
    // The host's own window: the rows' state with a 4 px gap between the rail's items (its toolbars sit 4 px lower).
    const gapped = (s: DockState): DockState => ({ ...s, edges: s.edges.map((e) => (e.id === "rail-left" ? { ...e, gap: 4 } : e)) });
    const own: LandingCaseHost = { play: (row) => ref.play({ ...row, state: gapped(row.state) }) };
    for (const r of await runLandingCases(rows, own)) expect(r.failures, r.id).toEqual([]);
    // Without its layout at the press, the rail row would be measured against the row's own window and fail by the gap.
    const rail = rows.find((r) => r.id === "landing-back-home-rail")!;
    const played = await own.play(rail);
    expect(played.before!.items.zoom!.rect.y - solve(rail.state).items.zoom!.rect.y).toBe(4);
    expect(landingIssues(rail, played.frames, played.layout).join()).toMatch(/not where it was/);
  });

  it("`home` fails an item that ends a spot over, on another edge, or among its items in another order", () => {
    const row = LANDING_CASES.find((r) => r.id === "landing-back-home-bar")!;
    const before = solve(row.state);
    const frames: LandingCaseFrame[] = [{ t: 8, point: row.path[0]!, moving: false, region: "lane", lane: "top", spot: "top/start", landing: before.items.a!.rect, room: true }];
    const moved = (patch: Partial<DockLayout["items"][string]>): DockLayout => ({ ...before, items: { ...before.items, a: { ...before.items.a!, ...patch } } });
    expect(landingIssues(row, frames, before, before)).toEqual([]);
    expect(landingIssues(row, frames, moved({ rect: { ...before.items.a!.rect, x: before.items.a!.rect.x + 40 } }), before).join()).toMatch(/a is at 48,/);
    expect(landingIssues(row, frames, moved({ edge: "bottom" }), before).join()).toMatch(/a ends bottom, not where it was \(top\)/);
    // In another order among its items (tools and zoom swapped in the rail), its own rect unchanged.
    const rail = LANDING_CASES.find((r) => r.id === "landing-back-home-rail")!;
    const b2 = solve(rail.state);
    const swapped: DockLayout = { ...b2, items: { ...b2.items, tools: { ...b2.items.tools!, rect: { ...b2.items.tools!.rect, y: b2.items.zoom!.rect.y + 1 } } } };
    expect(landingIssues(rail, frames, swapped, b2).join()).toMatch(/rail-left holds zoom, tools, not tools, zoom as at the press/);
  });
});
