import type { FrameInfo, FrameLoop, Phase } from "../clock/frame-loop";
import type { Rect } from "../shapes";
import { popIn, reveal, type PopIn, type RevealFrame } from "../values/reveal";
import { createSettle, SETTLE_TEMPO, type Settle } from "../values/settle";

/**
 * What a {@link Drawable} draws on a frame: where the item is drawn, the box its content is laid out in, how to draw
 * the one at the other without stretching ({@link reveal}), and its appearance ({@link popIn}).
 */
export interface DrawFrame {
  /** Where the item is drawn this frame (its frame: background, border, shadow). */
  readonly drawn: Rect;
  /** The box its content is laid out in: where it is heading, or (held) where it was laid out last. */
  readonly box: Rect;
  /** How to draw `box`'s content at `drawn`: a move, the frame at the drawn size, the content clipped. */
  readonly reveal: RevealFrame;
  /** Its uniform appearance: scale about its centre and opacity. */
  readonly pop: PopIn;
  /** How shown it is, 0 (gone) to 1. */
  readonly shown: number;
  /** All the way gone: hidden and at rest (out of sight and out of the way of the pointer). */
  readonly gone: boolean;
}

/**
 * How an item reaches the screen. The layout motion never measures or touches anything itself: it lays an item's
 * content out once per new box and draws it once per frame through this. {@link domDrawable} writes an element's
 * style; a canvas or a test can draw anything else.
 */
export interface Drawable {
  /** Lay the content out in `box` (its position and size): called once per new box, never per frame. */
  layOut(box: Rect): void;
  /** Draw the item for this frame. */
  draw(frame: DrawFrame): void;
}

/**
 * One item the layout motion moves: give it a new place and it settles there from wherever it is drawn.
 *
 * - {@link LayoutItem.moveTo}: a settle to the new place, retargeted from the drawn rect (no jump, no overshoot);
 *   the content is laid out at the new box at once and the item redrawn at once, so no frame shows the old offset
 *   from the new box.
 * - A size change is revealed: the content is laid out at the target size and the frame clipped, never scaled.
 * - {@link LayoutItem.show}: appear or disappear with a uniform-scale fade.
 */
export interface LayoutItem {
  readonly id: string;
  /** Where it is drawn now. */
  readonly drawn: Rect;
  /** Where it is heading (its settle's target). */
  readonly target: Rect;
  /** The box its content is laid out in. */
  readonly box: Rect;
  /** At rest on its target. */
  readonly settled: boolean;
  /** How shown it is, 0 to 1, and whether it is heading for shown. */
  readonly shown: number;
  readonly showing: boolean;
  /** Its appearance is at rest (fully shown, or gone). */
  readonly shownSettled: boolean;
  /** Settle to `to` from where it is drawn; lays the content out at `to` and redraws at once. */
  moveTo(to: Rect): void;
  /** Be at `to` now, at rest: no glide. */
  jumpTo(to: Rect): void;
  /** Drawn at `from` now, then settle to `to` (a FLIP's invert and play: `from` in the item's own coordinates). */
  glideFrom(from: Rect, to: Rect): void;
  /** Exactly at `r`, at rest (what a pointer holds); the content stays laid out in its box, moved with it. */
  hold(r: Rect): void;
  /** Appear (true) or disappear (false) with a uniform-scale fade; `now`: without the fade. */
  show(on: boolean, options?: { readonly now?: boolean }): void;
  /** Draw it again now (after its drawable's element was laid out anew from outside). */
  redraw(): void;
}

/** A task the layout motion runs on every frame before it steps the items; true keeps the frames coming. */
export type LayoutTask = (frame: FrameInfo) => boolean | void;

export interface LayoutMotionOptions {
  /** The frame loop every item steps on (one loop for all of them). */
  readonly loop: FrameLoop;
  /** The settle tempo, per second ({@link SETTLE_TEMPO}); default `SETTLE_TEMPO.default`. */
  readonly omega?: number;
  /** The frame phase the items step and draw in; default `"layout"`. */
  readonly phase?: Phase;
  /** Where an appearing item grows from, as a share of its size ({@link popIn}'s `from`); default 0.87. */
  readonly popFrom?: number;
}

/**
 * Layout motion: items with an id and a target rect, each settled to its place on one shared frame loop.
 *
 * Give an item a new place ({@link LayoutItem.moveTo}) and it glides there from wherever it is drawn: the window
 * motion rules of `values/` (settle, reveal, popIn) applied to every item at once. The loop runs only while
 * something moves, or a task asks for frames, and stops by itself.
 *
 * It only animates the rects it is given: which items move where, and when, is the caller's layout.
 */
export interface LayoutMotion {
  /** Add an item drawn by `drawable`, at `at`, shown (or gone: `{ shown: false }`). Its content is laid out at once. */
  add(id: string, drawable: Drawable, at: Rect, options?: { readonly shown?: boolean }): LayoutItem;
  get(id: string): LayoutItem | undefined;
  /** Stop moving an item (its drawable is not touched again). */
  remove(id: string): void;
  readonly items: ReadonlyMap<string, LayoutItem>;
  /** Run `task` on every frame, before the items step; returns how to stop it. */
  task(task: LayoutTask): () => void;
  /** Call `listener` on every frame, after the items have stepped and been drawn; returns how to stop it. */
  onFrame(listener: (frame: FrameInfo) => void): () => void;
  /** Call `listener` each time the frames stop (nothing moves); returns how to stop it. */
  onIdle(listener: () => void): () => void;
  /** Make sure at least one more frame runs (a task has something to do). */
  wake(): void;
  /** Frames are running. */
  readonly running: boolean;
  /** Set the tempo for every item (and the ones added later). */
  configure(config: { readonly omega?: number }): void;
  /** Resolves once nothing moves (at once if nothing does). */
  idle(): Promise<void>;
  /** Stop the frames and forget every item. */
  dispose(): void;
}

