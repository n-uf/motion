/**
 * One edge as a stack (`fitStack`): its free fit, then, for a column, its rail (nothing in it sets the width) or the
 * user's size. A compact edge is icons only.
 */
import { EPS } from "../../geometry";
import { fitStack, formCrossMin, formSetsCross, type StackFit, type StackForm, type StackInput, type StackItem } from "../../stack";
import { axisOf, formsOf, pastWrap, railModeOf, startOf, zoneOf } from "../helpers";
import type { Edge, Scene, SceneEdgeLayout, SceneItem } from "../model";
import { finite, px, zoneSorted } from "./order";

const stackItemOf =(item: SceneItem, forms: readonly StackForm[], edge: Edge, from?: number): StackItem => ({
  id: item.id,
  forms,
  used: finite(item.used, 0),
  ...(item.kept ? { kept: true } : {}),
  // Where its ladder starts: as asked, else its hand fold resolved on this axis (`startOf`: its folded form).
  ...(from !== undefined ? { from } : startOf(item, forms, edge) > 0 ? { from: startOf(item, forms, edge) } : {}),
  ...(item.fixed ? { fixed: true } : {}),
});

/** Whether anything drawn in the fit sets its cross size. */
function hasSetter(fit: StackFit, forms: (id: string) => readonly StackForm[]): boolean {
  return fit.items.some((p) => p.kind !== "menu" && formSetsCross(forms(p.id)[p.form]!));
}

export interface EdgeSolve {
  readonly stack: StackFit;
  readonly free: StackFit;
  readonly tabs: readonly string[];
  readonly closedTabs: ReadonlySet<string>;
  readonly input: StackInput;
  /** The form each open item started in (its stack item's `from` in the free fit): one drawn below it gave way. */
  readonly starts: ReadonlyMap<string, number>;
  /** Items left out of a rail: they have only `wrap` forms left (`no-vertical-form`). */
  readonly leftOut?: readonly string[];
  /** Items left out of a compact edge: they have no `icons` form (`no-icons-form`). */
  readonly leftOutIcons?: readonly string[];
}

/** How far a tray toolbar's steps rank after the panels' (its forms' `rank` plus this). */
const TRAY_RANK = 100;

/** What every way of solving one edge shares: its items in zone order, their forms with priority, the stack's base. */
interface EdgeFrame {
  readonly scene: Scene;
  readonly edge: Edge;
  readonly column: boolean;
  readonly ordered: readonly string[];
  readonly formsById: (id: string) => readonly StackForm[];
  readonly base: Omit<StackInput, "items">;
  readonly previous: SceneEdgeLayout | undefined;
}

/** The form each item of `input` starts in. */
const startsOf = (input: StackInput): ReadonlyMap<string, number> => new Map(input.items.map((i) => [i.id, i.from ?? 0]));

/** An icons-only edge: each item starts at its icons form (the » menu may follow); one without is left out. */
function compactEdge(f: EdgeFrame): EdgeSolve {
  const { scene, edge, formsById } = f;
  const iconsAt = (id: string): number => {
    const forms = formsById(id);
    for (let j = startOf(scene.items[id]!, forms, edge); j < forms.length; j++) if (forms[j]!.kind === "icons") return j;
    return forms.findIndex((x) => x.kind === "icons");
  };
  const shown = f.ordered.filter((id) => !scene.items[id]!.closed && iconsAt(id) >= 0);
  const leftOutIcons = f.ordered.filter((id) => !scene.items[id]!.closed && iconsAt(id) < 0);
  const compactInput: StackInput = { ...f.base, ownCross: false, items: shown.map((id) => stackItemOf(scene.items[id]!, formsById(id), edge, iconsAt(id))) };
  const stack = fitStack(compactInput, f.previous ? { previous: f.previous.free } : {});
  return { stack, free: stack, tabs: [], closedTabs: new Set(), input: compactInput, starts: startsOf(compactInput), leftOutIcons };
}

/**
 * A rail (a column in which nothing sets the width): the items with a rail form take it (closed ones too, with
 * `railShowsClosed`); null when no item shown has one.
 */
function railEdge(f: EdgeFrame, free: StackFit, asStackItem: (id: string) => StackItem, starts: ReadonlyMap<string, number>): EdgeSolve | null {
  const { scene, edge, formsById } = f;
  const railIndex = (item: SceneItem, forms: readonly StackForm[]): number => {
    if (item.fixed) return -1;
    for (let j = startOf(item, forms, edge); j < forms.length; j++) if (forms[j]!.kind === "rail") return j;
    return -1;
  };
  // Vertical means icons: an item with only `wrap` forms left has no form for a rail, and is left out (noted).
  const wrapOnly = (id: string): boolean => railIndex(scene.items[id]!, formsById(id)) < 0 && pastWrap(formsById(id), startOf(scene.items[id]!, formsById(id), edge)) === undefined;
  const shown = f.ordered.filter((id) => {
    const it = scene.items[id]!;
    if (!it.closed && wrapOnly(id)) return false;
    return !it.closed || (edge.railShowsClosed === true && railIndex(it, formsById(id)) >= 0);
  });
  const leftOut = f.ordered.filter((id) => !scene.items[id]!.closed && wrapOnly(id));
  const anyRail = shown.some((id) => railIndex(scene.items[id]!, formsById(id)) >= 0);
  if (!anyRail) return null;
  const railInput: StackInput = {
    ...f.base,
    // The side's rail mode: a title rail form is offered only while the side shows titles.
    ...(railModeOf(scene, edge.side) === "titles" ? { titles: true } : {}),
    items: shown.map((id) => {
      const it = scene.items[id]!;
      const j = railIndex(it, formsById(id));
      // Vertical means icons: in a rail a group skips its `wrap` forms (a tray toolbar keeps its tray forms, no menu).
      const forms = asStackItem(id).forms;
      return stackItemOf(it, forms, edge, j >= 0 ? j : pastWrap(forms, startOf(it, forms, edge)));
    }),
  };
  const stack = fitStack(railInput, f.previous ? { previous: f.previous.stack } : {});
  const tabs = stack.items.filter((p) => p.kind === "rail").map((p) => p.id);
  const closedTabs = new Set(shown.filter((id) => scene.items[id]!.closed));
  return { stack, free, tabs, closedTabs, input: railInput, starts, leftOut };
}

