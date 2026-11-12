import type { DragFrame, DragTarget } from "./intent";

/**
 * How a drag previews its drop, from least to most motion while dragging:
 *
 * - `"indicator"`: nothing moves; only the indicator (an outline or an
 *   insertion marker) shows the target.
 * - `"gap"`: once the room is made, the others move aside and open the slot;
 *   the item stays under the pointer.
 * - `"snap"`: the gap opens and the item itself glides into it (for a target
 *   with a slot; one without keeps the indicator).
 *
 * Every mode follows the same intent: what shows, when, and what a release
 * lands on are the drag intent's, so a drop always lands where the preview
 * showed it.
 */
export type DragPreview = "indicator" | "gap" | "snap";

/** The preview a drag uses unless the host picks another. */
export const DRAG_PREVIEW_DEFAULT: DragPreview = "snap";

/** What to draw for one frame of a drag. */
export interface PreviewPlan {
  /** Draw the indicator on the shown target. */
  readonly showIndicator: boolean;
  /** Lay the others out around the room (the gap is open). */
  readonly makeRoom: boolean;
  /** Draw the item in its slot instead of under the pointer. */
  readonly snapItem: boolean;
}

/**
 * The plan for a frame of the drag intent under `preview`. `slotted` says
 * whether the shown target's drop has a slot the item can sit in (default: a
 * target that isn't `free`); only such a target snaps, and in `"snap"` it
 * previews with the item rather than the indicator.
 *
 * - `"indicator"`: the indicator, never room, never a snap.
 * - `"gap"`: the indicator, and room when the intent makes it.
 * - `"snap"`: room when the intent makes it, the item snapped into a slotted
 *   target's room; the indicator only for a target without a slot.
 */
export function previewPlan<T extends DragTarget>(
  frame: Pick<DragFrame<T>, "shown" | "room">,
  preview: DragPreview,
  slotted: boolean = !!frame.shown && !frame.shown.free,
): PreviewPlan {
  const shown = !!frame.shown;
  if (preview === "indicator") return { showIndicator: shown, makeRoom: false, snapItem: false };
  if (preview === "gap") return { showIndicator: shown, makeRoom: frame.room, snapItem: false };
  // By design a slotted target draws nothing until the room opens (`roomAfter`); a release then still lands on it.
  return { showIndicator: shown && !slotted, makeRoom: frame.room, snapItem: frame.room && shown && slotted };
}
