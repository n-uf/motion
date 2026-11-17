/**
 * The floats: fitted inside the stage less the inset at its left and right, clear of every docked item (fixed ones and
 * » entries included), every bar and the chrome rects (`fitFloat`). An anchored float sits flush with that side or
 * corner of `content` first, then clear of every float with a rect of its own and of the anchored floats floated before
 * it (smaller `since`, then smaller id) too, where room exists (`fitBeside`); the stacking order plays no part. A float
 * with `from` over 0 is its bar: its form's natural length along its `orient`, its other size kept.
 */
import { fitFloat, type FloatFit } from "../../float-fit";
import { EPS, rect, type Rect, type Size } from "../../geometry";
import type { StackForm } from "../../stack";
import { anchorName, axisOf, chromeFor, floatOrientOf, floatShape, foldedByOf, formsOf, isSince } from "../helpers";
import type { FloatAnchor, FloatAnchorAt, Orient, SceneFloat, SceneItem } from "../model";
import { shapeOf, type Draft } from "./draft";
import type { Inset } from "./insets";
import { finite, px } from "./order";

/** When a float was floated, for the order among anchored floats: its `since`, a missing or unusable one 0. */
const sinceOf = (f: SceneFloat): number => (isSince(f.since) ? f.since : 0);

/** A float's rect flush with `content`'s side or corner, moved by the anchor's offset (`dx` right, `dy` down). */
function anchored(content: Rect, w: number, h: number, given: FloatAnchorAt): Rect {
  const anchor = anchorName(given);
  const dx = typeof given === "string" ? 0 : finite(given.dx ?? 0, 0);
  const dy = typeof given === "string" ? 0 : finite(given.dy ?? 0, 0);
  const left = content.x;
  const right = content.x + content.width - w;
  const midX = content.x + (content.width - w) / 2;
  const top = content.y;
  const bottom = content.y + content.height - h;
  const midY = content.y + (content.height - h) / 2;
  const at: Record<FloatAnchor, [number, number]> = {
    "content-top-left": [left, top],
    "content-top": [midX, top],
    "content-top-right": [right, top],
    "content-right": [right, midY],
    "content-bottom-right": [right, bottom],
    "content-bottom": [midX, bottom],
    "content-bottom-left": [left, bottom],
    "content-left": [left, midY],
  };
  const [x, y] = at[anchor] ?? at["content-top-right"];
  return rect(x + dx, y + dy, w, h);
}

/** The floor a float of `item` is laid out at: its `floatMin`, else its form's own minimums, which only stop a shrink. */
export function floatFloor(item: SceneItem, form: StackForm | undefined, orient: Orient, size: Size): Size {
  const row = orient === "row";
  // The form's own minimums only stop a shrink (a float asked smaller keeps its size); `floatMin` is laid out as given.
  return {
    width: item.floatMin ? px(item.floatMin.width) : Math.min(size.width, px(row ? form?.main.min : form?.cross.min)),
    height: item.floatMin ? px(item.floatMin.height) : Math.min(size.height, px(row ? form?.cross.min : form?.main.min)),
  };
}

/**
 * The room `region` leaves a float along each axis, clear of what spans it whole: down it, the region less the bars and
 * chrome across its full width at its top and bottom; across it, less what runs its full height at its left and right.
 * What spans only part of it is no limit on the size (a float fits beside it).
 */
function clearSize(region: Rect, avoid: readonly Rect[]): Size {
  const span = (axis: "x" | "y"): number => {
    const lo = axis === "y" ? region.y : region.x;
    const hi = lo + (axis === "y" ? region.height : region.width);
    const mid = (lo + hi) / 2;
    let a = lo;
    let b = hi;
    for (const r of avoid) {
      // Across the region whole, the other way.
      const whole = axis === "y" ? r.x <= region.x + EPS && r.x + r.width >= region.x + region.width - EPS : r.y <= region.y + EPS && r.y + r.height >= region.y + region.height - EPS;
      const s = axis === "y" ? r.y : r.x;
      const e = s + (axis === "y" ? r.height : r.width);
      if (!whole || e <= lo || s >= hi) continue;
      if (s + e <= 2 * mid) a = Math.max(a, e);
      else b = Math.min(b, s);
    }
    return Math.max(0, b - a);
  };
  return { width: span("x"), height: span("y") };
}

/**
 * An anchored float's fit: `fitFloat` clear of `avoid` and of `earlier` (the floats that win over it), the same nearest
 * clear place it finds beside docked items. Where no place is clear of both, it is `fitFloat` clear of `avoid` alone, as
 * if `earlier` were not there: a float may cover an earlier float, never a docked item it could have stayed clear of.
 * With no earlier floats it is exactly `fitFloat(want, region, avoid)`.
 */
function fitBeside(want: Rect, region: Rect, avoid: readonly Rect[], earlier: readonly Rect[]): FloatFit {
  if (earlier.length === 0) return fitFloat(want, region, avoid);
  const both = fitFloat(want, region, [...avoid, ...earlier]);
  return both.covers.length === 0 ? both : fitFloat(want, region, avoid);
}

/**
 * Where one float of `item` lies, as `solve` lays it (and `fitResize` previews it): its form and size, then `fitFloat`
 * into `region`, clear of `avoid`. Its size is clamped to the room `region` leaves clear of the bars and chrome across
 * it (`clearSize`), never under its floor: only a floor larger than that room covers. The one clamp for a float's rect;
 * `shape.none` is the caller's to handle first. An anchored float is also kept clear of `earlier` (the floats that win
 * over it) where room exists (`fitBeside`); a float with a rect of its own ignores `earlier`.
 */
