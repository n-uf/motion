/** @n-uf/placement/panels: tabbed columns and the opt-in height give-way of stack columns. */
import { describe, expect, it } from "vitest";
import { overlap } from "../src/geometry";
import {
  DEFAULT_PANELS_OPTIONS,
  activate,
  createPanels,
  dock,
  homePlace,
  keep,
  layoutPanels,
  liftPanel,
  panelDrop,
  panelTargets,
  readPanels,
  samePlaces,
  showTabs,
  storePanels,
  toggleFold,
  type PanelDef,
  type PanelsState,
} from "../src/panels";
import { keyboardStops } from "../src/targets";

const w = (min: number, natural: number, max: number) => ({ min, natural, max });
const DEFS: PanelDef[] = [
  { id: "files", width: w(180, 220, 360) },
  { id: "outline", width: w(160, 200, 320) },
  { id: "notes", width: w(200, 260, 420) },
  { id: "inspector", width: w(220, 280, 400) },
];
const STAGE = { width: 2000, height: 600 };
const T = DEFAULT_PANELS_OPTIONS.tabs;

/** Files and Outline as tabs on the left, Notes and Inspector stacked on the right. */
const tabbed = (): PanelsState => showTabs(createPanels(DEFS, { left: [["files", "outline"]], right: [["notes", "inspector"]] }), "left", 0, true);

