/** A pane's drop zones: the centre and four edge trapezoids, their parameters, and the geometric hysteresis. */
import { describe, expect, it } from "vitest";
import type { Point } from "../index";
import { PANE_ZONE_DEFAULTS, paneCentre, paneZone, type PaneZone, type PaneZoneOptions } from "../src/targets";

const SQUARE = { x: 0, y: 0, width: 200, height: 200 };
/** The zone at pane-local (x, y) of the 200 × 200 pane. */
const at = (x: number, y: number, previous: PaneZone | null = null, options: PaneZoneOptions = {}): PaneZone => paneZone(SQUARE, { x, y }, previous, options);

describe("zones", () => {
  it("the pane's middle is the centre; each edge band is its own zone", () => {
    expect(at(100, 100)).toBe("center");
    expect([at(10, 100), at(190, 100), at(100, 10), at(100, 190)]).toEqual(["left", "right", "top", "bottom"]);
  });

  it("a corner's exact diagonal resolves to top, the same way every call", () => {
    expect([at(20, 20), at(20, 20), at(20, 20)]).toEqual(["top", "top", "top"]);
  });

  it("the centre and an edge share no point: just inside is the centre, just outside the edge", () => {
    const c = paneCentre(SQUARE);
    expect([at(c.right - 0.5, 100), at(c.right + 0.5, 100)]).toEqual(["center", "right"]);
  });

  it("works in any coordinates: a pane offset on the stage gives the same zones", () => {
    const moved = { x: 1000, y: 500, width: 200, height: 200 };
    for (const [x, y] of [[100, 100], [10, 100], [151, 50], [60, 30]] as const) expect(paneZone(moved, { x: 1000 + x, y: 500 + y })).toBe(at(x, y));
  });
});

describe("parameters", () => {
  it("a larger centre share widens the centre and narrows the edge bands", () => {
    // 0.34 puts the centre at [66, 134]: x = 140 is in the right band; at 0.5 ([50, 150]) it is the centre.
    expect(at(140, 100)).toBe("right");
    expect(at(140, 100, null, { centre: 0.5 })).toBe("center");
  });

  it("the centre share is kept between 0.05 and 0.95", () => {
    const tiny = paneCentre(SQUARE, { centre: 0.001, centreMin: 0 });
    const huge = paneCentre(SQUARE, { centre: 1.5 });
    expect(tiny.right - tiny.left).toBeCloseTo(10);
    expect(huge.right - huge.left).toBeCloseTo(190);
  });

  it("a small pane keeps a centre of at least centreMin", () => {
    const small = { width: 50, height: 50 };
    // 50 × 0.34 = 17 < 24: the floor wins; with no floor the share does.
    expect(paneCentre(small, { centreMin: 24 }).right - paneCentre(small, { centreMin: 24 }).left).toBe(24);
    expect(paneCentre(small, { centreMin: 0 }).right - paneCentre(small, { centreMin: 0 }).left).toBeCloseTo(17);
  });

  it("each axis can take its own centre share; the other keeps the common one", () => {
    const c = paneCentre(SQUARE, { centreX: 0.5, centreY: 0.2 });
    expect([c.right - c.left, c.bottom - c.top]).toEqual([100, 40]);
    const d = paneCentre(SQUARE, { centre: 0.4, centreX: 0.6 });
    expect([d.right - d.left, d.bottom - d.top]).toEqual([120, 80]);
  });

  it("the centre's edges snap to the device-pixel grid", () => {
    const c = paneCentre({ width: 201, height: 201 }, { pixelRatio: 2 });
    for (const edge of [c.left, c.top, c.right, c.bottom]) expect((edge * 2) % 1).toBe(0);
    expect(paneCentre({ width: 201, height: 201 }, { pixelRatio: 1 }).left % 1).toBe(0);
  });

  it("defaults: a 0.34 centre, a 24 px floor, a 6 px hold", () => {
    expect(PANE_ZONE_DEFAULTS).toEqual({ centre: 0.34, centreMin: 24, hysteresis: 6, pixelRatio: 1 });
  });
});

describe("hysteresis", () => {
  it("the previous centre holds within the band past its boundary, and gives way beyond it", () => {
    // The centre's right edge is at x = 134.
    expect(at(137, 100, "center")).toBe("center");
    expect(at(145, 100, "center")).toBe("right");
  });

  it("with no previous zone, or a 0 px band, nothing holds", () => {
    expect(at(137, 100, null)).toBe("right");
    expect(at(137, 100, "center", { hysteresis: 0 })).toBe("right");
  });

  it("on a pane whose centre is narrower than the band, the centre holds for a point that close to the middle", () => {
    // A 10 px pane with a 0.5 px centre: 0.3 px off the middle is "right" by position; the centre holds it.
    const tiny = { x: 0, y: 0, width: 10, height: 10 };
    const options = { centre: 0.05, centreMin: 0 };
    expect(paneZone(tiny, { x: 5.3, y: 5 }, null, options)).toBe("right");
    expect(paneZone(tiny, { x: 5.3, y: 5 }, "center", options)).toBe("center");
  });

  it("a wider band holds further", () => {
    expect(at(145, 100, "center", { hysteresis: 16 })).toBe("center");
  });

  it("an edge holds across the diagonal to the next edge within the band", () => {
    // Past the top/right diagonal (x + y = 200) the point is right by position; top holds it for 6 px.
    expect(at(151, 50)).toBe("right");
    expect(at(151, 50, "top")).toBe("top");
    expect(at(170, 55, "top")).toBe("right");
  });
});

describe("the zones as drawn", () => {
  // The five zones drawn as polygons (the centre rectangle and four trapezoids from the corners), on a pane that
  // isn't square; the classification agrees with them everywhere, the diagonals included.
  const PANE = { width: 300, height: 200 };
  const R = PANE_ZONE_DEFAULTS.centre;
  const inPolygon = (p: Point, poly: readonly (readonly [number, number])[]): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const drawn = (p: Point): PaneZone => {
    const [lx, hx] = [((1 - R) / 2) * PANE.width, ((1 + R) / 2) * PANE.width];
    const [ly, hy] = [((1 - R) / 2) * PANE.height, ((1 + R) / 2) * PANE.height];
    if (p.x >= lx && p.x <= hx && p.y >= ly && p.y <= hy) return "center";
    const polys = {
      top: [[0, 0], [PANE.width, 0], [hx, ly], [lx, ly]],
      right: [[PANE.width, 0], [PANE.width, PANE.height], [hx, hy], [hx, ly]],
      bottom: [[0, PANE.height], [PANE.width, PANE.height], [hx, hy], [lx, hy]],
      left: [[0, 0], [0, PANE.height], [lx, hy], [lx, ly]],
    } as const;
    for (const z of ["top", "right", "bottom", "left"] as const) if (inPolygon(p, polys[z])) return z;
    return "center";
  };

  it("agrees with the drawn polygons in every region, across the diagonals", () => {
    const points: Point[] = [
      { x: 150, y: 100 },
      { x: 150, y: 20 },
      { x: 20, y: 100 },
      { x: 280, y: 100 },
      { x: 150, y: 180 },
      { x: 60, y: 30 },
      { x: 60, y: 50 },
      { x: 250, y: 30 },
      { x: 250, y: 170 },
    ];
    for (const p of points) expect(paneZone({ x: 0, y: 0, ...PANE }, p)).toBe(drawn(p));
  });
});
