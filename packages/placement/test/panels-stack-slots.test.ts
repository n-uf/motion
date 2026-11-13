/** @n-uf/placement/panels: dropping into a stacked column before a given member (`DockOptions.at`, `stackSlots`). */
import { describe, expect, it } from "vitest";
import { overlap } from "../src/geometry";
import { PRESETS, presetTargets } from "../src/desk";
import { close, createPanels, dock, homePlace, panelDrop, panelTargets, placeRank, showTabs, type PanelDef, type PanelsState } from "../src/panels";
import { keyboardStops } from "../src/targets";

const w = (min: number, natural: number, max: number) => ({ min, natural, max });
const DEFS: PanelDef[] = [
  { id: "files", width: w(180, 220, 360) },
  { id: "outline", width: w(160, 200, 320) },
  { id: "notes", width: w(200, 260, 420) },
  { id: "inspector", width: w(220, 280, 400) },
  { id: "search", width: w(200, 240, 360) },
];
const STAGE = { width: 1400, height: 800 };

/** Left: one stacked column Files / Outline / Notes; right: Inspector and Search in their own columns. */
const stacked = (): PanelsState => createPanels(DEFS, { left: [["files", "outline", "notes"]], right: [["inspector"], ["search"]] });
const input = (id: string, state = stacked(), more = {}) => ({ defs: DEFS, state, id, stage: STAGE, ...more });

describe("dock into a column at a position", () => {
  it("puts the panel before the member `at`, counted with the panel lifted out", () => {
    const s = stacked();
    expect(dock(s, "inspector", "left", 0, { into: true, at: 0 }).sides.left[0]!.panels).toEqual(["inspector", "files", "outline", "notes"]);
    expect(dock(s, "inspector", "left", 0, { into: true, at: 2 }).sides.left[0]!.panels).toEqual(["files", "outline", "inspector", "notes"]);
    // Within its own column: Notes lifted out leaves Files, Outline; before 0 is the top.
    expect(dock(s, "notes", "left", 0, { into: true, at: 0 }).sides.left[0]!.panels).toEqual(["notes", "files", "outline"]);
  });

  it("clamps `at` and falls back to the bottom", () => {
    const s = stacked();
    const bottom = ["files", "outline", "notes", "inspector"];
    expect(dock(s, "inspector", "left", 0, { into: true }).sides.left[0]!.panels).toEqual(bottom);
    expect(dock(s, "inspector", "left", 0, { into: true, at: 99 }).sides.left[0]!.panels).toEqual(bottom);
    expect(dock(s, "inspector", "left", 0, { into: true, at: Number.NaN }).sides.left[0]!.panels).toEqual(bottom);
    expect(dock(s, "inspector", "left", 0, { into: true, at: -3 }).sides.left[0]!.panels[0]).toBe("inspector");
    expect(dock(s, "inspector", "left", 0, { into: true, at: -Infinity }).sides.left[0]!.panels[0]).toBe("inspector");
    expect(dock(s, "inspector", "left", 0, { into: true, at: Infinity }).sides.left[0]!.panels).toEqual(bottom);
    expect(dock(s, "inspector", "left", 0, { into: true, at: 1.7 }).sides.left[0]!.panels).toEqual(["files", "inspector", "outline", "notes"]);
    // `at` without `into` is ignored: a new column.
    expect(dock(s, "inspector", "left", 0, { at: 0 }).sides.left.map((c) => c.panels)).toEqual([["inspector"], ["files", "outline", "notes"]]);
  });

  it("into a tabbed column: a tab at that position, and the one showing", () => {
    const s = dock(showTabs(stacked(), "left", 0, true), "inspector", "left", 0, { into: true, at: 1 });
    expect(s.sides.left[0]).toMatchObject({ panels: ["files", "inspector", "outline", "notes"], active: "inspector" });
  });
});