describe("tabbed columns", () => {
  it("draw a strip; the active panel takes the rest, the others are hidden tabs", () => {
    const l = layoutPanels(DEFS, tabbed(), STAGE);
    const col = l.columns.find((c) => c.side === "left")!;
    expect(col).toMatchObject({ show: "tabs", active: "files", strip: { x: 0, y: 0, width: 220, height: T }, folded: null });
    expect(l.items.get("files")).toMatchObject({ rect: { x: 0, y: T, width: 220, height: 600 - T }, kind: "column", hidden: false, tab: { x: 0, y: 0, width: 110, height: T } });
    expect(l.items.get("outline")).toMatchObject({ kind: "column", hidden: true, tab: { x: 110, y: 0, width: 110, height: T } });
    // The strip height is an option.
    expect(layoutPanels(DEFS, tabbed(), STAGE, { tabs: 40 }).items.get("files")!.rect.y).toBe(40);
    // A stack column has no strip and no tabs.
    expect(l.columns.find((c) => c.side === "right")!.strip).toBeUndefined();
    expect(l.items.get("notes")!.tab).toBeUndefined();
  });

  it("activate shows another tab, and is a use", () => {
    const s = activate(tabbed(), "outline");
    expect(s.sides.left[0]!.active).toBe("outline");
    expect(s.clock.outline!.used).toBeGreaterThan(Math.max(...Object.values(tabbed().clock).map((c) => c.used)));
    const l = layoutPanels(DEFS, s, STAGE);
    expect([l.items.get("outline")!.hidden, l.items.get("files")!.hidden]).toEqual([false, true]);
    // An active panel that isn't in the column shows the first.
    const stale = { ...s, sides: { ...s.sides, left: [{ ...s.sides.left[0]!, active: "ghost" }] } };
    expect(layoutPanels(DEFS, stale, STAGE).columns[0]!.active).toBe("files");
    // showTabs off: a stack again.
    expect(layoutPanels(DEFS, showTabs(s, "left", 0, false), STAGE).items.get("outline")).toMatchObject({ hidden: false, rect: { y: 300, height: 300 } });
  });

  it("fold as a whole: the active one folded shows only the strip; all folded go to the rail or ride", () => {
    const s = toggleFold(tabbed(), "files");
    const l = layoutPanels(DEFS, s, STAGE);
    expect(l.items.get("files")).toMatchObject({ kind: "bar", folded: "hand", rect: { x: 0, y: 0, width: 220, height: T } });
    expect(l.items.get("outline")!.hidden).toBe(true);
    expect(l.rails.left).toBeUndefined();
    // A folded tab that isn't showing changes nothing.
    expect(layoutPanels(DEFS, toggleFold(tabbed(), "outline"), STAGE).items.get("files")!.kind).toBe("column");
    const all = toggleFold(s, "outline");
    const r = layoutPanels(DEFS, all, STAGE);
    expect(r.rails.left!.segments.map((x) => x.id)).toEqual(["files", "outline"]);
    // Riding: on the side's first open column.
    const ride = dock(all, "notes", "left", 1);
    const rl = layoutPanels(DEFS, ride, STAGE, { fold: "ride" });
    expect(rl.items.get("files")).toMatchObject({ kind: "bar", rides: 1 });
    expect(rl.items.get("notes")!.rect.y).toBe(2 * DEFAULT_PANELS_OPTIONS.bar);
    // A tabbed host keeps its strip under the riding bars.
    const host = showTabs(dock(toggleFold(createPanels(DEFS, { left: [["files"], ["outline", "notes"]] }), "files"), "outline", "left", 1, {}), "left", 1, true);
    const hl = layoutPanels(DEFS, host, STAGE, { fold: "ride" });
    expect(hl.columns.find((c) => c.index === 1)!.strip).toMatchObject({ y: DEFAULT_PANELS_OPTIONS.bar, height: T });
  });

  it("targets: into a tabbed column adds a tab at the end and shows it; its own place is no target", () => {
    const s = tabbed();
    const inp = { defs: DEFS, state: s, id: "notes", stage: STAGE };
    const ts = panelTargets(inp);
    const into = ts.find((t) => t.id === "into:left:0")!;
    const d = panelDrop(inp, into, { x: 100, y: 300 }, { x: 0, y: 0 });
    expect(d.state.sides.left[0]).toMatchObject({ panels: ["files", "outline", "notes"], show: "tabs", active: "notes" });
    expect(d.slot).toEqual({ x: 0, y: T, width: 220, height: 600 - T });
    expect(d.layout.items.get("notes")!.tab).toMatchObject({ width: 220 / 3 });
    // Outline, the last tab and showing, stacked back into its own column: no change, so no target.
    const own = activate(s, "outline");
    const ids = panelTargets({ defs: DEFS, state: own, id: "outline", stage: STAGE }).map((t) => t.id);
    expect(ids).not.toContain("into:left:0");
    // Keyboard stops work on them unchanged.
    const stops = keyboardStops(ts, { home: { place: homePlace(s, "notes")!, state: s } });
    expect(stops.map((x) => x.id)).toContain("into:left:0");
    expect(samePlaces(stops.find((x) => x.id === "into:left:0")!.state, d.state)).toBe(true);
  });

  it("a panel leaving takes its active mark with it", () => {
    const s = liftPanel(activate(tabbed(), "outline"), "outline");
    expect(s.sides.left[0]).toEqual({ panels: ["files"], width: 220, show: "tabs" });
  });

  it("round-trip show and active through the stored form; a bad active is dropped and listed", () => {
    const s = toggleFold(activate(tabbed(), "outline"), "notes");
    const stored = JSON.parse(JSON.stringify(storePanels(s)));
    expect(stored.sides.left[0]).toEqual({ panels: ["files", "outline"], width: 220, show: "tabs", active: "outline" });
    expect(stored.sides.right[0]).toEqual({ panels: ["notes", "inspector"], width: 280 });
    const r = readPanels(stored, DEFS);
    expect(r.ok && r.dropped).toEqual([]);
    if (!r.ok) return;
    expect(layoutPanels(DEFS, r.state, STAGE).items).toEqual(layoutPanels(DEFS, s, STAGE).items);
    stored.sides.left[0].active = "notes";
    stored.sides.right[0].show = "grid";
    const bad = readPanels(stored, DEFS);
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    expect(bad.dropped).toEqual(expect.arrayContaining(["column.active:notes", "column.show"]));
    expect(bad.state.sides.left[0]).toEqual({ panels: ["files", "outline"], width: 220, show: "tabs" });
    expect(bad.state.sides.right[0]!.show).toBeUndefined();
  });
});

