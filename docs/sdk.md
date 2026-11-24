# SDK surface

Every public entry of the three packages, with its exported functions, constants and types: names, parameters and
return shapes, condensed. It is generated from the code: the `exports` map of each package's `package.json` names the
entries, and each entry file's exports are read with the TypeScript compiler, so the names and signatures here are the
code's at `5357398e`. What each export does, and the rules behind it, are on the design pages
([motion.md](./motion.md), [placement.md](./placement.md), [docking.md](./docking.md)) and the reference pages; how
the packages and their folders fit is [structure.md](./structure.md); the concept across the three is
[concept.md](./concept.md).

How to read the listings:

- `readonly` modifiers are left out, and so is `| undefined` on an optional member.
- An interface that extends another lists only its own members; the inherited ones are its parent's.
- A long member type is cut with `…`; the entry file has it whole.
- `// from placement` marks a type another package declares and this entry re-exports.
- A type a signature names that no listing shows (`ZoneDecl`, `ColumnSide`, `PlaceLike`, …) is internal: it is not
  exported, and a host passes a value of its shape.

| Entry | Purpose |
| --- | --- |
| [`@n-uf/motion`](#n-ufmotion) | Everything host-free in one import: every export of `/clock`, `/signals`, `/values`, `/gestures`, `/drag` and `/layout`, plus the one below. |
| [`@n-uf/motion/clock`](#n-ufmotionclock) | Time: the clock port, the fake clock, the frame loop with its phases, and the frame coalescer. |
| [`@n-uf/motion/signals`](#n-ufmotionsignals) | Reactive values for a host that wants them: `signal`, `computed`, `effect`, `batch`. |
| [`@n-uf/motion/values`](#n-ufmotionvalues) | Values that animate: the animator interface, springs, tweens, the settle curve, easing, `reveal`, `popIn`, and `motionValue` on a frame loop. |
| [`@n-uf/motion/gestures`](#n-ufmotiongestures) | Input: the gesture recognizer, modifier keys, wheel rules, the machine runner and the dwell, touch-press and paged-swipe machines. |
| [`@n-uf/motion/testing`](#n-ufmotiontesting) | Frame-sampled checks of the motion rules, for tests and browser specs. |
| [`@n-uf/motion/drag`](#n-ufmotiondrag) | Pointer intent in a drag: the drag intent, the pick, lift and grip rules, preview plans, guide rects and the landing model. |
| [`@n-uf/motion/layout`](#n-ufmotionlayout) | Layout motion: many rects settling on one loop, the real item held under the pointer, and `anchoredMorph`. |
| [`@n-uf/motion/browser`](#n-ufmotionbrowser) | Everything that touches a host: the browser clock, the reduced-motion query and the DOM writers. |
| [`@n-uf/placement`](#n-ufplacement) | What every entry shares: the shapes, their geometry, `Side` and `Axis`, and the drop-target shape `Target`. |
| [`@n-uf/placement/stack`](#n-ufplacementstack) | One edge: the cut of a stage into bands, the fit of an edge's items with their form ladders, asked lengths and dividers, one edge's drop places, and the float fit. |
| [`@n-uf/placement/tiling`](#n-ufplacementtiling) | Panes that divide an area: order layouts, the split tree, the drop rules and regions, and a tiling drag (`tilingDrag`: its layout half and its hit half, its adapter and their conformance runs). |
| [`@n-uf/placement/popup`](#n-ufplacementpopup) | A popup positioned as Wayland's xdg-positioner does. |
| [`@n-uf/docking`](#n-ufdocking) | One model of a whole window: the dock state, `solve`, the changes, targets and refusals, lanes, `dockDrag` and storage. |
| [`@n-uf/docking/testing`](#n-ufdockingtesting) | The conformance rows, the landing rows, their runners and reference hosts, and the `AssertLanding` and `AssertGeometry` type checks. |

## Package @n-uf/motion

### `@n-uf/motion`

Everything host-free in one import: every export of `/clock`, `/signals`, `/values`, `/gestures`, `/drag` and `/layout`, plus the one below.

Functions:

```ts
shapeEquals(a: Animatable, b: Animatable): boolean
```

### `@n-uf/motion/clock`

Time: the clock port, the fake clock, the frame loop with its phases, and the frame coalescer.

Functions:

```ts
createFakeClock(options?: FakeClockOptions): FakeClock
createFrameCoalescer<T>(onFrame: (sample: T, count: number) => void, frames: FrameSource, options?: CoalescerOptions<T>): FrameCoalescer<T>
createFrameLoop(options: FrameLoopOptions): FrameLoop
```

Constants:

```ts
const PHASES: Phase[]
```

Types:

```ts
interface ClockPort {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, ms: number): number;
  clearTimer(handle: number): void;
}
interface CoalescerOptions<T> { merge?: (pending: T, next: T) => T }
interface FakeClock extends ClockPort {
  frameInterval: number;
  pendingFrames: number;
  pendingTimers: number;
  tick(ms: number): void;
  spend(ms: number): void;
  frame(dt?: number): number;
  frames(count: number, dt?: number): number;
  runUntilIdle(options?: { maxFrames?: number; dt?: number; }): number;
}
interface FakeClockOptions { now?: number; frameInterval?: number }
interface FrameCoalescer<T> { schedule(sample: T): void; flush(): boolean; cancel(): void; pending: boolean }
interface FrameInfo { time: number; delta: number; index: number; phase: Phase; budget: number; elapsed(): number; remaining(): number }
interface FrameLoop {
  clock: ClockPort;
  budget: number;
  active: boolean;
  phase: Phase | null;
  schedule(phase: Phase, task: FrameTask, options?: ScheduleOptions): () => void;
  repeat(phase: Phase, task: RepeatingTask): () => void;
  scheduler(phase: Phase): (run: () => void) => void;
  frames(phase: Phase): FrameSource;
  stats(): FrameStats;
  resetStats(): void;
  dispose(): void;
}
interface FrameLoopOptions {
  clock: ClockPort;
  budget?: number;
  frameInterval?: number;
  maxDelta?: number;
  maxRounds?: number;
  onError?: (error: unknown, phase: Phase) => void;
  onOverBudget?: (stats: FrameStats) => void;
}
type FrameSource = Pick<ClockPort, "requestFrame" | "cancelFrame">
interface FrameStats {
  frames: number;
  overBudget: number;
  deferred: number;
  errors: number;
  lastFrame: number;
  longestFrame: number;
  meanFrame: number;
  perPhase: Readonly<Record<Phase, number>>;
  repeating: number;
  queued: number;
}
type FrameTask = (frame: FrameInfo) => void
type Phase = "input" | "update" | "layout" | "write"
type RepeatingTask = (frame: FrameInfo) => boolean | void
interface ScheduleOptions { deferrable?: boolean }
type TimerSource = Pick<ClockPort, "now" | "setTimer" | "clearTimer">
```

### `@n-uf/motion/signals`

Reactive values for a host that wants them: `signal`, `computed`, `effect`, `batch`.

Functions:

```ts
batch<T>(fn: () => T): T
computed<T>(fn: (previous: T | undefined) => T, options?: SignalOptions<T>): ReadonlySignal<T>
effect(fn: () => void | EffectCleanup, options?: EffectOptions): () => void
isSignal(value: unknown): value is ReadonlySignal<unknown>
signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>
untracked<T>(fn: () => T): T
```

Types:

```ts
type EffectCleanup = () => void
interface EffectOptions { schedule?: (run: () => void) => void }
type Equals<T> = (previous: T, next: T) => boolean
interface ReadonlySignal<T> { value: T; peek(): T }
interface Signal<T> extends ReadonlySignal<T> { value: T }
interface SignalOptions<T> { equals?: false | Equals<T> }
```

### `@n-uf/motion/values`

Values that animate: the animator interface, springs, tweens, the settle curve, easing, `reveal`, `popIn`, and `motionValue` on a frame loop.

Functions:

```ts
createSettle<T extends Animatable>(initial: T, config?: SettleConfig): Settle<Widen<T>>
createSpring<T extends Animatable>(initial: T, config?: SpringConfig): Spring<Widen<T>>
createTween<T extends Animatable>(initial: T, config?: TweenConfig): Tween<Widen<T>>
cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing
ease(progress: number): number
easeIn(progress: number): number
easeInOut(progress: number): number
easeInOutCubic(progress: number): number
easeOut(progress: number): number
easeOutCubic(progress: number): number
linear(progress: number): number
motionValue<A extends Animator<unknown>>(loop: FrameLoop, animator: A, options?: MotionOptions): MotionValue<AnimatorValue<A>, A>
popIn(progress: number, from?: number): PopIn
resolveSpring(config?: SpringConfig): SpringParams
reveal(drawn: Rect, target: Rect): RevealFrame
settleValue<T extends Animatable>(loop: FrameLoop, initial: T, options?: SettleConfig & MotionOptions): MotionValue<Widen<T>, Settle<Widen<T>>>
springStep(state: SpringState, target: number, params: SpringParams, dt: number): SpringState
springValue<T extends Animatable>(loop: FrameLoop, initial: T, options?: SpringConfig & MotionOptions): MotionValue<Widen<T>, Spring<Widen<T>>>
tweenValue<T extends Animatable>(loop: FrameLoop, initial: T, options?: TweenConfig & MotionOptions): MotionValue<Widen<T>, Tween<Widen<T>>>
```

Constants:

```ts
const SETTLE_DEFAULTS: { omega: 25; restDelta: 0.1; }
const SETTLE_TEMPO: { calm: 20; default: 25; quick: 37; }
const SPRING_DEFAULTS: SpringParams
```

Types:

```ts
type Animatable = number | Point | Rect | Vector
interface Animator<T> {
  value: T;
  velocity: T;
  target: T;
  settled: boolean;
  setTarget(target: T): void;
  setVelocity(velocity: T): void;
  jumpTo(value: T): void;
  snap(): void;
  step(dt: number): boolean;
}
type AnimatorValue<A> = A extends Animator<infer T> ? T : never
type Easing = (progress: number) => number
interface MotionOptions { phase?: Phase; reducedMotion?: boolean | (() => boolean) }
interface MotionValue<T, A extends Animator<unknown> = Animator<T>> extends ReadonlySignal<T> {
  target: T;
  velocity: T;
  moving: boolean;
  animator: A;
  set(target: T, options?: SetOptions<T>): void;
  jump(value: T): void;
  snap(): void;
  follow(source: () => T): () => void;
  onSettle(listener: (value: T) => void): () => void;
  subscribe(listener: (value: T) => void): () => void;
  dispose(): void;
}
interface Point { x: number; y: number }
interface PopIn { scale: number; opacity: number }
interface Rect { x: number; y: number; width: number; height: number }
interface RevealFrame { dx: number; dy: number; width: number; height: number; clipRight: number; clipBottom: number }
interface SetOptions<T> { velocity?: T }
interface Settle<T> extends Animator<T> { omega: number; setVelocity(velocity: T): void; configure(config: SettleConfig): void }
interface SettleConfig { omega?: number; restDelta?: number }
interface Spring<T> extends Animator<T> { params: SpringParams; setVelocity(velocity: T): void; configure(config: SpringConfig): void }
interface SpringConfig { stiffness?: number; damping?: number; dampingRatio?: number; mass?: number; restDelta?: number; restSpeed?: number }
interface SpringParams { stiffness: number; damping: number; dampingRatio: number; mass: number; restDelta: number; restSpeed: number }
interface SpringState { value: number; velocity: number }
interface Tween<T> extends Animator<T> { progress: number; configure(config: TweenConfig): void }
interface TweenConfig { duration?: number; easing?: Easing }
type Vector = number[]
type Widen<T> = T extends number ? number : T extends Vector ? Vector : T extends Rect ? Rect : T extends Point ? Point : never
```

### `@n-uf/motion/gestures`

Input: the gesture recognizer, modifier keys, wheel rules, the machine runner and the dwell, touch-press and paged-swipe machines.

Functions:

```ts
classifyWheel(delta: Point, modifiers: Modifiers, opts?: WheelOptions): WheelIntent
createDwellMachine<K = string, P = unknown>(options: DwellMachineOptions): Machine<DwellState<K, P>, DwellInput<K, P>>
createMachine<S, E>(options: MachineOptions<S, E>): Machine<S, E>
createPagedSwipe(options: PagedSwipeOptions): Machine<PagedSwipeState, PagedSwipeInput>
createRecognizer(options: RecognizerOptions, emit: (gesture: InputGesture) => void): Recognizer
createTouchPress(options: TouchPressOptions): Machine<TouchPressState, TouchPressInput>
dampWheelPan(delta: Point, opts?: WheelPanOptions): Point
defaultDragModifier(platform: Platform): ModifierKey
dwellDeadline<K, P>(state: DwellState<K, P>, config?: DwellConfig): Deadline<DwellInput<K, P>> | null
dwellReducer<K, P>(state: DwellState<K, P>, event: DwellInput<K, P>, config?: DwellConfig): DwellState<K, P>
isHeld(modifiers: Partial<Modifiers> | undefined, key: ModifierKey | null): boolean
modHeld(modifiers: Modifiers, platform: Platform): boolean
pagedSwipeDeadline(state: PagedSwipeState, config?: PagedSwipeConfig): Deadline<PagedSwipeInput> | null
pagedSwipeReducer(state: PagedSwipeState, event: PagedSwipeInput, config?: PagedSwipeConfig): PagedSwipeState
platformButton(press: { kind: PointerKind; button: number; modifiers: Modifiers; }, platform: Platform, dragModifier: ModifierKey | null): number
resolveDragModifier(config: ModifierKey | null | undefined, platform: Platform): ModifierKey | null
swipeProgress(travel: number, size: number, c: PagedSwipeContext, wrap: boolean): number
toModifiers(m: Partial<Modifiers> | undefined): Modifiers
touchPressDeadline(state: TouchPressState, config?: TouchPressConfig): Deadline<TouchPressInput> | null
touchPressReducer(state: TouchPressState, event: TouchPressInput, config?: TouchPressConfig): TouchPressState
wheelDelta(deltaX: number, deltaY: number, deltaMode: 0 | 1 | 2, opts?: WheelOptions): Point
```

Constants:

```ts
const DOUBLE_CLICK: DoubleClick
const DWELL_DEFAULTS: DwellConfig
const DWELL_IDLE: DwellState<never, never>
const NO_MODIFIERS: Readonly<Modifiers>
const PAGED_SWIPE_DEFAULTS: PagedSwipeConfig
const PAGED_SWIPE_EMPTY_CONTEXT: PagedSwipeContext
const PAGED_SWIPE_IDLE: PagedSwipeState
const RECOGNIZER_DEFAULTS: Readonly<{ thresholds: Readonly<Record<PointerKind, number>>; longPress: Readonly<{ ms: 500; kinds: PointerKind[]; }>; multiClick: DoubleCl…
const TOUCH_PRESS_DEFAULTS: TouchPressConfig
const TOUCH_PRESS_IDLE: TouchPressState
const WHEEL_DEFAULTS: Readonly<WheelOptions>
const WHEEL_PAN_DEFAULTS: Readonly<WheelPanOptions>
```

Types:

```ts
type CancelReason = "pointercancel" | "lostcapture" | "multitouch" | "missed-up" | "escape" | "reset" | (string & {})
interface Deadline<E> { at: number; event: (t: number) => E }
interface DoubleClick { ms: number; px: number }
interface DwellConfig { dwell: number }
type DwellInput<K = string, P = unknown> = { type: "hover"; t: number; key: K | null; payload?: P; } | { type: "tick"; t: number; } | { type: "reset"; }
interface DwellMachineOptions { clock: TimerSource; config?: Partial<DwellConfig> }
type DwellState<K = string, P = unknown> = { phase: "idle"; } | { phase: "dwelling"; key: K; since: number; payload: P | undefined; } | { phase: "fired"; key: K; since: number; firedAt: number; payload: P | undefined; }
interface GesturePointer { screen: Point; canvas: Point; kind: PointerKind; buttons: number; modifiers: Modifiers; pointerId: number; button: number; time: number; pressure?: number }
type InputGesture =
  | { type: "press"; pointer: GesturePointer; }
  | (PointerGestureBase & { type: "dragStart"; })
  | (PointerGestureBase & { type: "move"; })
  | (PointerGestureBase & { type: "longPress"; })
  | (PointerGestureBase & { type: "release"; click: boolean; clickCount: number; dragged: boolean; })
  | (PointerGestureBase & { type: "cancel"; reason: CancelReason; dragged: boolean; })
  | { type: "hover"; pointer: GesturePointer; }
  | { type: "pinch"; phase: "start" | "update" | "end" | "cancel"; source: "touch" | "trackpad"; kind: "pinch" | "pan"; center: { screen: Point; canvas: Point; }; scale: number; pan: Point; modifiers: Modifiers; time: number; }
  | { type: "scroll"; delta: Point; at: { screen: Point; canvas: Point; }; modifiers: Modifiers; time: number; }
  | { type: "zoom"; factor: number; at: { screen: Point; canvas: Point; }; modifiers: Modifiers; time: number; }
type InputGestureType = InputGesture["type"]
interface Machine<S, E> { state: S; peek(): S; send(event: E): S; subscribe(listener: (next: S, previous: S, event: E) => void): () => void; dispose(): void }
interface MachineOptions<S, E> { reducer: (state: S, event: E) => S; initial: S; clock: TimerSource; deadline?: (state: S) => Deadline<E> | null }
type ModifierKey = keyof Modifiers | "mod"
interface Modifiers { shift: boolean; alt: boolean; meta: boolean; ctrl: boolean }
interface PagedSwipeConfig {
  threshold: number;
  commitFraction: number;
  commitVelocity: number;
  idle: number;
  lockout: number;
  wrap: boolean;
  size: number;
  modifier: ModifierKey | null;
  along: "x" | "y";
}
interface PagedSwipeContext { hasPrev: boolean; hasNext: boolean; size: number | null; blocked: boolean }
type PagedSwipeInput =
  | { type: "wheel"; dx: number; dy: number; t: number; modifiers: Modifiers; canScrollFurther?: boolean; size?: number; }
  | { type: "touch-start"; x: number; y: number; t: number; size?: number; }
  | { type: "touch-move"; x: number; y: number; t: number; canScrollFurther?: boolean; size?: number; }
  | { type: "touch-end"; t: number; }
  | { type: "tick"; t: number; }
  | { type: "settled"; }
  | { type: "cancel"; }
  | { type: "block"; on: boolean; }
  | { type: "context"; hasPrev: boolean; hasNext: boolean; size?: number; }
interface PagedSwipeOptions { clock: TimerSource; config?: Partial<PagedSwipeConfig> }
type PagedSwipeState =
  | (Base & { phase: "idle"; lastWheel: number | null; claimed: boolean; })
  | (Base & { phase: "armed"; input: Input; origin: { x: number; y: number; }; travel: number; cross: number; last: number; })
  | (Base & { phase: "tracking"; input: Input; origin: { x: number; y: number; }; travel: number; last: number; peak: number; })
  | (Base & { phase: "settling"; input: Input; outcome: "commit" | "cancel"; ended: number; lastWheel: number; })
  | (Base & { phase: "lockout"; until: number; lastWheel: number; })
type Platform = "mac" | "other"
interface Point { x: number; y: number }
type PointerKind = "mouse" | "pen" | "touch"
type RawInputEvent = RawPointerEvent | RawWheelEvent | RawSafariGestureEvent
interface RawPointerEvent {
  type: RawPointerType;
  pointerId: number;
  pointerType: string;
  isPrimary?: boolean;
  button: number;
  buttons: number;
  screen: Point;
  modifiers?: Partial<Modifiers>;
  time: number;
  pressure?: number;
  lostBy?: "view" | "content";
}
type RawPointerType = "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture"
interface RawSafariGestureEvent { type: "gesturestart" | "gesturechange" | "gestureend"; scale: number; screen: Point; modifiers?: Partial<Modifiers>; time: number }
interface RawWheelEvent { type: "wheel"; deltaX: number; deltaY: number; deltaMode: 0 | 1 | 2; screen: Point; modifiers?: Partial<Modifiers>; time: number }
interface Recognizer {
  feed(event: RawInputEvent): void;
  cancel(reason: CancelReason): void;
  reset(): void;
  active(): { pointerId: number; kind: PointerKind; dragging: boolean; } | null;
  pinching(): boolean;
  setDragModifier(key: ModifierKey | null): void;
  dispose(): void;
}
interface RecognizerOptions {
  toCanvas?: (screen: Point) => Point;
  timers?: RecognizerTimers;
  dragModifier?: ModifierKey | null;
  platform?: Platform;
  thresholds?: Partial<Record<PointerKind, number>>;
  longPress?: { ms?: number; kinds?: PointerKind[]; };
  multiClick?: { ms?: number; px?: number; };
  pinch?: { scaleThreshold?: number; panThreshold?: number; };
  wheel?: Partial<WheelOptions>;
  stale?: number;
}
type RecognizerTimers = Pick<ClockPort, "setTimer" | "clearTimer">
type SwipeSide = "prev" | "next"
interface TouchPressConfig { lift: number; scrollEscape: number; scroll: "x" | "y"; hold: number }
type TouchPressInput = { type: "press"; t: number; point: Point; } | { type: "move"; point: Point; } | { type: "tick"; t: number; } | { type: "release"; }
interface TouchPressOptions { clock: TimerSource; config?: Partial<TouchPressConfig> }
type TouchPressState = { phase: "idle"; } | { phase: "pressed"; from: Point; since: number; } | { phase: "lifted"; from: Point; at: Point; } | { phase: "scrolled"; from: Point; }
type WheelIntent = { kind: "zoom"; factor: number; } | { kind: "scroll"; delta: Point; }
interface WheelOptions { lineHeight: number; pageHeight: number; zoomSensitivity: number }
interface WheelPanOptions { speed: number; threshold: number; max: number }
```

### `@n-uf/motion/testing`

Frame-sampled checks of the motion rules, for tests and browser specs.

Functions:

```ts
checkContentScale(samples: ScaleSample[], options?: { uniformOnly?: boolean; tolerance?: number; }): CheckResult
checkHeld(samples: HeldSample[], tolerance?: number): CheckResult
checkMonotonic(samples: RectSample[], to: Rect, tolerance?: number): CheckResult
checkNoJumps(samples: TargetSample[], omega: number, slack?: number): CheckResult
checkNoOvershoot(samples: RectSample[], from: Rect, to: Rect, tolerance?: number): CheckResult
checkTempo(samples: RectSample[], from: Rect, to: Rect, t90: number, tolerance?: number, startT?: number): TempoResult
```

Types:

```ts
interface CheckResult { ok: boolean; failures: string[] }
interface HeldSample extends RectSample { expected: Rect }
interface RectSample { t: number; rect: Rect }
interface ScaleSample { t: number; a: number; d: number }
interface TargetSample extends RectSample { target: Rect }
interface TempoResult extends CheckResult { t90: number | null }
```

### `@n-uf/motion/drag`

Pointer intent in a drag: the drag intent, the pick, lift and grip rules, preview plans, guide rects and the landing model.

Functions:

```ts
createDragIntent<T extends DragTarget>(options: DragIntentOptions<T>): DragIntent<T>
createGripPress(options?: { tuning?: Partial<DragTuning>; double?: Partial<DoubleClick>; }): GripPress
createLandingModel(options: LandingOptions): LandingModel
guideRects<G extends PlacedGuide>(guides: G[], options: GuideRectsOptions): G[]
guidesOf(preview: DragPreview | PreviewMode): PlaceGuides
inRect(rect: Rect, point: Point, margin?: number): boolean
isHeld(modifiers: Partial<Modifiers> | undefined, key: ModifierKey | null): boolean
liftDecision(press: { touch: boolean; distance: number; elapsed: number; }, tuning?: Partial<DragTuning>): LiftDecision
pickRank(t: Pick<DragTarget, "priority" | "refuse">): number
previewPlan<T extends DragTarget>(frame: PreviewFrame<T>, preview: DragPreview | PreviewMode, slotted?: boolean): PreviewPlan
targetAt<T extends DragTarget>(targets: T[], point: Point): T | null
```

Constants:

```ts
const DRAG_DEFAULTS: DragTuning
const DRAG_PREVIEW_DEFAULT: DragPreview
const LANDING_APPROACH: LandingApproach
const LANDING_GATES: LandingGates
const LANDING_MARGINS: LandingMargins
const LANDING_MODIFIERS: LandingModifiers
const LANDING_TOUCH_MARGINS: LandingMargins
const MIN_BOX_LENGTH: 8
const PLACE_GUIDES_DEFAULT: Readonly<Record<PreviewMode, PlaceGuides>>
const REFUSAL_RANK: 2.5
```

Types:

```ts
interface ClearRect { rect: Rect; clearance: number; kinds?: ("line" | "box" | "hatch")[] }
interface DragFrame<T extends DragTarget> {
  shown: T | null;
  room: boolean;
  roomPlace: string | null;
  aiming: boolean;
  atHome: boolean;
  arming: T | null;
  forced: "float" | "armed" | null;
  refused: T | null;
  landing: T | null;
}
interface DragIntent<T extends DragTarget> {
  update(point: Point, time: number, targets: T[], keys?: DragKeys): DragFrame<T>;
  release(point: Point, time: number, targets: T[], keys?: DragKeys): T | null;
  setBounds(bounds: Rect | undefined): void;
  hide(time: number): void;
  moveHome(dx: number, dy: number): void;
  state: DragIntentState<T>;
  tuning: DragTuning;
}
interface DragIntentOptions<T extends DragTarget> { home?: Rect; lift?: Point; bounds?: Rect; tuning?: Partial<DragTuning>; placeOf?: (target: T, point: Point, previous: string | null) => strin… }
interface DragIntentState<T extends DragTarget> { speed: number; current: T | null; shown: T | null; leftHome: boolean }
type DragKeys = Partial<Modifiers>
interface DragModifiers { on: boolean; floatKey: ModifierKey; armKey: ModifierKey }
interface DragPreview { mode: PreviewMode; placeGuides?: PlaceGuides }
interface DragTarget {
  id: string;
  priority: 1 | 2 | 3;
  hit: Rect;
  hits?: Rect[];
  slot?: Rect;
  label?: string;
  free?: boolean;
  arm?: "dwell";
  armedHit?: Rect;
  refuse?: true;
  bounds?: Rect;
  opensRoom?: true;
  roomHold?: number;
  roomHit?: Rect;
}
interface DragTuning {
  lift: number;
  touchHold: number;
  touchLift: number;
  speedWindow: number;
  aimSpeed: number;
  still: number;
  dwell: number;
  band: number;
  breakthrough: number;
  bandShare: number;
  gapGrace: number;
  switchHold: number;
  roomAfter: number;
  homeInset: number;
  armAfter: number;
  liftZone: number;
  modifiers: DragModifiers;
}
interface GripPress {
  down(point: Point, time: number, options?: { touch?: boolean; clicks?: number; }): void;
  move(point: Point, time: number): LiftDecision;
  up(point: Point, time: number): GripRelease;
  cancel(): void;
}
type GripRelease = "click" | "doubleActivate" | null
interface GuideRectsOptions { inside: Rect; inset?: number; clear?: (Rect | ClearRect)[]; clearance?: number; minThickness?: number; lineThickness?: number; minLength?: number }
interface LandingApproach { reach: number; keep: number; nearer: number }
interface LandingFrame {
  region: LandingRegion;
  lane: string | null;
  spot: string | null;
  held: LandingHeld | null;
  landing: Rect | null;
  room: boolean;
  guides: LandingGuideRef[];
  shift: boolean;
  pending?: string;
}
interface LandingGates { path: number; depth: number; stillSpeed: number; stepSpeed: number; trail: number; rest: number; pause: number; slideSpeed: number }
interface LandingGeometry { regions: LandingRegions; landingOf: (held: LandingHeld) => Rect | null; spotsOf?: (spot: string) => LandingSpot[] | null }
interface LandingGuideRef { lane: string; held: LandingHeld | null }
type LandingHeld = { kind: "spot"; lane: string; spot: string; point: Point; } | { kind: "float"; point: Point; }
interface LandingLane { id: string; rect: Rect; axis: "x" | "y"; spots: LandingSpot[]; refused: { along: [number, number]; }[]; owns?: boolean }
interface LandingMargins { exit: number; spot: number; edge: number; lift?: number }
interface LandingModel {
  update(point: Point, time: number, keys?: DragKeys): LandingFrame;
  release(point: Point, time: number, keys?: DragKeys): LandingRelease;
  setGeometry(geometry: LandingGeometry): void;
  hide(): void;
  frame: LandingFrame;
}
type LandingModifiers = Pick<DragModifiers, "on" | "floatKey">
interface LandingOptions extends LandingGeometry {
  home?: { lane: string; spot: string; };
  lift?: Point;
  margins?: Partial<LandingMargins>;
  gates?: Partial<LandingGates>;
  approach?: Partial<LandingApproach>;
  modifiers?: Partial<LandingModifiers>;
  preview?: DragPreview | PreviewMode;
}
type LandingRegion = "lane" | "open" | "refused" | "nowhere"
interface LandingRegions { lanes: LandingLane[]; refused: Rect[]; content: Rect; blocked: Rect[]; stage: Rect }
type LandingRelease = { kind: "spot"; lane: string; spot: string; point: Point; home: boolean; } | { kind: "float"; point: Point; } | null
interface LandingSpot { id: string; along: [number, number]; landing: Rect; others?: string; home?: boolean }
type LiftDecision = "wait" | "lift" | "refuse"
type ModifierKey = keyof Modifiers | "mod"
interface Modifiers { shift: boolean; alt: boolean; meta: boolean; ctrl: boolean }
interface PlacedGuide { kind: "line" | "box" | "hatch"; rect: Rect; axis?: "x" | "y" }
type PlaceGuides = "off" | "near" | "all"
interface Point { x: number; y: number }
type PreviewFrame<T extends DragTarget = DragTarget> = Pick<DragFrame<T>, "shown" | "room"> | { region: LandingRegion; landing: Rect | null; room: boolean; }
type PreviewMode = "outline" | "placeholder" | "glide" | "snap"
interface PreviewPlan { showIndicator: boolean; makeRoom: boolean; snapItem: boolean; guides: PlaceGuides }
interface Rect { x: number; y: number; width: number; height: number }
```

### `@n-uf/motion/layout`

Layout motion: many rects settling on one loop, the real item held under the pointer, and `anchoredMorph`.

Functions:

```ts
anchoredMorph(size: BoxSize, anchor: Point, config?: SettleConfig): AnchoredMorph
createLayoutMotion(options: LayoutMotionOptions): LayoutMotion
holdItem(item: LayoutItem, grab: Point): HeldDrag
```

Constants:

```ts
const MORPH_TEMPO: 37
```

Types:

```ts
interface AnchoredMorph {
  size: BoxSize;
  anchor: Point;
  target: { size: BoxSize; anchor: Point; };
  settled: boolean;
  progress: number;
  to(size: BoxSize, anchor: Point): boolean;
  jumpTo(size: BoxSize, anchor: Point): void;
  step(dt: number): boolean;
  rectAt(point: Point): Rect;
}
interface BoxSize { width: number; height: number }
interface Drawable { layOut(box: Rect): void; draw(frame: DrawFrame): void }
interface DrawEntry { id: string; frame: DrawFrame }
interface DrawFrame { drawn: Rect; box: Rect; reveal: RevealFrame; pop: PopIn; shown: number; gone: boolean }
interface HeldDrag {
  pointer: Point | null;
  held: Rect | null;
  snapped: Rect | null;
  returning: boolean;
  move(pointer: Point): void;
  snapTo(slot: Rect | null): "snapped" | "left" | null;
  follow(): boolean;
  preview(plan: { snapItem: boolean; }, slot: Rect | null): "snapped" | "left" | null;
  resize(size: { width: number; height: number; }, grab?: Point): boolean;
  grab: Point;
  land(slot: Rect): Rect;
  cancel(home: Rect): Rect;
}
interface LayoutItem {
  id: string;
  drawn: Rect;
  target: Rect;
  box: Rect;
  settled: boolean;
  shown: number;
  showing: boolean;
  shownSettled: boolean;
  moveTo(to: Rect): void;
  retarget?(to: Rect): void;
  jumpTo(to: Rect): void;
  glideFrom(from: Rect, to: Rect): void;
  hold(r: Rect): void;
  show(on: boolean, options?: { now?: boolean; }): void;
  redraw(): void;
}
interface LayoutMotion {
  add(id: string, drawable: Drawable, at: Rect, options?: { shown?: boolean; }): LayoutItem;
  get(id: string): LayoutItem | undefined;
  remove(id: string): void;
  retain(ids: Iterable<string>): void;
  flush(): void;
  items: ReadonlyMap<string, LayoutItem>;
  task(task: LayoutTask): () => void;
  onFrame(listener: (frame: FrameInfo) => void): () => void;
  wake(): void;
  configure(config: { omega?: number; }): void;
  idle(): Promise<void>;
  dispose(): void;
}
interface LayoutMotionOptions {
  loop: FrameLoop;
  omega?: number;
  phase?: Phase;
  popFrom?: number;
  reducedMotion?: boolean | (() => boolean);
  onDraw?: (batch: DrawEntry[]) => void;
  onActiveChange?: (active: boolean) => void;
}
type LayoutTask = (frame: FrameInfo) => boolean | void
interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }
```

### `@n-uf/motion/browser`

Everything that touches a host: the browser clock, the reduced-motion query and the DOM writers.

Functions:

```ts
createBrowserClock(options?: BrowserClockOptions): ClockPort
domDrawable(nodes: BoxNodes): Drawable
drawBox(nodes: BoxNodes, frame: DrawFrame): void
flip(entries: FlipEntry[], change: () => void): void
layOutBox(node: Styled, box: Rect): void
prefersReducedMotion(host?: BrowserHost): () => boolean
rectOf(r: RectLike): Rect
```

Types:

```ts
interface BoxNodes { node: Styled; frame?: Styled; content?: Styled }
interface BrowserClockOptions { host?: BrowserHost; fallbackFrameInterval?: number }
interface BrowserHost {
  requestAnimationFrame?(callback: (time: number) => void): number;
  cancelAnimationFrame?(handle: number): void;
  setTimeout(callback: () => void, ms?: number): unknown;
  clearTimeout(handle: unknown): void;
  performance?: { now(): number; };
  matchMedia?(query: string): { matches: boolean; };
}
interface FlipEntry { item: LayoutItem; node: Measurable; place: (before: Rect) => { from: Rect; to: Rect; } }
interface Measurable { getBoundingClientRect(): RectLike }
interface RectLike { left: number; top: number; width: number; height: number }
interface Styled { style: StyleLike }
interface StyleLike { left: string; top: string; width: string; height: string; transform: string; opacity: string; clipPath: string; visibility: string }
```

## Package @n-uf/placement

### `@n-uf/placement`

What every entry shares: the shapes, their geometry, `Side` and `Axis`, and the drop-target shape `Target`.

Functions:

```ts
area(r: Rect): number
center(r: Rect): Point
clamp(v: number, lo: number, hi: number): number
clampInto(r: Rect, area: Rect): Rect
contains(r: Rect, p: Point, eps?: number): boolean
overlap(a: Rect, b: Rect): number
overlaps(a: Rect, b: Rect, eps?: number): boolean
rect(x: number, y: number, width: number, height: number): Rect
subtract(r: Rect, cut: Rect): Rect[]
```

Constants:

```ts
const EPS: 0.000001
const PLANE: Rect
```

Types:

```ts
type Axis = "x" | "y"
interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }
type Side = "top" | "right" | "bottom" | "left"
interface Size { width: number; height: number }
interface Target { id: string; priority: 1 | 2 | 3; hit: Rect; hits?: Rect[]; slot?: Rect; label?: string; free?: boolean; refuse?: true; bounds?: Rect }
```

### `@n-uf/placement/stack`

One edge: the cut of a stage into bands, the fit of an edge's items with their form ladders, asked lengths and dividers, one edge's drop places, and the float fit.

Functions:

```ts
controlLadder(spec: ControlLadderSpec): ControlLadder
cutEdges(stage: Rect, bands: EdgeBand[]): EdgeCut
dividers(input: StackInput, fit: StackFit): StackDivider[]
fitFloat(want: Rect, stage: Rect, avoid?: Rect[], options?: FloatFitOptions): FloatFit
fitStack(input: StackInput, options?: FitOptions): StackFit
formBody(f: StackForm): boolean
formCompact(f: StackForm): boolean
formCrossMin(f: StackForm): number
formFitsCross(f: StackForm, cross: number): boolean
formFolded(f: StackForm): boolean
formMain(f: StackForm, which: "min" | "natural", cross: number): number
formMenu(f: StackForm): boolean
formOwnCross(f: StackForm): boolean
formSetsCross(f: StackForm): boolean
formStepGroup(f: StackForm): string
itemSteps(item: { fixed?: boolean; stepping?: boolean; }): boolean
resetBetween(input: StackInput, before: string, after: string, options?: FitOptions): StackInput
resetLengths(input: StackInput): StackInput
resizeBetween(input: StackInput, before: string, after: string, delta: number, options?: FitOptions): StackInput
stackGaps(input: StackInput, item: StackItem, options?: StackGapOptions): StackGap[]
withItem(input: StackInput, item: StackItem, at: number): StackInput
wrapCross(spec: WrapSpec): { natural: number; min: number; }
wrapLines(spec: WrapSpec, cross: number): { lines: number[][]; width: number; fits: boolean; }
wrapRows(spec: WrapSpec, cross: number): { rows: number; width: number; fits: boolean; }
```

Constants:

```ts
const DEFAULT_MENU: 28
const DEFAULT_RAIL: 30
```

Types:

```ts
interface ControlLadder { row: StackForm[]; column?: StackForm[] }
interface ControlLadderSpec { controls: LadderControl[]; gap?: number; grip?: number; more: number; cross: number; column?: { icons: number; cross?: number; }; keep?: number }
interface CrossLimits { min: number; max: number; rail?: number }
interface EdgeBand { id: string; side: Side; size: number; gap?: number; mode?: "reserve" | "over" }
interface EdgeCut { bands: Readonly<Record<string, Rect>>; rest: Rect }
interface FitOptions { previous?: StackFit }
interface FloatFit { rect: Rect; clamped: boolean; snapped: boolean; covers: number[]; searchCapped: boolean }
interface FloatFitOptions { stay?: boolean }
type GroupFormKind = "row" | "stacked" | "wrap" | "icons" | "fold" | "menu"
interface LadderControl { id: string; tiers: number[]; foldOrder?: number }
interface MainSize { min: number; natural: number; grows?: boolean }
type PanelFormKind = "open" | "header" | "rail" | "menu"
interface PlacedStackItem { id: string; form: number; kind: StackFormKind; rect: Rect }
type StackAxis = "column" | "row"
interface StackDivider { before: string; after: string; rect: Rect; range: { min: number; max: number; } }
interface StackFit { axis: StackAxis; length: number; cross: number; items: PlacedStackItem[]; menu: StackMenu | null; notes: StackNote[]; need?: number; steps?: StackStep[] }
interface StackForm {
  kind: StackFormKind;
  main: MainSize;
  cross: { natural: number; min?: number; };
  setsCross?: boolean;
  body?: boolean;
  folded?: boolean;
  compact?: boolean;
  rank?: number;
  wrap?: WrapSpec;
  grip?: number;
  hides?: string[];
  tiers?: Readonly<Record<string, number>>;
  title?: boolean;
  menu?: boolean;
  ownCross?: boolean;
  stepGroup?: string;
}
type StackFormKind = PanelFormKind | GroupFormKind
type StackGap = { at: number; fits: true; input: StackInput; fit: StackFit; slot: Rect; } | { at: number; fits: false; reason: StackGapRefusal; }
interface StackGapOptions { previous?: StackFit; allows?: (item: StackItem, at: number) => boolean }
type StackGapRefusal = "no-forms" | "fixed" | "not-accepted" | "not-allowed" | "to-menu" | "overflow" | "too-wide" | "squeezes-fixed"
interface StackInput {
  axis: StackAxis;
  length: number;
  cross: CrossLimits;
  items: StackItem[];
  menu?: { main: number; };
  gap?: number;
  pad?: { start?: number; end?: number; };
  strictCross?: boolean;
  accepts?: (item: StackItem) => boolean;
  ownCross?: boolean;
  titles?: boolean;
}
interface StackItem { id: string; forms: StackForm[]; used: number; kept?: boolean; from?: number; fixed?: boolean; stepping?: boolean; lengths?: StackLengths }
interface StackLengths { column?: number; row?: number }
interface StackMenu { rect: Rect; items: string[] }
type StackNote =
  | { code: "form-down"; id: string; from: number; to: number; }
  | { code: "to-menu"; id: string; }
  | { code: "too-wide"; id: string; }
  | { code: "no-forms"; id: string; }
  | { code: "overflow"; over: number; }
type StackNoteCode = StackNote["code"]
interface StackStep { id: string; from: number; to: number; batch?: number }
interface WrapSpec { widths: number[]; row: number; gap?: number; lead?: number }
```

### `@n-uf/placement/tiling`

Panes that divide an area: order layouts, the split tree, the drop rules and regions, and a tiling drag (`tilingDrag`: its layout half and its hit half, its adapter and their conformance runs).

Functions:

```ts
canDropOnPane<K>(tree: Split<K> | null, dragged: K, at: K, region: PaneRegion, area: Rect, options: DropOptions<K>): DropVerdict
canSplitPane(target: Rect, side: Side, options: SplitRoomOptions): DropVerdict
columns<K>(panes: K[], area: Rect, options?: TileOptions): Map<K, Rect>
dropFits<K>(projected: ReadonlyMap<K, Rect>, dragged: K, at: K, area: Rect, options: DropFitsOptions): DropVerdict
dropOnPane<K>(tree: Split<K> | null, dragged: K, at: K, region: PaneRegion): Split<K>
giveWay<K>(panes: K[], layout: (kept: K[]) => ReadonlyMap<K, Rect>, min: (pane: K) => Size, age: (pane: K) => number): { kept: K[]; floats: K[]; }
grid<K>(panes: K[], area: Rect, options?: TileOptions): Map<K, Rect>
layoutSplit<K>(tree: Split<K> | null, area: Rect, options?: SplitOptions<K>): Map<K, Rect>
layoutSplitTree<K>(tree: Split<K> | null, area: Rect, options?: SplitOptions<K>): SplitLayout<K>
masterCount(count: number | undefined, n: number): number
masterRatio(v: number | undefined): number
masterStack<K>(panes: K[], area: Rect, options?: OrderOptions): Map<K, Rect>
neighbor<K>(rects: ReadonlyMap<K, Rect>, from: K, direction: Direction): K | null
orderTargets<K>(arrange: OrderLayout, panes: K[], dragged: K, area: Rect, options?: OrderOptions): OrderTarget<K>[]
paneCenter(size: Size, options?: PaneRegionOptions): PaneCenter
paneRegion(pane: Rect, point: Point, previous?: PaneRegion | null, options?: PaneRegionOptions): PaneRegion
paneRegionShapes(pane: Rect, options?: PaneRegionOptions): Readonly<Record<PaneRegion, Point[]>>
panesOf<K>(tree: Split<K> | null): K[]
paneTargets<K>(layout: ReadonlyMap<K, Rect>, options?: PaneTargetsOptions<K>): PaneTarget<K>[]
removePane<K>(tree: Split<K> | null, pane: K): Split<K> | null
splitFromOrder<K>(panes: K[]): Split<K> | null
splitPane<K>(tree: Split<K> | null, at: K | null, pane: K, side?: Side): Split<K>
splitTreeOps<K>(options?: SplitTreeOpsOptions<K>): TilingTree<StackedSplit<K>, K>
swapPanes<K>(tree: Split<K> | null, x: K, y: K): Split<K> | null
tilingConformance<T, K>(trees: Iterable<T>, options: TilingDragOptions<T, K>, limit?: number): TilingConformance
tilingDrag<T, K>(tree: T, subject: TilingSubject<K>, options: TilingDragOptions<T, K>): TilingDrag<T, K>
tilingHitConformance<T, K>(trees: Iterable<T>, options: TilingDragOptions<T, K>, hitOptions?: TilingHitOptions<K>, limit?: number): TilingHitConformance
tilingSubjects<T, K>(tree: T, options: Pick<TilingDragOptions<T, K>, "ops">): TilingSubject<K>[]
```

Constants:

```ts
const PANE_REGION_DEFAULTS: Required<Omit<PaneRegionOptions, "centerX" | "centerY" | "paneCenter" | "sides">>
const PANE_SIDES: Side[]
const TILING_HIT_DEFAULTS: { edge: number; travel: number; cap: number; neighborSwap: number; }
const TILING_HIT_PROPERTIES: ["fixed-map", "zone-rule", "stillness", "hold-measures", "one-pass", "existence", "lift-equals-home", "shown-under-pointer", "shown-equals-…
const TILING_PROPERTIES: ["home-is-lift", "home-is-the-gap", "home-over-changed", "one-layout", "swap-exchanges", "swap-trades-slots", "swap-keeps-stack-mates", "su…
```

Types:

```ts
type Direction = "left" | "right" | "up" | "down"
interface DropFitsOptions { min: number; side: Side }
interface DropOptions<K> extends SplitOptions<K> { min: number }
interface DropVerdict { ok: boolean; reason?: string }
interface FixedLength { length: number; keep?: boolean }
interface MasterOptions { count?: number; side?: Side }
interface MinLength { min: number; net?: boolean }
type OrderLayout = <K>(panes: K[], area: Rect, options?: OrderOptions) => Map<K, Rect>
type OrderOptions = TileOptions & MasterOptions
interface OrderTarget<K> extends Target { index: number; layout: ReadonlyMap<K, Rect> }
interface PaneCenter { width: number; height: number; left: number; top: number; right: number; bottom: number }
type PaneRegion = "center" | Side
interface PaneRegionOptions { center?: number; centerX?: number; centerY?: number; centerMin?: number; hysteresis?: number; pixelRatio?: number; paneCenter?: PaneCenter; sides?: Side[] }
interface PaneTarget<K> extends Target { pane: K }
interface PaneTargetsOptions<K> { except?: K; key?: (pane: K) => string }
interface Rect { x: number; y: number; width: number; height: number }
type Split<K> = { pane: K; } | { a: Split<K>; b: Split<K>; axis?: Axis; ratio?: number; gap?: number; id?: string; master?: MasterOptions; }
interface SplitGeometry { rect: Rect; axis: "x" | "y"; ratio: number; divider: Rect | null }
interface SplitLayout<K> { panes: Map<K, Rect>; splits: Map<string, SplitGeometry> }
interface SplitOptions<K> extends TileOptions {
  fixed?: (child: Split<K>, axis: Axis) => FixedLength | undefined;
  fixedAcross?: (child: Split<K>, axis: Axis) => number | undefined;
  floor?: (child: Split<K>, axis: Axis, split: Split<K>) => MinLength;
}
interface SplitRoomOptions { min: number; gap?: number; handle?: number }
interface SplitTreeOpsOptions<K> { bar?: number; tab?: (member: K) => number }
interface StackedSplit<K> { split: Split<K> | null; stacks?: TilingStack<K>[] }
interface TileOptions { gap?: number; ratio?: number; handle?: number }
interface TilingAfter<T, K> extends TilingLaidOut<T, K> { held: TilingHeld<K>; refusal: TilingRefusal<K> | null; landing: Rect | null; moved: TilingMove<K>[] }
type TilingBasis = "lift" | "base"
interface TilingConformance { ok: boolean; failures: string[]; counts: Readonly<Record<"home-is-lift" | "home-is-the-gap" | "home-… }
interface TilingDrag<T, K> {
  subject: TilingSubject<K>;
  lift: TilingLaidOut<T, K>;
  base: TilingLaidOut<T, K>;
  home: Rect | null;
  after(held: TilingHeld<K>): TilingAfter<T, K>;
  hit(basis: TilingBasis, options?: TilingHitOptions<K>): TilingHit<T, K>;
}
interface TilingDragOptions<T, K> extends DropOptions<K> { ops: TilingTree<T, K>; area: Rect; still?: (pane: K) => boolean }
type TilingHeld<K> = { kind: "home"; } | { kind: "swap"; at: K; } | { kind: "beside"; at: K; side: Side; } | { kind: "join"; at: K; index?: number; }
interface TilingHit<T, K> {
  basis: TilingBasis;
  home: Rect | null;
  targets: TilingHitTarget<K>[];
  intent: TilingHitIntent<K>;
  placeAt(point: Point): string | null;
  hold(state: TilingHold | null, point: Point): TilingHold | null;
  heldOf(id: string): TilingHeld<K> | null;
  placeOf(target: TilingHitTarget<K>, point: Point, previous?: string | null): string | null;
  read(frame: TilingHitFrame<TilingHitTarget<K>>, point: Point): TilingHitRead<K>;
  drawn(read: TilingHitRead<K>): TilingLaidOut<T, K>;
  release(read: TilingHitRead<K>): TilingAfter<T, K>;
}
interface TilingHitConformance {
  ok: boolean;
  failures: string[];
  counts: Readonly<Record<"fixed-map" | "zone-rule" | "stillness" | "…;
  reported: { swapsBeside: number; insertsMoveOthers: number; insertsMo…;
}
interface TilingHitFrame<T> { shown: T | null }
interface TilingHitIntent<K> { tuning: { aimSpeed: number; dwell: number; switchHold: number; room…; placeOf: (target: TilingHitTarget<K>, point: Point, previous: string… }
interface TilingHitOptions<K> { regions?: TilingHitRegions; key?: (pane: K) => string; edge?: number; travel?: number; cap?: number; neighborSwap?: number }
type TilingHitProperty = (typeof TILING_HIT_PROPERTIES)[number]
interface TilingHitRead<K> { held: TilingHeld<K> | null; refused: TilingHeld<K> | null; mark: TilingMark<K> | null }
type TilingHitRegions = Pick<PaneRegionOptions, "center" | "centerX" | "centerY" | "centerMin" | "pixelRatio">
interface TilingHitTarget<K> extends Target { pane: K; at: K; part?: string; home?: true }
interface TilingHold { place: string; from: Point }
interface TilingLaidOut<T, K> { tree: T; layout: ReadonlyMap<K, Rect>; splits: ReadonlyMap<string, SplitGeometry> }
type TilingMark<K> = { kind: "beside"; at: K; side: Side; rect: Rect; } | { kind: "swap"; at: K; rect: Rect; wash: Rect | null; } | { kind: "join"; at: K; rect: Rect; slot: Rect | null; }
interface TilingMove<K> { pane: K; from: Rect; to: Rect }
interface TilingPart { key: string; rect: Rect; slots?: Rect[] }
type TilingProperty = (typeof TILING_PROPERTIES)[number]
type TilingRefusal<K> = { code: "self" | "still" | "missing" | "join"; } | { code: "room-along" | "room-across"; need: number; have: number; } | { code: "fit"; pane: K; }
type TilingSize = { kind: "half"; }
interface TilingStack<K> { id: string; members: K[]; active: K }
type TilingSubject<K> = { kind: "pane"; pane: K; } | { kind: "stack"; stack: TilingStack<K>; }
interface TilingTree<T, K> {
  split(tree: T): Split<K> | null;
  stackOf?(tree: T, pane: K): TilingStack<K> | null;
  release(tree: T, subject: TilingSubject<K>): T;
  beside(released: T, subject: TilingSubject<K>, at: K, side: Side, size: TilingSize): T;
  swap(tree: T, subject: TilingSubject<K>, at: K): T;
  join?(released: T, subject: TilingSubject<K>, at: K, index?: number): T;
  normalize?(tree: T): T;
  parts?(tree: T, pane: K, rect: Rect): TilingPart[];
}
```

### `@n-uf/placement/popup`

A popup positioned as Wayland's xdg-positioner does.

Functions:

```ts
positionPopup(anchorRect: Rect, size: Size, bounds: Rect, rule: PositionerRule): Positioned
```

Constants:

```ts
const BELOW_LEFT: PositionerRule
```

Types:

```ts
type Align = -1 | 0 | 1
interface Positioned { rect: Rect; flipped: { x: boolean; y: boolean; }; slid: { x: boolean; y: boolean; }; resized: boolean }
interface PositionerRule { anchor: { x: Align; y: Align; }; gravity: { x: Align; y: Align; }; offset: Point; flip: boolean; slide: boolean; resize: boolean }
```

## Package @n-uf/docking

### `@n-uf/docking`

One model of a whole window: the dock state, `solve`, the changes, targets and refusals, lanes, `dockDrag` and storage.

Functions:

```ts
anchorName(anchor: FloatAnchorAt): FloatAnchor
canFold(state: DockState, id: string): boolean
closeItem(state: DockState, id: string): DockState
declaresFloatSizes(item: DockItem): boolean
dividers(state: DockState, layout?: DockLayout): DockDivider[]
dockDrag(state: DockState, dragged: string, options?: DockLaneOptions): DockDrag
dockHome(state: DockState, id: string, start: DockState): DockState
edgeTakes(edge: ZoneDecl, kind: Kind): boolean
fitResize(state: DockState, id: string, rect: Rect, moving: ResizeEdges): FloatResize | null
floatAt(state: DockState, id: string, at?: Rect, orient?: Orient): DockState
floatOrientOf(item: DockItem): Orient
floatSizeOf(item: DockItem, orient?: Orient): Size
foldItem(state: DockState, id: string, on: boolean): DockState
heldRect(state: DockState, id: string, size: Size, pointer: Point, grab: Point): Rect
homeFor(state: DockState, id: string, start: DockState): Place | null
isAnchoredKeepClear(c: KeepClear | AnchoredKeepClear): c is AnchoredKeepClear
isOutsideSideBar(state: DockState, e: DockEdge): boolean
isSideBar(state: DockState, e: DockEdge): boolean
isSideColumn(state: DockState, e: DockEdge): boolean
keepItem(state: DockState, id: string, on: boolean): DockState
lanes(state: DockState, dragged: string, options?: DockLaneOptions): DockRegions
liftItem(state: DockState, id: string): DockState
markUsed(state: DockState, id: string): DockState
mergeSideColumns(state: DockState): DockState
moveTo(state: DockState, id: string, place: Place): DockState
namesZone(edge: ZoneDecl, kind: Kind): boolean
openItem(state: DockState, id: string): DockState
orientFloat(state: DockState, id: string, to: Orient): DockState
parseTargetId(id: string): TargetIdParts | null
placeTargetId(place: PlaceLike, item: string): string | null
railModeOf(state: DockState, side: Side): RailMode
raiseFloat(state: DockState, id: string): DockState
readDockState(data: unknown, base: DockState): DockStateRead
refusals(state: DockState, dragged: string, options?: DockDropOptions): DockRefusal[]
refusalTargets(list: DockRefusal[]): DockRefusalTarget[]
reservedRect(state: DockState, l: DockLayout, id: string): Rect
resetBetween(state: DockState, before: string, after: string, options?: { layout?: DockLayout; }): DockState
resetLengths(state: DockState, edgeId: string): DockState
resizeBetween(state: DockState, before: string, after: string, delta: number, options?: { layout?: DockLayout; }): DockState
resizeEdge(state: DockState, edgeId: string, size: number): DockState
resizeFloat(state: DockState, floatId: string, rect: Rect, moving?: ResizeEdges): DockState
setRailMode(state: DockState, side: "left" | "right", mode: RailMode): DockState
setSide(state: DockState, edgeId: string, side: Side): DockState
solve(given: DockState, options?: SolveOptions): DockLayout
stops(state: DockState, dragged: string, options?: DockDropOptions): DockDrop[]
storeDockState(state: DockState): StoredDockState
targetId(parts: TargetIdParts): string
targets(state: DockState, dragged: string, options?: DockDropOptions): DockDrop[]
virtualEdgeId(kind: "column" | "rail", side: ColumnSide): string
zoneIn(edge: DockEdge, item: DockItem): Zone
zonesTaking(edge: ZoneDecl, kind: Kind): Zone[]
zoneTakes(edge: ZoneDecl, zone: Zone, kind: Kind): boolean
```

Constants:

```ts
const DEFAULT_FLOAT_SIZE: Size
const DEFAULT_HIT_BAND: 24
const DEFAULT_RAIL_MAGNET: 6
const DEFAULT_STRIP: 24
const EDGE_ROOM_HOLD: 0
const FLOAT_ANCHORS: FloatAnchor[]
const HATCH_EDGE: 8
const HATCH_END: 8
const RAIL_MODES: RailMode[]
const RAIL_STRIP_MIN: 24
const RAIL_VISIBILITIES: RailVisibility[]
const SIDES: Side[]
const SPOT_PITCH: 40
const ZONES: Zone[]
```

Types:

```ts
interface AnchoredKeepClear { region: "content"; side: Side; size: number; for: "all" | "floats"; id?: string; minRegion?: { width?: number; height?: number; } }
type Axis = "x" | "y"  // from placement
interface ColumnPlace { kind: "column"; side: "left" | "right"; ring: number }
interface ColumnTemplate {
  accepts: string[];
  cross: CrossLimits;
  gap?: number;
  pad?: { start?: number; end?: number; };
  menu?: { main: number; };
  zoneAccepts?: Readonly<Partial<Record<Zone, string[]>>>;
  hitBand?: number | "middle";
}
interface DockAfter extends DropResult { landing: Rect | null; grab: Point; marks: DockLaneMark[]; spots?: DockSpot[] }
interface DockDivider { edge: string; before: string; after: string; rect: Rect; range: { min: number; max: number; } }
interface DockDrag {
  regions: DockRegions;
  home?: { lane: string; spot: string; };
  after(held: DockHeld | null): DockAfter;
  landingOf(held: DockHeld): Rect | null;
  spotsOf(spot: string): DockSpot[] | null;
  shown(frame: Pick<DockGuideFrame, "held" | "room">): DockLayout;
  guides(frame: DockGuideFrame): DockLaneMark[];
}
interface DockDrop extends Target {
  item: string;
  arm?: "dwell";
  armedHit?: Rect;
  opensRoom?: true;
  roomHold?: number;
  roomHit?: Rect;
  place: DropPlace;
  marker?: Rect;
  strip?: Rect;
  after(point: Point, grab?: DockGrab): DropResult;
}
interface DockDropOptions { previous?: DockLayout; endReach?: number; floatSize?: Size; floatFromHeld?: boolean; floatOrient?: Orient; fresh?: string[]; grab?: DockGrab; onGrabNote?: (note: DockGrabNote) => void; pitch?: number }
interface DockEdge {
  id: string;
  side: Side;
  ring: number;
  span?: "full" | "between";
  accepts: string[];
  items: string[];
  cross: CrossLimits;
  mode?: "reserved" | "overlay";
  gap?: number;
  pad?: { start?: number; end?: number; };
  menu?: { main: number; };
  size?: number;
  railShowsClosed?: boolean;
  compact?: boolean;
  zoneAccepts?: Readonly<Partial<Record<Zone, string[]>>>;
  zones?: Zone[];
  strip?: number;
  hitBand?: number | "middle";
  moves?: "side";
  foldable?: boolean;
  column?: boolean;
  outsideInset?: boolean;
  giveWay?: boolean;
  priority?: number;
  hidden?: boolean;
  showIn?: string;
}
interface DockEdgeLayout {
  side: Side;
  ring: number;
  rect: Rect;
  cross: number;
  menu: { rect: Rect; items: string[]; } | null;
  items: string[];
  tabs: string[];
  stack: StackFit;
  free: StackFit;
  folded?: "hand" | "auto";
  shrunk?: boolean;
  rides?: string;
}
interface DockFloat { id: string; rect: Rect; anchor?: FloatAnchorAt; orient?: Orient; since?: number; stays?: true }
type DockGrab = Point | ((form: DockGrabForm, size: Size) => Point | undefined)
interface DockGrabForm extends DockItemLayout { place: DockGrabPlace }
interface DockGrabNote { code: "lift-drift"; press: Point; at: Point }
type DockGrabPlace = { kind: "float"; } | { kind: "spot"; edge: string; } | { kind: "rail"; side: "left" | "right"; orient: Orient; }
interface DockGuideFrame { held: DockHeld | null; room: boolean; guides: DockGuideRef[] }
interface DockGuideRef { lane: string; held: DockHeld | null }
type DockHeld = { kind: "spot"; spot: string; point: Point; } | { kind: "float"; point: Point; }
interface DockItem {
  id: string;
  kind: string;
  forms: { column?: StackForm[]; row?: StackForm[]; };
  used: number;
  kept?: boolean;
  from?: number;
  fixed?: boolean;
  stepping?: boolean;
  pushable?: boolean;
  countsAsDocked?: boolean;
  closed?: boolean;
  align?: Zone;
  space?: number;
  priority?: number;
  lengths?: { column?: number; row?: number; };
  floatSizes?: { row?: Size; column?: Size; };
  floatOrient?: Orient;
  floatMin?: Size;
  floatMax?: Size;
}
interface DockItemLayout {
  rect: Rect;
  kind: string;
  axis: Orient;
  form: number;
  formKind: StackFormKind;
  edge?: string;
  zone?: Zone;
  floating?: boolean;
  inMenu?: boolean;
  tab?: boolean;
  closed?: boolean;
  fixed?: boolean;
  rail?: "left" | "right";
  railTitle?: "left" | "right";
  rides?: string;
  folded?: "hand" | "auto";
  foldedBy?: "hand" | "auto";
  rows?: (number[])[];
  grip?: Rect;
  hidden: string[];
  tiers?: Readonly<Record<string, number>>;
}
interface DockKeepClearLayout { rect: Rect; for: "all" | "floats"; id?: string }
interface DockLane { id: string; rect: Rect; axis: Axis; spots: DockSpot[]; refused: LaneRefusal[]; marks: DockMark[]; owns?: true }
interface DockLaneMark extends DockMark { lane: string }
interface DockLaneOptions extends DockDropOptions { pitch?: number; stretchPositions?: "free" | "pitched"; snapDistance?: number; grab?: DockGrab; emptyLanes?: EmptyLanes }
interface DockLayout {
  items: Readonly<Record<string, DockItemLayout>>;
  edges: Readonly<Record<string, DockEdgeLayout>>;
  content: Rect;
  floats: string[];
  rails: Readonly<Partial<Record<"left" | "right", DockRailLayout>>>;
  railPlaces: Readonly<Partial<Record<"left" | "right", Rect>>>;
  columnRoom?: boolean;
  keepClear?: DockKeepClearLayout[];
  notes: DockNote[];
}
interface DockMark { id: string; kind: "line" | "box" | "hatch"; rect: Rect; givesWay?: string }
type DockNote =
  | ({ edge: string; } & StackNote)
  | { code: "unknown-item"; id: string; }
  | { code: "twice"; id: string; }
  | { code: "float-clamped" | "float-moved" | "float-covers"; id: string; }
  | { code: "column-shrunk"; edge: string; from: number; to: number; }
  | { code: "column-folded" | "kept-folded"; edge: string; }
  | { code: "bar-shrunk"; edge: string; from: number; to: number; }
  | { code: "bar-folded"; edge: string; }
  | { code: "no-column-room"; width: number; need: number; }
  | { code: "content-narrow"; width: number; min: number; }
  | { code: "content-short"; height: number; min: number; }
  | { code: "content-changed"; from: Rect; to: Rect; }
  | { code: "no-vertical-form"; id: string; edge?: string; }
  | { code: "no-icons-form"; id: string; edge: string; }
  | { code: "show-in-ignored"; edge: string; }
type DockNoteCode = DockNote["code"]
interface DockPlace { kind?: "gap"; edge: string; zone?: Zone; at: number; space?: number }
interface DockRailLayout { rect: Rect; segments: { id: string; edge: string; rect: Rect; }[]; stack?: StackFit }
interface DockRefusal { id: string; edge: string; zone: Zone; hit: Rect; hits?: Rect[]; reason: "not-accepted" | "no-room" | "too-thick" | "own-place"; bounds?: Rect }
interface DockRefusalTarget extends Target { refuse: true; refusal: DockRefusal }
interface DockRegions { lanes: DockLane[]; refused: Rect[]; content: Rect; blocked: Rect[]; stage: Rect; floatRegion: Rect; item: Size; float: DockDrop | null; refusals: DockRefusal[] }
interface DockSpot { id: string; along: [number, number]; landing: Rect; target: DockDrop; home?: true; pitched?: true; slide?: LaneSlide; others: string }
interface DockState {
  stage: Rect;
  edges: DockEdge[];
  items: Readonly<Record<string, DockItem>>;
  floats: DockFloat[];
  floatKinds: string[];
  keepClear?: (AnchoredKeepClear | KeepClear)[];
  blocked?: Rect[];
  columns?: Partial<Record<"left" | "right", ColumnTemplate>>;
  rails?: Partial<Record<"left" | "right", RailSpec>>;
  railModes?: Partial<Record<"left" | "right", RailMode>>;
  railDrop?: Readonly<Partial<Record<string, RailDropPolicy>>>;
  foldedColumnDrop?: "end";
  sideColumns?: "one";
  barZones?: "nearest";
  contentMin?: { width: number; height: number; chromeWidth?: number; };
  handFold?: "bar" | "ride";
  inset?: { top?: number; right?: number; bottom?: number; left?: num…;
  insetWhen?: "always" | "docked";
  gutter?: number;
}
interface DockStateRead { state: DockState; dropped: string[]; error?: string }
type DropPlace = { kind: "gap"; edge: string; zone: Zone; at: number; } | ColumnPlace | RailPlace | { kind: "side"; edge: string; side: Side; } | { kind: "float"; } | { kind: "home"; } | { kind: "none"; }
interface DropResult { state: DockState; layout: DockLayout; grab?: Point }
type EmptyLanes = "real" | "edge"
type FloatAnchor = "content-top-left" | "content-top" | "content-top-right" | "content-right" | "content-bottom-right" | "content-bottom" | "content-bottom-left" | "content-left"
type FloatAnchorAt = FloatAnchor | FloatAnchorOffset
interface FloatAnchorOffset { at: FloatAnchor; dx?: number; dy?: number }
interface FloatPlace { kind: "float"; rect?: Rect; anchor?: FloatAnchorAt; stays?: true }
interface FloatResize { rect: Rect; limits: ResizeLimit[] }
type KeepClear = Rect & { for?: "all" | "floats"; }
type KeepClearRegion = "content"
type Kind = string
interface LaneRefusal { along: [number, number]; reason: "not-accepted" | "no-room" | "too-thick" | "own-place" }
interface LaneSlide { from: number; to: number; snaps: number[]; snapDistance: number; step: number }
type Orient = "column" | "row"
type Place = DockPlace | ColumnPlace | RailPlace | FloatPlace
interface RailDropPolicy { railStripWidth?: number; railVisibility?: RailVisibility; magnet?: number; floatNearEdge?: boolean }
type RailMode = "titles" | "icons"
interface RailPlace { kind: "rail"; side: "left" | "right"; ring: number }
interface RailSpec { width: number; accepts: string[] }
type RailVisibility = "whileDragging" | "always" | "never"
interface ResizeEdges { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }
type ResizeLimit = "min" | "max" | "region" | "docked"
type Side = "top" | "right" | "bottom" | "left"  // from placement
interface SolveOptions { previous?: DockLayout; fresh?: string[] }
interface StoredDockState {
  v: 1;
  edges: StoredDockStateEdge[];
  floats: StoredDockStateFloat[];
  items: Readonly<Record<string, StoredDockStateItem>>;
  railModes?: Readonly<Partial<Record<"left" | "right", RailMode>>>;
}
interface StoredDockStateEdge { id: string; side: Side; ring: number; items: string[]; size?: number; column?: true }
interface StoredDockStateFloat { id: string; x: number; y: number; width: number; height: number; orient?: Orient; anchor?: FloatAnchorAt; since?: number; stays?: true }
interface StoredDockStateItem {
  used: number;
  kept?: true;
  from?: number;
  closed?: true;
  align?: "center" | "end";
  space?: number;
  lengths?: { column?: number; row?: number; };
  floatSizes?: { row?: Size; column?: Size; };
  floatSize?: Size;
}
type TargetIdParts =
  | { kind: "gap"; edge: string; zone: Zone; at: number; }
  | { kind: "strip"; edge: string; zone: Zone; }
  | { kind: "column" | "rail"; side: ColumnSide; ring: number; }
  | { kind: "side"; side: Side; }
  | { kind: "home" | "float"; item: string; }
  | { kind: "none"; index: number; }
  | { kind: "refuse"; edge: string; zone: Zone; n: number; }
type Zone = "start" | "center" | "end"
type ZoneAccepts = Readonly<Partial<Record<Zone, Kind[]>>>
```

### `@n-uf/docking/testing`

The conformance rows, the landing rows, their runners and reference hosts, and the `AssertLanding` and `AssertGeometry` type checks.

Functions:

```ts
caseById(id: string): CaseRow | undefined
createLandingHost(o: { landing: LandingRule; stretchPositions?: DockLaneOptions["stretchPositions"]; }): LandingCaseHost
createReferenceHost(options?: ReferenceHostOptions): ReferenceHost
defaultItemSelector(id: string): string
handBound(gap: number, beforeHop?: boolean): number
idRenames(ids: IdMap | undefined): { to: Rename; from: Rename; active: boolean; }
landingIssues(row: LandingCase, frames: LandingCaseFrame[], layout: DockLayout, before?: DockLayout, stretchPositions?: DockLaneOptions["stretchPositions"]): string[]
layoutIssues(want: LayoutExpect, layout: DockLayout): string[]
mapGesture(g: Gesture, f: Rename): Gesture
mapLayout(l: DockLayout, f: Rename): DockLayout
mapPlace(p: DropPlace, f: Rename): DropPlace
mapState(s: DockState, f: Rename): DockState
mapStored(s: StoredDockState, f: Rename): StoredDockState
nearGuideIssues(row: LandingCase, frames: LandingCaseFrame[], before?: DockLayout, stretchPositions?: DockLaneOptions["stretchPositions"]): string[]
resizeStep(state: DockState, start: DockState, layout: DockLayout, g: Gesture): { state: DockState; start: DockState; }
resolvePlace(list: DockDrop[], place: DropPlace, item: string, area_: AimArea, pick?: PickRule): Point | null
runCase(row: CaseRow, host: CaseHost): CaseResult
runCaseAsync(row: CaseRow, host: AsyncCaseHost | CaseHost): Promise<CaseResult>
runCases(rows: CaseRow[], makeHost: () => CaseHost): { id: string; result: CaseResult; }[]
runCasesAsync(rows: CaseRow[], makeHost: () => AsyncCaseHost | CaseHost | Promise<AsyncCaseHost | CaseHost>, options?: { onResult?: (id: string, result: CaseResult) => void; }): Promise<{ id: string; result: CaseResult; }[]>
runLandingCases(rows: LandingCase[], host: LandingCaseHost): Promise<LandingCaseResult[]>
winState(spec: WinSpec, o?: WinOptions): DockState
withRefusals(pick: PickRule, refused: DockRefusal[]): PickRule
```

Constants:

```ts
const CASE_GROUPS: { id: CaseGroup; title: string; }[]
const CASES: CaseRow[]
const END_REACH: 24
const g: { press: (item: string, point?: Point) => Gesture; to: (place: DropPlace) => Gesture; at: (x: number, y: number) => Gesture; hold: (ms?: nu…
const HAND_FAST: 0.375
const HAND_MARGIN: 6
const HAND_TRAIL: 48
const HAND_TRAIL_BEFORE_HOP: 56
const LANDING_CASES: LandingCase[]
const LIFT_THRESHOLD: 4
const NEAR_REACH: 12
const WINDOW_A: WinSpec
const WINDOW_B: WinSpec
const WINDOW_BARE: WinSpec
```

Types:

```ts
interface AimArea { stage: Rect; content?: Rect; own?: Rect }
type AssertGeometry<G extends LandingGeometry> = G
type AssertLanding<R extends LandingRegions> = R
interface AsyncCaseHost {
  load(state: DockState, settings?: CaseSettings): void | Promise<void>;
  perform(gesture: Gesture): void | Promise<void>;
  layout(): DockLayout | Promise<DockLayout>;
  root?(): DomRoot | null | Promise<DomRoot | null>;
  itemSelector?(id: string): string;
  stored?(): StoredDockState | Promise<StoredDockState>;
  stops?(item: string): DropPlace[] | Promise<DropPlace[]>;
  pick?: PickRule;
  dockMinWidth?: number;
  ids?: Readonly<Record<string, string>>;
}
type CaseGroup = "panels" | "groups" | "drag" | "floats" | "bars" | "previous" | "kinds" | "bands" | "gestures" | "window-a" | "window-b"
interface CaseHost {
  load(state: DockState, settings?: CaseSettings): void;
  perform(gesture: Gesture): void;
  layout(): DockLayout;
  root?(): DomRoot | null;
  itemSelector?(id: string): string;
  stored?(): StoredDockState;
  stops?(item: string): DropPlace[];
  pick?: PickRule;
  dockMinWidth?: number;
  ids?: Readonly<Record<string, string>>;
}
interface CaseRequires { hitBand?: "default"; rails?: ("left" | "right")[]; intent?: true; railDrop?: "state"; docks?: boolean }
interface CaseResult { ok: boolean; failures: string[]; skipped: string[] }
interface CaseRow {
  id: string;
  title: string;
  expect: string;
  group: CaseGroup;
  state: DockState;
  settings?: CaseSettings;
  gestures: Gesture[];
  expectLayout: LayoutExpect;
  expectDom?: DomCheck[];
  checkpoints?: Checkpoint[];
  expectStored?: StoredExpect;
  expectStops?: { item: string; at?: number; places: DropPlace[]; };
  lacks?: string;
  requires?: CaseRequires;
}
interface CaseSettings { stage?: { w: number; h: number; }; frozen?: boolean }
interface Checkpoint { at: number; layout?: LayoutExpect; note?: string }
interface DomCheck {
  at?: number;
  select?: string;
  item?: string;
  count?: number | { min?: number; max?: number; };
  attr?: Readonly<Record<string, string | null>>;
  rect?: Partial<Rect>;
  tolerance?: number;
  note?: string;
}
interface DomRoot {
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): ArrayLike<DomRoot>;
  getBoundingClientRect?(): { left: number; top: number; width: number; height: number; };
}
interface EdgeExpect { rect?: Partial<Rect>; cross?: number; tabs?: string[]; menu?: string[] | null }
interface Gesture { type: GestureType; item?: string; place?: DropPlace; point?: Point; key?: string; edge?: string; size?: number; ms?: number }
type GestureType = "press" | "move" | "release" | "key" | "click" | "resize" | "scroll" | "hold"
type IdMap = Readonly<Record<string, string>>
interface ItemExpect {
  rect?: Partial<Rect>;
  formKind?: StackFormKind;
  form?: number;
  edge?: string | null;
  zone?: Zone;
  floating?: boolean;
  inMenu?: boolean;
  rail?: Side | null;
  folded?: "hand" | "auto" | null;
  rides?: string | null;
  tab?: boolean;
}
interface LandingCase {
  id: string;
  title: string;
  expect: string;
  state: DockState;
  item: string;
  path: Point[];
  speed: number;
  rest?: number;
  moving?: { lane?: string; notLanes?: string[]; notRegions?: LandingR…;
  end?: { region: LandingRegionName; lane?: string | null; spot?: s…;
  layout?: LayoutExpect;
  home?: true;
  requires?: CaseRequires;
}
interface LandingCaseFrame {
  t: number;
  point: Point;
  moving: boolean;
  region: LandingRegionName;
  lane: string | null;
  spot: string | null;
  landing: Rect | null;
  room: boolean;
  guides?: LandingCaseGuide[];
  pending?: string;
}
interface LandingCaseGuide { id: string; lane: string; kind: "line" | "box" | "hatch"; rect: Rect }
interface LandingCaseHost { play(row: LandingCase): LandingPlay | Promise<LandingPlay> }
interface LandingCaseResult { id: string; ok: boolean; failures: string[]; skipped: string | null }
interface LandingModelLike {
  update(point: Point, time: number, keys?: { shift?: boolean; }): { region: LandingRegionName; l…;
  release(point: Point, time: number): (DockHeld & { home?: boolean; }) | null;
}
interface LandingPlay { frames: LandingCaseFrame[]; layout: DockLayout; before?: DockLayout; stretchPositions?: "free" | "pitched" }
type LandingRegionName = "lane" | "open" | "refused" | "nowhere"
type LandingRule = (options: { regions: DockRegions; landingOf: (held: DockHeld) => Rect | null; spotsOf: (spot: string) => DockSpot[] | null; home?: { lane: string; spot: string; }; preview?: { mode: "outline" | "placeholder" | "glide" | "snap"; placeGuides?: "off" | "near" | "all"; }; }) => LandingModelLike
interface LayoutExpect {
  items?: Readonly<Record<string, ItemExpect | null>>;
  edges?: Readonly<Record<string, EdgeExpect | null>>;
  content?: Partial<Rect>;
  contentAtLeast?: { width?: number; height?: number; };
  order?: Readonly<Record<string, string[]>>;
  columns?: Readonly<Partial<Record<"left" | "right", (string[])[]>>>;
  rails?: Readonly<Partial<Record<"left" | "right", string[]>>>;
  floats?: string[];
  notes?: { has?: DockNoteCode[]; hasNot?: DockNoteCode[]; none?: boo…;
  tolerance?: number;
}
interface PickCandidate { id: string; priority: 1 | 2 | 3; refuse?: true; hit: Rect; hits?: Rect[]; bounds?: Rect }
type PickRule = <T extends PickCandidate>(list: T[], point: Point) => T | null
interface ReferenceHost extends CaseHost { state(): DockState; stored(): StoredDockState; drag(): HostDrag | null; pick: PickRule }
interface ReferenceHostOptions { endReach?: number; lift?: number; grab?: Point; pick?: PickRule }
type Rename = (id: string) => string
interface StoredExpect { items?: Readonly<Record<string, Readonly<Record<string, string | nu…; absent?: string[] }
interface WinOptions {
  width?: number;
  height?: number;
  columns?: { left?: (string[])[]; right?: (string[])[]; };
  used?: Readonly<Record<string, number>>;
  from?: Readonly<Record<string, number>>;
  handFold?: "bar" | "ride";
  size?: number;
  floats?: { id: string; rect: { x: number; y: number; width: number; …;
}
interface WinSpec { card: { min: number; max: number; }; gap: number; pad: number; rail: number; contentMin: { width: number; height: number; }; barMain: number }
```

