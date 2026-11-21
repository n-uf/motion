/** Helpers for the control-ladder tests: seeded specs, a bar of generated groups, a 1 px sweep and a decoder of the fixed shape. */
import { controlLadder, fitStack, type ControlLadderSpec, type StackFit, type StackInput, type StackItem } from "../src/stack";

export const GAP = 6;
export const MENU = 24;
export const TITLE = { min: 50, natural: 200 };

const int = (rand: () => number, lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));

/**
 * A random group: 2 to 4 controls, 2 to 4 tiers. `strict` makes every tier strictly shorter and `more` small enough that
 * every partial fold and the fold shorten the group; otherwise tiers may repeat and `more` may be large, so some forms
 * don't shorten and the solver has to pass them over.
 */
export function randomSpec(rand: () => number, opts: { strict?: boolean; n?: number; tiers?: number } = {}): ControlLadderSpec {
  const n = opts.n ?? int(rand, 2, 4);
  const T = opts.tiers ?? int(rand, 2, 4);
  const controls = Array.from({ length: n }, (_, i) => {
    const last = opts.strict ? int(rand, 20, 28) : int(rand, 4, 30);
    const tiers = [last];
    for (let t = 1; t < T; t++) tiers.unshift(tiers[0]! + (opts.strict ? int(rand, 3, 20) : int(rand, 0, 20)));
    return { id: `c${i}`, tiers };
  });
  return { controls, gap: int(rand, 2, 6), grip: int(rand, 8, 14), more: opts.strict ? int(rand, 10, 18) : int(rand, 0, 40), cross: 28, column: { icons: 80 } };
}

export interface Group {
  readonly id: string;
  readonly spec: ControlLadderSpec;
}

export const groupItem = (g: Group, used: number, kept = false): StackItem => ({ id: g.id, used, ...(kept ? { kept } : {}), forms: controlLadder(g.spec).row });

/** A fixed, growing title: it holds its natural length while the groups can still step in the kind they are in. */
export const title = (): StackItem => ({
  id: "title",
  used: 0,
  fixed: true,
  forms: [{ kind: "row", main: { min: TITLE.min, natural: TITLE.natural, grows: true }, cross: { natural: 28 } }],
});

export const barAt = (items: readonly StackItem[], length: number): StackInput => ({ axis: "row", length, cross: { min: 20, max: 60 }, items, gap: GAP, menu: { main: MENU } });

/** The length at which every item is in its first form, with a little to spare. */
export function wide(items: readonly StackItem[]): number {
  const sum = items.reduce((s, it) => s + it.forms[0]!.main.natural, 0);
  return Math.ceil(sum + (items.length - 1) * GAP + 10);
}

/** Fits at `lengths`, in order, each solved with the one before as `previous` (the first from scratch). */
export function walk(items: readonly StackItem[], lengths: readonly number[], first?: StackFit): StackFit[] {
  const out: StackFit[] = [];
  let previous = first;
  for (const length of lengths) {
    const fit = fitStack(barAt(items, length), previous ? { previous } : {});
    out.push(fit);
    previous = fit;
  }
  return out;
}

/** `from`, `from - 1`, … `to` (inclusive). */
export const down = (from: number, to: number): number[] => Array.from({ length: Math.max(0, from - to + 1) }, (_, i) => from - i);
export const up = (from: number, to: number): number[] => down(to, from).reverse();

/** A fit's form index per item id. */
export const formsOf = (fit: StackFit): Record<string, number> => Object.fromEntries(fit.items.map((p) => [p.id, p.form]));

/** What a form index of a group's ladder stands for. The shape is fixed: `n * T + 2` forms. */
export interface Shape {
  readonly n: number;
  readonly T: number;
}
export const shapeOf = (spec: ControlLadderSpec): Shape => ({ n: spec.controls.length, T: Math.max(1, ...spec.controls.map((c) => c.tiers.length)) });
/** The last form of the tier steps (every control at the last tier, none hidden). */
export const tierEnd = (s: Shape): number => s.n * (s.T - 1);
export const foldAt = (s: Shape): number => s.n * s.T;
export const menuAt = (s: Shape): number => s.n * s.T + 1;

export interface Level {
  /** Tier steps taken. */
  readonly steps: number;
  /** Controls hidden by a partial fold (all of them in `fold` and `menu`). */
  readonly hidden: number;
  /** Each control's tier, in fold order (the first to fold first). */
  readonly tier: readonly number[];
}
export function levelAt(s: Shape, index: number): Level {
  const steps = Math.min(index, tierEnd(s));
  const hidden = index <= tierEnd(s) ? 0 : index >= foldAt(s) ? s.n : index - tierEnd(s);
  const tier = Array.from({ length: s.n }, (_, p) => (steps > p ? Math.ceil((steps - p) / s.n) : 0));
  return { steps, hidden, tier };
}

/** Whether a form after `index`, up to the last partial fold, is shorter than the form at `index`. */
export function rowStepLeft(forms: StackItem["forms"], s: Shape, index: number): boolean {
  for (let j = index + 1; j < foldAt(s); j++) if (forms[j]!.main.min < forms[index]!.main.min) return true;
  return false;
}

/** Like `rowStepLeft`, but only over the tier steps. */
export function tierStepLeft(forms: StackItem["forms"], s: Shape, index: number): boolean {
  for (let j = index + 1; j <= tierEnd(s); j++) if (forms[j]!.main.min < forms[index]!.main.min) return true;
  return false;
}

/** The length the forms at `at` (index per item id) need at least: sizes, gaps, and the » entry when any is in the menu. */
export function needOf(items: readonly StackItem[], at: Record<string, number>): number {
  const inMenu = items.some((it) => it.forms[at[it.id]!]!.kind === "menu");
  const drawn = items.filter((it) => it.forms[at[it.id]!]!.kind !== "menu");
  const slots = drawn.length + (inMenu ? 1 : 0);
  return drawn.reduce((s, it) => s + it.forms[at[it.id]!]!.main.min, 0) + (slots > 1 ? (slots - 1) * GAP : 0) + (inMenu ? MENU : 0);
}
