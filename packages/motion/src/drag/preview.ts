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
 * - `"item"`: the dragged item is the only preview: no indicator for any
 *   target. It sits in a slotted target once the room is open and otherwise
 *   stays on the pointer. Pair it with the intent's `earlyRelease: "float"`, so
 *   a release lands what shows.
 *
 * Every mode follows the same intent: what shows, when, and what a release
 * lands on are the drag intent's, so a drop always lands where the preview
 * showed it.
 */
export type DragPreview = "indicator" | "gap" | "snap" | "item";

/** The preview a drag uses unless the host picks another. */
export const DRAG_PREVIEW_DEFAULT: DragPreview = "snap";

/**
 * Place guides: faint marks on the free places that take the held item, shown only while no landing shows. `"off"`:
 * none; `"near"`: the places of the edge the pointer approaches; `"all"`: every place, from the lift.
 */
export type PlaceGuides = "off" | "near" | "all";

/**
 * A drop preview as a mode and its place guides, beside the string forms: `"outline"` is `"indicator"`'s plan,
 * `"placeholder"` is `"gap"`'s, and `"snap"` is `"item"`'s (the item the only preview). `placeGuides` defaults per mode
 * ({@link PLACE_GUIDES_DEFAULT}).
 */
export type DropPreviewMode =
  | { readonly mode: "outline"; readonly placeGuides?: PlaceGuides }
  | { readonly mode: "placeholder"; readonly placeGuides?: PlaceGuides }
  | { readonly mode: "snap"; readonly placeGuides?: PlaceGuides };

/** Each mode's place guides when it names none: Snap and Placeholder near, Outline none. */
export const PLACE_GUIDES_DEFAULT: Readonly<Record<DropPreviewMode["mode"], PlaceGuides>> = { outline: "off", placeholder: "near", snap: "near" };

/** The string plan each mode draws with. */
const PLAN_OF: Readonly<Record<DropPreviewMode["mode"], DragPreview>> = { outline: "indicator", placeholder: "gap", snap: "item" };

/** What to draw for one frame of a drag. */
export interface PreviewPlan {
  /** Draw the indicator on the shown target. */
  readonly showIndicator: boolean;
  /** Lay the others out around the room (the gap is open). */
  readonly makeRoom: boolean;
  /** Draw the item in its slot instead of under the pointer. */
  readonly snapItem: boolean;
  /**
   * The place guides to draw this frame: the mode's `placeGuides` while no landing shows (no indicator, no room, no item
   * in its slot), `"off"` whenever one does, so the screen shows where the item can go or where it will land, never
   * both. Always `"off"` for the string forms.
   */
  readonly guides: PlaceGuides;
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
 * - `"item"`: as `"snap"`, with no indicator at all.
 *
 * The object form ({@link DropPreviewMode}) draws with its mode's string plan and adds its place guides (`guides`).
 */
export function previewPlan<T extends DragTarget>(
  frame: Pick<DragFrame<T>, "shown" | "room">,
  preview: DragPreview | DropPreviewMode,
  slotted: boolean = !!frame.shown && !frame.shown.free,
): PreviewPlan {
  if (typeof preview === "object") {
    const plan = stringPlan(frame, PLAN_OF[preview.mode], slotted);
    const asked = preview.placeGuides ?? PLACE_GUIDES_DEFAULT[preview.mode];
    const landing = plan.showIndicator || plan.makeRoom || plan.snapItem;
    return { ...plan, guides: landing ? "off" : asked };
  }
  return stringPlan(frame, preview, slotted);
}

function stringPlan<T extends DragTarget>(frame: Pick<DragFrame<T>, "shown" | "room">, preview: DragPreview, slotted: boolean): PreviewPlan {
  const shown = !!frame.shown;
  if (preview === "indicator") return { showIndicator: shown, makeRoom: false, snapItem: false, guides: "off" };
  if (preview === "gap") return { showIndicator: shown, makeRoom: frame.room, snapItem: false, guides: "off" };
  if (preview === "item") return { showIndicator: false, makeRoom: frame.room, snapItem: frame.room && shown && slotted, guides: "off" };
  // By design a slotted target draws nothing until the room opens (`roomAfter`); a release then still lands on it.
  return { showIndicator: shown && !slotted, makeRoom: frame.room, snapItem: frame.room && shown && slotted, guides: "off" };
}
