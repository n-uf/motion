/**
 * `layoutPanels`: the panels' state, a stage and options in; geometry and structure out: every panel's rect, layer
 * and kind, the columns, the rails, the pages' rect, and coded notes on how it gave way. Pure: the same input always
 * lays out the same. How anything looks is the consumer's.
 *
 * - A column is full height and as wide as its stored width, clamped to its panels' limits. Inside it, a panel
 *   folded by hand is a title bar (`options.bar` tall) and the open ones share the rest of the height equally.
 * - A column whose panels are all folded is railed: its panels become segments of its side's rail (one rail per
 *   side, `options.rail` wide at the outer edge, segments in side order).
 * - With `options.fold` "ride", a column folded by hand on a side that still has an open column rides instead: its
 *   panels become title bars stacked on top of the side's first open column (outer edge first), as wide as that
 *   column, and its open panels share the rest of the height. The folded column keeps its stored place and width, and
 *   the open columns lie as if it were gone. Only when every column on the side is folded does the side show its rail.
 *   Give-way's folds always go to the rail.
 * - A float folded by hand is a title bar: its own x, y and width, `options.bar` tall, still a float (clamped as a
 *   bar, `floating`); unfolding brings its full rect back, as the stored rect never changes.
 * - Give-way: when the open columns, the rails and `pagesMin` don't fit the stage width, columns shrink toward their
 *   minimum, then whole columns fold to the rail, in the policy's order, until the pages fit. Columns holding a kept
 *   panel come after every other column; if the pages still don't fit, they fold too (`kept-folded`). Folding by
 *   give-way never writes `folded`, so a wider stage brings the column back.
 * - Floats: "clamp" keeps a float in the view at layout time (the state keeps the stored rect, so a larger view
 *   brings it back where it was); "free" never moves one. A float's size is never scaled. A pinned float is in view
 *   space and clamped against the view; an unpinned one has its position in page space, clamped so that its screen
 *   rect at pan 0 fits the view, then moved by the view's offset and scale, so it scrolls with the page.
 */
import { rect, type Rect, type Size } from "../geometry";
import { DEFAULT_PANELS_OPTIONS, SIDES, defOf, floatSize, toView, type PanelDef, type PanelsOptions, type PanelsState, type Side } from "./model";

/**
 * Where a panel is, structurally: an open part of a column, a folded title bar (in a column, riding on one, or a
 * folded float), a segment of a rail (the panel itself isn't laid out), or a float.
 */
export type PanelKind = "column" | "bar" | "segment" | "float";

export interface PlacedPanel {
  /** Stage px; for a segment, the segment's rect in its rail. */
  readonly rect: Rect;
  readonly kind: PanelKind;
  /** Columns and rails 0, floats 10 and up (a later float on top). */
  readonly layer: number;
  /** In a rail: there is no panel to lay out, only its segment. */
  readonly hidden: boolean;
  /** Folded by hand (a bar, or a segment of a column folded by hand), or by give-way (a segment). */
  readonly folded: null | "hand" | "auto";
  /** Kept open. */
  readonly kept: boolean;
  /** A pinned float. */
  readonly pinned: boolean;
  /** It floats (open, or folded to a bar). */
  readonly floating: boolean;
  /** Docked: its side and column index (the state's). */
  readonly side?: Side;
  readonly column?: number;
  /** A riding bar: the index of the column it rides on (`options.fold` "ride"). */
  readonly rides?: number;
  /** A float the clamp moved or resized. */
  readonly clamped?: boolean;
}

export interface PlacedColumn {
  readonly side: Side;
  /** The column's index in the state. */
  readonly index: number;
  /** Its rect (zero wide when railed). */
  readonly rect: Rect;
  /** Its stored width clamped to its panels' limits, and those limits. */
  readonly width: number;
  readonly min: number;
  readonly max: number;
  /** null: open; "hand": all its panels folded by hand; "auto": folded by give-way. */
  readonly folded: null | "hand" | "auto";
  /** Shrunk by give-way below its width. */
  readonly shrunk: boolean;
  /** It holds a kept panel. */
  readonly kept: boolean;
  /** The shown panels, top to bottom. */
  readonly panels: readonly string[];
  /** Riding: the index of the column its bars ride on; its rect is the bars'. */
  readonly rides?: number;
}