export function placeFloat(item: SceneItem, f: Pick<SceneFloat, "rect" | "orient" | "anchor">, region: Rect, avoid: readonly Rect[], content: Rect, stage: Rect, earlier: readonly Rect[] = []): { from: number; fo: Orient; form: StackForm | undefined; fit: FloatFit } {
  const shape = floatShape(item, f);
  const from = shape.form;
  // Its orient: the float's, else the item's (`floatOrientOf`: a toolbar group floats as a row).
  const fo = f.orient ?? floatOrientOf(item);
  const form = formsOf(item, fo)[from];
  // Into that region; a float larger than it is shrunk to fit it, never under its floor. A folded float (its bar) keeps
  // its height. Wider than the region at its floor, it keeps the floor and lies at the region's left edge.
  const floor = floatFloor(item, form, fo, shape);
  // `floatMax` caps it (never under the floor).
  const cap = { width: Number.isFinite(item.floatMax?.width) ? item.floatMax!.width : Infinity, height: Number.isFinite(item.floatMax?.height) ? item.floatMax!.height : Infinity };
  const clear = clearSize(region, avoid);
  const w = Math.max(floor.width, Math.min(shape.width, clear.width, cap.width));
  // A float folded by hand is its bar (a panel's `header`, a group's `fold`): it keeps the bar's own height. Any other
  // form (its first, or a later one a stored scene names) fits the region.
  const folded = form?.kind === "header" || form?.kind === "fold";
  const h = folded ? shape.height : Math.max(floor.height, Math.min(shape.height, clear.height, cap.height));
  const want = f.anchor ? anchored(content, w, h, f.anchor) : rect(finite(f.rect.x, stage.x), finite(f.rect.y, stage.y), w, h);
  const fit0 = f.anchor ? fitBeside(want, region, avoid, earlier) : fitFloat(want, region, avoid);
  const fit = w > region.width + EPS ? { ...fit0, rect: rect(region.x, fit0.rect.y, w, fit0.rect.height) } : fit0;
  return { from, fo, form, fit };
}

/** Lays every float of the scene that isn't placed already; returns their ids in stacking order. */
export function layFloats(d: Draft, stage: Rect, content: Rect, inset: Inset): string[] {
  const { scene, notes, items, edges } = d;
  // Floats: clear of every docked item, every bar and the chrome.
  const avoid: Rect[] = [];
  for (const l of Object.values(items)) avoid.push(l.rect);
  for (const e of Object.values(edges)) {
    if (axisOf(e.side) === "row" && e.cross > 0) avoid.push(e.rect);
    if (e.menu) avoid.push(e.menu.rect);
  }
  for (const c of chromeFor(scene, "floats")) avoid.push(c);
  // Floats lie within the stage less the inset at its left and right (the sides the columns pad), the stage's full height.
  const floatRegion = rect(stage.x + px(inset.left), stage.y, Math.max(0, stage.width - px(inset.left) - px(inset.right)), stage.height);
  // The floats drawn, in stacking order; a note for one with no vertical form, in that order too.
  const drawn: SceneFloat[] = [];
  const noForm = new Set<string>();
  for (const f of scene.floats) {
    if (!d.claim(f.id)) continue;
    const it = scene.items[f.id]!;
    if (it.closed) continue;
    // Vertical means icons: an item with only `wrap` forms left has no form for a vertical float.
    if (floatShape(it, f).none) noForm.add(f.id);
    drawn.push(f);
  }
  // Where each lies, apart from the stacking order (so `raise` reshapes nothing): a float with its own rect first, clear
  // of what floats are kept clear of; then the anchored ones, earliest floated first (`since`, then id), each clear of
  // every float with its own rect and of the anchored ones floated before it too, where room exists (`fitBeside`).
  const placed = new Map<string, ReturnType<typeof placeFloat>>();
  const place = (f: SceneFloat, earlier: readonly Rect[] = []): void => {
    placed.set(f.id, placeFloat(scene.items[f.id]!, f, floatRegion, avoid, content, stage, earlier));
  };
  const live = drawn.filter((f) => !noForm.has(f.id));
  for (const f of live) if (!f.anchor) place(f);
  const own = [...placed.values()].map((p) => p.fit.rect);
  const anchored = live.filter((f) => f.anchor).sort((a, b) => sinceOf(a) - sinceOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  anchored.forEach((f, i) => place(f, [...own, ...anchored.slice(0, i).map((a) => placed.get(a.id)!.fit.rect)]));
  const floats: string[] = [];
  for (const f of drawn) {
    if (noForm.has(f.id)) {
      notes.push({ code: "no-vertical-form", id: f.id });
      continue;
    }
    const it = scene.items[f.id]!;
    const { from, fo, form, fit } = placed.get(f.id)!;
    if (fit.clamped) notes.push({ code: "float-clamped", id: f.id });
    if (fit.snapped) notes.push({ code: "float-moved", id: f.id });
    if (fit.covers.length > 0) notes.push({ code: "float-covers", id: f.id });
    // A float never gives way: it is folded by hand or not at all.
    const foldedBy = foldedByOf(it, formsOf(it, fo), from);
    items[f.id] = { ...shapeOf(form, fit.rect, fo, fit.rect.width), hidden: form?.hides ?? [], rect: fit.rect, kind: it.kind, form: from, formKind: form?.kind ?? "open", floating: true, ...(foldedBy ? { foldedBy } : {}) };
    floats.push(f.id);
  }
  return floats;
}
