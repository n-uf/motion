/**
 * Desk placement, as pure functions: a state in, a rect per thing out.
 *
 * A desk is a stage with a panel column on the left and on the right edge, a band along the top, a work area (what
 * is left) holding documents, and things pinned over the view. A toolbar lives in the band, in a column or pinned;
 * panels stack in a column or are pinned; documents are tiled or float in the work area.
 *
 * Credits for the public rules this follows:
 * - Tiled documents use Hyprland's master-and-stack and dwindle layouts (see shared/tiling).
 * - The drop label is placed by the Wayland xdg-positioner's rules: an anchor point on the anchor rect, a gravity,
 *   an offset, then the constraint adjustments in order: flip, slide, resize.
 * - Floating documents use the "smart placement" of GNOME and KDE: the first free spot of the window's size,
 *   preferring the centre, then the nearest free one; with none, a cascade from the focused window.
 *
 * One rule over all of it: nothing is laid out below its minimum size. A column that cannot hold its panels at
 * their minimum heights pins its newest panel; a tiling that cannot keep every tile at the minimum document size
 * floats its newest document.
 */
import type { Rect } from "@n-uf/motion";
import { overlap, type Point } from "../shared/geometry";
import { layoutTree, leafIds, masterStack, removeLeaf, splitLeaf, treeFromOrder, type Tree } from "../shared/tiling";

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type Side = "left" | "right";
export type ToolbarPlace = "band" | Side | "pinned";
export type PanelPlace = Side | "pinned";
export type DocLayout = "master" | "dwindle" | "floating";

/** A panel that can be stacked in a column: its title, its minimum height and its age (higher is newer). */
export interface PanelSpec {
  readonly id: number;
  readonly title: string;
  readonly minHeight: number;
  readonly born: number;
}

/** What doesn't change: the stage and the panels. */
export interface DeskSpec {
  readonly stage: Size;
  readonly panels: readonly PanelSpec[];
}

/** Gaps and sizes of the desk, in stage px. */
export const G = {
  gap: 8,
  /** A column's width when it holds anything (an empty column takes none). */
  column: 176,
  /** A title bar: a folded panel's height and the cascade offset. */
  title: 26,
  button: 30,
  buttonGap: 6,
  toolbarPad: 6,
  /** The toolbar's cells: its grip and eight buttons. */
  cells: 9,
  /** Pinned things sit this far in from their anchor. */
  pinMargin: 12,
  pinnedPanelWidth: 200,
  /** A pinned panel is this much taller than its minimum. */
  pinnedPanelExtra: 60,
  docMin: { width: 200, height: 120 } as Size,
  docSize: { width: 240, height: 150 } as Size,
} as const;

export interface DeskState {
  /** Null while the toolbar is lifted (dragged). */
  readonly toolbar: ToolbarPlace | null;
  /** Panel ids per column, top to bottom (the toolbar, when in a column, sits above them). */
  readonly left: readonly number[];
  readonly right: readonly number[];
  /** Pinned panel ids, oldest pin first. */
  readonly pinned: readonly number[];
  readonly folded: readonly number[];
  readonly docLayout: DocLayout;
  /** Tiled document ids in master order (open order); in dwindle the tree holds the same ids. */
  readonly tiled: readonly number[];
  readonly tree: Tree | null;
  /** Floating documents with the rect they asked for (drawn fitted into the work area). */
  readonly floating: readonly { readonly id: number; readonly rect: Rect }[];
}

/** Where everything is: rects keyed "toolbar", "panel:<id>", "doc:<id>". */
export interface DeskLayout {
  readonly work: Rect;
  readonly band: Rect | null;
  readonly columns: { readonly left: Rect | null; readonly right: Rect | null };
  readonly rects: ReadonlyMap<string, Rect>;
}

export const panelKey = (id: number): string => `panel:${id}`;
export const docKey = (id: number): string => `doc:${id}`;

// --- the toolbar -------------------------------------------------------------------------------------------------

/** The toolbar's content size in a place: one row at its natural width, or wrapped to a column's width. */
export function toolbarBox(place: ToolbarPlace): Size & { readonly perRow: number; readonly rows: number } {
  const inColumn = place === "left" || place === "right";
  const step = G.button + G.buttonGap;
  const perRow = inColumn ? Math.max(1, Math.floor((G.column - 2 * G.toolbarPad + G.buttonGap) / step)) : G.cells;
  const rows = Math.ceil(G.cells / perRow);
  const naturalWidth = 2 * G.toolbarPad + G.cells * G.button + (G.cells - 1) * G.buttonGap;
  return {
    width: inColumn ? G.column : naturalWidth,
    height: 2 * G.toolbarPad + rows * G.button + (rows - 1) * G.buttonGap,
    perRow,
    rows,
  };
}

