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

/** Where an item sits along its edge: packed from the start, centered in the spare length, or packed from the end. */
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
export const FLOAT_ANCHORS: readonly FloatAnchor[] = ["content-top-left", "content-top", "content-top-right", "content-right", "content-bottom-right", "content-bottom", "content-bottom-left", "content-left"];

/**
 * An anchor with an offset: flush with `at`'s side or corner of the content, then `dx` px to the right and `dy` px down
 * (negative: left, up; default 0). It still follows the content, so a host stores "the top-right corner, 12 px down"
 * rather than a pixel position.
 */
export interface FloatAnchorOffset {
  readonly at: FloatAnchor;
  readonly dx?: number;
  readonly dy?: number;
}

/** Where an anchored float sits: an anchor's name, or one with an offset. */
export type FloatAnchorAt = FloatAnchor | FloatAnchorOffset;

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
   * Folded by hand when 1 or more (`fold` sets it to 1; default unset): it starts at its first folded form (a panel's
   * `header`, a group's `fold`) among the forms of the axis it lies along, never one step down the ladder, and give-way
   * steps down from there. A stored value past that form keeps its place (a scene stored with a later form). With no
   * folded form on that axis it draws unfolded (`canFold`). A float folded by hand is drawn as its bar: that form's
   * natural length, at the float's place.
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
   * (`"between"`). Left and right edges ignore it. An overlay bar (`mode: "overlay"`) lies over the content, between
   * the columns, unless it sets `span: "full"` by name: then it runs across the full bars' width, over the side columns
   * too. Left out on an overlay bar, it means the content's width, as it always has.
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
   * How a gap's hit runs along the edge. The gaps always split the edge halfway between neighboring insertion lines, so
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
   *
   * On a top or bottom bar (reserved or overlay), it gives way by height: while the content is shorter than
   * `contentMin.height` (overlay bars counted), such bars shrink across toward their minimum (`cross.min`, and each
   * open item's form's `cross.min`), then fold, their items stepping to the next form that fits across (a panel's
   * title bar), unkept before kept, the oldest newest use first, the outer first (`bar-shrunk`, `bar-folded`). Room
   * coming back undoes it in reverse. A bar never draws an item thinner across than its form's `cross.min`.
   */
  readonly giveWay?: boolean;
  /**
   * The default give-way priority of its items (`SceneItem.priority` wins; default 0): a title bar given a lower one has
   * its toolbars step down before an item moved in from another bar would.
   */
  readonly priority?: number;
  /**
   * Hidden: kept in the scene with its items, but not in the window (a bar a host doesn't draw, a rail it has turned
   * off). View state: the host decides it each time it builds the scene, and the store never writes it. A hidden edge
   * takes no room, and everything else lays out exactly as if it weren't in the scene; `solve` leaves it and its items
   * out of the layout (no `edges[id]`, no `items[id]`, as for an item placed nowhere), so nothing reads a rect of it.
   * Its items take no part in give-way or folds. It has no targets and no refusals for any kind, no keyboard stops, and
   * its items have none either (dragging one gives nothing); `moveTo` into it is refused as into an edge that doesn't
   * take the kind. Its items stay in it, and `storeScene` / `readScene` keep them. A column a drop makes never takes a
   * hidden edge's id; where a drop makes or removes a column on its side, the side is numbered again with the hidden
   * edge back at its own place. Side columns, rails and bars alike. With `showIn`, its items show elsewhere instead.
   */
  readonly hidden?: boolean;
  /**
   * Where a hidden edge's items show while it is hidden: the id of another edge, shown. Its items are laid out, targeted
   * and stopped as if they sat in that edge after its own items (`solve` reports them there), each that edge takes the
   * kind of, in its own zone where that edge takes it there, else in the first that does; a fixed item, or one whose
   * kind that edge takes nowhere, is left out as without `showIn`. They stay in the hidden edge in the scene: a drop that
   * commits a move of one takes it out, to the drop's place; its home, and any drop of another item, leaves them where
   * they are. View state like `hidden`: the store never writes it. Naming the edge itself, no edge, or another hidden
   * edge is ignored (`show-in-ignored`). No effect on an edge that isn't hidden.
   */
  readonly showIn?: string;
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

/** How a side's rails show their items: their titles while they fit (the default), or their tiles only. */
export type RailMode = "titles" | "icons";
export const RAIL_MODES: readonly RailMode[] = ["titles", "icons"];

/** A side's one rail strip: folded columns show in it as segments, in ring order. */
export interface RailSpec {
  /** Its width, px. */
  readonly width: number;
  /** The kinds a drop on the rail may bring (it docks folded). */
  readonly accepts: readonly Kind[];
}

/** When a host draws a side's rail drop strip: while an item of the kind is held (the default), always, or never. */
export type RailVisibility = "whileDragging" | "always" | "never";
export const RAIL_VISIBILITIES: readonly RailVisibility[] = ["whileDragging", "always", "never"];

/** The least width of a rail drop strip, px: a target at the window's edge stays easy to hit (Fitts's law). */
export const RAIL_STRIP_MIN = 24;
/** How far an armed rail drop strip grows inward by default, px, so a hand that wobbles once armed keeps it. */
export const DEFAULT_RAIL_MAGNET = 6;

/**
 * How an item of one kind drops into a side's rail (`Scene.railDrop[kind]`): the geometry of its drop strip. Each kind
 * has its own; a kind with none keeps the rail targets as they were (immediate, no strip).
 *
 * With a policy, each side whose rail can take the kind shows one drop strip at the window's side, at the rail's real
 * width, even while the rail is empty: its targets are `rail:<side>:<ring>` with `arm: "dwell"` (spring-loading: the
 * drag intent arms them on a dwell), `armedHit` (the strip grown by `magnet`) and `strip` (the rect to draw). The strip
 * owns its rect: a drop there is the rail's once armed, the float's before. The side's rail is `Scene.rails[side]`
 * where the scene declares one, else the side's outermost column that takes the kind in its start zone ("the column
 * drawn as a rail"): a drop there docks the item in it as a collapsed header, a rail tile once nothing in it sets its
 * width. The strip means "collapse it at this side": the drop is `moveTo` that side's rail, and lands wherever the
 * scene shows a collapsed panel there (a rail tile, a rider bar under `handFold: "ride"`, a header); the slot is that.
 */
export interface RailDropPolicy {
  /**
   * The strip's width, px, from the window's side inward (default: the rail's drawn width). At least
   * {@link RAIL_STRIP_MIN}; 0 turns the kind's rail docking off.
   */
  readonly railStripWidth?: number;
  /** When the host draws the strip (default `"whileDragging"`); `"never"` turns the kind's rail docking off. */
  readonly railVisibility?: RailVisibility;
  /**
   * How far the strip grows inward once armed, px (default {@link DEFAULT_RAIL_MAGNET}): the armed target's band
   * (`armedHit`). Moving out past its outer edge disarms it, and re-entering the strip needs a new full dwell.
   */
  readonly magnet?: number;
  /** Whether a float may sit inside the strip's area (default true); false keeps a float's rect clear of every strip. */
  readonly floatNearEdge?: boolean;
}

export interface SceneFloat {
  readonly id: string;
  /** Its rect in stage px (it never scrolls with the content). With `anchor`, only its size counts. */
  readonly rect: Rect;
  /** Follow the content's side or corner (with an offset, `{ at, dx?, dy? }`) until a drop gives it a real rect. */
  readonly anchor?: FloatAnchorAt;
  /** Which of the item's forms it uses (default: the item's `floatOrientOf`). */
  readonly orient?: Orient;
  /**
   * When it was floated, as a sequence: `floatAt` and `moveTo(…, { kind: "float" })` give a newly floated item one more
   * than the largest `since` among the scene's floats (1 when there are none); moving a float that already floats,
   * `raise`, `use` and `resize` keep it. Among anchored floats the earlier (smaller `since`, missing counting as 0, then
   * the smaller id) wins the place both want.
   */
  readonly since?: number;
}

/**
 * A rect the scene keeps clear of, and who keeps clear: `"all"` (the default) for floats and drop targets alike (a
 * slot or a target's landing never lies on it), `"floats"` for floats alone: their placement, drops, opening, a
 * window resize and a resize by hand keep clear of it, while the edges, give-way and every docked target ignore it (a
 * spine the host draws over a column).
 */
export type SceneChrome = Rect & { readonly for?: "all" | "floats" };

export interface Scene {
  /** The window's inner rect. */
  readonly stage: Rect;
  readonly edges: readonly Edge[];
  readonly items: Readonly<Record<string, SceneItem>>;
  /** Stacking order: the last is on top. */
  readonly floats: readonly SceneFloat[];
  /** The kinds that may float. Deny by default. */
  readonly floatKinds: readonly Kind[];
  /**
   * Rects the scene keeps clear of (a title the host draws itself, a status line): by default floats and drop targets
   * both; an entry with `for: "floats"` (a spine drawn over a column) only floats. See {@link SceneChrome}.
   */
  readonly chrome?: readonly SceneChrome[];
  /** Spots where a release cancels: `targets` gives a `none` target over each. */
  readonly blocked?: readonly Rect[];
  /** Per side (left, right): what a new column is made from. A side without one gets no new columns. */
  readonly columns?: Partial<Record<"left" | "right", ColumnTemplate>>;
  /** Per side (left, right): its rail. A side without one keeps folded columns as columns. */
  readonly rails?: Partial<Record<"left" | "right", RailSpec>>;
  /**
   * Per side (left, right): how its rails show their items (default `"titles"`). It covers every rail on the side: a
   * column drawn as a rail (nothing in it sets its width) and the side's rail strip (`rails`). `"titles"` offers the
   * items' title rail forms (`StackForm.title`), each stepping down to its tile by the ladder when the rail runs short;
   * `"icons"` passes them over, so every item shows its tile. An item with no title form shows its tile either way. A
   * side needs no `rails` entry to have a mode: a column drawn as a rail reads it too. `storeScene` keeps it.
   */
  readonly railModes?: Partial<Record<"left" | "right", RailMode>>;
  /**
   * Per item kind: how it drops into a side's rail ({@link RailDropPolicy}), keyed by the scene's own kind strings.
   * Tuning one kind never changes another; a kind left out keeps the rail targets it had.
   */
  readonly railDrop?: Readonly<Partial<Record<Kind, RailDropPolicy>>>;
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
  /**
   * Drawn in its title rail form (`StackForm.title`) on a rail of this side: a column drawn as a rail or the side's rail
   * strip. The host turns the title to run along the rail and reads it toward the content: on the left from bottom to
   * top (turned −90°), on the right from top to bottom (+90°), the count at the title's end.
   */
  readonly railTitle?: "left" | "right";
  /** Drawn as a title bar riding on this column (`handFold: "ride"`). */
  readonly rides?: string;
  /** Its column folded: by hand (every member folded) or by give-way. */
  readonly folded?: "hand" | "auto";
  /**
   * Why this item is drawn smaller than its first form, read from the scene's own state, never inferred from the rects:
   * `"hand"` when it is folded by hand (`SceneItem.from` over 0, which `fold` sets), `"auto"` when it gave way (a form
   * below the one it started in, by length or width, a » menu entry included: the same word `folded` uses for a column
   * folded by give-way). Absent when the item shows its first form, is closed, or lies in an icons-only edge in the form
   * that edge gives it. By hand wins: a hand-folded item that gave way further is `"hand"`, since expanding it
   * (`fold(scene, id, false)`) is the user's to do, so a host shows "Expand" for `"hand"` only. A float is only ever
   * folded by hand. `folded` is about the item's column; this one is about the item.
   */
  readonly foldedBy?: "hand" | "auto";
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
  /**
   * Its items in the edge's order: the zones in order (start, center, end), then the order within each zone, the order
   * `solve` lays them in. Exactly the ids `SceneLayout.items` draws for this edge (`SceneItemLayout.edge`): an item in the
   * » menu keeps its place (`menu.items` names those, so a host wanting the docked ones filters them out), a rail tab is
   * listed, and a closed item is left out (unless it shows as a rail tab). A column folded into its rail or riding lists
   * its members in zone order. Never sort rects to learn it.
   */
  readonly items: readonly string[];
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
  /** Shrunk by give-way below the size across it asks for: a column's width, a bar's height (`Edge.giveWay`). */
  readonly shrunk?: boolean;
  /** Riding on this column (its rect is the bars'). */
  readonly rides?: string;
}

/** A side's rail as laid out. */
export interface SceneRailLayout {
  readonly rect: Rect;
  /** One per member of each folded column, in ring order. */
  readonly segments: readonly { readonly id: string; readonly edge: string; readonly rect: Rect }[];
  /**
   * The segments' fit along the rail, in rail-local px, while any of them offers a title form (titles step down to
   * tiles by the ladder and come back in exact reverse): `solve`'s `previous` reads it; a host needs it not.
   */
  readonly stack?: StackFit;
}

/**
 * Why the layout looks as it does:
 * - a stack's note with its `edge` (`form-down`, `to-menu`, `too-wide`, `no-forms`, `overflow`);
 * - `unknown-item`: an id in an edge or a float that `items` lacks (left out);
 * - `twice`: an item placed in two places (the first in cut order wins, edges before floats);
 * - `float-clamped`, `float-moved`: a float was moved into the stage, or clear of what it would cover;
 * - `float-covers`: no clear place exists, and it covers the least it can.
 * - `column-shrunk`, `column-folded`, `kept-folded`: give-way by `contentMin.width`, in give-way order;
 * - `bar-shrunk`, `bar-folded`: give-way by `contentMin.height`, in give-way order: a top or bottom bar with `giveWay`
 *   shrank across (`from`, `to`), or its items stepped to the next form that fits (a panel's title bar);
 * - `content-narrow`, `content-short`: the content is still under `contentMin` (overlay bars count against the height).
 * - `no-column-room`: not even one column at its minimum fits beside `contentMin.width` (`layout.columnRoom` false):
 *   `width` is the room the stage leaves, `need` the content's minimum plus that column and its gutter.
 * - `content-changed`: under `previous`, `content` is not the rect `previous.content` was (`from`, `to`). A host refits
 *   its zoom only on this note.
 * - `no-vertical-form`: an item left out of a vertical place (a rail, a vertical float) because only `wrap` forms are
 *   left to it (vertical means icons: give a word group an `icons` form).
 * - `show-in-ignored`: a hidden edge's `showIn` names the edge itself, no edge, or another hidden edge; its items are
 *   left out as if it named none.
 */
export type SceneNote =
  | ({ readonly edge: string } & StackNote)
  | { readonly code: "unknown-item"; readonly id: string }
  | { readonly code: "twice"; readonly id: string }
  | { readonly code: "float-clamped" | "float-moved" | "float-covers"; readonly id: string }
  | { readonly code: "column-shrunk"; readonly edge: string; readonly from: number; readonly to: number }
  | { readonly code: "column-folded" | "kept-folded"; readonly edge: string }
  | { readonly code: "bar-shrunk"; readonly edge: string; readonly from: number; readonly to: number }
  | { readonly code: "bar-folded"; readonly edge: string }
  | { readonly code: "no-column-room"; readonly width: number; readonly need: number }
  | { readonly code: "content-narrow"; readonly width: number; readonly min: number }
  | { readonly code: "content-short"; readonly height: number; readonly min: number }
  | { readonly code: "content-changed"; readonly from: Rect; readonly to: Rect }
  | { readonly code: "no-vertical-form"; readonly id: string; readonly edge?: string }
  | { readonly code: "no-icons-form"; readonly id: string; readonly edge: string }
  | { readonly code: "show-in-ignored"; readonly edge: string };
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
