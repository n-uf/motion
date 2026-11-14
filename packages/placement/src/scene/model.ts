/**
 * The scene's shapes: one model of a whole window. A scene is a stage (the window's inner rect), the edges along its
 * sides (bars and columns, each a stack of items), the items, the floats above the content, and the chrome that
 * floats and drop zones keep clear of. `solve(scene)` turns it into a `SceneLayout`: every rect a host draws.
 *
 * Plain data in and out, nothing module-global: two windows on one page are two scenes. No words, no time, no DOM.
 */
import type { Rect, Size } from "../geometry";
import type { CrossLimits, StackFit, StackForm, StackFormKind, StackNote } from "../stack";

/** The host's kinds of item, such as "panel" and "group". An edge takes only the kinds it lists. */
export type Kind = string;

/** A side of the stage. Left and right edges are columns (they run down); top and bottom edges are bars (they run across). */
export type Side = "top" | "right" | "bottom" | "left";
export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

/** Where an item sits along its edge: packed from the start, centred in the spare length, or packed from the end. */
export type Zone = "start" | "center" | "end";
export const ZONES: readonly Zone[] = ["start", "center", "end"];

/** A float that follows the content: flush with that side or corner of `layout.content` until a drop gives it a real rect. */
export type FloatAnchor =
  | "content-top-left"
  | "content-top"
  | "content-top-right"
  | "content-right"
  | "content-bottom-right"
  | "content-bottom"
  | "content-bottom-left"
  | "content-left";

/** Along which axis an item lies: a column runs down, a row (a bar) runs across. */
export type Orient = "column" | "row";

export interface SceneItem {
  readonly id: string;
  readonly kind: Kind;
  /**
   * Its forms along a column and along a row (a bar), largest first, as `./stack` takes them. An item with no forms for
   * an axis can't be laid out along it (`no-forms`).
   */
  readonly forms: { readonly column?: readonly StackForm[]; readonly row?: readonly StackForm[] };
  /** How recently it was used: the smaller, the longer ago, the sooner it gives way. */
  readonly used: number;
  /** Kept: gives way after every item that isn't. */
  readonly kept?: boolean;
  /**
   * The first form it may take, an index into the forms of the axis it lies along (default 0). Folding by hand sets it
   * (`fold`). A float with `from` over 0 is drawn as its bar: that form's natural length, at the float's place.
   */
  readonly from?: number;
  /**
   * Reserved room: a title, window controls, a page readout. It never changes form (it keeps `forms[from]`), is never
   * reordered, never dragged, and no hit or slot covers it. Its length may shrink to its form's `main.min` and grow
   * with spare room when the form `grows`; window controls have `min` equal to `natural`.
   */
  readonly fixed?: boolean;
  /** Closed: it keeps its place in its edge (or its float rect) but takes no room and has no targets. */
  readonly closed?: boolean;
  /** Its zone in its edge (default start). */
  readonly align?: Zone;
  /** Its size as a float: `floatAt` with no rect uses it, and a float drop sets it. */
  readonly floatSize?: Size;
}

export interface Edge {
  readonly id: string;
  readonly side: Side;
  /** 0 is the outermost on its side (a title bar outside a toolbar). */
  readonly ring: number;
  /**
   * Top and bottom bars only: across the whole stage (`"full"`, the default) or between the side columns
   * (`"between"`). Left and right edges ignore it.
   */
  readonly span?: "full" | "between";
  /** The kinds a drop may bring here. Deny by default: an empty list takes nothing (an anchor). */
  readonly accepts: readonly Kind[];
  /** Ids in order, fixed and closed items included. */
  readonly items: readonly string[];
  /** The size it may take across (a column's width, a bar's height), and the rail width when nothing sets it. */
  readonly cross: CrossLimits;
  /** `"overlay"` lies over the content instead of shortening it (default `"reserved"`). */
  readonly mode?: "reserved" | "overlay";
  readonly gap?: number;
  readonly pad?: { readonly start?: number; readonly end?: number };
  /** The » entry's length along the edge. */
  readonly menu?: { readonly main: number };
  /**
   * The user's size across (a column dragged wider), clamped to `[max(cross.min, the widest open setter's cross.min),
   * cross.max]`, so an open item's `cross.min` wins over a smaller size. Used only while an item sets the cross size.
   */
  readonly size?: number;
  /** A column drawn as a rail (nothing in it sets its width) shows its closed items too, as tabs marked `closed`. */
  readonly railShowsClosed?: boolean;
  /** The drop strip's depth while the edge is empty, px (default {@link DEFAULT_STRIP}). */
  readonly strip?: number;
}

