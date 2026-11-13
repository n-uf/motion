/**
 * The panels model: plain data and the pure changes on it.
 *
 * Panels have string ids. Each side holds full-height columns (outer edge first), each column one or more panels
 * top to bottom and its own width. Opt-in, the top and bottom edges hold a band each: its panels side by side, left to
 * right, sharing its width, at its own height. A panel may instead float, in page space (it moves with the page) or pinned in
 * view space (it stays put). A logical clock per panel (opened, used) is what give-way reads; every change here that
 * counts as a use moves it on. Nothing here reads a host clock: the next tick is one past the latest in the state.
 */
import type { Rect, Size } from "../geometry";

export type Side = "left" | "right";
export const SIDES: readonly Side[] = ["left", "right"];

/** A band's edge: a horizontal dock along the stage's top or bottom (opt-in, `PanelsOptions.bands`). */
export type Edge = "top" | "bottom";
export const EDGES: readonly Edge[] = ["top", "bottom"];
/** Where a panel may dock: a side's columns or an edge's band. */
export type Place = Side | Edge;

/** A band's height limits and natural height when a def gives none. */
export const BAND_SIZE: { readonly min: number; readonly max: number; readonly natural: number } = { min: 120, max: 480, natural: 200 };

/** How an edge's band lies: "reserved" shortens the pages, "overlay" lies over them; between the columns, or full width. */
export interface BandOption {
  readonly mode: "reserved" | "overlay";
  readonly span: "between" | "full";
}

/** Room kept clear along the pages' edges, px. */
export type Reserve = Readonly<Partial<Record<"top" | "right" | "bottom" | "left", number>>>;

/**
 * What a consumer says about a panel: its width limits docked, its size limits floating, and where it may go. No
 * words: names and titles are the consumer's.
 */
export interface PanelDef {
  readonly id: string;
  /** A docked column's width limits and its natural width. */
  readonly width: { readonly min: number; readonly max: number; readonly natural: number };
  /**
   * Its height as a section of a stack column (opt-in): it gets its natural height, the column's last open section
   * takes the rest, and when the column is short sections fold to bars by give-way. Without it a section shares the
   * column's height equally with the others, as before.
   */
  readonly height?: { readonly min: number; readonly natural: number };
  /** A float's size limits and natural size (default: its natural width, 360 px tall, no smaller than 160 × 120). */
  readonly float?: { readonly min: Size; readonly natural: Size };
  /** Where it may dock (default: both sides, and every edge that has a band). */
  readonly sides?: readonly Place[];
  /** A band's height limits and natural height (default `BAND_SIZE`: min 120, max 480, natural 200). */
  readonly band?: { readonly min: number; readonly max: number; readonly natural: number };
  /** May it float (default: yes). */
  readonly floats?: boolean;
}

/**
 * A full-height column: its panels top to bottom, and its stored width (the layout clamps it to its panels' limits).
 * `show` "tabs" shows one panel at a time under a strip of tabs: `active` (default, or when `active` isn't one of
 * them: the first panel in the column that isn't closed).
 */
export interface Column {
  readonly panels: readonly string[];
  readonly width: number;
  readonly show?: "stack" | "tabs";
  readonly active?: string;
}

/** A floating panel: `rect` in page space, or in view space when `pinned`. */
export interface FloatAt {
  readonly id: string;
  readonly rect: Rect;
  readonly pinned?: boolean;
}

/** A band: its panels left to right, sharing its width, and its stored height (the layout clamps it to their limits). */
export interface Band {
  readonly panels: readonly string[];
  readonly height: number;
}

/** Logical times: when a panel was last opened, and last used (opened, focused, moved or unfolded). */
export interface Clock {
  readonly opened: number;
  readonly used: number;
}

