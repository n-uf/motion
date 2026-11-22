/**
 * The one resolver of anchored keep-clear rects (`AnchoredKeepClear`). `solve` calls it once the edges and the content
 * are final, before the floats: every input it reads is already laid out in this solve, and no input of a solve comes
 * from that solve's own output. Nothing that sizes the content reads keep-clear rects (the cut, the edges, give-way).
 */
import { rect, type Rect } from "@n-uf/placement";
import { isAnchoredKeepClear } from "../helpers";
import type { AnchoredKeepClear, DockKeepClearLayout, DockState, KeepClearRegion } from "../model";

/** The rect of `region` in a layout whose content is `content`. */
const regionRect = (region: KeepClearRegion, content: Rect): Rect | null => (region === "content" ? content : null);

/** One anchored entry in its region: `size` px deep at `side`, clamped to the region; null in an empty region or at no size. */
function anchoredRect(c: AnchoredKeepClear, region: Rect): Rect | null {
  if (!(region.width > 0) || !(region.height > 0) || !Number.isFinite(c.size) || c.size <= 0) return null;
  const w = Math.min(c.size, region.width);
  const h = Math.min(c.size, region.height);
  switch (c.side) {
    case "left":
      return rect(region.x, region.y, w, region.height);
    case "right":
      return rect(region.x + region.width - w, region.y, w, region.height);
    case "top":
      return rect(region.x, region.y, region.width, h);
    case "bottom":
      return rect(region.x, region.y + region.height - h, region.width, h);
    default:
      return null;
  }
}

/**
 * The state's anchored keep-clear rects laid out over `content` (`DockLayout.content`), in the state's order, or
 * undefined for a state that declares none (its layout has no `keepClear`).
 */
export function resolveKeepClear(state: DockState, content: Rect): DockKeepClearLayout[] | undefined {
  const anchored = (state.keepClear ?? []).filter(isAnchoredKeepClear);
  if (anchored.length === 0) return undefined;
  const out: DockKeepClearLayout[] = [];
  for (const c of anchored) {
    const region = regionRect(c.region, content);
    const r = region ? anchoredRect(c, region) : null;
    if (r) out.push({ rect: r, for: c.for === "floats" ? "floats" : "all", ...(typeof c.id === "string" ? { id: c.id } : {}) });
  }
  return out;
}
