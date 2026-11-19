/** `Scene.foldedColumnDrop: "end"`: a column drawn as a rail is one drop place, and the item keeps its state. */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/geometry";
import { heldRect, refusals, solve, targets, type Scene, type SceneTargetOptions } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";
import { modelScene } from "./model-scene";

/** Annotations on the left, Pages and Findings collapsed on the right (a rail of title tiles); `state` for Annotations. */
const win = (state: "open" | "collapsed", declared = true): Scene => {
  // No declared side rail: the column itself draws as the rail.
  const { rails: _rails, ...s } = winScene(WINDOW_A, { size: 300, columns: { left: [["annotations"]], right: [["findings", "pages"]] }, from: { findings: 1, pages: 1, ...(state === "collapsed" ? { annotations: 1 } : {}) } });
  return declared ? { ...s, foldedColumnDrop: "end" } : s;
};
const onRail = (s: Scene) => targets(s, "annotations").filter((t) => t.place.kind === "gap" && t.place.edge === "right-0");

describe("heldRect", () => {
  const size = { width: 200, height: 40 };
  const grab = { x: 20, y: 10 };
  /** Annotations alone on the left, nothing on the right: lifted, nothing docked stands beside the content. */
  const alone = (extra: Partial<Scene> = {}): Scene => {
    const { rails: _rails, ...s } = winScene(WINDOW_A, { size: 300, columns: { left: [["annotations"]], right: [] } });
    return { ...s, ...extra };
  };
  const landedAt = (s: Scene, p: Point, g: Point, options?: SceneTargetOptions): Rect => targets(s, "annotations", options).find((t) => t.place.kind === "float")!.after(p, g).layout.items.annotations!.rect;

  it("keeps the grip under the pointer where the item fits, and the item wholly inside the stage at every edge", () => {
    const s = alone({ inset: {} });
    const { width, height } = s.stage;
    expect(heldRect(s, "annotations", size, { x: 500, y: 300 }, grab)).toEqual({ x: 480, y: 290, width: 200, height: 40 });
    expect(heldRect(s, "annotations", size, { x: width + 40, y: 300 }, grab).x).toBe(width - 200);
    expect(heldRect(s, "annotations", size, { x: -40, y: 300 }, grab).x).toBe(0);
    expect(heldRect(s, "annotations", size, { x: 500, y: height + 40 }, grab).y).toBe(height - 40);
    expect(heldRect(s, "annotations", size, { x: 500, y: -40 }, grab).y).toBe(0);
  });

  it("stays inside the stage less the inset at its left and right", () => {
    const s = alone({ inset: { left: 12, right: 30 } });
    const { width } = s.stage;
    expect(heldRect(s, "annotations", size, { x: -40, y: 300 }, grab).x).toBe(12);
    expect(heldRect(s, "annotations", size, { x: width + 40, y: 300 }, grab).x).toBe(width - 30 - 200);
  });

  it("with insetWhen docked, does not count the held item as docked", () => {
    const s = alone({ inset: { left: 12, right: 12 }, insetWhen: "docked" });
    expect(heldRect(s, "annotations", size, { x: -40, y: 300 }, grab).x).toBe(0);
  });

  it("is the rect a floatFromHeld float target lands, with and without an inset, up to both sides", () => {
    for (const inset of [{}, { left: 12, right: 12 }, { left: 30, right: 5 }]) {
      const s = alone({ inset });
      const g = { x: 10, y: 8 };
      const options = { floatFromHeld: true };
      const { width, height } = landedAt(s, { x: 560, y: 400 }, g, options);
      const y = s.stage.y + s.stage.height / 2;
      for (const x of [-50, 4, 14, s.stage.width / 2, s.stage.width - 14, s.stage.width - 4, s.stage.width + 50]) {
        const p = { x: s.stage.x + x, y };
        expect(landedAt(s, p, g, options)).toEqual(heldRect(s, "annotations", { width, height }, p, g));
      }
    }
  });

  it("leaves the float target on the pointer's rect unless a host opts in", () => {
    const s = win("open");
    const g = { x: 10, y: 8 };
    const p = { x: 560, y: 400 };
    const { width, height } = landedAt(s, p, g);
    expect(landedAt(s, p, g)).toEqual({ x: p.x - g.x, y: p.y - g.y, width, height });
  });
});

