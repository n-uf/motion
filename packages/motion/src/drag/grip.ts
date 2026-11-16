import { DOUBLE_CLICK, type DoubleClick } from "../double-click";
import type { Point } from "../shapes";
import { liftDecision, type DragTuning, type LiftDecision } from "./intent";

/** How a press on a grip ended: a click, the second click of a double (`doubleActivate`, not a click), or a drag (`null`). */
export type GripRelease = "click" | "doubleActivate" | null;

/** A press on a grip, start to end: whether it lifts, and what its release is. Pure: positions and times are the host's. */
export interface GripPress {
  /**
   * A press at `point`, `time` ms. `touch` for a finger (the touch lift rule). `clicks`, when the host has the
   * platform's count for this press (a `mousedown`'s `detail`, 1 or more), decides the double instead of the interval.
   */
  down(point: Point, time: number, options?: { readonly touch?: boolean; readonly clicks?: number }): void;
  /** The pointer moved: `liftDecision` for this press. Once `"lift"` it stays a drag; once `"refuse"` it never is. */
  move(point: Point, time: number): LiftDecision;
  /**
   * The press ended. `"click"`, or `"doubleActivate"` when it is the second click of a double (it is not a click
   * then); null when it lifted or was refused. A press that never moved past the lift distance never lifts, so a
   * double never starts a drag. A third click after a double starts a new pair.
   */
  up(point: Point, time: number): GripRelease;
  /** Forget the press and the click before it (a cancelled press, a scroll). */
  cancel(): void;
}

/**
 * A grip's press, double-click included: a press that moves past the lift distance is a drag; one that doesn't is a
 * click, and a second such press within the double interval and distance is a double-activate (the host folds or
 * unfolds, say), never a second click and never a lift.
 */
export function createGripPress(options: { readonly tuning?: Partial<DragTuning>; readonly double?: Partial<DoubleClick> } = {}): GripPress {
  const tuning = options.tuning ?? {};
  // The package's one double click (`DOUBLE_CLICK`), unless the host tunes it.
  const dbl: DoubleClick = { ...DOUBLE_CLICK, ...options.double };
  let press: { at: Point; time: number; touch: boolean; double: boolean; state: LiftDecision } | null = null;
  // The last click (a press that ended as one): where and when it was pressed.
  let last: { at: Point; time: number } | null = null;
  return {
    down(point, time, o = {}) {
      const near = !!last && time - last.time <= dbl.ms && Math.hypot(point.x - last.at.x, point.y - last.at.y) <= dbl.px;
      const double = o.clicks !== undefined && o.clicks > 0 ? o.clicks === 2 : near;
      press = { at: { x: point.x, y: point.y }, time, touch: !!o.touch, double, state: "wait" };
    },
    move(point, time) {
      if (!press) return "wait";
      if (press.state !== "wait") return press.state;
      press.state = liftDecision({ touch: press.touch, distance: Math.hypot(point.x - press.at.x, point.y - press.at.y), elapsed: time - press.time }, tuning);
      return press.state;
    },
    up() {
      const p = press;
      press = null;
      if (!p || p.state !== "wait") {
        last = null;
        return null;
      }
      if (p.double) {
        last = null;
        return "doubleActivate";
      }
      last = { at: p.at, time: p.time };
      return "click";
    },
    cancel() {
      press = null;
      last = null;
    },
  };
}
