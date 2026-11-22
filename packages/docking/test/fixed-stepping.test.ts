/**
 * `DockItem.stepping` (Q1): a fixed item that still takes steps, such as a page readout at a title bar's end. It is never
 * dragged, nothing lands between it and its zone's anchor, and no hit covers it, but it steps through its own
 * `controlLadder` forms and folds into the bar's » like a movable item with the same forms. A plain fixed item is unchanged.
 */
import { controlLadder, type ControlLadderSpec } from "@n-uf/placement/stack";
import { describe, expect, it } from "vitest";
import { readDockState, solve, stops, storeDockState, targets, type DockItem, type DockState } from "../src";
import { doc, form, tweakEdge } from "../src/testing/world";

const spec: ControlLadderSpec = { controls: [{ id: "p", tiers: [70, 40] }, { id: "q", tiers: [40, 20] }], gap: 4, grip: 0, more: 14, cross: 28 };
const { row } = controlLadder(spec);

/** The title bar: the title, the readout (end zone) and the window controls; Zoom, Tools and Views in the toolbar. */
function bar(width: number, readout: Partial<DockItem> = { fixed: true, stepping: true }, forms = row): DockState {
  const s = tweakEdge(doc({ width }), "titlebar", { items: ["title", "readout", "controls"] });
  const it: DockItem = { id: "readout", kind: "group", used: 0.5, align: "end", forms: { row: forms }, ...readout };
  return { ...s, items: { ...s.items, readout: it, title: { ...s.items.title!, forms: { row: [form("row", 80, 160, 32)] } } } };
}
const WIDTHS = [1200, 520, 400, 300, 280, 260, 250, 240, 220, 200];
/** A readout whose last step is the bar's » (no fold of its own). */
const toMenu = [form("row", 114, 114, 28), form("row", 64, 64, 28), form("menu", 0, 0, 0)];
const MENU_WIDTHS = [400, 260, 230, 200, 180];
const shape = (s: DockState, id: string) => {
  const l = solve(s).items[id]!;
  return { form: l.form, formKind: l.formKind, inMenu: !!l.inMenu, rect: l.rect };
};

describe("a fixed item with `stepping`", () => {
  it("steps down its own ladder to its fold as the bar narrows; plain fixed keeps its first form", () => {
    const stepping = WIDTHS.map((w) => shape(bar(w), "readout"));
    const plain = WIDTHS.map((w) => shape(bar(w, { fixed: true }), "readout"));
    expect(plain.every((p) => p.form === 0)).toBe(true);
    expect(stepping[0]!.form).toBe(0);
    expect(stepping.some((p) => p.form > 0 && p.formKind === "row")).toBe(true);
    expect(stepping[stepping.length - 1]!.formKind).toBe("fold");
    for (let k = 1; k < stepping.length; k++) expect(stepping[k]!.form).toBeGreaterThanOrEqual(stepping[k - 1]!.form);
  });

  it("goes into the bar's » when that is its next step", () => {
    const last = shape(bar(MENU_WIDTHS[MENU_WIDTHS.length - 1]!, undefined, toMenu), "readout");
    expect(last.inMenu).toBe(true);
    expect(solve(bar(MENU_WIDTHS[MENU_WIDTHS.length - 1]!, undefined, toMenu)).edges.titlebar!.menu?.items).toContain("readout");
  });

  it("lays out exactly as a movable item with the same forms and age", () => {
    for (const [w, forms] of [...WIDTHS.map((x) => [x, row] as const), ...MENU_WIDTHS.map((x) => [x, toMenu] as const)]) {
      const a = solve(bar(w, undefined, forms));
      const b = solve(bar(w, {}, forms));
      for (const id of ["title", "readout", "controls"]) {
        const { fixed: _a, ...x } = a.items[id]!;
        const { fixed: _b, ...y } = b.items[id]!;
        expect(x, `${id} at ${w}`).toEqual(y);
      }
    }
  });

  it("is never dragged, and nothing lands between it and the bar's end, drawn or in the »", () => {
    for (const [w, forms] of [...WIDTHS.map((x) => [x, row] as const), ...MENU_WIDTHS.map((x) => [x, toMenu] as const)]) {
      const s = bar(w, undefined, forms);
      expect(targets(s, "readout")).toEqual([]);
      const ends = stops(s, "zoom").map((t) => t.id).filter((id) => id.startsWith("gap:titlebar:end"));
      expect(ends.every((id) => id === "gap:titlebar:end:0"), `${w}: ${ends.join(" ")}`).toBe(true);
    }
  });

  it("a drop beside it may step it, but never squeezes it under its least nor moves it off the bar's end", () => {
    const s = bar(460);
    const before = solve(s).items.readout!;
    for (const t of targets(s, "zoom").filter((x) => x.id.startsWith("gap:titlebar"))) {
      const l = t.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
      const r = l.items.readout!;
      if (r.inMenu) continue;
      expect(r.rect.width).toBeGreaterThanOrEqual(row[r.form]!.main.min - 0.5);
      expect(Math.abs(r.rect.x + r.rect.width - (before.rect.x + before.rect.width))).toBeLessThanOrEqual(0.5);
    }
  });

  it("is a declaration: never stored, taken from base", () => {
    const s = bar(900);
    expect(JSON.stringify(storeDockState(s))).not.toContain("stepping");
    expect(readDockState(storeDockState(s), s).state.items.readout!.stepping).toBe(true);
  });
});