export interface PanelsState {
  /** Each side's columns, from the outer edge inward. */
  readonly sides: Readonly<Record<Side, readonly Column[]>>;
  /** Floating panels; a later one is on top. */
  readonly floats: readonly FloatAt[];
  /** Folded by hand (give-way never writes this). */
  readonly folded: readonly string[];
  /** Docked panels kept open: their columns give way last. */
  readonly kept: readonly string[];
  /** Not shown at all (they keep their place, for when they open again). */
  readonly closed: readonly string[];
  readonly clock: Readonly<Record<string, Clock>>;
  /** Each edge's band (absent: no band panels). An emptied band goes from the state. */
  readonly bands?: Readonly<Partial<Record<Edge, Band>>>;
}

/** The page's offset and scale in the view: a page point p shows at `x + p.x * scale`, `y + p.y * scale`. */
export interface View {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}
export const IDENTITY_VIEW: View = { x: 0, y: 0, scale: 1 };

/** Who gives way first: the oldest or the newest, by when they were last used or last opened. */
export interface GiveWay {
  readonly order: "oldest" | "newest";
  readonly by: "used" | "opened";
}

export interface PanelsOptions {
  /** Default: `{ order: "oldest", by: "used" }`, so the panel used longest ago gives way first. */
  readonly giveWay: GiveWay;
  /** "clamp" keeps floats in the view at layout time; "free" never moves them. Default "clamp". */
  readonly floats: "clamp" | "free";
  /**
   * Where a column folded by hand goes (default "rail"): to its side's rail, or ("ride") as title bars on top of the
   * side's first open column, until every column on that side is folded. Give-way's folds always go to the rail.
   */
  readonly fold: "rail" | "ride";
  /** How much of a float wider than the view stays in it, px (default 48). */
  readonly floatVisible: number;
  /** The pages' minimum width (default 320). */
  readonly pagesMin: number;
  /** The page's offset and scale (default: identity). */
  readonly view: View;
  /**
   * A title bar's height: a panel folded in a column, a folded float, a riding column, and the part of a float the
   * clamp keeps in the view (default 28).
   */
  readonly bar: number;
  /** A rail's width (default 36). */
  readonly rail: number;
  /** A rail segment's height, and the gap above the first one (defaults 36 and 4). */
  readonly segment: number;
  readonly railInset: number;
  /** A tabbed column's strip height (default 28). */
  readonly tabs: number;
  /** Which edges have a band, and how it lies (default: none). */
  readonly bands: Readonly<Partial<Record<Edge, BandOption>>>;
  /** The pages' minimum height; only bands give way to it (default 240). */
  readonly pagesMinHeight: number;
  /** Room kept clear at the pages' edges for a toolbar the app draws, px (default: none). */
  readonly reserve: Reserve;
}

export const DEFAULT_PANELS_OPTIONS: PanelsOptions = {
  giveWay: { order: "oldest", by: "used" },
  floats: "clamp",
  fold: "rail",
  floatVisible: 48,
  pagesMin: 320,
  view: IDENTITY_VIEW,
  bar: 28,
  rail: 36,
  segment: 36,
  railInset: 4,
  tabs: 28,
  bands: {},
  pagesMinHeight: 240,
  reserve: {},
};

/** A float's size when its def gives none: this tall, and never smaller than FLOAT_MIN. */
export const FLOAT_HEIGHT = 360;
export const FLOAT_MIN: Size = { width: 160, height: 120 };

// --- reading the state ---------------------------------------------------------------------------------------------

const without = <T>(list: readonly T[], x: T): T[] => list.filter((y) => y !== x);
const withOnce = <T>(list: readonly T[], x: T): T[] => (list.includes(x) ? [...list] : [...list, x]);

/** Where a panel is: a column (side and index), a band (edge and index, left to right), floating, or nowhere. */
export type Where =
  | { readonly kind: "column"; readonly side: Side; readonly index: number }
  | { readonly kind: "band"; readonly edge: Edge; readonly index: number }
  | { readonly kind: "float"; readonly float: FloatAt }
  | { readonly kind: "none" };

export function whereIs(state: PanelsState, id: string): Where {
  for (const side of SIDES) {
    const index = state.sides[side].findIndex((c) => c.panels.includes(id));
    if (index >= 0) return { kind: "column", side, index };
  }
  for (const edge of EDGES) {
    const index = state.bands?.[edge]?.panels.indexOf(id) ?? -1;
    if (index >= 0) return { kind: "band", edge, index };
  }
  const float = state.floats.find((f) => f.id === id);
  return float ? { kind: "float", float } : { kind: "none" };
}

