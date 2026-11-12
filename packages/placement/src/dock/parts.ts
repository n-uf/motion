/**
 * The parts the desk constructions are built from, each pure: the toolbar pill, the documents' tiles, natural-height
 * sections (the last open one takes the rest; the least recently used fold to headers), rails, the edge docks'
 * geometry, the tiling tree's columns, the scrolling strip, tabbed sides and floating palettes.
 */
import { clampInto, rect, type Rect, type Size } from "../geometry";
import { columnHeights, dwindle, giveWay, masterStack } from "./arrange";
import { BAR, DOC_MIN, G, LAYER, RAIL, TABS, TITLE, docKey, idOf, isDocKey, panelKey, type Catalog, type DeskState, type Note, type Options, type Placed, type Side } from "./model";

export type Out = Map<string, Placed>;

export const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

// --- the toolbar pill and the documents ----------------------------------------------------------------------------

/** The shortest a pill gets (unless there is less room than that). */
export const PILL_MIN = 60;

/**
 * The toolbar pill, floating at the top or the bottom of the band [y0, y1] above a region `cx`..`cx + cw`; returns
 * the pill and the band left for the documents (reserved: they keep clear of it; overlay: it floats over them).
 */
export function pill(opt: Options, cx: number, cw: number, y0: number, y1: number): { placed: Placed; top: number; bottom: number } {
  const pw = Math.max(PILL_MIN, Math.min(opt.toolbarWidth ?? 320, cw - 24));
  const ph = BAR - 4;
  const atTop = opt.toolbar === "top";
  // A hidden pill keeps no band clear, as if it floated.
  const overlay = opt.toolbarSpace === "overlay" || !!opt.toolbarHidden;
  return {
    placed: { rect: rect(cx + cw / 2 - pw / 2, atTop ? y0 + G : y1 - G - ph, pw, ph), look: "pill", layer: LAYER.toolbar, shadow: overlay, ...(opt.toolbarHidden ? { hidden: true } : {}) },
    top: atTop && !overlay ? y0 + BAR + 2 * G : y0 + G,
    bottom: !atTop && !overlay ? y1 - BAR - 2 * G : y1 - G,
  };
}

/** The toolbar as a bar across the top of the stage. */
export const bar = (W: number): Placed => ({ rect: rect(0, 0, W, BAR), look: "bar", layer: LAYER.toolbar });

/** The documents in `r`, master and stack: the first takes 56 % of the width, the rest stack on the right. */
export function tiles(out: Out, r: Rect, ids: readonly number[], min?: Size): void {
  for (const [id, rr] of masterStack(ids, r, G, 0.56)) out.set(docKey(id), { rect: rr, look: "doc", layer: LAYER.doc, ...(min ? { min } : {}) });
}

// --- sections and rails --------------------------------------------------------------------------------------------

/**
 * The ones of `ids` to fold, least recently used first, until what stays open fits `avail`. An accordion keeps one
 * section open whatever (`keepOne`); a palette stack shades even its last palette rather than run off the stage.
 */
export function lruFold(s: DeskState, ids: readonly number[], avail: number, open: (id: number) => number, closed: number, keepOne = true): number[] {
  const byHand = ids.filter((id) => s.folded.includes(id));
  const auto: number[] = [];
  const isOpen = (id: number): boolean => !byHand.includes(id) && !auto.includes(id);
  const need = (): number => ids.reduce((sum, id) => sum + (isOpen(id) ? open(id) : closed), 0) + G * (ids.length - 1);
  const order = [...s.recent].filter((id) => ids.includes(id));
  for (const id of order) {
    if (need() <= avail || (keepOne && ids.filter(isOpen).length <= 1)) break;
    if (isOpen(id)) auto.push(id);
  }
  return [...byHand, ...auto];
}

/**
 * Natural-height sections in x, y, w, h: each open section takes its natural height and the last open one takes
 * the rest; the least recently used fold to headers until the open ones fit. Returns how many folded by themselves.
 */
