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
/*
 * Also (26.11.9):
 * - A tabbed column (`show` "tabs") draws a strip `options.tabs` tall on top (`PlacedColumn.strip`, each panel's
 *   `tab` in it, panel order, equal widths); its active panel takes the rest and the others are hidden. With its
 *   active panel folded it shows only the strip (the active panel is a "bar" there); with every panel folded it goes
 *   to the rail (or rides) as a stack column does.
 * - Height give-way, opt-in by `PanelDef.height`: see `sectionHeights` in the layout (note `section-folded`).
 *
 * And (26.11.10), all opt-in by `options.bands` and `options.reserve`:
 * - Bands: a full-span band takes its height from the stage's top or bottom first, across the whole width; the
 *   columns and rails lie in what is left. A between-span band runs between the innermost open column (or rail) on
 *   each side. A "reserved" band shortens the pages; an "overlay" band lies over the pages (layer 5) and doesn't.
 *   Its panels share its width equally, left to right ("band" rects); folded (by hand, or by give-way) it is one bar,
 *   `options.bar` tall, and each panel a "bar" rect side by side.
 * - Height give-way: when the pages would be shorter than `pagesMinHeight` (counted after the top and bottom
 *   reserves, and with overlay bands measured against it too), bands shrink toward their min, then fold to a bar,
 *   unkept before kept, in the policy's order, bottom before top on a tie (`band-shrunk`, `band-folded`,
 *   `kept-folded` with `edge`). Give-way never writes `folded`. Still short: `pages-short`.
 * - Reserve: room kept clear along the pages' edges (`reserved`), inside the pages' area; the pages are what's left.
 *   An overlay band lies inside the top or bottom reserve, never over it; the left and right reserves lie between
 *   the overlay bands.
 * - A band in the state on an edge the options don't enable: its panels are left out (`band-off`).
 */
import { rect, type Rect, type Size } from "../geometry";
import { DEFAULT_PANELS_OPTIONS, EDGES, SIDES, bandSize, defOf, floatSize, toView, type Edge, type PanelDef, type PanelsOptions, type PanelsState, type Side } from "./model";

/**
 * Where a panel is, structurally: an open part of a column, an open part of a band, a folded title bar (in a column,
 * riding on one, in a folded band, or a folded float), a segment of a rail (the panel itself isn't laid out), or a
 * float.
 */
export type PanelKind = "column" | "band" | "bar" | "segment" | "float";

export interface PlacedPanel {
  /** Stage px; for a segment, the segment's rect in its rail. */
  readonly rect: Rect;
  readonly kind: PanelKind;
  /** Columns, rails and reserved bands 0, overlay bands 5, floats 10 and up (a later float on top). */
  readonly layer: number;
  /** Not drawn as a panel: in a rail (only its segment shows), or a tab that isn't showing (only its `tab`). */
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
  /** In a tabbed column: its tab's rect in the strip (panel order, equal widths). */
  readonly tab?: Rect;
  /** A float the clamp moved or resized. */
  readonly clamped?: boolean;
  /** In a band: its edge and its index in the state's band (left to right). */
  readonly edge?: Edge;
  readonly index?: number;
}

/** A band as laid out. */
export interface PlacedBand {
  readonly edge: Edge;
  /** The band's rect (a bar when folded). */
  readonly rect: Rect;
  /** Its stored height clamped to its panels' limits, and those limits. */
  readonly height: number;
  readonly min: number;
  readonly max: number;
  /** null: open; "hand": its panels folded by hand; "auto": folded by give-way. */
  readonly folded: null | "hand" | "auto";
  /** Shrunk by give-way below its height. */
  readonly shrunk: boolean;
  /** It holds a kept panel. */
  readonly kept: boolean;
  readonly mode: "reserved" | "overlay";
  readonly span: "between" | "full";
  /** The shown panels, left to right. */
  readonly panels: readonly string[];
}

/** A reserve's edge. */
export type ReserveEdge = "top" | "right" | "bottom" | "left";

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
  /** How it shows its panels (default "stack"). */
  readonly show?: "stack" | "tabs";
  /** Tabbed and laid out: its strip of tabs, and the panel it shows. */
  readonly strip?: Rect;
  readonly active?: string;
}

