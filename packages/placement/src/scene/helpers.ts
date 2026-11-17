/**
 * What the scene's shapes (`./model`) tell on their own: which zones of an edge take a kind, an edge's axis, an item's
 * zone and forms, whether a side edge is a toolbar bar, and how an item floats (its orient, size and form). Pure.
 */
import type { Rect, Size } from "../geometry";
import type { StackForm } from "../stack";
import { DEFAULT_FLOAT_SIZE, DEFAULT_HIT_BAND, DEFAULT_RAIL_MAGNET, RAIL_STRIP_MIN, ZONES, type ColumnTemplate, type Edge, type FloatAnchor, type FloatAnchorAt, type Kind, type Orient, type RailMode, type RailVisibility, type Scene, type SceneItem, type Side, type Zone, type ZoneAccepts } from "./model";

/** The name of a float's anchor, with or without an offset: `"content-top-right"` for `{ at: "content-top-right", dy: 12 }`. */
export const anchorName = (anchor: FloatAnchorAt): FloatAnchor => (typeof anchor === "string" ? anchor : anchor.at);

/** Whether `edge` takes kind `kind` in `zone`: its `accepts`, narrowed by `zoneAccepts` when given (a zone not listed takes nothing). */
export const zoneTakes = (edge: { readonly accepts: readonly Kind[]; readonly zoneAccepts?: ZoneAccepts }, zone: Zone, kind: Kind): boolean =>
  edge.accepts.includes(kind) && (edge.zoneAccepts === undefined || !!edge.zoneAccepts[zone]?.includes(kind));

/** The zones of `edge` that take `kind`, in order. */
export const zonesTaking = (edge: { readonly accepts: readonly Kind[]; readonly zoneAccepts?: ZoneAccepts }, kind: Kind): Zone[] => ZONES.filter((z) => zoneTakes(edge, z, kind));

/**
 * Whether `edge` takes `kind` anywhere: its `accepts` lists it and at least one of its zones takes it (`zoneTakes`). An
 * edge whose zones take nothing for the kind (`zoneAccepts: {}`) takes it nowhere, exactly as one whose `accepts` lacks
 * it: the one test drop targets and refusals ask. The stored form and `readScene` keep reading `accepts` itself.
 */
export const edgeTakes = (edge: { readonly accepts: readonly Kind[]; readonly zoneAccepts?: ZoneAccepts }, kind: Kind): boolean => zonesTaking(edge, kind).length > 0;

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
    .filter((e) => e.side === side && !e.compact && zoneTakes(e, "start", kind))
    .reduce<Edge | undefined>((m, e) => (!m || e.ring < m.ring ? e : m), undefined);
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

/** The axes item `id` lies along: its edge's, its float's orient; both when it lies nowhere. */
export function axesOf(scene: Scene, id: string): Orient[] {
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
export function isHandFolded(scene: Scene, id: string): boolean {
  const item = Object.hasOwn(scene.items, id) ? scene.items[id] : undefined;
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
