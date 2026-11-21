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
import { createFrameLoop, createLayoutMotion, createSettle, motionValue, SETTLE_TEMPO, type Animatable, type Animator, type Drawable, type FrameLoop, type LayoutMotion, type MotionValue, type Rect, type Settle, type Widen } from "@n-uf/motion";
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
/** A settle at the current tempo that follows tempo changes (the page's few long-lived settles: the hero, the chip). */
export function newSettle<T extends Animatable>(initial: T): Settle<Widen<T>> {
  const s = createSettle(initial, { omega: omega() });
  live.add(s as unknown as Settle<Animatable>);
  return s;
}

/** True while the user asks for reduced motion (read on each call). */
export const reduced: () => boolean = prefersReducedMotion();

/**
 * Step `animator` on the site's loop (the write phase) as a `motionValue`, hand each value to `draw`, and call `done`
 * once it rests. Under reduced motion it snaps to its target at once. The animator stays the caller's (its tempo is
 * `configure`d on it). Returns a stop function.
 */
export function drive<T>(animator: Animator<T>, draw: (value: T) => void, done?: () => void): () => void {
  const value = motionValue(loop, animator, { phase: "write", reducedMotion: reduced }) as MotionValue<T>;
  value.subscribe(draw);
  value.onSettle(() => {
    value.dispose();
    done?.();
  });
  draw(animator.value);
  if (reduced()) {
    value.snap();
    return () => {};
  }
  if (!animator.settled) return () => value.dispose();
  // Already at rest: say so on the next frame, as a step that finds nothing to do.
  const cancel = loop.schedule("write", () => value.snap());
  return () => {
    cancel();
    value.dispose();
  };
}

/** A layout item that draws nothing itself: the field's `draw` gets every rect. */
const unseen: Drawable = { layOut: () => {}, draw: () => {} };

/**
 * A set of keyed rects that settle toward new targets, one `createLayoutMotion` item per key on the site's loop (the
 * write phase, the live tempo, reduced motion). `set` takes the new layout; rects already known launch from where
 * they are drawn, new ones appear at their place, ones that left are dropped. `draw` gets every rect, once a frame
 * while any moves.
 */
export function rectField(draw: (rects: Map<string, Rect>) => void): { set(targets: Map<string, Rect>, animate?: boolean): void } {
  const motion: LayoutMotion = createLayoutMotion({
    loop,
    omega: omega(),
    phase: "write",
    reducedMotion: reduced,
    onDraw: () => drawAll(),
  });
  /** Every item's drawn rect, handed to `draw`. */
  function drawAll(): void {
    const rects = new Map<string, Rect>();
    motion.items.forEach((item, key) => rects.set(key, item.drawn));
    draw(rects);
  }
  // A change of tempo reaches every item, in flight too (the speed rides on the loop's clock).
  onMotionChange(() => motion.configure({ omega: omega() }));
  return {
    set(targets, animate = true) {
      motion.retain(targets.keys());
      targets.forEach((r, key) => {
        const item = motion.get(key);
        if (!item) motion.add(key, unseen, r);
        else if (animate) item.moveTo(r);
        else item.jumpTo(r);
      });
      // Every set ends in a draw of the whole layout: the batch draws only items that changed, and an item that left
      // (or one whose target did not change) marks nothing, so the picture would keep what is gone.
      if (motion.items.size === 0) drawAll();
      else {
        motion.items.forEach((item) => item.redraw());
        motion.flush();
      }
    },
  };
}
