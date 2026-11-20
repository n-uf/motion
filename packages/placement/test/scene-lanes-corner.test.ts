/**
 * At a corner a lane not drawn gives way to an edge that is. An empty bar's lane is the band its drop would draw; where a
 * drawn rail stands across its end, the lane stops at the rail's side (as its marks already do), so a pointer coming down
 * the rail is in the rail's lane, not the bar's.
 */
import { describe, expect, it } from "vitest";
import { createLandingModel } from "@n-uf/motion/drag";
import { lanes, solve, type Scene } from "../src/scene";

const form = (kind: string, main: number, cross: number) => ({ kind, main: { min: main, natural: main }, cross: { natural: cross } });
const group = (id: string, main: number) => ({
  id,
  kind: "group",
  used: 1,
  forms: { row: [form("row", main, 28), form("menu", 0, 0)], column: [form("icons", main, 30), form("menu", 0, 0)] },
});

/** An empty top bar (not drawn), a drawn left rail and a drawn right rail, a drawn bottom bar. */
const scene = (): Scene =>
  ({
    stage: { x: 0, y: 0, width: 800, height: 600 },
    edges: [
      { id: "bar:top", side: "top", ring: 0, accepts: ["group"], gap: 8, pad: { start: 8, end: 8 }, cross: { min: 31, max: 31, rail: 31 }, items: [] },
      { id: "bar:left", side: "left", ring: 0, accepts: ["group"], zones: ["start"], compact: true, gap: 4, cross: { min: 30, max: 30, rail: 30 }, items: ["a", "b"] },
      { id: "bar:right", side: "right", ring: 0, accepts: ["group"], zones: ["start"], compact: true, gap: 4, cross: { min: 30, max: 30, rail: 30 }, items: ["z"] },
      { id: "bar:bottom", side: "bottom", ring: 0, accepts: ["group"], gap: 8, pad: { start: 8, end: 8 }, cross: { min: 31, max: 31, rail: 31 }, items: ["d"] },
    ],
    items: { a: group("a", 100), b: group("b", 100), z: group("z", 100), d: group("d", 200) },
    floats: [],
    floatKinds: ["group"],
  }) as unknown as Scene;

const right = (r: { x: number; width: number }) => r.x + r.width;

describe("lanes(): at a corner an empty bar's lane gives way to a drawn rail", () => {
  it("an empty top bar's lane stops at the drawn left and right rails' inner sides", () => {
    const s = scene();
    const previous = solve(s);
    const r = lanes(s, "z", { previous, grab: { x: 15, y: 8 }, endReach: 24 });
    const top = r.lanes.find((l) => l.id === "bar:top")!;
    const left = r.lanes.find((l) => l.id === "bar:left")!;
    const rightRail = r.lanes.find((l) => l.id === "bar:right")!;
    expect(previous.edges["bar:top"]!.cross).toBe(0);
    expect(top.rect.x).toBeGreaterThanOrEqual(right(left.rect) - 1e-6);
    expect(right(top.rect)).toBeLessThanOrEqual(rightRail.rect.x + 1e-6);
  });

  it("between two edges not drawn the corner is as it was: the top bar's lane keeps its whole width", () => {
    const s = scene();
    const bare = { ...s, edges: s.edges.map((e) => (e.id === "bar:left" || e.id === "bar:right" ? { ...e, items: [] } : e)), items: { d: s.items.d } } as Scene;
    const previous = solve(bare);
    const r = lanes(bare, "d", { previous, grab: { x: 15, y: 8 }, endReach: 24 });
    const top = r.lanes.find((l) => l.id === "bar:top")!;
    expect([top.rect.x, top.rect.width]).toEqual([0, 800]);
  });

  it("a pointer gliding along the empty top bar, then down into the left rail 20 px below its top, lands in the rail", () => {
    const s = scene();
    const previous = solve(s);
    const grab = { x: 15, y: 8 };
    const rs = lanes(s, "z", { previous, grab, endReach: 24 });
    const m = createLandingModel({ regions: rs, regionsFor: (spot) => lanes(s, "z", { previous, grab, endReach: 24, spot }), grab });
    const rail = previous.edges["bar:left"]!.rect;
    let t = 0;
    let p = { x: 400, y: 15 };
    m.update(p, t);
    const go = (to: { x: number; y: number }) => {
      const from = p;
      const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2.4);
      for (let i = 1; i <= n; i++) {
        p = { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n };
        m.update(p, (t += 16));
      }
    };
    // Along the bar's band to the rail's inner side, then down the rail.
    go({ x: rail.x + rail.width + 4, y: 15 });
    go({ x: rail.x + rail.width / 2, y: rail.y + 20 });
    for (let i = 0; i < 40; i++) m.update(p, (t += 16));
    expect([m.frame.region, m.frame.lane]).toEqual(["lane", "bar:left"]);
  });
});