export function accordion(cat: Catalog, out: Out, s: DeskState, x: number, y: number, w: number, h: number, ids: readonly number[]): number {
  const folded = lruFold(s, ids, h, cat.natural, TITLE);
  const open = ids.filter((id) => !folded.includes(id));
  const room = h - G * (ids.length - 1) - TITLE * (ids.length - open.length);
  const last = open.at(-1);
  const rest = room - open.reduce((sum, id) => sum + (id === last ? 0 : cat.natural(id)), 0);
  let cy = y;
  for (const id of ids) {
    const i = open.indexOf(id);
    const n = cat.natural(id);
    const hh = i < 0 ? TITLE : id === last ? Math.max(n, rest) : n;
    out.set(panelKey(id), { rect: rect(x, cy, w, hh), look: i >= 0 ? "section" : "header", layer: LAYER.dock, ...(i >= 0 ? { min: { height: n } } : {}) });
    cy += hh + G;
  }
  return folded.filter((id) => !s.folded.includes(id)).length;
}

/** A rail of icons at x, y; the rect of its icon `i`. */
export const railIcon = (x: number, y: number, i: number): Rect => rect(x + 6, y + 10 + i * 32, RAIL - 12, 24);

/** A rail (a column whose panels are all folded) at x, y, h: one icon per panel. */
export function rail(out: Out, side: Side, x: number, y: number, h: number, ids: readonly number[], hidden = false): void {
  out.set(`rail:${side}`, { rect: rect(x, y, RAIL, h), look: "rail", layer: LAYER.dock, icons: ids, ...(hidden ? { hidden } : {}) });
}

/** Panels folded into a rail: hidden, each at its icon at `w` × its natural height. */
export function intoRail(cat: Catalog, out: Out, x: number, y: number, w: number, ids: readonly number[], side: Side): void {
  ids.forEach((id, i) => {
    const icon = railIcon(x, y, i);
    out.set(panelKey(id), { rect: rect(side === "left" ? icon.x : icon.x + icon.width - w, icon.y, w, cat.natural(id)), look: "section", layer: LAYER.dock, hidden: true });
  });
}

// --- edge docks ----------------------------------------------------------------------------------------------------

/**
 * The dock width (rail excluded, its sections 240 px wide after the gap) and the narrowest the documents may get
 * before a dock folds.
 */
export const DOCK = 246;
export const WORK_MIN = 380;
/** The bottom dock's height when open, and the most of the stage's height it takes. */
export const BOTTOM = 190;
export const BOTTOM_SHARE = 0.36;

/** What the edge docks put where: shared by their layouts and their drop targets. */
export interface DockGeometry {
  /** The side docks' height (less the bottom dock's in full-width mode). */
  readonly h: number;
  /** The bottom dock's height (its header's when folded; 0 when off). */
  readonly bh: number;
  readonly lOpen: boolean;
  readonly rOpen: boolean;
  /** The right dock's panels (the bottom dock's join them when it is off). */
  readonly right: readonly number[];
  readonly bottomOn: boolean;
  readonly bottomRect: Rect | null;
  /** The documents' band, left to right. */
  readonly x0: number;
  readonly x1: number;
}

/**
 * The edge docks' give-way: the bottom dock folds to its header when the stage is short, and a whole side dock
 * folds to its rail when the documents would get narrower than WORK_MIN (the right one first, unless it was opened
 * last by hand). `mode`: the bottom dock between the side docks, or across the full width under them.
 */
export function dockGeometry(cat: Catalog, s: DeskState, size: Size, opt: Options, mode: "between" | "full", notes: Note[] = []): DockGeometry {
  const { width: W, height: H } = size;
  const bottomOn = opt.bottom !== "off" && s.bottom.length > 0;
  const right = bottomOn ? s.right : [...s.right, ...s.bottom];
  const bottomFolded = bottomOn && (H < 480 || s.bottom.every((id) => s.folded.includes(id)));
  // Open, it is BOTTOM tall, never more than BOTTOM_SHARE of the stage (but never below what its panels need).
  const bh = !bottomOn ? 0 : bottomFolded ? TITLE : Math.max(...s.bottom.map(cat.natural), Math.min(BOTTOM, BOTTOM_SHARE * H));
  if (bottomOn && H < 480) notes.push({ code: "bottom-folded", text: "bottom dock folded to its header" });
  const full = mode === "full";
  const h = full && bottomOn ? H - bh - G : H;
  let lOpen = s.left.length > 0 && !s.closed.includes("left");
  let rOpen = right.length > 0 && !s.closed.includes("right");
  const work = (): number => W - 2 * RAIL - (lOpen ? DOCK : 0) - (rOpen ? DOCK : 0) - 2 * G;
  for (const side of s.opened === "right" ? (["left", "right"] as const) : (["right", "left"] as const)) {
    if (work() >= WORK_MIN) break;
    if (side === "right" && rOpen) {
      rOpen = false;
      notes.push({ code: "dock-folded", side: "right", text: "right dock folded to its rail" });
    } else if (side === "left" && lOpen) {
      lOpen = false;
      notes.push({ code: "dock-folded", side: "left", text: "left dock folded to its rail" });
    }
  }
  const x0 = RAIL + (lOpen ? DOCK : 0) + G;
  const x1 = W - RAIL - (rOpen ? DOCK : 0) - G;
  const bottomRect = bottomOn ? (full ? rect(G, H - G - bh, W - 2 * G, bh) : rect(x0, H - G - bh, x1 - x0, bh)) : null;
  return { h, bh, lOpen, rOpen, right, bottomOn, bottomRect, x0, x1 };
}