/** One past the latest logical time in the state. */
export const tick = (state: PanelsState): number => Object.values(state.clock).reduce((m, c) => Math.max(m, c.opened, c.used), 0) + 1;

const bump = (state: PanelsState, id: string, opened: boolean): PanelsState => {
  const t = tick(state);
  const was = state.clock[id] ?? { opened: 0, used: 0 };
  return { ...state, clock: { ...state.clock, [id]: { opened: opened ? t : was.opened, used: t } } };
};

export const defOf = (defs: readonly PanelDef[], id: string): PanelDef | undefined => defs.find((d) => d.id === id);

/** A float's size limits and natural size from its def. */
export function floatSize(def: PanelDef | undefined): { min: Size; natural: Size } {
  if (def?.float) return { min: def.float.min, natural: def.float.natural };
  const width = Math.max(FLOAT_MIN.width, def?.width.natural ?? FLOAT_MIN.width);
  return { min: FLOAT_MIN, natural: { width, height: FLOAT_HEIGHT } };
}

/** A band's height limits and natural height from a def (`BAND_SIZE` when it gives none). */
export const bandSize = (def: PanelDef | undefined): { min: number; max: number; natural: number } => ({ ...(def?.band ?? BAND_SIZE) });

/** A band's height as the layout takes it: its stored height clamped to its panels' limits (the largest min, the smallest max). */
export function bandHeight(defs: readonly PanelDef[] | undefined, band: Band): number {
  if (!defs) return band.height;
  const ds = band.panels.map((id) => bandSize(defOf(defs, id)));
  const lo = Math.max(0, ...ds.map((d) => d.min));
  const hi = Math.max(lo, Math.min(...ds.map((d) => d.max)));
  return Math.min(Math.max(Number.isFinite(band.height) ? band.height : lo, lo), hi);
}

/** The bands with `edge` set to `band`, or without it when null; no `bands` at all once none is left. */
const withBand = (state: PanelsState, edge: Edge, band: Band | null): PanelsState => {
  const { bands: _b, ...rest } = state;
  const bands: Partial<Record<Edge, Band>> = { ...state.bands };
  if (band && band.panels.length) bands[edge] = band;
  else delete bands[edge];
  return EDGES.some((e) => bands[e]) ? { ...rest, bands } : rest;
};

/**
 * A panel's own width, for a new column made for it: the width of the column it is in, clamped to its own limits;
 * in a band, floating or nowhere, its natural width.
 */
export function ownWidth(defs: readonly PanelDef[], state: PanelsState, id: string): number {
  const def = defOf(defs, id);
  const w = whereIs(state, id);
  const lo = def?.width.min ?? 0;
  const hi = Math.max(lo, def?.width.max ?? Infinity);
  if (w.kind === "column") return Math.min(Math.max(state.sides[w.side][w.index]!.width, lo), hi);
  return def?.width.natural ?? lo;
}

// --- building one --------------------------------------------------------------------------------------------------

export interface PanelsStart {
  /** Each side's columns from the outer edge inward, each a list of panel ids top to bottom. */
  readonly left?: readonly (readonly string[])[];
  readonly right?: readonly (readonly string[])[];
  /** Each edge's band, its panels left to right (it takes the tallest natural band height, within their limits). */
  readonly top?: readonly string[];
  readonly bottom?: readonly string[];
  /** Floating panels: where (page space, or view space when pinned); the size defaults to the def's natural size. */
  readonly floats?: readonly { readonly id: string; readonly x: number; readonly y: number; readonly width?: number; readonly height?: number; readonly pinned?: boolean }[];
  readonly folded?: readonly string[];
  readonly kept?: readonly string[];
  readonly closed?: readonly string[];
}

/**
 * A state from a plain start: each column as wide as the widest natural width of its panels (within their limits),
 * each float its natural size. The clock counts up in the order the panels are listed (left, right, top, bottom,
 * floats), so the last one listed is the newest.
 */
