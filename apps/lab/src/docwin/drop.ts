/**
 * What the window records of the last drop: the item, the target it landed on and the rects (what the checks read),
 * and the calls the drop made on the DockState's API (what the Code view writes out): the options the lanes were asked
 * with, where the pointer held the item, the lane and the spot released on, the place that commits.
 */
import type { Point, Rect } from "@n-uf/placement";
import type { DockDrop } from "@n-uf/docking";
import type { ItemId } from "./model";

/** The settings a drag's `lanes()` / `targets()` calls ran with (`DockLaneOptions`), as the window used them. */
export interface DragSettings {
  /** How far the first and last gaps of a bar reach past its ends, px. */
  readonly endReach: number;
  /** The float target starts from the held item's rect. */
  readonly floatFromHeld: boolean;
  /** How a bar's or a toolbar rail's free stretches take a toolbar: where the hand holds it, or a spot every `pitch`. */
  readonly stretchPositions: "free" | "pitched";
  /** The pitch of the spots, px; counts under `"pitched"` only. */
  readonly pitch: number;
  /** How near a stretch's end or the item's own place a landing snaps there, px; counts under `"free"` only. */
  readonly snapDistance: number;
}

/** The calls one drop made. */
export interface DropCall {
  /** `lanes()` under the landing model (the window's own rules), or `targets()` under the published rules. */
  readonly via: "lanes" | "targets";
  readonly settings: DragSettings;
  /** The pointer at release and where it held the item (from its top-left corner), window px. */
  readonly pointer: Point;
  readonly grab: Point;
  /** Under `lanes()`: the lane and the spot released on (spot ids name their lane), and whether the spot slides. */
  readonly lane: string | null;
  readonly spot: string | null;
  readonly slides: boolean;
  /** On a sliding spot, where the landing model's release said the landing starts along the lane (`release().at`), else null. */
  readonly at: number | null;
  /** The id of the target that committed (a spot's, the float's, a gap's), or null. */
  readonly target: string | null;
  /** The place that target commits, or null. */
  readonly placeOf: DockDrop["place"] | null;
  /** The refusal the release was over (a release there commits nothing), or null. */
  readonly refusal: string | null;
  /** The release was on the item's own place: nothing to commit. */
  readonly home: boolean;
}

export interface LastDrop {
  readonly id: ItemId;
  /** The target released on (a home or none target commits nothing), or null. */
  readonly target: string | null;
  readonly place: DockDrop["place"]["kind"] | null;
  /** The rect the preview showed on the last frame (the dashed slot), and the rect after the drop. */
  readonly preview: Rect | null;
  readonly landed: Rect | null;
  readonly committed: boolean;
  readonly cancelled: boolean;
  /** The calls it made, for the Code view. */
  readonly call: DropCall;
}
