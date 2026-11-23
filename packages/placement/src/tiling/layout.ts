/**
 * The split tree laid out: the rect of every pane of a `Split` tree in an area, and the geometry of the splits that
 * have an id. See docs/placement.md, Entry: tiling.
 */
import type { Rect } from "../geometry";
import type { Axis } from "../side";
import { masterCount, masterRatio, masterStack, type MasterOptions, type TileOptions } from "./order";
import { panesOf, type Split } from "./split";

/** A px option: a finite number, never below 0 (anything else is 0). */
const px = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);

/** A ratio: clamped to 0..1; one that is not finite is 0.5. */
const unit = (v: number | undefined): number => (v === undefined || !Number.isFinite(v) ? 0.5 : Math.min(1, Math.max(0, v)));

/** A usable length: finite and above 0. */
const usable = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;

/** The least a ratio may be in a split with a floor: within 5 and 95 % unless a side takes the net off. */
const NET: readonly [number, number] = [0.05, 0.95];

/** A split child's fixed length along its split. `keep` marks one that holds its length even beside another. */
export interface FixedLength {
  readonly length: number;
  readonly keep?: boolean;
}

/** A split child's least length along its split. `net` (default true) keeps the split's ratio within 5..95 %. */
export interface MinLength {
  readonly min: number;
  readonly net?: boolean;
}

/**
 * What a split tree's layout reads of its host, each per split, of the split's two direct children.
 *
 * - `fixed(child, axis)`: the child's fixed length along the split, if it has one. The first child that reports one
 *   decides: it takes its length when the length is above 0 and, with the gutter, less than the extent, and the other
 *   side fills the rest (the gutter between). Otherwise, or with a length that does not fit, the split falls back to
 *   its ratio, and the other child's length is not read. When both report a length with `keep`, each keeps its own,
 *   in order, and the room left over stays empty; if the two (and the gutter) do not fit the extent, the second runs
 *   past the end. A split a fixed length decides has no divider and no floor.
 * - `fixedAcross(child, axis)`: the child's fixed length across the split; the child takes it, when positive and
 *   finite, from the start of the cross axis instead of the whole cross extent. It is not checked against the cross
 *   extent: a length larger than the cross extent makes a pane larger than the split's box.
 * - `floor(child, axis, split)`: the child's least length along the split. The ratio is clamped so each side keeps
 *   its floor of the room less the gutter, within the net (5..95 %) unless either side says `net: false`; where the
 *   two floors cannot both fit, the ratio is 0.5. With no `floor`, the ratio is only clamped to 0..1. `giveWay` is
 *   the other policy of the same minimum: it floats the newest pane instead of squeezing the ratio, and a host
 *   chooses one for a pane.
 */
export interface SplitOptions<K> extends TileOptions {
  readonly fixed?: (child: Split<K>, axis: Axis) => FixedLength | undefined;
  readonly fixedAcross?: (child: Split<K>, axis: Axis) => number | undefined;
  readonly floor?: (child: Split<K>, axis: Axis, split: Split<K>) => MinLength;
}

/** A laid-out split: the box it divides, its axis and ratio in effect, and the strip between its two sides. */
export interface SplitGeometry {
  readonly rect: Rect;
  readonly axis: "x" | "y";
  /**
   * The first side's share in effect: the middle of the gutter lies at the box's start plus its extent times this
   * (for a fixed-length child, the middle of the gutter after the first side over the extent). For a master split
   * it is the master area's share (clamped to 0.05..0.95) of the room less the gap, measured from the master's own
   * side: with the master on the right, ratio 0.3 in 1000 with a gap of 10, the divider lies at 693..703.
   */
  readonly ratio: number;
  /** The gutter between the two sides, as a rect inside `rect`; null where the split has none. */
  readonly divider: Rect | null;
}

/** A tree laid out: every pane's rect, and the geometry of each split that has an `id`. */
export interface SplitLayout<K> {
  readonly panes: Map<K, Rect>;
  readonly splits: Map<string, SplitGeometry>;
}

interface Ctx<K> {
  readonly options: SplitOptions<K>;
  readonly gap: number;
  readonly handle: number;
  readonly panes: Map<K, Rect>;
  /** Where the geometry of the named splits goes; null for `layoutSplit`, which reports panes only and builds none. */
  readonly splits: Map<string, SplitGeometry> | null;
}

