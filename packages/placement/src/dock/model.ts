/**
 * The desk's model: panels and documents, the options, the state every construction keeps, and what a layout
 * returns (a placed rect per item). The panels themselves (their titles and natural heights) come from the
 * consumer as a catalog; see `createDesk`.
 */
import type { Rect, Size } from "../geometry";

export type Side = "left" | "right";

/** Gaps and sizes, in stage px. */
export const G = 6;
/** A toolbar bar's height (the pill is 4 px thinner). */
export const BAR = 34;
/** A rail's width. */
export const RAIL = 34;
/** A folded section's (or a shaded palette's) height: its title bar. */
export const TITLE = 22;
/** A tab row's height (navigator sides and drawers). */
export const TABS = 28;
/** The smallest a tiled document may be where a construction promises it (the tiling tree, the strip). */
export const DOC_MIN: Size = { width: 240, height: 160 };

/** Items are keyed "panel:<id>" and "doc:<id>". */
export const panelKey = (id: number): string => `panel:${id}`;
export const docKey = (id: number): string => `doc:${id}`;
export const isPanelKey = (key: string): boolean => key.startsWith("panel:");
export const isDocKey = (key: string): boolean => key.startsWith("doc:");
export const idOf = (key: string): number => Number(key.slice(key.indexOf(":") + 1));

/** A tool panel: its title and the height its content needs (its natural height, title bar included). */
export interface PanelSpec {
  readonly id: number;
  readonly title: string;
  readonly natural: number;
}

/** Where the panels start. Unset parts follow from the sides (see `createDesk`). */
export interface DeskStart {
  readonly left: readonly number[];
  readonly right: readonly number[];
  readonly bottom: readonly number[];
  readonly active?: { readonly left: number | null; readonly right: number | null };
  readonly tree?: DeskState["tree"];
  readonly cols?: DeskState["cols"];
  readonly stacks?: DeskState["stacks"];
}

/** What a desk is made of: its panels, its documents' titles and where the panels start. */
export interface DeskSpec {
  readonly panels: readonly PanelSpec[];
  /** A document's title (default "Document <id>"). */
  readonly docTitle?: (id: number) => string;
  readonly start: DeskStart;
  /** The panels in the order they were opened (default: as listed); the tiling tree floats the newest first. */
  readonly opened?: readonly number[];
}

/** The catalog every part reads: a panel's natural height, an item's title and age. */
export interface Catalog {
  readonly panelIds: readonly number[];
  readonly natural: (id: number) => number;
  /** An item's title by key ("panel:<id>", "doc:<id>"); any other key is its own title. */
  readonly title: (key: string) => string;
  /** An item's age: higher is newer (panels in the order they were opened, then the documents). */
  readonly born: (key: string) => number;
  readonly start: Required<DeskStart>;
}

/** The catalog for a spec (unset start parts filled in). */
export function catalogOf(spec: DeskSpec): Catalog {
  const byId = new Map(spec.panels.map((p) => [p.id, p]));
  const opened = spec.opened ?? spec.panels.map((p) => p.id);
  const docTitle = spec.docTitle ?? ((id: number) => `Document ${id}`);
  const { left, right, bottom } = spec.start;
  const rest = [...right, ...bottom];
  const start: Required<DeskStart> = {
    left,
    right,
    bottom,
    active: spec.start.active ?? { left: left[0] ?? null, right: right.at(-1) ?? null },
    tree: spec.start.tree ?? { L: left.map(panelKey), R: rest.map(panelKey), C: [] },
    cols: spec.start.cols ?? [left.map(panelKey), rest.map(panelKey)].filter((c) => c.length > 0),
    stacks: spec.start.stacks ?? { left, right: rest },
  };
  return {
    panelIds: spec.panels.map((p) => p.id),
    natural: (id) => byId.get(id)?.natural ?? TITLE,
    title: (key) => (isPanelKey(key) ? (byId.get(idOf(key))?.title ?? key) : isDocKey(key) ? docTitle(idOf(key)) : key),
    born: (key) => (isDocKey(key) ? 1000 + idOf(key) : opened.indexOf(idOf(key)) + 1),
    start,
  };
}

/** Where the toolbar floats (top or bottom) and whether the documents keep a band clear for it; the bottom dock's mode. */
export interface Options {
  readonly toolbar: "top" | "bottom";
  readonly toolbarSpace: "reserved" | "overlay";
  readonly bottom: "reserved" | "overlay" | "off";
  /** The pill's width when its contents need more than the default; unset: the default. */
  readonly toolbarWidth?: number;
  /** The pill holds nothing: it takes no space and isn't shown. */
  readonly toolbarHidden?: boolean;
}
export const DEFAULT_OPTIONS: Options = { toolbar: "top", toolbarSpace: "reserved", bottom: "reserved" };

/** A panel placed freely (torn off, or a palette out of its stack): its top-left corner, null for the default spot. */
export interface Free {
  readonly id: number;
  readonly at: { readonly x: number; readonly y: number } | null;
}

