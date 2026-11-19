# @n-uf/motion

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/motion is young and still changing. Its API (the frame loop, signals, springs and tweens, and the gesture recognizer) and its timing behavior are not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things, including how frames are scheduled, how springs settle and how gestures are timed. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/motion/CHANGELOG.md) before you upgrade. If you need a stable animation library, use [Motion](https://motion.dev) or [GSAP](https://gsap.com). Both work on the DOM, so neither is a drop-in replacement.

Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

One frame loop with an injected clock, fine-grained signals, springs and
tweens, and a DOM-free gesture recognizer. No DOM, no framework, no globals:
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
  `settle` (one fast-then-gentle curve that never passes its target), direct
  drag (`settle.hold`: what a pointer owns sits exactly under it) and `reveal`
  (glide a window without stretching its content).
- **gestures/**: a recognizer that turns pointer, wheel and trackpad events
  (plain objects) into one gesture stream (click or drag, double click, long
  press, pinch, scroll, zoom, recovery from lost releases), a frame coalescer,
  and a dwell machine, for spring-loading.

One package, nine entries: `@n-uf/motion` (everything in the core), its four
folders on their own (`@n-uf/motion/clock`, `/signals`, `/values`,
`/gestures`), `@n-uf/motion/drag` (the drag intent), `@n-uf/motion/layout`
(the window motion rules applied to a whole layout), `@n-uf/motion/testing`
(frame-sampled checks of the motion rules, for tests and browser specs), and
`@n-uf/motion/browser`, the clock on `requestAnimationFrame` and the
reduced-motion media query. The core entries touch no DOM; importing several of
them still gives one signal graph.

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

### Window motion: settle, direct drag, reveal

Three rules make windows move the way a tiling window manager feels smooth
(Hyprland is the reference): what the pointer drags is glued to it, everything
else moves on one front-loaded curve that never passes its target, and content
is never stretched.

| | |
|---|---|
| `createSettle(initial, { omega?, restDelta? })` | The one curve for moving to a new place. On a new target every component gets the velocity `omega · distance` toward it from wherever it is drawn, so it follows `distance · e^(−omega·t)`: 90 % in `ln(10)/omega` s, then it eases in, and never passes the target (no overshoot on position, no wobble on size), however often it is retargeted. A velocity set by hand toward the target is capped at that speed; one away from it is kept, and the value turns around without crossing. |
| `SETTLE_TEMPO` | `{ calm: 20, default: 25, quick: 37 }` (1/s): 90 % in 115, 92 or 62 ms. |
| `settle.hold(value)` | Pin the value exactly there, at rest (same as `jumpTo`), for a direct drag. Call it on each pointer move; the next `setTarget` launches from there. |
| `settleValue(loop, initial, { omega?, restDelta?, phase?, reducedMotion? })` | The settle on a frame loop. Pin it with `mv.jump(rect)`. |
| `reveal(drawn, target)` | How to draw a window gliding at `drawn` whose content is laid out at `target`: move the element by `dx, dy`, draw the frame (chrome) at `width × height`, clip the content by `clipRight, clipBottom`. No scale, no layout per frame. |
| `popIn(progress, from = 0.87)` | Opening and closing: a uniform scale about the center plus opacity. Drive `progress` with a settle on a number with `{ restDelta: 0.001 }` (the default 0.1 is for pixels) or a tween. |

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

`@n-uf/motion/layout` applies the window motion rules to a whole layout:
give each item an id and a target rect, and it moves the real elements, every
one on one frame loop that runs only while something moves. It animates the
rects it is given and nothing else: which items move where (making room,
drop targets) is the caller's layout.

| | |
|---|---|
| `createLayoutMotion({ loop, omega?, phase?, popFrom?, reducedMotion?, onDraw?, onActiveChange? })` | The layout motion: `add(id, drawable, at, { shown? })`, `get`, `remove`, `retain(ids)` (removes every item not listed), `items`; `task(fn)` runs before the items step each frame, `onFrame(fn)` after; `onIdle`, `idle()`, `running`, `wake()`, `configure({ omega })`, `flush()`, `dispose()`. |
| `reducedMotion` | A boolean or the host's query (the reduced-motion media query), read on every new target and every show or hide: while true, items are placed and shown at once, with no glide and no fade. |
| `onDraw(batch)`, `flush()` | Batched drawing: every item that moved is drawn in one pass per frame (its drawable, then `onDraw` once with all their frames); an item at rest is not drawn. A change made between frames waits for the next frame, or `flush()` draws it now, which a host calls right after it commits a layout so the next paint shows no frame at the new box. |
| `onActiveChange(active)` | Called once when the frames start and once when they stop. |
| `item.moveTo(rect)` | Settle there from wherever it is drawn (a retarget mid-flight goes on from the drawn rect). The content is laid out at the new box once, and the item redrawn at once, so no frame shows the old offset from the new box. A size change is revealed, never scaled. |
| `item.retarget(rect)` | Optional on a `LayoutItem`. Settle there like `moveTo`, but keep the content laid out where it is while the size is unchanged: for chasing a moving point (the direct drag's glide back to the pointer uses it), which would otherwise lay the content out on every frame. `holdItem` falls back to `moveTo` for an item without it. |
| `item.jumpTo(rect)`, `item.hold(rect)`, `item.glideFrom(from, to)` | At once; drawn exactly where a pointer puts it (the content moves with it); drawn at `from`, then settle to `to`. |
| `item.show(on, { now? })` | Appear or disappear with a uniform-scale fade (`popIn`); collapsing is a `moveTo` to the collapsed size, revealed. |
| `item.drawn`, `target`, `box`, `settled`, `shown`, `showing`, `shownSettled` | Where it is drawn, where it is heading, where its content is laid out. |
| `holdItem(item, grab)` | A direct drag of the real item, no copy: `move(pointer)` draws it 1:1 from the grab offset; `snapTo(slot)` glides into a slot, `snapTo(null)` back to the pointer (`follow()` once a frame until it is under it again); `land(slot)` and `cancel(home)` settle from the release rect, which they return. `preview(plan, slot)` once a frame plays a drop preview (`plan` from `@n-uf/motion/drag`'s `previewPlan`): `indicator` and `gap` (make room) keep the item under the pointer (`gap` with the caller's room open), `snap` glides it into the slot, and a release there finishes that glide. `resize(size)` holds it at a new size from now on (the caller laid its content out for it): the grab point keeps its share of the item, and it settles there from where it is drawn, revealed, never stretched (in a slot it stays put and takes the size when it leaves). |
| `anchoredMorph(size, anchor, config?)` | A box held at a point that changes size about an anchor (its spot that sits on the point). `to(size, anchor)` settles the size and the anchor together from where they are drawn (at `MORPH_TEMPO`, which is `SETTLE_TEMPO.quick`: 90 % in about 60 ms, within 1 % in about 125 ms, the last pixels longer for large size changes, unless `config` says otherwise; a retarget mid-flight turns at once, no jump, no overshoot; true when the target changed); `jumpTo(size, anchor)` is there at once; `step(dt)` once a frame; `size`, `anchor`, `target` and `settled` read where it is drawn, heading and at rest; `rectAt(point)` is the box with its anchor exactly on the point, every frame; `progress` (0 to 1 since the last retarget) fades the content it came from out and the target's in. Draw each content with its own anchor on the point and neither moves from under the pointer. |
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
held.move({ x: 120, y: 60 }); // a direct drag, 1:1: drawn at { x: 100, y: 50 }
const release = held.land({ x: 0, y: 0, width: 200, height: 100 });
console.log(release); // { x: 100, y: 50, width: 240, height: 100 }: the landing starts there
clock.runUntilIdle();
console.log(panel.drawn); // { x: 0, y: 0, width: 200, height: 100 }
```

A host that draws every item itself, once per frame:

```ts
import { createFakeClock, createFrameLoop } from "@n-uf/motion";
import { createLayoutMotion } from "@n-uf/motion/layout";

const clock = createFakeClock();
const loop = createFrameLoop({ clock });
const batches: string[][] = [];
const host = createLayoutMotion({ loop, onDraw: (batch) => batches.push(batch.map((e) => e.id)) });
const noop = { layOut: () => {}, draw: () => {} };
const a = host.add("a", noop, { x: 0, y: 0, width: 100, height: 100 });
host.add("b", noop, { x: 0, y: 200, width: 100, height: 100 });
host.flush(); // both drawn now, in one batch: ["a", "b"]
a.moveTo({ x: 300, y: 0, width: 100, height: 100 });
host.flush(); // right after the host's commit: ["a"], at the rect it is drawn at
clock.runUntilIdle(); // one batch per frame, each ["a"] (b is at rest)
host.retain(["a"]); // b left the layout
console.log(host.items.size); // 1
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
| `checkHeld(samples, tolerance?)` | A directly dragged rect is where the pointer puts it, every frame. |
| `checkContentScale(samples, { uniformOnly?, tolerance? })` | Content's transform is never non-uniform (stretched); with `uniformOnly: false`, never scaled at all. |
| `checkTempo(samples, from, to, t90, tolerance?, startT?)` | 90 % of the way within `t90` ms of `startT` (default: the first sample, so record the frame the move began); returns the measured time too. |

Each returns `{ ok, failures }`, a failure naming the frame and component.
The motion lab in the [n-uf/motion repository](https://github.com/n-uf/motion)
(`apps/lab`) runs them on every move.

## gestures/

| | |
|---|---|
| `createRecognizer({ toCanvas, timers?, dragModifier?, platform?, thresholds?, longPress?, multiClick?, pinch?, wheel?, staleMs? }, emit)` | Raw pointer, wheel and Safari gesture events in, `InputGesture`s out: `press`, `dragStart`, `move`, `longPress`, `release` (with `click` and `clickCount`), `cancel` (with a reason), `hover`, `pinch` (touch or trackpad, pinch or two-finger pan), `scroll`, `zoom`. Methods: `feed`, `cancel(reason)`, `reset`, `active`, `pinching`, `setDragModifier`, `dispose`. |
| `GesturePointer` | The pointer every gesture reports (`screen`, `canvas`, `kind`, `buttons`, `modifiers`, `pointerId`, `button`). `SurfacePointer`, its old name, is removed: import `GesturePointer`. |
| `RECOGNIZER_DEFAULTS` | Click-or-drag thresholds 4 / 6 / 8 px (mouse / pen / touch), long press after 500 ms for touch and pen, double click within 500 ms and 5 px (`DOUBLE_CLICK`, the package's one double click), pinch at 5 % scale or 10 px pan (read once both fingers have moved as often as each other, or one is three moves ahead, or one lifts). |
| `wheelDeltaPx`, `classifyWheel`, `dampWheelPan`, `WHEEL_DEFAULTS`, `WHEEL_PAN_DEFAULTS` | Wheel normalization: lines and pages to px, Cmd/Ctrl+wheel (and the ctrl+wheel trackpad pinch) zooms by 2^(−dy / 300), Shift turns a vertical wheel horizontal, and a damped pan per event. |
| `toModifiers`, `resolveDragModifier`, `defaultDragModifier`, `isHeld`, `modHeld`, `platformButton` | Modifier keys in one shape; the drag modifier per platform (Cmd on macOS, Alt elsewhere); on macOS a Ctrl+click is the secondary button. |
| `createFrameCoalescer(onFrame, frames, { merge? })` | `schedule(sample)`, `flush()`, `cancel()`, `pending`. One delivery per frame with the latest sample (or `merge`d ones) and how many were folded. Same shape as hypr-tiling's. |
| `dwellReducer`, `DWELL_IDLE`, `dwellDeadline`, `createDwellMachine` | `idle → dwelling → fired`, for spring-loaded targets: hold over the same key long enough and it fires once. |
| `createMachine({ reducer, initial, clock, deadline? })` | Runs a pure reducer on a clock: arms the timer the state's deadline asks for and sends its input when it fires. `state` is reactive. |
| `touchPressReducer`, `TOUCH_PRESS_IDLE`, `touchPressDeadline`, `createTouchPress`, `TOUCH_PRESS_DEFAULTS` | A touch on something draggable in a scrolling page, `idle → pressed → lifted \| scrolled`: before the hold (220 ms), travel mostly along the page's scroll direction (`scroll: "y"` or `"x"`) past 10 px is a scroll, which never lifts (short of 10 px it waits, so a finger scroll reported a few px at a time never lifts on the way); travel past 6 px mostly across it lifts where the finger is; a still finger lifts where it was pressed after the hold. |
| `pagedSwipeReducer`, `PAGED_SWIPE_IDLE`, `pagedSwipeDeadline`, `createPagedSwipe`, `PAGED_SWIPE_DEFAULTS`, `swipeProgress` | Swiping between pages with a trackpad's wheel run or a finger, `idle → armed → tracking → settling → lockout`. It arms only along the swipe (more than twice the cross movement), without Ctrl, with the configured modifier, when nothing under the pointer scrolls further and a page is there; a run that breaks a rule belongs to scrolling until the wheel rests 120 ms. Past 24 px it tracks: `progress` is the travel over the page size, −1 to 1, held at 0 towards a missing page. At the end it commits at 35 % of the page or a peak of 0.6 px/ms towards it (the peak starts over when the travel crosses zero); the host sends `settled` after its transition, and a 350 ms lockout swallows the trackpad's momentum. On x or y (`along`). |

The recognizer takes plain objects the host copies out of DOM events, with
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

A paged swipe, its timers on a clock:

```ts
import { createFakeClock, createPagedSwipe, NO_MODIFIERS } from "@n-uf/motion";

const clock = createFakeClock();
const swipe = createPagedSwipe({ clock });
swipe.send({ type: "context", hasPrev: true, hasNext: true, size: 1000 });
swipe.send({ type: "wheel", dx: 400, dy: 0, t: clock.now(), modifiers: NO_MODIFIERS });
console.log(swipe.state.phase, swipe.state.progress); // tracking 0.4
clock.tick(120); // the wheel rests: past 35 %, it commits
console.log(swipe.state.phase, swipe.state.target); // settling next
swipe.send({ type: "settled" }); // the host's page transition is done: momentum is locked out
console.log(swipe.state.phase); // lockout
```

## drag/

`@n-uf/motion/drag` decides, from the pointer's path, when a drop indicator
shows, which target it shows, when the others make room, and what a release
lands on. It is pure: the host feeds it the pointer once a frame and plain-data
targets, and draws what it says. It is only there, not in the root.

| | |
|---|---|
| `createDragIntent({ home, lift?, liftRect?, floating?, earlyRelease?, tuning?, placeOf? })` | `update(point, time, targets, keys?)` once a frame while an item is dragged, returning `{ shown, room, roomPlace, aiming, atHome, arming, forced, refused, refusedSinceShown }` (`refusedSinceShown`: no target shows and the pointer has crossed a refusal since one last did, so a host that commits only drawn targets commits `release` too, as a quick drag across a refusal let go beyond it has no indicator drawn: read it from an `update` at the release point, called before `release`; the field is required, so a host or mock that builds a frame itself sets it; `arming`: the spring-loaded target the pointer dwells on, not armed yet; `forced`: `"float"` or `"rail"` when a modifier key won (the float key wins over dock targets only: over a refusal, or outside the float's `bounds`, it shows nothing and a release lands nowhere, `refused` naming the refusal); `refused`: the refusal under the pointer, a target marked `refuse: true` that the pick lands on, which no held target's band or grace covers, so nothing shows there and a release lands nowhere: pass a host's refusals in with the targets; a refused place is never drawn (no tint, outline or zone label), and while `refused` is set a host may say "Can't go here" at the pointer; `atHome`: the pointer is back inside `home` after it has been outside `home` itself; never true at the press or while it moves about inside `home`; with `floating` (the held item floats, `home` its box: a free placement, ranked like the float) home holds only where the pick there, home ignored, is no refusal and inside the window, so over a refusal in its box the frame is refused and a release lands nowhere, and on or past the window's edge nothing is picked; a docked item's home holds wherever it lies. A host sets it at lift from the placement layout, `floating: layout.items[id]?.floating === true`: the option is the intent's, read from `@n-uf/placement`'s layout item flag of the same name, not that flag itself. Over home no target is shown and a release does nothing, so a host that wants to say "a drop here returns it" draws its own indicator at the home rect for that frame); `release(point, targets, keys?)`, the target a release lands on or null (home); before the item has settled on a target that follows `earlyRelease`: `"target"` (the default) lands on the shown target, else the one under the pointer, and `"float"` makes what shows what lands, so the item floats where it is (over a refusal or outside the float's `bounds`, nowhere); `hide(time)` while the view scrolls under the pointer; `moveHome(dx, dy)`; `state`; `tuning`. |
| `DRAG_DEFAULTS` | Lift at 5 px (a touch: a 180 ms hold, then 8 px); aiming below 0.45 px/ms over 50 ms, or within 12 px for 90 ms; a 10 px hysteresis margin (`band`) and a 4 px breakthrough, each at most a fifth of the hit areas' extents (`bandShare` 0.2), a 120 ms grace across the gap between two hit areas (`gapGrace`); a switch waits 150 ms (the switch delay); room after 160 ms (`roomAfter`, so a pointer moving across targets doesn't reflow the layout; a target marked `opensRoom`, whose indicator would lie over what its room moves, holds that long, or its own `roomHold` in ms, before it shows and has `room` in the frame that first shows it, and an armed spring-loaded target has its room as it shows; with its room open, one with a `roomHit` (its hit and landing rect) holds in `hit ∪ roomHit`, over a refusal or a target no more precise than it there, while a more precise target past the breakthrough and a held key still win); a spring-loaded target arms after a 200 ms dwell (`railArmDwellMs`: a pass at travelling speed never arms it, and platforms spring-load after a similar rest), never within 16 px of the lift point (`liftZone`: the "changed my mind" spot); Shift floats and ⌘/Ctrl (`"Mod"`, either key) goes to the nearest rail (`modifiers`; Alt is left free, so an app can keep it for unfreezing a frozen layout). Each is overridable per intent. |
| `targetAt(targets, point)`, `inRect(rect, point, margin?)` | The most precise target under a point (priority 1, 2, 3, then the smaller hit area; a rect holds its edges exactly); a point in a rect grown or shrunk by a margin. A `DragTarget` whose hit area isn't one rect gives `hits`, every piece of it (`hit` is then the largest): the pointer is in the hit area when it is in any piece, and the hit area's size, for the smaller-hit-area rule and the drag intent's bands, is the pieces' together. A refusal ranks at `REFUSAL_RANK` (2.5, an ordering rank, not a priority: priorities stay 1, 2 and 3, and `refuse: true` is a refusal's tier; it orders after every target of priority 1 and 2, so a real target wins wherever the two meet or overlap, before the float's 3); `pickRank(t)` gives a target's rank. A zone with `bounds` (a refusal's and the float's: the window's stage) holds only points strictly inside it, its band and gap grace too, so a pointer clamped exactly onto the window's edge (`x + width`; a host that clamps to `width - 0.5` still picks inside) is never in it. This is the one pick rule: `@n-uf/placement/scene/cases` takes it as its hosts' `pick`. |
| `liftDecision({ touch, distance, elapsed }, tuning?)` | `"wait"`, `"lift"` or `"refuse"`: when a press becomes a drag (`"refuse"` is a touch that moved before the hold: scroll wins). |
| `createGripPress({ tuning?, double? })`, `GripRelease`, `DOUBLE_CLICK` | A press on a grip, start to end: `down(point, time, { touch?, clicks? })`, `move(point, time)` (the lift rule), `up(point, time)` → `"click"`, `"doubleActivate"` or null (it lifted). Two presses within `DOUBLE_CLICK` (500 ms and 5 px, the package's one double click, which the recognizer's `clickCount` uses too; browsers don't expose the system setting, so this is the common desktop default; `double` tunes it, and `clicks`, a `mousedown`'s `detail`, overrides it) give a click, then a double-activate: never a second click, never a lift. A press past the lift distance is a drag, also as the second press. |
| `previewPlan(frame, preview, slotted?)`, `DragPreview`, `DRAG_PREVIEW_DEFAULT` | What to draw for a frame under one of four drop preview modes: `{ showIndicator, makeRoom, snapItem }`. `"item"`: the dragged item is the only preview, with no indicator for any target: it sits in a slotted target once the room is open and otherwise stays on the pointer (pair it with `earlyRelease: "float"`, so a release lands what shows). `"indicator"`: only the indicator, nothing moves. `"gap"` (make room): the others make room once the intent does; the item stays under the pointer. `"snap"` (the default): room opens and the item glides into a slotted target's room, with no indicator (a target without a slot keeps it). The object form `{ mode: "outline" \| "placeholder" \| "snap", placeGuides? }` (`DropPreviewMode`) draws with `"indicator"`'s, `"gap"`'s and `"item"`'s plan and adds `guides` (`PlaceGuides`: `"off"`, `"near"`, `"all"`; defaults `PLACE_GUIDES_DEFAULT`: snap and placeholder near, outline off): the guides to draw while no landing shows, `"off"` whenever one does, so a host shows where the item can go or where it will land, never both. The string forms give `guides: "off"`. |
| `createLandingModel({ regions, regionsFor?, floatLanding?, home?, margins?, gates?, approach?, placeGuides? })` | The landing model: where a docking drag lands, as state instead of a per-frame pick. `regions` are the drag's lanes (each with its spots in order: `along` stretch and `landing` rect), refused places, content and what blocks it, the stage and the item's size: what `@n-uf/placement/scene`'s `lanes()` gives, as plain data. `update(point, time, keys?)` returns `{ region, lane, spot, landing, room, guides, shift }`, and `release()` the same answer (`{ kind: "spot" }`, `{ kind: "float", rect }` or null). The stage's edge is the easiest place to dock: a pointer up to `edge` (48 px) past the stage counts as on its edge, deep in the lane drawn there; beyond, nowhere. A held lane holds while the pointer is within `exit` (12 px) of it; over a spot's stretch it is that spot, over a refused stretch refused (`lanes()` joins a stretch shorter than the item to its spots). Entering a lane needs `path` (40 px) of slow path along it inside it (steps of at most `step`, so a crossing at 0.375 px/ms or faster never enters at any angle), or a still step (1.5 px per 8 ms) `depth` (8 px) inside it, the depth counted only from the sides facing into the stage, so a fly-through of a thin bar or rail opens no room. Inside a lane that touches the held one, past its exit margin, the held lane holds until that lane's gate passes or the pointer has slid `path` px along it at any speed (across it at most a third as far), then that lane takes it: lane to lane never passes through the float, and a fast crossing of the touching lane opens no room. Along a lane the spot changes `spot` (6 px) past a boundary; where the change reflows the window (the spots' `others` keys differ), on a step of at most `step` (3 px per 8 ms), or once the held landing trails the pointer by more than `trail` (40 px): a fast hand across docked items reflows only as often as it must to keep the item near, and a change that moves only the held item follows at any speed. With `regionsFor`, a reflowing change is kept only if, in the new spot's own regions (its room open), the pointer still picks it (cached per spot until `setRegions`). Outside lanes: refused, open space (`"open"`: the content less what blocks it, where the float lands), or nowhere. Shift makes a lane or open space open space and hides the guides. Guides (`{ id, lane, kind: "line" \| "box", rect }`, keyed by `id`): a lane's `marks`, else its spots' landings; `"near"` the held lane's, else the approached lane's (within 80 px, kept until another is 16 px nearer or past 96 px), and over a refused place the nearest lane's at any distance; `"all"` every lane's. The model has no waits of its own; steps are normalized to 125 Hz. The host calls `update` whenever it likes (per pointer sample, per animation frame, or both): a repeated point keeps the last step and counts as still only once the pointer has stayed put for `rest` (22 ms) after a slow step or on the stage's edge, else for `pause` (60 ms), so a fast hand with samples far apart (20–30 Hz, dropped events) is never still between them; the first point (the lift) is never still either, so a lift over a lane's band doesn't enter it; and the host need only call again after the pointer stops (every frame does), and calls again with the same point when a key changes. `setRegions(regions, regionsFor?)` remaps spots by id and takes the `regionsFor` that answers for the new state; `hide()` lets the lane go. Additive: `createDragIntent` is unchanged. |

A target is `{ id, priority, hit, slot?, label?, free? }`: `hit` is the hit
area the pointer can be in, `priority` how precise it is (a tab strip 1, an
insertion point 2, a large area 3). The rules:

- The indicator shows only when the pointer has left the item's home, a target
  is under it, and the pointer aims (slows down or holds still). Crossing
  targets at speed shows nothing.
- Hysteresis: the current target keeps the pointer within a margin (`band`)
  around its hit area, unless a more precise target is clearly under the
  pointer. That is for the seam between two tiles only: leaving a `free`
  target (the float) for a tile, or nothing, switches at once, so a hit area at
  the window's edge takes its first px. Both scale with the hit areas:
  along each axis, at most a fifth of the current hit area's extent and of the
  hit area under the pointer, so a small one (a 28 px row) is entered by a
  direct glide from its neighbor. Leaving the shown target, a
  travelling pointer hides the indicator at once; an aiming one moves it once
  the new target has held 150 ms (the switch delay), so no indicator ever shows
  for less.
- Room is made once the shown target, and the place in it (`placeOf`: a tab
  index, say), have held 160 ms; never for a `free` target.
- `placeOf(target, point, previous)` gets the place it gave that target on the
  last sample, so a place can hold near its boundary. A null place is no
  target: nothing shows there (a target beneath with a place can), no room
  opens, and a release there lands on a target beneath, else goes home.
  `placeOf` is also asked about the current target just outside its hit area
  (within the margin or the gap grace): answer the nearest place there, and
  return null only for a part of the target that takes no drop. It runs on
  every sample for each target under the pointer, so keep it cheap.
- A release lands on the shown target whenever one shows (drop = shown), else
  on the target under the pointer, else nowhere. A release over home does
  nothing.
- Spring-loading: a target marked `arm: "dwell"` (a side's rail, say) is no
  target until the pointer has rested in its hit area for `railArmDwellMs`; a
  fast pass, or a drop before then, lands on what lies beneath (the float).
  Armed, it shows at once and its hit area is `armedHit` (grown: a magnet, the
  armed target's band); moving out past that band's outer edge disarms it, and
  re-entering needs a new full dwell. The frame's `arming` lets a host highlight the
  strip while the dwell runs, and say the armed state in its live region. Home
  doesn't gate it: a strip that overlaps the item's own place (an item alone in its
  column, dragged to its own side's edge) arms by dwell there, shows while armed,
  and takes a release over home; an unarmed target, and a target that isn't
  spring-loaded, still never show over home, and a release there does nothing.
  A spring-loaded target arms only after the pointer has entered its hit area
  during the drag: the point the drag starts at counts as not entered, so a drag
  that starts inside the strip (a panel's grip under it at the window's edge)
  must leave it and come back before it arms, while entering from over home
  counts. Nothing arms by dwell within `liftZone` (16 px, about a grip's size)
  of the point the drag was lifted at (`lift`, else the first sample): back
  where it was lifted, a pause is "changed my mind" and commits nothing, even
  with the grip under a strip (a flush drawer at the window's edge). A host can
  give the zone as a rect instead (`liftRect`, the part of the grip the strip
  covers): then nothing arms inside that rect, the radius is not applied, and
  the strip arms just past the grip. Elsewhere,
  home under the strip included, it arms as above, and the rail key still forces
  the rail anywhere, the lift zone too.
- Keys win over geometry: with `keys` passed (`DragKeys`: `{ shift?, alt?, ctrl?,
  meta? }`, the modifiers held on a pointer event; `tuning.modifiers` says which
  key does what, default Shift and ⌘/Ctrl), the float key (Shift) shows and lands
  on the `free` target over a dock target, a spring-loaded one or open space
  inside the window (over a refusal the frame is refused, and outside the
  float's `bounds` nothing shows); the rail key (⌘/Ctrl, `"Mod"`) on the nearest
  spring-loaded target, from anywhere. The frame's `forced` says which won.
- The four drop preview values (`"indicator"`, `"gap"`, `"snap"`, `"item"`) only change what is drawn: all follow
  these rules, so a drop lands where the preview showed it in each.

```ts
import { createDragIntent, type DragTarget } from "@n-uf/motion/drag";

const slot: DragTarget = { id: "slot", priority: 2, hit: { x: 0, y: 0, width: 200, height: 100 } };
const intent = createDragIntent({ home: { x: 300, y: 300, width: 100, height: 50 } });
for (let t = 0; t <= 300; t += 16) intent.update({ x: 100, y: 50 }, t, [slot]); // held still over the slot
console.log(intent.state.shown?.id); // "slot"
console.log(intent.release({ x: 100, y: 50 }, [slot])?.id); // "slot"

// A pane that takes drops on its right half only; that half holds 6 px past the line.
const pane: DragTarget = { id: "pane", priority: 2, hit: { x: 0, y: 0, width: 200, height: 100 } };
const zones = createDragIntent<DragTarget>({
  home: { x: 300, y: 300, width: 100, height: 50 },
  placeOf: (_t, p, previous) => (p.x >= (previous === "right" ? 94 : 100) ? "right" : null),
});
for (let t = 0; t <= 300; t += 16) zones.update({ x: 50, y: 50 }, t, [pane]); // held over its left half
console.log(zones.state.shown, zones.release({ x: 50, y: 50 }, [pane])); // null null: nothing shows, the item goes home
```

The intent works in one coordinate space: the one its targets and home are in. On a page drawn scaled (a zoomed
canvas, a fitted preview), convert each pointer sample into page coordinates first, `(p − origin) / scale`, and the
hysteresis margin, breakthrough and stillness distances stay page px:

```ts
// The page is drawn at half size, its top-left corner at (300, 200) on screen; targets are in page px.
const origin = { x: 300, y: 200 };
const scale = 0.5;
const toPage = (p: { x: number; y: number }) => ({ x: (p.x - origin.x) / scale, y: (p.y - origin.y) / scale });
const onPage = createDragIntent({ home: { x: 600, y: 600, width: 100, height: 50 } });
const screen = { x: 350, y: 225 }; // the pointer, as the browser reports it
for (let t = 0; t <= 300; t += 16) onPage.update(toPage(screen), t, [slot]); // page (100, 50): over the slot
console.log(onPage.state.shown?.id, onPage.release(toPage(screen), [slot])?.id); // "slot" "slot"
```

A host contract: clamp the pointer into the stage (the window the targets tile) before it reaches `update` and
`release`, so a pointer past the window's edge means its nearest point of the window. A drop target at the window's
edge then stays under a hand that overshoots it, which is what makes an edge target easy to hit. Draw the dragged item at
the pointer itself. While a drag is in progress, suppress the context menu (a Ctrl-click on macOS opens one) and the
browser shortcuts of the rail key (⌘/Ctrl): `preventDefault` on `contextmenu`, and on the `keydown` of Meta or Control.
The intent doesn't see DOM events, and the gesture recognizer has no hook for this, so it is the host's job; leave keys
alone when no drag is active.

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