export interface PlacedRail {
  readonly side: Side;
  readonly rect: Rect;
  readonly segments: readonly { readonly id: string; readonly rect: Rect }[];
}

export type PanelsNoteCode =
  | "column-shrunk"
  | "column-folded"
  | "kept-folded"
  | "section-folded"
  | "pages-under-min"
  | "float-clamped"
  | "float-resized"
  | "band-shrunk"
  | "band-folded"
  | "band-off"
  | "pages-short";

/** One note on a layout: a code and its data. `kept-folded` carries `side` and `column` for a column, `edge` for a band. */
export type PanelsNote =
  | { readonly code: "column-shrunk"; readonly side: Side; readonly column: number; readonly items: readonly string[]; readonly from: number; readonly to: number }
  | { readonly code: "column-folded" | "kept-folded" | "section-folded"; readonly side: Side; readonly column: number; readonly items: readonly string[] }
  | { readonly code: "pages-under-min"; readonly width: number; readonly min: number }
  | { readonly code: "float-clamped" | "float-resized"; readonly items: readonly string[] }
  | { readonly code: "band-shrunk"; readonly edge: Edge; readonly items: readonly string[]; readonly from: number; readonly to: number }
  | { readonly code: "band-folded" | "kept-folded" | "band-off"; readonly edge: Edge; readonly items: readonly string[] }
  | { readonly code: "pages-short"; readonly height: number; readonly min: number };

export interface PanelsLayout {
  readonly items: Map<string, PlacedPanel>;
  /** The shown columns in side order (left outer → inner, then right outer → inner). */
  readonly columns: readonly PlacedColumn[];
  readonly rails: Partial<Record<Side, PlacedRail>>;
  readonly notes: readonly PanelsNote[];
  /** What is left for the documents. */
  readonly pages: Rect;
  /** The bands laid out (an enabled edge with shown panels). */
  readonly bands: Readonly<Partial<Record<Edge, PlacedBand>>>;
  /** The room kept clear along the pages' edges (an edge with a reserve over 0). */
  readonly reserved: Readonly<Partial<Record<ReserveEdge, Rect>>>;
}

