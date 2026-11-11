/**
 * The nine desk constructions, each a pure layout: a state, the stage size and the options in, a placed rect per
 * item out, plus notes saying how it gave way. Every rule for running out of width or height is the sketch's:
 *
 * - A edge docks: sections fold to headers (least recently used first), the bottom dock folds to its header, the
 *   docks fold to their rails (right first). A2 runs the bottom dock across the full width.
 * - B one tiling tree: the newest tile that breaks a minimum floats.
 * - C navigator + inspector: the sides fold to icon tabs; height never matters.
 * - D scrolling strip: a column whose minimums don't fit splits in two; the strip scrolls to the focus.
 * - E drawers: below a width a drawer slides over the documents instead of pushing them.
 * - F1 palettes over the documents, F2 palettes with the documents tiled around them: the least recently used
 *   shade to their title bars; narrow, the stacks merge in one corner.
 * - F3 edge docks + tear-off: as A, and torn-off panels float (and shade when they don't fit).
 */
import type { Rect } from "@n-uf/motion";
import {
  BAR,
  DOC_MIN,
  G,
  LAYER,
  RAIL,
  TABS,
  TITLE,
  docKey,
  idOf,
  initialState,
  isDocKey,
  natural,
  panelKey,
  rect,
  share,
  titleOf,
  type DeskState,
  type Layout,
  type Options,
  type Placed,
  type Side,
  type Size,
} from "./model";

type Out = Map<string, Placed>;

// --- shared pieces -------------------------------------------------------------------------------------------------

/**
 * The toolbar pill, floating at the top or the bottom of the band [y0, y1] above a region `cx`..`cx + cw`; returns
 * the pill and the band left for the documents (reserved: they keep clear of it; overlay: it floats over them).
 */
export function pill(opt: Options, cx: number, cw: number, y0: number, y1: number): { placed: Placed; top: number; bottom: number } {
  const pw = Math.max(60, Math.min(320, cw - 24));
  const ph = BAR - 4;
  const atTop = opt.toolbar === "top";
  const overlay = opt.toolbarSpace === "overlay";
  return {
    placed: { rect: rect(cx + cw / 2 - pw / 2, atTop ? y0 + G : y1 - G - ph, pw, ph), look: "pill", layer: LAYER.toolbar, shadow: overlay },
    top: atTop && !overlay ? y0 + BAR + 2 * G : y0 + G,
    bottom: !atTop && !overlay ? y1 - BAR - 2 * G : y1 - G,
  };
}

const bar = (W: number): Placed => ({ rect: rect(0, 0, W, BAR), look: "bar", layer: LAYER.toolbar });

/** Master and stack: the first document takes the left part (56 %), the rest stack on the right. */
export function tiles(out: Out, r: Rect, ids: readonly number[], min?: Size): void {
  if (ids.length === 0) return;
  const put = (id: number, x: number, y: number, w: number, h: number): void => {
    out.set(docKey(id), { rect: rect(x, y, w, h), look: "doc", layer: LAYER.doc, ...(min ? { min } : {}) });
  };
  if (ids.length === 1) return put(ids[0]!, r.x, r.y, r.width, r.height);
  const mw = Math.round((r.width - G) * 0.56);
  put(ids[0]!, r.x, r.y, mw, r.height);
  const rest = ids.slice(1);
  const sh = (r.height - G * (rest.length - 1)) / rest.length;
  rest.forEach((id, i) => put(id, r.x + mw + G, r.y + i * (sh + G), r.width - mw - G, sh));
}

/** Dwindle: each tile but the last splits the space left along its longer side. */
export function dwindle(r: Rect, n: number): Rect[] {
  const out: Rect[] = [];
  let cur = { ...r };
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(cur);
      break;
    }
    if (cur.width >= cur.height) {
      const w = (cur.width - G) / 2;
      out.push(rect(cur.x, cur.y, w, cur.height));
      cur = rect(cur.x + w + G, cur.y, w, cur.height);
    } else {
      const h = (cur.height - G) / 2;
      out.push(rect(cur.x, cur.y, cur.width, h));
      cur = rect(cur.x, cur.y + h + G, cur.width, h);
    }
  }
  return out;
}

/**
 * The ones of `ids` to fold, least recently used first, until what stays open fits `avail`. An accordion keeps one
 * section open whatever (`keepOne`); a palette stack shades even its last palette rather than run off the stage.
 */