export function createPanels(defs: readonly PanelDef[], start: PanelsStart): PanelsState {
  const column = (ids: readonly string[]): Column => {
    const ds = ids.map((id) => defOf(defs, id));
    const lo = Math.max(0, ...ds.map((d) => d?.width.min ?? 0));
    const hi = Math.max(lo, Math.min(...ds.map((d) => d?.width.max ?? Infinity)));
    const natural = Math.max(0, ...ds.map((d) => d?.width.natural ?? 0));
    return { panels: [...ids], width: Math.min(Math.max(natural, lo), hi) };
  };
  const floats = (start.floats ?? []).map((f): FloatAt => {
    const n = floatSize(defOf(defs, f.id)).natural;
    return { id: f.id, rect: { x: f.x, y: f.y, width: f.width ?? n.width, height: f.height ?? n.height }, ...(f.pinned ? { pinned: true } : {}) };
  });
  const sides = { left: (start.left ?? []).map(column), right: (start.right ?? []).map(column) };
  const bands: Partial<Record<Edge, Band>> = {};
  for (const edge of EDGES) {
    const ids = start[edge] ?? [];
    if (!ids.length) continue;
    const natural = Math.max(0, ...ids.map((id) => bandSize(defOf(defs, id)).natural));
    bands[edge] = { panels: [...ids], height: bandHeight(defs, { panels: ids, height: natural }) };
  }
  const order = [...sides.left, ...sides.right]
    .flatMap((c) => c.panels)
    .concat(EDGES.flatMap((e) => bands[e]?.panels ?? []))
    .concat(floats.map((f) => f.id));
  const clock: Record<string, Clock> = {};
  order.forEach((id, i) => (clock[id] = { opened: i + 1, used: i + 1 }));
  const s: PanelsState = { sides, floats, folded: [...(start.folded ?? [])], kept: [...(start.kept ?? [])], closed: [...(start.closed ?? [])], clock };
  return EDGES.some((e) => bands[e]) ? { ...s, bands } : s;
}

// --- changes -------------------------------------------------------------------------------------------------------

/**
 * The state with `id` taken out of its column (an emptied column goes), its band (an emptied band goes, and its height
 * is forgotten) or the floats. Nothing else changes.
 */
export function liftPanel(state: PanelsState, id: string): PanelsState {
  // A tabbed column whose active panel leaves shows its first panel again.
  const out = (c: Column): Column => {
    const { active: _a, ...rest } = c;
    return { ...(c.active === id ? rest : c), panels: without(c.panels, id) };
  };
  const lift = (cols: readonly Column[]): Column[] => cols.map(out).filter((c) => c.panels.length > 0);
  let s: PanelsState = { ...state, sides: { left: lift(state.sides.left), right: lift(state.sides.right) }, floats: state.floats.filter((f) => f.id !== id) };
  for (const edge of EDGES) {
    const b = s.bands?.[edge];
    if (b?.panels.includes(id)) s = withBand(s, edge, { ...b, panels: without(b.panels, id) });
  }
  return s;
}

/**
 * Open a panel: it shows again where it was, and it is the newest opened and used. A panel placed nowhere goes into
 * a new innermost column on `at.side`, `at.width` wide, or with `at.edge` at the right end of that edge's band (a new
 * band is `at.height` tall, default `BAND_SIZE.natural`; the layout clamps it); without `at` it stays placed nowhere.
 * In a tabbed column it becomes the tab that shows, as a drop into the column does.
 */
