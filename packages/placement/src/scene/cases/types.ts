/**
 * The conformance rows' shapes. A row is plain data: a scene, the settings it runs at, the gestures a user makes, and
 * what the layout (and, in a host with a page, the DOM) must be after them. `runCase(row, host)` (./run) plays a row on
 * a `CaseHost`; the in-memory host (./host) is the reference, and an integrating app's host is one more. Nothing here names a DOM
 * type: a page's root only has to answer `getAttribute` and `querySelectorAll`, which every DOM element does.
 */
import type { Point, Rect } from "../../geometry";
import type { StackFormKind } from "../../stack";
import type { Scene, SceneLayout, SceneNoteCode, ScenePlace, SceneTarget, Side, StoredScene, Zone } from "../index";

/** How a row is grouped (the lab's case browser and an integrating app's report list rows by it). */
export type CaseGroup =
  | "panels"
  | "groups"
  | "drag"
  | "floats"
  | "bars"
  | "previous"
  | "kinds"
  | "bands"
  | "gestures"
  | "window-a"
  | "window-b";

/** The settings a row runs at. `stage` replaces the scene's stage with `{ x: 0, y: 0, width: w, height: h }`. */
export interface CaseSettings {
  readonly stage?: { readonly w: number; readonly h: number };
  /** Frozen: nothing lifts, unless Alt is held (`key: "Alt"`). */
  readonly frozen?: boolean;
}

export type GestureType = "press" | "move" | "release" | "key" | "click" | "resize" | "scroll" | "hold";

/**
 * One thing a user does, in the order they do it. Every field but `type` is optional; which ones count depends on the
 * type:
 *
 * - `press`: pointer down on `item`'s handle (its grip, or its header). `point` is where, relative to the item's
 *   top-left corner: the GRAB. It is the row's, not the host's: a float lands at the pointer minus the grab, so every
 *   press that ends in a float gives one (a host's own default may differ, and no row may depend on it). Nothing lifts yet.
 * - `move`: the pointer moves, to `point` (stage px) or to the target at `place` (a host aims at the target's hit by its
 *   place, with `resolvePlace`). With an item pressed, the first move past the lift threshold lifts it (a `place` always
 *   lifts), and the pointer is then over whichever target the host's pick rule (`PickRule`) finds. Without a press it only moves. With no
 *   target under the pointer the page draws the committed layout with the held item's place left empty, and nothing else
 *   moves (a release there commits nothing). A host reaches the end gaps `END_REACH` (24) px past an edge's ends: that is
 *   required of it, since the rows aim there.
 *   A checkpoint or DOM check is never read right after a `move`: a `hold` comes first, so a host with a drag intent can
 *   settle on its target (hysteresis) before the page is read.
 * - `release`: pointer up. After a lift it drops on the target under the pointer (a `home` or `none` target, or no
 *   target, drops nothing); without one it was a press and nothing changes.
 * - `key`: `"Escape"` cancels the drag, `"Alt"` holds Alt down and `"Alt:up"` lets it go (frozen windows move while it is
 *   down), `"Reload"` stores the scene, throws the in-memory one away and reads it back, as a page reload does.
 * - `click`: the item's controls, not a drag. With neither `key` nor `place` it activates the item: a closed item opens,
 *   one folded by hand (a rail tab, a header's caret) unfolds, a float rises; the first two count as a use. With `key`,
 *   the named control: `"use"` (a use and nothing else: the item is now the newest), `"open"`, `"close"`, `"fold"`,
 *   `"unfold"`, `"float"` (the menu's Float: its last size, anchored to the content), `"dock"` (Dock, Put back, Reset
 *   position: where the loaded scene had it). With `place`, the "Move to ›" row for that place (one of `stops`; for the
 *   float place it is the menu's Float, as with `"float"`). A frozen window refuses `"float"`, `"dock"` and "Move to ›"
 *   unless Alt is down.
 * - `resize`: with `edge`, the user's size across that edge (`size` px; `resize` in `./scene`). With `item`, that item's
 *   measured length grew by `size` px (a count gained digits; a negative `size` shrinks it): its largest form along the
 *   axis it lies along. With neither, the window is now `point.x` by `point.y`.
 * - `scroll`: the pages scroll by `size` px. Nothing in a scene scrolls, so nothing moves; only a host with a page can
 *   show that (a DOM `rect` check), the in-memory host has nothing to scroll.
 * - `hold`: the pointer rests for `ms`. Hosts with a clock let the drag intent settle; the in-memory host has none.
 */