/** The width of a torn-off panel (its height is its natural height). */
export const TORN_W = 200;

// --- the tiling tree -----------------------------------------------------------------------------------------------

/** The smallest a tile may be: a document's minimum, or a panel at its natural height. */
export const tileMin = (cat: Catalog, key: string): Size => (isDocKey(key) ? DOC_MIN : { width: 150, height: cat.natural(idOf(key)) });
/** A side column's width. */
export const TREE_COLUMN = 180;

/** The tree's tiles laid out (no floating): the left and right columns, the centre by dwindle. */
export function treeTiles(cat: Catalog, tree: DeskState["tree"], area: Rect): Map<string, Rect> {
  const res = new Map<string, Rect>();
  let x0 = area.x;
  let x1 = area.x + area.width;
  // A side column's tiles take their natural height, the last one the rest.
  const column = (list: readonly string[], x: number): void => {
    const heights = columnHeights(area.height, list.map((k) => tileMin(cat, k).height), G);
    let y = area.y;
    list.forEach((k, i) => {
      res.set(k, rect(x, y, TREE_COLUMN, heights[i]!));
      y += heights[i]! + G;
    });
  };
  if (tree.L.length) {
    column(tree.L, x0);
    x0 += TREE_COLUMN + G;
  }
  if (tree.R.length) {
    column(tree.R, x1 - TREE_COLUMN);
    x1 -= TREE_COLUMN + G;
  }
  dwindle(rect(x0, area.y, x1 - x0, area.height), tree.C.length, G).forEach((r, i) => res.set(tree.C[i]!, r));
  return res;
}

/** The sides of the tree whose column is folded to a rail at the stage's edge (closed by hand, or at a narrow start). */
export const treeRails = (s: DeskState): { readonly left: boolean; readonly right: boolean } => ({
  left: s.closed.includes("left") && s.tree.L.length > 0,
  right: s.closed.includes("right") && s.tree.R.length > 0,
});

/** The area the tree tiles: the stage under the bar, less the rails of folded columns. */
export const treeArea = (size: Size, s?: DeskState): Rect => {
  const r = s ? treeRails(s) : { left: false, right: false };
  const x0 = r.left ? RAIL + G : G;
  const x1 = size.width - (r.right ? RAIL + G : G);
  return rect(x0, BAR + G, x1 - x0, size.height - BAR - 2 * G);
};

/** The tree as tiled: a column folded to its rail tiles nothing. */
export const treeShown = (s: DeskState): DeskState["tree"] => {
  const r = treeRails(s);
  return { L: r.left ? [] : s.tree.L, R: r.right ? [] : s.tree.R, C: s.tree.C };
};

/** Which tiles float: the newest tile that breaks a minimum floats, then the tree is laid out again. */
export function treeFloats(cat: Catalog, tree: DeskState["tree"], area: Rect): { tree: DeskState["tree"]; floats: string[] } {
  const only = (kept: readonly string[]): DeskState["tree"] => ({ L: tree.L.filter((k) => kept.includes(k)), R: tree.R.filter((k) => kept.includes(k)), C: tree.C.filter((k) => kept.includes(k)) });
  const { kept, floats } = giveWay(
    [...tree.L, ...tree.R, ...tree.C],
    (k) => treeTiles(cat, only(k), area),
    (k) => tileMin(cat, k),
    cat.born,
  );
  return { tree: only(kept), floats };
}

// --- tabbed sides --------------------------------------------------------------------------------------------------

/**
 * One side with tabs: the tab row on top, the active panel under it, the others hidden behind it. `float` puts
 * them over the documents (a drawer that slides over).
 */
