/** ./tiling, the room rule of a drop: `canSplitPane`, whether a pane's rect can take another on a side. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import { canSplitPane, type PaneSide } from "../src/tiling";
import { seeded } from "./tiling-fixture";

const SIDES: readonly PaneSide[] = ["top", "right", "bottom", "left"];
const pane = (width: number, height: number): Rect => ({ x: 40, y: 60, width, height });

describe("canSplitPane", () => {
  it("along the split a pane needs 2 * min plus the gutter, across it min", () => {
    const gap = 10;
    // 495 wide: 2 * 240 + 10 = 490 fits, 2 * 243 + 10 = 496 does not.
    expect(canSplitPane(pane(495, 600), "left", { gap, min: 240 })).toEqual({ ok: true });
    expect(canSplitPane(pane(495, 600), "left", { gap, min: 243 })).toEqual({ ok: false, reason: "left rejected: axis span 495.0px < min 496.0px (2 panes + gutter 10px)" });
    // Top and bottom run along the height.
    expect(canSplitPane(pane(495, 600), "top", { gap, min: 295 }).ok).toBe(true);
    expect(canSplitPane(pane(495, 600), "bottom", { gap, min: 296 }).reason).toBe("bottom rejected: axis span 600.0px < min 602.0px (2 panes + gutter 10px)");
    // Across: a left drop on a pane 100 high needs 120 across.
    expect(canSplitPane(pane(1000, 100), "right", { gap, min: 120 })).toEqual({ ok: false, reason: "right rejected: cross span 100.0px < min 120.0px" });
  });

  it("the handle counts in the gutter, and the rect's origin does not matter", () => {
    expect(canSplitPane(pane(495, 600), "left", { gap: 6, handle: 4, min: 243 }).reason).toMatch(/gutter 10px/);
    expect(canSplitPane({ x: -900, y: 5000, width: 495, height: 600 }, "left", { gap: 6, handle: 4, min: 242 })).toEqual({ ok: true });
  });

  it("a min, gap or handle that is negative or not finite is 0", () => {
    expect(canSplitPane(pane(10, 10), "left", { min: -5 })).toEqual({ ok: true });
    expect(canSplitPane(pane(10, 10), "left", { min: Number.NaN, gap: Number.NaN, handle: -3 })).toEqual({ ok: true });
    expect(canSplitPane(pane(10, 10), "left", { min: 4, gap: Number.POSITIVE_INFINITY })).toEqual({ ok: true });
    // 2 * 6 = 12 > 10.
    expect(canSplitPane(pane(10, 10), "left", { min: 6, gap: Number.NaN }).ok).toBe(false);
  });

  it("a pane of no size takes nothing unless min is 0", () => {
    expect(canSplitPane(pane(0, 0), "top", { min: 1 }).ok).toBe(false);
    expect(canSplitPane(pane(0, 0), "top", { min: 0 }).ok).toBe(true);
  });

  it("seeded sweep: it accepts exactly when the two spans clear their needs, and a smaller min stays accepted", () => {
    const rnd = seeded(2024);
    let accepted = 0;
    for (let i = 0; i < 2000; i++) {
      const r = pane(rnd() * 800, rnd() * 800);
      const side = SIDES[Math.floor(rnd() * 4)]!;
      const min = rnd() * 300;
      const gap = Math.floor(rnd() * 20);
      const handle = Math.floor(rnd() * 8);
      const horizontal = side === "left" || side === "right";
      const along = horizontal ? r.width : r.height;
      const across = horizontal ? r.height : r.width;
      const res = canSplitPane(r, side, { min, gap, handle });
      expect(res.ok).toBe(along >= min * 2 + gap + handle && across >= min);
      expect(res.reason === undefined).toBe(res.ok);
      if (res.ok) {
        accepted++;
        expect(canSplitPane(r, side, { min: min / 2, gap, handle }).ok).toBe(true);
      }
    }
    expect(accepted).toBeGreaterThan(100);
  });
});
