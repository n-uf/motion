/**
 * Where a dragged item would land, per construction, as pure functions: the state with the item lifted out, the
 * pointer and the grab point in, a drop out (the state with the item there, its layout, its slot and a label).
 *
 * - Edge docks (A, A2, F3): a slot in the left, right or bottom dock, nearest the pointer; a folded dock takes it
 *   into its rail. Over the documents, A and A2 take the nearer side dock; F3 tears the panel off to float there.
 * - Tiling tree (B): beside the tile under the pointer, before or after it along its longer side; a missing side
 *   column is made at the area's edge.
 * - Strip (D): a new column between two columns (near a column's edge), or into a column at the nearest gap.
 * - Navigator, drawers (C, E): a tab in the left or right tab row; it becomes the side's showing panel.
 * - Palettes (F1, F2): anywhere, snapped to the area's edges and corners (F1 also to other palettes' edges); near a
 *   corner stack it joins the stack.
 */
import type { Rect } from "@n-uf/motion";
import type { Point } from "../shared/geometry";
import {
  DOCK,
  OVER_MARGIN,
  PALETTE_NARROW,
  TORN_W,
  dockGeometry,
  paletteArea,
  paletteHeight,
  paletteWidth,
  stripColumns,
  stripGeometry,
  tornHeight,
  treeArea,
  type Construction,
} from "./layouts";
import { G, LAYER, RAIL, idOf, isDocKey, isPanelKey, titleOf, touch, type DeskState, type Layout, type Options, type Side, type Size } from "./model";

export interface Drop {
  /** Two drops with the same key put the item in the same place. */
  readonly key: string;
  readonly state: DeskState;
  readonly layout: Layout;
  /** Where the item lands. */
  readonly slot: Rect;
  /** It lands hidden (folded into a rail). */
  readonly hidden: boolean;
  /** It floats where it is dropped: it takes no slot from the others. */
  readonly free: boolean;
  readonly label: string;
}

/** How close (stage px) a free drop has to come to an edge to snap to it. */
export const SNAP = 18;

/** Which items a construction lets the pointer drag. */
export const draggable = (c: Construction, key: string): boolean => isPanelKey(key) || (isDocKey(key) && (c.id === "tree" || c.id === "strip"));