/** Two rects the same within a hundredth of a pixel. */
const same = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;
const copy = (r: Rect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });

/** Create the {@link LayoutMotion} for one surface. */
export function createLayoutMotion(options: LayoutMotionOptions): LayoutMotion {
  const { loop } = options;
  const phase = options.phase ?? "layout";
  const popFrom = options.popFrom ?? 0.87;
  let omega = options.omega ?? SETTLE_TEMPO.default;
  const items = new Map<string, LayoutItem>();
  const steps = new Map<string, (dt: number) => boolean>();
  const tasks = new Set<LayoutTask>();
  const frames = new Set<(frame: FrameInfo) => void>();
  const idles = new Set<() => void>();
  const tempos = new Set<() => void>();
  /** What removing an item undoes besides its entry (its tempo hook). */
  const removers = new Map<string, () => void>();
  let waiters: (() => void)[] = [];
  let stop: (() => void) | null = null;
  let woken = false;

  const wake = (): void => {
    woken = true;
    if (stop) return;
    stop = loop.repeat(phase, tick);
  };

  function tick(frame: FrameInfo): boolean {
    let moving = woken;
    woken = false;
    for (const task of [...tasks]) if (task(frame)) moving = true;
    for (const step of [...steps.values()]) if (step(frame.delta)) moving = true;
    for (const listener of [...frames]) listener(frame);
    if (moving || woken) return true;
    stop = null;
    const resolve = waiters;
    waiters = [];
    for (const r of resolve) r();
    for (const listener of [...idles]) listener();
    return false;
  }

  function add(id: string, drawable: Drawable, at: Rect, opts: { readonly shown?: boolean } = {}): LayoutItem {
    if (items.has(id)) throw new Error(`layout motion: item "${id}" is already added (remove it first)`);
    const rect: Settle<Rect> = createSettle<Rect>(copy(at), { omega });
    // A number from 0 to 1: rest within a thousandth, not the default tenth (tuned for pixels).
    const pop: Settle<number> = createSettle(opts.shown === false ? 0 : 1, { omega, restDelta: 0.001 });
    let box = copy(at);
    const frameOf = (): DrawFrame => {
      const drawn = rect.value;
      return { drawn, box, reveal: reveal(drawn, box), pop: popIn(pop.value, popFrom), shown: pop.value, gone: pop.settled && pop.value === 0 };
    };
    const draw = (): void => drawable.draw(frameOf());
    const layOut = (to: Rect): void => {
      box = copy(to);
      drawable.layOut(box);
    };
    const tempo = (): void => {
      rect.configure({ omega });
      pop.configure({ omega });
    };
    const item: LayoutItem = {
      id,
      get drawn() {
        return rect.value;
      },
      get target() {
        return rect.target;
      },
      get box() {
        return box;
      },
      get settled() {
        return rect.settled;
      },
      get shown() {
        return pop.value;
      },
      get showing() {
        return pop.target === 1;
      },
      get shownSettled() {
        return pop.settled;
      },
      moveTo(to) {
        if (same(box, to) && same(rect.target, to)) return;
        layOut(to);
        // Laid out in the new box now: draw it at once at the drawn rect, else until the next frame it would show
        // the old offset from the new box (a dropped item would flash a frame away from where it was let go).
        draw();
        if (same(rect.target, to)) return;
        rect.setTarget(copy(to));
        wake();
      },
      jumpTo(to) {
        layOut(to);
        rect.jumpTo(copy(to));
        draw();
      },
      glideFrom(from, to) {
        rect.jumpTo(copy(from));
        layOut(to);
        draw();
        rect.setTarget(copy(to));
        wake();
      },
      hold(r) {
        rect.hold(copy(r));
        draw();
      },
      show(on, o = {}) {
        const want = on ? 1 : 0;
        if (o.now) pop.jumpTo(want);
        else if (pop.target !== want) {
          pop.setTarget(want);
          wake();
        }
        draw();
      },
      redraw: draw,
    };
    drawable.layOut(box);
    draw();
    items.set(id, item);
    tempos.add(tempo);
    steps.set(id, (dt) => {
      const a = rect.step(dt);
      const b = pop.step(dt);
      draw();
      return a || b;
    });
    removers.set(id, () => tempos.delete(tempo));
    return item;
  }

  return {
    add,
    get: (id) => items.get(id),
    remove(id) {
      items.delete(id);
      steps.delete(id);
      removers.get(id)?.();
      removers.delete(id);
    },
    items,
    task(task) {
      tasks.add(task);
      wake();
      return () => tasks.delete(task);
    },
    onFrame(listener) {
      frames.add(listener);
      return () => frames.delete(listener);
    },
    onIdle(listener) {
      idles.add(listener);
      return () => idles.delete(listener);
    },
    wake,
    get running() {
      return stop !== null;
    },
    configure(config) {
      if (config.omega !== undefined) omega = config.omega;
      for (const t of tempos) t();
    },
    idle: () => (stop ? new Promise<void>((r) => waiters.push(r)) : Promise.resolve()),
    dispose() {
      stop?.();
      stop = null;
      items.clear();
      steps.clear();
      tasks.clear();
      frames.clear();
      idles.clear();
      tempos.clear();
      removers.clear();
      const resolve = waiters;
      waiters = [];
      for (const r of resolve) r();
    },
  };
}
