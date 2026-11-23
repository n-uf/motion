/**
 * What the state's shapes (`./model`) tell on their own: which zones of an edge take a kind, an edge's axis, an item's
 * zone and forms, whether a side edge is a toolbar bar, and how an item floats (its orient, size and form). Pure.
 */
import { clampInto, type Point, type Rect, type Size } from "@n-uf/placement";
import { formBody, formFolded, formMenu, type StackForm } from "@n-uf/placement/stack";
import { DEFAULT_FLOAT_SIZE, DEFAULT_HIT_BAND, DEFAULT_RAIL_MAGNET, RAIL_STRIP_MIN, ZONES, type AnchoredKeepClear, type DockLayout, type KeepClear, type ColumnTemplate, type DockEdge, type FloatAnchor, type FloatAnchorAt, type Kind, type Orient, type RailMode, type RailVisibility, type DockState, type DockItem, type Side, type Zone, type ZoneAccepts } from "./model";

const insetPx = (v: number | undefined): number => (Number.isFinite(v) ? Math.max(0, v!) : 0);

/**
 * The region floats lie in, as `solve` lays them: the stage less the inset at its left and right (none with
 * `insetWhen: "docked"` while no panel is docked beside the content), the stage's full height. `lifted`: an item that
 * counts as off its edge, as a held one does.
 */
export function floatRegion(state: DockState, lifted?: string): Rect {
  const floating = new Set(state.floats.map((f) => f.id));
  const docked = state.edges.some((e) => (e.side === "left" || e.side === "right") && e.accepts.length > 0 && e.items.some((id) => id !== lifted && !floating.has(id) && !!state.items[id] && isDockingPanel(state.items[id]!)));
  const inset = state.insetWhen === "docked" && !docked ? {} : (state.inset ?? {});
  const { stage } = state;
  return { x: stage.x + insetPx(inset.left), y: stage.y, width: Math.max(0, stage.width - insetPx(inset.left) - insetPx(inset.right)), height: stage.height };
}

/**
 * Where item `id`, of `size`, held at `grab` (the pointer's offset from its top-left corner) lies with the pointer at
 * `pointer`: the grip under the pointer where it fits, else moved just enough to lie wholly inside the float region (the
 * stage less the inset at its left and right). With `floatFromHeld` the float target starts from this rect, so an item
 * held clear of everything lands where it is drawn.
 */
export const heldRect = (state: DockState, id: string, size: Size, pointer: Point, grab: Point): Rect =>
  clampInto({ x: pointer.x - grab.x, y: pointer.y - grab.y, width: size.width, height: size.height }, floatRegion(state, id));

/** The name of a float's anchor, with or without an offset: `"content-top-right"` for `{ at: "content-top-right", dy: 12 }`. */
export const anchorName = (anchor: FloatAnchorAt): FloatAnchor => (typeof anchor === "string" ? anchor : anchor.at);

/**
 * Whether `x` is a usable `DockFloat.since`: a number from 0 to `Number.MAX_SAFE_INTEGER`. Past that, one more is the
 * same number, so new floats would tie.
 */
export const isSince = (x: unknown): x is number => typeof x === "number" && x >= 0 && x <= Number.MAX_SAFE_INTEGER;

/** What the zone tests read of an edge (or a column template): what it takes, per zone, and the zones it has. */
type ZoneDecl = { readonly accepts: readonly Kind[]; readonly zoneAccepts?: ZoneAccepts; readonly zones?: readonly Zone[] };

/**
 * The zones an edge has (`DockEdge.zones`), in order: all three unless it lists some. Entries that aren't zones, and
 * repeats, are ignored; a list with no zone in it counts as none given (all three).
 */
export const zonesOf = (edge: { readonly zones?: readonly Zone[] }): readonly Zone[] => {
  if (edge.zones === undefined) return ZONES;
  const has = ZONES.filter((z) => edge.zones!.includes(z));
  return has.length > 0 ? has : ZONES;
};

/**
 * Whether `edge` takes kind `kind` in `zone`: a zone the edge has (`zones`), its `accepts`, narrowed by `zoneAccepts`
 * when given (a zone not listed takes nothing).
 */
