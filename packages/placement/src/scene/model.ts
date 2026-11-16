/**
 * The scene's shapes: one model of a whole window. A scene is a stage (the window's inner rect), the edges along its
 * sides (bars and columns, each a stack of items), the items, the floats above the content, and the chrome that
 * floats and drop zones keep clear of. `solve(scene)` turns it into a `SceneLayout`: every rect a host draws.
 *
 * Plain data in and out, nothing module-global: two windows on one page are two scenes. No words, no time, no DOM.
 * What the shapes tell on their own (an edge's axis, an item's zone and forms, how it floats) is in `./helpers`.
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
  /**
   * Its give-way priority in its edge (default: the edge's `priority`, else 0). When an edge runs short, items step down
   * their forms (row, wrap in a column, icons, then the edge's » menu) lowest priority first, ties to the one used longest
   * ago; room coming back brings them up in the exact reverse order, each to its remembered form. It adds to every one
   * of its forms' `rank` (`./stack`), so a host may still rank single forms. Give the controls that must stay out of the
   * menu the highest priority.
   */
  readonly priority?: number;
  /**
   * Its size as a float: `floatAt` with no rect uses it, and a float drop sets it. Without it, a float takes its first
   * form's natural size along its orient (`floatSizeOf`), or `DEFAULT_FLOAT_SIZE` when that form grows (a panel's card).
   */
  readonly floatSize?: Size;
  /**
   * Which of its forms it uses as a float when the float names no `orient` (`floatOrientOf`). Default: the axis of its
   * first form, the first of `forms.row` / `forms.column` it declares (a group declared row first floats as a row).
   */
  readonly floatOrient?: Orient;
  /**
   * The least a float of it is shrunk to: a float larger than the region floats lie in is laid out at
   * `max(floatMin, min(its size, the region))` each way. A floor wider than the region keeps it at the region's left
   * edge; one taller than the stage keeps it at the stage's top and runs past its bottom. A folded float (its header
   * form) keeps its height. Without it, a shrink stops at the form's own minimums.
   */
  readonly floatMin?: Size;
  /**
   * The most a float of it is laid out at, each way (optional, the same shape as `floatMin`, never under it): a larger
   * float rect is drawn at this size, its top-left corner kept (a folded float keeps its bar's height), and `fitResize`
   * stops a resize here (`"max"`).
   */
  readonly floatMax?: Size;
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
  /**
   * An icons-only edge (a thin rail of vertical toolbars along a window side): its items take only their `icons` form
   * (and the » menu after it), stacked, each grip the divider. An item with no `icons` form is left out
   * (`no-icons-form`).
   */
  readonly compact?: boolean;
  /**
   * The kinds each zone takes, narrowing `accepts`: with it, a zone not listed takes nothing. A panel column with
   * `{ start: ["panel"], end: ["group"] }` has its panels at the top and a tray of toolbars at its foot (the end zone, one
   * toolbar per row): a toolbar in the tray takes only its `wrap` or `icons` form (never the menu), and the panels give
   * way first. An empty edge offers each third of its strip only to the kinds that third's zone takes (the others are
   * refusals). A group never opens such a column on its own: an empty side column offers its strip only to the kinds
   * its start zone takes (a panel gets its top third; a group none, the rail's instead).
   */
  readonly zoneAccepts?: ZoneAccepts;
  /** The drop strip's depth while the edge is empty, px (default {@link DEFAULT_STRIP}). */
  readonly strip?: number;
  /**
   * How a gap's hit runs along the edge. The gaps always split the edge halfway between neighbouring insertion lines, so
   * free space and short items (a toolbar, a closed or folded panel) are covered end to end. A number: over an open
   * item's body only (a panel), the hit narrows to a band that many px around the line, so the middle of a panel is no
   * gap and the pointer falls through to the float target, or to none. `"middle"`: no band, so panels are split too.
   * Default {@link DEFAULT_HIT_BAND}.
   */
  readonly hitBand?: number | "middle";
  /**
   * `"side"`: a static edge whose fixed item (an anchor: page thumbnails) the user may drag to the other side of the
   * edge's axis. `targets` then offers that item one target, `side:<other side>`, over the place the edge takes there
   * (`setSide`); its own place is home. Left out, a fixed item has no targets.
   */
  readonly moves?: "side";
  /**
   * `true`: the user may fold this edge's fixed items (an anchor) by hand, like a panel: `fold(scene, id, true)` shows
   * it in its rail form, `fold(scene, id, false)` reopens it, and `storeScene` / `readScene` keep it folded. Left out,
   * `fold` leaves a fixed item as it is.
   */
  readonly foldable?: boolean;
  /**
   * A dynamic column (left and right only): made by a drop on a column line, deleted when it holds no item, folded whole
   * into its side's rail by give-way (`Scene.contentMin`) or when every member is folded by hand. Its `accepts`,
   * `cross`, `gap`, `pad`, `menu`, `zoneAccepts` and `hitBand` come from `Scene.columns[side]` when the changes make it;
   * with no `hitBand` of its own it reads the template's.
   */
  readonly column?: boolean;
  /**
   * An anchor edge (a left or right edge that takes nothing, holding a fixed item such as a thumbnail strip) lies outside
   * `Scene.inset` and the gutter: at the window's side, the inset after it, toward the content. A full top or bottom bar
   * with it lies at the window's edge, full width, the inset after it; the side edges then run between such bars (an
   * anchor through the inset beside them). On a left or right side, from the window's side inward: its toolbar bars
   * with it (`isOutsideSideBar`), the side's rail, its anchors, the inset, the columns.
   */
  readonly outsideInset?: boolean;
  /**
   * A static left or right edge that gives way like a dynamic column: it shrinks toward its minimum, then folds whole
   * into its side's rail, in give-way order with the columns (its items' ages). It is never deleted.
   */
  readonly giveWay?: boolean;
  /**
   * The default give-way priority of its items (`SceneItem.priority` wins; default 0): a title bar given a lower one has
   * its toolbars step down before an item moved in from another bar would.
   */
  readonly priority?: number;
}

