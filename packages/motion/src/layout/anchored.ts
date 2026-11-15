import type { Point, Rect } from "../shapes";
import { createSettle, SETTLE_TEMPO, type SettleConfig } from "../values/settle";

/** A width and a height, px. */
export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A box held at a point that changes size about an anchor: the anchor is the spot of the box that sits on the point
 * (a pointer's offset from the box's top-left corner). Its size and its anchor settle together to a new size and the
 * new box's anchor ({@link AnchoredMorph.to}), from wherever they are drawn, so a retarget mid-flight turns at once,
 * with no jump and no overshoot. At every step the anchor lies exactly on the point ({@link AnchoredMorph.rectAt}): a
 * caller who draws the old and the new content each with its own anchor on the point never moves either from under
 * the pointer, and fades between them by {@link AnchoredMorph.progress}.
 */
export interface AnchoredMorph {
  /** The size now. */
  readonly size: BoxSize;
  /** The anchor now: its offset from the box's top-left corner. */
  readonly anchor: Point;
  /** Where it is heading. */
  readonly target: { readonly size: BoxSize; readonly anchor: Point };
  /** At rest on the target. */
  readonly settled: boolean;
  /**
   * How far along the way from where the last retarget started to the target, 0 to 1 (1 at rest): to fade the content
   * it came from out and the target's in.
   */
  readonly progress: number;
  /** Head for `size` with `anchor` from where it is drawn. The same target again does nothing; true on a change. */
  to(size: BoxSize, anchor: Point): boolean;
  /** Be at `size` with `anchor` now, at rest. */
  jumpTo(size: BoxSize, anchor: Point): void;
  /** Advance by `dtMs` milliseconds; true while still moving. */
  step(dtMs: number): boolean;
  /** The box now with its anchor on `point`. */
  rectAt(point: Point): Rect;
}

/**
 * The default tempo, a quick settle (`SETTLE_TEMPO.quick`): 90 % of the way in about 60 ms, within 1 % in about
 * 125 ms; the last pixels take longer for large size changes (a 300 px change rests after about 225 ms).
 */
export const MORPH_TEMPO = SETTLE_TEMPO.quick;

/** A box of `size` held at `anchor`, at rest; `config` is the settle's (default tempo {@link MORPH_TEMPO}). */
export function anchoredMorph(size: BoxSize, anchor: Point, config: SettleConfig = {}): AnchoredMorph {
  // One settle over the four numbers, as a rect: x, y the anchor, width and height the size.
  const pack = (s: BoxSize, a: Point): Rect => ({ x: finite(a.x), y: finite(a.y), width: Math.max(0, finite(s.width)), height: Math.max(0, finite(s.height)) });
  const settle = createSettle<Rect>(pack(size, anchor), { omega: MORPH_TEMPO, ...config });
  let from: Rect = settle.value;
  const gap = (a: Rect, b: Rect): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
  return {
    get size() {
      const v = settle.value;
      return { width: v.width, height: v.height };
    },
    get anchor() {
      const v = settle.value;
      return { x: v.x, y: v.y };
    },
    get target() {
      const t = settle.target;
      return { size: { width: t.width, height: t.height }, anchor: { x: t.x, y: t.y } };
    },
    get settled() {
      return settle.settled;
    },
    get progress() {
      const whole = gap(from, settle.target);
      if (settle.settled || whole < 1e-9) return 1;
      return Math.min(1, Math.max(0, 1 - gap(settle.value, settle.target) / whole));
    },
    to(s, a) {
      const goal = pack(s, a);
      if (gap(goal, settle.target) < 0.01) return false;
      from = settle.value;
      settle.setTarget(goal);
      return true;
    },
    jumpTo(s, a) {
      settle.jumpTo(pack(s, a));
      from = settle.value;
    },
    step(dt) {
      return settle.step(dt);
    },
    rectAt(p) {
      const v = settle.value;
      return { x: p.x - v.x, y: p.y - v.y, width: v.width, height: v.height };
    },
  };
}

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);