export const zoneTakes = (edge: ZoneDecl, zone: Zone, kind: Kind): boolean =>
  edge.accepts.includes(kind) && (edge.zones === undefined || zonesOf(edge).includes(zone)) && (edge.zoneAccepts === undefined || !!edge.zoneAccepts[zone]?.includes(kind));

/** The zones of `edge` that take `kind`, in order. */
export const zonesTaking = (edge: ZoneDecl, kind: Kind): Zone[] => ZONES.filter((z) => zoneTakes(edge, z, kind));

/**
 * Whether `edge` takes `kind` anywhere: its `accepts` lists it and at least one of its zones takes it (`zoneTakes`). An
 * edge whose zones take nothing for the kind (`zoneAccepts: {}`) takes it nowhere, exactly as one whose `accepts` lacks
 * it: the one test drop targets and refusals ask. The stored form and `readDockState` keep reading `accepts` itself.
 */
export const edgeTakes = (edge: ZoneDecl, kind: Kind): boolean => zonesTaking(edge, kind).length > 0;

/**
 * How a gap's hit runs over `edge`'s open panels (`DockEdge.hitBand`): its own, else, for a dynamic column, its side's
 * template's (`ColumnTemplate.hitBand`), else {@link DEFAULT_HIT_BAND}.
 */
export const hitBandOf = (state: DockState, edge: DockEdge): number | "middle" =>
  edge.hitBand ?? (edge.column === true && (edge.side === "left" || edge.side === "right") ? state.columns?.[edge.side]?.hitBand : undefined) ?? DEFAULT_HIT_BAND;

/**
 * A dynamic column made from its side's template: every column the state makes (a drop on a column line, `moveTo` a new
 * column, `dockHome`, a stored column `readDockState` reads back) is made here, so each takes every template field
 * (`accepts`, `cross`, `gap`, `pad`, `menu`, `zoneAccepts`, `hitBand`).
 */
export const columnFromTemplate = (t: ColumnTemplate, id: string, side: "left" | "right", ring: number, items: readonly string[]): DockEdge => ({
  id,
  side,
  ring,
  accepts: t.accepts,
  items,
  cross: t.cross,
  ...(t.gap !== undefined ? { gap: t.gap } : {}),
  ...(t.pad ? { pad: t.pad } : {}),
  ...(t.menu ? { menu: t.menu } : {}),
  ...(t.zoneAccepts ? { zoneAccepts: t.zoneAccepts } : {}),
  ...(t.hitBand !== undefined ? { hitBand: t.hitBand } : {}),
  column: true,
});

/** How the rails of `side` show their items (`DockState.railModes`, default `"titles"`); top and bottom have no rails. */
export const railModeOf = (state: DockState, side: Side): RailMode => (side === "left" || side === "right" ? (state.railModes?.[side] === "icons" ? "icons" : "titles") : "icons");

/** The axis an edge's stack runs along. */
export const axisOf = (side: Side): Orient => (side === "left" || side === "right" ? "column" : "row");

/** Whether a keep-clear entry is anchored to a region of the layout (`AnchoredKeepClear`), not a fixed rect. */
export const isAnchoredKeepClear = (c: KeepClear | AnchoredKeepClear): c is AnchoredKeepClear => "region" in c;

/**
 * The rects `who` keeps clear of in `layout`, the layout the reader names (the one on screen, or a drop's `after`):
 * the state's fixed rects (`DockState.keepClear`), then the anchored ones as `layout` resolved them
 * (`DockLayout.keepClear`). Floats keep clear of every entry; drop targets, slots and landings only of those for
 * `"all"` (the default), never of a floats-only one. Only for readers after `solve`: nothing that sizes the content
 * calls it.
 */
export const keepClearFor = (state: DockState, layout: Pick<DockLayout, "keepClear">, who: "floats" | "targets"): Rect[] => {
  const takes = (f: "all" | "floats" | undefined): boolean => who === "floats" || f !== "floats";
  const fixed = (state.keepClear ?? []).filter((c): c is KeepClear => !isAnchoredKeepClear(c) && takes(c.for)).map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height }));
  const anchored = (layout.keepClear ?? []).filter((c) => takes(c.for)).map((c) => ({ ...c.rect }));
  return anchored.length === 0 ? fixed : [...fixed, ...anchored];
};

