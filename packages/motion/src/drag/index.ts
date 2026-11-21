/**
 * `@n-uf/motion/drag`: the drag intent model (when a drop indicator shows,
 * which target, when the others make room, what a release lands on), the lift
 * and grip rules, preview plans, and the landing model (lanes and spots), with
 * the shapes they use (`Point`, `Rect`). Pure: the host feeds points and
 * times, and draws what comes back.
 *
 * See docs/motion.md, "The drag and landing model".
 */
export {
  createDragIntent,
  DRAG_DEFAULTS,
  inRect,
  liftDecision,
  pickRank,
  REFUSAL_RANK,
  targetAt,
  type DragFrame,
  type DragIntent,
  type DragIntentOptions,
  type DragIntentState,
  type DragKeys,
  type DragModifiers,
  type DragTarget,
  type DragTuning,
  type LiftDecision,
} from "./intent";
export { isHeld, type ModifierKey, type Modifiers } from "../keys";
export {
  createLandingModel,
  LANDING_APPROACH,
  LANDING_GATES,
  LANDING_MARGINS,
  LANDING_TOUCH_MARGINS,
  type LandingApproach,
  type LandingFrame,
  type LandingGates,
  type LandingGuide,
  type LandingLane,
  type LandingMargins,
  type LandingMark,
  type LandingModel,
  type LandingOptions,
  type LandingRegion,
  type LandingRegions,
  type LandingRelease,
  type LandingSlide,
  type LandingSpot,
  SNAP_DISTANCE,
} from "./landing";
export { DRAG_PREVIEW_DEFAULT, PLACE_GUIDES_DEFAULT, previewPlan, type DragPreview, type PlaceGuides, type PreviewFrame, type PreviewMode, type PreviewPlan } from "./preview";
export { createGripPress, type GripPress, type GripRelease } from "./grip";
export { guideRects, MIN_BOX_LENGTH, type ClearRect, type GuideRectsOptions, type PlacedGuide } from "./guide-rects";
export type { Point, Rect } from "../shapes";
