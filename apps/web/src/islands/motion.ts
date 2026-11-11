/**
 * The site's motion: one frame loop on the browser clock, and small helpers
 * that drive @n-uf/motion's settle. Every glide on the site goes through here,
 * so reduced motion is honoured in one place.
 */
import { createFrameLoop, createSettle, type Animator, type FrameLoop, type Point, type Rect, type Settle } from "@n-uf/motion";
import { createBrowserClock, prefersReducedMotion } from "@n-uf/motion/browser";

export const loop: FrameLoop = createFrameLoop({ clock: createBrowserClock() });

/** True while the user asks for reduced motion (read on each call). */
export const reduced: () => boolean = prefersReducedMotion();

/**
 * Step `animator` every frame and hand its value to `draw`, until it rests.
 * Under reduced motion it snaps to its target at once. Returns a stop function.
 */
export function drive<T>(animator: Animator<T>, draw: (value: T) => void, done?: () => void): () => void {
  if (reduced()) {
    animator.snap();
    draw(animator.value);
    done?.();
    return () => {};
  }
  draw(animator.value);
  return loop.repeat("write", (frame) => {
    const moving = animator.step(frame.delta);
    draw(animator.value);
    if (!moving) {
      done?.();
      return false;
    }
    return true;
  });
}

const glides = new WeakMap<Element, () => void>();

/**
 * A FLIP glide: the element was just laid out at its new place, and was drawn
 * `dx`, `dy` away from it. It settles from there to its place (from where it is
 * drawn, so a glide in flight carries on instead of restarting).
 */
export function glideFrom(el: HTMLElement | SVGElement, dx: number, dy: number, omega?: number): void {
  glides.get(el)?.();
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    el.style.transform = "";
    return;
  }
  const s: Settle<Point> = createSettle<Point>({ x: dx, y: dy }, omega ? { omega } : {});
  s.setTarget({ x: 0, y: 0 });
  const stop = drive(
    s,
    (p) => (el.style.transform = p.x === 0 && p.y === 0 ? "" : `translate(${p.x}px, ${p.y}px)`),
    () => glides.delete(el),
  );
  glides.set(el, () => {
    stop();
    glides.delete(el);
  });
}

/** Measure `els`, run `change`, then glide each one still connected from where it was drawn. */
export function flip(els: Iterable<HTMLElement>, change: () => void, omega?: number): void {
  const before = new Map<HTMLElement, DOMRect>();
  for (const el of els) before.set(el, el.getBoundingClientRect());
  change();
  before.forEach((a, el) => {
    if (!el.isConnected) return;
    const b = el.getBoundingClientRect();
    glideFrom(el, a.left - b.left, a.top - b.top, omega);
  });
}

/**
 * A set of keyed rects that settle toward new targets. `set` takes the new
 * layout; rects already known launch from where they are drawn, new ones
 * appear at their place. `draw` gets every rect each frame.
 */
export class RectField<K> {
  private readonly settles = new Map<K, Settle<Rect>>();
  private stop: (() => void) | null = null;

  constructor(
    private readonly draw: (rects: Map<K, Rect>) => void,
    private readonly omega = 25,
  ) {}

  set(targets: Map<K, Rect>, animate = true): void {
    for (const key of [...this.settles.keys()]) if (!targets.has(key)) this.settles.delete(key);
    targets.forEach((r, key) => {
      const s = this.settles.get(key);
      if (!s || !animate) {
        this.settles.set(key, createSettle<Rect>({ ...r }, { omega: this.omega }));
        return;
      }
      s.setTarget({ ...r });
    });
    this.run();
  }

  current(): Map<K, Rect> {
    const out = new Map<K, Rect>();
    this.settles.forEach((s, k) => out.set(k, s.value));
    return out;
  }

  private run(): void {
    this.stop?.();
    this.stop = null;
    const all = [...this.settles.values()];
    if (reduced() || all.every((s) => s.settled)) {
      all.forEach((s) => s.snap());
      this.draw(this.current());
      return;
    }
    this.draw(this.current());
    this.stop = loop.repeat("write", (frame) => {
      let moving = false;
      for (const s of this.settles.values()) if (s.step(frame.delta)) moving = true;
      this.draw(this.current());
      if (!moving) this.stop = null;
      return moving;
    });
  }
}