/** What a side's new columns are made from. */
export interface ColumnTemplate {
  readonly accepts: readonly Kind[];
  readonly cross: CrossLimits;
  readonly gap?: number;
  readonly pad?: { readonly start?: number; readonly end?: number };
  readonly menu?: { readonly main: number };
  /** The kinds each zone takes in the columns made from it (`Edge.zoneAccepts`). */
  readonly zoneAccepts?: ZoneAccepts;
  /**
   * How a gap's hit runs over the open panels of the columns made from it (`Edge.hitBand`): a band that many px about
   * each line, or `"middle"` (a drop on a panel's upper or lower half means the gap before or after it). Default
   * {@link DEFAULT_HIT_BAND}.
   */
  readonly hitBand?: number | "middle";
}

/** Per zone, the kinds it takes. */
export type ZoneAccepts = Readonly<Partial<Record<Zone, readonly Kind[]>>>;

/** A side's one rail strip: folded columns show in it as segments, in ring order. */
export interface RailSpec {
  /** Its width, px. */
  readonly width: number;
  /** The kinds a drop on the rail may bring (it docks folded). */
  readonly accepts: readonly Kind[];
}

export interface SceneFloat {
  readonly id: string;
  /** Its rect in stage px (it never scrolls with the content). With `anchor`, only its size counts. */
  readonly rect: Rect;
  /** Follow the content's side or corner until a drop gives it a real rect. */
  readonly anchor?: FloatAnchor;
  /** Which of the item's forms it uses (default: the item's `floatOrientOf`). */
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
  /** Per side (left, right): what a new column is made from. A side without one gets no new columns. */
  readonly columns?: Partial<Record<"left" | "right", ColumnTemplate>>;
  /** Per side (left, right): its rail. A side without one keeps folded columns as columns. */
  readonly rails?: Partial<Record<"left" | "right", RailSpec>>;
  /**
   * The least the content may be. While the content is narrower than `width`, dynamic columns shrink toward their
   * minimum, then fold whole into their side's rail: unkept before kept, the one whose newest use is oldest first, the
   * outer first, the left first. Under `height`, a `content-short` note.
   */
  readonly contentMin?: { readonly width: number; readonly height: number };
  /**
   * How a column folded by hand shows (default `"bar"`): `"bar"` sends it to its side's rail; `"ride"` draws each of its
   * members as a title bar over the first open column of its side (stacked, in zone order), at that column's width,
   * taking no width of their own.
   */
  readonly handFold?: "bar" | "ride";
  /**
   * Space kept clear inside the stage's edges, px (default 0 each). Floats are clamped into the stage less its left and
   * right (the stage's full height), and shrunk to fit that region when larger.
   */
  readonly inset?: { readonly top?: number; readonly right?: number; readonly bottom?: number; readonly left?: number };
  /**
   * When `inset` applies (default `"always"`): `"docked"` keeps it only while a panel is docked beside the content (an
   * open panel column or a rail showing panels: a left or right edge that takes something, with an item that isn't
   * closed or fixed and whose first column form is `open`, `header` or `rail`). Bars, toolbar groups and an anchor
   * never count, wherever they sit; with no panel there, the content is the whole stage.
   */
  readonly insetWhen?: "always" | "docked";
  /** Space after each left or right edge and each rail that takes room, toward the content, px (default 0). */
  readonly gutter?: number;
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
  /** Drawn as a segment of this side's rail (its column is folded). */
  readonly rail?: "left" | "right";
  /** Drawn as a title bar riding on this column (`handFold: "ride"`). */
  readonly rides?: string;
  /** Its column folded: by hand (every member folded) or by give-way. */
  readonly folded?: "hand" | "auto";
  /** A `wrap` form: the word indexes per row (the words wrap beside the grip, a hanging indent). */
  readonly rows?: readonly (readonly number[])[];
  /** Its grip: a `wrap` form's lead cell at the start of row one, or a form's `grip` strip (an icons strip's, on top). */
  readonly grip?: Rect;
  /**
   * The control ids the form it took leaves out (`StackForm.hides`), empty when it hides none or sits in a » menu: a host
   * draws a "+N" control with them. `form` already names the variant.
   */
  readonly hidden: readonly string[];
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
  /** A dynamic column folded into its side's rail (its rect is zero wide there): by hand or by give-way. */
  readonly folded?: "hand" | "auto";
  /** Shrunk by give-way below the width it asks for. */
  readonly shrunk?: boolean;
  /** Riding on this column (its rect is the bars'). */
  readonly rides?: string;
}

