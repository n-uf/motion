/**
 * The hand rule the landing rows check: while a lane holds, the landing is the nearest landing in its lane to the
 * pointer, and lies within `max(48, g / 2 + 6)` px of it (`max(56, ...)` on the frame before a hop). `g` is the gap
 * along the lane between the facing edges of the two adjacent landings the pointer lies between (0 over a landing).
 */
import { createLandingModel } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { rect } from "../src/geometry";
import type { Edge, Scene, SceneItem } from "../src/scene";
import { createLandingHost, handBound, landingIssues, LANDING_CASES, runLandingCases, type LandingCase, type LandingCaseFrame } from "../src/scene/cases";
import { form } from "../src/scene/cases/world";

const group = (id: string, used: number, length = 200): SceneItem => ({
  id,
  kind: "group",
  used,
  forms: { row: [form("row", length, length, 28), form("icons", 84, 84, 28), form("menu", 0, 0, 0)], column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] },
});

/** A bottom bar (a `gutter` px gap, 0 by default) holding `b` (200 px long, the held item) and `c` (`neighbor` px long): b is slid right across c. */
const slideOver = (neighbor: number, moving: NonNullable<LandingCase["moving"]>, gutter = 0): LandingCase => {
  const bar: Edge = { id: "bottom", side: "bottom", ring: 0, accepts: ["group"], items: ["b", "c"], cross: { min: 36, max: 36, rail: 36 }, gap: gutter, pad: { start: 8, end: 8 } };
  const scene: Scene = { stage: rect(0, 0, 1080, 640), edges: [bar], items: { b: group("b", 1), c: group("c", 2, neighbor) }, floats: [], floatKinds: ["group"] };
  return {
    id: `hand-over-${neighbor}`,
    title: "",
    expect: "",
    scene,
    item: "b",
    path: [
      { x: 14, y: 622 },
      { x: 1060, y: 622 },
    ],
    speed: 0.15,
    rest: 40,
    moving,
    requires: { lanes: { since: "26.11.51" } },
  };
};

const FIXED = { lane: "bottom", trail: 48, trailBeforeHop: 56 } as const;
const HAND = { lane: "bottom", hand: true } as const;
const modes = ["free", "pitched"] as const;

