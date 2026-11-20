/**
 * The Near guides' rule, swept. On every frame where a Near guide shows for lane L, one of three holds: (a) L holds the
 * pointer (a release lands in L, or on L's own refused stretch the frame's region is refused with L as its lane), (b) L is
 * pending (a release floats or goes home), (c) the pointer is in open space within `NEAR_REACH` of L (a release
 * floats). So no Near guide shows while the pointer is over a refused place outside L.
 *
 * Glides from a bar toward each empty side rail beside a panel column, at 150, 300 and 600 px/s, over a real window
 * (`fixtures/side-rails-empty-scene.json`) and a library window with 30 and 21 px rails; and every landing row.
 */
import { createLandingModel, LANDING_APPROACH, LANDING_MARGINS } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/geometry";
import { lanes, solve, type Scene } from "../src/scene";
import { createLandingHost, LANDING_CASES, landingIssues, NEAR_REACH, NEAR_SINCE, nearGuideIssues, type LandingCase, type LandingCaseFrame, type LandingRule } from "../src/scene/cases";
import { libraryScene, realScene } from "./rail-entry-scenes";

const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The windows swept: the scene, the item a bar holds, and the empty rails' lane ids. */
const WINDOWS: readonly { name: string; scene: () => Scene; item: string; rails: readonly string[] }[] = [
  { name: "the real window (30 px rails)", scene: realScene, item: "panels", rails: ["bar:left", "bar:right"] },
  { name: "a library window, 30 px rails", scene: () => libraryScene(30), item: "tools", rails: ["rail-left", "rail-right"] },
  { name: "a library window, 21 px rails", scene: () => libraryScene(21), item: "tools", rails: ["rail-left", "rail-right"] },
];
/** px/s of the sweep. */
const SPEEDS = [150, 300, 600] as const;

/** The glides from the item's own place in its bar toward each rail's strip: straight, and by the page's middle. */
function glides(w: (typeof WINDOWS)[number]): LandingCase[] {
  const scene = w.scene();
  const previous = solve(scene);
  const own = previous.items[w.item]!.rect;
  const press = { x: own.x + 15, y: own.y + own.height / 2 };
  const regions = lanes(scene, w.item, { previous, grab: { x: 15, y: own.height / 2 } });
  const out: LandingCase[] = [];
  for (const id of w.rails) {
    const strip = regions.lanes.find((l) => l.id === id)!.rect;
    const mid = scene.stage.x + scene.stage.width / 2;
    for (const y of [strip.y + 60, centre(strip).y]) {
      const into = { x: strip.x + strip.width / 2, y };
      for (const [via, path] of [
        ["straight", [press, into]],
        ["by the page", [press, { x: mid, y }, into]],
      ] as const)
        for (const speed of SPEEDS)
          for (const rest of [0, 40])
            out.push({
              id: `${w.name} ${id} y ${Math.round(y)} ${via} ${speed} px/s${rest ? " resting" : ""}`,
              title: "",
              expect: "",
              scene,
              item: w.item,
              path,
              speed: speed / 1000,
              rest,
              requires: { lanes: { since: NEAR_SINCE } },
            });
    }
  }
  return out;
}

const play = (row: LandingCase, landing: LandingRule = createLandingModel as LandingRule) => createLandingHost({ landing }).play(row);

describe("the Near guides' rule on a sweep of glides toward empty side rails", () => {
  for (const w of WINDOWS)
    it(`${w.name}: every frame that shows a guide of L holds L, is pending in L, or is in open space within ${NEAR_REACH} px of L`, async () => {
      const rows = glides(w);
      expect(rows.length).toBeGreaterThan(40);
      let shown = 0;
      let pending = 0;
      for (const row of rows) {
        const { frames, before } = await play(row);
        expect(nearGuideIssues(row, frames, before), row.id).toEqual([]);
        // In particular: over the column outside the rail's strip, where a release lands nowhere, no guide at all.
        for (const f of frames) if (f.region === "refused" && !f.pending && !f.lane) expect(f.guides ?? [], `${row.id} at ${Math.round(f.point.x)},${Math.round(f.point.y)}`).toEqual([]);
        shown += frames.filter((f) => (f.guides?.length ?? 0) > 0).length;
        pending += frames.filter((f) => f.pending && (f.guides?.length ?? 0) > 0).length;
      }
      // The sweep is not vacuous: guides do show on it (the held lane's and the pending rail's among them).
      expect(shown).toBeGreaterThan(rows.length);
      expect(pending).toBeGreaterThan(0);
    });
});

describe("the Near guides' rule on the landing rows", () => {
  for (const stretchPositions of ["free", "pitched"] as const)
    it(`every landing row, with stretchPositions "${stretchPositions}": no frame shows a guide the pointer cannot enter`, async () => {
      const host = createLandingHost({ landing: createLandingModel as LandingRule, stretchPositions });
      for (const row of LANDING_CASES) {
        const { frames, before } = await host.play(row);
        expect(nearGuideIssues(row, frames, before, stretchPositions), row.id).toEqual([]);
      }
    });
});

