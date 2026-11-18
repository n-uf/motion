/**
 * What the scene's shapes (`./model`) tell on their own: which zones of an edge take a kind, an edge's axis, an item's
 * zone and forms, whether a side edge is a toolbar bar, and how an item floats (its orient, size and form). Pure.
 */
import type { Rect, Size } from "../geometry";
import type { StackForm } from "../stack";
import { DEFAULT_FLOAT_SIZE, DEFAULT_HIT_BAND, DEFAULT_RAIL_MAGNET, RAIL_STRIP_MIN, ZONES, type ColumnTemplate, type Edge, type FloatAnchor, type FloatAnchorAt, type Kind, type Orient, type RailMode, type RailVisibility, type Scene, type SceneItem, type Side, type Zone, type ZoneAccepts } from "./model";

/** The name of a float's anchor, with or without an offset: `"content-top-right"` for `{ at: "content-top-right", dy: 12 }`. */
export const anchorName = (anchor: FloatAnchorAt): FloatAnchor => (typeof anchor === "string" ? anchor : anchor.at);

/**
 * Whether `x` is a usable `SceneFloat.since`: a number from 0 to `Number.MAX_SAFE_INTEGER`. Past that, one more is the
 * same number, so new floats would tie.
 */
export const isSince = (x: unknown): x is number => typeof x === "number" && x >= 0 && x <= Number.MAX_SAFE_INTEGER;

/** What the zone tests read of an edge (or a column template): what it takes, per zone, and the zones it has. */
type ZoneDecl = { readonly accepts: readonly Kind[]; readonly zoneAccepts?: ZoneAccepts; readonly zones?: readonly Zone[] };

/**
 * The zones an edge has (`Edge.zones`), in order: all three unless it lists some. Entries that aren't zones, and
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
 * it: the one test drop targets and refusals ask. The stored form and `readScene` keep reading `accepts` itself.
 */
export const edgeTakes = (edge: ZoneDecl, kind: Kind): boolean => zonesTaking(edge, kind).length > 0;

/**
 * How a gap's hit runs over `edge`'s open panels (`Edge.hitBand`): its own, else, for a dynamic column, its side's
 * template's (`ColumnTemplate.hitBand`), else {@link DEFAULT_HIT_BAND}.
 */
export const hitBandOf = (scene: Scene, edge: Edge): number | "middle" =>
  edge.hitBand ?? (edge.column === true && (edge.side === "left" || edge.side === "right") ? scene.columns?.[edge.side]?.hitBand : undefined) ?? DEFAULT_HIT_BAND;

/**
 * A dynamic column made from its side's template: every column the scene makes (a drop on a column line, `moveTo` a new
 * column, `dockHome`, a stored column `readScene` reads back) is made here, so each takes every template field
 * (`accepts`, `cross`, `gap`, `pad`, `menu`, `zoneAccepts`, `hitBand`).
 */
export const columnFromTemplate = (t: ColumnTemplate, id: string, side: "left" | "right", ring: number, items: readonly string[]): Edge => ({
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

/** How the rails of `side` show their items (`Scene.railModes`, default `"titles"`); top and bottom have no rails. */
export const railModeOf = (scene: Scene, side: Side): RailMode => (side === "left" || side === "right" ? (scene.railModes?.[side] === "icons" ? "icons" : "titles") : "icons");

/** The axis an edge's stack runs along. */
export const axisOf = (side: Side): Orient => (side === "left" || side === "right" ? "column" : "row");

/**
 * The chrome rects `who` keeps clear of (`SceneChrome`): floats keep clear of every entry; drop targets, slots and
 * landings only of those for `"all"` (the default), never of a floats-only one.
 */
export const chromeFor = (scene: Scene, who: "floats" | "targets"): Rect[] =>
  (scene.chrome ?? []).filter((c) => who === "floats" || c.for !== "floats").map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height }));

/**
 * The side's rail where the scene declares none (`Scene.rails[side]`): its outermost column that takes `kind` in its
 * start zone (not an icons-only edge), which shows as a rail once nothing in it sets its width. Undefined where the side
 * has a declared rail, or no such column.
 */
export function railColumnOf(scene: Scene, side: "left" | "right", kind: Kind): Edge | undefined {
  if (scene.rails?.[side]) return undefined;
  return scene.edges
    .filter((e) => e.side === side && !e.compact && e.hidden !== true && zoneTakes(e, "start", kind))
    .reduce<Edge | undefined>((m, e) => (!m || e.ring < m.ring ? e : m), undefined);
}