/**
 * The side's rail where the state declares none (`DockState.rails[side]`): its outermost column that takes `kind` in its
 * start zone (not an icons-only edge), which shows as a rail once nothing in it sets its width. Undefined where the side
 * has a declared rail, or no such column.
 */
export function railColumnOf(state: DockState, side: "left" | "right", kind: Kind): DockEdge | undefined {
  if (state.rails?.[side]) return undefined;
  return state.edges
    .filter((e) => e.side === side && !e.compact && e.hidden !== true && zoneTakes(e, "start", kind))
    .reduce<DockEdge | undefined>((m, e) => (!m || e.ring < m.ring ? e : m), undefined);
}

/** The state as the window shows it, and what it lent: see `viewOf`. */
export interface StateView {
  /** The state the window shows: no hidden edge; the items a hidden edge lends at the end of the edge it shows them in. */
  readonly view: DockState;
  /** Each lent item's hidden edge, by item id. */
  readonly lent: ReadonlyMap<string, string>;
  /** Hidden edges whose `showIn` is ignored: it names the edge itself, no edge, another hidden edge or a dynamic column. */
  readonly ignored: readonly string[];
  /** The items the view shows in a zone other than their own (`zoneIn`): their stored `align` is not where they lie. */
  readonly rezoned: ReadonlySet<string>;
}

/**
 * The zone `item` lies in on `edge`: its own (`align`) where the edge takes its kind there, else the first zone that
 * does; one the edge takes nowhere, in its own. A fixed item lies in its own where the edge has that zone (`zones`),
 * else in the edge's first zone, as a movable item lies in a zone the edge has. The item's zone is its own fact, not the edge's: this is where it is laid out and targeted, while its stored `align`
 * stays as it was, so it is back in its own zone on an edge that takes it there.
 */
export function zoneIn(edge: DockEdge, item: DockItem): Zone {
  const own = zoneOf(item);
  if (item.fixed) {
    const has = zonesOf(edge);
    return has.includes(own) ? own : (has[0] ?? own);
  }
  if (zoneTakes(edge, own, item.kind)) return own;
  return zonesTaking(edge, item.kind)[0] ?? own;
}

/**
 * Whether a drop on `edge` names a zone for `kind`: the edge offers a choice, more than one of its zones taking the
 * kind. Only then does the zone a drop gives become the item's `align`; on a one-zone edge (a rail that takes the kind
 * at its start only) the item keeps its own, and lies in that one zone there (`zoneIn`).
 */
export const namesZone = (edge: ZoneDecl, kind: Kind): boolean => zonesTaking(edge, kind).length > 1;

/**
 * Whether a hidden edge's `showIn` names an edge it can lend its items to: another static edge of the state, not
 * hidden. A dynamic column (`column: true`) never is: drops make and delete those.
 */
const showInOf = (state: DockState, e: DockEdge): DockEdge | undefined => {
  if (e.hidden !== true || e.showIn === undefined) return undefined;
  const to = state.edges.find((x) => x.id === e.showIn);
  return to && to !== e && to.hidden !== true && to.column !== true ? to : undefined;
};

/**
 * The state as the window shows it (`DockEdge.hidden`, `DockEdge.showIn`): its hidden edges left out, and the items of a hidden
 * edge that names `showIn` lent to that edge, after its own items, each that edge takes the kind of (`edgeTakes`; a
 * fixed item never). Every docked item, lent or not, lies in the zone `zoneIn` gives it: its own where its edge takes
 * it there, else the first zone that does (the view's `align`; the stored one is unchanged). The same object when nothing
 * is hidden and every item lies in its own zone.
 */
