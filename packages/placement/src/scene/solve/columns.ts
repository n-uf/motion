/**
 * Column give-way: while the content is narrower than `contentMin.width` (after the inset and a gutter after each side
 * edge and rail), dynamic columns shrink toward their minimum, then fold whole into their side's rail, unkept before
 * kept, the oldest newest use first, the outer first, the left first. Under `previous`, what gave way stays so while
 * the content still fits, and room coming back unfolds in the reverse of give-way order.
 */
import { EPS, type Rect } from "../../geometry";
import { formCrossMin, formSetsCross, type StackForm } from "../../stack";
import { formsOf, isSideBar, startOf } from "../helpers";
import type { Edge, SceneNote } from "../model";
import type { Draft } from "./draft";
import { solveEdge, type EdgeSolve } from "./edge";
import type { Frame } from "./insets";
import { finite, giveWayOrder, px } from "./order";

/** One left or right edge as give-way weighs it. */
export interface Col {
  readonly edge: Edge;
  readonly side: "left" | "right";
  readonly solved: EdgeSolve;
  readonly width: number;
  readonly min: number;
  readonly visible: readonly string[];
  readonly dyn: boolean;
  readonly hand: boolean;
  readonly kept: boolean;
  readonly age: number;
}

/** Give-way's answer: the columns folded by it (in fold order), each other column's width, and how they show. */
export interface GiveWay {
  readonly auto: ReadonlySet<Col>;
  readonly widths: ReadonlyMap<Col, number>;
  readonly excess: number;
  /** In the side's rail: folded by give-way, or by hand and not riding. */
  readonly railed: (c: Col) => boolean;
  /** Riding as title bars over the side's first open column (`handFold: "ride"`). */
  readonly riding: (c: Col) => boolean;
  /** The columns in shrink order. */
  readonly shrinkOrder: readonly Col[];
}

/** The side edges solved at the area's height (`tall`: an edge outside the inset runs into it). */
export function columnsOf(d: Draft, sideEdges: readonly Edge[], area: Rect, tall: (edge: Edge) => number): Col[] {
  const { scene } = d;
  return sideEdges.map((edge) => {
    const side = edge.side as "left" | "right";
    const solved = solveEdge(scene, edge, d.owned.get(edge)!, tall(edge), Math.max(0, area.width), d.prevEdge(edge));
    const width = solved.stack.items.length === 0 ? 0 : Math.min(solved.stack.cross, area.width);
    const visible = d.owned.get(edge)!.filter((id) => !scene.items[id]!.closed);
    // A dynamic column, or a static edge that gives way like one (`giveWay`).
    const dyn = (edge.column === true || edge.giveWay === true) && scene.rails?.[side] !== undefined && visible.length > 0;
    const forms = (id: string): readonly StackForm[] => formsOf(scene.items[id]!, "column");
    const setters = solved.free.items.filter((p) => p.kind !== "menu" && formSetsCross(forms(p.id)[p.form]!));
    const min = setters.length > 0 ? Math.min(width, Math.max(px(edge.cross.min), ...setters.map((p) => formCrossMin(forms(p.id)[p.form]!)))) : width;
    return {
      edge,
      side,
      solved,
      width,
      min,
      visible,
      dyn,
      hand: dyn && edge.column === true && visible.every((id) => startOf(scene.items[id]!, formsOf(scene.items[id]!, "column")) > 0),
      kept: visible.some((id) => scene.items[id]!.kept === true),
      age: Math.max(-Infinity, ...visible.map((id) => finite(scene.items[id]!.used, 0))),
    };
  });
}