export function open(state: PanelsState, id: string, at?: { readonly side: Side; readonly width: number } | { readonly edge: Edge; readonly height?: number }): PanelsState {
  let s: PanelsState = { ...state, closed: without(state.closed, id) };
  if (at && whereIs(s, id).kind === "none") {
    if ("edge" in at) {
      const b = s.bands?.[at.edge];
      const panels = [...(b?.panels ?? []), id];
      // The band shows, as a drop into it does: a band folded by hand unfolds as a whole.
      s = withBand({ ...s, folded: s.folded.filter((x) => !panels.includes(x)) }, at.edge, { panels, height: b?.height ?? at.height ?? BAND_SIZE.natural });
    } else s = { ...s, sides: { ...s.sides, [at.side]: [...s.sides[at.side], { panels: [id], width: at.width }] } };
  }
  const w = whereIs(s, id);
  if (w.kind === "column" && s.sides[w.side][w.index]!.show === "tabs") s = { ...s, sides: { ...s.sides, [w.side]: s.sides[w.side].map((c, i) => (i === w.index ? { ...c, active: id } : c)) } };
  return bump(s, id, true);
}

/** Close a panel: it isn't shown, keeps its place, and is no longer kept open. */
export const close = (state: PanelsState, id: string): PanelsState => ({ ...state, closed: withOnce(state.closed, id), kept: without(state.kept, id) });

/** Focus a panel: it is the newest used; a float comes to the top. */
export function focus(state: PanelsState, id: string): PanelsState {
  const f = state.floats.find((x) => x.id === id);
  const s = f ? { ...state, floats: [...state.floats.filter((x) => x !== f), f] } : state;
  return bump(s, id, false);
}

/**
 * Fold a panel to its title bar by hand, or unfold it (unfolding is a use). A band folds as a whole: on a band panel
 * all its panels go into `folded`, or (when every shown panel of the band is folded) all come out.
 */
export function toggleFold(state: PanelsState, id: string): PanelsState {
  const w = whereIs(state, id);
  if (w.kind === "band") {
    const ids = state.bands![w.edge]!.panels;
    // Folded as the layout sees it: every shown panel of the band is folded.
    const shown = ids.filter((x) => !state.closed.includes(x));
    if ((shown.length ? shown : ids).every((x) => state.folded.includes(x))) return bump({ ...state, folded: state.folded.filter((x) => !ids.includes(x)) }, id, false);
    return { ...state, folded: [...state.folded.filter((x) => !ids.includes(x)), ...ids] };
  }
  if (state.folded.includes(id)) return bump({ ...state, folded: without(state.folded, id) }, id, false);
  return { ...state, folded: [...state.folded, id] };
}

/** Keep a docked panel open (its column or band gives way last), or stop keeping it. A floating panel isn't kept. */
export function keep(state: PanelsState, id: string, on: boolean): PanelsState {
  if (!on) return { ...state, kept: without(state.kept, id) };
  const k = whereIs(state, id).kind;
  return k === "column" || k === "band" ? { ...state, kept: withOnce(state.kept, id) } : state;
}

/**
 * Dock a panel in the band on `edge`, at `index` (0 the leftmost; past the end, the rightmost). A new band takes the
 * panel's natural band height (with `defs`; else `BAND_SIZE.natural`). It shows (a band folded by hand unfolds), it is
 * the newest used, and it keeps whether it is kept open.
 */
export function dockBand(state: PanelsState, id: string, edge: Edge, index: number, defs?: readonly PanelDef[]): PanelsState {
  const s = liftPanel(state, id);
  const b = s.bands?.[edge];
  const panels = [...(b?.panels ?? [])];
  panels.splice(Math.max(0, Math.min(index, panels.length)), 0, id);
  const height = b?.height ?? bandSize(defs ? defOf(defs, id) : undefined).natural;
  const s1 = withBand(s, edge, { panels, height });
  return bump({ ...s1, folded: s1.folded.filter((x) => !panels.includes(x)), closed: without(s1.closed, id) }, id, false);
}

/** Store a band's height (the layout clamps it to its panels' limits). Resizing is a use, as for a column. */
export function resizeBand(state: PanelsState, edge: Edge, height: number): PanelsState {
  const b = state.bands?.[edge];
  if (!b || !Number.isFinite(height)) return state;
  const t = tick(state);
  const clock = { ...state.clock };
  for (const id of b.panels) clock[id] = { opened: clock[id]?.opened ?? 0, used: t };
  return { ...withBand(state, edge, { ...b, height: Math.max(0, height) }), clock };
}

