/**
 * Driving a dossier from a scenario: real pointer and key events (pointer events in client coordinates, so a scaled
 * page's conversion is on the path), and reading back what the page drew.
 */
import type { Point, Rect } from "@n-uf/motion";
import { nextFrame } from "../shared/geometry";
import type { Dossier, GroupId } from "./dossier";

export const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export const fmt = (r: Rect | null): string => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}` : "none");
/** The largest difference of any edge or size, px. */
export const off = (a: Rect, b: Rect): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));

export async function settle(d: Dossier): Promise<void> {
  await nextFrame();
  await d.idle();
  await nextFrame();
}

/** A pointer event at client point `c`; `extra` adds to it (a held modifier: `{ altKey: true }`). */
export function pointer(type: string, on: EventTarget, c: Point, extra: PointerEventInit = {}): void {
  on.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1, clientX: c.x, clientY: c.y, ...extra }),
  );
}

export function keyOn(on: EventTarget, key: string, extra: KeyboardEventInit = {}): void {
  on.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
  on.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...extra }));
}

/** What a frame of a drag drew: the pointer (page space), the slot, the dragged group, the slot's label if any. */
export interface Seen {
  readonly t: number;
  readonly p: Point;
  readonly slot: Rect | null;
  readonly item: Rect;
  readonly vertical: boolean;
}

/**
 * Drag `g` by its handle to `to` (page space) at an aiming pace, hold there `holdMs`, release. Every frame after the
 * lift is recorded from what the page drew. Returns the frames, when the hold began, and where the pointer started.
 */
export async function drag(d: Dossier, g: GroupId, to: Point, holdMs = 650): Promise<{ seen: Seen[]; holdFrom: number; start: Point }> {
  const h = d.handle(g);
  const start = mid(d.drawn(h));
  const travel = Math.max(16, Math.hypot(to.x - start.x, to.y - start.y) / 0.8);
  const total = travel + holdMs;
  pointer("pointerdown", h, d.toClient(start));
  const seen: Seen[] = [];
  const t0 = performance.now();
  let p = start;
  for (;;) {
    await nextFrame();
    const t = Math.min(performance.now() - t0, total);
    const k = Math.min(1, t / travel);
    p = { x: start.x + (to.x - start.x) * k, y: start.y + (to.y - start.y) * k };
    pointer("pointermove", window, d.toClient(p));
    if (d.dragging()) seen.push({ t, p, slot: d.slot(), item: d.drawn(d.groupEl(g)), vertical: d.groupEl(g).classList.contains("v") });
    if (t >= total) break;
  }
  pointer("pointerup", window, d.toClient(p));
  return { seen, holdFrom: travel, start };
}
