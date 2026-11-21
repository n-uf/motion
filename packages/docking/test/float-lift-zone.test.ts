/**
 * A floating item has no home: its lift has the lift zone a docked item has (`margins.lift` around the press), where no
 * lane takes the pointer. The window is the landing rows' lift over a band: an empty top bar (y 0-36) with a float lying
 * inside its band. The model is wired as a host does: `createLandingModel({ ...drag, home?, placeGuides })`, a `home` only
 * for a docked item (a float has none).
 */
import { createLandingModel } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point } from "@n-uf/placement";
import { dockDrag, solve } from "../src";
import { LANDING_CASES } from "../src/testing";

const state = LANDING_CASES.find((r) => r.id === "landing-lift-over-a-band")!.state;
const previous = solve(state);
const own = previous.items.a!.rect;
const PRESS: Point = { x: 500, y: 20 };
const grab = { x: PRESS.x - own.x, y: PRESS.y - own.y };

function wired() {
  const drag = dockDrag(state, "a", { previous, grab });
  return { drag, model: createLandingModel({ ...drag, placeGuides: "near" }) };
}
function slide(model: ReturnType<typeof wired>["model"], from: Point, to: Point, speed: number, t0 = 0) {
  const out: { p: Point; f: ReturnType<typeof model.update> }[] = [];
  let t = t0;
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / speed / 8));
  for (let k = 1; k <= n; k++) {
    const p = { x: from.x + ((to.x - from.x) * k) / n, y: from.y + ((to.y - from.y) * k) / n };
    out.push({ p, f: model.update(p, (t += 8)) });
  }
  return { out, t };
}

describe("a float pressed inside an empty bar's band: the lift zone", () => {
  it("the drag has no home, so its lift is a float's", () => {
    const { drag } = wired();
    expect(drag.regions.lanes.flatMap((l) => l.spots.filter((s) => s.home))).toEqual([]);
  });

  it("held still and wobbled 6 px: a float at the hand, no lane, no room, the release the float where it was moved", () => {
    const { model } = wired();
    model.update(PRESS, 0);
    let t = 0;
    for (const dx of [6, -6, 6]) {
      const f = model.update({ x: PRESS.x + dx, y: PRESS.y }, (t += 40));
      expect(f.lane).toBeNull();
      expect(f.room).toBe(false);
      expect(f.held).toEqual({ kind: "float", point: { x: PRESS.x + dx, y: PRESS.y } });
    }
    for (let r = 0; r < 40; r++) model.update({ x: PRESS.x + 6, y: PRESS.y }, (t += 8));
    expect(model.frame.lane).toBeNull();
    expect(model.release({ x: PRESS.x + 6, y: PRESS.y }, t + 8)).toEqual({ kind: "float", point: { x: PRESS.x + 6, y: PRESS.y } });
  });

  it("a slow slide along the bar: a float for 16 px, then the bar by its gates; back through the press point it stays held", () => {
    const { model } = wired();
    model.update(PRESS, 0);
    const a = slide(model, PRESS, { x: 760, y: 20 }, 0.25);
    for (const { p, f } of a.out.filter(({ p }) => p.x - PRESS.x <= 16)) expect([p.x, f.lane, f.room]).toEqual([p.x, null, false]);
    expect(a.out.at(-1)!.f.lane).toBe("top");
    const b = slide(model, { x: 760, y: 20 }, { x: 420, y: 20 }, 0.25, a.t);
    for (const { f } of b.out) expect(f.lane).toBe("top");
  });
});
