/**
 * `controlLadder`: a control group's forms, generated from its controls.
 *
 * A host that hand-writes a group's forms gives a few coarse steps (a row, icons, a fold). A host that declares what the
 * group holds (its controls, each with its lengths per tier) gets the fine ladder instead, so a bar runs short control
 * by control and not group by group. Nothing here is a solver rule: the result is an ordinary `StackForm[]` with `rank`
 * and `hides` set, and `fitStack` takes it like any other (the lowest-ranked next form across all items, its tie-breaks,
 * the way back by `previous`).
 *
 * The ladder, in order, for `n` controls and `T` tiers (a tier is one length per control, longest first):
 * 1. The first form: every control at tier 0, a `row`.
 * 2. The tier steps, one control at a time in fold order: the control that folds first takes tier 1, then the next, then
 *    the first takes tier 2, and so on to tier `T - 1` for all. Each is a `row` with every control shown. Step `i`
 *    (0-based, within tier `t`) has rank `100 * t + i / n` for tiers 1 and 2, so groups of different sizes level within
 *    a tier; tiers 3 and later share the band from 300 in tier order, rank `300 + (t - 3 + i / n) / (T - 3)`, so the
 *    ranks strictly increase along the group and stay under 400 for any `T`.
 * 3. The partial folds, at the last tier: for `k = 1 … n - 1`, a `row` that hides the first `k` controls in fold order
 *    (`hides` lists them) and shows a `more` cell for them. Rank `400 + k / n`: the group with the fewest hidden controls
 *    folds next.
 * 4. `fold` (the grip and the `more` cell in line, `hides` every control), rank 500, then `menu`, rank 600.
 *
 * Every row form carries `tiers`, each shown control's tier index (`StackForm.tiers`; `fold` and `menu` have none), so a
 * host draws a control from the form the layout chose, with no knowledge of this order.
 *
 * Every form is always emitted, even when it is no shorter than the one before: the solver passes over a form that
 * doesn't shorten the stack, and the shape (`n * T + 2` forms, `0` with no controls) depends on the control and tier
 * counts alone, so a form index stays valid when a length changes. When the control set itself changes, solve the group
 * fresh (no `previous`).
 *
 * Ranks are spaced by step type in fixed bands whatever a group's tier count: tier steps in [100, 400), partial folds
 * 400 + k / n, fold 500, menu 600. So the same-tier steps of several groups interleave, and a partial fold never comes
 * before another group's tier step, even when the groups have different tier counts.
 */
import type { StackForm } from "./model";

/** One control of a group: an id and its length along the stack per tier. */
export interface LadderControl {
  readonly id: string;
  /**
   * Its lengths per tier, longest first, in the host's order of presentation (full, shorter, shortest). A tier the
   * control doesn't list keeps its last length; a control with none is 0 long. A group's tier count is its longest list.
   */
  readonly tiers: readonly number[];
  /**
   * Folds before the controls with a lower number (default: its index, so the last control folds first). Ties go to the
   * later control. The same order sets which control a tier step shortens first.
   */
  readonly foldOrder?: number;
}

/** A control group, declared by its controls. All lengths are along the stack, px. */
export interface ControlLadderSpec {
  /** In drawing order. */
  readonly controls: readonly LadderControl[];
  /** Between two neighboring controls (default 0). The grip and the `more` cell are the cells' own widths, with no gap. */
  readonly gap?: number;
  /** The grip cell at the group's start (default 0); every form but the menu carries it as `StackForm.grip`. */
  readonly grip?: number;
  /** The group's own » cell, drawn once any control is hidden. */
  readonly more: number;
  /** The group's thickness across the stack (a bar's height). */
  readonly cross: number;
  /**
   * The group's form in a column (a rail): an `icons` strip `icons` long, then the menu. `cross` is its width (default
   * the group's `cross`). Without it the group has no column forms.
   */
  readonly column?: { readonly icons: number; readonly cross?: number };
  /**
   * A pinned primary's level (default 0): its partial folds, fold and menu rank `keep * 1000` higher, so every group of a
   * lower level gives way entirely before it folds a control. Tier steps are unchanged.
   */
  readonly keep?: number;
}

