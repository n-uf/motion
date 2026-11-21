/**
 * `landing-near-corner-steady` at thinner band thicknesses (a 32 px bar over a 30 or 28 px rail, a 30 px bar over a
 * 28 px rail). The row is written on 36/30 px bars; its two points lie 2 and 10 px past the top bar's inner edge, so
 * within the kept lane's reach (`LANDING_APPROACH.keep`). Carried to a thinner bar with its page points left where
 * they are, the far point is 14 px past a 32 px bar: past `keep`, so the top bar's guide is let go and the rail's
 * acquired. That is one hand-over, never a flicker. Carried with the bar's inner edge, the row holds as written.
 */
import { createLandingModel, LANDING_APPROACH } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { createLandingHost, LANDING_CASES, runLandingCases, type LandingCase } from "../src/scene/cases";

const ROW = { bar: 36, rail: 30 };
/** The kept lane's reach, px: the entry margin. */
const KEEP = LANDING_APPROACH.keep;
const steady = LANDING_CASES.find((r) => r.id === "landing-near-corner-steady")!;

/**
 * The row at a bar and rail thickness. A point in a band is scaled across it; a point on the rail follows the top bar;
 * with `edge`, a point in the page within `KEEP` of a band's inner edge keeps its distance from that edge too.
 */
function at(row: LandingCase, bar: number, rail: number, edge: boolean): LandingCase {
  const h = row.scene.stage.height;
  const dTop = bar - ROW.bar;
  const dRail = rail - ROW.rail;
  const near = (past: number): boolean => edge && past > 0 && past < KEEP;
  const y = (v: number): number => (v <= ROW.bar ? (v * bar) / ROW.bar : v >= h - ROW.bar ? h - ((h - v) * bar) / ROW.bar : near(v - ROW.bar) ? v + dTop : near(h - ROW.bar - v) ? v - dTop : v);
  const x = (v: number): number => (v <= ROW.rail ? (v * rail) / ROW.rail : near(v - ROW.rail) ? v + dRail : v);
  const point = (p: { x: number; y: number }) => ({ x: x(p.x), y: p.x <= ROW.rail && p.y > ROW.bar && p.y < h - ROW.bar ? p.y + dTop : y(p.y) });
  return {
    ...row,
    scene: { ...row.scene, edges: row.scene.edges.map((e) => ({ ...e, cross: { ...e.cross, min: e.compact ? rail : bar, max: e.compact ? rail : bar, rail: e.compact ? rail : bar } })) },
    path: row.path.map(point),
  };
}

/** The lanes whose guides show, in order, each run once (the frames showing none skipped). */
const guideRuns = (frames: readonly { moving: boolean; guides?: readonly { lane: string }[] }[]): string[] =>
  frames.filter((f) => f.moving && f.guides && f.guides.length > 0).map((f) => [...new Set(f.guides!.map((g) => g.lane))].sort().join("+")).filter((l, i, a) => i === 0 || a[i - 1] !== l);

describe("landing-near-corner-steady at thinner band thicknesses", () => {
  const host = createLandingHost({ landing: createLandingModel });

  it.each([[32, 30], [32, 28], [30, 28]] as const)("a %i px bar over a %i px rail: the row holds with its points kept to the bars' inner edges", async (bar, rail) => {
    const [r] = await runLandingCases([at(steady, bar, rail, true)], host);
    expect(r!.failures).toEqual([]);
  });

  it.each([[32, 30], [32, 28]] as const)("a %i px bar over a %i px rail, the page points left where they are: one hand-over past keep, never back", async (bar, rail) => {
    const row = at(steady, bar, rail, false);
    // The far point lies past the kept lane's reach from the thinner top bar: the premise of the row no longer holds.
    expect(46 - bar).toBeGreaterThan(KEEP);
    const runs = guideRuns((await host.play(row)).frames);
    expect(runs).toEqual(["bottom", "top", "rail-left"]);
  });
});