/** The state with `key` lifted out of wherever it is. */
export function without(s: DeskState, key: string): DeskState {
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

const insert = <T>(list: readonly T[], i: number, x: T): T[] => [...list.slice(0, i), x, ...list.slice(i)];
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export interface DragInput {
  readonly c: Construction;
  /** The state with the dragged item lifted out. */
  readonly s0: DeskState;
  readonly key: string;
  readonly size: Size;
  readonly opt: Options;
  readonly pointer: Point;
  /** Where the pointer holds the item, from its top-left corner. */
  readonly grab: Point;
}

function make(input: DragInput, state: DeskState, label: string, free = false, key = label): Drop {
  const layout = input.c.layout(state, input.size, input.opt);
  const placed = layout.items.get(input.key)!;
  return { key, state, layout, slot: placed.rect, hidden: !!placed.hidden, free, label };
}

/** Of drops for indices 0..n, the one whose slot is nearest the pointer along `axis` (a slot under the pointer wins). */
function nearest(input: DragInput, n: number, at: (i: number) => DeskState, label: (i: number) => string, axis: "x" | "y"): Drop {
  let best: Drop | null = null;
  let bestDist = Infinity;
  for (let i = 0; i <= n; i++) {
    const d = make(input, at(i), label(i));
    const lo = axis === "x" ? d.slot.x : d.slot.y;
    const len = axis === "x" ? d.slot.width : d.slot.height;
    const p = axis === "x" ? input.pointer.x : input.pointer.y;
    const dist = (p >= lo && p <= lo + len ? 0 : 1e6) + (p - (lo + len / 2)) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best!;
}

// --- edge docks ----------------------------------------------------------------------------------------------------

function dockDrop(input: DragInput): Drop {
  const { c, s0, size, opt, pointer: p } = input;
  const id = idOf(input.key);
  const mode = c.id === "docksFull" ? "full" : "between";
  const d = dockGeometry(s0, size, opt, mode);
  const W = size.width;
  const leftEdge = RAIL + (d.lOpen ? DOCK : 0);
  const rightEdge = W - RAIL - (d.rOpen ? DOCK : 0);
  const bottomTop = d.bottomRect ? d.bottomRect.y : size.height - G - 60;
  const underSides = mode === "full" || (p.x > leftEdge && p.x < rightEdge);
  const side = (sd: Side): Drop => {
    const folded = sd === "left" ? !d.lOpen : !d.rOpen;
    const name = `${sd === "left" ? "Left" : "Right"} dock${folded ? " (its rail)" : ""}`;
    return nearest(input, s0[sd].length, (i) => touch({ ...s0, [sd]: insert(s0[sd], i, id) }, id), (i) => `${name} · slot ${i + 1}`, "y");
  };
  if (opt.bottom !== "off" && p.y >= bottomTop - 24 && underSides) {
    return nearest(input, s0.bottom.length, (i) => touch({ ...s0, bottom: insert(s0.bottom, i, id) }, id), (i) => `Bottom dock · slot ${i + 1}`, "x");
  }
  if (p.x <= leftEdge + 24) return side("left");
  if (p.x >= rightEdge - 24) return side("right");
  if (c.id !== "dockTear") return side(p.x < W / 2 ? "left" : "right");
  // F3: torn off, floating where it is dropped; snapped to the documents' edges and kept on the stage.
  let x = p.x - input.grab.x;
  let y = p.y - input.grab.y;
  if (Math.abs(x - d.x0) < SNAP) x = d.x0;
  if (Math.abs(x + TORN_W - d.x1) < SNAP) x = d.x1 - TORN_W;
  if (Math.abs(y - G) < SNAP) y = G;
  x = clamp(x, 0, W - TORN_W);
  y = clamp(y, 0, size.height - Math.min(tornHeight(id), size.height));
  return make(input, touch({ ...s0, torn: [...s0.torn, { id, at: { x, y } }] }, id), "Floats here", true, `float:${Math.round(x)},${Math.round(y)}`);
}

// --- tiling tree ---------------------------------------------------------------------------------------------------

function treeDrop(input: DragInput): Drop {
  const { c, s0, size, opt, pointer: p, key } = input;
  const area = treeArea(size);
  const t = s0.tree;
  if (p.x < area.x + 30 && t.L.length === 0) return make(input, { ...s0, tree: { ...t, L: [key] } }, "New left column");
  if (p.x > area.x + area.width - 30 && t.R.length === 0) return make(input, { ...s0, tree: { ...t, R: [key] } }, "New right column");
  const l0 = c.layout(s0, size, opt);
  const tiles = [...l0.items].filter(([k, pl]) => (isDocKey(k) || isPanelKey(k)) && pl.layer === LAYER.doc);
  if (tiles.length === 0) return make(input, { ...s0, tree: { ...t, C: [key] } }, "The tree");
  const dist = (r: Rect): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.width), Math.max(r.y - p.y, 0, p.y - r.y - r.height));
  const [tk, tp] = tiles.reduce((a, b) => (dist(b[1].rect) < dist(a[1].rect) ? b : a));
  const group = t.L.includes(tk) ? "L" : t.R.includes(tk) ? "R" : "C";
  const r = tp.rect;
  const m = centre(r);
  const along = group !== "C" || r.height > r.width ? "y" : "x";
  const before = along === "y" ? p.y < m.y : p.x < m.x;
  const list = t[group];
  const i = list.indexOf(tk) + (before ? 0 : 1);
  const where = along === "y" ? (before ? "above" : "below") : before ? "left of" : "right of";
  return make(input, { ...s0, tree: { ...t, [group]: insert(list, i, key) } }, `${where} ${titleOf(tk)}`);
}

// --- scrolling strip -----------------------------------------------------------------------------------------------

function stripDrop(input: DragInput): Drop {
  const { s0, size, pointer: p, key } = input;
  const g = stripGeometry(s0, size);
  // The laid-out columns, each with the state column it comes from and where in it it starts.
  const parts: { owner: number; start: number; keys: string[] }[] = [];
  s0.cols.forEach((col, owner) => {
    let start = 0;
    for (const keys of stripColumns([col], g.h)) {
      parts.push({ owner, start, keys });
      start += keys.length;
    }
  });
  const newColumn = (at: number, label: string): Drop => make(input, { ...s0, cols: insert(s0.cols, at, [key]) }, label);
  if (parts.length === 0) return newColumn(0, "The strip");
  const i = g.xs.findIndex((x, k) => p.x >= x - G && p.x <= x + g.widths[k]! + G);
  if (i < 0) return p.x < g.xs[0]! ? newColumn(0, "New column at the start") : newColumn(s0.cols.length, "New column at the end");
  const part = parts[i]!;
  const x = g.xs[i]!;
  const w = g.widths[i]!;
  const edge = Math.min(28, w / 4);
  const name = titleOf(part.keys[0]!);
  if (p.x < x + edge && part.start === 0) return newColumn(part.owner, `New column before ${name}`);
  if (p.x > x + w - edge && part.start + part.keys.length === s0.cols[part.owner]!.length) return newColumn(part.owner + 1, `New column after ${name}`);
  // Inside: at the gap nearest the pointer.
  const l0 = input.c.layout(s0, size, input.opt);
  const above = part.keys.filter((k) => centre(l0.items.get(k)!.rect).y < p.y).length;
  const col = s0.cols[part.owner]!;
  const cols = s0.cols.map((c, k) => (k === part.owner ? insert(c, part.start + above, key) : c));
  return make(input, { ...s0, cols }, `Into the column with ${titleOf(col[0]!)} · ${part.start + above + 1}`);
}