const H_DEFS: PanelDef[] = [
  { id: "files", width: w(180, 220, 360), height: { min: 80, natural: 160 } },
  { id: "outline", width: w(160, 200, 320), height: { min: 80, natural: 200 } },
  { id: "notes", width: w(200, 260, 420), height: { min: 100, natural: 120 } },
  { id: "inspector", width: w(220, 280, 400) },
];
/** One stack of three sections; Files used first, Notes last. */
const stack = (): PanelsState => createPanels(H_DEFS, { left: [["files", "outline", "notes"]] });
const heights = (s: PanelsState, h: number, o = {}) => {
  const l = layoutPanels(H_DEFS, s, { width: 1200, height: h }, o);
  return { l, h: ["files", "outline", "notes"].map((id) => Math.round(l.items.get(id)!.rect.height)), f: ["files", "outline", "notes"].map((id) => l.items.get(id)!.folded) };
};
const B = DEFAULT_PANELS_OPTIONS.bar;

describe("height give-way", () => {
  it("sections get their natural heights; the last open one takes the rest", () => {
    expect(heights(stack(), 600).h).toEqual([160, 200, 240]);
    // A section without a def shares what is left with the last one.
    const mixed = createPanels(H_DEFS, { left: [["files", "inspector", "notes"]] });
    const l = layoutPanels(H_DEFS, mixed, { width: 1200, height: 600 });
    expect(["files", "inspector", "notes"].map((id) => l.items.get(id)!.rect.height)).toEqual([160, 220, 220]);
    // A hand-folded one is a bar; the others keep their rules.
    expect(heights(toggleFold(stack(), "outline"), 600).h).toEqual([160, B, 600 - 160 - B]);
  });

  it("short of room, sections fold to bars in policy order, never the last; natural heights give way to keep the last at its min", () => {
    const t = heights(stack(), 230);
    // Mins 80 + 80 + 100 = 260 > 230: Files (oldest) folds; Outline gives way down to 102 so Notes keeps 100.
    expect(t.f).toEqual(["auto", null, null]);
    expect(t.h).toEqual([B, 230 - B - 100, 100]);
    expect(t.l.notes.filter((n) => n.code === "section-folded")).toEqual([{ code: "section-folded", side: "left", column: 0, items: ["files"] }]);
    // Shorter: Outline too; Notes, the last, never folds.
    expect(heights(stack(), 150).f).toEqual(["auto", "auto", null]);
    // Newest first: Outline goes before Files.
    expect(heights(stack(), 230, { giveWay: { order: "newest", by: "used" } }).f).toEqual([null, "auto", null]);
    // Kept last: Files kept, Outline goes first.
    expect(heights(keep(stack(), "files", true), 230).f).toEqual([null, "auto", null]);
  });

  it("never writes folded: a taller stage unfolds them", () => {
    const s = stack();
    heights(s, 150);
    expect(s.folded).toEqual([]);
    expect(heights(s, 600).f).toEqual([null, null, null]);
  });

  it("columns without height defs behave as before", () => {
    const s = createPanels(DEFS, { left: [["files", "outline", "notes"]] });
    const l = layoutPanels(DEFS, s, { width: 1200, height: 90 });
    expect(["files", "outline", "notes"].map((id) => l.items.get(id)!.rect.height)).toEqual([30, 30, 30]);
    expect(l.notes.filter((n) => n.code === "section-folded")).toEqual([]);
  });

  it("keeps its sections inside the column at many heights", () => {
    for (let h = 120; h <= 900; h += 7) {
      const { l } = heights(stack(), h);
      const rs = ["files", "outline", "notes"].map((id) => l.items.get(id)!.rect);
      expect(rs.reduce((a, r) => a + r.height, 0)).toBeCloseTo(h, 6);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!)).toBe(0);
      expect(l.items.get("notes")!.folded).toBeNull();
      if (h >= 260 + 0) expect(rs[2]!.height).toBeGreaterThanOrEqual(100 - 1e-9);
    }
  });

  it("round-trips through the stored form", () => {
    const s = keep(stack(), "files", true);
    const r = readPanels(JSON.parse(JSON.stringify(storePanels(s))), H_DEFS);
    if (!r.ok) throw new Error(r.error);
    expect(heights(r.state, 230).l.items).toEqual(heights(s, 230).l.items);
  });
});
