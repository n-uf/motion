/**
 * The edge stack's shapes. A stack is the items along one edge of a stage: a column (vertical, a side region) or a
 * row (horizontal, a bar). An item is a panel or a control group; it declares its forms, largest first, and the
 * solver (`fitStack`) picks one per item. Plain data in and out: no words, no time, no DOM.
 */
import type { Rect } from "../geometry";

/** `"column"` runs the stack down (its main size is a height, its cross size a width); `"row"` runs it across. */
export type Axis = "column" | "row";

/** How a panel draws: open (header and body), a header only, a rail icon, or an entry in the » menu. */
export type PanelFormKind = "open" | "header" | "rail" | "menu";
/** How a control group draws: a row of words, the words stacked, icons only, or an entry in the » menu. */
export type GroupFormKind = "row" | "stacked" | "icons" | "menu";
export type StackFormKind = PanelFormKind | GroupFormKind;

/** Along the stack: `min` is the least it can be drawn, `natural` what it asks for; `grows` takes spare length. */
export interface MainSize {
  readonly min: number;
  readonly natural: number;
  readonly grows?: boolean;
}

/** One way to draw an item. A `menu` form takes no room in the stack (the » entry stands for it). */
export interface StackForm {
  readonly kind: StackFormKind;
  readonly main: MainSize;
  /** The size across the stack this form asks for. */
  readonly cross: { readonly natural: number };
  /**
   * Whether this form sets the stack's cross size (the column's width, the bar's height). Default: true for a
   * panel's `open`, false for everything else (a group never sets a column's width).
   */
  readonly setsCross?: boolean;
}

export interface StackItem {
  readonly id: string;
  /** Largest first. The solver starts at the first and steps down one at a time. */
  readonly forms: readonly StackForm[];
  /** How recently it was used: the smaller, the longer ago, the sooner it gives way. */
  readonly used: number;
  /** Kept: gives way after every item that isn't. */
  readonly kept?: boolean;
}

/** The cross size a stack may take. With no form setting it, the stack is a `rail` wide (default {@link DEFAULT_RAIL}). */
export interface CrossLimits {
  readonly min: number;
  readonly max: number;
  readonly rail?: number;
}

export interface StackInput {
  readonly axis: Axis;
  /** The stack's length along the axis. */
  readonly length: number;
  readonly cross: CrossLimits;
  /** In order, from the start of the stack. */
  readonly items: readonly StackItem[];
  /** The » menu entry's size along the stack, taken only while an item is in the menu (default {@link DEFAULT_MENU}). */
  readonly menu?: { readonly main: number };
}

/** The width of a stack nothing open holds, px. */
export const DEFAULT_RAIL = 30;
/** The » menu entry's size along the stack, px. */
export const DEFAULT_MENU = 28;

export const railOf = (input: StackInput): number => input.cross.rail ?? DEFAULT_RAIL;
export const menuMain = (input: StackInput): number => input.menu?.main ?? DEFAULT_MENU;

/** Whether a form sets the stack's cross size: its own say, else true for a panel's `open`. */
export const setsCross = (f: StackForm): boolean => f.setsCross ?? f.kind === "open";

/** `input` with `item` inserted at index `at` (clamped to the items' range). */
export function withItem(input: StackInput, item: StackItem, at: number): StackInput {
  const k = Math.min(Math.max(0, Math.floor(at)), input.items.length);
  return { ...input, items: [...input.items.slice(0, k), item, ...input.items.slice(k)] };
}

/** An item drawn: the form it took, its kind and its rect (stack-local px). One in the menu has the menu entry's rect. */
export interface PlacedStackItem {
  readonly id: string;
  /** Index into the item's `forms`. */
  readonly form: number;
  readonly kind: StackFormKind;
  readonly rect: Rect;
}

export interface StackMenu {
  /** The » entry's rect. */
  readonly rect: Rect;
  /** The items in it, in the stack's order. */
  readonly items: readonly string[];
}

/**
 * Why a stack looks as it does:
 * - `form-down`: an item took a smaller form than its first (`from` 0 is the largest), by length or by cross size.
 * - `to-menu`: an item is in the » menu.
 * - `overflow`: every item is at its last form and the stack is still `over` px too long (a form list that doesn't
 *   end in a `menu` form can't give more way).
 */
export type StackNote =
  | { readonly code: "form-down"; readonly id: string; readonly from: number; readonly to: number }
  | { readonly code: "to-menu"; readonly id: string }
  | { readonly code: "overflow"; readonly over: number };
export type StackNoteCode = StackNote["code"];

export interface StackFit {
  readonly axis: Axis;
  readonly length: number;
  /** The stack's size across: the widest `open` (clamped to the limits), or the rail. */
  readonly cross: number;
  /** One per input item, in order. */
  readonly items: readonly PlacedStackItem[];
  /** The » entry, or null while no item is in the menu. */
  readonly menu: StackMenu | null;
  /** In the order the items gave way: `form-down` per item, then `to-menu`, then `overflow`. */
  readonly notes: readonly StackNote[];
}