export interface SceneFloat {
  readonly id: string;
  /** Its rect in stage px (it never scrolls with the content). With `anchor`, only its size counts. */
  readonly rect: Rect;
  /** Follow the content's side or corner until a drop gives it a real rect. */
  readonly anchor?: FloatAnchor;
  /** Which of the item's forms it uses (default `"column"`). */
  readonly orient?: Orient;
}

export interface Scene {
  /** The window's inner rect. */
  readonly stage: Rect;
  readonly edges: readonly Edge[];
  readonly items: Readonly<Record<string, SceneItem>>;
  /** Stacking order: the last is on top. */
  readonly floats: readonly SceneFloat[];
  /** The kinds that may float. Deny by default. */
  readonly floatKinds: readonly Kind[];
  /** Rects that floats and drop zones keep clear of (a title the host draws itself, a status line). */
  readonly chrome?: readonly Rect[];
  /** Spots where a release cancels: `targets` gives a `none` target over each. */
  readonly blocked?: readonly Rect[];
}

/** An item as laid out. */
export interface SceneItemLayout {
  /** Stage px. An item in the » menu has the menu entry's rect. */
  readonly rect: Rect;
  readonly kind: Kind;
  /** The form it took: an index into the forms of its axis. */
  readonly form: number;
  readonly formKind: StackFormKind;
  /** Docked: its edge and zone. */
  readonly edge?: string;
  readonly zone?: Zone;
  readonly floating?: boolean;
  readonly inMenu?: boolean;
  /** A rail tab (its column is a rail). */
  readonly tab?: boolean;
  /** A closed item shown as a rail tab (`railShowsClosed`). */
  readonly closed?: boolean;
  readonly fixed?: boolean;
}

/** An edge as laid out. */
export interface SceneEdgeLayout {
  readonly side: Side;
  readonly ring: number;
  /** Stage px: the strip it takes (zero across when nothing is drawn in it). */
  readonly rect: Rect;
  /** Its size across. */
  readonly cross: number;
  /** Its » entry and the items in it, or null. */
  readonly menu: { readonly rect: Rect; readonly items: readonly string[] } | null;
  /** The ids drawn as rail tabs, in order (empty unless the column is a rail). */
  readonly tabs: readonly string[];
  /**
   * The stack fits behind it, in stack-local px: `stack` is the one drawn, `free` the first fit (before `size` or the
   * rail re-solved it). `solve`'s `previous` reads both; a host needs neither.
   */
  readonly stack: StackFit;
  readonly free: StackFit;
}

/**
 * Why the layout looks as it does:
 * - a stack's note with its `edge` (`form-down`, `to-menu`, `too-wide`, `no-forms`, `overflow`);
 * - `unknown-item`: an id in an edge or a float that `items` lacks (left out);
 * - `twice`: an item placed in two places (the first in cut order wins, edges before floats);
 * - `float-clamped`, `float-moved`: a float was moved into the stage, or clear of what it would cover;
 * - `float-covers`: no clear place exists, and it covers the least it can.
 */
export type SceneNote =
  | ({ readonly edge: string } & StackNote)
  | { readonly code: "unknown-item"; readonly id: string }
  | { readonly code: "twice"; readonly id: string }
  | { readonly code: "float-clamped" | "float-moved" | "float-covers"; readonly id: string };
export type SceneNoteCode = SceneNote["code"];

export interface SceneLayout {
  /** Every item drawn (closed items only when shown as rail tabs). */
  readonly items: Readonly<Record<string, SceneItemLayout>>;
  readonly edges: Readonly<Record<string, SceneEdgeLayout>>;
  /** What is left for the content (the pages). Overlay edges lie over it. */
  readonly content: Rect;
  /** The floats drawn, in stacking order (the last on top). */
  readonly floats: readonly string[];
  readonly notes: readonly SceneNote[];
}

export interface SolveOptions {
  /** The layout the scene had before: each edge's fit goes to `fitStack` as `previous`, so a press reshapes nothing. */
  readonly previous?: SceneLayout;
}

/** A drop strip's depth inside the content while an edge is empty, px. */
export const DEFAULT_STRIP = 24;
/** A float's size when neither the item nor the call gives one, px. */
export const DEFAULT_FLOAT_SIZE: Size = { width: 280, height: 360 };

/** The axis an edge's stack runs along. */
export const axisOf = (side: Side): Orient => (side === "left" || side === "right" ? "column" : "row");
export const zoneOf = (item: SceneItem | undefined): Zone => (item?.align === "center" || item?.align === "end" ? item.align : "start");
export const formsOf = (item: SceneItem, axis: Orient): readonly StackForm[] => item.forms[axis] ?? [];