/** Which columns fold and how wide the rest are, in `area` (`gutter` after each column and rail). */
export function giveWay(d: Draft, cols: readonly Col[], area: Rect, gutter: number): GiveWay {
  const { scene, previous, fresh, opened } = d;
  const ride = scene.handFold === "ride";
  const cmin = scene.contentMin ? px(scene.contentMin.width) : undefined;
  const foldOrder = cols
    .filter((c) => c.dyn && !c.hand && c.width > 0)
    .sort((a, b) => giveWayOrder(a, b) || (a.side === b.side ? 0 : a.side === "left" ? -1 : 1));
  // Under `previous`, the columns that were shrunk shrink first, in the order they did, so ages alone move nothing.
  const shrunkBefore = (previous?.notes ?? []).flatMap((n) => (n.code === "column-shrunk" ? [n.edge] : []));
  const rankOf = (c: Col): number => (shrunkBefore.includes(c.edge.id) ? shrunkBefore.indexOf(c.edge.id) : Infinity);
  const shrinkOrder = foldOrder.map((c, i) => ({ c, i })).sort((a, b) => (rankOf(a.c) === rankOf(b.c) ? a.i - b.i : rankOf(a.c) < rankOf(b.c) ? -1 : 1)).map((x) => x.c);
  const railW = (side: "left" | "right"): number => px(scene.rails?.[side]?.width);
  const evaluate = (auto: ReadonlySet<Col>): GiveWay => {
    // Riders ride over an open panel column (never an anchor), every member of a hand-folded column a bar.
    const openOn = (side: "left" | "right"): boolean => cols.some((c) => c.side === side && c.dyn && c.edge.column === true && !c.hand && !auto.has(c) && c.width > 0);
    const riding = (c: Col): boolean => ride && c.hand && openOn(c.side);
    const railed = (c: Col): boolean => c.dyn && (auto.has(c) || (c.hand && !riding(c)));
    const widths = new Map(cols.filter((c) => !railed(c) && !riding(c)).map((c) => [c, c.width]));
    const railSides = (["left", "right"] as const).filter((s) => cols.some((c) => c.side === s && railed(c)));
    let used = 0;
    // An edge outside the inset has no gutter after it (the inset is there).
    for (const [c, w] of widths) used += w > 0 ? w + (c.edge.outsideInset === true ? 0 : gutter) : 0;
    for (const s of railSides) used += railW(s) + gutter;
    let excess = cmin === undefined ? -Infinity : used + cmin - area.width;
    for (const c of shrinkOrder) {
      if (excess <= EPS) break;
      const w = widths.get(c);
      if (w === undefined) continue;
      const take = Math.min(excess, w - c.min);
      if (take > 0) {
        widths.set(c, w - take);
        excess -= take;
      }
    }
    return { auto, widths, excess, railed, riding, shrinkOrder };
  };
  let auto = new Set<Col>();
  if (cmin !== undefined) {
    // Room that came back unfolds in the reverse of the order the columns folded in (the fold notes' order), one at a
    // time, stopping at the first that can't come back: never by age, so a press can't unfold anything.
    const unfold = (): void => {
      for (const c of [...auto].reverse()) {
        const fewer = new Set([...auto].filter((x) => x !== c));
        if (evaluate(fewer).excess <= EPS) auto = fewer;
        else break;
      }
    };
    if (previous) {
      // What gave way before stays folded, in the order it folded, while the content still fits without it coming back.
      const byId = new Map(foldOrder.map((c) => [c.edge.id, c]));
      // A column with a `fresh` item (or itself `fresh`) is weighed anew, and so is one an item opens into beside items
      // already open there (a request to show it). A column whose items were all closed and open again is not: a closed
      // item is not a removed one, and its column's give-way, kept while it was closed, applies again.
      const anew = (c: Col): boolean =>
        fresh.has(c.edge.id) || c.visible.some((id) => fresh.has(id)) || (c.visible.some((id) => opened.has(id)) && c.visible.some((id) => !opened.has(id)));
      const was = previous.notes.flatMap((n) => ((n.code === "column-folded" || n.code === "kept-folded") && byId.has(n.edge) && !anew(byId.get(n.edge)!) ? [byId.get(n.edge)!] : []));
      auto = new Set(was);
      if (evaluate(auto).excess <= EPS) unfold();
    }
    // A need for more folds the next in give-way order.
    for (const c of foldOrder) {
      if (evaluate(auto).excess <= EPS) break;
      if (!auto.has(c)) auto = new Set([...auto, c]);
    }
    // A fold can make an earlier one needless (a second column into a rail the first already paid for): unfold to a
    // fixpoint, so solving again from this layout changes nothing.
    for (let size = -1; size !== auto.size; ) {
      size = auto.size;
      unfold();
    }
  }
  return evaluate(auto);
}

