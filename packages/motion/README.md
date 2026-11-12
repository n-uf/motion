# @n-uf/motion

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/motion is young and still changing. Its API (the frame loop, signals, springs and tweens, and the gesture recogniser) and its timing behaviour are not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things, including how frames are scheduled, how springs settle and how gestures are timed. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/motion/CHANGELOG.md) before you upgrade. If you need a stable animation library, use [Motion](https://motion.dev) or [GSAP](https://gsap.com). Both work on the DOM, so neither is a drop-in replacement.

One frame loop with an injected clock, fine-grained signals, springs and
tweens, and a DOM-free gesture recogniser. No DOM, no framework, no globals:
the host hands in a clock, and tests hand in a fake one.

```sh
npm i @n-uf/motion
```

- **clock/**: one frame loop that runs tasks in phases (input → update →
  layout → write) with a frame budget and stats, on a clock you pass in.
- **signals/**: reactive values, computed values and effects; a change
  recomputes only what depends on it, and effects can run once per frame.
- **values/**: springs and tweens over numbers, points, rects and vectors,
  stepped by the clock, with velocity that carries over a retarget, settle
  detection and a reduced-motion switch; and the window motion rules:
  `settle` (one fast-then-gentle curve that never passes its target), hold
  (what a pointer owns sits exactly under it) and `reveal` (glide a window
  without stretching its content).
- **gestures/**: a recogniser that turns pointer, wheel and trackpad events
  (plain objects) into one gesture stream (click or drag, double click, long
  press, pinch, scroll, zoom, recovery from lost releases), a frame coalescer,
  and a dwell (spring-load) machine.

One package, seven entries: `@n-uf/motion` (everything in the core), its four
folders on their own (`@n-uf/motion/clock`, `/signals`, `/values`,
`/gestures`), `@n-uf/motion/testing` (frame-sampled checks of the motion
rules, for tests and browser specs), and `@n-uf/motion/browser`, the clock on
`requestAnimationFrame` and the reduced-motion media query. The core entries
touch no host; importing several of them still gives one signal graph.

## One frame

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

## clock/

| | |
|---|---|
| `ClockPort` | `{ now, requestFrame, cancelFrame, setTimer, clearTimer }`, the shape of hypr-tiling's `SchedulerPort`. |
| `createFrameLoop({ clock, budgetMs?, frameMs?, maxDeltaMs?, maxRounds?, onError?, onOverBudget? })` | The loop. It requests a frame only while it has work. |
| `loop.schedule(phase, task, { deferrable? })` | Run `task` once: this frame if `phase` is still ahead, else the next. Deduped by function; returns cancel. A `deferrable` task waits for a later frame when the budget is spent. |
| `loop.repeat(phase, task)` | Run `task` every frame until it returns `false`; returns stop. |
| `loop.scheduler(phase)` | For `effect(fn, { schedule })`: the effect runs in `phase`, at most once per frame. |
| `loop.frames(phase)` | A frame source in that phase (for a coalescer). |
| `loop.stats()` / `resetStats()` | Frames, frames over budget, deferred tasks, errors, last / max / mean frame ms, ms per phase, repeating and queued tasks. |
| `createFakeClock({ now?, frameMs? })` | A clock that moves only when told: `tick(ms)`, `frame(dt?)`, `frames(n)`, `runUntilIdle()`, `spend(ms)` (work that takes time), `pendingFrames`, `pendingTimers`. |

Each task gets `{ time, delta, index, phase, budgetMs, elapsed(), remaining() }`.
`delta` is the time since the last frame, clamped to `maxDeltaMs` (default
64), and `frameMs` for the first frame after the loop was idle.

Within a phase, one-shot tasks run first, then the repeating ones, then any
one-shots they queued for that phase. A task queued for a later phase runs in
the same frame; one queued for an earlier phase runs in the next.

```ts
import { createFakeClock, createFrameLoop } from "@n-uf/motion";

const clock = createFakeClock();
const loop = createFrameLoop({ clock, budgetMs: 8 });
loop.schedule("write", () => console.log("write"));
loop.schedule("input", () => console.log("input"));
clock.frame(); // input, write
loop.stats(); // { frames: 1, overBudget: 0, ... }
```

## signals/

| | |
|---|---|
| `signal(value, { equals? })` | Read and write `.value`; `peek()` reads without tracking. |
| `computed(fn, { equals? })` | Lazy and cached; `fn(previous)`; a thrown error is kept and rethrown until a source changes. |
| `effect(fn, { schedule? })` | Runs now and on every change; `fn` may return a cleanup. With `schedule`, runs go to the scheduler. Returns dispose. |
| `batch(fn)`, `untracked(fn)`, `isSignal(x)` | |

An effect's own writes don't re-run it; writes inside an effect are batched
until it returns; effects that keep re-triggering each other throw instead
of hanging. The graph algorithm is
[alien-signals](https://github.com/stackblitz/alien-signals)' published core
(`alien-signals/system`, the same core Vue 3.6 uses), under this API;
[bench/RESULTS.md](./bench/RESULTS.md) has the comparison behind that choice.

```ts
import { computed, createFakeClock, createFrameLoop, effect, signal } from "@n-uf/motion";

const loop = createFrameLoop({ clock: createFakeClock() });
const width = signal(800);
const columns = computed(() => Math.max(1, Math.floor(width.value / 300)));
effect(() => console.log("columns", columns.value), { schedule: loop.scheduler("write") });
width.value = 850; // still 2 columns: the effect won't run
width.value = 1300; // runs once, in the next frame's write phase
```

## values/

| | |
|---|---|
| `createSpring(initial, { stiffness?, damping?, dampingRatio?, mass?, restDelta?, restSpeed? })` | Critically damped by default (`dampingRatio: 1`, `stiffness: 300`). Each step is the exact closed-form solution, so the curve doesn't depend on the frame rate. |
| `createTween(initial, { duration?, easing? })` | Default 250 ms, `easeOutCubic`. A new target starts a new run from the current value. |
| `motionValue(loop, animator, { phase?, reducedMotion? })` | Steps an animator on the loop while it moves; reading `.value` tracks it. |
| `springValue(loop, initial, options)` / `tweenValue(...)` | The two together. |
| `mv.set(target, { velocity? })`, `jump(value)`, `snap()`, `follow(() => target)`, `onSettle(fn)`, `dispose()`, `moving`, `velocity`, `target` | |
| `springStep(state, target, params, dtMs)` | One pure scalar step, for hosts that step by hand. |
| `linear`, `ease`, `easeIn`, `easeOut`, `easeInOut`, `easeOutCubic`, `easeInOutCubic`, `cubicBezier(x1, y1, x2, y2)` | Easing functions (functions, not CSS strings). |

Values are plain: a number, `{ x, y }`, `{ x, y, width, height }` or an array
of numbers, a fresh object after every change. Velocity is in units per
second. A spring keeps its velocity when its target changes mid-flight. A
value is at rest when it is within `restDelta` of the target and slower than
`restSpeed` (defaults 0.1 and 1, tuned for pixels; use about 0.001 and 0.01
for opacity or scale), and then it snaps onto the target exactly. With
`reducedMotion` on (a boolean or a function read on every target and frame),
targets are reached at once.

Motion values step in the `layout` phase by default, after that phase's
one-shot tasks: a target set in input, update or layout moves the value in
the same frame, and `write` sees it.

```ts
import { createFakeClock, createFrameLoop, springValue } from "@n-uf/motion";

const clock = createFakeClock();
const loop = createFrameLoop({ clock });
const rect = springValue(loop, { x: 0, y: 0, width: 200, height: 100 }, { dampingRatio: 0.7 });
rect.onSettle((r) => console.log("settled at", r));
rect.set({ x: 300, y: 40, width: 240, height: 100 });
clock.runUntilIdle(); // settled at { x: 300, y: 40, width: 240, height: 100 }
```

### Window motion: settle, hold, reveal

Three rules make windows move the way a tiling window manager feels smooth
(Hyprland is the reference): what the pointer holds is glued to it, everything
else moves on one front-loaded curve that never passes its target, and content
is never stretched.

| | |
|---|---|
| `createSettle(initial, { omega?, restDelta? })` | The one curve for moving to a new place. On a new target every component gets the velocity `omega · distance` toward it from wherever it is drawn, so it follows `distance · e^(−omega·t)`: 90 % in `ln(10)/omega` s, then it eases in, and never passes the target (no overshoot on position, no wobble on size), however often it is retargeted. A velocity set by hand toward the target is capped at that speed; one away from it is kept, and the value turns around without crossing. |
| `SETTLE_TEMPO` | `{ calm: 20, default: 25, quick: 37 }` (1/s): 90 % in 115, 92 or 62 ms. |
| `settle.hold(value)` | Hold: put the value exactly there, at rest (same as `jumpTo`). Call it on each pointer move; the next `setTarget` launches from there. |
| `settleValue(loop, initial, { omega?, restDelta?, phase?, reducedMotion? })` | The settle on a frame loop. Hold it with `mv.jump(rect)`. |
| `reveal(drawn, target)` | How to draw a window gliding at `drawn` whose content is laid out at `target`: move the element by `dx, dy`, draw the frame (chrome) at `width × height`, clip the content by `clipRight, clipBottom`. No scale, no layout per frame. |
| `popIn(progress, from = 0.87)` | Opening and closing: a uniform scale about the centre plus opacity. Drive `progress` with a settle on a number with `{ restDelta: 0.001 }` (the default 0.1 is for pixels) or a tween. |

```ts
import { createFakeClock, createFrameLoop, settleValue } from "@n-uf/motion";

const clock = createFakeClock();
const loop = createFrameLoop({ clock });
const win = settleValue(loop, { x: 0, y: 0, width: 400, height: 300 });
win.set({ x: 400, y: 0, width: 200, height: 300 }); // a reflow: position and size arrive together
clock.frame();
win.set({ x: 300, y: 0, width: 300, height: 300 }); // retargeted mid-flight: on from where it is drawn
clock.runUntilIdle();
console.log(win.value); // { x: 300, y: 0, width: 300, height: 300 }, never past it on the way
```

## layout/

`@n-uf/motion/layout` applies the window motion rules to a whole surface:
give each item an id and a target rect, and it moves the real elements, every
one on one frame loop that runs only while something moves. It animates the
rects it is given and nothing else: which items move where (making room,
drop targets) is the caller's layout.

| | |
|---|---|
| `createLayoutMotion({ loop, omega?, phase?, popFrom? })` | The surface: `add(id, drawable, at, { shown? })`, `get`, `remove`, `items`; `task(fn)` runs before the items step each frame, `onFrame(fn)` after; `onIdle`, `idle()`, `running`, `wake()`, `configure({ omega })`, `dispose()`. |
| `item.moveTo(rect)` | Settle there from wherever it is drawn (a retarget mid-flight goes on from the drawn rect). The content is laid out at the new box once, and the item redrawn at once, so no frame shows the old offset from the new box. A size change is revealed, never scaled. |
| `item.jumpTo(rect)`, `item.hold(rect)`, `item.glideFrom(from, to)` | At once; held exactly where a pointer puts it (the content moves with it); drawn at `from`, then settle to `to`. |
| `item.show(on, { now? })` | Appear or disappear with a uniform-scale fade (`popIn`); folding is a `moveTo` to the folded size, revealed. |
| `item.drawn`, `target`, `box`, `settled`, `shown`, `showing`, `shownSettled` | Where it is drawn, where it is heading, where its content is laid out. |
| `holdItem(item, grab)` | A held drag of the real item, no copy: `move(pointer)` holds it 1:1 from the grab offset; `snapTo(slot)` glides into a slot, `snapTo(null)` back to the pointer (`follow()` once a frame until it is under it again); `land(slot)` and `cancel(home)` settle from the release rect, which they return. `preview(plan, slot)` once a frame plays a drop preview (`plan` from `@n-uf/motion/drag`'s `previewPlan`): indicator and gap keep the item under the pointer (gap with the caller's room open), snap glides it into the slot, and a release there finishes that glide. |
| `flip(entries, change)` | FLIP for DOM groups on settle: record where each node is drawn, run `change` (the DOM moves), then each item glides from its old rect. |
| `domDrawable({ node, frame?, content? })`, `layOutBox`, `drawBox` | Draw onto DOM styles: the node laid out at the box, moved by one transform, the frame at the drawn size, the content (or the node) clipped; hidden when gone. Any `{ layOut, draw }` drawable works (a canvas, a test). |

```ts
import { createFakeClock, createFrameLoop } from "@n-uf/motion";
import { createLayoutMotion, holdItem } from "@n-uf/motion/layout";

const clock = createFakeClock();
const loop = createFrameLoop({ clock });
const motion = createLayoutMotion({ loop });
const panel = motion.add("panel", { layOut: () => {}, draw: () => {} }, { x: 0, y: 0, width: 200, height: 100 });
panel.moveTo({ x: 300, y: 0, width: 240, height: 100 }); // a settle, its new width revealed
clock.runUntilIdle();
const held = holdItem(panel, { x: 20, y: 10 }); // grabbed 20 px in, 10 px down
held.move({ x: 120, y: 60 }); // held 1:1: drawn at { x: 100, y: 50 }
const release = held.land({ x: 0, y: 0, width: 200, height: 100 });
console.log(release); // { x: 100, y: 50, width: 240, height: 100 }: the landing starts there
clock.runUntilIdle();
console.log(panel.drawn); // { x: 0, y: 0, width: 200, height: 100 }
```

## testing/

`@n-uf/motion/testing` checks recorded frames against the rules. Record what
was drawn each frame (on the fake clock, or in a browser spec once per
animation frame) and ask:

| | |
|---|---|
| `checkNoOvershoot(samples, from, to, tolerance?)` | Every component stays between its start and end: no overshoot, no size wobble. |
| `checkMonotonic(samples, to, tolerance?)` | The distance to the target never grows: no bounce, no restart backwards. |
| `checkNoJumps(samples, omega, slack?)` | No frame moves further than a settle at `omega` could: catches snaps and restarts from an old place. Sample times are the stepped time (the loop's `delta`s), not wall-clock timestamps. |
| `checkHeld(samples, tolerance?)` | A held rect is where the pointer puts it, every frame. |
| `checkContentScale(samples, { uniformOnly?, tolerance? })` | Content's transform is never non-uniform (stretched); with `uniformOnly: false`, never scaled at all. |
| `checkTempo(samples, from, to, t90, tolerance?, startT?)` | 90 % of the way within `t90` ms of `startT` (default: the first sample, so record the frame the move began); returns the measured time too. |

Each returns `{ ok, failures }`, a failure naming the frame and component.
The motion lab in the [n-uf/motion repository](https://github.com/n-uf/motion)
(`apps/lab`) runs them on every move.

## gestures/

| | |
|---|---|
| `createRecognizer({ toCanvas, timers?, dragModifier?, platform?, thresholds?, longPress?, multiClick?, pinch?, wheel?, staleMs? }, emit)` | Raw pointer, wheel and Safari gesture events in, `InputGesture`s out: `press`, `dragStart`, `move`, `longPress`, `release` (with `click` and `clickCount`), `cancel` (with a reason), `hover`, `pinch` (touch or trackpad, pinch or two-finger pan), `scroll`, `zoom`. Methods: `feed`, `cancel(reason)`, `reset`, `active`, `pinching`, `setDragModifier`, `dispose`. |
| `RECOGNIZER_DEFAULTS` | Click-or-drag thresholds 4 / 6 / 8 px (mouse / pen / touch), long press after 500 ms for touch and pen, double click within 300 ms and 5 px, pinch at 5 % scale or 10 px pan (read once both fingers have moved as often as each other, or one is three moves ahead, or one lifts). |
| `wheelDeltaPx`, `classifyWheel`, `dampWheelPan`, `WHEEL_DEFAULTS`, `WHEEL_PAN_DEFAULTS` | Wheel normalisation: lines and pages to px, Cmd/Ctrl+wheel (and the ctrl+wheel trackpad pinch) zooms by 2^(−dy / 300), Shift turns a vertical wheel horizontal, and a damped pan per event. |
| `toModifiers`, `resolveDragModifier`, `defaultDragModifier`, `isHeld`, `modHeld`, `platformButton` | Modifier keys in one shape; the drag modifier per platform (Cmd on macOS, Alt elsewhere); on macOS a Ctrl+click is the secondary button. |
| `createFrameCoalescer(onFrame, frames, { merge? })` | `schedule(sample)`, `flush()`, `cancel()`, `pending`. One delivery per frame with the latest sample (or `merge`d ones) and how many were folded. Same shape as hypr-tiling's. |
| `dwellReducer`, `DWELL_IDLE`, `dwellDeadline`, `createDwellMachine` | `idle → dwelling → fired`, for spring-loaded targets: hold over the same key long enough and it fires once. |
| `createMachine({ reducer, initial, clock, deadline? })` | Runs a pure reducer on a clock: arms the timer the state's deadline asks for and sends its input when it fires. `state` is reactive. |

The recogniser takes plain objects the host copies out of DOM events, with
their timestamps; nothing in it touches the DOM. Mouse, pen and touch share
one path. There is one press at a time, a second finger turns it into a
pinch, and a press only becomes a drag past its device's threshold, so a
modifier+click stays a click for the content. It recovers releases that never
arrive (a move with no buttons down, the same pointer pressing again, a press
left untouched for `staleMs` when another pointer goes down). Its `timers`
are a clock (any `ClockPort`), used for the long press. Hit testing and
routing (what is under a point, who gets the gesture) are the host's.

```ts
import { createFakeClock, createRecognizer } from "@n-uf/motion";

const clock = createFakeClock();
const recognizer = createRecognizer({ toCanvas: (p) => p, timers: clock }, (g) => console.log(g.type));
const finger = { pointerId: 1, pointerType: "touch", button: 0, screen: { x: 0, y: 0 } } as const;
recognizer.feed({ ...finger, type: "pointerdown", buttons: 1, time: clock.now() }); // press
clock.tick(500); // longPress
recognizer.feed({ ...finger, type: "pointerup", buttons: 0, time: clock.now() }); // release, click: false
```

## drag/

`@n-uf/motion/drag` decides, from the pointer's path, when a drop indicator
shows, which target it shows, when the others make room, and what a release
lands on. It is pure: the host feeds it the pointer once a frame and plain-data
targets, and draws what it says. It is only there, not in the root.

| | |
|---|---|
| `createDragIntent({ home, tuning?, placeOf? })` | `update(point, time, targets)` once a frame while an item is held, returning `{ shown, room, roomPlace, aiming }`; `release(point, targets)`, the target a release lands on or null (home); `hide(time)` while the view scrolls under the pointer; `moveHome(dx, dy)`; `state`; `tuning`. |
| `DRAG_DEFAULTS` | Lift at 5 px (a touch: a 180 ms hold, then 8 px); aiming below 0.45 px/ms over 50 ms, or within 12 px for 90 ms; a 10 px band, a 4 px breakthrough, a 120 ms gap grace; a switch waits 150 ms; room after 160 ms. Each is overridable per intent. |
| `targetAt(targets, point)`, `inRect(rect, point, margin?)` | The most precise target under a point (priority 1, 2, 3, then the smaller zone); a point in a rect grown or shrunk by a margin. |
| `liftDecision({ touch, distance, elapsed }, tuning?)` | `"wait"`, `"lift"` or `"refuse"`: when a press becomes a drag. |
| `previewPlan(frame, preview, slotted?)`, `DragPreview`, `DRAG_PREVIEW_DEFAULT` | What to draw for a frame under one of three previews: `{ showIndicator, makeRoom, snapItem }`. `"indicator"`: only the indicator, nothing moves. `"gap"`: the others make room once the intent does; the item stays under the pointer. `"snap"` (the default): the gap opens and the item glides into a slotted target's room, with no indicator (a target without a slot keeps it). |

A target is `{ id, priority, hit, slot?, label?, free? }`: `hit` is the zone
the pointer can be in, `priority` how precise it is (a tab strip 1, a slot 2,
a large area 3). The rules:

- The indicator shows only when the pointer has left the item's home, a target
  is under it, and the pointer aims (slows down or holds still). Crossing
  targets at speed shows nothing.
- The current target holds within a band around its zone, unless a more
  precise target is clearly under the pointer. Leaving the shown target, a
  flying pointer hides the indicator at once; an aiming one moves it once the
  new target has held 150 ms, so no indicator ever shows for less.
- Room is made once the shown target, and the place in it (`placeOf`: a tab
  index, say), have held 160 ms; never for a `free` target.
- A release lands on the shown target if the pointer is within its band, else
  on the target under the pointer, else nowhere. A release over home does
  nothing.
- The three previews only change what is drawn: all follow these rules, so a
  drop lands where the preview showed it in each.

```ts
import { createDragIntent, type DragTarget } from "@n-uf/motion/drag";

const slot: DragTarget = { id: "slot", priority: 2, hit: { x: 0, y: 0, width: 200, height: 100 } };
const intent = createDragIntent({ home: { x: 300, y: 300, width: 100, height: 50 } });
for (let t = 0; t <= 300; t += 16) intent.update({ x: 100, y: 50 }, t, [slot]); // held still over the slot
console.log(intent.state.shown?.id); // "slot"
console.log(intent.release({ x: 100, y: 50 }, [slot])?.id); // "slot"
```

## @n-uf/motion/browser

| | |
|---|---|
| `createBrowserClock({ host?, fallbackFrameMs? })` | The `ClockPort` on `requestAnimationFrame`, `performance.now` and `setTimeout`; timeouts stand in for frames where there is no `requestAnimationFrame`. |
| `prefersReducedMotion(host?)` | A function reading `(prefers-reduced-motion: reduce)`, for `reducedMotion`. |

The host is typed by its shape, not by lib.dom, so tests and workers can pass
their own.

## Testing

Everything runs on `createFakeClock()`: frames, timers, springs and machine
deadlines move only when the test moves the clock, so motion is exact and
repeatable. `@n-uf/motion/testing` (above) checks the frames you record.

## Benchmarks

`pnpm bench` times the signals against alien-signals' and
@preact/signals-core's own APIs on graphs of a few thousand nodes, and prints
bundle sizes and the deepest chain each survives. Results and the choice
they led to are in [bench/RESULTS.md](./bench/RESULTS.md).

## Versions

Calendar versions `YY.M.R` (year, month of the release, counter within the
month), the same scheme as `@n-uf/hypr-tiling`. `pnpm version:bump` sets the
next one; never type one by hand.

## License

[PolyForm Perimeter 1.0.1](./LICENSE).
