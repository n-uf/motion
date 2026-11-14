# @n-uf/motion

Versions are calendar versions, `YY.M.R` (year, month of the release, counter
within the month), the same scheme as `@n-uf/hypr-tiling`.

## Unreleased

- `@n-uf/motion/drag`: `DragFrame.atHome`, true when the pointer is back inside `home` after it has been outside `home`
  itself (never at the press, nor while it only moves about inside `home`, even near its edge). The intent still shows
  no target over home and `release` over home is still null; `atHome` lets a host draw its own "back to its place"
  indicator there. It is a new required field of `DragFrame`: code that builds a `DragFrame` by hand (a test mock, a
  fake intent) no longer type-checks until it adds `atHome`. `update` itself changes in nothing else.

## 26.11.12

- No change in `@n-uf/motion`. Released together with `@n-uf/placement`
  26.11.12 (the new `./stack` entry: items along one edge, each taking the largest form that fits).

## 26.11.11

- No change in `@n-uf/motion`. Released together with `@n-uf/placement`
  26.11.11 (drops into a stacked column at a position in `./panels`).

## 26.11.10

- No change in `@n-uf/motion`. Released together with `@n-uf/placement`
  26.11.10 (top and bottom bands and reserved toolbar room in `./panels`).

## 26.11.9

- No change in `@n-uf/motion`. Released together with `@n-uf/placement`
  26.11.9 (tabbed columns, section heights, and the `./desk` presets).

## 26.11.8

- No change in `@n-uf/motion`. Released together with `@n-uf/placement`
  26.11.8 (folded floats and riding columns in `./panels`).

## 26.11.7

- No change in `@n-uf/motion`. Released together with `@n-uf/placement`
  26.11.7 (the new `./panels` entry).

## 26.11.6

- `@n-uf/motion/drag`: the README shows a drag on a scaled page (a zoomed
  canvas, a fitted preview): the intent works in the coordinate space of its
  targets and home, so each pointer sample goes in as `(p − origin) / scale`.
- Docs: `item.retarget` is optional on a `LayoutItem` (`holdItem` falls back
  to `moveTo`); the paged swipe's state diagram shows `cancel` from settling
  back to idle.
- Released together with `@n-uf/placement` 26.11.6 (keyboard stops, slots,
  `allows`, keep priority, stored arrangements).

## 26.11.5

- `@n-uf/motion/drag`: `placeOf(target, point, previous)` is told the place
  it gave that target on the last sample (null if none), so a place can hold
  near its boundary (hysteresis lives in the consumer's `placeOf`). It may
  return null: no drop at that point of the target. There the target is no
  target: it isn't picked or held, a shown one hides at once (a target beneath
  with a place can show instead), no room opens, and a release lands on a
  target beneath, else goes home. A two-argument `placeOf` works as before.
  `@n-uf/placement/targets`' `paneZone` is made for it. Near the current
  target's edge (within the band or the gap grace) answer its nearest place:
  null there would drop the band and the grace.
  - Changed: `placeOf` is now called on every sample for each target under
    the pointer and for the current one; in 26.11.4 it was called only for
    the shown target. Keep it cheap and free of side effects.
