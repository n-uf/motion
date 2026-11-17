/** `requires.docks` and `CaseHost.dockMinWidth`: which rows need docked panels, and the runner's skip below the width. */
import { describe, expect, it } from "vitest";
import { CASES, createSceneHost, runCase, runCaseAsync, type CaseRow, type LayoutExpect } from "../src/scene/cases";

/** The audit rule: a row needs docked panels when an expectation names columns, rails, a panel's order along an edge,
 * a docked place of a panel, or the rect or form of a panel the reference host leaves docked. */
function needsDocks(row: CaseRow): boolean {
  const host = createSceneHost();
  runCase(row, host);
  const after = host.layout();
  const kind = (id: string): string | undefined => row.scene.items[id]?.kind;
  const exps: LayoutExpect[] = [row.expectLayout, ...(row.checkpoints ?? []).flatMap((c) => (c.layout ? [c.layout] : []))];
  return exps.some(
    (e) =>
      e.columns !== undefined ||
      e.rails !== undefined ||
      Object.values(e.order ?? {}).some((ids) => ids.some((id) => kind(id) === "panel")) ||
      Object.entries(e.items ?? {}).some(([id, x]) => {
        if (!x || kind(id) !== "panel") return false;
        if ((x.edge !== undefined && x.edge !== null) || x.zone !== undefined || (x.rail !== undefined && x.rail !== null) || x.rides || x.inMenu) return true;
        return Boolean(after.items[id]?.edge) && (x.rect !== undefined || x.formKind !== undefined);
      }),
  );
}

describe("rows that need docked panels", () => {
  it("carry requires.docks exactly when their expected outcome depends on docked panels", () => {
    const wrong = CASES.filter((row) => Boolean(row.requires?.docks) !== needsDocks(row)).map((row) => `${row.id}: ${row.requires?.docks ? "marked, needs none" : "needs it, unmarked"}`);
    expect(wrong).toEqual([]);
    expect(CASES.find((c) => c.id === "P9-to-the-other-rail")!.requires).toEqual({ rails: ["left", "right"], docks: true });
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