export function viewOf(state: DockState): StateView {
  const lent = new Map<string, string>();
  const ignored: string[] = [];
  const added = new Map<string, string[]>();
  const hidden = state.edges.some((e) => e.hidden === true);
  if (hidden) {
    for (const e of state.edges) {
      if (e.hidden !== true || e.showIn === undefined) continue;
      const to = showInOf(state, e);
      if (!to) {
        ignored.push(e.id);
        continue;
      }
      for (const id of e.items) {
        const item = Object.hasOwn(state.items, id) ? state.items[id] : undefined;
        if (!item || item.fixed || lent.has(id) || to.items.includes(id) || !edgeTakes(to, item.kind)) continue;
        lent.set(id, e.id);
        added.set(to.id, [...(added.get(to.id) ?? []), id]);
      }
    }
  }
  const edges = hidden ? state.edges.filter((e) => e.hidden !== true).map((e) => (added.has(e.id) ? { ...e, items: [...e.items, ...added.get(e.id)!] } : e)) : state.edges;
  // Each docked item in the zone it lies in.
  const rezoned = new Set<string>();
  let items: Record<string, DockItem> | undefined;
  for (const e of edges) {
    for (const id of e.items) {
      const item = Object.hasOwn(state.items, id) ? state.items[id] : undefined;
      if (!item) continue;
      const zone = zoneIn(e, item);
      if (zone === zoneOf(item)) continue;
      const { align: _a, ...plain } = item;
      items ??= { ...state.items };
      items[id] = zone === "start" ? plain : { ...plain, align: zone };
      rezoned.add(id);
    }
  }
  if (!hidden && !items) return { view: state, lent, ignored, rezoned };
  return { view: { ...state, edges, ...(items ? { items } : {}) }, lent, ignored, rezoned };
}

/** Whether item `id` lies in a hidden edge. */
export const inHiddenEdge = (state: DockState, id: string): boolean => state.edges.some((e) => e.hidden === true && e.items.includes(id));

/**
 * `shown`, a state made from `viewOf(state).view` (a drop's result), with `state`'s hidden edges put back where they
 * stood in its edge list, holding their items. The items they lent go back to them, as they were, unless `moved` is
 * one of them: the item a drop committed somewhere, which keeps its new place and leaves its hidden edge. On a side whose
 * shown edges are those it had, nothing is renumbered. On a side where a column was made or removed, each hidden edge
 * goes back by its own ring, before the first shown edge that lay further in than it did, and the side is numbered again
 * from 0 in that order.
 *
 * Every item the view laid out in a zone other than its own (`rezoned`) keeps its stored `align`; so does `moved`, the
 * item a drop committed, unless the drop named a zone (`zoned`: a gap in an edge), whose zone it then takes.
 */
export function withHiddenOf(state: DockState, shown: DockState, lent: ReadonlyMap<string, string> = new Map(), moved?: string, zoned = false, rezoned: ReadonlySet<string> = new Set()): DockState {
  if (shown === state) return shown;
  // The lent items that stay lent: out of the edges they were shown in, back into their hidden edges.
  const back = [...lent.keys()].filter((id) => id !== moved);
  const edges = shown.edges.filter((e) => e.hidden !== true).map((e) => (back.some((id) => e.items.includes(id)) ? { ...e, items: e.items.filter((id) => !back.includes(id)) } : e));
  state.edges.forEach((e, i) => {
    if (e.hidden !== true) return;
    const own = moved !== undefined && lent.get(moved) === e.id ? { ...e, items: e.items.filter((id) => id !== moved) } : e;
    edges.splice(Math.min(i, edges.length), 0, own);
  });
  const items: Record<string, DockItem> = back.length > 0 ? { ...shown.items, ...Object.fromEntries(back.map((id) => [id, state.items[id]!])) } : { ...shown.items };
  // The item's zone is its own fact: only a drop that names a zone changes it.
  const keep = new Set([...rezoned].filter((id) => !back.includes(id) && !(id === moved && zoned)));
  if (moved !== undefined && !zoned) keep.add(moved);
  for (const id of keep) {
    const was = Object.hasOwn(state.items, id) ? state.items[id] : undefined;
    const now = Object.hasOwn(items, id) ? items[id] : undefined;
    if (!was || !now || now.align === was.align) continue;
    const { align: _a, ...plain } = now;
    items[id] = was.align === undefined ? plain : { ...plain, align: was.align };
  }
  const ringBefore = new Map(state.edges.filter((e) => e.hidden !== true).map((e) => [e.id, e.ring]));
  for (const side of new Set(state.edges.filter((e) => e.hidden === true).map((e) => e.side))) {
    const was = state.edges.filter((e) => e.side === side && e.hidden !== true).map((e) => e.id).sort();
    const now = edges.filter((e) => e.side === side && e.hidden !== true);
    if (now.length === was.length && now.every((e) => was.includes(e.id))) continue;
    const order = [...now].sort((a, b) => a.ring - b.ring || edges.indexOf(a) - edges.indexOf(b));
    for (const h of edges.filter((e) => e.side === side && e.hidden === true).sort((a, b) => a.ring - b.ring)) {
      const k = order.findIndex((e) => e.hidden !== true && (ringBefore.get(e.id) ?? -Infinity) > h.ring);
      order.splice(k < 0 ? order.length : k, 0, h);
    }
    order.forEach((e, ring) => {
      if (e.ring !== ring) edges[edges.indexOf(e)] = { ...e, ring };
    });
  }
  return { ...shown, edges, items };
}

