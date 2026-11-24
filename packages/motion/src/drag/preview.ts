import type { Rect } from "../shapes";
import type { DragFrame, DragTarget } from "./intent";
import type { LandingRegion } from "./region";

/**
 * How a drag previews its drop, from least to most motion while dragging. One vocabulary for both drag models (the
 * intent and the landing model):
 *
 * - `"outline"`: nothing moves; only the indicator (an outline or an insertion marker) shows the landing.
 * - `"placeholder"`: once the room is made, the others move aside and open the slot; the item stays under the pointer.
 * - `"glide"`: the slot opens and the item itself glides into it (for a landing with a slot; one without keeps the
 *   indicator).
 * - `"snap"`: the dragged item is the only preview: no indicator for any landing. It sits in a slotted landing once
 *   the room is open and otherwise stays on the pointer.
 *
 * Every mode follows the same model: what shows, when, and what a release lands on are the model's, so a drop always
 * lands where the preview showed it.
 */
export type PreviewMode = "outline" | "placeholder" | "glide" | "snap";

/**
 * Place guides: faint marks on the free places that take the held item, shown only while no landing shows. `"off"`:
 * none; `"near"`: the places of the edge the pointer approaches; `"all"`: every place, from the lift.
 */
export type PlaceGuides = "off" | "near" | "all";

/** A drag's preview: its mode and its place guides (default per mode, {@link PLACE_GUIDES_DEFAULT}). */
export interface DragPreview {
  readonly mode: PreviewMode;
  readonly placeGuides?: PlaceGuides;
}

/** The preview a drag uses unless the host picks another. */
export const DRAG_PREVIEW_DEFAULT: DragPreview = { mode: "glide" };

/** Each mode's place guides when it names none: Snap and Placeholder near, Outline and Glide none. */
export const PLACE_GUIDES_DEFAULT: Readonly<Record<PreviewMode, PlaceGuides>> = { outline: "off", placeholder: "near", glide: "off", snap: "near" };

/**
 * The place guides a preview asks for: its `placeGuides`, else its mode's default. The one reading of the level:
 * `previewPlan` draws it, and the landing model (`createLandingModel({ preview })`) names its lanes by it.
 */
export function guidesOf(preview: DragPreview | PreviewMode): PlaceGuides {
  const p: DragPreview = typeof preview === "string" ? { mode: preview } : preview;
  return p.placeGuides ?? PLACE_GUIDES_DEFAULT[p.mode];
}

/** What to draw for one frame of a drag. */
export interface PreviewPlan {
  /** Draw the indicator on the shown landing. */
  readonly showIndicator: boolean;
  /** Lay the others out around the room (the gap is open). */
  readonly makeRoom: boolean;
  /** Draw the item in its slot instead of under the pointer. */
  readonly snapItem: boolean;
  /**
   * The place guides to draw this frame: the preview's `placeGuides` while no landing shows (no indicator, no room, no
   * item in its slot), `"off"` whenever one does, so the screen shows where the item can go or where it will land,
   * never both.
   */
  readonly guides: PlaceGuides;
}

/**
 * A frame `previewPlan` reads: the drag intent's (what shows) or the landing model's (where it lands: a
 * `LandingFrame`'s `region`, `landing` and `room`).
 */
export type PreviewFrame<T extends DragTarget = DragTarget> =
  | Pick<DragFrame<T>, "shown" | "room">
  | { readonly region: LandingRegion; readonly landing: Rect | null; readonly room: boolean };

/**
 * The plan for a frame of either drag model under `preview` (a mode alone is `{ mode }`). From an intent's frame a
 * landing shows when a target shows, slotted unless it is `free`; from a landing frame it shows wherever the frame has a
 * landing, slotted in a lane (the float is not). `slotted` overrides that.
 *
 * - `"outline"`: the indicator, never room, never a snap.
 * - `"placeholder"`: the indicator, and room when the model makes it.
 * - `"glide"`: room when the model makes it, the item snapped into a slotted landing's room; the indicator only for a
 *   landing without a slot.
 * - `"snap"`: as `"glide"`, with no indicator at all.
 */
export function previewPlan<T extends DragTarget>(frame: PreviewFrame<T>, preview: DragPreview | PreviewMode, slotted?: boolean): PreviewPlan {
  const p: DragPreview = typeof preview === "string" ? { mode: preview } : preview;
  const landing = "region" in frame;
  const shown = landing ? frame.landing !== null : !!frame.shown;
  const slots = slotted ?? (landing ? frame.region === "lane" : !!frame.shown && !frame.shown.free);
  const plan = planOf(p.mode, shown, frame.room, slots);
  const drawn = plan.showIndicator || plan.makeRoom || plan.snapItem;
  return { ...plan, guides: drawn ? "off" : guidesOf(p) };
}

function planOf(mode: PreviewMode, shown: boolean, room: boolean, slotted: boolean): Omit<PreviewPlan, "guides"> {
  if (mode === "outline") return { showIndicator: shown, makeRoom: false, snapItem: false };
  if (mode === "placeholder") return { showIndicator: shown, makeRoom: room, snapItem: false };
  if (mode === "snap") return { showIndicator: false, makeRoom: room, snapItem: room && shown && slotted };
  // By design a slotted landing draws nothing until the room opens (`roomAfter`); a release then still lands on it.
  return { showIndicator: shown && !slotted, makeRoom: room, snapItem: room && shown && slotted };
}
