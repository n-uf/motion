/**
 * Bars by height: a top or bottom bar with `giveWay` shrinks across, then folds to its items' next form, before the
 * content falls under `contentMin.height` (`bar-shrunk`, `bar-folded`); and an overlay bar with `span: "full"` set by
 * name lies over the side columns too, while one with no `span` keeps the content's width.
 */
import { describe, expect, it } from "vitest";
import { refusals, solve, type DockEdge, type DockState, type DockItem } from "../src";

/** A panel: down a column (open, its title bar) and along a bar (open 180 high, at least 100; its 22 px title bar). */
const panel = (id: string, used: number): DockItem => ({
  id,
  kind: "panel",
  used,
  forms: {
    column: [
      { kind: "open", main: { min: 120, natural: 200, grows: true }, cross: { natural: 190, min: 160 } },
      { kind: "header", main: { min: 22, natural: 22 }, cross: { natural: 160, min: 0 } },
    ],
    row: [
      { kind: "open", main: { min: 160, natural: 160, grows: true }, cross: { natural: 180, min: 100 } },
      { kind: "header", main: { min: 160, natural: 160, grows: true }, cross: { natural: 22 }, setsCross: true },
    ],
  },
});

/** Files on the left, Notes on the right, History in a bottom dock between them, at `height`. */
function desk(height: number, dock: Partial<DockEdge> = {}): DockState {
  return {
    stage: { x: 0, y: 0, width: 960, height },
    edges: [
      { id: "left", side: "left", ring: 0, accepts: ["panel"], items: ["files"], cross: { min: 160, max: 300 } },
      { id: "right", side: "right", ring: 0, accepts: ["panel"], items: ["notes"], cross: { min: 160, max: 300 } },
      { id: "bottom", side: "bottom", ring: 0, span: "between", giveWay: true, accepts: ["panel"], items: ["history"], cross: { min: 22, max: 300 }, ...dock },
    ],
    items: { files: panel("files", 1), notes: panel("notes", 2), history: panel("history", 3) },
    floats: [],
    floatKinds: [],
    contentMin: { width: 320, height: 240 },
  };
}

describe("height give-way of bars", () => {
  it("leaves a bar alone while the content fits", () => {
    const l = solve(desk(560));
    expect(l.edges.bottom!.cross).toBe(180);
    expect(l.edges.bottom!.shrunk).toBeUndefined();
    expect(l.notes.filter((n) => n.code.startsWith("bar-"))).toEqual([]);
  });

  it("shrinks a bar toward its minimum to keep the content's least height", () => {
    const l = solve(desk(374));
    expect(l.edges.bottom!.cross).toBeCloseTo(134);
    expect(l.content.height).toBeCloseTo(240);
    expect(l.edges.bottom!.shrunk).toBe(true);
    expect(l.items.history!.formKind).toBe("open");
    expect(l.notes).toContainEqual({ code: "bar-shrunk", edge: "bottom", from: 180, to: 134 });
    expect(l.notes.some((n) => n.code === "content-short")).toBe(false);
  });

  it("folds a bar to its items' title bars once its minimum is not enough", () => {
    const l = solve(desk(300));
    expect(l.items.history!.formKind).toBe("header");
    expect(l.items.history!.foldedBy).toBe("auto");
    expect(l.edges.bottom!.cross).toBe(22);
    expect(l.notes).toContainEqual({ code: "bar-folded", edge: "bottom" });
    expect(l.notes.some((n) => n.code === "bar-shrunk")).toBe(false);
    expect(l.notes.some((n) => n.code === "content-short")).toBe(false);
    // Folded and still short: the content says so.
    expect(solve(desk(250)).notes).toContainEqual({ code: "content-short", height: 228, min: 240 });
  });

  it("undoes it as room comes back, in reverse", () => {
    const sizes = [300, 340, 374, 420, 560].map((h) => solve(desk(h)).edges.bottom!.cross);
    expect(sizes).toEqual([22, 100, 134, 180, 180]);
  });

  it("counts an overlay bar against the content's height too", () => {
    const l = solve(desk(374, { mode: "overlay" }));
    expect(l.edges.bottom!.cross).toBeCloseTo(134);
    expect(l.notes).toContainEqual({ code: "bar-shrunk", edge: "bottom", from: 180, to: 134 });
  });

  it("gives way only with `giveWay`", () => {
    const l = solve(desk(300, { giveWay: false }));
    expect(l.edges.bottom!.cross).toBe(180);
    expect(l.notes.some((n) => n.code.startsWith("bar-"))).toBe(false);
  });

  it("shrinks every bar first, then folds unkept before kept, the oldest first", () => {
    const s = desk(400);
    const two: DockState = {
      ...s,
      edges: [...s.edges, { id: "top", side: "top", ring: 0, span: "between", giveWay: true, accepts: ["panel"], items: ["outline"], cross: { min: 22, max: 300 } }],
      items: { ...s.items, outline: panel("outline", 4) },
    };
    // 400 − 240 leaves 160 for two bars of 180: both at their 100 are still 40 short, so the older (history) folds to
    // its 22 px title bar, and outline takes back what is left: 400 − 240 − 22 = 138.
    const l = solve(two);
    expect(l.items.history!.formKind).toBe("header");
    expect(l.edges.top!.cross).toBeCloseTo(138);
    expect(l.notes.filter((n) => n.code.startsWith("bar-"))).toEqual([
      { code: "bar-shrunk", edge: "top", from: 180, to: 138 },
      { code: "bar-folded", edge: "bottom" },
    ]);
    // Kept, history gives way last: outline folds instead.
    const kept = solve({ ...two, items: { ...two.items, history: { ...two.items.history!, kept: true } } });
    expect(kept.items.outline!.formKind).toBe("header");
    expect(kept.edges.bottom!.cross).toBeCloseTo(138);
  });

  it("breaks a tie of keeps and ages by ring, the outer bar first", () => {
    const s = desk(550);
    // Outline and History share an age; 550 − 240 leaves 310 for two bars of 180, so one shrinks by 50.
    const two = (ring: number): DockState => ({
      ...s,
      edges: [...s.edges.map((e) => (e.id === "bottom" ? { ...e, ring: 1 - ring } : e)), { id: "top", side: "top", ring, span: "between", giveWay: true, accepts: ["panel"], items: ["outline"], cross: { min: 22, max: 300 } }],
      items: { ...s.items, outline: panel("outline", 3) },
    });
    const topOuter = solve(two(0));
    expect(topOuter.edges.top!.cross).toBeCloseTo(130);
    expect(topOuter.edges.bottom!.cross).toBe(180);
    const bottomOuter = solve(two(1));
    expect(bottomOuter.edges.bottom!.cross).toBeCloseTo(130);
    expect(bottomOuter.edges.top!.cross).toBe(180);
  });
});

