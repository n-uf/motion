/**
 * The home hero's tiling demo (placement's slot): three panes that divide an area, and drops that split or swap them.
 * Plain data and pure functions the server renders (the finished state) and the island animates (islands/hero-tiles.ts):
 * every rect is `layoutSplit` of a split tree from `@n-uf/placement/tiling`, and every drop is `dropOnPane` on the region
 * `paneRegion` finds under the pointer. Nothing here moves or draws: it returns trees and rects.
 */
import type { Rect } from "@n-uf/motion";
import { dropOnPane, layoutSplit, type PaneRegion, type Split } from "@n-uf/placement/tiling";

export type PaneId = "editor" | "terminal" | "preview";
export type Tree = Split<PaneId>;

/** The area the panes divide, in its own px (drawn scaled to fit), and the gap between panes. */
export const AREA: Rect = { x: 0, y: 0, width: 400, height: 250 };
export const GAP = 6;

export const PANES: readonly { readonly id: PaneId; readonly title: string }[] = [
  { id: "editor", title: "Editor" },
  { id: "terminal", title: "Terminal" },
  { id: "preview", title: "Preview" },
];
export const titleOf = (id: PaneId): string => PANES.find((p) => p.id === id)!.title;

/** The start: the editor on the left, the terminal over the preview on the right. */
export const START: Tree = { a: { pane: "editor" }, b: { a: { pane: "terminal" }, b: { pane: "preview" }, axis: "y", ratio: 0.5 }, axis: "x", ratio: 0.55 };

export const rectsOf = (tree: Tree): Map<PaneId, Rect> => layoutSplit(tree, AREA, { gap: GAP });

/** What a drop does, said in words: a side splits the pane it lands on, the center swaps the two. */
export const sayDrop = (dragged: PaneId, at: PaneId, region: PaneRegion): string => (region === "center" ? `swap ${titleOf(dragged)} with ${titleOf(at)}` : `split ${titleOf(at)}, ${titleOf(dragged)} on its ${region}`);

/** A scripted drop: the showcase's steps. */
export interface Step {
  readonly dragged: PaneId;
  readonly at: PaneId;
  readonly region: PaneRegion;
}
/** Four drops that keep every pane and end in a different arrangement; the showcase then starts over from `START`. */
export const STEPS: readonly Step[] = [
  { dragged: "preview", at: "editor", region: "bottom" },
  { dragged: "terminal", at: "editor", region: "center" },
  { dragged: "editor", at: "preview", region: "right" },
  { dragged: "preview", at: "terminal", region: "top" },
];

/** The tree after a step, and the dragged pane's rect in it (the slot the indicator shows). */
export function afterStep(tree: Tree, s: Step): { tree: Tree; slot: Rect } {
  const next = dropOnPane(tree, s.dragged, s.at, s.region);
  return { tree: next, slot: rectsOf(next).get(s.dragged)! };
}