export interface Gesture {
  readonly type: GestureType;
  readonly item?: string;
  readonly place?: ScenePlace;
  readonly point?: Point;
  readonly key?: string;
  readonly edge?: string;
  readonly size?: number;
  readonly ms?: number;
}

/** What one item's layout must be. Every field is optional: a row pins only what its case is about. */
export interface ItemExpect {
  /** Any of x, y, width, height, within the tolerance. */
  readonly rect?: Partial<Rect>;
  readonly formKind?: StackFormKind;
  /** The index of the form it took. */
  readonly form?: number;
  /** The edge it is docked in; `null`: docked nowhere (a float, or in the » menu of no edge). */
  readonly edge?: string | null;
  readonly zone?: Zone;
  readonly floating?: boolean;
  readonly inMenu?: boolean;
  /** The side whose rail draws it as a segment; `null`: in no rail. */
  readonly rail?: Side | null;
  readonly folded?: "hand" | "auto" | null;
  /** The column it rides on (`handFold: "ride"`). */
  readonly rides?: string | null;
  readonly tab?: boolean;
}

/** What an edge must be. */
export interface EdgeExpect {
  readonly rect?: Partial<Rect>;
  /** Its size across. */
  readonly cross?: number;
  /** The ids drawn as rail tabs, in order. */
  readonly tabs?: readonly string[];
  /** The ids in its » menu, in order; `null`: it has none. */
  readonly menu?: readonly string[] | null;
}

/** What a layout must be (partial: only what is named is compared). */
export interface LayoutExpect {
  /** Per item id. `null`: the item is not in the layout at all (a lifted one, a closed one). */
  readonly items?: Readonly<Record<string, ItemExpect | null>>;
  readonly edges?: Readonly<Record<string, EdgeExpect | null>>;
  /** What is left for the pages. */
  readonly content?: Partial<Rect>;
  /** The least the content may be (`contentMin`'s thresholds: "at least 320 px wide"). */
  readonly contentAtLeast?: { readonly width?: number; readonly height?: number };
  /** Per edge id: the ids docked in it (not in its » menu), in order along it. */
  readonly order?: Readonly<Record<string, readonly string[]>>;
  /** Per side: the members of each open dynamic column, outer column first, each in order down it. */
  readonly columns?: Readonly<Partial<Record<"left" | "right", readonly (readonly string[])[]>>>;
  /** Per side: the ids drawn as segments of its rail, in order. */
  readonly rails?: Readonly<Partial<Record<"left" | "right", readonly string[]>>>;
  /** The floats drawn, in stacking order (the last on top). */
  readonly floats?: readonly string[];
  /** Notes by code: all of `has` present, none of `hasNot`, and with `none` no notes at all. */
  readonly notes?: { readonly has?: readonly SceneNoteCode[]; readonly hasNot?: readonly SceneNoteCode[]; readonly none?: boolean };
  /** px; default 0.5. */
  readonly tolerance?: number;
}

/**
 * What a page's DOM must be. The elements are the session's: `data-drag-session="<kind>"` on the root during a drag
 * only, `[data-drag-slot][data-drag-target]` for the slot (the attribute holds the target's id), `[data-drag-marker]`
 * for the insertion line, `[data-drag-held]` for the held item, `[data-drag-refusal]` for a refusal shown at the pointer
 * ("No room here"; the attribute holds the refusal's id). A drawn item's element is found by `item`: the host's
 * `itemSelector(id)`, by default `[data-dock-item="<id>"]` (a rect check reads it).
 */