/** One edge's stack along `length`: the free fit, then the rail or the user's size. */
export function solveEdge(scene: Scene, edge: Edge, ids: readonly string[], length: number, room: number, previous: SceneEdgeLayout | undefined): EdgeSolve {
  const axis = axisOf(edge.side);
  const column = axis === "column";
  const ordered = zoneSorted(scene, ids);
  // An item's give-way priority (its own, else its edge's default) adds to its forms' `rank`: lower steps down first.
  const priorityOf = (id: string): number => finite(scene.items[id]!.priority ?? edge.priority ?? 0, 0);
  const formsById = (id: string): readonly StackForm[] => {
    const forms = formsOf(scene.items[id]!, axis);
    const p = priorityOf(id);
    return p === 0 ? forms : forms.map((f) => ({ ...f, rank: finite(f.rank ?? 0, 0) + p }));
  };
  // Never wider across than the room the cut leaves it.
  const maxOf = Number.isNaN(edge.cross.max) ? Infinity : edge.cross.max;
  const cross = { min: Math.min(px(edge.cross.min), room), max: Math.min(maxOf, room), rail: Math.min(px(edge.cross.rail ?? 30), room) };
  const base: Omit<StackInput, "items"> = {
    axis,
    length,
    cross,
    ...(edge.menu ? { menu: edge.menu } : {}),
    ...(edge.gap !== undefined ? { gap: edge.gap } : {}),
    ...(edge.pad ? { pad: edge.pad } : {}),
    ...(column ? { ownCross: true } : {}),
  };
  const frame: EdgeFrame = { scene, edge, column, ordered, formsById, base, previous };
  if (edge.compact) return compactEdge(frame);
  const open = ordered.filter((id) => !scene.items[id]!.closed);
  /**
   * A toolbar in a column's tray (the end zone, when `zoneAccepts` lists it) takes only its `wrap` or `icons` form, never
   * the menu, and its steps rank after every other item's, so the panels above give way first.
   */
  const asStackItem = (id: string): StackItem => {
    const it = scene.items[id]!;
    const forms = formsById(id);
    if (!column || !edge.zoneAccepts?.end || zoneOf(it) !== "end") return stackItemOf(it, forms, edge);
    const tray = (f: StackForm): boolean => f.kind === "wrap" || f.kind === "icons" || !!f.wrap;
    let first = -1;
    for (let j = startOf(it, forms, edge); j < forms.length && first < 0; j++) if (tray(forms[j]!)) first = j;
    let last = -1;
    forms.forEach((f, j) => {
      if (tray(f)) last = j;
    });
    if (first < 0) return stackItemOf(it, forms, edge);
    return stackItemOf(it, forms.slice(0, last + 1).map((f) => ({ ...f, rank: finite(f.rank ?? 0, 0) + TRAY_RANK })), edge, first);
  };
  const input: StackInput = { ...base, items: open.map(asStackItem) };
  const free = fitStack(input, previous ? { previous: previous.free } : {});
  const none = new Set<string>();
  // The forms the items started in, before the rail or the user's size re-solved them: what gave way is read against these.
  const starts = startsOf(input);
  if (column && !hasSetter(free, formsById)) {
    const rail = railEdge(frame, free, asStackItem, starts);
    if (rail) return rail;
  }
  // A bar that gives way (a top or bottom edge with `giveWay`) never draws an item thinner across than its form allows:
  // under its height give-way's cap, such an item starts at its next form that fits (a panel's title bar), counted as
  // given way against the form it started in.
  if (!column && edge.giveWay === true) {
    const fits = (f: StackForm): boolean => !formSetsCross(f) || formCrossMin(f) <= cross.max + EPS;
    let moved = false;
    const items = input.items.map((it): StackItem => {
      const from = it.from ?? 0;
      if (it.fixed || fits(it.forms[from]!)) return it;
      const j = it.forms.findIndex((f, k) => k > from && f.kind !== "menu" && fits(f));
      if (j < 0) return it;
      moved = true;
      return { ...it, from: j };
    });
    if (moved) {
      const folded: StackInput = { ...input, items };
      return { stack: fitStack(folded), free, tabs: [], closedTabs: none, input: folded, starts };
    }
  }
  const size = edge.size;
  if (typeof size === "number" && Number.isFinite(size) && hasSetter(free, formsById)) {
    const setters = free.items.filter((p) => p.kind !== "menu" && formSetsCross(formsById(p.id)[p.form]!));
    const lo = Math.max(px(edge.cross.min), ...setters.map((p) => formCrossMin(formsById(p.id)[p.form]!)));
    const s = Math.min(Math.max(size, lo), Math.max(lo, maxOf), room);
    if (Math.abs(s - free.cross) > EPS) {
      const sized: StackInput = { ...input, cross: { ...cross, min: s, max: s } };
      const stack = fitStack(sized, previous ? { previous: previous.stack } : {});
      return { stack, free, tabs: [], closedTabs: none, input: sized, starts };
    }
  }
  return { stack: free, free, tabs: [], closedTabs: none, input, starts };
}
