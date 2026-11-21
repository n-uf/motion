/**
 * The order layouts: panes in order and an area in, a rect per pane out. Pure rect functions; a drop on one reorders
 * (the dragged pane inserted at an index, see `orderTargets`).
 */
import type { Rect } from "../geometry";
import type { PaneSide } from "./regions";

/**
 * How a layout spaces its panes: `gap` px between neighbors (default 0), `ratio` the master's share (default 0.5),
 * `handle` px a split's divider takes beside the gap (default 0; only a split tree reads it).
 */
export interface TileOptions {
  readonly gap?: number;
  readonly ratio?: number;
  readonly handle?: number;
}

/**
 * The master area: `count` panes (rounded, kept within 1..n; default 1) on `side` (default `"left"`). Left and right
 * make it a column of panes stacked vertically; top and bottom a row of panes side by side. The one home of the
 * concept: `masterStack` takes it in its options (`OrderOptions`), a split that lays out as master and stack in its
 * `master` field.
 */
export interface MasterOptions {
  readonly count?: number;
  readonly side?: PaneSide;
}

/** What the order layouts take: `TileOptions` and the master area's `count` and `side` (`columns` and `grid` ignore them). */
export type OrderOptions = TileOptions & MasterOptions;

/** An order layout: `masterStack`, `columns`, `grid`, or the app's own of the same shape. */
export type OrderLayout = <K>(panes: readonly K[], area: Rect, options?: OrderOptions) => Map<K, Rect>;

/** The master's share in effect: clamped to 0.05..0.95; one that is not finite is 0.5. */
export const masterRatio = (v: number | undefined): number => (v === undefined || !Number.isFinite(v) ? 0.5 : Math.min(0.95, Math.max(0.05, v)));

/** How many of `n` panes are masters for a requested `count`: rounded, within 1..n; NaN is 1. */
export function masterCount(count: number | undefined, n: number): number {
  const c = Math.round(count ?? 1);
  return Math.min(Math.max(Number.isNaN(c) ? 1 : c, 1), Math.max(n, 1));
}

/** `items` side by side or one above the other in equal shares of the box, `gap` between them. */
function divide<K>(items: readonly K[], x: number, y: number, width: number, height: number, vertical: boolean, gap: number, out: Map<K, Rect>): void {
  const n = items.length;
  const total = gap * (n - 1);
  if (vertical) {
    const each = Math.max(0, (height - total) / n);
    items.forEach((pane, i) => out.set(pane, { x, y: y + i * (each + gap), width, height: each }));
  } else {
    const each = Math.max(0, (width - total) / n);
    items.forEach((pane, i) => out.set(pane, { x: x + i * (each + gap), y, width: each, height }));
  }
}

/**
 * Master and stack: the first `count` panes are the masters, in an area on `side` that takes `ratio` of the room the
 * gap leaves (clamped to 0.05..0.95; default 0.5); the rest are the stack, in the other area. Left and right make
 * each area a column of panes stacked vertically; top and bottom a row of panes side by side. Right and bottom put
 * the stack first in space. With no stack (n at most `count`) all the panes fill the area, stacked along the side's
 * cross axis. Each area divides its length equally between its panes, the gap between them.
 */
export function masterStack<K>(panes: readonly K[], area: Rect, options: OrderOptions = {}): Map<K, Rect> {
  const gap = options.gap !== undefined && Number.isFinite(options.gap) && options.gap > 0 ? options.gap : 0;
  const out = new Map<K, Rect>();
  if (panes.length === 0) return out;
  const side = options.side ?? "left";
  const ratio = masterRatio(options.ratio);
  const count = masterCount(options.count, panes.length);
  const masters = panes.slice(0, count);
  const stack = panes.slice(count);
  const column = side === "left" || side === "right";
  if (stack.length === 0) {
    divide(masters, area.x, area.y, area.width, area.height, column, gap, out);
  } else if (column) {
    const room = Math.max(0, area.width - gap);
    const masterWidth = room * ratio;
    const stackWidth = room * (1 - ratio);
    const masterX = side === "left" ? area.x : area.x + stackWidth + gap;
    const stackX = side === "left" ? area.x + masterWidth + gap : area.x;
    divide(masters, masterX, area.y, masterWidth, area.height, true, gap, out);
    divide(stack, stackX, area.y, stackWidth, area.height, true, gap, out);
  } else {
    const room = Math.max(0, area.height - gap);
    const masterHeight = room * ratio;
    const stackHeight = room * (1 - ratio);
    const masterY = side === "top" ? area.y : area.y + stackHeight + gap;
    const stackY = side === "top" ? area.y + masterHeight + gap : area.y;
    divide(masters, area.x, masterY, area.width, masterHeight, false, gap, out);
    divide(stack, area.x, stackY, area.width, stackHeight, false, gap, out);
  }
  return out;
}

/** Equal columns, full height. */
export function columns<K>(panes: readonly K[], area: Rect, options: TileOptions = {}): Map<K, Rect> {
  const gap = options.gap ?? 0;
  const out = new Map<K, Rect>();
  const n = panes.length;
  const w = (area.width - gap * (n - 1)) / Math.max(1, n);
  panes.forEach((id, i) => out.set(id, { x: area.x + i * (w + gap), y: area.y, width: w, height: area.height }));
  return out;
}

/** A grid as square as the count allows; the last row's cells widen to fill it. */
export function grid<K>(panes: readonly K[], area: Rect, options: TileOptions = {}): Map<K, Rect> {
  const gap = options.gap ?? 0;
  const out = new Map<K, Rect>();
  const n = panes.length;
  if (n === 0) return out;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const h = (area.height - gap * (rows - 1)) / rows;
  panes.forEach((id, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const col = i - row * cols;
    const w = (area.width - gap * (inRow - 1)) / inRow;
    out.set(id, { x: area.x + col * (w + gap), y: area.y + row * (h + gap), width: w, height: h });
  });
  return out;
}
