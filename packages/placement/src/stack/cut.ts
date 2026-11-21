/**
 * `cutEdges(stage, bands)`: the stage cut into bands along its sides, in list order. Each band takes its `size` across
 * at its side of what the bands before it left, so the order decides the corners: a top band cut before a left one runs
 * across the whole width and the left one starts below it; cut after it, the left one runs the whole height. Pure: no
 * edges, items or forms, only rects.
 *
 * - A `reserve` band (the default) shortens the leftover: what follows is cut from what it leaves.
 * - An `over` band lies over the leftover without shortening it. The `over` bands are cut after every reserved band,
 *   whatever the list order, from the final leftover less the `over` bands before them, so each lies inside the
 *   leftover, two on one side lie side by side, and the leftover stays whole.
 * - A band is never thicker than the room left across it (a negative or missing size is 0). `gap` is space after it,
 *   taken only when the band takes some room, and never more than the room left. A stage of negative size is cut as
 *   one of size 0.
 *
 * Returns each band's rect by id and the leftover rect (`rest`). Band ids are unique: a repeat throws.
 *
 * See docs/placement.md, Entry: stack.
 */
import { rect, type Rect } from "../geometry";

/** A side of the stage. */
export type BandSide = "top" | "right" | "bottom" | "left";

/** One band of the cut. */
export interface EdgeBand {
  readonly id: string;
  readonly side: BandSide;
  /** Its size across (a top band's height, a left band's width), px. */
  readonly size: number;
  /** Space after it before the next band on that side, px (default 0); taken only when the band takes some room. */
  readonly gap?: number;
  /** `"reserve"` (default) shortens the leftover; `"over"` lies over it. */
  readonly mode?: "reserve" | "over";
}

/** The cut: each band's rect by id, and what is left. */
export interface EdgeCut {
  readonly bands: Readonly<Record<string, Rect>>;
  readonly rest: Rect;
}

const px = (x: number | undefined): number => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, x) : 0);

/** `band` laid at its side of `area`: its rect, and `area` less it (and its gap). */
function cutBand(area: Rect, band: EdgeBand): { readonly rect: Rect; readonly rest: Rect } {
  const across = band.side === "top" || band.side === "bottom" ? area.height : area.width;
  const room = Math.max(0, across);
  const thick = Math.min(px(band.size), room);
  const gap = thick > 0 ? Math.min(px(band.gap), room - thick) : 0;
  const take = thick + gap;
  switch (band.side) {
    case "top":
      return { rect: rect(area.x, area.y, area.width, thick), rest: rect(area.x, area.y + take, area.width, area.height - take) };
    case "bottom":
      return { rect: rect(area.x, area.y + area.height - thick, area.width, thick), rest: rect(area.x, area.y, area.width, area.height - take) };
    case "left":
      return { rect: rect(area.x, area.y, thick, area.height), rest: rect(area.x + take, area.y, area.width - take, area.height) };
    case "right":
      return { rect: rect(area.x + area.width - thick, area.y, thick, area.height), rest: rect(area.x, area.y, area.width - take, area.height) };
  }
}

export function cutEdges(stage: Rect, bands: readonly EdgeBand[]): EdgeCut {
  const seen = new Set<string>();
  for (const b of bands) {
    if (seen.has(b.id)) throw new Error(`cutEdges: band id "${b.id}" is given twice`);
    seen.add(b.id);
  }
  const out: Record<string, Rect> = {};
  // A stage of negative size is cut as one of size 0, so every rect has a size of 0 or more.
  let rest = rect(stage.x, stage.y, px(stage.width), px(stage.height));
  for (const b of bands) {
    if (b.mode === "over") continue;
    const c = cutBand(rest, b);
    out[b.id] = c.rect;
    rest = c.rest;
  }
  // The over bands come after every reserved one, whatever the list order: each lies inside the final leftover.
  let over = rest;
  for (const b of bands) {
    if (b.mode !== "over") continue;
    const c = cutBand(over, b);
    out[b.id] = c.rect;
    over = c.rest;
  }
  return { bands: out, rest };
}