export interface DockOptions {
  /** Stack into the column at `index` (at its bottom) instead of making a new column there. */
  readonly into?: boolean;
  /**
   * With `into`: the panel goes before the column's member at this index (0 the top; past the end, or left out, the
   * bottom), counted once the panel is lifted out.
   */
  readonly at?: number;
  /**
   * A new column's width (default: the width of the column the panel leaves, else 0, which the layout clamps to the
   * minimum; from a band, pass `ownWidth` for its natural width, as the drop targets do).
   */
  readonly width?: number;
}

/**
 * Dock a panel on `side`: a new column at `index` (0 the outer edge; past the end, innermost), or with `into` in the
 * column at `index` (counted once the panel is lifted out), at its bottom or before the member `at`. It shows, it is
 * the newest used, and it keeps whether it is kept open.
 */
export function dock(state: PanelsState, id: string, side: Side, index: number, options: DockOptions = {}): PanelsState {
  const w = whereIs(state, id);
  const from = w.kind === "column" ? state.sides[w.side][w.index]!.width : 0;
  const s = liftPanel(state, id);
  const cols = [...s.sides[side]];
  // Into a column: at its bottom, or before the member `at`. Into a tabbed column it is also the tab that shows.
  if (options.into && cols[index]) {
    const panels = [...cols[index]!.panels];
    const at = typeof options.at === "number" && Number.isFinite(options.at) ? Math.max(0, Math.min(Math.floor(options.at), panels.length)) : panels.length;
    panels.splice(at, 0, id);
    cols[index] = { ...cols[index]!, panels, ...(cols[index]!.show === "tabs" ? { active: id } : {}) };
  } else {
    const at = Math.max(0, Math.min(index, cols.length));
    cols.splice(at, 0, { panels: [id], width: options.width ?? from });
  }
  return bump({ ...s, sides: { ...s.sides, [side]: cols }, closed: without(s.closed, id) }, id, false);
}

/** Show a column's panels as tabs (one at a time under a strip), or as a stack again. */
export function showTabs(state: PanelsState, side: Side, index: number, on: boolean): PanelsState {
  const col = state.sides[side][index];
  if (!col) return state;
  const { show: _s, ...stack } = col;
  return { ...state, sides: { ...state.sides, [side]: state.sides[side].map((c, i) => (i === index ? (on ? { ...col, show: "tabs" as const } : stack) : c)) } };
}

/** Make a docked panel the one its column shows (its tab), and the newest used. */
export function activate(state: PanelsState, id: string): PanelsState {
  const w = whereIs(state, id);
  if (w.kind !== "column") return state;
  const sides = { ...state.sides, [w.side]: state.sides[w.side].map((c, i) => (i === w.index ? { ...c, active: id } : c)) };
  return bump({ ...state, sides }, id, false);
}

/**
 * Float a panel at `rect` (page space; view space when pinned). A float stays pinned or not unless `pinned` says;
 * a docked panel floats unpinned. It shows, it is the newest used and on top, and it is no longer kept open.
 */
export function float(state: PanelsState, id: string, rect: Rect, pinned?: boolean): PanelsState {
  const was = state.floats.find((f) => f.id === id);
  const on = pinned ?? !!was?.pinned;
  const s = liftPanel(state, id);
  const f: FloatAt = { id, rect: { ...rect }, ...(on ? { pinned: true } : {}) };
  return bump({ ...s, floats: [...s.floats, f], kept: without(s.kept, id), closed: without(s.closed, id) }, id, false);
}

/** A page-space rect in view space, and back. */
export const toView = (r: Rect, v: View): Rect => ({ ...r, x: v.x + r.x * v.scale, y: v.y + r.y * v.scale });
export const toPage = (r: Rect, v: View): Rect => ({ ...r, x: (r.x - v.x) / v.scale, y: (r.y - v.y) / v.scale });

