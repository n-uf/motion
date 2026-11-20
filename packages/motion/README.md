# @n-uf/motion

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/motion is young and still changing. Its API (the frame loop, signals, springs and tweens, and the gesture recognizer) and its timing behavior are not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things, including how frames are scheduled, how springs settle and how gestures are timed. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/motion/CHANGELOG.md) before you upgrade. If you need a stable animation library, use [Motion](https://motion.dev) or [GSAP](https://gsap.com). Both work on the DOM, so neither is a drop-in replacement.

How things move. One frame loop on an injected clock, fine-grained signals, values that animate (springs, tweens and one settle curve for moving windows), a DOM-free gesture recognizer, the drag intent and the landing model, and layout motion that glides a whole layout. No DOM, no framework, no globals: the host hands in a clock and plain event objects and reads plain numbers back, and tests hand in a fake clock.

```sh
npm i @n-uf/motion
```

## Entry points

| Entry | What it gives |
|---|---|
| `@n-uf/motion` | Everything in `/clock`, `/signals`, `/values` and `/gestures`, and the shared value shapes (`Point`, `Rect`, `Vector`). |
| `@n-uf/motion/clock` | The frame loop (phases input, update, layout, write; a budget; stats) and a fake clock for tests. |
| `@n-uf/motion/signals` | `signal`, `computed`, `effect`, `batch`: a change recomputes only what depends on it, and effects can run once per frame. |
| `@n-uf/motion/values` | Springs, tweens and the settle curve, as motion values stepped by the loop; `reveal` and `popIn`; easing functions. |
| `@n-uf/motion/gestures` | The recognizer (click or drag, double click, long press, pinch, scroll, zoom), a frame coalescer, and state machines for touch press, paged swipe and dwell. |
| `@n-uf/motion/drag` | The drag intent (when a drop indicator shows, which target, what a release lands on), grip presses, drop previews and the landing model. |
| `@n-uf/motion/layout` | Layout motion: items glide to new rects, a held item follows the pointer 1:1 and lands, FLIP for DOM groups. |
| `@n-uf/motion/testing` | Frame-sampled checks of the motion rules (no overshoot, no jumps, held under the pointer), for tests and browser specs. |
| `@n-uf/motion/browser` | The clock on `requestAnimationFrame` and the reduced-motion media query. |

The core entries touch no DOM; importing several of them still gives one signal graph. `/drag`, `/layout`, `/testing` and `/browser` are not in the root.

## One frame

A pointer drives a spring that follows a target, and the DOM is written once per frame, only while something moves.

```ts
import { computed, createFrameCoalescer, createFrameLoop, effect, signal, springValue } from "@n-uf/motion";
import { createBrowserClock, prefersReducedMotion } from "@n-uf/motion/browser";

const el = document.querySelector<HTMLElement>("#box")!;
const loop = createFrameLoop({ clock: createBrowserClock() });

// Input: one pointer sample per frame, delivered in the input phase.
const pointer = signal({ x: 0, y: 0 });
const input = createFrameCoalescer<{ x: number; y: number }>((p) => (pointer.value = p), loop.frames("input"));
addEventListener("pointermove", (e) => input.schedule({ x: e.clientX, y: e.clientY }));

// Layout: a target derived from state.
const target = computed(() => ({ x: Math.round(pointer.value.x / 50) * 50, y: 0 }));

// Motion: a spring follows the target, stepping in the layout phase.
const box = springValue(loop, { x: 0, y: 0 }, { reducedMotion: prefersReducedMotion() });
box.follow(() => target.value);

// Write: once per frame while it moves; the loop idles when it settles.
effect(() => {
  el.style.transform = `translate(${box.value.x}px, ${box.value.y}px)`;
}, { schedule: loop.scheduler("write") });
```

## A drag

The drag intent is pure: feed it the pointer once a frame and plain-data targets, and draw what it says.

```ts
import { createDragIntent, type DragTarget } from "@n-uf/motion/drag";

const slot: DragTarget = { id: "slot", priority: 2, hit: { x: 0, y: 0, width: 200, height: 100 } };
const intent = createDragIntent({ home: { x: 300, y: 300, width: 100, height: 50 } });
for (let t = 0; t <= 300; t += 16) intent.update({ x: 100, y: 50 }, t, [slot]); // held still over the slot
console.log(intent.state.shown?.id); // "slot"
console.log(intent.release({ x: 100, y: 50 }, 300, [slot])?.id); // "slot"
```

## Documentation

- [Design page](https://github.com/n-uf/motion/blob/main/docs/motion.md): the concept, the parts, the rules a consumer relies on.
- [Reference](https://github.com/n-uf/motion/blob/main/docs/motion-reference.md): every entry point's API, rules and longer examples.
- [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/motion/CHANGELOG.md)
- Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

Its siblings: [`@n-uf/placement`](https://www.npmjs.com/package/@n-uf/placement) owns where things fit, and [`@n-uf/docking`](https://www.npmjs.com/package/@n-uf/docking) where panels and toolbars dock.

## License

[PolyForm Perimeter 1.0.1](https://github.com/n-uf/motion/blob/main/LICENSE).
