/** `DockState.barZones: "nearest"`: a bar's zones meet halfway between the landings either side, not at thirds. */
import { describe, expect, it } from "vitest";
import type { Rect } from "@n-uf/placement";
import { solve, targets, type DockState, type DockDrop } from "../src";
import { bar, byId, group } from "./fixture";

/** An empty top bar across the window, a group in the bottom bar. */
const win = (declared: boolean): DockState => ({
  stage: { x: 0, y: 0, width: 1200, height: 800 },
  edges: [bar("top", "top", 0, []), bar("bottom", "bottom", 0, ["g"])],
  items: byId([group("g", 1)]),
  floats: [],
  floatKinds: ["group"],
  ...(declared ? { barZones: "nearest" as const } : {}),
});
const strips = (s: DockState): DockDrop[] => ["start", "center", "end"].map((z) => targets(s, "g", { previous: solve(s) }).find((t) => t.id === `strip:top:${z}`)!);
const landing = (t: DockDrop): Rect => t.after({ x: 0, y: 0 }).layout.items.g!.rect;

describe("barZones: nearest", () => {
  it("each boundary lies halfway between the landing rects either side of it", () => {
    const [start, center, end] = strips(win(true));
    const [ls, lc, le] = [landing(start!), landing(center!), landing(end!)];
    expect(start!.hit.x + start!.hit.width).toBeCloseTo((ls.x + ls.width + lc.x) / 2, 6);
    expect(end!.hit.x).toBeCloseTo((lc.x + lc.width + le.x) / 2, 6);
  });

  it("a pointer nearer the center's landing picks the center, where thirds pick the start", () => {
    const [start, center] = strips(win(true));
    const ls = landing(start!);
    const lc = landing(center!);
    const x = 1200 / 3 - 20;
    expect(lc.x - x).toBeLessThan(x - (ls.x + ls.width));
    const pick = (s: DockState): string => strips(s).find((t) => x >= t.hit.x && x <= t.hit.x + t.hit.width)!.id;
    expect(pick(win(false))).toBe("strip:top:start");
    expect(pick(win(true))).toBe("strip:top:center");
  });

  it("changes nothing without the declaration: thirds", () => {
    const [start] = strips(win(false));
    expect(start!.hit.x + start!.hit.width).toBeCloseTo(1200 / 3, 6);
  });
});
