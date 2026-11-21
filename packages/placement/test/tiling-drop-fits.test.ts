/** ./tiling, the fit rule of a drop: `dropFits`, both panes at least min in a layout the host already projected. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { dropFits, dropOnPane, layoutSplit, type PaneSide } from "../src/tiling";
import { randomTree, seeded } from "./tiling-fixture";

const AREA: Rect = { x: 0, y: 0, width: 1000, height: 600 };
const projected = (entries: readonly [string, number, number][]): Map<string, Rect> => new Map(entries.map(([k, width, height]) => [k, { x: 0, y: 0, width, height }]));

describe("dropFits", () => {
  it("both panes at least min wide and high pass; one short fails with the side in its reason", () => {
    const ok = projected([["c", 200, 300], ["b", 250, 300]]);
    expect(dropFits(ok, "c", "b", AREA, { min: 200, side: "left" })).toEqual({ ok: true });
    expect(dropFits(ok, "c", "b", AREA, { min: 201, side: "left" })).toEqual({ ok: false, reason: "left rejected: projected footprint of the two panes violates min 201px" });
    // The height counts too, and `at` as well as `dragged`.
    expect(dropFits(projected([["c", 200, 50], ["b", 250, 300]]), "c", "b", AREA, { min: 100, side: "top" }).reason).toMatch(/^top rejected: projected footprint/);
    expect(dropFits(projected([["c", 200, 300], ["b", 250, 50]]), "c", "b", AREA, { min: 100, side: "bottom" }).ok).toBe(false);
  });

  it("a pane the projection does not hold fails", () => {
    const only = projected([["b", 250, 300]]);
    expect(dropFits(only, "c", "b", AREA, { min: 10, side: "right" }).ok).toBe(false);
    expect(dropFits(only, "b", "z", AREA, { min: 10, side: "right" }).ok).toBe(false);
    expect(dropFits(new Map(), "c", "b", AREA, { min: 0, side: "right" }).ok).toBe(false);
  });

  it("an area with no width or no height has nothing to measure", () => {
    const none = projected([]);
    expect(dropFits(none, "c", "b", { x: 0, y: 0, width: 0, height: 600 }, { min: 50, side: "left" })).toEqual({ ok: true });
    expect(dropFits(none, "c", "b", { x: 0, y: 0, width: 1000, height: 0 }, { min: 50, side: "left" })).toEqual({ ok: true });
    expect(dropFits(none, "c", "b", { x: 0, y: 0, width: Number.NaN, height: 600 }, { min: 50, side: "left" })).toEqual({ ok: true });
  });

  it("a min that is negative or not finite is 0, and the rects may sit anywhere", () => {
    const flat = new Map<string, Rect>([["c", { x: -50, y: 900, width: 0, height: 0 }], ["b", { x: 7, y: 7, width: 0, height: 0 }]]);
    expect(dropFits(flat, "c", "b", AREA, { min: -4, side: "top" })).toEqual({ ok: true });
    expect(dropFits(flat, "c", "b", AREA, { min: Number.NaN, side: "top" })).toEqual({ ok: true });
    expect(dropFits(flat, "c", "b", AREA, { min: 1, side: "top" }).ok).toBe(false);
  });

  it("seeded sweep: on the layout dropOnPane makes it answers by the two panes' sizes alone", () => {
    const rnd = seeded(515);
    const SIDES: readonly PaneSide[] = ["top", "right", "bottom", "left"];
    let ok = 0;
    let refused = 0;
    for (let i = 0; i < 600; i++) {
      const n = 2 + Math.floor(rnd() * 6);
      const tree = randomTree(rnd, n, { gap: 0.2 });
      const area: Rect = { x: 0, y: 0, width: 300 + rnd() * 1200, height: 200 + rnd() * 700 };
      const dragged = Math.floor(rnd() * (n + 1));
      const at = Math.floor(rnd() * n);
      if (dragged === at) continue;
      const side = SIDES[Math.floor(rnd() * 4)]!;
      const min = 10 + Math.floor(rnd() * 200);
      const layout = layoutSplit(dropOnPane(tree, dragged, at, side), area, { gap: Math.floor(rnd() * 12) });
      const big = (k: number): boolean => layout.get(k)!.width >= min && layout.get(k)!.height >= min;
      const res = dropFits(layout, dragged, at, area, { min, side });
      expect(res.ok).toBe(big(dragged) && big(at));
      if (res.ok) ok++;
      else refused++;
      // A projection the host edited by hand is judged as it stands: shrinking `at` below min refuses it.
      const shrunk = new Map(layout).set(at, { ...layout.get(at)!, width: min - 1 });
      expect(dropFits(shrunk, dragged, at, area, { min, side }).ok).toBe(false);
    }
    expect(ok).toBeGreaterThan(50);
    expect(refused).toBeGreaterThan(50);
  });
});
