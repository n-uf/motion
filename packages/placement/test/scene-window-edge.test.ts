/**
 * The outermost column line at the window's edge: its band is laid inside the stage, right after the rail stop, and a
 * point 28 px in from an empty or outermost side picks the new column, in a flush window and in one with an inset.
 */
import { targetAt } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { refusals, solve, targets, type Scene, type SceneTarget } from "../src/scene";
import { WINDOW_A, WINDOW_B, winScene } from "../src/scene/cases";
import { modelScene } from "./model-scene";

const inStage = (s: Scene, r: { x: number; y: number; width: number; height: number }): boolean =>
  r.x >= s.stage.x - 1e-9 && r.y >= s.stage.y - 1e-9 && r.x + r.width <= s.stage.x + s.stage.width + 1e-9 && r.y + r.height <= s.stage.y + s.stage.height + 1e-9;

/** The target 28 px in from `side`'s window edge, half way down; its preview is its landing. */
function at28(s: Scene, dragged: string, side: "left" | "right"): SceneTarget | null {
  const ts = targets(s, dragged);
  const x = side === "left" ? s.stage.x + 28 : s.stage.x + s.stage.width - 28;
  return targetAt(ts, { x, y: s.stage.y + s.stage.height / 2 });
}

// A flush window (no gutter, no inset) and one with a 12 px inset and gutter.
const flushAlone = winScene(WINDOW_B, { width: 1280, columns: { left: [["pages"]], right: [] } });
const flushThree = winScene(WINDOW_B, { width: 1280, columns: { left: [["pages"], ["annotations"]], right: [["findings"]] } });
const insetAlone = winScene(WINDOW_A, { width: 1400, columns: { left: [["pages"]], right: [] } });
const insetThree = winScene(WINDOW_A, { width: 1400, columns: { left: [["pages"], ["annotations"]], right: [["findings"]] } });

describe("the outermost column line at the window's edge", () => {
  for (const [name, s, dragged, side] of [
    ["flush, the empty right side", flushAlone, "pages", "right"],
    ["flush, the outermost left column", flushThree, "findings", "left"],
    ["inset, the empty right side", insetAlone, "pages", "right"],
    ["inset, the outermost left column", insetThree, "findings", "left"],
  ] as const) {
    it(`${name}: 28 px in picks the new column, and its preview is the landing`, () => {
      const t = at28(s, dragged, side);
      expect(t?.id).toBe(`column:${side}:0`);
      const after = t!.after({ x: 0, y: 0 });
      expect(JSON.stringify(after.layout)).toBe(JSON.stringify(solve(after.scene)));
      expect(after.layout.items[dragged]!.edge).not.toBeNull();
      // The rail stop keeps its 10 px at the boundary.
      const rail = targets(s, dragged).find((x) => x.id === `rail:${side}:0`);
      if (rail) expect(rail.hit.width).toBe(10);
    });
  }

  it("refuses no column line for want of room where a column fits", () => {
    for (const s of [flushAlone, insetAlone]) {
      expect(refusals(s, "pages").filter((r) => r.edge === "column:right")).toEqual([]);
    }
  });

  it("no column-line or rail target's hit lies outside the stage", () => {
    const scenes = [flushAlone, flushThree, insetAlone, insetThree, ...[false, true].flatMap((flush) => Array.from({ length: 60 }, (_, i) => modelScene(i + 1, flush)))];
    let n = 0;
    for (const s of scenes) {
      for (const id of Object.keys(s.items)) {
        if (s.items[id]!.fixed || s.items[id]!.closed) continue;
        for (const t of targets(s, id)) {
          if (t.place.kind !== "column" && t.place.kind !== "rail") continue;
          for (const h of t.hits ?? [t.hit]) expect(inStage(s, h), `${t.id} ${JSON.stringify(h)}`).toBe(true);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(200);
  });
});