export interface DomCheck {
  /** After which gesture (its index) it is checked; default: after the last one. */
  readonly at?: number;
  /** A selector under the root; omitted (and no `item`): the root itself. */
  readonly select?: string;
  /** The element of this item, found with the host's `itemSelector` (never together with `select`). */
  readonly item?: string;
  /** How many elements match: a number, or a range. Default: at least one when `select` is given. */
  readonly count?: number | { readonly min?: number; readonly max?: number };
  /** Attribute values on every match; `null` means the attribute is absent. */
  readonly attr?: Readonly<Record<string, string | null>>;
  /**
   * The matched element's rect in stage px (relative to the root's top-left corner), any of x, y, width, height, within
   * `tolerance` (default 0.5 px): what a float that never scrolls with the pages, or a slot, really measures on screen.
   */
  readonly rect?: Partial<Rect>;
  readonly tolerance?: number;
  /** What the check is about, for the failure line. */
  readonly note?: string;
}

/**
 * The layout after one gesture (by index), before the later ones are played. After a `move` it is read only once a `hold`
 * has followed (so a checkpoint's `at` is never a `move`).
 */
export interface Checkpoint {
  readonly at: number;
  readonly layout?: LayoutExpect;
  readonly note?: string;
}

/**
 * What a row's scene needs of the host's window: a host that can't meet it skips the row or marks it. The runner reads
 * only `docks` (against `CaseHost.dockMinWidth`); the rest is data for the host's suite.
 */
export interface CaseRequires {
  /** The scene's columns use the default `hitBand` (an open panel's body is no drop place); a host whose columns use `"middle"` gets card halves there. */
  readonly hitBand?: "default";
  /** The sides whose rail the scene declares (`Scene.rails`) and shows at the start (a folded column puts panels in it), so a host needs a rail to aim at there. */
  readonly rails?: readonly ("left" | "right")[];
  /**
   * The host drags with a drag intent (`@n-uf/motion/drag`'s `createDragIntent`, or one with its timing): the row checks
   * what the intent adds to the pick at a point (a shown target held a band's width past its hit while the pointer
   * rests there). A host that picks at the point alone, the in-memory reference host among them, skips the row.
   */
  readonly intent?: true;
  /**
   * The scene's own rail drop policy (`Scene.railDrop`, as the row gives it, often none): the row aims at a pixel whose
   * meaning depends on whether a rail drop strip lies over the window's edge. A host that lays its own strips (its own
   * `railDrop`) skips the row; rows that only mean a place aim by place and need no such precondition.
   */
  readonly railDrop?: "scene";
  /**
   * The row's expected outcome depends on panels being docked (columns or rails, an order along an edge, a docked
   * panel's place, rect or form, the content beside docked panels, floats that leave a panel out). `CASES` sets it by
   * one rule (`needsDocks`); a row may state it, true or false, to override. The runner skips a row with it on a host
   * whose `dockMinWidth` is above the row's stage width.
   */
  readonly docks?: boolean;
}

export interface CaseRow {
  /** Generic and stable: an integrating app's suite names rows by it. */
  readonly id: string;
  readonly title: string;
  /** One sentence: what must be true. */
  readonly expect: string;
  readonly group: CaseGroup;
  readonly scene: Scene;
  readonly settings?: CaseSettings;
  readonly gestures: readonly Gesture[];
  /** The layout after every gesture. */
  readonly expectLayout: LayoutExpect;
  readonly expectDom?: readonly DomCheck[];
  /** The layout after earlier gestures, for rows about the preview (a drop's slot while the pointer is still down). */
  readonly checkpoints?: readonly Checkpoint[];
  /** What the stored form must hold after the last gesture (a host's `stored()`): ages, folds, no `pinned` flag. */
  readonly expectStored?: StoredExpect;
  /** The places "Move to ›" and the arrow keys offer for an item, in order (a host's `stops(item)`), after gesture `at` (default the last). */
  readonly expectStops?: { readonly item: string; readonly at?: number; readonly places: readonly ScenePlace[] };
  /**
   * The library rule this row needs and the Scene doesn't have yet. Such a row is expected to fail on the in-memory host
   * until the rule lands (then its suite says to remove this), and an integrating app's suite may skip it.
   */
  readonly lacks?: string;
  /** What the scene needs of the host's window (see {@link CaseRequires}); a host that can't meet it skips or marks the row. */
  readonly requires?: CaseRequires;
}

/** What a stored form must hold: per item the named fields exactly (`null`: absent), and strings its JSON never contains. */
export interface StoredExpect {
  readonly items?: Readonly<Record<string, Readonly<Record<string, string | number | boolean | null>>>>;
  readonly absent?: readonly string[];
}