// --- columns -----------------------------------------------------------------------------------------------------

const specOf = (spec: DeskSpec, id: number): PanelSpec => spec.panels.find((p) => p.id === id)!;

/** The y where columns and the work area start, and their height. */
function verticalSpan(state: DeskState, spec: DeskSpec): { y: number; height: number } {
  const top = state.toolbar === "band" ? G.gap + toolbarBox("band").height : 0;
  const y = top + G.gap;
  return { y, height: spec.stage.height - y - G.gap };
}

const columnUsed = (state: DeskState, side: Side): boolean => state.toolbar === side || state[side].length > 0;

/** What a column needs at its panels' minimum heights (folded ones at their title bar). */
function columnNeed(state: DeskState, spec: DeskSpec, side: Side, ids: readonly number[]): number {
  const toolbar = state.toolbar === side ? toolbarBox(side).height + (ids.length > 0 ? G.gap : 0) : 0;
  const panels = ids.reduce((sum, id) => sum + (state.folded.includes(id) ? G.title : specOf(spec, id).minHeight), 0);
  return toolbar + panels + G.gap * Math.max(0, ids.length - 1);
}

/**
 * Heights for stacked panels sharing `avail`: folded ones get their title bar, the rest share what is left
 * equally, none below its minimum (water-filling: a panel whose share is under its minimum gets the minimum,
 * the others share the remainder).
 */
export function distribute(avail: number, items: readonly { readonly min: number; readonly folded: boolean }[]): number[] {
  const out: number[] = items.map((it) => (it.folded ? G.title : 0));
  let open = items.map((it, i) => (it.folded ? -1 : i)).filter((i) => i >= 0);
  let rest = avail - out.reduce((a, b) => a + b, 0);
  for (;;) {
    if (open.length === 0) break;
    const share = rest / open.length;
    const under = open.filter((i) => items[i]!.min > share);
    if (under.length === 0) {
      for (const i of open) out[i] = share;
      break;
    }
    for (const i of under) {
      out[i] = items[i]!.min;
      rest -= items[i]!.min;
    }
    open = open.filter((i) => !under.includes(i));
  }
  return out;
}

// --- documents ---------------------------------------------------------------------------------------------------

function tiledLayout(state: DeskState, work: Rect): Map<number, Rect> {
  if (state.docLayout === "dwindle") return layoutTree(state.tree, work, G.gap);
  return masterStack(state.tiled, work, G.gap);
}

/** Every tile at or above the minimum document size. */
export const tilesFit = (tiles: ReadonlyMap<number, Rect>, min: Size = G.docMin): boolean =>
  [...tiles.values()].every((r) => r.width >= min.width - 0.01 && r.height >= min.height - 0.01);