/**
 * Everything any construction keeps. Each construction has its own copy (its own arrangement) and reads only what
 * it uses; the open documents are the same in all of them.
 */
export interface DeskState {
  /** Open document ids, in open order. */
  readonly docs: readonly number[];
  readonly focus: number | null;
  /** Panel ids, least recently used first: what folds or shades first when height runs out. */
  readonly recent: readonly number[];
  /** Sections folded (palettes shaded) by hand. */
  readonly folded: readonly number[];
  /** Docks, navigator sides and drawers: the panels on each side, top to bottom (tabs: left to right). */
  readonly left: readonly number[];
  readonly right: readonly number[];
  /** The bottom dock's panels (edge docks only). */
  readonly bottom: readonly number[];
  /** Docks or drawers folded to their rail by hand. */
  readonly closed: readonly Side[];
  /** The side opened last by hand: when width runs out it folds last. */
  readonly opened: Side | null;
  /** The panel showing on each side (navigator, drawers). */
  readonly active: { readonly left: number | null; readonly right: number | null };
  /** Panels torn off a dock, floating (edge docks + tear-off). */
  readonly torn: readonly Free[];
  /** The tiling tree: item keys in the left column, the right column and the centre (dwindle order). */
  readonly tree: { readonly L: readonly string[]; readonly R: readonly string[]; readonly C: readonly string[] };
  /** The scrolling strip: its columns, left to right, each a list of item keys top to bottom. */
  readonly cols: readonly (readonly string[])[];
  /** The strip scrolled by hand, or null: it scrolls to the focus. */
  readonly stripScroll: number | null;
  /** Palettes: the corner stacks, top to bottom, and the ones placed anywhere. */
  readonly stacks: { readonly left: readonly number[]; readonly right: readonly number[] };
  readonly free: readonly Free[];
}

/** How an item is drawn. */
export type Look =
  | "pill" // the toolbar floating as a rounded pill
  | "bar" // the toolbar as a bar across the top
  | "section" // a panel open in a dock
  | "header" // a section folded (or a palette shaded) to its title bar
  | "float" // a panel floating over the documents
  | "palette" // a floating panel that reserves its footprint
  | "tile" // a panel tiled like a document
  | "bare" // a panel under a tab row: no title bar of its own
  | "doc"
  | "rail"
  | "tabs"
  | "track"
  | "thumb";

/** Stacking layers, bottom to top. */
export const LAYER = { doc: 1, dock: 2, palette: 3, overlay: 4, float: 5, toolbar: 6 } as const;

/** One item as a layout places it. */
export interface Placed {
  readonly rect: Rect;
  readonly look: Look;
  readonly layer: number;
  /** Folded away (into a rail, behind a tab): it goes to `rect`, hidden. */
  readonly hidden?: boolean;
  /** Never laid out below this (where the construction promises it). */
  readonly min?: Partial<Size>;
  /** It may lie outside the stage (the strip scrolls). */
  readonly offStage?: boolean;
  /** A rail's icons or a tab row's tabs (panel ids), and the active tab. */
  readonly icons?: readonly number[];
  readonly tabs?: readonly number[];
  readonly active?: number | null;
  /** Drawn with an accent outline (the bottom dock). */
  readonly accent?: boolean;
  /** Drawn with a shadow (it floats over something). */
  readonly shadow?: boolean;
}

/**
 * How a layout gave way (or what it is worth knowing about it):
 *
 * - `bottom-folded`: the bottom dock folded to its header; `dock-folded`: a side dock folded to its rail (`side`);
 * - `sections-folded`: sections folded to their headers by themselves, least recently used first;
 * - `torn-floating`: panels torn off a dock float (`items`); `torn-shaded`: some shade because they don't fit;
 * - `columns-railed`: the tiling tree's side columns are folded to rails (`side` when only one);
 * - `tiles-float`: tiles that broke a minimum float, newest first (`items`);
 * - `tabs-folded`: a tabbed side folded to icon tabs (`side`); `drawer-over`: a drawer slides over the
 *   documents (`side`);
 * - `column-split`: a strip column split in two (`items`); `strip-scrolls`: the strip is wider than the stage;
 * - `stacks-merged`: both palette stacks share one corner; `palettes-shaded`: palettes shaded to title bars;
 * - `palettes-cover`, `docs-room`: how much of the documents palettes cover, and how much room they leave.
 */
export type NoteCode =
  | "bottom-folded"
  | "dock-folded"
  | "sections-folded"
  | "torn-floating"
  | "torn-shaded"
  | "columns-railed"
  | "tiles-float"
  | "tabs-folded"
  | "drawer-over"
  | "column-split"
  | "strip-scrolls"
  | "stacks-merged"
  | "palettes-shaded"
  | "palettes-cover"
  | "docs-room";

/**
 * One note on a layout. `code` (and `side`, `items` where they apply) is the contract; `text` says it in English for
 * people, and its wording may change in any release.
 */