function lruFold(s: DeskState, ids: readonly number[], avail: number, open: (id: number) => number, closed: number, keepOne = true): number[] {
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

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

/**
 * An accordion of sections in x, y, w, h: open sections share the height in proportion to their natural heights;
 * the least recently used fold to headers until the open ones fit. Returns how many folded by themselves.
 */
function accordion(out: Out, s: DeskState, x: number, y: number, w: number, h: number, ids: readonly number[]): number {
  const folded = lruFold(s, ids, h, natural, TITLE);
  const open = ids.filter((id) => !folded.includes(id));
  const room = h - G * (ids.length - 1) - TITLE * (ids.length - open.length);
  const heights = share(room, open.map(natural));
  let cy = y;
  for (const id of ids) {
    const i = open.indexOf(id);
    const hh = i >= 0 ? heights[i]! : TITLE;
    out.set(panelKey(id), { rect: rect(x, cy, w, hh), look: i >= 0 ? "section" : "header", layer: LAYER.dock, ...(i >= 0 ? { min: { height: natural(id) } } : {}) });
    cy += hh + G;
  }
  return folded.filter((id) => !s.folded.includes(id)).length;
}

/** A rail of icons at x, y, h; the rect of its icon `i`. */
const railIcon = (x: number, y: number, i: number): Rect => rect(x + 6, y + 10 + i * 32, RAIL - 12, 24);

function rail(out: Out, side: Side, x: number, y: number, h: number, ids: readonly number[], hidden = false): void {
  out.set(`rail:${side}`, { rect: rect(x, y, RAIL, h), look: "rail", layer: LAYER.dock, icons: ids, ...(hidden ? { hidden } : {}) });
}

/** Panels folded into a rail: hidden, each gliding to its icon at `w` × its natural height. */
function intoRail(out: Out, x: number, y: number, w: number, ids: readonly number[], side: Side): void {
  ids.forEach((id, i) => {
    const icon = railIcon(x, y, i);
    out.set(panelKey(id), { rect: rect(side === "left" ? icon.x : icon.x + icon.width - w, icon.y, w, natural(id)), look: "section", layer: LAYER.dock, hidden: true });
  });
}

const clampInto = (r: Rect, area: Rect): Rect => ({
  ...r,
  x: Math.min(Math.max(r.x, area.x), Math.max(area.x, area.x + area.width - r.width)),
  y: Math.min(Math.max(r.y, area.y), Math.max(area.y, area.y + area.height - r.height)),
});

// --- A, A2, F3: edge docks -----------------------------------------------------------------------------------------

/** The dock width (rail excluded) and the narrowest the documents may get before a dock folds. */
export const DOCK = 190;
export const WORK_MIN = 380;

/** What the edge docks put where: shared by A, A2 and F3 (and by their drops). */
export interface DockGeometry {
  readonly h: number;
  readonly bh: number;
  readonly lOpen: boolean;
  readonly rOpen: boolean;
  readonly right: readonly number[];
  readonly bottomOn: boolean;
  readonly bottomRect: Rect | null;
  readonly x0: number;
  readonly x1: number;
}

export function dockGeometry(s: DeskState, size: Size, opt: Options, mode: "between" | "full", notes: string[] = []): DockGeometry {
  const { width: W, height: H } = size;
  // The bottom dock (History by default): between the side docks, or across the full width with the side docks
  // ending above it. Off, its panels join the right dock. Short on height, it folds to its header.
  const bottomOn = opt.bottom !== "off" && s.bottom.length > 0;
  const right = bottomOn ? s.right : [...s.right, ...s.bottom];
  const bottomFolded = bottomOn && (H < 480 || s.bottom.every((id) => s.folded.includes(id)));
  const bh = !bottomOn ? 0 : bottomFolded ? TITLE : Math.max(...s.bottom.map(natural)) + 30;
  if (bottomOn && H < 480) notes.push("bottom dock folded to its header");
  const full = mode === "full";
  const h = full && bottomOn ? H - bh - G : H;
  let lOpen = s.left.length > 0 && !s.closed.includes("left");
  let rOpen = right.length > 0 && !s.closed.includes("right");
  const work = (): number => W - 2 * RAIL - (lOpen ? DOCK : 0) - (rOpen ? DOCK : 0) - 2 * G;
  // Short on width, a whole dock folds to its rail: the right one first (unless it was opened last by hand).
  for (const side of s.opened === "right" ? (["left", "right"] as const) : (["right", "left"] as const)) {
    if (work() >= WORK_MIN) break;
    if (side === "right" && rOpen) {
      rOpen = false;
      notes.push("right dock folded to its rail");
    } else if (side === "left" && lOpen) {
      lOpen = false;
      notes.push("left dock folded to its rail");
    }
  }
  const x0 = RAIL + (lOpen ? DOCK : 0) + G;
  const x1 = W - RAIL - (rOpen ? DOCK : 0) - G;
  const bottomRect = bottomOn ? (full ? rect(G, H - G - bh, W - 2 * G, bh) : rect(x0, H - G - bh, x1 - x0, bh)) : null;
  return { h, bh, lOpen, rOpen, right, bottomOn, bottomRect, x0, x1 };
}

function docks(s: DeskState, size: Size, opt: Options, mode: "between" | "full", notes: string[]): Out {
  const out: Out = new Map();
  const { width: W, height: H } = size;
  const d = dockGeometry(s, size, opt, mode, notes);
  rail(out, "left", 0, 0, d.h, s.left);
  rail(out, "right", W - RAIL, 0, d.h, d.right);
  let folded = 0;
  if (d.lOpen) folded += accordion(out, s, RAIL + G, G, DOCK - G, d.h - 2 * G, s.left);
  else intoRail(out, 0, 0, DOCK - G, s.left, "left");
  if (d.rOpen) folded += accordion(out, s, W - RAIL - DOCK, G, DOCK - G, d.h - 2 * G, d.right);
  else intoRail(out, W - RAIL, 0, DOCK - G, d.right, "right");
  if (folded) notes.push(`${plural(folded, "section", "sections")} folded to ${folded > 1 ? "headers" : "a header"}`);
  // Reserved: the documents end above the bottom dock. Overlay: it floats over the documents' lower part.
  const overlay = opt.bottom === "overlay";
  if (d.bottomRect) {
    const b = d.bottomRect;
    const n = s.bottom.length;
    const w = (b.width - G * (n - 1)) / n;
    s.bottom.forEach((id, i) => {
      const open = d.bh > TITLE;
      out.set(panelKey(id), {
        rect: rect(b.x + i * (w + G), b.y, w, b.height),
        look: overlay ? (open ? "float" : "header") : open ? "section" : "header",
        layer: overlay ? LAYER.overlay : LAYER.dock,
        accent: true,
        ...(overlay ? { shadow: true } : {}),
        ...(open ? { min: { height: natural(id) } } : {}),
      });
    });
  }
  const docsBottom = d.bottomOn && !overlay ? H - G - d.bh : H;
  const p = pill(opt, d.x0, d.x1 - d.x0, 0, overlay && d.bottomOn ? H - G - d.bh : docsBottom);
  // With the bottom dock floating, the documents run down under it (but never under a reserved bottom pill).
  const bottomOfDocs = overlay && d.bottomOn && !(opt.toolbar === "bottom" && opt.toolbarSpace === "reserved") ? H - G : p.bottom;
  tiles(out, rect(d.x0, p.top, d.x1 - d.x0, bottomOfDocs - p.top), s.docs);
  out.set("toolbar", p.placed);
  return out;
}

/** The size of a torn-off panel, and of a palette, at full height. */
export const TORN_W = 200;
export const tornHeight = (id: number): number => natural(id) + 50;

/** F3: torn-off panels float over the documents; one that doesn't fit the stage's height shades to its title bar. */
function tornOff(out: Out, s: DeskState, size: Size, notes: string[]): void {
  const docs = [...out.entries()].filter(([k]) => isDocKey(k)).map(([, p]) => p.rect);
  const right = docs.length ? Math.max(...docs.map((r) => r.x + r.width)) : size.width / 2;
  const top = docs.length ? Math.min(...docs.map((r) => r.y)) : 0;
  let shaded = 0;
  s.torn.forEach((f, i) => {
    const full = tornHeight(f.id);
    const at = f.at ?? { x: right - 12 - TORN_W - 22 * i, y: top + 40 + 22 * i };
    const fits = at.y + full <= size.height - G;
    const shade = s.folded.includes(f.id) || !fits;
    if (!fits && !s.folded.includes(f.id)) shaded++;
    const r = clampInto(rect(at.x, at.y, TORN_W, shade ? TITLE : full), rect(0, 0, size.width, size.height));
    out.set(panelKey(f.id), { rect: r, look: shade ? "header" : "float", layer: LAYER.float, shadow: true, ...(shade ? {} : { min: { height: natural(f.id) } }) });
  });
  if (s.torn.length) notes.push(`${s.torn.map((f) => titleOf(panelKey(f.id))).join(", ")} ${s.torn.length > 1 ? "float" : "floats"}; drop on a dock or its rail icon to dock again`);
  if (shaded) notes.push(`${plural(shaded, "floating panel", "floating panels")} shaded`);
}

// --- B: one tiling tree --------------------------------------------------------------------------------------------

/** A tile's age (higher is newer): the panels in the order they were opened, the documents after them. */
const BORN: Record<number, number> = { 1: 1, 3: 2, 2: 3, 4: 4, 5: 5 };
export const bornOf = (key: string): number => (isDocKey(key) ? 9 + idOf(key) : BORN[idOf(key)]!);
export const tileMin = (key: string): Size => (isDocKey(key) ? DOC_MIN : { width: 150, height: natural(idOf(key)) });
export const TREE_COLUMN = 180;

/** The tree's tiles laid out (no floating): the left and right columns, the centre by dwindle. */
export function treeTiles(tree: DeskState["tree"], area: Rect): Map<string, Rect> {
  const res = new Map<string, Rect>();
  let x0 = area.x;
  let x1 = area.x + area.width;
  const column = (list: readonly string[], x: number): void => {
    const sh = (area.height - G * (list.length - 1)) / list.length;
    list.forEach((k, i) => res.set(k, rect(x, area.y + i * (sh + G), TREE_COLUMN, sh)));
  };
  if (tree.L.length) {
    column(tree.L, x0);
    x0 += TREE_COLUMN + G;
  }
  if (tree.R.length) {
    column(tree.R, x1 - TREE_COLUMN);
    x1 -= TREE_COLUMN + G;
  }
  dwindle(rect(x0, area.y, x1 - x0, area.height), tree.C.length).forEach((r, i) => res.set(tree.C[i]!, r));
  return res;
}

export const treeArea = (size: Size): Rect => rect(G, BAR + G, size.width - 2 * G, size.height - BAR - 2 * G);

/** Which tiles float: the newest tile that breaks a minimum floats, then the tree is laid out again. */
export function treeFloats(tree: DeskState["tree"], area: Rect): { tree: DeskState["tree"]; floats: string[] } {
  let t = tree;
  const floats: string[] = [];
  for (;;) {
    const res = treeTiles(t, area);
    const bad = [...res].filter(([k, r]) => r.width < tileMin(k).width - 0.5 || r.height < tileMin(k).height - 0.5);
    const all = [...t.L, ...t.R, ...t.C];
    if (!bad.length || all.length <= 1) return { tree: t, floats };
    const newest = all.reduce((a, b) => (bornOf(b) > bornOf(a) ? b : a));
    const drop = (l: readonly string[]): string[] => l.filter((k) => k !== newest);
    t = { L: drop(t.L), R: drop(t.R), C: drop(t.C) };
    floats.push(newest);
  }
}

function tree(s: DeskState, size: Size, notes: string[]): Out {
  const out: Out = new Map();
  const area = treeArea(size);
  const { tree: t, floats } = treeFloats(s.tree, area);
  for (const [k, r] of treeTiles(t, area)) out.set(k, { rect: r, look: isDocKey(k) ? "doc" : "tile", layer: LAYER.doc, min: tileMin(k) });
  floats.forEach((k, i) => {
    const m = isDocKey(k) ? { w: 300, h: 190 } : { w: 200, h: natural(idOf(k)) + 50 };
    const r = clampInto(rect(size.width / 2 - m.w / 2 + 22 * i, BAR + 40 + 22 * i, m.w, m.h), rect(0, 0, size.width, size.height));
    out.set(k, { rect: r, look: isDocKey(k) ? "doc" : "float", layer: LAYER.float, shadow: true });
  });
  if (floats.length) notes.push(`${plural(floats.length, "tile floats", "tiles float")} (newest first): ${floats.map(titleOf).join(", ")}`);
  out.set("toolbar", bar(size.width));
  return out;
}

// --- C: navigator + inspector, and E: drawers ----------------------------------------------------------------------

/**
 * One side with tabs: the tab row on top, the active panel under it, the others hidden behind it. `float` draws them
 * over the documents (a drawer that slides over).
 */
function tabbed(out: Out, side: Side, ids: readonly number[], active: number | null, x: number, y: number, w: number, h: number, float: boolean): void {
  const shown = active !== null && ids.includes(active) ? active : (ids[0] ?? null);
  out.set(`tabs:${side}`, { rect: rect(x, y, w, TABS), look: "tabs", layer: float ? LAYER.float : LAYER.dock, tabs: ids, active: shown, ...(float ? { shadow: true } : {}) });
  for (const id of ids) {
    const r = rect(x, y + TABS, w, h - TABS);
    out.set(panelKey(id), { rect: r, look: "bare", layer: float ? LAYER.float : LAYER.dock, ...(id === shown ? {} : { hidden: true }), ...(float ? { shadow: true } : {}) });
  }
}

/** A side folded to its rail: the tab row and the panels hidden into it. */
function tabbedIntoRail(out: Out, side: Side, ids: readonly number[], x: number, y: number, w: number): void {
  out.set(`tabs:${side}`, { rect: rect(side === "left" ? x : x + RAIL - w, y, w, TABS), look: "tabs", layer: LAYER.dock, tabs: ids, active: null, hidden: true });
  intoRail(out, x, y, w, ids, side);
}

const NAV_L = 200;
const NAV_R = 220;
const NAV_MIN = 380;

function navigator(s: DeskState, size: Size, opt: Options, notes: string[]): Out {
  const out: Out = new Map();
  const { width: W, height: H } = size;
  let lw = s.left.length ? NAV_L : 0;
  let rw = s.right.length ? NAV_R : 0;
  if (rw && W - lw - rw < NAV_MIN) {
    rw = RAIL;
    notes.push("inspector folded to icon tabs");
  }
  if (lw && W - lw - rw < NAV_MIN) {
    lw = RAIL;
    notes.push("navigator folded to icon tabs");
  }
  const side = (sd: Side, x: number, w: number, full: number, ids: readonly number[]): void => {
    if (w === RAIL) {
      rail(out, sd, x, 0, H, ids);
      tabbedIntoRail(out, sd, ids, x, 0, full);
    } else if (w > 0) {
      rail(out, sd, sd === "left" ? x : x + w - RAIL, 0, H, ids, true);
      tabbed(out, sd, ids, s.active[sd], x, 0, w, H, false);
    }
  };
  side("left", 0, lw, NAV_L, s.left);
  side("right", W - rw, rw, NAV_R, s.right);
  const cx = lw + G;
  const cw = W - lw - rw - 2 * G;
  const p = pill(opt, cx, cw, 0, H);
  tiles(out, rect(cx, p.top, cw, p.bottom - p.top), s.docs);
  out.set("toolbar", p.placed);
  return out;
}

const DRAWER_L = 200;
const DRAWER_R = 220;
/** Below these widths a drawer slides over the documents instead of pushing them. */
export const DRAWER_DOCK = { left: 760, right: 1040 } as const;

function drawers(s: DeskState, size: Size, notes: string[]): Out {
  const out: Out = new Map();
  const { width: W, height: H } = size;
  const y = BAR;
  const h = H - BAR;
  const rDocked = W >= DRAWER_DOCK.right;
  const lDocked = W >= DRAWER_DOCK.left;
  const lOpen = s.left.length > 0 && !s.closed.includes("left");
  const rOpen = s.right.length > 0 && !s.closed.includes("right");
  if (!rDocked && rOpen) notes.push("right drawer slides over the documents");
  if (!lDocked && lOpen) notes.push(rDocked || !rOpen ? "left drawer slides over the documents" : "left drawer slides over too");
  rail(out, "left", 0, y, h, s.left);
  rail(out, "right", W - RAIL, y, h, s.right);
  const x0 = RAIL + (lDocked && lOpen ? DRAWER_L : 0) + G;
  const x1 = W - RAIL - (rDocked && rOpen ? DRAWER_R : 0) - G;
  tiles(out, rect(x0, y + G, x1 - x0, h - 2 * G), s.docs);
  if (lOpen) tabbed(out, "left", s.left, s.active.left, RAIL, y, DRAWER_L, h, !lDocked);
  else tabbedIntoRail(out, "left", s.left, 0, y, DRAWER_L);
  if (rOpen) tabbed(out, "right", s.right, s.active.right, W - RAIL - DRAWER_R, y, DRAWER_R, h, !rDocked);
  else tabbedIntoRail(out, "right", s.right, W - RAIL, y, DRAWER_R);
  out.set("toolbar", bar(W));
  return out;
}

// --- D: scrolling strip --------------------------------------------------------------------------------------------

export const STRIP_PANEL_W = 180;
export const stripDocW = (W: number): number => Math.max(360, Math.min(520, W * 0.5));
const stripMin = (k: string): number => (isDocKey(k) ? DOC_MIN.height : natural(idOf(k)));

/** The strip's columns as laid out: a column whose minimums don't fit the height splits in two, recursively. */
export function stripColumns(cols: readonly (readonly string[])[], h: number, notes: string[] = []): string[][] {
  const split = (keys: readonly string[]): string[][] => {
    const need = keys.reduce((sum, k) => sum + stripMin(k), 0) + G * (keys.length - 1);
    if (need <= h || keys.length === 1) return [[...keys]];
    const half = Math.ceil(keys.length / 2);
    notes.push(`${keys.map(titleOf).join(" + ")} split into two columns`);
    return [...split(keys.slice(0, half)), ...split(keys.slice(half))];
  };
  return cols.flatMap(split);
}

export interface StripGeometry {
  readonly cols: string[][];
  readonly xs: number[];
  readonly widths: number[];
  readonly y: number;
  readonly h: number;
  readonly total: number;
  readonly scroll: number;
}

export function stripGeometry(s: DeskState, size: Size, notes: string[] = []): StripGeometry {
  const { width: W, height: H } = size;
  const y = BAR + G;
  const h = H - BAR - 2 * G;
  const cols = stripColumns(s.cols, h, notes);
  const widths = cols.map((c) => (c.some(isDocKey) ? stripDocW(W) : STRIP_PANEL_W));
  const total = widths.reduce((a, b) => a + b, 0) + G * (cols.length + 1);
  // Focus the focused document's column (else the first document's): centre it, clamped to the strip.
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
  const scroll = Math.max(0, Math.min(total - W, focusX - W / 2));
  return { cols, xs: xsAbs.map((v) => v - scroll), widths, y, h, total, scroll };
}

function strip(s: DeskState, size: Size, notes: string[]): Out {
  const out: Out = new Map();
  const { width: W, height: H } = size;
  const g = stripGeometry(s, size, notes);
  g.cols.forEach((c, ci) => {
    const heights = share(g.h - G * (c.length - 1), c.map(stripMin));
    let cy = g.y;
    c.forEach((k, i) => {
      out.set(k, { rect: rect(g.xs[ci]!, cy, g.widths[ci]!, heights[i]!), look: isDocKey(k) ? "doc" : "tile", layer: LAYER.doc, offStage: true, min: { width: g.widths[ci]!, height: stripMin(k) } });
      cy += heights[i]! + G;
    });
  });
  const scrolls = g.total > W;
  if (scrolls) notes.push(`the strip is ${Math.round(g.total)} wide: ${Math.round(g.total - W)} px off screen, reached by scrolling`);
  out.set("track", { rect: rect(0, H - 5, W, 5), look: "track", layer: LAYER.toolbar, ...(scrolls ? {} : { hidden: true }) });
  const tw = scrolls ? (W / g.total) * W : W;
  out.set("thumb", { rect: rect(scrolls ? (g.scroll / g.total) * W : 0, H - 5, tw, 5), look: "thumb", layer: LAYER.toolbar, ...(scrolls ? {} : { hidden: true }) });
  out.set("toolbar", bar(W));
  return out;
}

// --- F1, F2: floating palettes -------------------------------------------------------------------------------------

export const paletteWidth = (W: number): number => Math.min(200, Math.max(140, W * 0.22));
export const paletteHeight = (id: number): number => natural(id) + 30;
/** Narrower than this, both stacks share the right corner. */
export const PALETTE_NARROW = 640;

/**
 * Palettes at their natural size, stacked in the top corners of `area` (`m` in from its edges), and the free ones
 * where they were put; a stack too tall for the area shades its least recently used palettes to their title bars.
 */
export function palettes(s: DeskState, area: Rect, W: number, m: number, notes: string[] = []): Map<number, { rect: Rect; shaded: boolean }> {
  const pw = paletteWidth(W);
  const avail = area.height - 2 * m;
  const narrow = W < PALETTE_NARROW;
  const stacks = narrow ? [[...s.stacks.left, ...s.stacks.right]] : [s.stacks.left, s.stacks.right];
  if (narrow && s.stacks.left.length && s.stacks.right.length) notes.push("both stacks share the right corner");
  const out = new Map<number, { rect: Rect; shaded: boolean }>();
  let shaded = 0;
  stacks.forEach((ids, si) => {
    const folded = lruFold(s, ids, avail, paletteHeight, TITLE, false);
    shaded += folded.filter((id) => !s.folded.includes(id)).length;
    const x = narrow || si === 1 ? area.x + area.width - m - pw : area.x + m;
    let y = area.y + m;
    for (const id of ids) {
      const h = folded.includes(id) ? TITLE : paletteHeight(id);
      out.set(id, { rect: rect(x, y, pw, h), shaded: folded.includes(id) });
      y += h + G;
    }
  });
  for (const f of s.free) {
    const shade = s.folded.includes(f.id);
    const at = f.at ?? { x: area.x + m, y: area.y + m };
    out.set(f.id, { rect: clampInto(rect(at.x, at.y, pw, shade ? TITLE : paletteHeight(f.id)), area), shaded: shade });
  }
  if (shaded) notes.push(`${plural(shaded, "palette", "palettes")} shaded to ${shaded > 1 ? "title bars" : "a title bar"}`);
  return out;
}

/** The stage area palettes and documents share (below or above the pill). */
export function paletteArea(size: Size, opt: Options): { area: Rect; pill: Placed } {
  const p = pill(opt, G, size.width - 2 * G, 0, size.height);
  return { area: rect(G, p.top, size.width - 2 * G, p.bottom - p.top), pill: p.placed };
}

/** F1's margin from the area's edges. */
export const OVER_MARGIN = 14;

function floatOver(s: DeskState, size: Size, opt: Options, notes: string[]): Out {
  const out: Out = new Map();
  const { area, pill: tb } = paletteArea(size, opt);
  const pals = palettes(s, area, size.width, OVER_MARGIN, notes);
  tiles(out, area, s.docs);
  let covered = 0;
  for (const [id, p] of pals) {
    out.set(panelKey(id), { rect: p.rect, look: p.shaded ? "header" : "float", layer: LAYER.float, shadow: true, ...(p.shaded ? {} : { min: { height: natural(id) } }) });
    covered += p.rect.width * p.rect.height;
  }
  notes.push(`palettes cover ${Math.round((covered / (area.width * area.height)) * 100)}% of the documents`);
  out.set("toolbar", tb);
  return out;
}

/** F2: the documents' band between the palettes on the left half and those on the right half. */
export function aroundDocs(pals: ReadonlyMap<number, { rect: Rect }>, area: Rect): Rect {
  const mid = area.x + area.width / 2;
  const rects = [...pals.values()].map((p) => p.rect);
  const left = rects.filter((r) => r.x + r.width / 2 < mid);
  const right = rects.filter((r) => r.x + r.width / 2 >= mid);
  const x0 = left.length ? Math.max(...left.map((r) => r.x + r.width)) + G : area.x;
  const x1 = right.length ? Math.min(...right.map((r) => r.x)) - G : area.x + area.width;
  return rect(x0, area.y, Math.max(0, x1 - x0), area.height);
}

function floatAround(s: DeskState, size: Size, opt: Options, notes: string[]): Out {
  const out: Out = new Map();
  const { area, pill: tb } = paletteArea(size, opt);
  const pals = palettes(s, area, size.width, 0, notes);
  const docs = aroundDocs(pals, area);
  tiles(out, docs, s.docs);
  let used = docs.width * docs.height;
  for (const [id, p] of pals) {
    out.set(panelKey(id), { rect: p.rect, look: p.shaded ? "header" : "palette", layer: LAYER.palette, shadow: true, ...(p.shaded ? {} : { min: { height: natural(id) } }) });
    used += p.rect.width * p.rect.height;
  }
  notes.push(`documents get ${Math.round(docs.width)} px of width; ${Math.max(0, Math.round((1 - used / (area.width * area.height)) * 100))}% of the desk stays empty under short stacks`);
  out.set("toolbar", tb);
  return out;
}

// --- the constructions ---------------------------------------------------------------------------------------------

export type ConstructionId = "docks" | "docksFull" | "tree" | "navigator" | "strip" | "drawers" | "floatOver" | "floatAround" | "dockTear";

export interface Construction {
  readonly id: ConstructionId;
  readonly title: string;
  readonly idea: string;
  /** It has a floating toolbar pill (top or bottom, reserved or overlay). */
  readonly pill: boolean;
  /** It has a bottom dock (reserved, floating or off). */
  readonly bottom: boolean;
  /** The arrangement it starts from. */
  readonly initial: (docs: readonly number[]) => DeskState;
  readonly layout: (s: DeskState, size: Size, opt: Options) => Layout;
}

const withNotes = (f: (s: DeskState, size: Size, opt: Options, notes: string[]) => Out) => (s: DeskState, size: Size, opt: Options): Layout => {
  const notes: string[] = [];
  const items = f(s, size, opt, notes);
  return { items, notes };
};

const sides = (patch: Partial<DeskState>) => (docs: readonly number[]): DeskState => ({ ...initialState(docs), ...patch });

export const CONSTRUCTIONS: readonly Construction[] = [
  {
    id: "docks",
    title: "A · Edge docks",
    idea: "Each side is a dock with a rail of icons; its panels are accordion sections. Short on height, the least recently used fold to headers; short on width, a whole dock folds to its rail (right first). The bottom dock sits between the side docks.",
    pill: true,
    bottom: true,
    initial: sides({}),
    layout: withNotes((s, size, opt, notes) => docks(s, size, opt, "between", notes)),
  },
  {
    id: "docksFull",
    title: "A2 · Edge docks, full-width bottom dock",
    idea: "As A, except the bottom dock runs under everything across the full width; the side docks and their rails stop above it, so they fold sooner.",
    pill: true,
    bottom: true,
    initial: sides({}),
    layout: withNotes((s, size, opt, notes) => docks(s, size, opt, "full", notes)),
  },
  {
    id: "tree",
    title: "B · One tiling tree",
    idea: "Panels and documents are tiles of one tree, so a panel can sit beside a document. One rule for all: the newest tile that breaks a minimum floats.",
    pill: false,
    bottom: false,
    initial: sides({}),
    layout: withNotes((s, size, _opt, notes) => tree(s, size, notes)),
  },
  {
    id: "navigator",
    title: "C · Navigator + inspector",
    idea: "A fixed left and right side, one panel showing per side (tabs); the toolbar floats over the canvas. Narrow, the sides fold to icon tabs. Height never matters.",
    pill: true,
    bottom: false,
    initial: sides({ right: [3, 4, 5], bottom: [] }),
    layout: withNotes((s, size, opt, notes) => navigator(s, size, opt, notes)),
  },
  {
    id: "strip",
    title: "D · Scrolling strip",
    idea: "Panels and documents are columns of a strip wider than the screen; nothing shrinks below its minimum, the view scrolls to the focus instead. Short on height, a column splits in two.",
    pill: false,
    bottom: false,
    initial: sides({}),
    layout: withNotes((s, size, _opt, notes) => strip(s, size, notes)),
  },
  {
    id: "drawers",
    title: "E · Drawers",
    idea: "Documents take the screen; each side is a drawer with tabs. Wide, the drawers dock and push; narrow, they slide over the documents.",
    pill: false,
    bottom: false,
    initial: sides({ right: [3, 4, 5], bottom: [] }),
    layout: withNotes((s, size, _opt, notes) => drawers(s, size, notes)),
  },
  {
    id: "floatOver",
    title: "F1 · Floating palettes over the documents",
    idea: "Documents take the whole desk; panels are palettes floating over them at their natural size, stacked in the top corners and draggable anywhere. Short on height, the least recently used shade to their title bars; the documents never move.",
    pill: true,
    bottom: false,
    initial: sides({}),
    layout: withNotes((s, size, opt, notes) => floatOver(s, size, opt, notes)),
  },
  {
    id: "floatAround",
    title: "F2 · Floating palettes, documents tile around",
    idea: "Palettes float at their natural size but reserve their footprint: the documents tile in the space between them. Nothing is covered; the space under a short stack stays empty.",
    pill: true,
    bottom: false,
    initial: sides({}),
    layout: withNotes((s, size, opt, notes) => floatAround(s, size, opt, notes)),
  },
  {
    id: "dockTear",
    title: "F3 · Edge docks + tear-off",
    idea: "A's docks, and any panel can be torn off to float over the documents and dropped back on a dock or its rail icon. Docked is the default; floating is the exception you choose.",
    pill: true,
    bottom: true,
    initial: sides({ right: [3], torn: [{ id: 4, at: null }] }),
    layout: withNotes((s, size, opt, notes) => {
      const out = docks(s, size, opt, "between", notes);
      tornOff(out, s, size, notes);
      return out;
    }),
  },
];

export const constructionOf = (id: ConstructionId): Construction => CONSTRUCTIONS.find((c) => c.id === id)!;
export const DEFAULT_CONSTRUCTION: ConstructionId = "dockTear";
