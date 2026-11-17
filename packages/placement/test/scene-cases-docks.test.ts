/** `requires.docks` and `CaseHost.dockMinWidth`: which rows need docked panels, and the runner's skip below the width. */
import { describe, expect, it } from "vitest";
import { CASES, createSceneHost, runCase, runCaseAsync } from "../src/scene/cases";
import { needsDocks, withDocks } from "../src/scene/cases/docks";

const row = (id: string) => CASES.find((c) => c.id === id)!;

describe("rows that need docked panels: one rule", () => {
  it("marks the rows whose outcome depends on docked panels, content beside them included, and no pure float row", () => {
    expect(row("P9-to-the-other-rail").requires).toEqual({ rails: ["left", "right"], docks: true });
    expect(row("P9-to-the-other-rail").scene.stage.width).toBe(540);
    // The content at x 260 holds only beside a docked left column.
    for (const id of ["R4-content-changed", "C12"]) expect(row(id).requires?.docks, id).toBe(true);
    expect(row("P10-float-moves-by-the-pointer").requires?.docks).toBeUndefined();
    for (const r of CASES) expect(Boolean(r.requires?.docks), r.id).toBe(needsDocks(r));
  });

  it("a row that states requires.docks keeps it", () => {
    const stated = { ...row("C12"), requires: { docks: false } };
    expect(needsDocks(stated)).toBe(false);
    expect(withDocks([stated])[0]!.requires).toEqual({ docks: false });
  });

  it("every unmarked row passes on the reference host that docks from no width at all", () => {
    const host = (): ReturnType<typeof createSceneHost> & { dockMinWidth: number } => ({ ...createSceneHost(), dockMinWidth: 1e9 });
    for (const r of CASES.filter((c) => !c.lacks && !c.requires?.intent)) {
      const result = runCase(r, host());
      if (r.requires?.docks) expect(result.skipped[0], r.id).toMatch(/^the row: /);
      else expect(result.ok, `${r.id}: ${result.failures.join("; ")}`).toBe(true);
    }
  });
});

describe("a host's dockMinWidth", () => {
  const host = (): ReturnType<typeof createSceneHost> & { dockMinWidth: number } => ({ ...createSceneHost(), dockMinWidth: 720 });

  it("skips a row that needs docked panels on a narrower stage, and says so", async () => {
    const row = CASES.find((c) => c.id === "P9-to-the-other-rail")!;
    expect(row.scene.stage.width).toBe(540);
    const want = { ok: true, failures: [], skipped: ["the row: it needs docked panels at 540 px, and the host docks from 720 px"] };
    expect(runCase(row, host())).toEqual(want);
    expect(await runCaseAsync(row, host())).toEqual(want);
  });

  it("counts a window resize below the width, and runs the rest as before", () => {
    const narrow = { ...CASES.find((c) => c.id === "C6")!, gestures: [{ type: "resize" as const, point: { x: 600, y: 800 } }] };
    expect(runCase(narrow, host()).skipped).toEqual(["the row: it needs docked panels at 600 px, and the host docks from 720 px"]);
    for (const row of CASES.filter((c) => !c.lacks && !c.requires?.intent)) {
      const skippedWhole = runCase(row, host()).skipped.some((s) => s.startsWith("the row:"));
      const narrowest = Math.min(row.settings?.stage?.w ?? row.scene.stage.width, ...row.gestures.filter((x) => x.type === "resize" && !x.edge && !x.item && x.point).map((x) => x.point!.x));
      expect(skippedWhole, row.id).toBe(Boolean(row.requires?.docks) && narrowest < 720);
    }
  });

  it("absent, every row runs", () => {
    for (const row of CASES.filter((c) => c.requires?.docks)) expect(runCase(row, createSceneHost()).skipped.some((s) => s.startsWith("the row:")), row.id).toBe(false);
  });
});
