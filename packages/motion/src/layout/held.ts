import type { Point, Rect } from "../shapes";
import type { LayoutItem } from "./motion";

/**
 * An item held by a pointer: the real item (no copy) follows the pointer 1:1 from where it was grabbed, at the size
 * it was lifted at; its place stays reserved (that is the caller's layout). Then:
 *
 * - {@link HeldDrag.snapTo}: glide into a slot (a snap preview); `null` leaves the slot and glides back to the
 *   pointer, following it as it moves ({@link HeldDrag.follow} once a frame), until it is under it again.
 * - {@link HeldDrag.land}: let go into a slot: the landing settles from where it was let go (the release rect), never
 *   from its old home. Snapped into that slot already, it simply finishes that glide.
 * - {@link HeldDrag.cancel}: let go with no drop: it glides home from where it was let go.
 * - {@link HeldDrag.preview}: the three drop previews, per frame: indicator and gap keep the item under the pointer
 *   (gap with the caller's room open), snap glides it into the slot; leaving glides it back to the pointer.
 * - {@link HeldDrag.resize}: the item takes a new size mid-drag (its content laid out anew by the caller): it settles
 *   to it from where it is drawn, the size revealed (never stretched), and is held 1:1 again once there.
 */
export interface HeldDrag {
  /** Where the pointer is (null before the first move). */
  readonly pointer: Point | null;
  /** Where the pointer holds the item: the pointer less the grab offset, at the held size (lifted, or resized). */
  readonly held: Rect | null;
  /** The slot it sits in (a snap), or null. */
  readonly snapped: Rect | null;
  /** It left a slot (or took a new size) and is gliding back to the pointer. */
  readonly returning: boolean;
  /** The pointer moved: held 1:1 (unless it sits in a slot or is on its way back). */
  move(pointer: Point): void;
  /**
   * Into `slot` (a glide from where it is drawn; the same slot again does nothing), or out of the slot it sits in
   * (`null`: back to the pointer). Returns what changed: `"snapped"`, `"left"`, or null.
   */
  snapTo(slot: Rect | null): "snapped" | "left" | null;
  /** Once a frame: on its way back, retarget to the pointer; true on the frame it is under the pointer again. */
  follow(): boolean;
  /**
   * Once a frame, a drop preview's part for the item (`plan`: `@n-uf/motion/drag`'s `previewPlan`, or any
   * `{ snapItem }`): with `snapItem` it glides into `slot` (snap); else it stays under the pointer, or glides back to
   * it from a slot it left (indicator, gap). The room, if the plan makes any, is the caller's layout. In place of
   * {@link HeldDrag.snapTo} and {@link HeldDrag.follow}; returns what changed.
   */
  preview(plan: { readonly snapItem: boolean }, slot: Rect | null): "snapped" | "left" | null;
  /**
   * Hold it at `size` from now on (the caller has laid its content out for that size). The grab point keeps its share
   * of the item, so the pointer stays on the same spot of it; the item settles from where it is drawn to its new held
   * rect (its size revealed, never stretched), then is held 1:1 again ({@link HeldDrag.follow} once a frame). In a
   * slot it stays there, taking the new size when it leaves. The same size again does nothing; returns true on a
   * change.
   */
  resize(size: { readonly width: number; readonly height: number }): boolean;
  /** Let go into `slot`: returns the release rect, where the landing starts. */
  land(slot: Rect): Rect;
  /** Let go with no drop: glides `home` from the release rect, which it returns. */
  cancel(home: Rect): Rect;
}

/** How close (px, every component) the way back has to come to count as under the pointer again. */
const CAUGHT = 0.5;

/** Hold `item` from the pointer at `grab` (the pointer's offset from its top-left corner), at its drawn size now. */
export function holdItem(item: LayoutItem, grab: Point): HeldDrag {
  let size = { width: item.drawn.width, height: item.drawn.height };
  let at = { x: grab.x, y: grab.y };
  let pointer: Point | null = null;
  let snapped: Rect | null = null;
  let returning = false;
  const heldRect = (): Rect | null => (pointer ? { x: pointer.x - at.x, y: pointer.y - at.y, width: size.width, height: size.height } : null);
  const same = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.01;
  const snapTo = (slot: Rect | null): "snapped" | "left" | null => {
    if (slot) {
      if (snapped && same(snapped, slot)) return null;
      snapped = { ...slot };
      returning = false;
      item.moveTo(slot);
      return "snapped";
    }
    if (!snapped) return null;
    snapped = null;
    returning = true;
    return "left";
  };
  const follow = (): boolean => {
    const goal = heldRect();
    if (!returning || !goal) return false;
    // A chase of the pointer: retargeted every frame, laid out again only when its size changes (an item without
    // retarget, from before it or a test double, moves to it).
    if (item.retarget) item.retarget(goal);
    else item.moveTo(goal);
    const d = item.drawn;
    if (Math.max(Math.abs(d.x - goal.x), Math.abs(d.y - goal.y), Math.abs(d.width - goal.width), Math.abs(d.height - goal.height)) >= CAUGHT) return false;
    returning = false;
    item.hold(goal);
    return true;
  };
  const letGo = (to: Rect): Rect => {
    const release = { ...item.drawn };
    snapped = null;
    returning = false;
    item.moveTo(to);
    return release;
  };
  return {
    get pointer() {
      return pointer;
    },
    get held() {
      return heldRect();
    },
    get snapped() {
      return snapped;
    },
    get returning() {
      return returning;
    },
    move(p) {
      pointer = { x: p.x, y: p.y };
      if (snapped || returning) return;
      item.hold(heldRect()!);
    },
    snapTo,
    follow,
    preview(plan, slot) {
      const change = snapTo(plan.snapItem && slot ? slot : null);
      follow();
      return change;
    },
    resize(next) {
      if (Math.abs(next.width - size.width) < 0.01 && Math.abs(next.height - size.height) < 0.01) return false;
      at = { x: size.width ? (at.x / size.width) * next.width : 0, y: size.height ? (at.y / size.height) * next.height : 0 };
      size = { width: next.width, height: next.height };
      if (!snapped && pointer) {
        returning = true;
        follow();
      }
      return true;
    },
    land: letGo,
    cancel: letGo,
  };
}