/** A side's rail as laid out. */
export interface SceneRailLayout {
  readonly rect: Rect;
  /** One per member of each folded column, in ring order. */
  readonly segments: readonly { readonly id: string; readonly edge: string; readonly rect: Rect }[];
}

/**
 * Why the layout looks as it does:
 * - a stack's note with its `edge` (`form-down`, `to-menu`, `too-wide`, `no-forms`, `overflow`);
 * - `unknown-item`: an id in an edge or a float that `items` lacks (left out);
 * - `twice`: an item placed in two places (the first in cut order wins, edges before floats);
 * - `float-clamped`, `float-moved`: a float was moved into the stage, or clear of what it would cover;
 * - `float-covers`: no clear place exists, and it covers the least it can.
 * - `column-shrunk`, `column-folded`, `kept-folded`: give-way by `contentMin.width`, in give-way order;
 * - `content-narrow`, `content-short`: the content is still under `contentMin` (overlay bars count against the height).
 * - `no-column-room`: not even one column at its minimum fits beside `contentMin.width` (`layout.columnRoom` false):
 *   `width` is the room the stage leaves, `need` the content's minimum plus that column and its gutter.
 * - `content-changed`: under `previous`, `content` is not the rect `previous.content` was (`from`, `to`). A host refits
 *   its zoom only on this note.
 * - `no-vertical-form`: an item left out of a vertical place (a rail, a vertical float) because only `wrap` forms are
 *   left to it (vertical means icons: give a word group an `icons` form).
 */