describe("nearGuideIssues", () => {
  const row = LANDING_CASES.find((r) => r.id === "landing-near-rail-glide")!;
  const frame = (over: Partial<LandingCaseFrame>, lane = "rail-left"): LandingCaseFrame => ({
    t: 8,
    point: { x: 140, y: 300 },
    moving: true,
    region: "refused",
    lane: null,
    spot: null,
    landing: null,
    room: false,
    guides: [{ id: `${lane}/box`, lane, kind: "box", rect: { x: 0, y: 0, width: 30, height: 604 } }],
    ...over,
  });
  const issues = (...frames: LandingCaseFrame[]): string[] => nearGuideIssues(row, frames);

  it("a guide over a refused place outside its lane is an issue, naming the place and the lane", () => {
    expect(issues(frame({}))).toEqual(["at 140,300: a Near guide of rail-left over refused, where the pointer neither holds rail-left, nor is pending in it, nor is in open space within 12 px of it"]);
  });

  it("(a) the lane holds the pointer: in the lane, or on its own refused stretch", () => {
    expect(issues(frame({ region: "lane", lane: "rail-left", spot: "rail-left/end" }))).toEqual([]);
    expect(issues(frame({ region: "refused", lane: "rail-left" }))).toEqual([]);
    // Another lane holds: not (a).
    expect(issues(frame({ region: "lane", lane: "bottom", spot: "bottom/start" }))).toHaveLength(1);
  });

  it("(b) the lane is pending, over a refused place or open space", () => {
    expect(issues(frame({ pending: "rail-left" }))).toEqual([]);
    expect(issues(frame({ region: "open", pending: "rail-left" }))).toEqual([]);
    expect(issues(frame({ pending: "bottom" }))).toHaveLength(1);
  });

  it("(c) the pointer is in open space within the reach of the lane's rect, and not further", () => {
    // The rail's rect is x 0–30 here (its lane as seen): 12 px past it is in reach, 40 is not.
    expect(issues(frame({ region: "open", point: { x: 42, y: 300 } }))).toEqual([]);
    expect(issues(frame({ region: "open", point: { x: 70, y: 300 } }))).toHaveLength(1);
    // Within reach but over a refused place, or nowhere: not open space.
    expect(issues(frame({ region: "refused", point: { x: 42, y: 300 } }))).toHaveLength(1);
    expect(issues(frame({ region: "nowhere", point: { x: 42, y: 300 } }))).toHaveLength(1);
  });

  it("frames that show no guide, or that a host reports none for, are not checked", () => {
    expect(issues(frame({ guides: [] }), { ...frame({}), guides: undefined })).toEqual([]);
  });

  it("the corner row bites: a model with no hysteresis between lanes (`nearer` 0) flickers between the two, and the row fails", async () => {
    const corner = LANDING_CASES.find((r) => r.id === "landing-near-corner-steady")!;
    const flicker: LandingRule = (o) => createLandingModel({ ...o, approach: { nearer: 0 } }) as unknown as ReturnType<LandingRule>;
    const bad = await play(corner, flicker);
    expect(landingIssues(corner, bad.frames, bad.layout, bad.before).join()).toMatch(/the guides switch lane \d+ times along the path \(at most 1\)/);
    const ok = await play(corner);
    expect(landingIssues(corner, ok.frames, ok.layout, ok.before)).toEqual([]);
  });

  it("the check bites: a model with the old reach (80 px, kept to 96) shows the bottom bar's guide 64 px above it, and fails", async () => {
    const early: LandingRule = (o) => createLandingModel({ ...o, approach: { reach: 80, keep: 96 } }) as unknown as ReturnType<LandingRule>;
    const row: LandingCase = { ...glides(WINDOWS[1]!)[0]!, path: [{ x: 23, y: 622 }, { x: 500, y: 622 }, { x: 500, y: 540 }], speed: 0.3, rest: 40 };
    const old = await play(row, early);
    expect(old.frames.at(-1)!.region).toBe("open");
    expect(nearGuideIssues(row, old.frames, old.before)).not.toEqual([]);
    // The default model shows none there: 64 px from the bar in open space, a release floats.
    const now = await play(row);
    expect(now.frames.at(-1)!.guides).toEqual([]);
    expect(nearGuideIssues(row, now.frames, now.before)).toEqual([]);
  });
});

describe("the default approach", () => {
  it("reach and keep are the entry margin, and `NEAR_REACH` is that margin", () => {
    expect(LANDING_APPROACH.reach).toBe(LANDING_MARGINS.exit);
    expect(LANDING_APPROACH.keep).toBe(LANDING_MARGINS.exit);
    expect(NEAR_REACH).toBe(LANDING_MARGINS.exit);
  });
});
