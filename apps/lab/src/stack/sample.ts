/**
 * The edge-stack pages' sample items: three panels (Pages, Annotations, Findings) and three control groups (Views,
 * Tools, Zoom), each with the forms @n-uf/placement/stack takes for a column and for a row (a bar). Generic sample
 * names; the package carries no words, this page writes them.
 */
import type { StackAxis, StackForm, StackInput, StackItem } from "@n-uf/placement/stack";

export type ItemId = "pages" | "annotations" | "findings" | "views" | "tools" | "zoom";
export const PANELS: readonly ItemId[] = ["pages", "annotations", "findings"];
export const GROUPS: readonly ItemId[] = ["views", "tools", "zoom"];
export const ALL: readonly ItemId[] = ["views", "pages", "annotations", "tools", "findings", "zoom"];

export const isPanel = (id: string): boolean => (PANELS as readonly string[]).includes(id);

interface Sample {
  readonly title: string;
  /** The panel's rows or the group's words. */
  readonly words: readonly string[];
  /** Natural size of the open panel along a column, and along a bar. */
  readonly natural?: { readonly column: number; readonly row: number };
  /** The open panel's width in a column. */
  readonly wide?: number;
}

export const SAMPLES: Record<ItemId, Sample> = {
  pages: { title: "Pages", words: ["1. Cover", "2. Scope of work", "3. Budget", "4. Timeline", "5. Sign-off"], natural: { column: 150, row: 220 }, wide: 200 },
  annotations: { title: "Annotations", words: ["Check the Q3 total", "Ask about p. 7", "Redo the chart"], natural: { column: 130, row: 200 }, wide: 240 },
  findings: { title: "Findings", words: ["3 open", "2 resolved", "1 needs review", "Last run 10:42"], natural: { column: 170, row: 240 }, wide: 220 },
  views: { title: "Views", words: ["Page", "Spread", "Scroll"] },
  tools: { title: "Tools", words: ["Select", "Mark", "Note"] },
  zoom: { title: "Zoom", words: ["Fit", "100 %", "Zoom"] },
};
export const titleOf = (id: string): string => SAMPLES[id as ItemId]?.title ?? id;

const f = (kind: StackForm["kind"], min: number, natural: number, cross: number, grows = false, crossMin?: number): StackForm => ({
  kind,
  main: { min, natural, ...(grows ? { grows: true } : {}) },
  cross: { natural: cross, ...(crossMin === undefined ? {} : { min: crossMin }) },
});

/** A bar is 30 px tall when nothing open sets it; a column 30 px wide. */
export const RAIL = 30;
export const BAR_RAIL = 32;
/** A bar is a toolbar edge: nothing can make it taller than this. */
export const BAR_MAX = 40;
export const MENU = 28;

/**
 * A group's icon form along its stack: its grip and one 22 px icon per word. In a column the grip is a horizontal
 * one above the icons (14 px) and each icon takes 26 with its gap; along a bar the grip is a vertical one before
 * them (16 px with the padding). Derived from the words, so a longer group doesn't overflow.
 */
export const iconsMain = (words: number, axis: StackAxis): number => (axis === "column" ? 18 : 16) + 26 * words;

/** An item's forms along an axis, largest first. A header fits any column 56 px wide (its `cross.min`). */
export function formsOf(id: ItemId, axis: StackAxis, badge = false, rowMain?: number): StackForm[] {
  const s = SAMPLES[id];
  const icons = iconsMain(s.words.length, axis);
  // Along a bar a group's row form is a fixed size, or `rowMain`: what the page measured from its words and badge.
  const row = rowMain ?? (badge ? 244 : 200);
  return isPanel(id)
    ? axis === "column"
      ? [f("open", 90, s.natural!.column, s.wide!, true, 100), f("header", 30, 30, s.wide!, false, 56), f("rail", 26, 26, RAIL), f("menu", 0, 0, 0)]
      : // A bar is a toolbar edge: a panel there has no open form, it starts at its header (then a rail icon, then the menu).
        [f("header", 110, 110, 28), f("rail", 26, 26, 26), f("menu", 0, 0, 0)]
    : axis === "column"
      ? [f("row", 30, 30, badge ? 240 : 190), f("stacked", 84, 84, 84), f("icons", icons, icons, 28), f("menu", 0, 0, 0)]
      : [f("row", row, row, 28), f("stacked", 140, 140, 30), f("icons", icons, icons, 28), f("menu", 0, 0, 0)];
}

export interface Placed {
  readonly id: ItemId;
  readonly used: number;
  readonly kept?: boolean;
  /** The first form the user allows (1 for a panel folded by hand). */
  readonly from?: number;
  /** The item shows a count badge (a group's row form then asks for room for it). */
  readonly badge?: boolean;
  /** A group's row form along a bar, measured from its content (instead of the fixed size). */
  readonly rowMain?: number;
}

export const itemOf = (p: Placed, axis: StackAxis): StackItem => ({ id: p.id, used: p.used, ...(p.kept ? { kept: true } : {}), ...(p.from ? { from: p.from } : {}), forms: formsOf(p.id, axis, p.badge, p.rowMain) });

/** An item's state the pages show without ever changing its size: a count badge and a phase. */
export type Phase = "idle" | "busy" | "done";
export const PHASES: readonly Phase[] = ["idle", "busy", "done"];
export interface ItemMeta {
  readonly count: number;
  readonly phase: Phase;
  /** The badge is as wide as its digits and says the whole count (the no-jump control); default a fixed slot, 99+ at most. */
  readonly fluid?: boolean;
}
export const defaultMeta = (): Record<ItemId, ItemMeta> => ({
  pages: { count: 12, phase: "idle" },
  annotations: { count: 3, phase: "idle" },
  findings: { count: 4, phase: "idle" },
  views: { count: 3, phase: "idle" },
  tools: { count: 2, phase: "idle" },
  zoom: { count: 1, phase: "idle" },
});
/** The badge's text: a fixed slot, so the most it says is 99+. */
export const badgeOf = (count: number): string => (count > 99 ? "99+" : String(Math.max(0, Math.floor(count))));

/** The size an item takes when it floats: a panel open, a group as its row of words. */
export const FLOAT_SIZE: Record<ItemId, { readonly width: number; readonly height: number }> = {
  pages: { width: 200, height: 170 },
  annotations: { width: 240, height: 150 },
  findings: { width: 220, height: 190 },
  views: { width: 244, height: 34 },
  tools: { width: 244, height: 34 },
  zoom: { width: 244, height: 34 },
};

/** The stack's input along an axis: a column's limits follow the width slider, a bar's are its thickness. */
export function inputOf(axis: StackAxis,length: number, items: readonly Placed[], width = 360): StackInput {
  return {
    axis,
    length,
    cross: axis === "column" ? { min: 60, max: width, rail: RAIL } : { min: 32, max: BAR_MAX, rail: BAR_RAIL },
    items: items.map((p) => itemOf(p, axis)),
    menu: { main: MENU },
  };
}
