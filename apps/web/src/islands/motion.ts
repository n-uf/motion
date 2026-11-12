/**
 * The site's motion: one frame loop on the browser clock, and small helpers that drive @n-uf/motion's settle. Every
 * glide on the site goes through here, so reduced motion, the playback speed and the tempo apply in one place.
 *
 * - **Speed** (slow motion, ¼× · ½× · 1×) scales the clock the loop is injected with, so every time-driven motion
 *   slows together: settles, reveals, landings, glides, the showcases. Pointer-following is not time-driven and stays
 *   1:1. The drag model's timing rules (aim, hold, room) and the showcase pause keep real time: they read
 *   `performance.now()`, not this clock. CSS fades follow through `--time-scale`.
 * - **Tempo** (calm 20 · default 25 · quick 37, SETTLE_TEMPO) is the settles' omega. A change re-tempos every live
 *   settle in flight, from where it is drawn, with no jump.
 */
import { createFrameLoop, createSettle, SETTLE_TEMPO, type Animatable, type Animator, type FrameLoop, type Point, type Rect, type Settle, type Widen } from "@n-uf/motion";
import { createBrowserClock, prefersReducedMotion } from "@n-uf/motion/browser";

// ---- Speed: a scaled clock ----------------------------------------------------------------------------------------------
export const SPEEDS = [0.25, 0.5, 1] as const;
export type Speed = (typeof SPEEDS)[number];
const load = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const save = (key: string, v: string): void => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage blocked: the choice lasts for this page */
  }
};
let speed: number = SPEEDS.includes(Number(load("motion-speed")) as Speed) ? Number(load("motion-speed")) : 1;
const base = createBrowserClock();
let virtual = base.now(), lastReal = virtual;
/** The site's clock in ms: real time scaled by the speed, integrated, so a speed change never jumps. */
export function virtualNow(): number {
  const r = base.now();
  virtual += (r - lastReal) * speed;
  lastReal = r;
  return virtual;
}
export const loop: FrameLoop = createFrameLoop({ clock: { ...base, now: virtualNow } });

const listeners = new Set<() => void>();
/** Call `f` when the speed or the tempo changes. */
export const onMotionChange = (f: () => void): void => void listeners.add(f);
const timeScale = (): void => {
  if (typeof document !== "undefined") document.documentElement.style.setProperty("--time-scale", String(1 / speed));
};
timeScale();
export const getSpeed = (): number => speed;
export function setSpeed(s: number): void {
  virtualNow(); // close the interval at the old speed
  speed = s;
  save("motion-speed", String(s));
  timeScale();
  listeners.forEach((f) => f());
}

// ---- Tempo: the omega of every live settle -------------------------------------------------------------------------------
export type Tempo = keyof typeof SETTLE_TEMPO;
let tempo: Tempo = ((t) => (t === "calm" || t === "quick" ? t : "default"))(load("motion-tempo"));
const live = new Set<Settle<Animatable>>();
export const getTempo = (): Tempo => tempo;
export const omega = (): number => SETTLE_TEMPO[tempo];
export function setTempo(t: Tempo): void {
  tempo = t;
  save("motion-tempo", t);
  // In flight: the value and velocity carry on, re-clamped to the new tempo (Settle.configure).
  live.forEach((s) => s.configure({ omega: omega() }));
  listeners.forEach((f) => f());
}
/** A settle at the current tempo that follows tempo changes until `forget`. */
export function newSettle<T extends Animatable>(initial: T): Settle<Widen<T>> {
  const s = createSettle(initial, { omega: omega() });
  live.add(s as unknown as Settle<Animatable>);
  return s;
}
export const forget = (s: Settle<unknown>): void => void live.delete(s as unknown as Settle<Animatable>);

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
export function glideFrom(el: HTMLElement | SVGElement, dx: number, dy: number): void {
  glides.get(el)?.();
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    el.style.transform = "";
    return;
  }
  const s: Settle<Point> = newSettle<Point>({ x: dx, y: dy });
  s.setTarget({ x: 0, y: 0 });
  const end = (): void => {
    forget(s);
    glides.delete(el);
  };
  const stop = drive(s, (p) => (el.style.transform = p.x === 0 && p.y === 0 ? "" : `translate(${p.x}px, ${p.y}px)`), end);
  glides.set(el, () => {
    stop();
    end();
  });
}

/** Measure `els`, run `change`, then glide each one still connected from where it was drawn. */
export function flip(els: Iterable<HTMLElement>, change: () => void): void {
  const before = new Map<HTMLElement, DOMRect>();
  for (const el of els) before.set(el, el.getBoundingClientRect());
  change();
  before.forEach((a, el) => {
    if (!el.isConnected) return;
    const b = el.getBoundingClientRect();
    glideFrom(el, a.left - b.left, a.top - b.top);
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

  constructor(private readonly draw: (rects: Map<K, Rect>) => void) {}

  set(targets: Map<K, Rect>, animate = true): void {
    for (const key of [...this.settles.keys()]) {
      if (targets.has(key)) continue;
      forget(this.settles.get(key)!);
      this.settles.delete(key);
    }
    targets.forEach((r, key) => {
      const s = this.settles.get(key);
      if (!s || !animate) {
        if (s) forget(s);
        this.settles.set(key, newSettle<Rect>({ ...r }));
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