describe("the hand rule: the bound over a long docked neighbor", () => {
  for (const stretchPositions of modes)
    it(`a 400 px neighbor under a 200 px item: no landing lies inside it, so the landing trails by up to 106 px; the old fixed 48/56 fails and the hand rule passes (${stretchPositions})`, async () => {
      const host = createLandingHost({ landing: createLandingModel, stretchPositions });
      const fixed = (await runLandingCases([slideOver(400, FIXED)], host))[0]!;
      expect(fixed.ok).toBe(false);
      expect(fixed.failures.join("\n")).toMatch(/px from the pointer \(at most 48/);
      const hand = (await runLandingCases([slideOver(400, HAND)], host))[0]!;
      expect(hand.failures).toEqual([]);
    });

  it("a landing past the rule's bound fails, with the bound in the message: 106 px for a 400 px neighbor, 56 on the frame before a hop", async () => {
    const row = slideOver(400, HAND);
    const played = await createLandingHost({ landing: createLandingModel }).play(row);
    expect(landingIssues(row, played.frames, played.layout, played.before)).toEqual([]);
    // The frame holding home with the pointer out near the neighbor's middle: push its landing 30 px behind.
    const i = played.frames.findIndex((f) => f.moving && f.region === "lane" && f.point.x > 290 && f.point.x < 300);
    expect(i).toBeGreaterThan(0);
    const far = played.frames.map((f, k): LandingCaseFrame => (k === i ? { ...f, landing: { ...f.landing!, x: f.landing!.x - 30 } } : f));
    expect(landingIssues(row, far, played.layout, played.before).join("\n")).toMatch(/at most 106\b/);
  });

  // A real trace of the model over a 4 px gutter: the flush landings sit a gutter apart more than the neighbor's length less the
  // item's, so the bound `(neighbor - item) / 2 + 6` (106) is 1.08 px short where `g / 2 + 6` (108) holds.
  for (const stretchPositions of modes)
    it(`a 400 px neighbor with a 4 px gutter: g is 204, the bound 108; the neighbor-length form (106) would fail by about a pixel (${stretchPositions})`, async () => {
      const row = slideOver(400, HAND, 4);
      const played = await createLandingHost({ landing: createLandingModel, stretchPositions }).play(row);
      expect(landingIssues(row, played.frames, played.layout, played.before, stretchPositions)).toEqual([]);
      const worst = Math.max(...played.frames.filter((f) => f.moving && f.region === "lane").map((f) => Math.max(f.landing!.x - f.point.x, 0, f.point.x - f.landing!.x - f.landing!.width)));
      expect(worst).toBeGreaterThan((400 - 200) / 2 + 6 + 0.5);
      expect(worst).toBeLessThanOrEqual(handBound(204, true) + 0.5);
    });

  it("a kit trace: landings ending at 642.9 and starting at 1138 give g = 495.1 and a bound of 253.55; the worst measured, 252.4, is within it, while the neighbor-length form, 249.55, is 2.85 px short", () => {
    const g = 1138 - 642.9;
    expect(handBound(g)).toBeCloseTo(253.55, 2);
    expect(handBound(g, true)).toBeCloseTo(253.55, 2);
    expect(252.4).toBeLessThanOrEqual(handBound(g));
    // The neighbor's length less the item's was 487.1 there: 8 px (the gutters either side) less than g.
    const byNeighbor = 487.1 / 2 + 6;
    expect(byNeighbor).toBeCloseTo(249.55, 2);
    expect(252.4 - byNeighbor).toBeCloseTo(2.85, 2);
    expect(252.4).toBeGreaterThan(byNeighbor + 0.5);
  });

  it("over a neighbor no longer than the item the bound stays 48 (56 before a hop)", async () => {
    const row = slideOver(200, HAND);
    const played = await createLandingHost({ landing: createLandingModel }).play(row);
    expect(landingIssues(row, played.frames, played.layout, played.before)).toEqual([]);
    // Over the free room past c the landing holds the pointer: push it 260 px back, its end 66 px from the pointer.
    const i = played.frames.findIndex((f) => f.moving && f.region === "lane" && f.point.x > 700);
    const far = played.frames.map((f, k): LandingCaseFrame => (k === i ? { ...f, landing: { ...f.landing!, x: f.landing!.x - 260 } } : f));
    expect(landingIssues(row, far, played.layout, played.before).join("\n")).toMatch(/at most 48\b/);
  });
});

describe("the hand rule: the landing is the nearest in its lane", () => {
  it("a landing 30 px off the nearest one fails the nearest clause, though it is within 48 px", async () => {
    // b alone with a free bar: its landing follows the pointer.
    const bar: Edge = { id: "bottom", side: "bottom", ring: 0, accepts: ["group"], items: ["b", "c"], cross: { min: 36, max: 36, rail: 36 }, gap: 0, pad: { start: 8, end: 8 } };
    const scene: Scene = { stage: rect(0, 0, 1080, 640), edges: [bar], items: { b: group("b", 1), c: group("c", 2) }, floats: [], floatKinds: ["group"] };
    const row: LandingCase = { ...slideOver(200, HAND), scene, id: "hand-free-room" };
    const played = await createLandingHost({ landing: createLandingModel }).play({ ...row, path: [{ x: 14, y: 622 }, { x: 900, y: 622 }] });
    expect(landingIssues(row, played.frames, played.layout, played.before)).toEqual([]);
    // Over the free room past c (x > 420) the landing holds the pointer (grab 6): 0 px from it.
    const i = played.frames.findIndex((f) => f.moving && f.region === "lane" && f.point.x > 600);
    const f = played.frames[i]!;
    expect(f.landing!.x).toBeLessThanOrEqual(f.point.x);
    expect(f.landing!.x + f.landing!.width).toBeGreaterThanOrEqual(f.point.x);
    const shifted = played.frames.map((g, k): LandingCaseFrame => (k === i ? { ...g, landing: { ...g.landing!, x: g.landing!.x - 224 } } : g));
    // 224 px left: the landing's right end is 30 px from the pointer: within 48, so only the nearest clause sees it.
    const issues = landingIssues(row, shifted, played.layout, played.before);
    expect(issues.join("\n")).toMatch(/not the nearest landing/);
    expect(issues.join("\n")).not.toMatch(/at most/);
  });

  it("the nearest clause takes landings that overlap or touch as one place, as the reference says: touching is not compared, a pixel apart is", async () => {
    const bar: Edge = { id: "bottom", side: "bottom", ring: 0, accepts: ["group"], items: ["b", "c"], cross: { min: 36, max: 36, rail: 36 }, gap: 0, pad: { start: 8, end: 8 } };
    const scene: Scene = { stage: rect(0, 0, 1080, 640), edges: [bar], items: { b: group("b", 1), c: group("c", 2) }, floats: [], floatKinds: ["group"] };
    const row: LandingCase = { ...slideOver(200, HAND), scene, id: "hand-touching" };
    const played = await createLandingHost({ landing: createLandingModel }).play({ ...row, path: [{ x: 14, y: 622 }, { x: 900, y: 622 }] });
    const i = played.frames.findIndex((f) => f.moving && f.region === "lane" && f.point.x > 600);
    // Over the free room the landing holds the pointer: moved its own length right, it touches the landing at the hand;
    // a pixel further, it lies apart from it.
    const moved = (by: number) => played.frames.map((g, k): LandingCaseFrame => (k === i ? { ...g, landing: { ...g.landing!, x: g.landing!.x + g.landing!.width + by } } : g));
    expect(landingIssues(row, moved(0), played.layout, played.before).join("\n")).not.toMatch(/not the nearest landing/);
    expect(landingIssues(row, moved(1), played.layout, played.before).join("\n")).toMatch(/not the nearest landing/);
  });

  it("a frame in a lane lanes() doesn't know is still held to the floor, and the issue names the lane", async () => {
    const row = slideOver(400, { hand: true });
    const played = await createLandingHost({ landing: createLandingModel }).play(row);
    expect(landingIssues(row, played.frames, played.layout, played.before)).toEqual([]);
    const i = played.frames.findIndex((f) => f.moving && f.region === "lane" && f.point.x > 290 && f.point.x < 300);
    const far = played.frames.map((f, k): LandingCaseFrame => (k === i ? { ...f, lane: "elsewhere", landing: { ...f.landing!, x: f.point.x + 100 } } : f));
    const issues = landingIssues(row, far, played.layout, played.before).join("\n");
    expect(issues).toMatch(/at most 48\b/);
    expect(issues).toMatch(/elsewhere/);
  });

  it("an item in a lane with one landing on each side of the pointer may hold the nearer, and the hop's 6 px margin allows the other", async () => {
    // Every row of the suite holds on the reference host: the margin the model keeps past a boundary is within the clause.
    for (const stretchPositions of modes) for (const r of await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel, stretchPositions }))) expect(r.failures, `${stretchPositions} ${r.id}`).toEqual([]);
  });

  it("the rows that bound the landing by 48/56 use the hand rule", () => {
    const hand = LANDING_CASES.filter((r) => r.moving?.hand).map((r) => r.id);
    expect(hand).toEqual([
      "landing-grip-past-long-neighbor",
      "landing-grip-across-items",
      "landing-grip-up-the-rail",
      "landing-room-up-past-placed-slow",
      "landing-room-up-past-placed-fast",
      "landing-step-down-room",
    ]);
    for (const r of LANDING_CASES) expect(r.moving?.trailBeforeHop, r.id).toBeUndefined();
  });
});