/** A kind's rail drop policy with its defaults, or null where it has none or it is turned off (width 0, `"never"`). */
export function railPolicyOf(state: DockState, kind: Kind): { readonly railStripWidth: number | null; readonly railVisibility: RailVisibility; readonly magnet: number; readonly floatNearEdge: boolean } | null {
  const p = Object.hasOwn(state.railDrop ?? {}, kind) ? state.railDrop![kind] : undefined;
  if (!p) return null;
  const visibility: RailVisibility = p.railVisibility === "always" || p.railVisibility === "never" ? p.railVisibility : "whileDragging";
  const width = p.railStripWidth;
  if (visibility === "never" || (width !== undefined && !(Number.isFinite(width) && width > 0))) return null;
  return {
    railStripWidth: width === undefined ? null : Math.max(RAIL_STRIP_MIN, width),
    railVisibility: visibility,
    magnet: Number.isFinite(p.magnet) ? Math.max(0, p.magnet!) : DEFAULT_RAIL_MAGNET,
    floatNearEdge: p.floatNearEdge !== false,
  };
}
export const zoneOf = (item: DockItem | undefined): Zone => (item?.align === "center" || item?.align === "end" ? item.align : "start");
export const formsOf = (item: DockItem, axis: Orient): readonly StackForm[] => item.forms[axis] ?? [];

/**
 * What a form tells of its controls, as an item's layout reports it: `hidden` (`StackForm.hides`) and `tiers`
 * (`StackForm.tiers`, left out when the form has none). One reader for every path that lays an item out.
 */
export const controlsOf = (f: StackForm | undefined): { hidden: readonly string[]; tiers?: Readonly<Record<string, number>> } => ({ hidden: f?.hides ?? [], ...(f?.tiers ? { tiers: f.tiers } : {}) });

const PANEL_FORMS: ReadonlySet<string> = new Set(["open", "header", "rail"]);
/**
 * A panel that counts as docked for `insetWhen: "docked"`: not closed, not fixed, and by default its first column form a
 * panel's (open, header or rail). The item's `countsAsDocked` overrides that either way: `false` for a side strip,
 * `true` for an item of another form.
 */
export const isDockingPanel = (item: DockItem): boolean => !item.closed && !item.fixed && (item.countsAsDocked ?? PANEL_FORMS.has(formsOf(item, "column")[0]?.kind ?? ""));

/**
 * A left or right toolbar bar outside the inset (`isSideBar` with `outsideInset`). It lies outermost on its side,
 * before the side's rail.
 */
export function isOutsideSideBar(state: DockState, e: DockEdge): boolean {
  return e.outsideInset === true && isSideBar(state, e);
}

/**
 * A left or right toolbar bar: told from a column edge by its kinds, it takes something and nothing the side's columns
 * or its rail take (`DockState.columns[side].accepts`, `DockState.rails[side].accepts`); an anchor takes nothing. A side with
 * neither a column template nor a rail has nothing to tell them apart by, so no edge there is a bar.
 */
export function isSideBar(state: DockState, e: DockEdge): boolean {
  if ((e.side !== "left" && e.side !== "right") || e.column === true || e.accepts.length === 0) return false;
  const template = state.columns?.[e.side];
  const rail = state.rails?.[e.side];
  if (!template && !rail) return false;
  const panelKinds = [...(template?.accepts ?? []), ...(rail?.accepts ?? [])];
  return !e.accepts.some((k) => panelKinds.includes(k));
}

/** A left or right column: a side edge that takes something, not a compact rail and not a toolbar bar (`isSideBar`). */
export const isSideColumn = (state: DockState, e: DockEdge): boolean => (e.side === "left" || e.side === "right") && !e.compact && e.accepts.length > 0 && !isSideBar(state, e);

