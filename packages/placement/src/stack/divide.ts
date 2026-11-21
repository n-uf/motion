/**
 * Stacked items that share a draggable divider: one makes its neighbor longer and the other shorter by the same
 * amount, and nothing else in the stack moves. A divider's state is the asked length of the items on both sides
 * (`StackItem.length`), which `fitStack` reads in place of a growing form's natural; these are the functions that read and
 * write it. Pure: a state in, a state out (the same object when nothing changed).
 *
 * The two ends of a divider are the nearest items that are open and growing on each side of a boundary: an item that
 * draws a form that grows (`main.grows`), isn't in the » menu, isn't `fixed` and isn't a `wrap` form. A header, a rail icon, a
 * group or a folded item between them isn't growing, so it has no divider of its own and doesn't kill the divider
 * across it.
 */
import { EPS, type Rect } from "../geometry";
import { fitStack, sizesOf } from "./layout";
import { formMain, type FitOptions, type StackAxis, type StackFit, type StackInput } from "./model";

/** One divider: between the open growing items `before` and `after` (ids), drawn at `rect`. */
export interface StackDivider {
  readonly before: string;
  readonly after: string;
  /**
   * The strip the divider sits on, stack-local: it starts where the last item drawn before `after` ends (the far edge of
   * the last collapsed item between the two, or of `before`), and is as thick as the gap to `after` (0 with no gap).
   * Across, it is `before`'s extent. A host draws its grab zone around it.
   */
  readonly rect: Rect;
  /**
   * How far the divider may move each way, px along the stack (`min` ≤ 0 ≤ `max`): the delta `resizeBetween` takes, a
   * negative one moving it toward `before`. Where either end reaches its least.
   */
  readonly range: { readonly min: number; readonly max: number };
}

interface Grower {
  readonly id: string;
  readonly fixed: boolean;
  /** The least it takes as the length was shared. */
  readonly least: number;
  /** What its form asks for by itself, the least at most. */
  readonly natural: number;
  /** How long it is drawn. */
  readonly drawn: number;
  /** Its place in `fit.items`. */
  readonly at: number;
}

const mainOf = (r: Rect, axis: StackAxis): number => (axis === "column" ? r.height : r.width);
const startOf = (r: Rect, axis: StackAxis): number => (axis === "column" ? r.y : r.x);

/** The items drawn in a form that grows, in the stack's order. */
function growers(input: StackInput, fit: StackFit): Grower[] {
  const byId = new Map(input.items.map((it) => [it.id, it]));
  const known = sizesOf(fit);
  const out: Grower[] = [];
  fit.items.forEach((p, at) => {
    const item = byId.get(p.id);
    const f = item?.forms[p.form];
    if (!item || !f || p.kind === "menu" || f.kind === "menu" || f.wrap || f.main.grows !== true) return;
    const least = known?.least.get(p.id) ?? formMain(f, "min", fit.cross);
    out.push({ id: p.id, fixed: item.fixed === true, least, natural: Math.max(least, formMain(f, "natural", fit.cross)), drawn: mainOf(p.rect, fit.axis), at });
  });
  return out;
}

/** The two items of a divider, when `before` and `after` are neighbors among the open growing ones in that order. */
function pair(open: readonly Grower[], before: string, after: string): [Grower, Grower] | null {
  const i = open.findIndex((g) => g.id === before);
  const next = open[i + 1];
  return i >= 0 && next !== undefined && next.id === after ? [open[i]!, next] : null;
}

/**
 * `input` with every growing item written at the length it is drawn (the pair given moved to `to`), so the stack is laid out
 * as drawn and nothing but the pair moves. Short of length the items are drawn part of the way from their least to the
 * length they ask for (`tight`); a length written one step back from there is drawn exactly that way again, whatever the
 * items that don't grow do. Items already at their length stay the same objects.
 */
function written(input: StackInput, fit: StackFit, all: readonly Grower[], to: ReadonlyMap<string, number>): StackInput {
  const tight = sizesOf(fit)?.tight;
  const share = tight !== undefined && tight > EPS && tight < 1 ? tight : 1;
  const byId = new Map(all.map((g) => [g.id, g]));
  let changed = false;
  const items = input.items.map((it) => {
    const g = byId.get(it.id);
    if (!g) return it;
    const length = g.least + ((to.get(g.id) ?? g.drawn) - g.least) / share;
    const was = it.length?.[input.axis];
    if (was !== undefined && Math.abs(was - length) <= EPS) return it;
    changed = true;
    return { ...it, length: { ...it.length, [input.axis]: length } };
  });
  return changed ? { ...input, items } : input;
}

