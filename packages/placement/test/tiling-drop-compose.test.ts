/**
 * ./tiling, `canDropOnPane` is exactly `canSplitPane` then `dropFits`: its verdicts and reasons against the function
 * as it was at 99652706 (copied below, with its two rules inline), over seeded random trees, areas and options.
 */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { canDropOnPane, canSplitPane, dropFits, dropOnPane, layoutSplit, panesOf, removePane, type DropOptions, type DropVerdict, type PaneRegion, type Split } from "../src/tiling";
import { randomTree, seeded, type TreeShape } from "./tiling-fixture";

const px = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);

/** `canDropOnPane` as it was at 99652706. */
function canDropOnPaneOld<K>(tree: Split<K> | null, dragged: K, at: K, region: PaneRegion, area: Rect, options: DropOptions<K>): DropVerdict {
  if (region === "center") {
    if (dragged === at) return { ok: false, reason: "center swap blocked: a pane dropped on itself" };
    return panesOf(tree).includes(at) ? { ok: true } : { ok: false, reason: "center rejected: no pane to swap" };
  }
  const min = px(options.min);
  const gutter = px(options.gap) + px(options.handle);
  const target = layoutSplit(removePane(tree, dragged), area, options).get(at);
  if (!target) return { ok: false, reason: `${region} rejected: no pane to split` };
  const horizontal = region === "left" || region === "right";
  const along = horizontal ? target.width : target.height;
  const across = horizontal ? target.height : target.width;
  const need = min * 2 + gutter;
  if (along < need) return { ok: false, reason: `${region} rejected: axis span ${along.toFixed(1)}px < min ${need.toFixed(1)}px (2 panes + gutter ${gutter}px)` };
  if (across < min) return { ok: false, reason: `${region} rejected: cross span ${across.toFixed(1)}px < min ${min.toFixed(1)}px` };
  if (!(area.width > 0 && area.height > 0)) return { ok: true };
  const after = layoutSplit(dropOnPane(tree, dragged, at, region), area, options);
  const fits = (r: Rect | undefined): boolean => !!r && r.width >= min && r.height >= min;
  return fits(after.get(dragged)) && fits(after.get(at)) ? { ok: true } : { ok: false, reason: `${region} rejected: projected footprint of the two panes violates min ${min}px` };
}

const REGIONS: readonly PaneRegion[] = ["center", "top", "right", "bottom", "left"];
const ODD = [Number.NaN, Number.POSITIVE_INFINITY, -5, 0];

describe("canDropOnPane against its first form", () => {
  it("the same verdict and reason over 120000 seeded cases", () => {
    const rnd = seeded(99652706);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
    const shapes: readonly TreeShape[] = [{}, { gap: 0.4 }, { gap: 0.3, master: 0.3, id: 0.5 }, { axis: 0.2, noRatio: 0.6, gap: 0.5 }];
    const CASES = 120_000;
    let centerOk = 0;
    let sideOk = 0;
    let zeroAreaOk = 0;
    let room = 0;
    let fit = 0;
    let other = 0;
    for (let i = 0; i < CASES; i++) {
      const n = 1 + Math.floor(rnd() * 7);
      const tree: Split<number> | null = rnd() < 0.03 ? null : randomTree(rnd, n, pick(shapes));
      const area: Rect =
        rnd() < 0.1
          ? { x: 0, y: 0, width: rnd() < 0.5 ? 0 : 400, height: rnd() < 0.5 ? 0 : 300 }
          : { x: rnd() * 50, y: rnd() * 50, width: 100 + rnd() * 1400, height: 80 + rnd() * 900 };
      // Panes 0..n-1 are in the tree; n and n + 1 are not.
      const dragged = Math.floor(rnd() * (n + 2));
      const at = rnd() < 0.05 ? dragged : Math.floor(rnd() * (n + 2));
      const region = pick(REGIONS);
      const net = rnd() < 0.5;
      // Floors answer by the pane alone: the two forms ask a different number of times, so no random draw in them.
      const options: DropOptions<number> = {
        min: rnd() < 0.05 ? pick(ODD) : rnd() < 0.1 ? 0 : Math.floor(rnd() * 260),
        ...(rnd() < 0.6 ? { gap: rnd() < 0.05 ? pick(ODD) : Math.floor(rnd() * 14) } : {}),
        ...(rnd() < 0.3 ? { handle: rnd() < 0.05 ? pick(ODD) : Math.floor(rnd() * 8) } : {}),
        ...(rnd() < 0.5 ? { floor: (child: Split<number>) => ({ min: "pane" in child ? 10 + child.pane * 30 : 60, net: "pane" in child ? net : !net }) } : {}),
      };
      const before = canDropOnPaneOld(tree, dragged, at, region, area, options);
      const now = canDropOnPane(tree, dragged, at, region, area, options);
      if (JSON.stringify(now) !== JSON.stringify(before)) expect(now).toEqual(before);
      if (before.ok) {
        if (region === "center") centerOk++;
        else if (!(area.width > 0 && area.height > 0)) zeroAreaOk++;
        else sideOk++;
      } else if (before.reason!.includes("axis span") || before.reason!.includes("cross span")) room++;
      else if (before.reason!.includes("footprint")) fit++;
      else other++;
    }
    // Every outcome came up often enough for the comparison to mean something.
    expect(centerOk).toBeGreaterThan(CASES / 20);
    expect(sideOk).toBeGreaterThan(CASES / 20);
    expect(zeroAreaOk).toBeGreaterThan(150);
    expect(room).toBeGreaterThan(CASES / 20);
    expect(fit).toBeGreaterThan(500);
    expect(other).toBeGreaterThan(500);
  });

  it("is the composition: the room rule on the target lifted out, then the fit rule on the layout the drop makes", () => {
    const rnd = seeded(4242);
    for (let i = 0; i < 1000; i++) {
      const n = 2 + Math.floor(rnd() * 5);
      const tree = randomTree(rnd, n, { gap: 0.3 });
      const area: Rect = { x: 0, y: 0, width: 200 + rnd() * 1000, height: 150 + rnd() * 700 };
      const side = (["top", "right", "bottom", "left"] as const)[Math.floor(rnd() * 4)]!;
      const dragged = Math.floor(rnd() * n);
      const at = Math.floor(rnd() * n);
      if (dragged === at) continue;
      const options = { gap: Math.floor(rnd() * 10), handle: Math.floor(rnd() * 4), min: Math.floor(rnd() * 200) };
      const target = layoutSplit(removePane(tree, dragged), area, options).get(at)!;
      const byParts = ((): DropVerdict => {
        const r = canSplitPane(target, side, options);
        return r.ok ? dropFits(layoutSplit(dropOnPane(tree, dragged, at, side), area, options), dragged, at, area, { min: options.min, side }) : r;
      })();
      expect(canDropOnPane(tree, dragged, at, side, area, options)).toEqual(byParts);
    }
  });
});