export function tabbed(out: Out, side: Side, ids: readonly number[], active: number | null, x: number, y: number, w: number, h: number, float: boolean): void {
  const shown = active !== null && ids.includes(active) ? active : (ids[0] ?? null);
  out.set(`tabs:${side}`, { rect: rect(x, y, w, TABS), look: "tabs", layer: float ? LAYER.float : LAYER.dock, tabs: ids, active: shown, ...(float ? { shadow: true } : {}) });
  for (const id of ids) {
    const r = rect(x, y + TABS, w, h - TABS);
    out.set(panelKey(id), { rect: r, look: "bare", layer: float ? LAYER.float : LAYER.dock, ...(id === shown ? {} : { hidden: true }), ...(float ? { shadow: true } : {}) });
  }
}

/** A side folded to its rail: the tab row and the panels hidden into it. */
export function tabbedIntoRail(cat: Catalog, out: Out, side: Side, ids: readonly number[], x: number, y: number, w: number): void {
  out.set(`tabs:${side}`, { rect: rect(side === "left" ? x : x + RAIL - w, y, w, TABS), look: "tabs", layer: LAYER.dock, tabs: ids, active: null, hidden: true });
  intoRail(cat, out, x, y, w, ids, side);
}

/** Below these widths a drawer slides over the documents instead of pushing them. */
export const DRAWER_DOCK = { left: 760, right: 1040 } as const;

// --- the scrolling strip -------------------------------------------------------------------------------------------

export const STRIP_PANEL_W = 180;
export const stripDocW = (W: number): number => Math.max(360, Math.min(520, W * 0.5));
export const stripMin = (cat: Catalog, k: string): number => (isDocKey(k) ? DOC_MIN.height : cat.natural(idOf(k)));

/** The strip's columns as laid out: a column whose minimums don't fit the height splits in two, recursively. */
export function stripColumns(cat: Catalog, cols: readonly (readonly string[])[], h: number, notes: Note[] = []): string[][] {
  const split = (keys: readonly string[]): string[][] => {
    const need = keys.reduce((sum, k) => sum + stripMin(cat, k), 0) + G * (keys.length - 1);
    if (need <= h || keys.length === 1) return [[...keys]];
    const half = Math.ceil(keys.length / 2);
    notes.push({ code: "column-split", items: [...keys], text: `${keys.map(cat.title).join(" + ")} split into two columns` });
    return [...split(keys.slice(0, half)), ...split(keys.slice(half))];
  };
  return cols.flatMap(split);
}

export interface StripGeometry {
  readonly cols: string[][];
  /** Each column's left edge on the stage (scroll applied) and width. */
  readonly xs: number[];
  readonly widths: number[];
  readonly y: number;
  readonly h: number;
  /** The whole strip's width, and how far it is scrolled. */
  readonly total: number;
  readonly scroll: number;
}

/** The strip's columns and scroll: scrolled by hand, else to centre the focused document's column. */
export function stripGeometry(cat: Catalog, s: DeskState, size: Size, notes: Note[] = []): StripGeometry {
  const { width: W, height: H } = size;
  const y = BAR + G;
  const h = H - BAR - 2 * G;
  const cols = stripColumns(cat, s.cols, h, notes);
  const widths = cols.map((c) => (c.some(isDocKey) ? stripDocW(W) : STRIP_PANEL_W));
  const total = widths.reduce((a, b) => a + b, 0) + G * (cols.length + 1);
  const want = s.focus !== null ? docKey(s.focus) : null;
  let fi = cols.findIndex((c) => want !== null && c.includes(want));
  if (fi < 0) fi = cols.findIndex((c) => c.some(isDocKey));
  const xsAbs: number[] = [];
  let x = G;
  for (const w of widths) {
    xsAbs.push(x);
    x += w + G;
  }
  const focusX = fi >= 0 ? xsAbs[fi]! + widths[fi]! / 2 : 0;
  const scroll = Math.max(0, Math.min(total - W, s.stripScroll ?? focusX - W / 2));
  return { cols, xs: xsAbs.map((v) => v - scroll), widths, y, h, total, scroll };
}

// --- floating palettes ---------------------------------------------------------------------------------------------

export const paletteWidth = (W: number): number => Math.min(200, Math.max(140, W * 0.22));
/** Narrower than this, both stacks share the right corner. */
export const PALETTE_NARROW = 640;
/** The margin palettes keep from the area's edges when they float over the documents. */
export const OVER_MARGIN = 14;

/**
 * Palettes at their natural size, stacked in the top corners of `area` (`m` in from its edges), and the free ones
 * where they were put; a stack too tall for the area shades its least recently used palettes to their title bars.
 */
