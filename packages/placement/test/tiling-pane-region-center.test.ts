/** ./tiling, `paneRegion` with a center the host already has (`options.paneCenter`) in place of measuring. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { paneCenter, paneRegion, PANE_SIDES, type PaneCenter, type PaneRegion, type PaneRegionOptions } from "../src/tiling";
import { seeded } from "./tiling-fixture";

const PANE: Rect = { x: 100, y: 100, width: 400, height: 200 };
const REGIONS: readonly (PaneRegion | null)[] = [null, "center", ...PANE_SIDES];

describe("paneRegion with paneCenter", () => {
  it("the center the options would measure gives the same region, with and without a previous region", () => {
    const rnd = seeded(77);
    let sides = 0;
    let centers = 0;
    for (let i = 0; i < 20_000; i++) {
      const pane: Rect = { x: rnd() * 300 - 100, y: rnd() * 300 - 100, width: rnd() < 0.05 ? 0 : 20 + rnd() * 600, height: rnd() < 0.05 ? 0 : 20 + rnd() * 400 };
      const point = { x: pane.x + rnd() * (pane.width + 60) - 30, y: pane.y + rnd() * (pane.height + 60) - 30 };
      const options: PaneRegionOptions = {
        ...(rnd() < 0.5 ? { center: 0.05 + rnd() * 0.9 } : {}),
        ...(rnd() < 0.3 ? { centerX: rnd() * 1.2 } : {}),
        ...(rnd() < 0.3 ? { centerY: rnd() * 1.2 - 0.1 } : {}),
        ...(rnd() < 0.3 ? { centerMin: rnd() * 80 } : {}),
        ...(rnd() < 0.5 ? { hysteresis: rnd() * 20 } : {}),
        ...(rnd() < 0.3 ? { pixelRatio: 1 + Math.floor(rnd() * 3) } : {}),
      };
      const previous = REGIONS[Math.floor(rnd() * REGIONS.length)]!;
      const measured = paneRegion(pane, point, previous, options);
      const given = paneRegion(pane, point, previous, { ...options, paneCenter: paneCenter(pane, options) });
      if (given !== measured) expect(given).toBe(measured);
      if (measured === "center") centers++;
      else sides++;
    }
    expect(centers).toBeGreaterThan(1000);
    expect(sides).toBeGreaterThan(1000);
  });

  it("the given center is used as it is: the options that would measure one are not read", () => {
    const given: PaneCenter = { width: 400, height: 200, left: 10, top: 10, right: 390, bottom: 190 };
    const at = (x: number, y: number, options: PaneRegionOptions = {}): PaneRegion => paneRegion(PANE, { x: PANE.x + x, y: PANE.y + y }, null, { ...options, paneCenter: given });
    // 30 px in from the left edge is inside a center that starts at 10, whatever the options would have measured.
    expect(at(30, 100)).toBe("center");
    expect(at(30, 100, { center: 0.05, centerMin: 0 })).toBe("center");
    expect(at(5, 100)).toBe("left");
    // A narrow center the host measured differently: a point the default 34 % center holds is a side here.
    const narrow: PaneCenter = { width: 400, height: 200, left: 190, top: 90, right: 210, bottom: 110 };
    expect(paneRegion(PANE, { x: 300, y: 200 })).toBe("center");
    expect(paneRegion(PANE, { x: 360, y: 200 }, null, { paneCenter: narrow })).toBe("right");
  });

  it("the pane's own position moves the point, and hysteresis still holds the previous region", () => {
    const c = paneCenter({ width: 400, height: 200 });
    const a = paneRegion({ x: 0, y: 0, width: 400, height: 200 }, { x: 200, y: 4 }, null, { paneCenter: c });
    const b = paneRegion({ x: 70, y: -20, width: 400, height: 200 }, { x: 270, y: -16 }, null, { paneCenter: c });
    expect([a, b]).toEqual(["top", "top"]);
    // Just inside the center, past the top boundary by less than the hysteresis: held as the previous region.
    const edge = { x: 200, y: c.top + 3 };
    expect(paneRegion({ x: 0, y: 0, width: 400, height: 200 }, edge, "top", { paneCenter: c })).toBe("top");
    expect(paneRegion({ x: 0, y: 0, width: 400, height: 200 }, edge, "top", { paneCenter: c, hysteresis: 0 })).toBe("center");
  });
});