/** A rect fitted into `area`: no larger than it (never below `min`), slid inside it. */
export function fitInside(r: Rect, area: Rect, min: Size = G.docMin): Rect {
  const width = Math.max(min.width, Math.min(r.width, area.width));
  const height = Math.max(min.height, Math.min(r.height, area.height));
  const x = width >= area.width ? area.x : Math.min(Math.max(r.x, area.x), area.x + area.width - width);
  const y = height >= area.height ? area.y : Math.min(Math.max(r.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

/**
 * Smart placement: the free spot of `size` in `area` (overlapping none of `others`, a gap apart) whose centre is
 * nearest the area's centre; with none, a cascade: one title bar right and down from `from` (the focused window),
 * capped inside the area, never below `min`.
 */
export function placeFloating(
  area: Rect,
  size: Size,
  others: readonly Rect[],
  from: Rect | null,
  min: Size = G.docMin,
): { rect: Rect; how: "free" | "cascade" } {
  const w = Math.max(min.width, Math.min(size.width, area.width));
  const h = Math.max(min.height, Math.min(size.height, area.height));
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const grown = others.map((o) => ({ x: o.x - G.gap, y: o.y - G.gap, width: o.width + 2 * G.gap, height: o.height + 2 * G.gap }));
  let best: Rect | null = null;
  let bestDist = Infinity;
  const step = 4;
  // Scan every spot on a small grid, plus the exact centre and the far edges.
  const xs = new Set<number>([area.x + (area.width - w) / 2, area.x + area.width - w]);
  const ys = new Set<number>([area.y + (area.height - h) / 2, area.y + area.height - h]);
  for (let x = area.x; x <= area.x + area.width - w; x += step) xs.add(x);
  for (let y = area.y; y <= area.y + area.height - h; y += step) ys.add(y);
  for (const x of xs) {
    if (x < area.x - 0.01 || x + w > area.x + area.width + 0.01) continue;
    for (const y of ys) {
      if (y < area.y - 0.01 || y + h > area.y + area.height + 0.01) continue;
      const r = { x, y, width: w, height: h };
      const d = (x + w / 2 - cx) ** 2 + (y + h / 2 - cy) ** 2;
      if (d >= bestDist) continue;
      if (grown.some((o) => overlap(o, r) > 0)) continue;
      best = r;
      bestDist = d;
    }
  }
  if (best) return { rect: best, how: "free" };
  const origin = from ?? { x: area.x - G.title, y: area.y - G.title, width: w, height: h };
  return { rect: fitInside({ x: origin.x + G.title, y: origin.y + G.title, width: w, height: h }, area, min), how: "cascade" };
}

// --- the whole layout --------------------------------------------------------------------------------------------

/** The work area: the stage less the band and the used columns. */
export function workArea(state: DeskState, spec: DeskSpec): Rect {
  const { y, height } = verticalSpan(state, spec);
  const x0 = columnUsed(state, "left") ? G.gap + G.column + G.gap : G.gap;
  const x1 = spec.stage.width - (columnUsed(state, "right") ? G.gap + G.column + G.gap : G.gap);
  return { x: x0, y, width: x1 - x0, height };
}

export function layoutDesk(state: DeskState, spec: DeskSpec): DeskLayout {
  const rects = new Map<string, Rect>();
  const { y, height } = verticalSpan(state, spec);
  const work = workArea(state, spec);
  let band: Rect | null = null;
  if (state.toolbar === "band") {
    const box = toolbarBox("band");
    band = { x: 0, y: 0, width: spec.stage.width, height: G.gap + box.height };
    rects.set("toolbar", { x: G.gap, y: G.gap, width: box.width, height: box.height });
  }
  const columns: { left: Rect | null; right: Rect | null } = { left: null, right: null };
  for (const side of ["left", "right"] as const) {
    if (!columnUsed(state, side)) continue;
    const x = side === "left" ? G.gap : spec.stage.width - G.gap - G.column;
    columns[side] = { x, y, width: G.column, height };
    let cursor = y;
    if (state.toolbar === side) {
      const box = toolbarBox(side);
      rects.set("toolbar", { x, y: cursor, width: box.width, height: box.height });
      cursor += box.height + G.gap;
    }
    const ids = state[side];
    const avail = y + height - cursor - G.gap * Math.max(0, ids.length - 1);
    const heights = distribute(
      avail,
      ids.map((id) => ({ min: specOf(spec, id).minHeight, folded: state.folded.includes(id) })),
    );
    ids.forEach((id, i) => {
      rects.set(panelKey(id), { x, y: cursor, width: G.column, height: heights[i]! });
      cursor += heights[i]! + G.gap;
    });
  }
  // Pinned panels: anchored at the work area's top-right corner plus a margin, stacked down, then a new stack
  // to the left when one would run past the bottom.
  let px = work.x + work.width - G.pinMargin - G.pinnedPanelWidth;
  let py = work.y + G.pinMargin;
  for (const id of state.pinned) {
    const h = state.folded.includes(id) ? G.title : specOf(spec, id).minHeight + G.pinnedPanelExtra;
    if (py + h > work.y + work.height - G.pinMargin && py > work.y + G.pinMargin) {
      px -= G.pinnedPanelWidth + G.gap;
      py = work.y + G.pinMargin;
    }
    rects.set(panelKey(id), { x: px, y: py, width: G.pinnedPanelWidth, height: h });
    py += h + G.gap;
  }
  // The pinned toolbar: its natural size, anchored at the work area's bottom centre plus a margin.
  if (state.toolbar === "pinned") {
    const box = toolbarBox("pinned");
    rects.set("toolbar", { x: work.x + (work.width - box.width) / 2, y: work.y + work.height - G.pinMargin - box.height, width: box.width, height: box.height });
  }
  for (const [id, r] of tiledLayout(state, work)) rects.set(docKey(id), r);
  for (const f of state.floating) rects.set(docKey(f.id), fitInside(f.rect, work));
  return { work, band, columns, rects };
}

/**
 * The never-below-minimum rule, applied until it holds: a column that can't hold its panels at their minimum
 * heights pins its newest panel; a tiling whose tiles would go below the minimum document size floats its newest
 * document (placed by smart placement).
 */
export function normalize(state: DeskState, spec: DeskSpec): DeskState {
  let s = state;
  for (const side of ["left", "right"] as const) {
    const avail = verticalSpan(s, spec).height;
    while (s[side].length > 0 && columnNeed(s, spec, side, s[side]) > avail + 0.01) {
      const newest = s[side].reduce((a, b) => (specOf(spec, b).born > specOf(spec, a).born ? b : a));
      s = { ...s, [side]: s[side].filter((id) => id !== newest), pinned: [...s.pinned, newest] };
    }
  }
  if (s.docLayout !== "floating") {
    const work = workArea(s, spec);
    while (s.tiled.length > 1 && !tilesFit(tiledLayout(s, work))) {
      const newest = Math.max(...s.tiled);
      const without: DeskState = { ...s, tiled: s.tiled.filter((id) => id !== newest), tree: removeLeaf(s.tree, newest) };
      const others = [...tiledLayout(without, work).values(), ...without.floating.map((f) => fitInside(f.rect, work))];
      const placed = placeFloating(work, G.docSize, others, without.floating.at(-1)?.rect ?? null);
      s = { ...without, floating: [...without.floating, { id: newest, rect: placed.rect }] };
    }
  }
  return s;
}

// --- changes -----------------------------------------------------------------------------------------------------

export const withToolbar = (s: DeskState, place: ToolbarPlace | null): DeskState => ({ ...s, toolbar: place });

/** The state without panel `id` anywhere (lifted). */
export const withoutPanel = (s: DeskState, id: number): DeskState => ({
  ...s,
  left: s.left.filter((x) => x !== id),
  right: s.right.filter((x) => x !== id),
  pinned: s.pinned.filter((x) => x !== id),
});

/** Panel `id` docked in a column at `index`, or pinned. */
export function withPanel(s: DeskState, id: number, place: PanelPlace, index = Infinity): DeskState {
  const base = withoutPanel(s, id);
  if (place === "pinned") return { ...base, pinned: [...base.pinned, id] };
  const list = [...base[place]];
  list.splice(Math.min(index, list.length), 0, id);
  return { ...base, [place]: list };
}

export const toggleFold = (s: DeskState, id: number): DeskState => ({
  ...s,
  folded: s.folded.includes(id) ? s.folded.filter((x) => x !== id) : [...s.folded, id],
});

export const placeOfPanel = (s: DeskState, id: number): PanelPlace | null =>
  s.left.includes(id) ? "left" : s.right.includes(id) ? "right" : s.pinned.includes(id) ? "pinned" : null;

/** All document ids, open order. */
export const docIds = (s: DeskState): number[] => [...s.tiled, ...s.floating.map((f) => f.id)].sort((a, b) => a - b);

/**
 * Open document `id`. Tiled: it takes the layout's slot (the end in master, a split of the focused tile in
 * dwindle) if every tile stays at or above the minimum; otherwise, or when floating, smart placement.
 */
export function openDoc(s: DeskState, spec: DeskSpec, id: number, focused: number | null): { state: DeskState; how: "tiled" | "free" | "cascade" } {
  const work = workArea(s, spec);
  if (s.docLayout !== "floating") {
    const target = focused !== null && s.tiled.includes(focused) ? focused : (s.tiled.at(-1) ?? null);
    const tree = s.docLayout === "dwindle" ? splitLeaf(s.tree, target, id, false) : treeFromOrder([...s.tiled, id]);
    const next: DeskState = { ...s, tree, tiled: s.docLayout === "dwindle" ? leafIds(tree) : [...s.tiled, id] };
    if (tilesFit(tiledLayout(next, work))) return { state: next, how: "tiled" };
  }
  const now = layoutDesk(s, spec);
  const others = docIds(s).map((d) => now.rects.get(docKey(d))!);
  const from = focused !== null ? (now.rects.get(docKey(focused)) ?? null) : null;
  const placed = placeFloating(work, G.docSize, others, from ?? others.at(-1) ?? null);
  return { state: { ...s, floating: [...s.floating, { id, rect: placed.rect }] }, how: placed.how };
}

export function closeDoc(s: DeskState, id: number): DeskState {
  return { ...s, tiled: s.tiled.filter((x) => x !== id), tree: removeLeaf(s.tree, id), floating: s.floating.filter((f) => f.id !== id) };
}

/** Switch the document layout: to floating, tiles keep their rects; to a tiling, every document is tiled (then normalized). */
export function setDocLayout(s: DeskState, spec: DeskSpec, mode: DocLayout): DeskState {
  if (mode === s.docLayout) return s;
  if (mode === "floating") {
    const now = layoutDesk(s, spec);
    const floating = [...s.tiled.map((id) => ({ id, rect: now.rects.get(docKey(id))! })), ...s.floating];
    return { ...s, docLayout: mode, tiled: [], tree: null, floating };
  }
  const tiled = s.docLayout === "floating" ? docIds(s) : s.tiled;
  const floating = s.docLayout === "floating" ? [] : s.floating;
  // A custom split tree survives a round trip through master; otherwise dwindle starts from the order.
  const tree = s.tree && leafIds(s.tree).join() === tiled.join() ? s.tree : treeFromOrder(tiled);
  return normalize({ ...s, docLayout: mode, tiled, tree, floating }, spec);
}

// --- xdg-positioner ----------------------------------------------------------------------------------------------

/** -1: the start edge (left or top), 0: the centre, 1: the end edge. */
export type Align = -1 | 0 | 1;

/**
 * An xdg-positioner-style rule: the popup's anchor point on the anchor rect, the direction it extends from there
 * (gravity), an offset, and which constraint adjustments are allowed, applied in xdg's order per axis: flip
 * (mirror anchor, gravity and offset; kept only if that fits), then slide (move inside, the start edge winning),
 * then resize (cut to the bounds).
 */
export interface PositionerRule {
  readonly anchor: { readonly x: Align; readonly y: Align };
  readonly gravity: { readonly x: Align; readonly y: Align };
  readonly offset: Point;
  readonly flip: boolean;
  readonly slide: boolean;
  readonly resize: boolean;
}

export interface Positioned {
  readonly rect: Rect;
  readonly flipped: { readonly x: boolean; readonly y: boolean };
  readonly slid: { readonly x: boolean; readonly y: boolean };
  readonly resized: boolean;
}

function placeAxis(a0: number, alen: number, anchor: Align, gravity: Align, offset: number, size: number): number {
  const point = a0 + ((anchor + 1) / 2) * alen + offset;
  return gravity === 1 ? point : gravity === -1 ? point - size : point - size / 2;
}

export function positionPopup(anchorRect: Rect, size: Size, bounds: Rect, rule: PositionerRule): Positioned {
  const axes = [
    { a0: anchorRect.x, alen: anchorRect.width, anchor: rule.anchor.x, gravity: rule.gravity.x, offset: rule.offset.x, size: size.width, b0: bounds.x, blen: bounds.width },
    { a0: anchorRect.y, alen: anchorRect.height, anchor: rule.anchor.y, gravity: rule.gravity.y, offset: rule.offset.y, size: size.height, b0: bounds.y, blen: bounds.height },
  ];
  const out = axes.map((ax) => {
    const fits = (start: number, len: number): boolean => start >= ax.b0 - 0.01 && start + len <= ax.b0 + ax.blen + 0.01;
    let start = placeAxis(ax.a0, ax.alen, ax.anchor, ax.gravity, ax.offset, ax.size);
    let len = ax.size;
    let flipped = false;
    let slid = false;
    let resized = false;
    if (!fits(start, len) && rule.flip && (ax.anchor !== 0 || ax.gravity !== 0)) {
      const mirrored = placeAxis(ax.a0, ax.alen, -ax.anchor as Align, -ax.gravity as Align, -ax.offset, ax.size);
      if (fits(mirrored, len)) {
        start = mirrored;
        flipped = true;
      }
    }
    if (!fits(start, len) && rule.slide) {
      if (start + len > ax.b0 + ax.blen) start = ax.b0 + ax.blen - len;
      if (start < ax.b0) start = ax.b0;
      slid = true;
    }
    if (!fits(start, len) && rule.resize) {
      const end = Math.min(start + len, ax.b0 + ax.blen);
      start = Math.max(start, ax.b0);
      len = Math.max(0, end - start);
      resized = true;
    }
    return { start, len, flipped, slid, resized };
  });
  const [x, y] = out as [(typeof out)[0], (typeof out)[0]];
  return {
    rect: { x: x.start, y: y.start, width: x.len, height: y.len },
    flipped: { x: x.flipped, y: y.flipped },
    slid: { x: x.slid, y: y.slid },
    resized: x.resized || y.resized,
  };
}

/** The drop label's rule: below the indicator's bottom-left corner, extending right and down, 6 px apart. */
export const LABEL_RULE: PositionerRule = {
  anchor: { x: -1, y: 1 },
  gravity: { x: 1, y: 1 },
  offset: { x: 0, y: 6 },
  flip: true,
  slide: true,
  resize: true,
};