/**
 * An edge whose items keep their length and whose zones only align them: a top or bottom bar, a compact rail, a side
 * toolbar bar. A panel column, where growing cards fill the edge, is not one.
 */
const keepsLengths =(state: DockState, e: DockEdge): boolean => e.compact === true || e.side === "top" || e.side === "bottom" || isSideBar(state, e);

/**
 * Whether `id`, drawn in its form `form` along `e`, is a movable grower on a bar: not fixed, on an edge that keeps
 * lengths (`keepsLengths`), in a form that grows and isn't the » entry. Once placed it takes its bar's free span; for
 * drop room and for a landing it counts at its natural length.
 */
export function growsOnBar(state: DockState, e: DockEdge, id: string, form: number): boolean {
  const it = Object.hasOwn(state.items, id) ? state.items[id] : undefined;
  if (!it || it.fixed || !keepsLengths(state, e)) return false;
  const f = formsOf(it, axisOf(e.side))[form];
  return !!f && f.main.grows === true && !formMenu(f);
}

/**
 * `state` with every movable item on a bar (`keepsLengths`) declaring no growth along that bar: the window as it lies
 * with each movable grower at its natural length, the drop room it counts in. With `only`, that item alone (a held
 * grower's layout). The same object when none grows there. Where it lies is read as `solve` draws it: an item a hidden
 * edge lends to a bar (`showIn`) lies on that bar (`viewOf`, `placingOf`).
 */
export function withoutBarGrowth(state: DockState, only?: string): DockState {
  let items: Record<string, DockItem> | undefined;
  const view = only !== undefined ? placingOf(state, only) : viewOf(state).view;
  for (const e of view.edges) {
    if (e.hidden === true || !keepsLengths(view, e)) continue;
    const axis = axisOf(e.side);
    for (const id of e.items) {
      if (only !== undefined && id !== only) continue;
      const it = Object.hasOwn(state.items, id) ? state.items[id] : undefined;
      const forms = it?.forms[axis];
      if (!it || it.fixed || !forms?.some((f) => f.main.grows === true)) continue;
      const plain = forms.map((f) => (f.main.grows === true ? { ...f, main: { min: f.main.min, natural: f.main.natural } } : f));
      items ??= { ...state.items };
      items[id] = { ...it, forms: { ...it.forms, [axis]: plain } };
    }
  }
  return items ? { ...state, items } : state;
}

/**
 * The orient a float of `item` takes when it names none: its `floatOrient`, else the axis of its first form (the first
 * of `forms.row` / `forms.column` it declares with any form), else column.
 */
export const floatOrientOf = (item: DockItem): Orient => {
  if (item.floatOrient === "row" || item.floatOrient === "column") return item.floatOrient;
  for (const k of Object.keys(item.forms)) if ((k === "row" || k === "column") && formsOf(item, k).length > 0) return k;
  return "column";
};

const sized = (s: Size | undefined): s is Size => !!s && Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0;

/**
 * Whether `item` declares `floatSizes` (the per-orient float sizes). Only such an item is sized per orient; one that
 * declares none is framed as before them: a float at its first form keeps its stored rect.
 */
export const declaresFloatSizes = (item: DockItem): boolean => item.floatSizes !== undefined && item.floatSizes !== null;

/**
 * Whether a float in form `f` is sized by hand: a form that grows and shows a body (a panel's card), whose float size is
 * its rect, the one a person sizes. A form that grows without a body (a toolbar group that grows on a bar) floats at its
 * natural size, as it previews and lands: its growth is a bar's spare room, and a float has none.
 */
export const sizedByHand = (f: StackForm | undefined): boolean => !!f && f.main.grows === true && formBody(f);

/**
 * The natural size of `item`'s first form along `orient`, a form whose length is its own: its main natural length along
 * `orient` and its cross. Undefined when the item has no form there, or it is sized by hand (`sizedByHand`: a panel's
 * card has no natural float length) or has no size.
 */
function naturalFloatSize(item: DockItem, orient: Orient): Size | undefined {
  const f = formsOf(item, orient)[0];
  if (!f || sizedByHand(f)) return undefined;
  const main = Number.isFinite(f.main.natural) ? Math.max(0, f.main.natural) : 0;
  const cross = Number.isFinite(f.cross.natural) ? Math.max(0, f.cross.natural) : 0;
  if (main <= 0 || cross <= 0) return undefined;
  return orient === "row" ? { width: main, height: cross } : { width: cross, height: main };
}