export interface PlacedRail {
  readonly side: Side;
  readonly rect: Rect;
  readonly segments: readonly { readonly id: string; readonly rect: Rect }[];
}

export type PanelsNoteCode = "column-shrunk" | "column-folded" | "kept-folded" | "pages-under-min" | "float-clamped" | "float-resized";

/** One note on a layout: a code and its data. */
export type PanelsNote =
  | { readonly code: "column-shrunk"; readonly side: Side; readonly column: number; readonly items: readonly string[]; readonly from: number; readonly to: number }
  | { readonly code: "column-folded" | "kept-folded"; readonly side: Side; readonly column: number; readonly items: readonly string[] }
  | { readonly code: "pages-under-min"; readonly width: number; readonly min: number }
  | { readonly code: "float-clamped" | "float-resized"; readonly items: readonly string[] };

export interface PanelsLayout {
  readonly items: Map<string, PlacedPanel>;
  /** The shown columns in side order (left outer → inner, then right outer → inner). */
  readonly columns: readonly PlacedColumn[];
  readonly rails: Partial<Record<Side, PlacedRail>>;
  readonly notes: readonly PanelsNote[];
  /** What is left for the documents. */
  readonly pages: Rect;
}

interface Col {
  readonly side: Side;
  readonly index: number;
  readonly panels: readonly string[];
  readonly min: number;
  readonly max: number;
  readonly width: number;
  readonly hand: boolean;
  readonly kept: boolean;
  readonly age: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The order columns give way in: unkept before kept, then the policy (oldest or newest), outer first, left first. */
export function giveWayOrder<C extends { readonly side: Side; readonly index: number; readonly kept: boolean; readonly age: number }>(cols: readonly C[], order: "oldest" | "newest"): C[] {
  return [...cols].sort((a, b) => Number(a.kept) - Number(b.kept) || (order === "oldest" ? a.age - b.age : b.age - a.age) || a.index - b.index || SIDES.indexOf(a.side) - SIDES.indexOf(b.side));
}

export function layoutPanels(defs: readonly PanelDef[], state: PanelsState, stage: Size, options: Partial<PanelsOptions> = {}): PanelsLayout {
  const opt: PanelsOptions = { ...DEFAULT_PANELS_OPTIONS, ...options };
  const W = stage.width;
  const H = stage.height;
  const closed = new Set(state.closed);
  const folded = new Set(state.folded);
  const kept = new Set(state.kept);
  const by = opt.giveWay.by;
  const ride = opt.fold === "ride";

  // The shown columns.
  const cols: Col[] = [];
  for (const side of SIDES) {
    state.sides[side].forEach((c, index) => {
      const panels = c.panels.filter((id) => !closed.has(id));
      if (panels.length === 0) return;
      const ds = panels.map((id) => defOf(defs, id));
      const min = Math.max(0, ...ds.map((d) => d?.width.min ?? 0));
      const max = Math.max(min, Math.min(...ds.map((d) => d?.width.max ?? Infinity)));
      const width = clamp(Number.isFinite(c.width) ? c.width : min, min, max);
      const age = Math.max(...panels.map((id) => state.clock[id]?.[by] ?? 0));
      cols.push({ side, index, panels, min, max, width, hand: panels.every((id) => folded.has(id)), kept: panels.some((id) => kept.has(id)), age });
    });
  }

  // Give-way: fold the fewest columns in order that let the pages fit, shrinking the rest in order toward their minimum.
  const order = giveWayOrder(
    cols.filter((c) => !c.hand),
    opt.giveWay.order,
  );
  const fit = (k: number): { auto: Set<Col>; widths: Map<Col, number>; excess: number } => {
    const auto = new Set(order.slice(0, k));
    // Riding, a side's hand-folded columns need no rail while one of its columns stays open.
    const open = (side: Side): boolean => cols.some((c) => c.side === side && !c.hand && !auto.has(c));
    const railed = (side: Side): boolean => cols.some((c) => c.side === side && (auto.has(c) || (c.hand && !(ride && open(side)))));
    const widths = new Map(order.filter((c) => !auto.has(c)).map((c) => [c, c.width]));
    let excess = [...widths.values()].reduce((a, b) => a + b, 0) + SIDES.filter(railed).length * opt.rail + opt.pagesMin - W;
    for (const c of order) {
      if (excess <= 0 || auto.has(c)) continue;
      const take = Math.min(excess, c.width - c.min);
      if (take > 0) {
        widths.set(c, c.width - take);
        excess -= take;
      }
    }
    return { auto, widths, excess };
  };
  let g = fit(0);
  for (let k = 1; g.excess > 0 && k <= order.length; k++) g = fit(k);

  const notes: PanelsNote[] = [];
  for (const c of order) {
    const w = g.widths.get(c);
    if (w !== undefined && w < c.width) notes.push({ code: "column-shrunk", side: c.side, column: c.index, items: c.panels, from: c.width, to: w });
  }
  for (const c of order) if (g.auto.has(c)) notes.push({ code: c.kept ? "kept-folded" : "column-folded", side: c.side, column: c.index, items: c.panels });

  // Positions: rails at the outer edges, open columns inward from them, the pages between.
  const items = new Map<string, PlacedPanel>();
  const placedCols: PlacedColumn[] = [];
  const rails: Partial<Record<Side, PlacedRail>> = {};
  let x0 = 0;
  let x1 = W;
  for (const side of SIDES) {
    const mine = cols.filter((c) => c.side === side);
    const open = mine.filter((c) => !c.hand && !g.auto.has(c));
    // Riding: the side's hand-folded columns, while it has an open column to ride on (the first, outer edge first).
    const host = ride ? open[0] : undefined;
    const riders = host ? mine.filter((c) => c.hand) : [];
    const inRail = mine.filter((c) => (c.hand && !riders.includes(c)) || g.auto.has(c));
    if (inRail.length) {
      const r = side === "left" ? rect(0, 0, opt.rail, H) : rect(W - opt.rail, 0, opt.rail, H);
      const segments = inRail.flatMap((c) => c.panels).map((id, i) => ({ id, rect: rect(r.x, opt.railInset + i * opt.segment, opt.rail, opt.segment) }));
      rails[side] = { side, rect: r, segments };
      for (const s of segments) {
        const c = inRail.find((x) => x.panels.includes(s.id))!;
        items.set(s.id, { rect: s.rect, kind: "segment", layer: 0, hidden: true, folded: c.hand ? "hand" : "auto", kept: kept.has(s.id), pinned: false, floating: false, side, column: c.index });
      }
      if (side === "left") x0 = opt.rail;
      else x1 = W - opt.rail;
    }
    // The open columns first (riding bars need their host's rect), then the folded ones in state order.
    const at = new Map<Col, Rect>();
    for (const c of mine) {
      const w = g.widths.get(c);
      if (w === undefined || riders.includes(c)) continue;
      if (side === "left") {
        at.set(c, rect(x0, 0, w, H));
        x0 += w;
      } else {
        x1 -= w;
        at.set(c, rect(x1, 0, w, H));
      }
    }
    const riding = riders.flatMap((c) => c.panels.map((id) => ({ id, c })));
    const top = riding.length * opt.bar;
    for (const c of mine) {
      const w = g.widths.get(c);
      const folded1 = c.hand ? "hand" : g.auto.has(c) ? "auto" : null;
      const base = { side, index: c.index, width: c.width, min: c.min, max: c.max, folded: folded1, kept: c.kept, panels: c.panels } as const;
      if (riders.includes(c)) {
        const hr = at.get(host!)!;
        const first = riding.findIndex((x) => x.c === c);
        c.panels.forEach((id, i) =>
          items.set(id, { rect: rect(hr.x, (first + i) * opt.bar, hr.width, opt.bar), kind: "bar", layer: 0, hidden: false, folded: "hand", kept: kept.has(id), pinned: false, floating: false, side, column: c.index, rides: host!.index }),
        );
        placedCols.push({ ...base, rect: rect(hr.x, first * opt.bar, hr.width, c.panels.length * opt.bar), shrunk: false, rides: host!.index });
        continue;
      }
      const r = at.get(c) ?? rect(side === "left" ? x0 : x1, 0, 0, H);
      placedCols.push({ ...base, rect: r, shrunk: w !== undefined && w < c.width });
      if (w === undefined) continue;
      // The host shares what the riding bars leave.
      const y0 = c === host ? top : 0;
      const bars = c.panels.filter((id) => folded.has(id)).length;
      const share = (H - y0 - bars * opt.bar) / (c.panels.length - bars);
      let y = y0;
      for (const id of c.panels) {
        const bar = folded.has(id);
        const h = bar ? opt.bar : share;
        items.set(id, { rect: rect(r.x, y, r.width, h), kind: bar ? "bar" : "column", layer: 0, hidden: false, folded: bar ? "hand" : null, kept: kept.has(id), pinned: false, floating: false, side, column: c.index });
        y += h;
      }
    }
  }
  const pages = rect(x0, 0, Math.max(0, x1 - x0), H);
  if (pages.width < opt.pagesMin) notes.push({ code: "pages-under-min", width: pages.width, min: opt.pagesMin });

  // Floats, clamped unless free. A float's size is screen px in both spaces (never scaled); only an unpinned float's
  // position is in page space. The clamp keeps the SCREEN rect in the view: a pinned float where it is, an unpinned
  // one as it shows at pan 0, so it still scrolls with the page. In page units (k = the scale, 1 when pinned) a
  // screen interval [lo, hi] is [lo / k, hi / k].
  state.floats.forEach((f, i) => {
    if (closed.has(f.id)) return;
    // Folded by hand: a title bar at its own place and width (the stored rect keeps its height).
    const shaded = folded.has(f.id);
    const at = shaded ? { ...f.rect, height: opt.bar } : f.rect;
    const k = f.pinned ? 1 : opt.view.scale;
    const r = { ...at };
    if (opt.floats === "clamp") {
      const lim = floatSize(defOf(defs, f.id)).min;
      r.width = Math.max(lim.width, Math.min(r.width, W));
      if (!shaded) r.height = Math.max(lim.height, Math.min(r.height, H));
      if (r.width !== at.width || r.height !== at.height) notes.push({ code: "float-resized", items: [f.id] });
      // Fits: wholly in the view. Too big even at its minimum: its title bar stays in, and `floatVisible` px of its width.
      r.x = r.width <= W ? clamp(r.x, 0, (W - r.width) / k) : clamp(r.x, (opt.floatVisible - r.width) / k, (W - opt.floatVisible) / k);
      r.y = r.height <= H ? clamp(r.y, 0, (H - r.height) / k) : clamp(r.y, 0, (H - opt.bar) / k);
      if (r.x !== at.x || r.y !== at.y) notes.push({ code: "float-clamped", items: [f.id] });
    }
    const clamped = r.x !== at.x || r.y !== at.y || r.width !== at.width || r.height !== at.height;
    items.set(f.id, {
      rect: f.pinned ? r : toView(r, opt.view),
      kind: shaded ? "bar" : "float",
      layer: 10 + i,
      hidden: false,
      folded: shaded ? "hand" : null,
      kept: false,
      pinned: !!f.pinned,
      floating: true,
      ...(clamped ? { clamped: true } : {}),
    });
  });

  return { items, columns: placedCols, rails, notes, pages };
}
