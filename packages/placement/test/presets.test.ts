/** @n-uf/placement/desk: the presets as data on ./panels. */
import { describe, expect, it } from "vitest";
import { overlap } from "../src/geometry";
import { PRESETS, presetDrop, presetInput, presetLayout, presetTargets, type PresetId } from "../src/desk";
import { readPanels, storePanels, whereIs, type PanelDef } from "../src/panels";

const w = (min: number, natural: number, max: number) => ({ min, natural, max });
const h = (min: number, natural: number) => ({ min, natural });
const DEFS: PanelDef[] = [
  { id: "files", width: w(200, 240, 360), height: h(80, 160) },
  { id: "outline", width: w(200, 240, 360), height: h(80, 200) },
  { id: "notes", width: w(200, 240, 360), height: h(100, 140) },
  { id: "inspector", width: w(200, 240, 360), height: h(100, 180), sides: ["right"] },
  { id: "history", width: w(200, 240, 360), height: h(80, 160), float: { min: { width: 200, height: 160 }, natural: { width: 240, height: 260 } } },
];
const IDS: PresetId[] = ["docks", "dockTear", "navigator"];
const STAGE = { width: 1400, height: 700 };

describe("presets", () => {
  it("are data: an id, panels options and a start", () => {
    expect(Object.keys(PRESETS).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const p = PRESETS[id];
      expect(p.id).toBe(id);
      expect(JSON.parse(JSON.stringify(p.options))).toEqual(p.options);
    }
  });

  it("docks: one stack column per side, and no float target", () => {
    const s = PRESETS.docks.start(DEFS);
    expect(s.sides.left.map((c) => c.panels)).toEqual([["files", "outline", "notes"]]);
    expect(s.sides.right.map((c) => c.panels)).toEqual([["inspector", "history"]]);
    expect(s.floats).toEqual([]);
    const l = presetLayout(PRESETS.docks, DEFS, s, STAGE);
    // Natural heights; the last section takes the rest.
    expect(["files", "outline", "notes"].map((id) => l.items.get(id)!.rect.height)).toEqual([160, 200, 340]);
    const ids = presetTargets(PRESETS.docks, { defs: DEFS, state: s, id: "files", stage: STAGE }).map((t) => t.id);
    expect(ids).not.toContain("float");
    // The hint puts panels where it says; a panel's sides still hold.
    const hinted = PRESETS.docks.start(DEFS, { right: ["files"], left: ["inspector"] });
    expect(whereIs(hinted, "files")).toMatchObject({ side: "right" });
    expect(hinted.sides.left[0]!.panels[0]).toBe("inspector");
  });

  it("dockTear: one float to start; tear-off and dock-back", () => {
    const s = PRESETS.dockTear.start(DEFS);
    expect(s.floats.map((f) => f.id)).toEqual(["history"]);
    expect(s.floats[0]!.rect).toEqual({ x: 240 + 24, y: 24, width: 240, height: 260 });
    const inp = { defs: DEFS, state: s, id: "files", stage: STAGE };
    const ts = presetTargets(PRESETS.dockTear, inp);
    const fl = ts.find((t) => t.id === "float")!;
    const torn = presetDrop(PRESETS.dockTear, inp, fl, { x: 700, y: 300 }, { x: 20, y: 10 });
    expect(torn.slot).toMatchObject({ x: 680, y: 290 });
    expect(whereIs(torn.state, "files").kind).toBe("float");
    // Back onto the left side's column.
    const back = { defs: DEFS, state: torn.state, id: "files", stage: STAGE };
    const into = presetTargets(PRESETS.dockTear, back).find((t) => t.id === "into:left:0")!;
    const docked = presetDrop(PRESETS.dockTear, back, into, { x: 100, y: 300 }, { x: 0, y: 0 });
    expect(whereIs(docked.state, "files")).toMatchObject({ kind: "column", side: "left", index: 0 });
  });

  it("navigator: a tabbed left column, a stack right column; a drop into the left adds a tab", () => {
    const s = PRESETS.navigator.start(DEFS);
    expect(s.sides.left[0]!.show).toBe("tabs");
    expect(s.sides.right[0]!.show).toBeUndefined();
    const l = presetLayout(PRESETS.navigator, DEFS, s, STAGE);
    expect(l.columns[0]!.strip).toBeDefined();
    expect(["files", "outline", "notes"].map((id) => l.items.get(id)!.hidden)).toEqual([false, true, true]);
    const inp = { defs: DEFS, state: s, id: "history", stage: STAGE };
    const into = presetTargets(PRESETS.navigator, inp).find((t) => t.id === "into:left:0")!;
    const d = presetDrop(PRESETS.navigator, inp, into, { x: 100, y: 300 }, { x: 0, y: 0 });
    expect(d.state.sides.left[0]).toMatchObject({ panels: ["files", "outline", "notes", "history"], active: "history" });
    expect(d.layout.items.get("history")!.hidden).toBe(false);
    expect(presetTargets(PRESETS.navigator, inp).some((t) => t.id === "float")).toBe(false);
  });

  it("the caller's options go over the preset's", () => {
    const s = PRESETS.docks.start(DEFS);
    expect(presetLayout(PRESETS.docks, DEFS, s, STAGE, { tabs: 40, pagesMin: 500 }).pages.width).toBeGreaterThanOrEqual(500);
    expect(presetInput(PRESETS.docks, { defs: DEFS, state: s, id: "files", stage: STAGE, options: { fold: "ride" } }).options).toMatchObject({ fold: "ride" });
    // The caller's allows still narrows: no rails at all.
    const ids = presetTargets(PRESETS.dockTear, { defs: DEFS, state: s, id: "files", stage: STAGE, allows: (_id, p) => p.kind !== "rail" }).map((t) => t.id);
    expect(ids.some((x) => x.startsWith("rail:"))).toBe(false);
    expect(ids).toContain("float");
  });

  it("lay out without overlaps at many stage sizes, and round-trip through the stored form", () => {
    for (const id of IDS) {
      const p = PRESETS[id];
      const s = p.start(DEFS);
      for (let W = 2 * 36 + 320; W <= 1800; W += 61) {
        for (const H of [180, 320, 700]) {
          const l = presetLayout(p, DEFS, s, { width: W, height: H });
          const rs = [...l.columns.filter((c) => c.folded === null).map((c) => c.rect), ...Object.values(l.rails).map((r) => r!.rect), l.pages];
          for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!)).toBeLessThan(1e-6);
          const shown = [...l.items].filter(([, x]) => !x.hidden && !x.floating && x.kind !== "segment").map(([, x]) => x.rect);
          for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) expect(overlap(shown[i]!, shown[j]!)).toBeLessThan(1e-6);
          expect(l.pages.width).toBeGreaterThanOrEqual(320 - 1e-9);
        }
      }
      const r = readPanels(JSON.parse(JSON.stringify(storePanels(s))), DEFS);
      expect(r.ok && r.dropped).toEqual([]);
      if (r.ok) expect(presetLayout(p, DEFS, r.state, STAGE).items).toEqual(presetLayout(p, DEFS, s, STAGE).items);
    }
  });
});
