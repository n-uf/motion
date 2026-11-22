import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, type LandingFrame, type LandingLane, type LandingRegions } from "../src/drag";
import { listed } from "./listed-geometry";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * A float is a lift with no `home`: within `margins.lift` (16 px) of the press no lane takes the pointer, and the frame is
 * judged as if the regions had no lanes (blocked and refused places as on any frame). The zone is left once, at the first
 * point farther than `lift` from the press, and never re-entered.
 *
 * The window: an empty bar's band across the top (y 32-68) with the float lying inside it (x 100-300), a column at the
 * right (x 600-800, below the bar) that takes the item, open space between.
 */
describe("landing model: a float's lift zone", () => {
  const bar: LandingLane = {
    id: "top",
    rect: rect(0, 32, 800, 36),
    axis: "x",
    spots: [{ id: "top/start", along: [0, 800], landing: rect(8, 32, 120, 28) }],
    refused: [],
  };
  const column: LandingLane = {
    id: "column",
    rect: rect(600, 68, 200, 532),
    axis: "y",
    spots: [{ id: "column/line", along: [68, 600], landing: rect(600, 68, 200, 100) }],
    refused: [],
  };
  const regions = (more: Partial<LandingRegions> = {}): LandingRegions => ({
    lanes: [bar, column],
    refused: [],
    // Where a float lands: the stage less what is drawn (the column; the empty bar's band is not drawn).
    content: rect(0, 32, 800, 568),
    blocked: [column.rect],
    stage: rect(0, 0, 800, 600),
    item: { width: 200, height: 28 },
    ...more,
  });
  const FLOAT = (p: Point): Rect => rect(p.x - 50, p.y - 14, 200, 28);
  const make = (more: Partial<LandingRegions> = {}) => createLandingModel({ ...listed(regions(more), FLOAT), placeGuides: "near" });
  const PRESS: Point = { x: 150, y: 46 };

  /** Frames along a straight slow slide from `from` to `to` at `speed` px/ms, a sample every 8 ms; each with its pointer. */
  function slide(m: ReturnType<typeof make>, from: Point, to: Point, speed: number, keys?: { shift: boolean }, t0 = 0) {
    const out: { p: Point; f: LandingFrame }[] = [];
    let t = t0;
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / speed / 8));
    for (let k = 1; k <= n; k++) {
      const p = { x: from.x + ((to.x - from.x) * k) / n, y: from.y + ((to.y - from.y) * k) / n };
      out.push({ p, f: m.update(p, (t += 8), keys) });
    }
    return { out, t };
  }

  it("press, a wobble of 6 px each way, release: the float moved by the wobble, no lane, no room", () => {
    const m = make();
    m.update(PRESS, 0);
    let t = 0;
    for (const dx of [6, -6, 6, -6, 6]) {
      const f = m.update({ x: PRESS.x + dx, y: PRESS.y }, (t += 40));
      expect(f.region).toBe("open");
      expect(f.lane).toBeNull();
      expect(f.spot).toBeNull();
      expect(f.room).toBe(false);
      expect(f.pending).toBeUndefined();
      expect(f.held).toEqual({ kind: "float", point: { x: PRESS.x + dx, y: PRESS.y } });
      expect(f.landing).toEqual(FLOAT({ x: PRESS.x + dx, y: PRESS.y }));
    }
    // A hand held still there, long enough for a lane's still gate, takes nothing either.
    for (let r = 0; r < 40; r++) m.update({ x: PRESS.x + 6, y: PRESS.y }, (t += 8));
    expect(m.frame.lane).toBeNull();
    expect(m.release({ x: PRESS.x + 6, y: PRESS.y }, t + 8)).toEqual({ kind: "float", point: { x: PRESS.x + 6, y: PRESS.y } });
  });

  it("a slow slide along the empty bar the float lies in: a float until 16 px, then the bar by its gates", () => {
    const m = make();
    m.update(PRESS, 0);
    const { out } = slide(m, PRESS, { x: 400, y: PRESS.y }, 0.25);
    const within = out.filter(({ p }) => p.x - PRESS.x <= 16);
    expect(within.length).toBeGreaterThan(6);
    for (const { f } of within) {
      expect(f.lane).toBeNull();
      expect(f.room).toBe(false);
      expect(f.region).toBe("open");
    }
    // Past the zone the bar's path gate counts from 16 px: 40 px of slow path along it, then it is entered.
    const first = out.find(({ f }) => f.lane === "top")!;
    expect(first.p.x - PRESS.x).toBeGreaterThanOrEqual(16 + 40 - 4); // none of the path inside the zone counts
    expect(first.p.x - PRESS.x).toBeLessThanOrEqual(16 + 40 + 4);
    expect(out.at(-1)!.f.room).toBe(true);
  });

  it("Shift keeps it a float all along", () => {
    const m = make();
    m.update(PRESS, 0, { shift: true });
    const { out } = slide(m, PRESS, { x: 400, y: PRESS.y }, 0.25, { shift: true });
    for (const { f } of out) {
      expect(f.region).toBe("open");
      expect(f.room).toBe(false);
      expect(f.held?.kind).toBe("float");
    }
  });

  it("slid out and back through the press point while the bar is held: the lane never changes", () => {
    const m = make();
    m.update(PRESS, 0);
    const a = slide(m, PRESS, { x: 450, y: PRESS.y }, 0.25);
    expect(a.out.at(-1)!.f.lane).toBe("top");
    // Back along the band at the same pace, through the press point and past it.
    const b = slide(m, { x: 450, y: PRESS.y }, { x: 40, y: PRESS.y }, 0.25, undefined, a.t);
    for (const { p, f } of b.out) {
      expect(f.lane, `x ${p.x.toFixed(0)}`).toBe("top");
      expect(f.room, `x ${p.x.toFixed(0)}`).toBe(true);
    }
    // And a fast pass back through the press point holds it too.
    const c = slide(m, { x: 40, y: PRESS.y }, { x: 450, y: PRESS.y }, 1, undefined, b.t);
    for (const { f } of c.out) expect(f.lane).toBe("top");
  });

  it("a float over a blocked rect: refused as before, in the zone and out of it", () => {
    const blocked = rect(100, 300, 300, 60);
    const m = make({ blocked: [column.rect, blocked] });
    const press = { x: 250, y: 330 };
    m.update(press, 0);
    expect(m.update({ x: 256, y: 330 }, 40).region).toBe("refused");
    expect(m.update({ x: 244, y: 330 }, 80).region).toBe("refused");
    expect(m.release({ x: 244, y: 330 }, 120)).toBeNull();
    // Leaving the blocked rect into open space is a float.
    expect(m.update({ x: 250, y: 440 }, 400).region).toBe("open");
  });

  it("a float over a blocked rect that a lane's band lies under: the zone is judged as if there were no lane, so refused", () => {
    const m = make({ blocked: [column.rect, rect(120, 32, 100, 36)] });
    m.update({ x: 150, y: 46 }, 0);
    expect(m.update({ x: 156, y: 46 }, 40).region).toBe("refused");
    expect(m.frame.lane).toBeNull();
    expect(m.frame.pending).toBeUndefined();
  });

  it("a big float over a column: past 16 px that column's places are reachable inside the float's own rect", () => {
    // The float lies at x 450-750, y 150-450: its press at (700, 200) is inside the column (x 600-800) too.
    const m = make();
    const press = { x: 700, y: 200 };
    m.update(press, 0);
    const { out } = slide(m, press, { x: 700, y: 330 }, 0.25);
    for (const { p, f } of out.filter(({ p }) => p.y - press.y <= 16)) {
      expect(f.lane, `y ${p.y}`).toBeNull();
      expect(f.room, `y ${p.y}`).toBe(false);
      expect(f.region, `y ${p.y}`).toBe("refused"); // over what the column draws
    }
    const last = out.at(-1)!;
    expect(last.p.x).toBeGreaterThanOrEqual(450);
    expect(last.p.x).toBeLessThanOrEqual(750);
    expect(last.f.lane).toBe("column");
    expect(last.f.room).toBe(true);
  });

  it("the zone's lane-less verdict is not carried past it: over a blocked rail band, refused in the zone, open (lane pending) after, and the release floats", () => {
    const rail: LandingLane = { id: "rail", rect: rect(0, 0, 40, 600), axis: "y", spots: [{ id: "rail/s", along: [0, 600], landing: rect(0, 100, 32, 200) }], refused: [] };
    const rg: LandingRegions = { lanes: [rail], refused: [], content: rect(0, 0, 800, 600), blocked: [rect(0, 0, 32, 600)], stage: rect(0, 0, 800, 600) };
    const m = createLandingModel({ ...listed(rg, (p) => rect(p.x - 10, p.y - 10, 120, 28)), lift: { x: 20, y: 300 }, placeGuides: "near" });
    let t = 0;
    m.update({ x: 20, y: 300 }, 0);
    for (let y = 300; y <= 330; y += 2) {
      const f = m.update({ x: 20, y }, (t += 4));
      if (y - 300 <= 16) expect(f.region, `y ${y}`).toBe("refused");
      else {
        expect(f.region, `y ${y}`).toBe("open");
        expect(f.pending, `y ${y}`).toBe("rail");
      }
    }
    expect(m.release({ x: 20, y: 330 }, t + 4)).toEqual({ kind: "float", point: { x: 20, y: 330 } });
  });

  it("a lift with a `home` (a docked item) is not a float: its zone is the home lane's, as before", () => {
    const m = createLandingModel({ ...listed(regions(), FLOAT), home: { lane: "top", spot: "top/start" }, lift: PRESS });
    const f = m.update(PRESS, 0);
    expect(f.lane).toBe("top");
    expect(f.room).toBe(true);
  });

  it("a docked item lifted without `home` is not a float: a spot marked home in a lane keeps the lanes in play", () => {
    const marked: LandingLane = { ...bar, spots: [{ ...bar.spots[0]!, home: true }] };
    const docked = createLandingModel({ ...listed({ ...regions(), lanes: [marked, column] }, FLOAT), lift: PRESS });
    docked.update(PRESS, 0);
    // The bar still sees the pointer 6 px from the press (pending, its gate not passed): no zone of lane-less judgment.
    expect(docked.update({ x: PRESS.x + 6, y: PRESS.y }, 40).pending).toBe("top");
    // The same lift with no spot marked home is a float's: the zone, nothing pending.
    const float = make();
    float.update(PRESS, 0);
    expect(float.update({ x: PRESS.x + 6, y: PRESS.y }, 40).pending).toBeUndefined();
  });

  it("`lift` names the press when the first point is not it", () => {
    const m = createLandingModel({ ...listed(regions(), FLOAT), lift: PRESS });
    // The first update is already 30 px from the press: the zone is left at once.
    m.update({ x: 180, y: 46 }, 0);
    let t = 0;
    for (let r = 0; r < 30; r++) m.update({ x: 180, y: 46 }, (t += 8));
    expect(m.frame.lane).toBe("top");
  });
});
