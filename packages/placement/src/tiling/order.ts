/**
 * The order layouts: panes in order and an area in, a rect per pane out. Pure rect functions; a drop on one reorders
 * (the dragged pane inserted at an index, see `orderTargets`).
 */
import type { Rect } from "../geometry";

/**
 * How a layout spaces its panes: `gap` px between neighbors (default 0), `ratio` the master's share (default 0.5),
 * `handle` px a split's divider takes beside the gap (default 0; only a split tree reads it).
 */
export interface TileOptions {
  readonly gap?: number;
  readonly ratio?: number;
  readonly handle?: number;
}

/** An order layout: `masterStack`, `columns`, `grid`, or the app's own of the same shape. */
export type OrderLayout = <K>(panes: readonly K[], area: Rect, options?: TileOptions) => Map<K, Rect>;

/**
 * Master and stack: the first pane takes the left part (`ratio` of the width less the gap), the rest stack on the
 * right in equal rows. One pane takes the whole area.
 */
export function masterStack<K>(panes: readonly K[], area: Rect, options: TileOptions = {}): Map<K, Rect> {
  const gap = options.gap ?? 0;
  const out = new Map<K, Rect>();
  if (panes.length === 0) return out;
  if (panes.length === 1) {
    out.set(panes[0]!, { ...area });
    return out;
  }
  const mw = (area.width - gap) * (options.ratio ?? 0.5);
  out.set(panes[0]!, { x: area.x, y: area.y, width: mw, height: area.height });
  const k = panes.length - 1;
  const sh = (area.height - gap * (k - 1)) / k;
  panes.slice(1).forEach((id, i) => out.set(id, { x: area.x + mw + gap, y: area.y + i * (sh + gap), width: area.width - mw - gap, height: sh }));
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
