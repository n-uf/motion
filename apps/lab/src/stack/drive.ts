/**
 * Drives a Stack page with real pointer and key events, as a person would: a press on a grip, a glide that flies most
 * of the way and aims the last 24 px slowly (so the drag intent shows its preview), a release, Escape and Alt. Points
 * are in the page's stage px, which may lie outside the stage (a pointer past its edge). One driver per stage.
 */
import type { Rect } from "@n-uf/motion";
import { nextFrame, type Point } from "../shared/geometry";
import type { ItemId } from "./sample";

export function createDriver(stage: HTMLElement) {
  let at: Point = { x: 0, y: 0 };
  const origin = (): { left: number; top: number } => {
    const r = stage.getBoundingClientRect();
    return { left: r.left + stage.clientLeft, top: r.top + stage.clientTop };
  };

  function pointer(type: string, q: Point, target: EventTarget = window, extra: PointerEventInit = {}): void {
    const o = origin();
    at = q;
    target.dispatchEvent(
      new PointerEvent(type, { clientX: o.left + q.x, clientY: o.top + q.y, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true, pointerType: "mouse", ...extra }),
    );
  }
  const frames = async (n: number): Promise<void> => {
    for (let i = 0; i < n; i++) await nextFrame();
  };
  async function glide(to: Point, step: number): Promise<void> {
    const from = at;
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let i = 1; i <= n; i++) {
      pointer("pointermove", { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
      await nextFrame();
    }
  }
  /** Fly most of the way, then aim: the last 24 px slowly. */
  async function approach(to: Point): Promise<void> {
    const d = Math.hypot(to.x - at.x, to.y - at.y);
    if (d > 24) await glide({ x: to.x - ((to.x - at.x) * 24) / d, y: to.y - ((to.y - at.y) * 24) / d }, 14);
    await glide(to, 2);
  }
  async function until(cond: () => boolean, max = 150): Promise<boolean> {
    for (let i = 0; i < max; i++) {
      if (cond()) return true;
      await nextFrame();
    }
    return cond();
  }
  const domRect = (el: Element): Rect => {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left - stage.clientLeft, y: r.top - s.top - stage.clientTop, width: r.width, height: r.height };
  };

  return {
    pointer,
    frames,
    glide,
    approach,
    until,
    domRect,
    /** Where the pointer last was (stage px). */
    get at() {
      return at;
    },
    /** Press on `el` (a grip) `dx`, `dy` px from its top-left corner, Alt held or not; returns where. */
    async press(el: HTMLElement, dx = 8, dy?: number, alt = false): Promise<Point> {
      const g = domRect(el);
      const start = { x: g.x + Math.min(dx, Math.max(0, g.width - 1)), y: g.y + (dy === undefined ? g.height / 2 : Math.min(dy, Math.max(0, g.height - 1))) };
      pointer("pointerdown", start, el, alt ? { altKey: true } : {});
      await nextFrame();
      at = start;
      return start;
    },
    async release(): Promise<void> {
      pointer("pointerup", at);
      await frames(2);
    },
    escape(): void {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    },
    /** Alt down or up, as the window sees it. */
    alt(down: boolean): void {
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: "Alt", altKey: down, bubbles: true }));
    },
  };
}
export type Driver = ReturnType<typeof createDriver>;

/** What the aiming helpers read of a board: the drag in flight and the dashed preview. */
export interface Aimable {
  readonly dragging: { readonly room: string | null; readonly shown: string | null } | null;
  readonly ind: HTMLElement;
  itemEl(id: ItemId): HTMLElement | undefined;
  gripOf(id: ItemId): HTMLElement | undefined;
}

/** Lift an item and aim it: for a float (no room is made) or a docked place (the others have made room). */
export function aimers(d: Driver, b: Aimable) {
  return {
    /** Press `id` at (`dx`, `dy`) in its grip, Alt held or not; returns the grab offset in the item. */
    async lift(id: ItemId, dx: number, dy: number, alt = false): Promise<Point> {
      const home = d.domRect(b.itemEl(id)!);
      const start = await d.press(b.gripOf(id)!, dx, dy, alt);
      return { x: start.x - home.x, y: start.y - home.y };
    },
    async float(to: Point): Promise<boolean> {
      await d.approach(to);
      return d.until(() => b.dragging?.shown === "float" && !b.ind.hidden);
    },
    async dock(to: Point): Promise<boolean> {
      await d.approach(to);
      return d.until(() => !!b.dragging && !b.ind.hidden && b.dragging.room !== null && b.dragging.room === b.dragging.shown);
    },
  };
}