/** `item`'s usable float sizes by orient (its `floatSizes`); undefined when it has none. */
export function floatSizesOf(item: DockItem): { row?: Size; column?: Size } | undefined {
  const out: { row?: Size; column?: Size } = {};
  for (const o of ["row", "column"] as const) {
    const s = item.floatSizes?.[o];
    if (sized(s)) out[o] = s;
  }
  return out.row || out.column ? out : undefined;
}

/**
 * A float's size along `orient` (default `floatOrientOf`) when nothing else gives one: the item's `floatSizes` for that
 * orient, else its first form's natural size along `orient`, or `DEFAULT_FLOAT_SIZE` when that form is sized by hand (a
 * form that grows and shows a body, a panel's card, has no natural float length) or the item has no form there.
 */
export function floatSizeOf(item: DockItem, orient: Orient = floatOrientOf(item)): Size {
  const own = item.floatSizes?.[orient];
  if (sized(own)) return own;
  return naturalFloatSize(item, orient) ?? DEFAULT_FLOAT_SIZE;
}

/**
 * Why `item`, drawn in form `form` of `forms` (the forms of the axis it lies along), counts as folded
 * (`DockItemLayout.foldedBy`): `"hand"` when it is folded by hand and that axis has a folded form (`startOf` over 0),
 * else `"auto"` when `form` lies below `start`, the form it started in (it gave way), else undefined. A closed item, or
 * one in its first form, is never folded. Leave `start` out where nothing gives way (a float).
 */
export function foldedByOf(item: DockItem, forms: readonly StackForm[], form: number, start?: number, edge?: DockEdge): "hand" | "auto" | undefined {
  if (item.closed || form < 1) return undefined;
  if (startOf(item, forms, edge) > 0) return "hand";
  return start !== undefined && form > start ? "auto" : undefined;
}

/** Whether `item` is folded by hand: its `from` is 1 or more (`foldItem(state, id, true)` sets it). */
const foldedByHand = (item: DockItem): boolean => Number.isFinite(item.from) && Math.floor(item.from!) >= 1;

/**
 * Whether `item`, lying on `edge`, folds to its `rail` tile when it has no header or fold: a fixed item on a `foldable`
 * edge (a thumbnail anchor, whose column draws as a rail once it folds). The one rule `solve`, `canFold` and `foldItem` share.
 */
const foldsToRail = (item: DockItem, edge: DockEdge | undefined): boolean => !!item.fixed && edge?.foldable === true;

/**
 * The index of the form a hand fold puts `item` in, among `forms`: the first that shows only its bar (`formFolded`: a
 * panel's `header`, its title bar, or a group's `fold`, its grip and »); where it `foldsToRail` on `edge` and has neither, its first `rail` tile.
 * -1 when there is none: a hand fold means nothing on this axis.
 */
export function foldedIndex(item: DockItem, forms: readonly StackForm[], edge?: DockEdge): number {
  const bar = forms.findIndex(formFolded);
  return bar >= 0 || !foldsToRail(item, edge) ? bar : forms.findIndex((f) => f.kind === "rail");
}

/**
 * Where `item`'s ladder starts among `forms`, the forms of the axis it lies along (on `edge`, when docked). Not folded
 * by hand: its first form. Folded by hand (`from` 1 or more): its folded form there (`foldedIndex`), or `from` itself
 * where a stored state put it further down; with no folded form there, its first form (a hand fold means nothing).
 * Give-way steps down from there.
 */
export function startOf(item: DockItem, forms: readonly StackForm[], edge?: DockEdge): number {
  if (!foldedByHand(item)) return 0;
  const folded = foldedIndex(item, forms, edge);
  return folded < 0 ? 0 : Math.min(Math.max(folded, Math.floor(item.from!)), forms.length - 1);
}

/**
 * The state as it places item `id`: the window's (`viewOf`) when a hidden edge lends it to another edge, so its edge is
 * the one `solve` draws it in; else `state` itself.
 */
export function placingOf(state: DockState, id: string): DockState {
  if (!state.edges.some((e) => e.hidden === true && e.showIn !== undefined && e.items.includes(id))) return state;
  const { view, lent } = viewOf(state);
  return lent.has(id) ? view : state;
}