/**
 * The rect of every pane of `tree` in `area`. Each split's gutter is its gap (its own `gap`, else `options.gap`) plus
 * `options.handle`. A split's `ratio` is clamped to 0..1 (one that is not finite is 0.5), and the middle of the gutter
 * sits at `extent * ratio`: the first side is `extent * ratio` less half the gutter, the second starts half a gutter
 * past it and is the rest less half the gutter. No size is ever negative: a side too short for half the gutter is 0
 * along the axis, and the second side of a split with no room may then start up to half a gutter past the rect's end.
 * At ratio 0.5 both sides are equal. `options.floor`, `fixed` and `fixedAcross` (see `SplitOptions`) read the host's
 * minimums and fixed lengths per split. A negative or non-finite `gap` or `handle` is 0. The area is taken as given:
 * with a negative width or height every length along that axis is 0 and a pane's size across it is copied as it
 * is, so pass an area with no negative side.
 */
export function layoutSplit<K>(tree: Split<K> | null, area: Rect, options: SplitOptions<K> = {}): Map<K, Rect> {
  const ctx: Ctx<K> = { options, gap: px(options.gap), handle: px(options.handle), panes: new Map(), splits: null };
  lay(tree, area, ctx, false);
  return ctx.panes;
}

/**
 * `layoutSplit` and the geometry of every split that has an `id` (a repeated id keeps the one laid out last: a split under another, or a later one beside it): the box it divides,
 * its axis and ratio in effect (after the floors), and its divider, the gutter strip between its two sides. A split
 * that lays out as master and stack is reported too, its nested splits are not.
 */
export function layoutSplitTree<K>(tree: Split<K> | null, area: Rect, options: SplitOptions<K> = {}): SplitLayout<K> {
  const splits = new Map<string, SplitGeometry>();
  const ctx: Ctx<K> = { options, gap: px(options.gap), handle: px(options.handle), panes: new Map(), splits };
  lay(tree, area, ctx, false);
  return { panes: ctx.panes, splits };
}

/** The strip `gutter` wide centered on `mid` across `box`, clipped to it. */
function strip(box: Rect, x: boolean, mid: number, gutter: number): Rect {
  const lo = Math.max(x ? box.x : box.y, mid - gutter / 2);
  const hi = Math.min(x ? box.x + box.width : box.y + box.height, mid + gutter / 2);
  const length = Math.max(0, hi - lo);
  return x ? { x: lo, y: box.y, width: length, height: box.height } : { x: box.x, y: lo, width: box.width, height: length };
}

/**
 * `ratio` kept so the first side has `minA` and the second `minB` of the room less the gutter (at least 1 px of room),
 * within `net`; 0.5 where the two cannot both fit.
 */
function clampByMin(ratio: number, extent: number, gutter: number, minA: number, minB: number, net: readonly [number, number]): number {
  const room = Math.max(extent - gutter, 1);
  const boundedMin = Math.min(Math.max(minA / room, net[0]), net[1]);
  const boundedMax = Math.max(Math.min(1 - minB / room, net[1]), net[0]);
  return boundedMin > boundedMax ? 0.5 : Math.min(Math.max(ratio, boundedMin), boundedMax);
}

/** A split that lays its panes out flat as master and stack: the gap only, never the handle. */
function layMaster<K>(tree: Extract<Split<K>, { a: unknown }>, master: MasterOptions, area: Rect, ctx: Ctx<K>, owned: boolean): void {
  const gap = tree.gap === undefined ? ctx.gap : px(tree.gap);
  const panes = panesOf(tree);
  const ratio = masterRatio(tree.ratio);
  const side = master.side ?? "left";
  // Only the count and side come from `master`: the ratio and gap are the split's own.
  for (const [pane, r] of masterStack(panes, area, { gap, ratio, count: master.count, side })) ctx.panes.set(pane, r);
  if (tree.id === undefined || ctx.splits === null) return;
  const x = side === "left" || side === "right";
  const stacked = panes.length > masterCount(master.count, panes.length);
  const room = Math.max(0, (x ? area.width : area.height) - gap);
  const first = side === "left" || side === "top" ? room * ratio : room * (1 - ratio);
  const mid = (x ? area.x : area.y) + first + gap / 2;
  ctx.splits.set(tree.id, { rect: owned ? area : { ...area }, axis: x ? "x" : "y", ratio, divider: stacked ? strip(area, x, mid, gap) : null });
}

