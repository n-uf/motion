/**
 * `SceneItem.pushable`: a fixed item that declares a movable item dropped after it may push it inward along its zone.
 * Without it a fixed item at a zone's anchor (window controls at a bar's end) keeps its place, so no gap after it is
 * a stop; with it the gap after the run is a stop, the item keeps its order among the fixed items, and the flag is a
 * declaration of the scene (read from `base`, never stored).
 */
import { describe, expect, it } from "vitest";
import { moveTo, readScene, solve, stops, storeScene, targets, use, type Scene, type SceneItem } from "../src/scene";
import { doc, form, tweakEdge } from "../src/scene/cases/world";

/** The title bar's end zone as `end` lists it, with `pushable` on the readouts named in `flagged`; Zoom and Tools are in the toolbar. */
function bar(end: readonly string[], flagged: readonly string[], toolbar: readonly string[] = ["views", "tools", "zoom"]): Scene {
  const s = tweakEdge(tweakEdge(doc(), "titlebar", { items: ["title", ...end] }), "toolbar", { items: [...toolbar] });
  const readout = (id: string, w: number): SceneItem => ({ id, kind: "readout", used: 0, fixed: true, align: "end", ...(flagged.includes(id) ? { pushable: true } : {}), forms: { row: [form("row", w, w, 28)] } });
  return { ...s, items: { ...s.items, state: readout("state", 96), page: readout("page", 42) } };
}
const ids = (s: Scene, item: string): string[] => stops(s, item).map((t) => t.id);

describe("pushable fixed items at a zone's anchor", () => {
  it("offers the gap after the pushable run, and a drop there puts the item after them, the readouts pushed inward", () => {
    const s = bar(["state", "page"], ["state", "page"]);
    expect(ids(s, "zoom").filter((i) => i.startsWith("gap:titlebar:end"))).toEqual(["gap:titlebar:end:0", "gap:titlebar:end:2"]);
    const stop = stops(s, "zoom").find((t) => t.id === "gap:titlebar:end:2")!;
    const after = stop.after({ x: 0, y: 0 }, { x: 0, y: 0 }).scene;
    const l = solve(after);
    expect(after.edges.find((e) => e.id === "titlebar")!.items).toEqual(["title", "state", "page", "zoom"]);
    expect([l.items.state!.rect.x, l.items.page!.rect.x, l.items.zoom!.rect.x]).toEqual([862, 958, 1000]);
    // The stop is the landing `solve` gives `moveTo`, not something the stop adds.
    expect(solve(use(moveTo(s, "zoom", { kind: "gap", edge: "titlebar", zone: "end", at: 2 }), "zoom")).items.state!.rect).toEqual(l.items.state!.rect);
  });

  it("is a drop target too: the hit lies over the stretch after the readouts", () => {
    const s = bar(["state", "page"], ["state", "page"]);
    expect(targets(s, "zoom").some((t) => t.id === "gap:titlebar:end:2")).toBe(true);
  });

  it("keeps the readouts' order: no gap between two pushable items", () => {
    const s = bar(["state", "page"], ["state", "page"]);
    expect(ids(s, "zoom")).not.toContain("gap:titlebar:end:1");
  });

  it("without the flag nothing changes: no gap after fixed items at the bar's end", () => {
    const s = bar(["state", "page"], []);
    expect(ids(s, "zoom").filter((i) => i.startsWith("gap:titlebar:end"))).toEqual(["gap:titlebar:end:0"]);
  });

  it("window controls without the flag keep the bar's end: no gap after them", () => {
    const s = doc();
    expect(ids(s, "tools").filter((i) => i.startsWith("gap:titlebar:end"))).toEqual(["gap:titlebar:end:0"]);
    expect(targets(s, "tools").some((t) => t.id === "gap:titlebar:end:1")).toBe(false);
  });

  it("only the flagged ones yield: Page flagged, State not, and nothing lands after them", () => {
    const s = bar(["state", "page"], ["page"]);
    expect(ids(s, "zoom").filter((i) => i.startsWith("gap:titlebar:end"))).toEqual(["gap:titlebar:end:0"]);
  });

  it("a flagged readout followed by unflagged window controls: the place between them stays wedged, no stop", () => {
    // Two fixed items touching are a wedge no pointer can aim at (a drop there would push them apart unseen), and `pushable`
    // doesn't change that: only the gap at the end of the run of fixed items is a place.
    const s0 = bar(["state", "page"], ["state", "page"]);
    const s: Scene = { ...s0, edges: s0.edges.map((e) => (e.id === "titlebar" ? { ...e, items: ["title", "state", "page", "controls"] } : e)) };
    expect(ids(s, "zoom").filter((i) => i.startsWith("gap:titlebar:end"))).toEqual(["gap:titlebar:end:0"]);
  });

  it("the item's own place is still home, not a second stop", () => {
    const s = bar(["state", "page", "zoom"], ["state", "page"], ["views", "tools"]);
    expect(ids(s, "zoom").filter((i) => i.startsWith("gap:titlebar:end"))).toEqual(["gap:titlebar:end:0"]);
  });
});

describe("pushable is a declaration, not state", () => {
  it("is never stored, and readScene takes it from base", () => {
    const s = bar(["state", "page"], ["state", "page"]);
    const stored = storeScene(s);
    expect(JSON.stringify(stored)).not.toContain("pushable");
    const back = readScene(stored, s);
    expect(back.scene.items.state!.pushable).toBe(true);
    // Not in base: a stored claim of it is dropped, as every undeclared field is.
    const plain = bar(["state", "page"], []);
    const forged = JSON.parse(JSON.stringify(stored));
    forged.items.state.pushable = true;
    const read = readScene(forged, plain);
    expect(read.scene.items.state!.pushable).toBeUndefined();
    expect(read.dropped).toContain("item:state:pushable");
    expect(ids(read.scene, "zoom").filter((i) => i.startsWith("gap:titlebar:end"))).toEqual(["gap:titlebar:end:0"]);
  });
});
