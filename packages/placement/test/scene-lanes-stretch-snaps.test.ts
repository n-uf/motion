/**
 * A sliding spot's snap points are keyed by what they commit. A dock that lands inside the stretch (the item's own place,
 * a plain dock, a center dock) is a snap point that commits that dock as it is; two points are one only where they lie on
 * the same start. So a center dock landing a fraction of a pixel from the stretch's start keeps its own point and is
 * reachable (a center dock stays a center dock), and the item's own place is home, as a pitched home spot is.
 */
import { describe, expect, it } from "vitest";
import { createLandingModel } from "@n-uf/motion/drag";
import { lanes, solve, type LaneSpot, type Scene } from "../src/scene";
import { bar, byId, group } from "./scene-fixture";

/**
 * A top bar with two leading toolbars `a` and `b` (the stretch after `b` starts at x 416) and `c` held, its own place
 * at the end zone; the bar is `width` wide, so its center dock lands at `width / 2 - 100`.
 */
function scene(width: number): Scene {
  return {
    stage: { x: 0, y: 0, width, height: 700 },
    edges: [bar("top", "top", 0, ["a", "b", "c"]), bar("bottom", "bottom", 0, ["g"])],
    items: byId([group("a", 1), group("b", 2), { ...group("c", 3), space: 300, align: "end" }, group("g", 4)]),
    floats: [],
    floatKinds: ["group"],
  };
}
const GRAB = { x: 50, y: 14 };
const slideOf = (s: Scene): { spot: LaneSpot; regions: ReturnType<typeof lanes> } => {
  const regions = lanes(s, "c", { previous: solve(s), grab: GRAB, stretchPositions: "free" });
  const spot = regions.lanes.find((l) => l.id === "top")!.spots.find((sp) => sp.slide && sp.slide.from === 416)!;
  return { spot, regions };
};

describe("a sliding spot's snap points: keyed by what they commit", () => {
  for (const [width, off] of [
    [1032.6, 0.3],
    [1032.3, 0.15],
    [1033, 0.5],
    [1032.9, 0.45],
  ] as const)
    it(`a center dock landing ${off} px from the stretch's start (bar ${width} wide) keeps its own snap point and commits as a center dock`, () => {
      const s = scene(width);
      const { spot, regions } = slideOf(s);
      const center = spot.slide!.snaps.find((q) => Math.abs(q - 416) > 1e-9 && Math.abs(q - 416) <= 0.5);
      expect(spot.slide!.snaps, `${spot.slide!.snaps}`).toContain(416);
      expect(center, `${spot.slide!.snaps}`).toBeDefined();
      expect(Math.abs(center! - 416 - off)).toBeLessThan(1e-6);
      const point = (start: number) => ({ x: start + GRAB.x, y: 18 });
      // A pointer holding the item at that start commits the center dock; at the stretch's start, a plain dock.
      expect(spot.target.after(point(center!), GRAB).scene.items.c!.align).toBe("center");
      expect(spot.target.after(point(416), GRAB).scene.items.c!.align).not.toBe("center");
      // Through the landing model: the frame shows it, the release says where, and committing there is the same dock.
      const m = createLandingModel({ regions, home: { lane: "top", spot: spot.id }, grab: GRAB });
      let t = 0;
      m.update(point(center!), (t += 8));
      for (let i = 0; i < 20; i++) m.update(point(center!), (t += 8));
      expect(m.frame.spot).toBe(spot.id);
      expect(m.frame.landing!.x).toBe(center);
      const r = m.release() as { at: number };
      expect(r.at).toBe(center);
      expect(spot.target.after(point(r.at), GRAB).scene.items.c!.align).toBe("center");
    });

  it("a center dock landing exactly on the stretch's start is that point: the center dock wins over the plain dock", () => {
    const { spot } = slideOf(scene(1032));
    expect(spot.slide!.snaps.filter((q) => Math.abs(q - 416) < 1e-9)).toHaveLength(1);
    expect(spot.target.after({ x: 416 + GRAB.x, y: 18 }, GRAB).scene.items.c!.align).toBe("center");
  });
});