export function palettes(cat: Catalog, s: DeskState, area: Rect, W: number, m: number, notes: Note[] = []): Map<number, { rect: Rect; shaded: boolean }> {
  const pw = paletteWidth(W);
  const avail = area.height - 2 * m;
  const narrow = W < PALETTE_NARROW;
  const stacks = narrow ? [[...s.stacks.left, ...s.stacks.right]] : [s.stacks.left, s.stacks.right];
  if (narrow && s.stacks.left.length && s.stacks.right.length) notes.push({ code: "stacks-merged", text: "both stacks share the right corner" });
  const out = new Map<number, { rect: Rect; shaded: boolean }>();
  let shaded = 0;
  stacks.forEach((ids, si) => {
    const folded = lruFold(s, ids, avail, cat.natural, TITLE, false);
    shaded += folded.filter((id) => !s.folded.includes(id)).length;
    const x = narrow || si === 1 ? area.x + area.width - m - pw : area.x + m;
    let y = area.y + m;
    for (const id of ids) {
      const h = folded.includes(id) ? TITLE : cat.natural(id);
      out.set(id, { rect: rect(x, y, pw, h), shaded: folded.includes(id) });
      y += h + G;
    }
  });
  for (const f of s.free) {
    const shade = s.folded.includes(f.id);
    const at = f.at ?? { x: area.x + m, y: area.y + m };
    out.set(f.id, { rect: clampInto(rect(at.x, at.y, pw, shade ? TITLE : cat.natural(f.id)), area), shaded: shade });
  }
  if (shaded) notes.push({ code: "palettes-shaded", text: `${plural(shaded, "palette", "palettes")} shaded to ${shaded > 1 ? "title bars" : "a title bar"}` });
  return out;
}

/** The stage area palettes and documents share (below or above the pill when it keeps its band). */
export function paletteArea(size: Size, opt: Options): { area: Rect } {
  const p = pill(opt, G, size.width - 2 * G, 0, size.height);
  return { area: rect(G, p.top, size.width - 2 * G, p.bottom - p.top) };
}

/**
 * A floating pill among palettes: in a stretch of its band that no palette crosses, so it never covers one. Of the
 * stretches wide enough for a full-width pill (its minimum plus margins), the one nearest the centre; with none, the
 * widest, the pill shrunk to fit it.
 */
export function pillBetween(opt: Options, size: Size, blocks: readonly Rect[]): Placed {
  const band = pill(opt, G, size.width - 2 * G, 0, size.height).placed.rect;
  const spans = blocks
    .filter((r) => r.y < band.y + band.height && r.y + r.height > band.y)
    .map((r) => [r.x - G, r.x + r.width + G] as const)
    .sort((a, b) => a[0] - b[0]);
  const stretches: [number, number][] = [];
  let x = G;
  for (const [b0, b1] of spans) {
    if (b0 > x) stretches.push([x, b0]);
    x = Math.max(x, b1);
  }
  if (size.width - G > x) stretches.push([x, size.width - G]);
  const roomy = stretches.filter(([a, b]) => b - a >= PILL_MIN + 24);
  const mid = size.width / 2;
  const pick =
    roomy.sort((p, q) => Math.abs((p[0] + p[1]) / 2 - mid) - Math.abs((q[0] + q[1]) / 2 - mid))[0] ??
    stretches.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] ??
    ([G, G] as [number, number]);
  const placed = pill(opt, pick[0], pick[1] - pick[0], 0, size.height).placed;
  const room = pick[1] - pick[0];
  // Too little room for even the shortest pill: it shrinks to the room rather than cover a palette.
  return placed.rect.width <= room ? placed : { ...placed, rect: { ...placed.rect, x: pick[0], width: Math.max(0, room) } };
}

/** The documents' band between the palettes on the left half and those on the right half. */
export function aroundDocs(pals: ReadonlyMap<number, { rect: Rect }>, area: Rect): Rect {
  const mid = area.x + area.width / 2;
  const rects = [...pals.values()].map((p) => p.rect);
  const left = rects.filter((r) => r.x + r.width / 2 < mid);
  const right = rects.filter((r) => r.x + r.width / 2 >= mid);
  const x0 = left.length ? Math.max(...left.map((r) => r.x + r.width)) + G : area.x;
  const x1 = right.length ? Math.min(...right.map((r) => r.x)) - G : area.x + area.width;
  return rect(x0, area.y, Math.max(0, x1 - x0), area.height);
}
