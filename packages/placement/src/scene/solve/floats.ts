/**
 * The floats: fitted inside the stage less the inset at its left and right, clear of every docked item (fixed ones and
 * » entries included), every bar and the chrome rects (`fitFloat`). An anchored float sits flush with that side or
 * corner of `content` first. A float with `from` over 0 is its bar: its form's natural length along its `orient`, its
 * other size kept.
 */
import { fitFloat, type FloatFit } from "../../float-fit";
import { EPS, rect, type Rect, type Size } from "../../geometry";
import type { StackForm } from "../../stack";
import { axisOf, floatOrientOf, floatShape, formsOf } from "../helpers";
import type { FloatAnchor, Orient, SceneFloat, SceneItem } from "../model";
import { shapeOf, type Draft } from "./draft";
import type { Inset } from "./insets";
import { finite, px } from "./order";

/** A float's rect flush with `content`'s side or corner. */
function anchored(content: Rect, w: number, h: number, anchor: FloatAnchor): Rect {
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
  return rect(x, y, w, h);
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
 * Where one float of `item` lies, as `solve` lays it (and `fitResize` previews it): its form and size, then `fitFloat`
 * into `region`, clear of `avoid`. The one clamp for a float's rect; `shape.none` is the caller's to handle first.
 */
export function placeFloat(item: SceneItem, f: Pick<SceneFloat, "rect" | "orient" | "anchor">, region: Rect, avoid: readonly Rect[], content: Rect, stage: Rect): { from: number; fo: Orient; form: StackForm | undefined; fit: FloatFit } {
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
  const w = Math.max(floor.width, Math.min(shape.width, region.width, cap.width));
  // Folded means its bar (a `header` form), not any form past the first (a row float, a second open form).
  const folded = form?.kind === "header";
  const h = folded ? shape.height : Math.max(floor.height, Math.min(shape.height, region.height, cap.height));
  const want = f.anchor ? anchored(content, w, h, f.anchor) : rect(finite(f.rect.x, stage.x), finite(f.rect.y, stage.y), w, h);
  const fit0 = fitFloat(want, region, avoid);
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
  for (const c of scene.chrome ?? []) avoid.push(c);
  // Floats lie within the stage less the inset at its left and right (the sides the columns pad), the stage's full height.
  const floatRegion = rect(stage.x + px(inset.left), stage.y, Math.max(0, stage.width - px(inset.left) - px(inset.right)), stage.height);
  const floats: string[] = [];
  for (const f of scene.floats) {
    if (!d.claim(f.id)) continue;
    const it = scene.items[f.id]!;
    if (it.closed) continue;
    const shape = floatShape(it, f);
    if (shape.none) {
      // Vertical means icons: an item with only `wrap` forms left has no form for a vertical float.
      notes.push({ code: "no-vertical-form", id: f.id });
      continue;
    }
    const { from, fo, form, fit } = placeFloat(it, f, floatRegion, avoid, content, stage);
    if (fit.clamped) notes.push({ code: "float-clamped", id: f.id });
    if (fit.snapped) notes.push({ code: "float-moved", id: f.id });
    if (fit.covers.length > 0) notes.push({ code: "float-covers", id: f.id });
    items[f.id] = { ...shapeOf(form, fit.rect, fo, fit.rect.width), hidden: form?.hides ?? [], rect: fit.rect, kind: it.kind, form: from, formKind: form?.kind ?? "open", floating: true };
    floats.push(f.id);
  }
  return floats;
}