- `@n-uf/motion/layout`: what a tiling host's own leaf motion did, on
  `createLayoutMotion`:
  - `onDraw(batch)`: every item that moved is drawn in one pass per frame and
    handed over once; an item at rest is not drawn;
  - `reducedMotion` (a boolean or the host's query), read on every new target
    and show or hide: items are placed and shown at once, no glide or fade;
  - `flush()` draws a batched change made between frames now, so the paint
    right after a host's commit shows no frame at the new box;
  - `retain(ids)` removes every item not listed;
  - `onActiveChange(active)`, once when the frames start and once when they
    stop;
  - `item.retarget(rect)`: a settle that keeps the content laid out while the
    size is unchanged. The held drag's glide back to the pointer uses it, so
    it no longer lays the item out on every frame. It is optional on
    `LayoutItem`: `holdItem` falls back to `moveTo` for an item without it (a
    26.11.4 item or a test double).
- Changed: the `LayoutMotion` interface gains `retain` and `flush`, so an
  implementation of it written outside this package needs both.
  `createLayoutMotion` has them.
- `@n-uf/motion/gestures`: `touchPressReducer` / `createTouchPress`, a touch
  on something draggable in a scrolling page: travel mostly along the scroll
  direction is never a lift: it is a scroll from 10 px, so a finger scroll
  reported a few px at a time never lifts on the way. `pagedSwipeReducer` /
  `createPagedSwipe`, swiping between pages with a wheel run or a finger: it
  arms only along the swipe, tracks progress over the page size, commits by
  share or speed and locks out the trackpad's momentum after a commit;
  `cancel` while it settles goes back to idle, so a host that stops its
  transition can't leave it stuck. Both from hypr-tiling's public engine, with
  generic names.

## 26.11.4

- New entry `@n-uf/motion/drag`: the drag intent model, pure and DOM-free.
  `createDragIntent({ home, tuning?, placeOf? })` takes the pointer once a
  frame and plain-data targets (`{ id, priority, hit, slot?, label?, free? }`)
  and says what the drop indicator shows, when the others make room, and what
  a release lands on:
  - the indicator shows only when the pointer has left home, a target is
    under it, and it aims (below 0.45 px/ms over 50 ms, or within 12 px for
    90 ms); crossing targets at speed shows nothing;
  - the most precise target wins (priority, then the smaller zone), held
    within a 10 px band unless a more precise one is 4 px inside; a 120 ms
    gap grace for an aiming pointer;
  - leaving the shown target, a flying pointer hides the indicator at once;
    an aiming one moves it once the new target has held 150 ms; a target only
    the grace keeps never shows;
  - room after 160 ms, also when the place within a target changes; never
    for a free target;
  - a release lands on the shown target whenever one shows (drop = shown),
    else the one under the pointer, else nowhere; over home it does nothing. `hide()` starts the
    aim afresh (the next sample never aims).
  `DRAG_DEFAULTS` holds the numbers, each overridable; `targetAt`, `inRect`
  and `liftDecision` (a mouse lifts at 5 px, a touch after a 180 ms hold and
  8 px) are there too.
  - Three drop previews, one intent: `previewPlan(frame, preview, slotted?)`
    gives `{ showIndicator, makeRoom, snapItem }` for `"indicator"` (nothing
    moves; never room), `"gap"` (the others open the slot once the intent
    makes room; the item stays under the pointer) and `"snap"` (the gap
    opens and the item glides into a slot; a target without one keeps the
    indicator). `DRAG_PREVIEW_DEFAULT` is `"snap"`.
- New entry `@n-uf/motion/layout`: the window motion rules applied to a whole
  surface. `createLayoutMotion({ loop })` moves items by id and target rect,
  all on one frame loop that runs only while something moves: a settle on
  every new target from the drawn rect, size changes through reveal (never a
  non-uniform scale), an immediate redraw when the layout box changes (no
  frame at the old offset from the new box), and enter, exit and fold with a
  uniform-scale fade. `holdItem` holds the real item 1:1 at the pointer (no
  copy), snaps it into a slot and back, and lands or cancels from the release
  rect; `preview(plan, slot)` plays the three drop previews of `./drag`'s
  `previewPlan` (indicator and gap keep it under the pointer, snap glides it
  into the slot); `resize(size)` takes a new size mid-drag, revealed from
  where it is drawn. `flip` is FLIP for DOM groups on settle. `domDrawable`, `layOutBox`
  and `drawBox` write DOM styles through structural shapes (no DOM types).
  It animates the rects it is given; which items move where stays the
  caller's.
- Nothing existing changes behaviour.

## 26.11.3

- New in `values/`: the window motion rules, the one motion model for
  hypr-tiling and a host app's window surface.
  - `createSettle(initial, { omega?, restDelta? })` and `settleValue(loop, …)`:
    the curve for moving to a new place. A critically damped spring whose
    velocity is set on every new target to `omega · distance` toward it, so it
    follows `distance · e^(−omega·t)` from wherever it is drawn: front-loaded
    (90 % in `ln(10)/omega` s), and it never passes its target, on position
    or size, however often it is retargeted. A velocity set by hand toward
    the target is capped at that speed; one away from it is kept. Tempos in
    `SETTLE_TEMPO` (`calm` 20, `default` 25, `quick` 37 per second).
  - `settle.hold(value)`: what a pointer owns sits exactly under it, at rest;
    the next target launches from there.
  - `reveal(drawn, target)`: draw a gliding window without stretching its
    content (move, frame at the drawn size, clip the content laid out at the
    target size). `popIn(progress, from = 0.87)`: uniform open and close.
- New entry `@n-uf/motion/testing`: frame-sampled checks of those rules
  (`checkNoOvershoot`, `checkMonotonic`, `checkNoJumps`, `checkHeld`,
  `checkContentScale`, `checkTempo`), each returning `{ ok, failures }`.
- Nothing existing changes behaviour.

## 26.11.2

- A two-finger pan is no longer taken for a pinch. One finger's event arrives
  before the other's, and a pan's leading finger alone changes the distance
  like a pinch (fingers 120 px apart, 7.5 px per event: 6.3 % against the 5 %
  threshold, while the centre moved only 3.75 px). The kind is now read once
  both fingers have moved as often as each other since the last look (so a
  lead of one or two events is caught up first); a finger at rest sends no
  moves, so one three moves ahead is read on its own (a pinch around an
  anchored thumb); a finger lifting from an undecided pair is read once, so a
  quick pinch still counts. A move that changes no position (pressure only)
  doesn't count. The thresholds keep their meaning; the API is unchanged.
- What a host sees differently: `pinch` `start` can come one to three moves
  later than before (it still carries everything since the second finger
  landed), and a pair cancelled before it decided emits no `pinch` `cancel`
  (nothing had started).

## 26.11.1

- The recogniser takes the platform (`platform`, default `"other"`). On
  `"mac"`, a mouse press with Ctrl held is a secondary click (button 2), as
  macOS has it, so Ctrl+click works like a right-click and Cmd+Ctrl+drag
  resizes like Cmd+right-drag. Not when Ctrl is the drag modifier (Ctrl+drag
  moves), and not for a pen, a finger or another platform.
  `platformButton(press, platform, dragModifier)` is the rule on its own.
  Ported from a downstream app's input session, with its tests.

## 26.11.0

First version: the motion package of a host app's layout-and-motion concept.

- **clock/**: `createFrameLoop` runs one-shot and repeating tasks in four
  phases (input, update, layout, write), requests frames only while it has
  work, defers deferrable tasks past a frame budget, and keeps stats.
  `ClockPort` has the shape of hypr-tiling's `SchedulerPort`;
  `createFakeClock` drives everything by hand in tests.
- **signals/**: `signal`, `computed`, `effect`, `batch`, `untracked` on
  alien-signals' core; effects take a `schedule`, and `loop.scheduler(phase)`
  runs them once per frame.
- **values/**: springs (exact closed-form steps, critically damped by
  default, velocity kept across retargets) and tweens with easing functions,
  over numbers, points, rects and vectors; `motionValue` / `springValue` /
  `tweenValue` step them on a loop as signals, with settle events and a
  reduced-motion switch.
- **gestures/**: a downstream app's input recogniser, made public:
  `createRecognizer` (click or drag per device, double and triple click, long
  press, pinch and two-finger pan, Safari's trackpad pinch, recovery from
  lost releases), wheel normalisation and modifiers, with its long-press
  timer on a `ClockPort`. Beside it `createFrameCoalescer`, the dwell
  (spring-load) reducer, and `createMachine` to run a reducer with its
  timers on a clock.
- `@n-uf/motion/browser`: `createBrowserClock` and `prefersReducedMotion`.
- One package with entries for the whole core and for each folder
  (`/clock`, `/signals`, `/values`, `/gestures`), plus `/browser`.
