/** ./tiling, whether a drop on a pane keeps both panes at least `min` wide and high: `canDropOnPane`. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { canDropOnPane, dropOnPane, layoutSplit, panesOf, removePane, splitFromOrder, type PaneRegion, type Split } from "../src/tiling";
import { randomTree, seeded } from "./tiling-fixture";

const AREA: Rect = { x: 0, y: 0, width: 1000, height: 600 };
const SIDES: readonly PaneRegion[] = ["top", "right", "bottom", "left"];
const REGIONS: readonly PaneRegion[] = ["center", ...SIDES];
const two: Split<string> = splitFromOrder(["a", "b"])!;

describe("canDropOnPane", () => {
  it("a center drop is fine unless the pane is dropped on itself", () => {
    expect(canDropOnPane(two, "a", "b", "center", AREA, { min: 900 })).toEqual({ ok: true });
    const self = canDropOnPane(two, "a", "a", "center", AREA, { min: 1 });
    expect(self.ok).toBe(false);
    expect(self.reason).toMatch(/itself/);
  });

  it("a side drop needs 2 * min + the gutter along the split and min across, measured without the dragged pane", () => {
    // b is 495 wide and 600 high; a left drop splits its width in two, a gap of 10 between.
    const gap = 10;
    expect(canDropOnPane(two, "c", "b", "left", AREA, { gap, min: 240 }).ok).toBe(true);
    const tight = canDropOnPane(two, "c", "b", "left", AREA, { gap, min: 243 });
    expect(tight.ok).toBe(false);
    expect(tight.reason).toBe("left rejected: axis span 495.0px < min 496.0px (2 panes + gutter 10px)");
    // Across: a top drop splits b's height in two; b is 600 high, 2 * 295 + 10 = 600 fits, 296 does not.
    expect(canDropOnPane(two, "c", "b", "top", AREA, { gap, min: 295 }).ok).toBe(true);
    expect(canDropOnPane(two, "c", "b", "top", AREA, { gap, min: 296 }).reason).toMatch(/^top rejected: axis span 600\.0px < min 602\.0px/);
    // Across the split: a left drop on a 495 wide pane in a 300 high area needs 300 across.
    const flat: Rect = { x: 0, y: 0, width: 1000, height: 100 };
    expect(canDropOnPane(two, "c", "b", "left", flat, { gap, min: 120 }).reason).toBe("left rejected: cross span 100.0px < min 120.0px");
  });

  it("the handle counts in the gutter, and the target is measured in the tree without the dragged pane", () => {
    // b is 495 wide with a gap of 6; the handle of 4 makes the gutter 10 and b 495: 243 * 2 + 10 = 496 fails.
    const withHandle = canDropOnPane(two, "c", "b", "left", AREA, { gap: 6, handle: 4, min: 243 });
    expect(withHandle.reason).toMatch(/gutter 10px/);
    // Lifting "a" out leaves b the whole width: dropping a on b's left needs only 2 * min + gutter of 1000.
    expect(canDropOnPane(two, "a", "b", "left", AREA, { gap: 10, min: 400 }).ok).toBe(true);
    expect(canDropOnPane(two, "c", "b", "left", AREA, { gap: 10, min: 400 }).ok).toBe(false);
  });

  it("the layout the drop makes must keep both panes at least min wide and high", () => {
    // Dropping c left of a: the new split's sides take floors of 300 and 100, which leave a under 240.
    const floor = (child: Split<string>) => ({ min: "pane" in child && child.pane === "c" ? 300 : 100, net: false });
    const skewed = canDropOnPane(two, "c", "a", "left", AREA, { gap: 10, min: 240, floor });
    expect(skewed.ok).toBe(false);
    expect(skewed.reason).toMatch(/^left rejected: .*footprint/);
    expect(canDropOnPane(two, "c", "a", "left", AREA, { gap: 10, min: 150, floor }).ok).toBe(true);
  });

  it("an empty area, a pane that is not in the tree and a drop on itself", () => {
    // With no room to measure the spans fail, and with a min of 0 nothing is left to check.
    const empty: Rect = { x: 0, y: 0, width: 0, height: 0 };
    expect(canDropOnPane(two, "c", "b", "left", empty, { min: 10 }).ok).toBe(false);
    expect(canDropOnPane(two, "c", "b", "left", empty, { min: 0 }).ok).toBe(true);
    expect(canDropOnPane(two, "c", "z", "left", AREA, { min: 10 }).ok).toBe(false);
    expect(canDropOnPane(two, "b", "b", "left", AREA, { min: 10 }).ok).toBe(false);
    expect(canDropOnPane(null, "c", "b", "left", AREA, { min: 10 }).ok).toBe(false);
  });
});

describe("canDropOnPane, seeded sweeps", () => {
  it("an accepted drop keeps both panes at least min in the layout the drop makes; a smaller min stays accepted", () => {
    const rnd = seeded(81);
    let accepted = 0;
    let refused = 0;
    for (let i = 0; i < 400; i++) {
      const n = 2 + Math.floor(rnd() * 6);
      const tree = randomTree(rnd, n, { gap: 0.2 });
      const gap = Math.floor(rnd() * 12);
      const area: Rect = { x: 0, y: 0, width: 300 + rnd() * 1200, height: 200 + rnd() * 700 };
      const dragged = Math.floor(rnd() * (n + 1));
      const at = Math.floor(rnd() * n);
      const region = REGIONS[Math.floor(rnd() * 5)]!;
      const min = 20 + Math.floor(rnd() * 200);
      const opts = { gap, min, floor: () => ({ min: 15 }) };
      const res = canDropOnPane(tree, dragged, at, region, area, opts);
      if (dragged === at) {
        expect(res.ok).toBe(false);
        continue;
      }
      if (res.ok) {
        accepted++;
        expect(res.reason).toBeUndefined();
        if (region !== "center") {
          const l = layoutSplit(dropOnPane(tree, dragged, at, region), area, { gap, floor: () => ({ min: 15 }) });
          for (const p of [dragged, at]) {
            expect(l.get(p)!.width).toBeGreaterThanOrEqual(min);
            expect(l.get(p)!.height).toBeGreaterThanOrEqual(min);
          }
        }
        expect(canDropOnPane(tree, dragged, at, region, area, { ...opts, min: min / 2 }).ok).toBe(true);
      } else {
        refused++;
        expect(typeof res.reason).toBe("string");
        if (region !== "center") {
          // A refusal is no accident: a smaller min can accept it, but 0 never refuses a pane that has a place.
          expect(canDropOnPane(tree, dragged, at, region, area, { ...opts, min: 0 }).ok).toBe(true);
        }
      }
      expect(panesOf(removePane(tree, dragged)).includes(at)).toBe(true);
    }
    expect(accepted).toBeGreaterThan(40);
    expect(refused).toBeGreaterThan(40);
  });
});
