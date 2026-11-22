/**
 * The trail gate reads the landing the frame draws (decision 0003): a fast reflowing change of spot waits for a slow
 * step until the held landing trails the pointer by more than `trail` (40 px), and that landing is `landingOf` the spot
 * held, where a sliding spot puts the item at the hand, not the sliding spot's listed landing at rest.
 *
 * The real window with empty side rails, its bottom bar: a sliding spot `^|status@slide` (its stretch to 484 px) and the
 * fixed spot `end/status|$` after it. Approached at 0.6 px/ms and then slowly, the pointer passes 490 px (the cut plus
 * the 6 px margin) still fast: the sliding landing, clamped at its range's end, is about 20 px from the pointer, so the
 * spot holds; its listed landing (at 8 px) is 120 px away, which read as trailing before. It changes once the hand
 * slows, as any fast reflowing change does.
 */
import { describe, expect, it } from "vitest";
import { dockDrag, solve } from "../src";
import { guided, modelOver } from "./landing-model";
import { windows } from "./lift-windows";

describe("the trail gate reads the landing the frame draws", () => {
  it("passing a sliding spot's end fast, the landing at the hand doesn't trail: the spot holds until the hand slows", () => {
    const w = windows().find((x) => x.name === "real window, empty side rails")!;
    const previous = solve(w.state);
    const own = previous.items[w.dragged]!;
    const grab = { x: own.rect.width / 2, y: own.rect.height / 2 };
    const drag = dockDrag(w.state, w.dragged, { ...w.options, previous, grab });
    const lane = drag.regions.lanes.find((l) => l.id === "bar:bottom")!;
    const slide = lane.spots.find((s) => s.id === "bar:bottom/start/^|status@slide")!;
    const fixed = lane.spots.find((s) => s.id === "bar:bottom/end/status|$")!;
    expect(slide.along[1]).toBeCloseTo(fixed.along[0], 6);
    const m = modelOver(drag, { preview: guided("near") });
    const to = { x: (fixed.along[0] + fixed.along[1]) / 2, y: lane.rect.y + lane.rect.height / 2 };
    let t = 0;
    let at = { x: own.rect.x + grab.x, y: own.rect.y + grab.y };
    const frames: { x: number; spot: string | null; trail: number; fast: boolean }[] = [];
    m.update(at, t);
    for (const [b, speed] of [[to, 0.6], [to, 0.1]] as const) {
      const from = at;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - from.x, b.y - from.y) / speed / 8));
      for (let k = 1; k <= n; k++) {
        at = { x: from.x + ((b.x - from.x) * k) / n, y: from.y + ((b.y - from.y) * k) / n };
        const f = m.update(at, (t += 8));
        const r = f.landing;
        const trail = r ? Math.hypot(Math.max(r.x - at.x, 0, at.x - (r.x + r.width)), Math.max(r.y - at.y, 0, at.y - (r.y + r.height))) : Infinity;
        frames.push({ x: at.x, spot: f.spot, trail, fast: speed > 0.375 });
      }
    }
    // Fast, past the cut and its margin, on the sliding spot: the landing it draws trails by less than 40 px, so it holds.
    const past = frames.filter((f) => f.fast && f.x > slide.along[1] + 6 && f.x < to.x);
    expect(past.length).toBeGreaterThan(0);
    // Every such frame while the sliding landing at the hand (`landingOf`) lies within 40 px of the pointer holds; the
    // first one past 40 px takes the fixed spot.
    const slideTrail = (x: number): number => {
      const p = { x, y: to.y };
      const r = drag.landingOf({ kind: "spot", spot: slide.id, point: p })!;
      return Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));
    };
    for (const f of past) expect([Math.round(f.x), f.spot]).toEqual([Math.round(f.x), slideTrail(f.x) <= 40 ? slide.id : fixed.id]);
    expect(past.some((f) => f.spot === slide.id)).toBe(true);
    // Its listed landing would have read as trailing (the old reading).
    expect(slide.landing.x + slide.landing.width).toBeLessThan(slide.along[1] - 40);
    // It changes once the landing trails by more than 40 px or the hand slows, and ends on the fixed spot.
    expect(frames.at(-1)!.spot).toBe(fixed.id);
  });
});