// --- navigator and drawers -----------------------------------------------------------------------------------------

function tabDrop(input: DragInput): Drop {
  const { c, s0, size, opt, pointer: p } = input;
  const id = idOf(input.key);
  const side: Side = p.x < size.width / 2 ? "left" : "right";
  const list = s0[side];
  const tabs = c.layout(s0, size, opt).items.get(`tabs:${side}`);
  let i = list.length;
  if (tabs && !tabs.hidden && list.length > 0) {
    const tw = tabs.rect.width / (list.length + 1);
    i = clamp(Math.floor((p.x - tabs.rect.x) / tw), 0, list.length);
  }
  const state = touch({ ...s0, [side]: insert(list, i, id), active: { ...s0.active, [side]: id } }, id);
  return make(input, state, `${side === "left" ? "Left" : "Right"} tab row · tab ${i + 1}`);
}

// --- palettes ------------------------------------------------------------------------------------------------------

function paletteDrop(input: DragInput): Drop {
  const { c, s0, size, opt, pointer: p } = input;
  const id = idOf(input.key);
  const { area } = paletteArea(size, opt);
  const m = c.id === "floatOver" ? OVER_MARGIN : 0;
  const pw = paletteWidth(size.width);
  const ph = s0.folded.includes(id) ? 22 : paletteHeight(id);
  const narrow = size.width < PALETTE_NARROW;
  const anchor = { left: area.x + m, right: area.x + area.width - m - pw };
  let x = p.x - input.grab.x;
  let y = p.y - input.grab.y;
  const l0 = c.layout(s0, size, opt);
  const rectOf = (pid: number): Rect => l0.items.get(`panel:${pid}`)!.rect;
  // Near a corner stack (its column, no lower than just under its last palette): it joins the stack.
  for (const side of narrow ? (["right"] as const) : (["left", "right"] as const)) {
    if (Math.abs(x - anchor[side]) >= SNAP) continue;
    const ids = narrow ? [...s0.stacks.left, ...s0.stacks.right] : [...s0.stacks[side]];
    const bottom = ids.length ? Math.max(...ids.map((pid) => rectOf(pid).y + rectOf(pid).height)) : area.y + m;
    if (y > bottom + 30) continue;
    const at = ids.filter((pid) => centre(rectOf(pid)).y < y + 11).length;
    let stacks = s0.stacks;
    if (!narrow) stacks = { ...stacks, [side]: insert(stacks[side], at, id) };
    else if (at <= s0.stacks.left.length) stacks = { ...stacks, left: insert(stacks.left, at, id) };
    else stacks = { ...stacks, right: insert(stacks.right, at - s0.stacks.left.length, id) };
    return make(input, touch({ ...s0, stacks }, id), `${narrow ? "The" : side === "left" ? "Left" : "Right"} corner stack · ${at + 1}`);
  }
  // Anywhere: snapped to the area's edges (F1 also to other palettes' edges), kept inside the area.
  const snaps: string[] = [];
  if (Math.abs(x - anchor.left) < SNAP) [x, snaps[0]] = [anchor.left, "left edge"];
  else if (Math.abs(x - anchor.right) < SNAP) [x, snaps[0]] = [anchor.right, "right edge"];
  if (Math.abs(y - (area.y + m)) < SNAP) [y, snaps[1]] = [area.y + m, "top"];
  else if (Math.abs(y + ph - (area.y + area.height - m)) < SNAP) [y, snaps[1]] = [area.y + area.height - m - ph, "bottom"];
  if (c.id === "floatOver") {
    for (const [k, pl] of l0.items) {
      if (!isPanelKey(k) || pl.hidden) continue;
      const o = pl.rect;
      if (snaps[0] === undefined && Math.abs(x - o.x) < SNAP) [x, snaps[0]] = [o.x, `${titleOf(k)}'s edge`];
      if (snaps[1] === undefined && Math.abs(y - (o.y + o.height + G)) < SNAP && x < o.x + o.width && x + pw > o.x) [y, snaps[1]] = [o.y + o.height + G, `under ${titleOf(k)}`];
    }
  }
  x = clamp(x, area.x, area.x + area.width - pw);
  y = clamp(y, area.y, area.y + area.height - ph);
  const how = snaps.filter(Boolean).join(", ");
  return make(input, touch({ ...s0, free: [...s0.free, { id, at: { x, y } }] }, id), how ? `Here · snapped to the ${how}` : "Here", true, `free:${Math.round(x)},${Math.round(y)}`);
}

/** Where the dragged item would land with the pointer at `input.pointer`. */
export function findDrop(input: DragInput): Drop {
  switch (input.c.id) {
    case "docks":
    case "docksFull":
    case "dockTear":
      return dockDrop(input);
    case "tree":
      return treeDrop(input);
    case "strip":
      return stripDrop(input);
    case "navigator":
    case "drawers":
      return tabDrop(input);
    case "floatOver":
    case "floatAround":
      return paletteDrop(input);
  }
}