/**
 * Whether one panel column at its minimum fits beside the content's minimum: a host's narrow fallback (the sheet)
 * reads it (`columnRoom`, with a `no-column-room` note when not). Anchors and rails don't count: every column, an anchor
 * included, can fold into its rail. A side toolbar bar with an item does: it never folds.
 * With no column edge yet (every panel floating), a side's column template says how narrow its column could be: its
 * `cross.min`, or more where the items it takes need more (their form's least width), as a column holding them would.
 * The question is hypothetical (could one column open?), so it is answered as if that column were open: a column
 * folded whole by hand counts at its open minimum, and the floating items a template takes at their open forms.
 * Every column edge with an item counts, whether its side has a rail or not.
 */
export function columnRoom(d: Draft, cols: readonly Col[], area: Rect, f: Frame): void {
  const { scene } = d;
  const cmin = scene.contentMin ? px(scene.contentMin.width) : undefined;
  const openMin = (ids: readonly string[], least: number): number =>
    Math.max(
      least,
      ...ids.map((id) => {
        const form = formsOf(scene.items[id]!, "column")[0];
        return form && formSetsCross(form) ? formCrossMin(form) : 0;
      }),
    );
  const open = cols.filter((c) => c.edge.column === true && c.visible.length > 0).map((c) => (c.hand ? openMin(c.visible, px(c.edge.cross.min)) : c.min));
  const templates = (["left", "right"] as const).flatMap((s) => {
    const t = scene.columns?.[s];
    if (!t) return [];
    const takes = Object.values(scene.items).filter((it) => !it.fixed && !it.closed && t.accepts.includes(it.kind));
    return [openMin(takes.map((it) => it.id), px(t.cross.min))];
  });
  const colMins = open.length > 0 ? open : templates;
  if (cmin === undefined || colMins.length === 0) return;
  // A side toolbar bar never folds: one that lays out an item takes its width (and the gutter after it, unless it
  // lies outside the inset, which the area already leaves out) from the room a column could have.
  const bars = cols.filter((c) => c.width > 0 && !c.dyn && isSideBar(scene, c.edge)).reduce((s, c) => s + c.width + (c.edge.outsideInset === true ? 0 : f.gutter), 0);
  // With `insetWhen: "docked"` and nothing docked now, the column that opens brings the inset with it.
  const width = area.width - bars - (scene.insetWhen === "docked" && !f.docked ? px(scene.inset?.left) + px(scene.inset?.right) : 0);
  const need = cmin + Math.min(...colMins) + f.gutter;
  d.columnRoom = width >= need - EPS;
  if (!d.columnRoom) d.notes.push({ code: "no-column-room", width, need });
}

/**
 * The give-way notes: each column shrunk, then each folded, in the order they folded (`previous` unfolds in reverse). A
 * column whose items are all closed keeps its notes from `previous`, at their place in that order: a closed item is not
 * a removed one, and its column's give-way applies again when it opens.
 */
export function giveWayNotes(d: Draft, g: GiveWay, cols: readonly Col[]): void {
  const { scene, previous } = d;
  const dormant = new Set(cols.filter((c) => c.visible.length === 0 && (c.edge.column === true || c.edge.giveWay === true) && scene.rails?.[c.side] !== undefined).map((c) => c.edge.id));
  const before = previous?.notes ?? [];
  const shrunk = new Map<string, SceneNote>();
  for (const c of g.shrinkOrder) {
    const w = g.widths.get(c);
    if (w !== undefined && w < c.width - EPS) shrunk.set(c.edge.id, { code: "column-shrunk", edge: c.edge.id, from: c.width, to: w });
  }
  const folded = new Map<string, SceneNote>([...g.auto].map((c) => [c.edge.id, { code: c.kept ? "kept-folded" : "column-folded", edge: c.edge.id }]));
  // Kept notes go where they were in `previous`'s order; the others after them, in their own order.
  const merge = (now: Map<string, SceneNote>, kept: (n: SceneNote) => boolean): void => {
    const order: SceneNote[] = [];
    for (const n of before) {
      const edge = kept(n) && "edge" in n ? n.edge : undefined;
      if (edge === undefined) continue;
      if (dormant.has(edge)) order.push(n);
      else if (now.has(edge)) {
        order.push(now.get(edge)!);
        now.delete(edge);
      }
    }
    d.notes.push(...order, ...now.values());
  };
  // A shrink is no history to keep: a column shrinks again by the usual order when it opens.
  d.notes.push(...shrunk.values());
  merge(folded, (n) => n.code === "column-folded" || n.code === "kept-folded");
}