interface BandIn {
  readonly edge: Edge;
  readonly panels: readonly string[];
  /** Its index in the state's band, per shown panel. */
  readonly at: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly height: number;
  readonly hand: boolean;
  readonly kept: boolean;
  readonly age: number;
  readonly mode: "reserved" | "overlay";
  readonly span: "between" | "full";
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
  readonly show?: "stack" | "tabs";
  /** Tabbed: the panel it shows (its stored one when shown, else its first). */
  readonly active?: string;
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
  const px = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0);
  const res = { top: px(opt.reserve.top), right: px(opt.reserve.right), bottom: px(opt.reserve.bottom), left: px(opt.reserve.left) };

  // The bands: an enabled edge with shown panels. One on an edge the options don't enable is left out.
  const bandsIn: BandIn[] = [];
  const offNotes: PanelsNote[] = [];
  for (const edge of EDGES) {
    const b = state.bands?.[edge];
    if (!b) continue;
    const panels = b.panels.filter((id) => !closed.has(id));
    if (panels.length === 0) continue;
    const o = opt.bands[edge];
    if (!o) {
      offNotes.push({ code: "band-off", edge, items: panels });
      continue;
    }
    const ds = panels.map((id) => bandSize(defOf(defs, id)));
    const min = Math.max(0, ...ds.map((d) => d.min));
    const max = Math.max(min, Math.min(...ds.map((d) => d.max)));
    const height = clamp(Number.isFinite(b.height) ? b.height : min, min, max);
    const age = Math.max(...panels.map((id) => state.clock[id]?.[by] ?? 0));
    bandsIn.push({ edge, panels, at: panels.map((id) => b.panels.indexOf(id)), min, max, height, hand: panels.every((id) => folded.has(id)), kept: panels.some((id) => kept.has(id)), age, mode: o.mode, span: o.span });
  }

  // Height give-way: the bands and the top and bottom reserves leave the pages at least `pagesMinHeight`. Fold the
  // fewest bands in order that let them, shrinking the rest in order toward their min.
  const bOrder = bandsIn
    .filter((b) => !b.hand)
    .sort((a, b) => Number(a.kept) - Number(b.kept) || (opt.giveWay.order === "oldest" ? a.age - b.age : b.age - a.age) || EDGES.indexOf(b.edge) - EDGES.indexOf(a.edge));
  const room = H - res.top - res.bottom - opt.pagesMinHeight;
  const fitH = (k: number): { auto: Set<BandIn>; heights: Map<BandIn, number>; excess: number } => {
    const auto = new Set(bOrder.slice(0, k));
    const heights = new Map(bOrder.filter((b) => !auto.has(b)).map((b) => [b, b.height]));
    let excess = [...heights.values()].reduce((a, b) => a + b, 0) + (bandsIn.length - heights.size) * opt.bar - room;
    for (const b of bOrder) {
      if (excess <= 0 || auto.has(b)) continue;
      const take = Math.min(excess, b.height - b.min);
      if (take > 0) {
        heights.set(b, b.height - take);
        excess -= take;
      }
    }
    return { auto, heights, excess };
  };
  let gh = fitH(0);
  for (let k = 1; gh.excess > 0 && k <= bOrder.length; k++) gh = fitH(k);
  const bandH = (b: BandIn | undefined): number => (b ? (gh.heights.get(b) ?? opt.bar) : 0);
  const topB = bandsIn.find((b) => b.edge === "top");
  const botB = bandsIn.find((b) => b.edge === "bottom");
  const hT = bandH(topB);
  const hB = bandH(botB);
  // The columns' and rails' height: what the full-span bands (and, under an overlay one, its reserve) leave.
  const colTop = topB?.span === "full" ? (topB.mode === "overlay" ? res.top : 0) + hT : 0;
  const colBot = botB?.span === "full" ? H - (botB.mode === "overlay" ? res.bottom : 0) - hB : H;
  const CH = Math.max(0, colBot - colTop);

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
      const tabs = c.show === "tabs" ? { show: "tabs" as const, active: c.active !== undefined && panels.includes(c.active) ? c.active : panels[0]! } : {};
      cols.push({ side, index, panels, min, max, width, hand: panels.every((id) => folded.has(id)), kept: panels.some((id) => kept.has(id)), age, ...tabs });
    });
  }

  /**
   * A stack column's sections, top to bottom, `room` px tall. Without a `height` def among its open sections they
   * share the room equally (bars `opt.bar` tall). With one: each gets its natural height and the last open one the rest
   * (never under its min; sections without a def share what is left). Short of room, open sections fold to bars by
   * give-way (policy order, kept last, never the last open one); their natural heights give way toward their mins
   * before the last one goes under its min.
   */
  const sectionHeights = (c: Col, room: number): Map<string, { height: number; folded: null | "hand" | "auto" }> => {
    const out = new Map<string, { height: number; folded: null | "hand" | "auto" }>();
    const open0 = c.panels.filter((id) => !folded.has(id));
    const hOf = (id: string) => defOf(defs, id)?.height;
    const auto = new Set<string>();
    if (open0.some((id) => hOf(id))) {
      const last = open0.at(-1)!;
      // A section without a def never goes under a bar's height: that is its min.
      const minOf = (id: string): number => hOf(id)?.min ?? opt.bar;
      const fits = (): boolean => (c.panels.length - open0.length + auto.size) * opt.bar + open0.filter((id) => !auto.has(id)).reduce((a, id) => a + minOf(id), 0) <= room;
      const rank = (ids: readonly string[]): string[] =>
        [...ids].sort((a, b) => {
          const age = (id: string): number => state.clock[id]?.[by] ?? 0;
          return Number(kept.has(a)) - Number(kept.has(b)) || (opt.giveWay.order === "oldest" ? age(a) - age(b) : age(b) - age(a)) || c.panels.indexOf(a) - c.panels.indexOf(b);
        });
      for (const id of rank(open0.filter((x) => x !== last))) {
        if (fits()) break;
        // Folding a section whose min is no more than a bar gains nothing: skip it.
        if (minOf(id) > opt.bar) auto.add(id);
      }
      const open = open0.filter((id) => !auto.has(id));
      const space = room - (c.panels.length - open.length) * opt.bar;
      const fixed = open.filter((id) => id !== last && hOf(id));
      const sharers = open.filter((id) => id === last || !hOf(id));
      const h = new Map(fixed.map((id) => [id, hOf(id)!.natural]));
      let rest = space - fixed.reduce((a, id) => a + h.get(id)!, 0);
      // The sharers (the last section and those without a def) need their mins: the fixed sections' natural heights
      // give way toward their mins first, in policy order.
      const need = sharers.reduce((a, id) => a + minOf(id), 0);
      for (const id of rank(fixed)) {
        if (rest >= need) break;
        const take = Math.min(need - rest, h.get(id)! - minOf(id));
        h.set(id, h.get(id)! - take);
        rest += take;
      }
      if (rest >= need) {
        // Equal shares, raised to each sharer's min where a share falls under it.
        let pool = [...sharers];
        let left = rest;
        for (;;) {
          const share = left / pool.length;
          const under = pool.filter((id) => minOf(id) > share);
          if (under.length === 0) {
            for (const id of pool) h.set(id, share);
            break;
          }
          for (const id of under) h.set(id, minOf(id));
          left -= under.reduce((a, id) => a + minOf(id), 0);
          pool = pool.filter((id) => !under.includes(id));
        }
      } else {
        // Short even for the mins: the last section first, the others share what is left.
        const lastH = Math.max(0, Math.min(minOf(last), rest));
        for (const id of sharers) h.set(id, id === last ? lastH : Math.max(0, rest - lastH) / (sharers.length - 1));
      }
      for (const id of c.panels) out.set(id, folded.has(id) ? { height: opt.bar, folded: "hand" } : auto.has(id) ? { height: opt.bar, folded: "auto" } : { height: Math.max(0, h.get(id)!), folded: null });
      return out;
    }
    const bars = c.panels.length - open0.length;
    const share = Math.max(0, (room - bars * opt.bar) / open0.length);
    for (const id of c.panels) out.set(id, folded.has(id) ? { height: opt.bar, folded: "hand" } : { height: share, folded: null });
    return out;
  };

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
    let excess = [...widths.values()].reduce((a, b) => a + b, 0) + SIDES.filter(railed).length * opt.rail + opt.pagesMin + res.left + res.right - W;
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
      const r = side === "left" ? rect(0, colTop, opt.rail, CH) : rect(W - opt.rail, colTop, opt.rail, CH);
      const segments = inRail.flatMap((c) => c.panels).map((id, i) => ({ id, rect: rect(r.x, colTop + opt.railInset + i * opt.segment, opt.rail, opt.segment) }));
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
        at.set(c, rect(x0, colTop, w, CH));
        x0 += w;
      } else {
        x1 -= w;
        at.set(c, rect(x1, colTop, w, CH));
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
          items.set(id, { rect: rect(hr.x, colTop + (first + i) * opt.bar, hr.width, opt.bar), kind: "bar", layer: 0, hidden: false, folded: "hand", kept: kept.has(id), pinned: false, floating: false, side, column: c.index, rides: host!.index }),
        );
        placedCols.push({ ...base, rect: rect(hr.x, colTop + first * opt.bar, hr.width, c.panels.length * opt.bar), shrunk: false, rides: host!.index });
        continue;
      }
      const r = at.get(c) ?? rect(side === "left" ? x0 : x1, colTop, 0, CH);
      // The host shares what the riding bars leave.
      const y0 = colTop + (c === host ? top : 0);
      const tabbed = c.show === "tabs";
      const strip = rect(r.x, y0, r.width, opt.tabs);
      const shown = tabbed && w !== undefined ? { strip, active: c.active! } : {};
      placedCols.push({ ...base, rect: r, shrunk: w !== undefined && w < c.width, ...(tabbed ? { show: "tabs" as const } : {}), ...shown });
      if (w === undefined) continue;
      const panel = (id: string, to: Rect, kind: PanelKind, f: null | "hand" | "auto", more: { tab?: Rect; hidden?: boolean } = {}): void => {
        items.set(id, { rect: to, kind, layer: 0, hidden: more.hidden ?? false, folded: f, kept: kept.has(id), pinned: false, floating: false, side, column: c.index, ...(more.tab ? { tab: more.tab } : {}) });
      };
      if (tabbed) {
        // One panel shows under the strip; the others are its hidden tabs. Its active panel folded: only the strip.
        const body = rect(r.x, y0 + opt.tabs, r.width, Math.max(0, colBot - y0 - opt.tabs));
        const shade = folded.has(c.active!);
        const tw = r.width / c.panels.length;
        c.panels.forEach((id, i) => {
          const tab = rect(r.x + i * tw, y0, tw, opt.tabs);
          if (id === c.active) panel(id, shade ? strip : body, shade ? "bar" : "column", shade ? "hand" : null, { tab });
          else panel(id, body, "column", folded.has(id) ? "hand" : null, { tab, hidden: true });
        });
        continue;
      }
      const hs = sectionHeights(c, colBot - y0);
      let y = y0;
      for (const id of c.panels) {
        const s = hs.get(id)!;
        panel(id, rect(r.x, y, r.width, s.height), s.folded ? "bar" : "column", s.folded);
        y += s.height;
      }
      for (const id of c.panels) if (hs.get(id)!.folded === "auto") notes.push({ code: "section-folded", side, column: c.index, items: [id] });
    }
  }

  // The bands' notes, in give-way order.
  for (const b of bOrder) {
    const h = gh.heights.get(b);
    if (h !== undefined && h < b.height) notes.push({ code: "band-shrunk", edge: b.edge, items: b.panels, from: b.height, to: h });
  }
  for (const b of bOrder) if (gh.auto.has(b)) notes.push({ code: b.kept ? "kept-folded" : "band-folded", edge: b.edge, items: b.panels });

  // The pages' outer edges: a reserved band shortens them, an overlay band doesn't. Then the reserve comes off them:
  // an overlay band lies inside the top or bottom reserve, and the left and right reserves lie between the overlay bands.
  const pw = Math.max(0, x1 - x0);
  const pTop = topB?.mode === "reserved" ? hT : 0;
  const pBot = botB?.mode === "reserved" ? H - hB : H;
  const reserved: Partial<Record<ReserveEdge, Rect>> = {};
  const iTop = pTop + res.top + (topB?.mode === "overlay" ? hT : 0);
  const iBot = pBot - res.bottom - (botB?.mode === "overlay" ? hB : 0);
  if (res.top > 0) reserved.top = rect(x0, pTop, pw, res.top);
  if (res.right > 0) reserved.right = rect(x0 + pw - res.right, iTop, res.right, Math.max(0, iBot - iTop));
  if (res.bottom > 0) reserved.bottom = rect(x0, pBot - res.bottom, pw, res.bottom);
  if (res.left > 0) reserved.left = rect(x0, iTop, res.left, Math.max(0, iBot - iTop));
  const pages = rect(x0 + res.left, pTop + res.top, Math.max(0, pw - res.left - res.right), Math.max(0, pBot - res.bottom - pTop - res.top));
  if (pages.width < opt.pagesMin) notes.push({ code: "pages-under-min", width: pages.width, min: opt.pagesMin });
  if (bandsIn.length || res.top + res.bottom > 0) {
    const left = H - res.top - res.bottom - hT - hB;
    if (left < opt.pagesMinHeight - 1e-9) notes.push({ code: "pages-short", height: Math.max(0, left), min: opt.pagesMinHeight });
  }

  // The bands' rects and their panels: equal shares of the width, left to right; folded, one bar.
  const bands: Partial<Record<Edge, PlacedBand>> = {};
  for (const b of bandsIn) {
    const h = bandH(b);
    const full = b.span === "full";
    const over = b.mode === "overlay";
    const y = b.edge === "top" ? (over ? res.top : 0) : over ? H - res.bottom - h : H - h;
    const r = full ? rect(0, y, W, h) : rect(x0, y, pw, h);
    const f: null | "hand" | "auto" = b.hand ? "hand" : gh.auto.has(b) ? "auto" : null;
    const hh = gh.heights.get(b);
    bands[b.edge] = { edge: b.edge, rect: r, height: b.height, min: b.min, max: b.max, folded: f, shrunk: hh !== undefined && hh < b.height, kept: b.kept, mode: b.mode, span: b.span, panels: b.panels };
    const share = r.width / b.panels.length;
    b.panels.forEach((id, i) =>
      items.set(id, { rect: rect(r.x + i * share, r.y, share, h), kind: f ? "bar" : "band", layer: over ? 5 : 0, hidden: false, folded: f, kept: kept.has(id), pinned: false, floating: false, edge: b.edge, index: b.at[i]! }),
    );
  }

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

  notes.push(...offNotes);
  return { items, columns: placedCols, rails, notes, pages, bands, reserved };
}
