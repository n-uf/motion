/**
 * `DockDrag.home`: the item's own place at the lift, the one lane and spot `lanes()` marks home, absent for a float. So
 * `createLandingModel({ ...drag, preview })` is the whole wiring; a host that passes its own `home` still gets that one.
 */
import { createLandingModel, type LandingFrame } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { dockDrag, solve } from "../src";
import { LANDING_CASES } from "../src/testing";
import { guided } from "./landing-model";

const dragOf = (c: (typeof LANDING_CASES)[number]) => {
  const previous = solve(c.state);
  const own = previous.items[c.item]!.rect;
  const press = c.path[0]!;
  return dockDrag(c.state, c.item, { previous, grab: { x: press.x - own.x, y: press.y - own.y } });
};
const scanned = (drag: ReturnType<typeof dockDrag>) => drag.regions.lanes.flatMap((l) => l.spots.filter((s) => s.home).map((s) => ({ lane: l.id, spot: s.id })))[0];

/** The frames of the case's path, 8 ms apart, then its rest, under `options` over the drag. */
function frames(c: (typeof LANDING_CASES)[number], more: { home?: { lane: string; spot: string } | undefined; wired: boolean }): LandingFrame[] {
  const drag = dragOf(c);
  const model = createLandingModel(more.wired ? { ...drag, preview: guided("near") } : { ...drag, ...(more.home ? { home: more.home } : {}), preview: guided("near") });
  const out: LandingFrame[] = [];
  let t = 0;
  let at = c.path[0]!;
  out.push(model.update(at, t));
  for (const to of c.path.slice(1)) {
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - at.x, to.y - at.y) / c.speed / 8));
    for (let k = 1; k <= n; k++) out.push(model.update({ x: at.x + ((to.x - at.x) * k) / n, y: at.y + ((to.y - at.y) * k) / n }, (t += 8)));
    at = to;
  }
  for (let r = 0; r <= (c.rest ?? 200); r += 8) out.push(model.update(at, (t += 8)));
  return out;
}

describe("DockDrag.home", () => {
  it("is the lane and spot lanes() marks home, absent where none is (a float's lift)", () => {
    let docked = 0;
    let floats = 0;
    for (const c of LANDING_CASES) {
      const drag = dragOf(c);
      expect(drag.home, c.id).toEqual(scanned(drag));
      if (drag.home) {
        docked++;
        expect(drag.regions.lanes.find((l) => l.id === drag.home!.lane)?.spots.some((s) => s.id === drag.home!.spot && s.home), c.id).toBe(true);
      } else {
        floats++;
        expect("home" in drag, c.id).toBe(false);
      }
    }
    expect(docked).toBeGreaterThan(0);
    expect(floats).toBeGreaterThan(0);
  });

  it("the model over `{ ...drag, preview }` frames the same as one given the scanned home: the spread is the whole wiring", () => {
    for (const c of LANDING_CASES) {
      const drag = dragOf(c);
      expect(frames(c, { wired: true }), c.id).toEqual(frames(c, { wired: false, home: scanned(drag) }));
    }
  });

  it("a host's own `home` after the spread wins", () => {
    const c = LANDING_CASES.find((x) => dragOf(x).home)!;
    const drag = dragOf(c);
    // Another spot of the same lane: within the lift zone the held spot is the home option's.
    const other = drag.regions.lanes.find((l) => l.id === drag.home!.lane)!.spots.filter((s) => !s.home).map((s) => ({ lane: drag.home!.lane, spot: s.id }))[0]!;
    const own = createLandingModel({ ...drag, home: other, preview: guided("near") });
    const theirs = createLandingModel({ ...drag, preview: guided("near") });
    const press = c.path[0]!;
    // At the lift the drag starts at its home spot: the frames differ in the spot held.
    expect(theirs.update(press, 0).spot).toBe(drag.home!.spot);
    expect(own.update(press, 0).spot).toBe(other.spot);
  });
});