/**
 * The dividers of a stack laid out as `fit`, one per pair of nearest open growing items, in the stack's order. A collapsed
 * item has none of its own; where collapsed items sit between two open ones there is one divider between the open
 * ones, on the far edge of the last collapsed one.
 */
export function dividers(input: StackInput, fit: StackFit): StackDivider[] {
  const open = growers(input, fit).filter((g) => !g.fixed);
  const out: StackDivider[] = [];
  for (let k = 0; k + 1 < open.length; k++) {
    const b = open[k]!;
    const a = open[k + 1]!;
    // The last item drawn before `after`: the divider sits on its far edge.
    let prev = a.at - 1;
    while (prev > b.at && fit.items[prev]!.kind === "menu") prev--;
    const last = fit.items[prev]!.rect;
    const from = startOf(last, fit.axis) + mainOf(last, fit.axis);
    const thick = Math.max(0, startOf(fit.items[a.at]!.rect, fit.axis) - from);
    const across = fit.items[b.at]!.rect;
    const rect: Rect = fit.axis === "column" ? { x: across.x, y: from, width: across.width, height: thick } : { x: from, y: across.y, width: thick, height: across.height };
    out.push({ before: b.id, after: a.id, rect, range: { min: 0 - Math.max(0, b.drawn - b.least), max: Math.max(0, a.drawn - a.least) } });
  }
  return out;
}

/**
 * Move the divider between the open growing items `before` and `after` by `delta` px along the stack: `before` gets
 * longer by `delta` and `after` shorter (a negative `delta` the other way), so the stack's total is the same and only the
 * two move. The first resize writes the length each open growing item is drawn at, so nothing else shifts. Neither goes
 * under its least: `delta` is clamped to the divider's `range`, no item collapses and none is pushed. Returns the same
 * object when nothing changes (not neighbors, an unknown id, a `delta` that isn't a number, or one clamped to 0).
 * `options.previous` is the fit the stack had, as for `fitStack`.
 */
export function resizeBetween(input: StackInput, before: string, after: string, delta: number, options: FitOptions = {}): StackInput {
  if (!Number.isFinite(delta)) return input;
  const fit = fitStack(input, options);
  const all = growers(input, fit);
  const ends = pair(
    all.filter((g) => !g.fixed),
    before,
    after,
  );
  if (!ends) return input;
  const [b, a] = ends;
  const d = Math.min(Math.max(delta, 0 - Math.max(0, b.drawn - b.least)), Math.max(0, a.drawn - a.least));
  if (Math.abs(d) <= EPS) return input;
  return written(
    input,
    fit,
    all,
    new Map([
      [b.id, b.drawn + d],
      [a.id, a.drawn - d],
    ]),
  );
}

/**
 * Give the two items of a divider back their natural split: their combined drawn length shared in proportion to their
 * natural lengths (their forms' `main.natural`, the least at most), nothing else moving. The double-click action. Returns
 * the same object when the two are at that split already, or are not neighbors.
 */
export function resetBetween(input: StackInput, before: string, after: string, options: FitOptions = {}): StackInput {
  const fit = fitStack(input, options);
  const all = growers(input, fit);
  const ends = pair(
    all.filter((g) => !g.fixed),
    before,
    after,
  );
  if (!ends) return input;
  const [b, a] = ends;
  const both = b.drawn + a.drawn;
  const want = b.natural + a.natural > EPS ? (both * b.natural) / (b.natural + a.natural) : both / 2;
  const first = Math.min(Math.max(want, b.least), Math.max(b.least, both - a.least));
  if (Math.abs(first - b.drawn) <= EPS) return input;
  return written(
    input,
    fit,
    all,
    new Map([
      [b.id, first],
      [a.id, both - first],
    ]),
  );
}

/**
 * `input` with every asked length of the stack's axis deleted, back to the split a stack with none has. An item's length
 * for the other axis stays. Returns the same object when no item had one.
 */
export function resetLengths(input: StackInput): StackInput {
  let changed = false;
  const items = input.items.map((it) => {
    if (it.length === undefined) return it;
    changed = true;
    const { [input.axis]: _dropped, ...rest } = it.length;
    const { length: _length, ...bare } = it;
    return Object.keys(rest).length > 0 ? { ...bare, length: rest } : bare;
  });
  return changed ? { ...input, items } : input;
}