/** The scene as the window shows it, and what it lent: see `viewOf`. */
export interface SceneView {
  /** The scene the window shows: no hidden edge; the items a hidden edge lends at the end of the edge it shows them in. */
  readonly view: Scene;
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
export function zoneIn(edge: Edge, item: SceneItem): Zone {
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
 * Whether a hidden edge's `showIn` names an edge it can lend its items to: another static edge of the scene, not
 * hidden. A dynamic column (`column: true`) never is: drops make and delete those.
 */
const showInOf = (scene: Scene, e: Edge): Edge | undefined => {
  if (e.hidden !== true || e.showIn === undefined) return undefined;
  const to = scene.edges.find((x) => x.id === e.showIn);
  return to && to !== e && to.hidden !== true && to.column !== true ? to : undefined;
};

/**
 * The scene as the window shows it (`Edge.hidden`, `Edge.showIn`): its hidden edges left out, and the items of a hidden
 * edge that names `showIn` lent to that edge, after its own items, each that edge takes the kind of (`edgeTakes`; a
 * fixed item never). Every docked item, lent or not, lies in the zone `zoneIn` gives it: its own where its edge takes
 * it there, else the first zone that does (the view's `align`; the stored one is unchanged). The same object when nothing
 * is hidden and every item lies in its own zone.
 */
export function viewOf(scene: Scene): SceneView {
  const lent = new Map<string, string>();
  const ignored: string[] = [];
  const added = new Map<string, string[]>();
  const hidden = scene.edges.some((e) => e.hidden === true);
  if (hidden) {
    for (const e of scene.edges) {
      if (e.hidden !== true || e.showIn === undefined) continue;
      const to = showInOf(scene, e);
      if (!to) {
        ignored.push(e.id);
        continue;
      }
      for (const id of e.items) {
        const item = Object.hasOwn(scene.items, id) ? scene.items[id] : undefined;
        if (!item || item.fixed || lent.has(id) || to.items.includes(id) || !edgeTakes(to, item.kind)) continue;
        lent.set(id, e.id);
        added.set(to.id, [...(added.get(to.id) ?? []), id]);
      }
    }
  }
  const edges = hidden ? scene.edges.filter((e) => e.hidden !== true).map((e) => (added.has(e.id) ? { ...e, items: [...e.items, ...added.get(e.id)!] } : e)) : scene.edges;
  // Each docked item in the zone it lies in.
  const rezoned = new Set<string>();
  let items: Record<string, SceneItem> | undefined;
  for (const e of edges) {
    for (const id of e.items) {
      const item = Object.hasOwn(scene.items, id) ? scene.items[id] : undefined;
      if (!item) continue;
      const zone = zoneIn(e, item);
      if (zone === zoneOf(item)) continue;
      const { align: _a, ...plain } = item;
      items ??= { ...scene.items };
      items[id] = zone === "start" ? plain : { ...plain, align: zone };
      rezoned.add(id);
    }
  }
  if (!hidden && !items) return { view: scene, lent, ignored, rezoned };
  return { view: { ...scene, edges, ...(items ? { items } : {}) }, lent, ignored, rezoned };
}

/** Whether item `id` lies in a hidden edge. */
export const inHiddenEdge = (scene: Scene, id: string): boolean => scene.edges.some((e) => e.hidden === true && e.items.includes(id));

/**
 * `shown`, a scene made from `viewOf(scene).view` (a drop's result), with `scene`'s hidden edges put back where they
 * stood in its edge list, holding their items. The items they lent go back to them, as they were, unless `moved` is
 * one of them: the item a drop committed somewhere, which keeps its new place and leaves its hidden edge. On a side whose
 * shown edges are those it had, nothing is renumbered. On a side where a column was made or removed, each hidden edge
 * goes back by its own ring, before the first shown edge that lay further in than it did, and the side is numbered again
 * from 0 in that order.
 *
 * Every item the view laid out in a zone other than its own (`rezoned`) keeps its stored `align`; so does `moved`, the
 * item a drop committed, unless the drop named a zone (`zoned`: a gap in an edge), whose zone it then takes.
 */
export function withHiddenOf(scene: Scene, shown: Scene, lent: ReadonlyMap<string, string> = new Map(), moved?: string, zoned = false, rezoned: ReadonlySet<string> = new Set()): Scene {
  if (shown === scene) return shown;
  // The lent items that stay lent: out of the edges they were shown in, back into their hidden edges.
  const back = [...lent.keys()].filter((id) => id !== moved);
  const edges = shown.edges.filter((e) => e.hidden !== true).map((e) => (back.some((id) => e.items.includes(id)) ? { ...e, items: e.items.filter((id) => !back.includes(id)) } : e));
  scene.edges.forEach((e, i) => {
    if (e.hidden !== true) return;
    const own = moved !== undefined && lent.get(moved) === e.id ? { ...e, items: e.items.filter((id) => id !== moved) } : e;
    edges.splice(Math.min(i, edges.length), 0, own);
  });
  const items: Record<string, SceneItem> = back.length > 0 ? { ...shown.items, ...Object.fromEntries(back.map((id) => [id, scene.items[id]!])) } : { ...shown.items };
  // The item's zone is its own fact: only a drop that names a zone changes it.
  const keep = new Set([...rezoned].filter((id) => !back.includes(id) && !(id === moved && zoned)));
  if (moved !== undefined && !zoned) keep.add(moved);
  for (const id of keep) {
    const was = Object.hasOwn(scene.items, id) ? scene.items[id] : undefined;
    const now = Object.hasOwn(items, id) ? items[id] : undefined;
    if (!was || !now || now.align === was.align) continue;
    const { align: _a, ...plain } = now;
    items[id] = was.align === undefined ? plain : { ...plain, align: was.align };
  }
  const ringBefore = new Map(scene.edges.filter((e) => e.hidden !== true).map((e) => [e.id, e.ring]));
  for (const side of new Set(scene.edges.filter((e) => e.hidden === true).map((e) => e.side))) {
    const was = scene.edges.filter((e) => e.side === side && e.hidden !== true).map((e) => e.id).sort();
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
export function railPolicyOf(scene: Scene, kind: Kind): { readonly railStripWidth: number | null; readonly railVisibility: RailVisibility; readonly magnet: number; readonly floatNearEdge: boolean } | null {
  const p = Object.hasOwn(scene.railDrop ?? {}, kind) ? scene.railDrop![kind] : undefined;
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
export const zoneOf = (item: SceneItem | undefined): Zone => (item?.align === "center" || item?.align === "end" ? item.align : "start");
export const formsOf = (item: SceneItem, axis: Orient): readonly StackForm[] => item.forms[axis] ?? [];

const PANEL_FORMS: ReadonlySet<string> = new Set(["open", "header", "rail"]);
/** A panel that counts as docked for `insetWhen: "docked"`: not closed, not fixed, its first column form a panel's (open, header or rail). */
export const isDockingPanel = (item: SceneItem): boolean => !item.closed && !item.fixed && PANEL_FORMS.has(formsOf(item, "column")[0]?.kind ?? "");

/**
 * A left or right toolbar bar outside the inset (`isSideBar` with `outsideInset`). It lies outermost on its side,
 * before the side's rail.
 */
export function isOutsideSideBar(scene: Scene, e: Edge): boolean {
  return e.outsideInset === true && isSideBar(scene, e);
}

/**
 * A left or right toolbar bar: told from a column edge by its kinds, it takes something and nothing the side's columns
 * or its rail take (`Scene.columns[side].accepts`, `Scene.rails[side].accepts`); an anchor takes nothing. A side with
 * neither a column template nor a rail has nothing to tell them apart by, so no edge there is a bar.
 */
export function isSideBar(scene: Scene, e: Edge): boolean {
  if ((e.side !== "left" && e.side !== "right") || e.column === true || e.accepts.length === 0) return false;
  const template = scene.columns?.[e.side];
  const rail = scene.rails?.[e.side];
  if (!template && !rail) return false;
  const panelKinds = [...(template?.accepts ?? []), ...(rail?.accepts ?? [])];
  return !e.accepts.some((k) => panelKinds.includes(k));
}

/**
 * The orient a float of `item` takes when it names none: its `floatOrient`, else the axis of its first form (the first
 * of `forms.row` / `forms.column` it declares with any form), else column.
 */
export const floatOrientOf = (item: SceneItem): Orient => {
  if (item.floatOrient === "row" || item.floatOrient === "column") return item.floatOrient;
  for (const k of Object.keys(item.forms)) if ((k === "row" || k === "column") && formsOf(item, k).length > 0) return k;
  return "column";
};

/**
 * A float's size when nothing gives one: the item's `floatSize`, else its first form's natural size along `orient`
 * (default `floatOrientOf`), else `DEFAULT_FLOAT_SIZE` when that form grows (a panel's card has no natural float length)
 * or the item has no form there.
 */
export function floatSizeOf(item: SceneItem, orient: Orient = floatOrientOf(item)): Size {
  if (item.floatSize) return item.floatSize;
  const f = formsOf(item, orient)[0];
  if (!f || f.main.grows) return DEFAULT_FLOAT_SIZE;
  const main = Number.isFinite(f.main.natural) ? Math.max(0, f.main.natural) : 0;
  const cross = Number.isFinite(f.cross.natural) ? Math.max(0, f.cross.natural) : 0;
  if (main <= 0 || cross <= 0) return DEFAULT_FLOAT_SIZE;
  return orient === "row" ? { width: main, height: cross } : { width: cross, height: main };
}

/**
 * Why `item`, drawn in form `form` of `forms` (the forms of the axis it lies along), counts as folded
 * (`SceneItemLayout.foldedBy`): `"hand"` when it is folded by hand and that axis has a folded form (`startOf` over 0),
 * else `"auto"` when `form` lies below `start`, the form it started in (it gave way), else undefined. A closed item, or
 * one in its first form, is never folded. Leave `start` out where nothing gives way (a float).
 */
export function foldedByOf(item: SceneItem, forms: readonly StackForm[], form: number, start?: number, edge?: Edge): "hand" | "auto" | undefined {
  if (item.closed || form < 1) return undefined;
  if (startOf(item, forms, edge) > 0) return "hand";
  return start !== undefined && form > start ? "auto" : undefined;
}

/** Whether `item` is folded by hand: its `from` is 1 or more (`fold(scene, id, true)` sets it). */
const foldedByHand = (item: SceneItem): boolean => Number.isFinite(item.from) && Math.floor(item.from!) >= 1;

/**
 * Whether `item`, lying on `edge`, folds to its `rail` tile when it has no header or fold: a fixed item on a `foldable`
 * edge (a thumbnail anchor, whose column draws as a rail once it folds). The one rule `solve`, `canFold` and `fold` share.
 */
const foldsToRail = (item: SceneItem, edge: Edge | undefined): boolean => !!item.fixed && edge?.foldable === true;

/**
 * The index of the form a hand fold puts `item` in, among `forms`: a panel's `header` (its title bar) or a group's
 * `fold` (its grip and »), the first of either; where it `foldsToRail` on `edge` and has neither, its first `rail` tile.
 * -1 when there is none: a hand fold means nothing on this axis.
 */
export function foldedIndex(item: SceneItem, forms: readonly StackForm[], edge?: Edge): number {
  const bar = forms.findIndex((f) => f.kind === "header" || f.kind === "fold");
  return bar >= 0 || !foldsToRail(item, edge) ? bar : forms.findIndex((f) => f.kind === "rail");
}

/**
 * Where `item`'s ladder starts among `forms`, the forms of the axis it lies along (on `edge`, when docked). Not folded
 * by hand: its first form. Folded by hand (`from` 1 or more): its folded form there (`foldedIndex`), or `from` itself
 * where a stored scene put it further down; with no folded form there, its first form (a hand fold means nothing).
 * Give-way steps down from there.
 */
export function startOf(item: SceneItem, forms: readonly StackForm[], edge?: Edge): number {
  if (!foldedByHand(item)) return 0;
  const folded = foldedIndex(item, forms, edge);
  return folded < 0 ? 0 : Math.min(Math.max(folded, Math.floor(item.from!)), forms.length - 1);
}

/**
 * The scene as it places item `id`: the window's (`viewOf`) when a hidden edge lends it to another edge, so its edge is
 * the one `solve` draws it in; else `scene` itself.
 */
export function placingOf(scene: Scene, id: string): Scene {
  if (!scene.edges.some((e) => e.hidden === true && e.showIn !== undefined && e.items.includes(id))) return scene;
  const { view, lent } = viewOf(scene);
  return lent.has(id) ? view : scene;
}

/** The axes item `id` lies along: its edge's (the one it is drawn in, when lent), its float's orient; both when it lies nowhere. */
export function axesOf(given: Scene, id: string): Orient[] {
  const scene = placingOf(given, id);
  const item = scene.items[id];
  const edge = scene.edges.find((e) => e.items.includes(id));
  if (edge) return [axisOf(edge.side)];
  const float = scene.floats.find((f) => f.id === id);
  return float && item ? [float.orient ?? floatOrientOf(item)] : ["row", "column"];
}

/**
 * Whether item `id` is folded by hand where it lies, as `solve` draws it: its `from` is 1 or more and it has a folded
 * form on the axis it lies along (`startOf` over 0). A stored `from` with no folded form there is no fold. Every reader
 * of the hand fold asks this, never `from` itself.
 */
export function isHandFolded(given: Scene, id: string): boolean {
  const scene = placingOf(given, id);
  const item = Object.hasOwn(given.items, id) ? given.items[id] : undefined;
  const edge = scene.edges.find((e) => e.items.includes(id));
  return !!item && axesOf(scene, id).some((a) => startOf(item, formsOf(item, a), edge) > 0);
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
 * one at its first form is its rect's size.
 */
export function floatShape(item: SceneItem, f: { readonly rect: Rect; readonly orient?: Orient }): { form: number; width: number; height: number; none?: true } {
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
  return { form, width: w, height: h };
}