describe("stackSlots targets", () => {
  it("are off by default: the targets are exactly as before", () => {
    for (const id of ["files", "notes", "inspector", "search"]) {
      const plain = panelTargets(input(id));
      expect(plain.some((t) => t.place.kind === "into" && t.place.at !== undefined)).toBe(false);
      expect(plain.some((t) => t.marker)).toBe(false);
      expect(panelTargets(input(id, stacked(), { stackSlots: false })).map((t) => [t.id, t.hit])).toEqual(plain.map((t) => [t.id, t.hit]));
    }
  });

  it("offer a slot before each member, split at the members' middles, and keep the bottom", () => {
    const ts = panelTargets(input("search", stacked(), { stackSlots: true }));
    const into = ts.filter((t) => t.id.startsWith("into:left:0"));
    expect(into.map((t) => t.id)).toEqual(["into:left:0:0", "into:left:0:1", "into:left:0:2", "into:left:0"]);
    const col = panelTargets(input("search")).find((t) => t.id === "into:left:0")!.hit;
    // Together they tile the column's area, top to bottom, without overlaps.
    expect(into[0]!.hit.y).toBe(col.y);
    expect(into.at(-1)!.hit.y + into.at(-1)!.hit.height).toBeCloseTo(col.y + col.height);
    for (let i = 1; i < into.length; i++) {
      expect(into[i]!.hit.y).toBeCloseTo(into[i - 1]!.hit.y + into[i - 1]!.hit.height);
      expect(overlap(into[i]!.hit, into[i - 1]!.hit)).toBeCloseTo(0);
    }
    for (const t of into) {
      expect([t.hit.x, t.hit.width]).toEqual([col.x, col.width]);
      expect(t.marker).toMatchObject({ x: col.x, width: col.width, height: 0 });
      expect(t.marker!.y).toBeGreaterThanOrEqual(col.y);
      expect(t.marker!.y).toBeLessThanOrEqual(col.y + col.height);
    }
    // The markers go down the column, one line per slot.
    const ys = into.map((t) => t.marker!.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(new Set(ys).size).toBe(ys.length);
    // Reading order: the slots top to bottom, then the bottom, between the column's lines.
    expect(into.map((t) => t.order)).toEqual([...into.map((t) => t.order)].sort((a, b) => a - b));
    expect(placeRank({ kind: "into", side: "left", index: 0, at: 0 })).toBeGreaterThan(placeRank({ kind: "column", side: "left", index: 0 }));
    expect(placeRank({ kind: "into", side: "right", index: 0, at: 3 })).toBeLessThan(placeRank({ kind: "into", side: "right", index: 0 }));
    expect(placeRank({ kind: "into", side: "right", index: 0, at: 0 })).toBeGreaterThan(placeRank({ kind: "column", side: "right", index: 1 }));
  });

  it("leave out the panel's own place within its column", () => {
    // Notes is last: lifted, the bottom is its own place.
    expect(panelTargets(input("notes", stacked(), { stackSlots: true })).filter((t) => t.id.startsWith("into:left:0")).map((t) => t.id)).toEqual(["into:left:0:0", "into:left:0:1"]);
    // Files is first: before Outline (now member 0) is its own place.
    expect(panelTargets(input("files", stacked(), { stackSlots: true })).filter((t) => t.id.startsWith("into:left:0")).map((t) => t.id)).toEqual(["into:left:0:1", "into:left:0"]);
  });

  it("drop where the marker showed: Notes back above Files", () => {
    const inp = input("notes", stacked(), { stackSlots: true });
    const t = panelTargets(inp).find((x) => x.id === "into:left:0:0")!;
    expect(t.place).toEqual({ kind: "into", side: "left", index: 0, at: 0 });
    const d = panelDrop(inp, t, { x: t.hit.x + 10, y: t.hit.y + 10 }, { x: 0, y: 0 });
    expect(d.state.sides.left[0]!.panels).toEqual(["notes", "files", "outline"]);
    expect(d.slot).toEqual(d.layout.items.get("notes")!.rect);
    expect(d.slot.y).toBeCloseTo(t.marker!.y);
  });

  it("put every marker where the panel's top lands, with and without height defs", () => {
    const tall: PanelDef[] = DEFS.map((d) => ({ ...d, height: { min: 80, natural: 180 } }));
    for (const defs of [DEFS, tall]) {
      const inp = { defs, state: createPanels(defs, { left: [["files", "outline", "notes"]], right: [["inspector"], ["search"]] }), id: "search", stage: STAGE, stackSlots: true };
      const into = panelTargets(inp).filter((t) => t.id.startsWith("into:left:0"));
      expect(into).toHaveLength(4);
      for (const t of into) expect(t.marker!.y).toBeCloseTo(panelDrop(inp, t, { x: t.hit.x + 5, y: t.hit.y + 5 }, { x: 0, y: 0 }).slot.y);
    }
  });

  it("keep their slots with a closed member, and the drop keeps it in its place", () => {
    const s = close(stacked(), "outline"); // Files, (Outline closed), Notes
    const inp = input("search", s, { stackSlots: true });
    const ids = panelTargets(inp).filter((t) => t.id.startsWith("into:left:0")).map((t) => t.id);
    // Slots before the members shown, by their index in the column's list (Notes is 2).
    expect(ids).toEqual(["into:left:0:0", "into:left:0:2", "into:left:0"]);
    const t = panelTargets(inp).find((x) => x.id === "into:left:0:2")!;
    expect(panelDrop(inp, t, { x: t.hit.x + 5, y: t.hit.y + 5 }, { x: 0, y: 0 }).state.sides.left[0]!.panels).toEqual(["files", "outline", "search", "notes"]);
  });

  it("leave a tabbed column with its one `into` target", () => {
    const s = showTabs(stacked(), "left", 0, true);
    const ids = panelTargets(input("search", s, { stackSlots: true })).filter((t) => t.id.startsWith("into:left:0")).map((t) => t.id);
    expect(ids).toEqual(["into:left:0"]);
    expect(homePlace(s, "outline", { stackSlots: true })).toEqual({ kind: "into", side: "left", index: 0 });
  });

  it("homePlace says the position, and the keyboard stops put home among the slots", () => {
    const s = stacked();
    expect(homePlace(s, "outline")).toEqual({ kind: "into", side: "left", index: 0 });
    const home = homePlace(s, "outline", { stackSlots: true })!;
    expect(home).toEqual({ kind: "into", side: "left", index: 0, at: 1 });
    const ts = panelTargets(input("outline", s, { stackSlots: true }));
    const ids = keyboardStops(ts, { home: { place: home, state: s } }).map((x) => x.id);
    expect(ids.slice(ids.indexOf("into:left:0:0"), ids.indexOf("into:left:0") + 1)).toEqual(["into:left:0:0", "home", "into:left:0"]);
  });

  it("pass through the desk presets", () => {
    const s = createPanels(DEFS, { left: [["files", "outline"]], right: [["inspector"]] });
    const ids = presetTargets(PRESETS.docks, { defs: DEFS, state: s, id: "inspector", stage: STAGE, stackSlots: true }).map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["into:left:0:0", "into:left:0:1", "into:left:0"]));
  });
});
