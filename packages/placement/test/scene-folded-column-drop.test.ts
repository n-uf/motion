/** `Scene.foldedColumnDrop: "end"`: a column drawn as a rail is one drop place, and the item keeps its state. */
import { describe, expect, it } from "vitest";
import { heldRect, refusals, solve, targets, type Scene } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";

/** Annotations on the left, Pages and Findings collapsed on the right (a rail of title tiles); `state` for Annotations. */
const win = (state: "open" | "collapsed", declared = true): Scene => {
  // No declared side rail: the column itself draws as the rail.
  const { rails: _rails, ...s } = winScene(WINDOW_A, { size: 300, columns: { left: [["annotations"]], right: [["findings", "pages"]] }, from: { findings: 1, pages: 1, ...(state === "collapsed" ? { annotations: 1 } : {}) } });
  return declared ? { ...s, foldedColumnDrop: "end" } : s;
};
const onRail = (s: Scene) => targets(s, "annotations").filter((t) => t.place.kind === "gap" && t.place.edge === "right-0");

describe("heldRect", () => {
  const stage = { x: 0, y: 0, width: 1000, height: 600 };
  const size = { width: 200, height: 40 };
  const grab = { x: 20, y: 10 };
  it("keeps the grip under the pointer where the item fits, and the item wholly inside the stage at every edge", () => {
    expect(heldRect(stage, size, { x: 500, y: 300 }, grab)).toEqual({ x: 480, y: 290, width: 200, height: 40 });
    expect(heldRect(stage, size, { x: 1040, y: 300 }, grab).x).toBe(800);
    expect(heldRect(stage, size, { x: -40, y: 300 }, grab).x).toBe(0);
    expect(heldRect(stage, size, { x: 500, y: 640 }, grab).y).toBe(560);
    expect(heldRect(stage, size, { x: 500, y: -40 }, grab).y).toBe(0);
  });
  it("is the rect the float target lands, clear of everything", () => {
    const s = win("open");
    const float = targets(s, "annotations").find((t) => t.place.kind === "float")!;
    const p = { x: 560, y: 400 };
    const g = { x: 10, y: 8 };
    const landed = float.after(p, g).layout.items.annotations!.rect;
    expect(landed).toEqual(heldRect(s.stage, landed, p, g));
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

  it("without it, or on a column drawn open, the gaps are as they were", () => {
    const open = winScene(WINDOW_A, { size: 300 });
    const ids = (s: Scene) => targets(s, "pages").map((t) => t.id).sort();
    expect(ids({ ...open, foldedColumnDrop: "end" })).toEqual(ids(open));
    expect(JSON.stringify(targets({ ...open, foldedColumnDrop: "end" }, "pages").map((t) => [t.id, t.hit, t.hits]))).toBe(JSON.stringify(targets(open, "pages").map((t) => [t.id, t.hit, t.hits])));
    // Undeclared, a rail-drawn column keeps a gap at each position.
    expect(onRail(win("collapsed", false)).length).toBeGreaterThan(1);
  });
});