export type SceneNote =
  | ({ readonly edge: string } & StackNote)
  | { readonly code: "unknown-item"; readonly id: string }
  | { readonly code: "twice"; readonly id: string }
  | { readonly code: "float-clamped" | "float-moved" | "float-covers"; readonly id: string }
  | { readonly code: "column-shrunk"; readonly edge: string; readonly from: number; readonly to: number }
  | { readonly code: "column-folded" | "kept-folded"; readonly edge: string }
  | { readonly code: "no-column-room"; readonly width: number; readonly need: number }
  | { readonly code: "content-narrow"; readonly width: number; readonly min: number }
  | { readonly code: "content-short"; readonly height: number; readonly min: number }
  | { readonly code: "content-changed"; readonly from: Rect; readonly to: Rect }
  | { readonly code: "no-vertical-form"; readonly id: string; readonly edge?: string }
  | { readonly code: "no-icons-form"; readonly id: string; readonly edge: string };
export type SceneNoteCode = SceneNote["code"];

export interface SceneLayout {
  /** Every item drawn (closed items only when shown as rail tabs). */
  readonly items: Readonly<Record<string, SceneItemLayout>>;
  readonly edges: Readonly<Record<string, SceneEdgeLayout>>;
  /** What is left for the content (the pages). Overlay edges lie over it. */
  readonly content: Rect;
  /** The floats drawn, in stacking order (the last on top). */
  readonly floats: readonly string[];
  /** The rails shown (a side with a folded column). Hosts draw these. */
  readonly rails: Readonly<Partial<Record<"left" | "right", SceneRailLayout>>>;
  /**
   * Where each side's rail lies, or would lie were one shown, for every side that has a rail (`Scene.rails`), drawn or
   * not: the place a drop into the rail lands (`targets` reads it). Hosts draw `rails`, never `railPlaces`.
   */
  readonly railPlaces: Readonly<Partial<Record<"left" | "right", Rect>>>;
  /**
   * With `contentMin` and a dynamic column (or, before any exists, a `columns` template): whether one column at its
   * minimum fits beside the content's minimum (`false` with a `no-column-room` note). Anchors and rails don't count:
   * every column can fold into its rail. A host shows its narrow fallback (one panel over the content) while it is `false`.
   */
  readonly columnRoom?: boolean;
  readonly notes: readonly SceneNote[];
}

export interface SolveOptions {
  /**
   * The layout the scene had before: each edge's fit goes to `fitStack` as `previous`, so a press reshapes nothing. An
   * item docked now that was closed or absent then has just opened. Opened beside items that stayed open in its edge, it
   * counts as the newest (its largest form while it fits; the others give way by the usual rules) and its column is
   * weighed anew. A closed item is not a removed one: opened into an edge whose items were all closed, it comes back as
   * it was, with its age, and its column's folds (kept while it was closed) apply again.
   */
  readonly previous?: SceneLayout;
  /** Edge or item ids solved without `previous` (an edge, or the edges holding the item; a column weighed anew). */
  readonly fresh?: readonly string[];
}

/** A drop strip's depth inside the content while an edge is empty, px. */
export const DEFAULT_STRIP = 24;
/** A gap's hit over an open item's body (a panel): a band this many px around the gap's insertion line. */
export const DEFAULT_HIT_BAND = 24;
/** A float's size when neither the item nor the call gives one, px. */
export const DEFAULT_FLOAT_SIZE: Size = { width: 280, height: 360 };