/**
 * Lays `tree` out in `area`. `owned` says `area` is a rect this layout made itself (a split's child), so a pane or a
 * split may keep it as its own; the caller's rect (the root) is copied, never kept.
 */
function lay<K>(tree: Split<K> | null, area: Rect, ctx: Ctx<K>, owned: boolean): void {
  if (!tree) return;
  if ("pane" in tree) {
    ctx.panes.set(tree.pane, owned ? area : { ...area });
    return;
  }
  if (tree.master) {
    layMaster(tree, tree.master, area, ctx, owned);
    return;
  }
  const axis = tree.axis ?? (area.width >= area.height ? "x" : "y");
  const x = axis === "x";
  const extent = x ? area.width : area.height;
  const origin = x ? area.x : area.y;
  const cross = x ? area.height : area.width;
  const gutter = (tree.gap === undefined ? ctx.gap : px(tree.gap)) + ctx.handle;
  const { fixed, fixedAcross, floor } = ctx.options;
  // Across the split a child with a fixed length takes it from the start; the others take the whole cross extent.
  const lenA = fixedAcross?.(tree.a, axis);
  const lenB = fixedAcross?.(tree.b, axis);
  const acrossA = usable(lenA) ? lenA : cross;
  const acrossB = usable(lenB) ? lenB : cross;
  const fixedA = fixed?.(tree.a, axis);
  const fixedB = fixed?.(tree.b, axis);

  // The lengths of the two sides along the split, where the second starts, the ratio in effect and the divider.
  let lengthA: number;
  let lengthB: number;
  let startB: number;
  let ratio = unit(tree.ratio);
  let ruled = false; // the divider is the gutter strip at the ratio (a split no fixed length decides)
  const lead = fixedA ?? fixedB;
  if (fixedA && fixedB && fixedA.keep && fixedB.keep && usable(fixedA.length) && usable(fixedB.length)) {
    lengthA = fixedA.length;
    lengthB = fixedB.length;
    startB = origin + lengthA + gutter;
    ratio = extent > 0 ? (lengthA + gutter / 2) / extent : ratio;
  } else if (lead && usable(lead.length) && lead.length + gutter < extent) {
    const rest = Math.max(0, extent - lead.length - gutter);
    lengthA = lead === fixedA ? lead.length : rest;
    lengthB = lead === fixedA ? rest : lead.length;
    startB = origin + lengthA + gutter;
    ratio = (lengthA + gutter / 2) / extent;
  } else {
    if (floor) {
      const a = floor(tree.a, axis, tree);
      const b = floor(tree.b, axis, tree);
      const net = a.net === false || b.net === false ? ([0, 1] as const) : NET;
      ratio = clampByMin(Number.isFinite(tree.ratio ?? 0.5) ? (tree.ratio ?? 0.5) : 0.5, extent, gutter, px(a.min), px(b.min), net);
    }
    lengthA = Math.max(0, extent * ratio - gutter / 2);
    lengthB = Math.max(0, extent * (1 - ratio) - gutter / 2);
    startB = origin + extent * ratio + gutter / 2;
    ruled = true;
  }
  // The geometry is built only for a named split and only when the caller asked for it (`layoutSplitTree`).
  if (tree.id !== undefined && ctx.splits !== null) {
    const divider = ruled ? strip(area, x, origin + extent * ratio, gutter) : null;
    ctx.splits.set(tree.id, { rect: owned ? area : { ...area }, axis, ratio, divider });
  }
  if (x) {
    lay(tree.a, { x: area.x, y: area.y, width: lengthA, height: acrossA }, ctx, true);
    lay(tree.b, { x: startB, y: area.y, width: lengthB, height: acrossB }, ctx, true);
  } else {
    lay(tree.a, { x: area.x, y: area.y, width: acrossA, height: lengthA }, ctx, true);
    lay(tree.b, { x: area.x, y: startB, width: acrossB, height: lengthB }, ctx, true);
  }
}