/**
 * Pin a float to the view, or unpin it to the page. `view` is where the page is now (default: identity): the float
 * doesn't jump, its rect is converted between the two spaces. A float's size is never scaled.
 *
 * `shown` is where the float shows now, in view space (the layout's placed rect for it). When given, its position is
 * converted instead of the stored one, so a float the clamp moved stays where it shows rather than jumping to its
 * stored place. The size stays the stored one: a float folded to a bar, or shrunk by the clamp, keeps its full size.
 */
export function pin(state: PanelsState, id: string, on: boolean, view: View = IDENTITY_VIEW, shown?: Rect): PanelsState {
  return {
    ...state,
    floats: state.floats.map((f): FloatAt => {
      if (f.id !== id || !!f.pinned === on) return f;
      // In view space: where it shows, else where it is stored; at its stored size.
      const seen = shown ? { ...f.rect, x: shown.x, y: shown.y } : f.pinned ? { ...f.rect } : toView(f.rect, view);
      return on ? { id, rect: seen, pinned: true } : { id, rect: toPage(seen, view) };
    }),
  };
}

/**
 * Store a column's width (the layout clamps it to its panels' limits). Resizing is a use: the column's panels are
 * the newest used, so give-way takes room from the other columns, not from the one being resized.
 */
export function resizeColumn(state: PanelsState, side: Side, index: number, width: number): PanelsState {
  const col = state.sides[side][index];
  if (!col || !Number.isFinite(width)) return state;
  const t = tick(state);
  const clock = { ...state.clock };
  for (const id of col.panels) clock[id] = { opened: clock[id]?.opened ?? 0, used: t };
  return { ...state, sides: { ...state.sides, [side]: state.sides[side].map((c, i) => (i === index ? { ...c, width: Math.max(0, width) } : c)) }, clock };
}

/** Store a float's rect (its own space). Resizing is a use. */
export function resizeFloat(state: PanelsState, id: string, rect: Rect): PanelsState {
  if (!state.floats.some((f) => f.id === id)) return state;
  return bump({ ...state, floats: state.floats.map((f) => (f.id === id ? { ...f, rect: { ...rect } } : f)) }, id, false);
}

/** A column's width as the layout takes it: its stored width clamped to its panels' limits (with `defs`). */
export function columnWidth(defs: readonly PanelDef[] | undefined, col: Column): number {
  if (!defs) return col.width;
  const ds = col.panels.map((id) => defOf(defs, id));
  const lo = Math.max(0, ...ds.map((d) => d?.width.min ?? 0));
  const hi = Math.max(lo, Math.min(...ds.map((d) => d?.width.max ?? Infinity)));
  return Math.min(Math.max(Number.isFinite(col.width) ? col.width : lo, lo), hi);
}

/**
 * Two states place the panels the same (columns, their panels and widths, floats and their rects; the clock aside).
 * With `defs`, widths compare as the layout takes them (clamped to the panels' limits), so a stored width past a
 * column's max is the same place as that max.
 */
export function samePlaces(a: PanelsState, b: PanelsState, defs?: readonly PanelDef[]): boolean {
  const cols = (s: PanelsState): string =>
    SIDES.map((side) =>
      s.sides[side]
        .map((c) => `${c.panels.join(",")}@${Math.round(columnWidth(defs, c))}${c.show === "tabs" ? `/tabs:${c.active ?? c.panels[0]}` : ""}`)
        .join("|"),
    ).join("‖");
  const fl = (s: PanelsState): string => s.floats.map((f) => `${f.id}@${Math.round(f.rect.x)},${Math.round(f.rect.y)},${Math.round(f.rect.width)},${Math.round(f.rect.height)}${f.pinned ? "p" : ""}`).join("|");
  const bs = (s: PanelsState): string =>
    EDGES.map((e) => {
      const b = s.bands?.[e];
      return b ? `${b.panels.join(",")}@${Math.round(bandHeight(defs, b))}` : "";
    }).join("‖");
  const set = (l: readonly string[]): string => [...l].sort().join(",");
  return cols(a) === cols(b) && bs(a) === bs(b) && fl(a) === fl(b) && set(a.folded) === set(b.folded) && set(a.kept) === set(b.kept) && set(a.closed) === set(b.closed);
}