describe("foldedColumnDrop", () => {
  it("an open panel opens the column, at full size, after its last member", () => {
    const s = win("open");
    const rail = solve(s).edges["right-0"]!.rect;
    const [t, ...more] = onRail(s);
    expect(more).toEqual([]);
    expect(t!.place).toMatchObject({ kind: "gap", at: 2 });
    const a = t!.after({ x: 0, y: 0 });
    expect(a.layout.items.annotations).toMatchObject({ formKind: "open", edge: "right-0" });
    expect(a.scene.items.annotations!.from).toBeUndefined();
    expect(a.layout.edges["right-0"]!.rect.width).toBeGreaterThan(rail.width);
    // The whole rail takes it: no point along it is refused.
    expect(refusals(s, "annotations").filter((r) => r.edge === "right-0")).toEqual([]);
    expect(t!.hit.y).toBeLessThanOrEqual(rail.y);
    expect(t!.hit.y + t!.hit.height).toBeGreaterThanOrEqual(rail.y + rail.height);
  });

  it("a collapsed panel takes the one place after the last title, and the column stays a rail", () => {
    const s = win("collapsed");
    const rail = solve(s).edges["right-0"]!.rect;
    const [t, ...more] = onRail(s);
    expect(more).toEqual([]);
    const a = t!.after({ x: 0, y: 0 });
    expect(a.scene.items.annotations!.from).toBe(1);
    expect(a.scene.edges.find((e) => e.id === "right-0")!.items.at(-1)).toBe("annotations");
    expect(a.layout.edges["right-0"]!.tabs).toContain("annotations");
    expect(a.layout.edges["right-0"]!.rect.width).toBe(rail.width);
  });

  it("one of the rail's own tiles keeps its gaps, to move among the tiles, and stays collapsed", () => {
    const s = win("open");
    const own = targets(s, "pages").filter((t) => t.place.kind === "gap" && t.place.edge === "right-0");
    expect(own.length).toBeGreaterThan(0);
    const first = own.find((t) => t.place.kind === "gap" && t.place.at === 0)!;
    const a = first.after({ x: 0, y: 0 });
    expect(a.scene.edges.find((e) => e.id === "right-0")!.items).toEqual(["pages", "findings"]);
    expect(a.scene.items.pages!.from).toBe(1);
  });

  describe("on a side with a declared rail", () => {
    /** The window with its `rails`: Findings and Pages folded into the right rail. */
    const railed = (state: "open" | "collapsed"): Scene => ({ ...winScene(WINDOW_A, { size: 300, columns: { left: [["annotations"]], right: [["findings", "pages"]] }, from: { findings: 1, pages: 1, ...(state === "collapsed" ? { annotations: 1 } : {}) } }), foldedColumnDrop: "end" });
    const onSide = (s: Scene) => targets(s, "annotations").filter((t) => (t.place.kind === "rail" && t.place.side === "right") || (t.place.kind === "gap" && t.place.edge === "right-0"));

    it("the rail is one place: an open panel opens the column there, a collapsed one is the last tile", () => {
      const open = railed("open");
      const rail = solve(open).rails.right!.rect;
      const [t, ...more] = onSide(open);
      expect(more).toEqual([]);
      expect(t!.place).toMatchObject({ kind: "gap", edge: "right-0", at: 2 });
      expect(t!.hit.y).toBeLessThanOrEqual(rail.y);
      expect(t!.hit.y + t!.hit.height).toBeGreaterThanOrEqual(rail.y + rail.height);
      const a = t!.after({ x: 0, y: 0 });
      expect(a.layout.items.annotations).toMatchObject({ formKind: "open", edge: "right-0" });
      expect(a.scene.items.annotations!.from).toBeUndefined();
      const [c, ...others] = onSide(railed("collapsed"));
      expect(others).toEqual([]);
      const b = c!.after({ x: 0, y: 0 });
      expect(b.layout.items.annotations!.rail).toBe("right");
      expect(b.scene.items.annotations!.from).toBe(1);
      expect(b.scene.edges.find((e) => e.id === "right-0")!.items.at(-1)).toBe("annotations");
    });

    it("no offered place changes a panel's state, over the generated windows with rails, strips declared or not", () => {
      let places = 0;
      for (let seed = 1; seed <= 90; seed++) {
        for (const flush of [false, true]) {
          const m = modelScene(seed, flush, false, seed % 2 === 0);
          if (!m.rails) continue;
          const panels = Object.keys(m.items).filter((id) => m.items[id]!.kind === "panel" && !m.items[id]!.closed && !m.items[id]!.fixed);
          // As generated, and with every panel of the left side collapsed (its rail shown).
          const left = m.edges.filter((e) => e.side === "left").flatMap((e) => e.items).filter((id) => panels.includes(id));
          const folded: Scene = { ...m, items: { ...m.items, ...Object.fromEntries(left.map((id) => [id, { ...m.items[id]!, from: 1 }])) } };
          for (const base of [m, folded]) {
            const s: Scene = { ...base, foldedColumnDrop: "end" };
            for (const id of panels) {
              const was = s.items[id]!.from ?? 0;
              for (const t of targets(s, id)) {
                places++;
                expect(t.arm, `seed ${seed} ${id} ${t.id}`).toBeUndefined();
                expect(t.after({ x: 100, y: 100 }, { x: 4, y: 4 }).scene.items[id]!.from ?? 0, `seed ${seed} ${id} ${t.id}`).toBe(was);
              }
            }
          }
        }
      }
      expect(places).toBeGreaterThan(500);
    });
  });

  it("without it, or on a column drawn open, the gaps are as they were", () => {
    const { rails: _rails, ...open } = winScene(WINDOW_A, { size: 300 });
    const ids = (s: Scene) => targets(s, "pages").map((t) => t.id).sort();
    expect(ids({ ...open, foldedColumnDrop: "end" })).toEqual(ids(open));
    expect(JSON.stringify(targets({ ...open, foldedColumnDrop: "end" }, "pages").map((t) => [t.id, t.hit, t.hits]))).toBe(JSON.stringify(targets(open, "pages").map((t) => [t.id, t.hit, t.hits])));
    // Undeclared, a rail-drawn column keeps a gap at each position.
    expect(onRail(win("collapsed", false)).length).toBeGreaterThan(1);
  });
});