/** A group's forms along a bar (`row`) and, when declared, down a column; assignable to `@n-uf/docking`'s `DockItem.forms`. */
export interface ControlLadder {
  readonly row: readonly StackForm[];
  readonly column?: readonly StackForm[];
}

const nonNeg = (x: number | undefined): number => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, x) : 0);
const RANK_TIER = 100;
const RANK_KEEP = 1000;

/** `spec`'s forms: the row ladder, and the column ladder when `spec.column` is given. Pure. */
export function controlLadder(spec: ControlLadderSpec): ControlLadder {
  const keep = Math.max(0, Number.isFinite(spec.keep) ? spec.keep! : 0) * RANK_KEEP;
  const cross = nonNeg(spec.cross);
  const grip = nonNeg(spec.grip);
  const gap = nonNeg(spec.gap);
  const more = nonNeg(spec.more);
  const column: StackForm[] | undefined = spec.column
    ? [
        { kind: "icons", main: { min: nonNeg(spec.column.icons), natural: nonNeg(spec.column.icons) }, cross: { natural: nonNeg(spec.column.cross ?? spec.cross) }, ...(grip > 0 ? { grip } : {}) },
        { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 }, ...(keep > 0 ? { rank: keep } : {}) },
      ]
    : undefined;

  const controls = spec.controls;
  const n = controls.length;
  if (n === 0) return { row: [], ...(column ? { column } : {}) };
  const tierCount = Math.max(1, ...controls.map((c) => c.tiers.length));
  const length = (c: LadderControl, tier: number): number => nonNeg(c.tiers[Math.min(tier, c.tiers.length - 1)]);
  /** The control indexes in fold order: the first folds (and is shortened) first. */
  const order = controls
    .map((c, index) => ({ index, key: typeof c.foldOrder === "number" && Number.isFinite(c.foldOrder) ? c.foldOrder : index }))
    .sort((a, b) => b.key - a.key || b.index - a.index)
    .map((o) => o.index);
  const ids = (hidden: ReadonlySet<number>): string[] => controls.filter((_, i) => hidden.has(i)).map((c) => c.id);
  const form = (main: number, extra: Partial<StackForm> & Pick<StackForm, "kind">): StackForm => ({ main: { min: main, natural: main }, cross: { natural: cross }, ...(grip > 0 ? { grip } : {}), ...extra });
  /** Tiers 1 and 2 own a band each; every later tier shares the band from 300, in tier order, always under 400. */
  const tierRank = (t: number, i: number): number => (t <= 2 ? RANK_TIER * t + i / n : 3 * RANK_TIER + (t - 3 + i / n) / (tierCount - 3));

  const row: StackForm[] = [];
  // The tier of every control now; the row's length with the controls in `shown`.
  const at = controls.map(() => 0);
  const rowLength = (shown: readonly number[], extra: number): number => shown.reduce((s, i) => s + length(controls[i]!, at[i]!), 0) + Math.max(0, shown.length - 1) * gap + grip + extra;
  const all = controls.map((_, i) => i);
  /** `StackForm.tiers` for the controls in `shown`: the tier each has now, held to its own list, so always a valid index into it. */
  const tiersOf = (shown: readonly number[]): Readonly<Record<string, number>> => Object.fromEntries(shown.map((i) => [controls[i]!.id, Math.min(at[i]!, Math.max(0, controls[i]!.tiers.length - 1))]));
  row.push(form(rowLength(all, 0), { kind: "row", tiers: tiersOf(all) }));
  for (let t = 1; t < tierCount; t++) {
    for (let i = 0; i < n; i++) {
      at[order[i]!] = t;
      row.push(form(rowLength(all, 0), { kind: "row", rank: tierRank(t, i), tiers: tiersOf(all) }));
    }
  }
  for (let k = 1; k < n; k++) {
    const hidden = new Set(order.slice(0, k));
    const shown = all.filter((i) => !hidden.has(i));
    row.push(form(rowLength(shown, more), { kind: "row", rank: 4 * RANK_TIER + k / n + keep, hides: ids(hidden), tiers: tiersOf(shown) }));
  }
  row.push(form(grip + more, { kind: "fold", rank: 5 * RANK_TIER + keep, hides: ids(new Set(all)) }));
  row.push({ kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 }, rank: 6 * RANK_TIER + keep });
  return { row, ...(column ? { column } : {}) };
}
