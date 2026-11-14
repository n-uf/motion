/**
 * A verbatim copy of src/stack/model.ts at release 26.11.13 (only the import path below is changed), kept so a test can
 * compare today's solver with that release's. Do not edit.
 *
 * The edge stack's shapes. A stack is the items along one edge of a stage: a column (vertical, a side region) or a
 * row (horizontal, a bar). An item is a panel or a control group; it declares its forms, largest first, and the
 * solver (`fitStack`) picks one per item. Plain data in and out: no words, no time, no DOM.
 *
 * The form kinds are structural labels the app draws by; the solver reads only `menu` (a form with no room of its own)
 * and, for the cross size, `open`. Panel and group kinds may be mixed on one item.
 */
import type { Rect } from "../../src/geometry";

/** `"column"` runs the stack down (its main size is a height, its cross size a width); `"row"` runs it across. */
export type StackAxis = "column" | "row";

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
  /**
   * Across the stack: `natural` is what this form asks for (it sets the stack's cross size when `setsCross`); `min`
   * is the least it can be drawn across (default `natural`). A form that doesn't set the cross size takes its next
   * form only when its `min` is over the stack's cross size, so a header stays in a column an open panel made
   * narrow when it has a small `min`.
   */
  readonly cross: { readonly natural: number; readonly min?: number };
  /**
   * Whether this form sets the stack's cross size (the column's width, the bar's height). Default: true for a
   * panel's `open`, false for everything else (a group never sets a column's width).
   */
  readonly setsCross?: boolean;
}

export interface StackItem {
  readonly id: string;
  /** Largest first. The solver starts at `from` and steps down one at a time. An item with none is left out. */
  readonly forms: readonly StackForm[];
  /** How recently it was used: the smaller, the longer ago, the sooner it gives way. */
  readonly used: number;
  /** Kept: gives way after every item that isn't. */
  readonly kept?: boolean;
  /**
   * The first form the item may take, an index into `forms` (default 0; a panel folded by hand starts at its header).
   * The solver never goes above it. `form` in the result and in the notes are indexes into `forms`, not into what is
   * left after `from`.
   */
  readonly from?: number;
}

/** The cross size a stack may take. With no form setting it, the stack is a `rail` wide (default {@link DEFAULT_RAIL}). */
export interface CrossLimits {
  readonly min: number;
  readonly max: number;
  readonly rail?: number;
}

export interface StackInput {
  readonly axis: StackAxis;
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

const finite = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback);

/**
 * The cross limits with a non-number replaced: `min` and `rail` that aren't finite become 0 and the default rail, a
 * `max` that is NaN becomes no limit (Infinity is one already), and `max` is never under `min`.
 */
export function limitsOf(input: StackInput): { readonly min: number; readonly max: number; readonly rail: number } {
  const min = Math.max(0, finite(input.cross.min, 0));
  const max = Number.isNaN(input.cross.max) ? Infinity : input.cross.max;
  return { min, max: Math.max(min, max), rail: Math.max(0, finite(input.cross.rail ?? DEFAULT_RAIL, DEFAULT_RAIL)) };
}
export const menuMain = (input: StackInput): number => Math.max(0, finite(input.menu?.main ?? DEFAULT_MENU, DEFAULT_MENU));

/** Whether a form sets the stack's cross size: its own say, else true for a panel's `open`. */
export const formSetsCross = (f: StackForm): boolean => f.setsCross ?? f.kind === "open";

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
  /** The items in it, in the stack's order: exactly the items whose kind is `menu`. */
  readonly items: readonly string[];
}

/**
 * Why a stack looks as it does:
 * - `form-down`: an item took a smaller form than the one it started in (`from`, an index into its forms), by length
 *   or by cross size.
 * - `to-menu`: an item is in the » menu.
 * - `too-wide`: an item's form doesn't set the cross size and its `cross.min` is over the stack's. Cross size never
 *   puts an item in the menu, so it keeps its last drawn form and the app clips it.
 * - `no-forms`: an item with no forms, left out of `items`.
 * - `overflow`: no item can give more way and the stack is still `over` px too long (forms that don't end in a `menu`
 *   form can't give more; neither can a stack where going into the menu would only make it longer).
 */
export type StackNote =
  | { readonly code: "form-down"; readonly id: string; readonly from: number; readonly to: number }
  | { readonly code: "to-menu"; readonly id: string }
  | { readonly code: "too-wide"; readonly id: string }
  | { readonly code: "no-forms"; readonly id: string }
  | { readonly code: "overflow"; readonly over: number };
export type StackNoteCode = StackNote["code"];

export interface StackFit {
  readonly axis: StackAxis;
  readonly length: number;
  /** The stack's size across: the widest `open` (clamped to the limits), or the rail. */
  readonly cross: number;
  /** One per input item that has forms, in order. */
  readonly items: readonly PlacedStackItem[];
  /** The » entry, or null while no item is in the menu. */
  readonly menu: StackMenu | null;
  /** `no-forms` first, then `form-down` per item in the order they gave way, `to-menu`, `too-wide`, and `overflow`. */
  readonly notes: readonly StackNote[];
}