export interface Note {
  readonly code: NoteCode;
  readonly text: string;
  readonly side?: Side;
  /** The item keys it is about. */
  readonly items?: readonly string[];
}

/** Where everything is ("toolbar", "panel:<id>", "doc:<id>", "rail:<side>", "tabs:<side>", "track", "thumb"), and how it gave way. */
export interface Layout {
  readonly items: ReadonlyMap<string, Placed>;
  readonly notes: readonly Note[];
}

// --- state changes -------------------------------------------------------------------------------------------------

/** The arrangement a catalog starts from, with these documents open. */
export function startState(cat: Catalog, docs: readonly number[] = [1, 2]): DeskState {
  const st = cat.start;
  const base: DeskState = {
    docs: [],
    focus: null,
    recent: [...cat.panelIds],
    folded: [],
    left: [...st.left],
    right: [...st.right],
    bottom: [...st.bottom],
    closed: [],
    opened: null,
    active: st.active,
    torn: [],
    tree: st.tree,
    cols: st.cols,
    stripScroll: null,
    stacks: st.stacks,
    free: [],
  };
  return withDocs(base, docs, docs.at(-1) ?? null);
}

/**
 * The same state with these documents open: new ones join the tiling tree's centre (the first one at its front)
 * and get a strip column of their own after the last document column; closed ones leave both.
 */
export function withDocs(s: DeskState, docs: readonly number[], focus: number | null): DeskState {
  const keys = docs.map(docKey);
  const gone = (k: string): boolean => isDocKey(k) && !keys.includes(k);
  let C = s.tree.C.filter((k) => !gone(k));
  let cols = s.cols.map((c) => c.filter((k) => !gone(k))).filter((c) => c.length > 0);
  const has = (k: string): boolean => [...s.tree.L, ...s.tree.R, ...C].includes(k);
  for (const k of keys) {
    if (!has(k)) C = C.some(isDocKey) || C.length === 0 ? [...C, k] : [k, ...C];
    if (!cols.some((c) => c.includes(k))) {
      const lastDoc = cols.map((c) => c.some(isDocKey)).lastIndexOf(true);
      const at = lastDoc >= 0 ? lastDoc + 1 : Math.min(1, cols.length);
      cols = [...cols.slice(0, at), [k], ...cols.slice(at)];
    }
  }
  const L = s.tree.L.filter((k) => !gone(k));
  const R = s.tree.R.filter((k) => !gone(k));
  const f = focus !== null && docs.includes(focus) ? focus : (docs.at(-1) ?? null);
  // A new focus: the strip scrolls to it again.
  return { ...s, docs: [...docs], focus: f, tree: { L, R, C }, cols, stripScroll: f === s.focus ? s.stripScroll : null };
}

/** Panel `id` was used: it is the last to fold when height runs out. */
export const touch = (s: DeskState, id: number): DeskState => ({ ...s, recent: [...s.recent.filter((x) => x !== id), id] });

/** Fold or unfold a section (shade or unshade a palette) by hand; unfolding is a use. */
export function toggleFold(s: DeskState, id: number): DeskState {
  const folded = s.folded.includes(id);
  const next = { ...s, folded: folded ? s.folded.filter((x) => x !== id) : [...s.folded, id] };
  return folded ? touch(next, id) : next;
}

/** Fold a dock (or drawer) to its rail by hand, or open it again (then it folds last when width runs out). */
export function toggleClosed(s: DeskState, side: Side): DeskState {
  const closed = s.closed.includes(side);
  return closed ? { ...s, closed: s.closed.filter((x) => x !== side), opened: side } : { ...s, closed: [...s.closed, side] };
}

/** Show panel `id` on its side (navigator, drawers). */
export const withActive = (s: DeskState, side: Side, id: number): DeskState => touch({ ...s, active: { ...s.active, [side]: id } }, id);

/** The state with `key` lifted out of wherever it is (before a drop puts it somewhere). */
export function liftOut(s: DeskState, key: string): DeskState {
  const dropK = (l: readonly string[]): string[] => l.filter((k) => k !== key);
  const base: DeskState = { ...s, tree: { L: dropK(s.tree.L), R: dropK(s.tree.R), C: dropK(s.tree.C) }, cols: s.cols.map(dropK).filter((c) => c.length > 0) };
  if (!isPanelKey(key)) return base;
  const id = idOf(key);
  const drop = (l: readonly number[]): number[] => l.filter((x) => x !== id);
  return {
    ...base,
    left: drop(s.left),
    right: drop(s.right),
    bottom: drop(s.bottom),
    torn: s.torn.filter((f) => f.id !== id),
    free: s.free.filter((f) => f.id !== id),
    stacks: { left: drop(s.stacks.left), right: drop(s.stacks.right) },
    active: { left: s.active.left === id ? null : s.active.left, right: s.active.right === id ? null : s.active.right },
  };
}
