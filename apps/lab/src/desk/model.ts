/**
 * The desk's model, shared by every construction: the panels and documents, the options, the state, and what a
 * layout returns (a placed rect per item). Pure: no DOM.
 */
import type { Rect } from "@n-uf/motion";

export interface Size {
  readonly width: number;
  readonly height: number;
}

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

/**
 * The five tool panels: a title, the height they need (their natural height: the title bar, the sample content's
 * rows and the body's padding, so a section at its natural height shows all of it) and some body text.
 */
export const PANELS = [
  { id: 1, title: "Files", natural: 166, body: "Quarterly plan<br>Meeting notes<br>Reading list<br>Budget draft" },
  { id: 2, title: "Outline", natural: 210, body: "1 Goals<br>2 Scope<br>3 Timeline<br>4 Open questions" },
  { id: 3, title: "Notes", natural: 122, body: "Call back on Monday<br>Book the small room" },
  { id: 4, title: "Inspector", natural: 158, body: "Size 14 KB<br>Modified today<br>Tags: plan, team" },
  { id: 5, title: "History", natural: 166, body: "Opened Meeting notes<br>Renamed Budget draft<br>Moved Reading list" },
] as const;
export const PANEL_IDS: readonly number[] = PANELS.map((p) => p.id);
export const DOC_TITLES = ["Quarterly plan", "Meeting notes", "Reading list", "Budget draft"] as const;
export const MAX_DOCS = DOC_TITLES.length;

export const panelOf = (id: number): (typeof PANELS)[number] => PANELS.find((p) => p.id === id)!;
export const natural = (id: number): number => panelOf(id).natural;
export const panelKey = (id: number): string => `panel:${id}`;
export const docKey = (id: number): string => `doc:${id}`;
export const isPanelKey = (key: string): boolean => key.startsWith("panel:");
export const isDocKey = (key: string): boolean => key.startsWith("doc:");
export const idOf = (key: string): number => Number(key.slice(key.indexOf(":") + 1));
export const titleOf = (key: string): string => (isPanelKey(key) ? panelOf(idOf(key)).title : isDocKey(key) ? DOC_TITLES[(idOf(key) - 1) % DOC_TITLES.length]! : key);

/** Where the toolbar floats (top or bottom) and whether the documents keep a band clear for it; the bottom dock's mode. */
export interface Options {
  readonly toolbar: "top" | "bottom";
  readonly toolbarSpace: "reserved" | "overlay";
  readonly bottom: "reserved" | "overlay" | "off";
  /** The pill's width when its groups need more than the default (toolbar groups); unset: the default. */
  readonly toolbarWidth?: number;
  /** The pill holds no groups: it takes no space and isn't shown (toolbar groups). */
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
  /** The strip scrolled by hand (a drag near the stage's edge), or null: it scrolls to the focus. */
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
  /** Folded away (into a rail, behind a tab): it glides to `rect` and fades out. */
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

/** Where everything is ("toolbar", "panel:<id>", "doc:<id>", "rail:<side>", "tabs:<side>", "track", "thumb"), and how it gave way. */
export interface Layout {
  readonly items: ReadonlyMap<string, Placed>;
  readonly notes: readonly string[];
}

export const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

// --- state changes -------------------------------------------------------------------------------------------------

/** The default arrangement every construction starts from. */
export function initialState(docs: readonly number[] = [1, 2]): DeskState {
  const base: DeskState = {
    docs: [],
    focus: null,
    recent: [...PANEL_IDS],
    folded: [],
    left: [1, 2],
    right: [3, 4],
    bottom: [5],
    closed: [],
    opened: null,
    active: { left: 1, right: 4 },
    torn: [],
    tree: { L: [panelKey(1), panelKey(2)], R: [panelKey(3), panelKey(5)], C: [panelKey(4)] },
    cols: [[panelKey(1), panelKey(2)], [panelKey(3), panelKey(4), panelKey(5)]],
    stripScroll: null,
    stacks: { left: [1, 2], right: [3, 4, 5] },
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

/**
 * Heights for items stacked in `avail`: each gets at least its minimum, the rest of the room is shared in
 * proportion to the minimums (when the minimums don't fit, each gets its minimum).
 */
export function share(avail: number, mins: readonly number[]): number[] {
  const need = mins.reduce((a, b) => a + b, 0);
  const spare = Math.max(0, avail - need);
  return mins.map((m) => m + (need > 0 ? (spare * m) / need : spare / mins.length));
}
