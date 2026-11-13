/**
 * The edge-stack pages' sample items: three panels (Pages, Annotations, Findings) and three control groups (Views,
 * Tools, Zoom), each with the forms @n-uf/placement/stack takes for a column and for a row (a bar). Generic sample
 * names; the package carries no words, this page writes them.
 */
import type { Axis, StackForm, StackInput, StackItem } from "@n-uf/placement/stack";

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

const f = (kind: StackForm["kind"], min: number, natural: number, cross: number, grows = false): StackForm => ({
  kind,
  main: { min, natural, ...(grows ? { grows: true } : {}) },
  cross: { natural: cross },
});

/** A bar is 30 px tall when nothing open sets it; a column 30 px wide. */
export const RAIL = 30;
export const BAR_RAIL = 32;
export const MENU = 28;

/** An item's forms along an axis, largest first. `from` skips that many (a panel folded by hand starts at 1). */
export function formsOf(id: ItemId, axis: Axis, from = 0): StackForm[] {
  const s = SAMPLES[id];
  const all: StackForm[] = isPanel(id)
    ? axis === "column"
      ? [f("open", 90, s.natural!.column, s.wide!, true), f("header", 30, 30, 120), f("rail", 26, 26, RAIL), f("menu", 0, 0, 0)]
      : [f("open", 150, s.natural!.row, 120, true), f("header", 110, 110, 28), f("rail", 26, 26, 26), f("menu", 0, 0, 0)]
    : axis === "column"
      ? [f("row", 30, 30, 190), f("stacked", 84, 84, 84), f("icons", 72, 72, 28), f("menu", 0, 0, 0)]
      : [f("row", 200, 200, 28), f("stacked", 140, 140, 30), f("icons", 84, 84, 28), f("menu", 0, 0, 0)];
  return all.slice(from);
}

export interface Placed {
  readonly id: ItemId;
  readonly used: number;
  readonly kept?: boolean;
  /** The first form the user allows (1 for a panel folded by hand). */
  readonly from?: number;
}

export const itemOf = (p: Placed, axis: Axis): StackItem => ({ id: p.id, used: p.used, ...(p.kept ? { kept: true } : {}), forms: formsOf(p.id, axis, p.from ?? 0) });

/** The stack's input along an axis: a column's limits follow the width slider, a bar's are its thickness. */
export function inputOf(axis: Axis, length: number, items: readonly Placed[], width = 360): StackInput {
  return {
    axis,
    length,
    cross: axis === "column" ? { min: 60, max: width, rail: RAIL } : { min: 32, max: 140, rail: BAR_RAIL },
    items: items.map((p) => itemOf(p, axis)),
    menu: { main: MENU },
  };
}
