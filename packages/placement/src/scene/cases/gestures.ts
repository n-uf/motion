/**
 * Short constructors for gestures, so a row reads as what a user does: `g.press("pages")`, `g.to(place)`,
 * `g.release()`. Each returns a plain `Gesture`; nothing here is needed to read or play a row.
 */
import type { Point } from "../../geometry";
import type { ScenePlace } from "../index";
import type { Gesture } from "./types";

const gap = (edge: string, at: number, zone: "start" | "center" | "end" = "start"): ScenePlace => ({ kind: "gap", edge, zone, at });

export const g = {
  /** Pointer down on the item's handle; `point` is relative to its top-left corner. */
  press: (item: string, point?: Point): Gesture => ({ type: "press", item, ...(point ? { point } : {}) }),
  /** The pointer moves to the target at `place`. */
  to: (place: ScenePlace): Gesture => ({ type: "move", place }),
  /** The pointer moves to `point` (stage px). */
  at: (x: number, y: number): Gesture => ({ type: "move", point: { x, y } }),
  hold: (ms = 120): Gesture => ({ type: "hold", ms }),
  release: (): Gesture => ({ type: "release" }),
  escape: (): Gesture => ({ type: "key", key: "Escape" }),
  key: (key: string): Gesture => ({ type: "key", key }),
  /** The item's control (`key`), or with none, a click that opens or unfolds it. */
  click: (item: string, key?: string): Gesture => ({ type: "click", item, ...(key ? { key } : {}) }),
  /** The "Move to ›" row for `place`. */
  moveTo: (item: string, place: ScenePlace): Gesture => ({ type: "click", item, place }),
  /** The user's size across an edge. */
  resizeEdge: (edge: string, size: number): Gesture => ({ type: "resize", edge, size }),
  /** The item's measured length changed by `size` px. */
  resizeItem: (item: string, size: number): Gesture => ({ type: "resize", item, size }),
  /** The stage is now `width` x `height`. */
  resizeWindow: (width: number, height: number): Gesture => ({ type: "resize", point: { x: width, y: height } }),
  scroll: (dy: number): Gesture => ({ type: "scroll", size: dy }),
  /** A place: before the `at`-th item of an edge's zone. */
  gap,
  column: (side: "left" | "right", ring: number): ScenePlace => ({ kind: "column", side, ring }),
  rail: (side: "left" | "right", ring = 0): ScenePlace => ({ kind: "rail", side, ring }),
  float: { kind: "float" } as ScenePlace,
  home: { kind: "home" } as ScenePlace,
  /** Press, aim at `place`, rest, let go. */
  drag: (item: string, place: ScenePlace, grab?: Point): Gesture[] => [
    { type: "press", item, ...(grab ? { point: grab } : {}) },
    { type: "move", place },
    { type: "hold", ms: 120 },
    { type: "release" },
  ],
};