/** A page's root, as much of it as the checks read. A DOM element is one. */
export interface DomRoot {
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): ArrayLike<DomRoot>;
  /** Needed only by rect checks; a DOM element's own is one. */
  getBoundingClientRect?(): { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

/** What a host gives the runner. */
export interface CaseHost {
  /** Start over with `scene` (the loaded scene is also what `click` `"dock"` puts items back to). */
  load(scene: Scene, settings?: CaseSettings): void;
  /** Do one gesture. Throws when it can't be done (no such target, no such item): the runner reports it as a failure. */
  perform(gesture: Gesture): void;
  /** The layout the page draws now: during a drag, the target's `after.layout` (the preview). */
  layout(): SceneLayout;
  /** The page's root; absent in a host without a page, and then the DOM checks are skipped. */
  root?(): DomRoot | null;
  /** The selector, under the root, of the element that draws item `id`; default `[data-dock-item="<id>"]`. A DOM check's `item` is aimed with it. */
  itemSelector?(id: string): string;
  /** The stored form as a reload would read it back; absent: the stored checks are skipped. */
  stored?(): StoredScene;
  /** The places "Move to ›" offers for an item, in order (the library's `stops` places); absent: the stops check is skipped. */
  stops?(item: string): readonly ScenePlace[];
  /** The pick rule the host aims with (see {@link PickRule}); the runner never calls it. */
  readonly pick?: PickRule;
  /**
   * The narrowest stage width, px, at which the host docks panels (below it, say, every panel floats or opens as a
   * sheet). The runner skips a row that needs docked panels (`requires.docks`) when the row's stage is narrower at any
   * point (its start, or a window `resize`), and lists the row in `skipped`. Absent: the host docks at every width.
   */
  readonly dockMinWidth?: number;
  /**
   * The host's names for a row's items and edges: row id to host id (`{ views: "panels", tools: "commands" }`). The
   * runner passes every id to the host in the host's words (the scene, the gestures, `stops`, `itemSelector`) and reads
   * the layout, the stored form and the stops back in the row's, so the row's expectations stay as written. One to one;
   * an id left out keeps its name. See `./ids`.
   */
  readonly ids?: Readonly<Record<string, string>>;
}

/**
 * The pick rule: which of `list` the pointer at `point` is over, or null. There is one, `@n-uf/motion/drag`'s
 * `targetAt` (the lowest priority number, then the smallest zone; a rect holds its edges exactly; `hits` all count), and
 * every host passes it: placement doesn't import motion, so the host takes the rule as an input. A `move` lands the
 * pointer over the target this rule picks, and `resolvePlace` aims with it.
 */
export type PickRule = (list: readonly SceneTarget[], point: Point) => SceneTarget | null;

/**
 * A `CaseHost` whose calls may be async (a page a browser runner drives with real pointer events and timers): each of
 * `load`, `perform`, `layout`, `root`, `stored` and `stops` may return a promise. `itemSelector` stays a plain value.
 * `runCaseAsync` awaits every call.
 */
export interface AsyncCaseHost {
  load(scene: Scene, settings?: CaseSettings): void | Promise<void>;
  perform(gesture: Gesture): void | Promise<void>;
  layout(): SceneLayout | Promise<SceneLayout>;
  root?(): DomRoot | null | Promise<DomRoot | null>;
  itemSelector?(id: string): string;
  stored?(): StoredScene | Promise<StoredScene>;
  stops?(item: string): readonly ScenePlace[] | Promise<readonly ScenePlace[]>;
  /** The pick rule the host aims with, a plain value (see {@link PickRule}); the runner never calls it. */
  readonly pick?: PickRule;
  /** The narrowest stage width at which the host docks panels, as {@link CaseHost.dockMinWidth}. */
  readonly dockMinWidth?: number;
  /** The host's names for a row's items and edges, as {@link CaseHost.ids}. */
  readonly ids?: Readonly<Record<string, string>>;
}

export interface CaseResult {
  readonly ok: boolean;
  readonly failures: string[];
  /**
   * The checks not run because the host can't (no root, no stored form, no stops): each one's note, or its selector. A
   * row skipped whole (it needs docked panels below the host's `dockMinWidth`) is `ok` with one entry that says so.
   */
  readonly skipped: string[];
}