describe("an overlay bar with no span keeps the content's width", () => {
  it("lies over the content only, exactly as before", () => {
    const l = solve(desk(560, { mode: "overlay", giveWay: false }));
    expect(l.edges.bottom!.rect).toEqual({ x: 190, y: 380, width: 580, height: 180 });
    expect(l.edges.left!.rect).toEqual({ x: 0, y: 0, width: 190, height: 560 });
    expect(l.content).toEqual({ x: 190, y: 0, width: 580, height: 560 });
  });

  it("an undrawn one (zones taking nothing) with stored items refuses over the content's width only", () => {
    const l = solve(desk(560, { mode: "overlay", giveWay: false, zoneAccepts: {} }));
    expect(l.edges.bottom!.rect).toEqual({ x: 190, y: 380, width: 580, height: 180 });
    const s = desk(560, { mode: "overlay", giveWay: false, zoneAccepts: {} });
    const refused = refusals(s, "files").filter((r) => r.edge === "bottom");
    expect(refused.length).toBe(1);
    for (const r of refused) for (const p of r.hits ?? [r.hit]) {
      expect(p.x).toBeGreaterThanOrEqual(190);
      expect(p.x + p.width).toBeLessThanOrEqual(770);
    }
  });
});

describe("a full overlay bar honours its span", () => {
  it("lies across the full width, over the columns, at the content's bottom", () => {
    const l = solve(desk(560, { mode: "overlay", span: "full", giveWay: false }));
    expect(l.edges.bottom!.rect).toEqual({ x: 0, y: 380, width: 960, height: 180 });
    // The columns keep their height: the bar lies over them.
    expect(l.edges.left!.rect.height).toBe(560);
    expect(l.content).toEqual({ x: 190, y: 0, width: 580, height: 560 });
  });

  it("between the columns, it lies over the content only", () => {
    const l = solve(desk(560, { mode: "overlay", span: "between", giveWay: false }));
    expect(l.edges.bottom!.rect).toEqual({ x: 190, y: 380, width: 580, height: 180 });
  });

  it("runs across the inset area, or with `outsideInset` across the whole window", () => {
    const inset = (dock: Partial<DockEdge>): DockState => ({ ...desk(560, { mode: "overlay", span: "full", giveWay: false, ...dock }), inset: { left: 12, right: 12 } });
    expect(solve(inset({})).edges.bottom!.rect).toEqual({ x: 12, y: 380, width: 936, height: 180 });
    expect(solve(inset({ outsideInset: true })).edges.bottom!.rect).toEqual({ x: 0, y: 380, width: 960, height: 180 });
  });
});
