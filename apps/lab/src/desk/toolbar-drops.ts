/**
 * The toolbar's drop targets, as pure functions: where a dragged toolbar can go, each target setting the toolbar
 * mode the Toolbar switch sets (it changes the options, not the desk's state).
 *
 * - The top band (2) → the toolbar at the top, in reserved space; the bottom band (2) → at the bottom, reserved.
 * - Over the documents (3) → floating over them at the nearer edge: the upper half floats it at the top, the lower
 *   half at the bottom.
 * - Only constructions with a floating pill have toolbar modes; the others (a bar across the top, whose layouts
 *   place it only there) offer no target, so their bar doesn't drag.
 *
 * The bands and the documents' area come from the construction's own layouts in each mode, so a target is always a
 * mode the layout handles.
 */
import type { Rect } from "@n-uf/motion";
import type { DropTarget, TargetInput } from "./drops";
import { G, isDocKey, rect, type Options } from "./model";

/** The key of the toolbar item. */
export const TOOLBAR = "toolbar";

/** A toolbar mode: where it sits and whether the documents keep a band clear for it. */
export type ToolbarMode = Pick<Options, "toolbar" | "toolbarSpace">;

/** The modes, in the keyboard's order (top to bottom), with the Toolbar switch's labels. */
export const TOOLBAR_TARGETS: readonly (ToolbarMode & { readonly id: string; readonly label: string })[] = [
  { id: "toolbar:top-reserved", toolbar: "top", toolbarSpace: "reserved", label: "Top · reserved" },
  { id: "toolbar:top-overlay", toolbar: "top", toolbarSpace: "overlay", label: "Top · floating" },
  { id: "toolbar:bottom-overlay", toolbar: "bottom", toolbarSpace: "overlay", label: "Bottom · floating" },
  { id: "toolbar:bottom-reserved", toolbar: "bottom", toolbarSpace: "reserved", label: "Bottom · reserved" },
];

/** The target that sets `m`. */
export const toolbarTargetId = (m: ToolbarMode): string => `toolbar:${m.toolbar}-${m.toolbarSpace}`;

const union = (rs: readonly Rect[]): Rect | null => {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.width));
  const y1 = Math.max(...rs.map((r) => r.y + r.height));
  return rect(x0, y0, x1 - x0, y1 - y0);
};

/**
 * The bands and the documents' area: the top band runs from the stage's top to just under the pill at the top,
 * the bottom band holds the pill at the bottom with a gap either side; both span the documents (and the pill).
 * Between them, the documents' area splits at its middle into the two floating targets.
 */
export function toolbarTargets({ c, s0, size, opt }: TargetInput): DropTarget[] {
  if (!c.pill) return [];
  const laid = TOOLBAR_TARGETS.map((m) => c.layout(s0, size, { ...opt, toolbar: m.toolbar, toolbarSpace: m.toolbarSpace }));
  const pills = laid.map((l) => l.items.get(TOOLBAR)!.rect);
  const docs = union(laid.flatMap((l) => [...l.items].filter(([k, p]) => isDocKey(k) && !p.hidden).map(([, p]) => p.rect)));
  const span = union(docs ? [docs, ...pills] : pills)!;
  const top = pills[0]!;
  const bottom = pills[3]!;
  const topBand = rect(span.x, 0, span.width, top.y + top.height + G);
  const by0 = Math.max(topBand.y + topBand.height, bottom.y - G);
  const bottomBand = rect(span.x, by0, span.width, Math.min(size.height, bottom.y + bottom.height + G) - by0);
  const fy0 = topBand.y + topBand.height;
  const fy1 = bottomBand.y;
  const mid = (fy0 + fy1) / 2;
  const hits: Record<string, Rect> = {
    "toolbar:top-reserved": topBand,
    "toolbar:top-overlay": rect(span.x, fy0, span.width, mid - fy0),
    "toolbar:bottom-overlay": rect(span.x, mid, span.width, fy1 - mid),
    "toolbar:bottom-reserved": bottomBand,
  };
  return TOOLBAR_TARGETS.filter((m) => hits[m.id]!.height > 0).map((m) => ({
    id: m.id,
    prio: m.toolbarSpace === "reserved" ? 2 : 3,
    hit: hits[m.id]!,
    make: () => ({ state: s0, opt: { ...opt, toolbar: m.toolbar, toolbarSpace: m.toolbarSpace }, label: `Toolbar: ${m.label}`, key: m.id }),
  }));
}