/** The axes item `id` lies along: its edge's (the one it is drawn in, when lent), its float's orient; both when it lies nowhere. */
export function axesOf(given: DockState, id: string): Orient[] {
  const state = placingOf(given, id);
  const item = state.items[id];
  const edge = state.edges.find((e) => e.items.includes(id));
  if (edge) return [axisOf(edge.side)];
  const float = state.floats.find((f) => f.id === id);
  return float && item ? [float.orient ?? floatOrientOf(item)] : ["row", "column"];
}

/**
 * Whether item `id` is folded by hand where it lies, as `solve` draws it: its `from` is 1 or more and it has a folded
 * form on the axis it lies along (`startOf` over 0). A stored `from` with no folded form there is no fold. Every reader
 * of the hand fold asks this, never `from` itself.
 */
export function isHandFolded(given: DockState, id: string): boolean {
  const state = placingOf(given, id);
  const item = Object.hasOwn(given.items, id) ? given.items[id] : undefined;
  const edge = state.edges.find((e) => e.items.includes(id));
  return !!item && axesOf(state, id).some((a) => startOf(item, formsOf(item, a), edge) > 0);
}

/** The first form at or after `from` that isn't a `wrap` form (vertical means icons), or undefined when none is. */
export function pastWrap(forms: readonly StackForm[], from: number): number | undefined {
  for (let j = Math.max(0, Math.floor(from)); j < forms.length; j++) if (forms[j]!.kind !== "wrap" && !forms[j]!.wrap) return j;
  return undefined;
}

/**
 * How `solve` draws a float: the form it takes (an index into its `orient`'s forms) and its size. A vertical float
 * (`orient: "column"`) skips `wrap` forms, which apply only in a column edge: any form it takes after a skipped `wrap`
 * form (its icons) is drawn at that form's natural size, whatever its `from`. An item with only `wrap` forms left has no
 * form there (`none`: `solve` leaves it out with a `no-vertical-form` note), so a word group needs an `icons` form.
 * Otherwise a float with `from` over 0 is its bar (that form's natural length along its orient, its other size kept), and
 * one at its first form is its rect's size where that form is sized by hand (`sizedByHand`), else `floatSizeOf(item, orient)`: the size kept for
 * that orient (`floatSizes`, which `floatAt` with a rect and a hand resize write), and only without one that form's
 * natural size along its orient. So a toolbar group's float given an
 * explicit size keeps it; one given none fits its content; and one turned to the other orient never keeps the rect it
 * had in the old one. Per-orient sizes apply only to an item that declares `floatSizes` (`declaresFloatSizes`); one
 * that declares none keeps its stored rect at its first form, as before them.
 */
export function floatShape(item: DockItem, f: { readonly rect: Rect; readonly orient?: Orient }): { form: number; width: number; height: number; none?: true } {
  const orient = f.orient ?? floatOrientOf(item);
  const forms = formsOf(item, orient);
  const px = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0);
  const w = px(f.rect.width);
  const h = px(f.rect.height);
  if (forms.length === 0) return { form: 0, width: w, height: h };
  const asked = startOf(item, forms);
  const isWrap = (x: StackForm): boolean => x.kind === "wrap" || !!x.wrap;
  const skipped = orient === "column" ? pastWrap(forms, asked) : asked;
  if (skipped === undefined) return { form: asked, width: w, height: h, none: true };
  const form = skipped;
  const fm = forms[form]!;
  if (orient === "column" && forms.slice(0, form + 1).some(isWrap)) return { form, width: px(fm.cross.natural), height: px(fm.main.natural) };
  if (form > 0) return orient === "column" ? { form, width: w, height: px(fm.main.natural) } : { form, width: px(fm.main.natural), height: h };
  // The first form: a form sized by hand (a panel's card) is the rect's size, the one the user sizes; any other (a
  // toolbar group, one that grows on a bar too) is the size kept for its orient (an explicit size stays), else its own natural size (`floatSizeOf`), never a
  // rect left from the other orient. An item that declares no `floatSizes` keeps its stored rect, as before them.
  return { form, ...(sizedByHand(fm) || !declaresFloatSizes(item) ? { width: w, height: h } : floatSizeOf(item, orient)) };
}
