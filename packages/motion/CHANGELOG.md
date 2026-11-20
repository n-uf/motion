# @n-uf/motion

Versions are calendar versions, `YY.M.R` (year, month of the release, counter
within the month), the same scheme as `@n-uf/hypr-tiling`.

## Unreleased

- `./drag`, **the pending lane holds at a corner** (fix). Inside two lanes not entered that overlap at a corner (an
  empty top bar's band and an empty rail's), `pending` was the deeper of the two on every frame, so a wobble of a few
  pixels across the diagonal flipped it, and the Near guides with it (9 times on a short zigzag). The pending lane now
  holds while the pointer stays inside it, and the other takes over only once it is deeper by `margins.spot` (6 px).
- `./drag`, **a fling is no entry into a touching lane** (behavior change, a new gate). From a held lane, a lane that
  touches it took the pointer once it had slid `path` px along it at any speed, so a fast flick up an empty rail from
  the bar under it docked the toolbar in the rail on release. The slide now counts only at a brisk hand: a new gate
  **`LandingGates.slide`**, default 16 px per 8 ms (2 px/ms). Above it a fling, along the lane as well as across it, is
  no entry, and it restarts the slide count, so a fling that slows for a frame or two still docks nowhere (only a
  sustained slide of `path` px at or below the gate does); the lane is entered only by its own gate, the slow `path` or
  a rest past `pause`. The cost: above 2 px/ms a
  hand sliding along a corner lane keeps the previous lane's end spot until it slows or rests. Host notes: a host that
  wants the old rule sets `gates: { slide: Infinity }`. `LandingGates.slide` is a new required member: a host that
  builds a full `LandingGates` literal adds it (`slide: 16`, or spreads `LANDING_GATES`); a host that passes
  `Partial<LandingGates>` (`options.gates`) is unaffected.
- `./drag`, **far beyond the held lane the frame is held but refused** (behavior change). Inside a touching lane not
  entered, the held lane held however far the pointer went, so after a flick up a rail that didn't enter it the frame
  said "the bar, its home spot, landing at home" 288 px above the bar, and nothing told the user the release goes home.
  The hold through a touching lane is for crossing a corner: more than `path` (40 px) past the held lane's exit margin
  the frame is now `region: "refused"`, its `lane` kept (its guides stay), `spot` and `landing` null and no `pending`;
  `release()` is null (home). Host notes: a host that shows "Can't go here" for a refused frame with no `pending` shows
  it there; nothing to change.
- `./drag`, **a Near guide shows a lane only where the pointer can enter it** (behavior change, a default). With
  `placeGuides: "near"`, a lane's guides showed from the nearest lane within `reach` (80 px), and over a refused place
  (a column that takes nothing) from the nearest lane at any distance, so a toolbar carried toward an empty side rail
  beside a panel column showed the rail's box 200 to 300 px away, a place it could not enter yet. That second rule is
  deleted. Now a Near guide shows for the held lane (also over its own refused stretch); else the pending lane (the
  pointer inside it, its gate not passed); else, with the pointer in open space, the approached lane, the nearest within
  `approach.reach`, which now defaults to the entry margin (`LANDING_MARGINS.exit`, 12 px, was 80). Over a refused place
  outside every lane no guide shows. `LandingApproach` and its hysteresis stay (a lane is kept until another is `nearer`
  closer), with one default more: `keep` is 12 (was 96), and is read as at least `reach`, so a lane acquired within
  reach is never dropped at once. Otherwise a guide would linger up to 96 px after the pointer left the lane, in open
  space where a release floats. A lane is acquired only within `max(reach - margins.spot, reach / 2)` (6 px; half the reach where the spot margin
  would leave less, a small `reach` or touch margins) and kept to `reach`, so a
  pointer wobbling across the reach's edge never blinks the guide (with `keep` equal to `reach` there was no band).
  Host notes: a host that wants the early guide sets `approach: { reach: 80, keep: 96 }`
  (the old values); nothing else to change. That restores the early guide in open space only: over a refused place no
  guide shows at any reach.
- `./drag`, **`guideRects` thins a box a clear rect pokes into** (fix, rule C3). A clear rect, grown by its clearance,
  that covered only part of a box's thickness always cut the box along its length on the facing side, so a neighbor
  poking 2 px into an 868 x 29 bar cost the bar 49 px of length. Now, when its overlap across the box is smaller than its
  overlap along it and it reaches one side of the box, it thins the box from that side by that overlap and no length:
  2 px less thickness. The deepest intrusion from each side wins, whatever the order. The order is: thinnings, then the
  full-thickness interval subtraction and the corner cuts in sorted order, then `minLength` and the ids by interior
  cuts. A box thinned below `minThickness` is dropped. Only a shallow intrusion thins, at most half the box's
  thickness: a rect that pokes in deeper (the held item's outline flush with one side of a bar, which would leave a
  4 px sliver), as deep as it is long, or touches neither side, is a corner as before. Behavior change: a shallow, long
  poke now removes thickness where it removed length.
- `./drag`, **`guideRects` ids count only interior cuts** (fix). A full-thickness clear interval that touches or
  overlaps the box's start or end trims the box and is no cut; only intervals strictly inside the box (box length on
  both sides) count. A neighbor toolbar flush with the box's start, its 2 px clearance over the first 2 px, used to
  count as a cut and renamed the real before-part of a held rect `<id>#2` (and the after-part `<id>#3`); now they are
  `<id>` and `<id>#2`. One consequence: while a held rect overlaps the box's start, the single part left after it is
  `<id>`, not `<id>#2`.
- `./drag`, **`guideRects` cuts a box by one model** (fix; additive optional `axis` on `PlacedGuide`). The first
  version of the split above re-derived a box's orientation for every part, so after one cut a part narrower than the
  box is thick turned the next clear rect into a corner cut: it kept one piece with no `minLength`, lost one of the
  parts and gave a result that depended on the order of the clear rects; ids were numbered by rank among the survivors,
  so they churned as the held item slid. Now: one axis per box (its long side, decided once from the box clipped to
  `inside`; a square takes the guide's `axis`, else x). Every clear rect across the box's whole thickness is subtracted
  as an interval along the axis, so the result equals a 1-D interval subtraction in any order. Corner rects then cut
  each part on the facing side, in order of their distance along the axis. `minLength` applies once, at the end, to
  every cut part, corner-cut ones included (a part nothing touched is kept as it is). Ids follow the side: `<id>`
  before any full-thickness cut, `<id>#<k + 1>` after k of them, so the part before a cut is always `<id>` and the part
  after one cut always `<id>#2`, whether or not the part before survives. A guide's own `id` must not end in `#` and
  digits, and an `id` that is not a string is not suffixed (unsupported for a split box). Behavior change: a split
  box's far part keeps `<id>#2` where it was `<id>` when the part before it fell under `minLength`.
- `./drag`, **`guideRects` keeps both parts of a box a clear rect splits** (fix; additive option `minLength`, export
  `MIN_BOX_LENGTH`). A box over the room on both sides of a sliding held item, with the item's outline passed as a
  `clear` rect, was cut "on the side facing the rect" and kept only its larger part, so the far side's mark (about
  107 to 183 px in a toolbar bar or rail) disappeared, and the kept side flipped as the item moved. A clear rect across
  a box's whole thickness now leaves the part before it and the part after it, each kept when at least `minLength` px
  long (default 8); one over an end leaves the other part as before; one over part of the thickness (a corner) keeps
  the cut on the facing side, no L-shapes. A split box comes back as two guides: the first keeps the guide's `id`, the
  second gets `<id>#2`, so a host keys each part by its id. A part under `minLength` left by such a cut is no
  longer drawn.
- `./drag`, **`createLandingModel` measures a lane's depth across it, not from its ends** (fix). The `depth` gate (a
  still pointer 8 px inside a lane enters it) counted every side of the lane's rect that is not on the stage's edge, so
  a rail's end that meets a bar counted as a wall: a still pointer 6 px above that end was never deep enough, and the
  drop landed nowhere. Depth now counts only from the two sides parallel to the lane's axis that face into the stage
  (a rail's long sides); a lane's ends along its own axis never count. A fly-through of a thin bar or rail still opens
  no room (the `path` gate and the sides across it are unchanged), and a fast pass along a rail's end does not enter it.
  The one visible change: a still pointer near a lane's end is as deep as anywhere along it.
- Docs: **the hand rule** for `createLandingModel`, in one wording with placement's. While a lane holds, the landing is
  the nearest landing in its lane to the pointer, within `max(48, g / 2 + 6)` px of it (`max(56, g / 2 + 6)` on the
  frame before a hop), `g` the gap along the lane between the facing edges of the two adjacent landings the pointer
  lies between. Before, the reference said "up to 56 px on the frame before the hop, 48 px on every other", which a
  docked item much longer than the held one exceeds. No behavior changes.

## 26.11.51

Host notes: none.

- `./drag`, **`guideRects` ignores a clear rect that isn't finite** (fix): a clear rect whose x, y, width or height is
  NaN or infinite is skipped. Before, one such rect silently dropped every box and gave thin guides NaN fields.

## 26.11.50

Sliding spots: a free stretch exposed as one spot, where the item lands at the hand. With `@n-uf/placement`'s
`stretchPositions: "free"` (placement's default from this release). Host notes: additive; pass the press's `grab` to `createLandingModel`, draw `frame.landing`
(it moves with the pointer over a sliding spot) and commit a sliding spot through its target's `after(point, grab)`,
as for a float. A host that commits a spot by its id alone must pass the pointer for a sliding one.

- `./drag`, **`LandingSpot.slide`** (`LandingSlide`: `{ from, to, snaps, snapDistance? }`, additive): over a sliding
  spot the frame's `landing` is the spot's landing moved along the lane to the pointer less the grab, clamped to
  `[from, to]` and snapped to the nearest snap point within `snapDistance` (`SNAP_DISTANCE`, 8 px). No steps inside it;
  passing a neighbor is still one step.
- `./drag`, **`LandingOptions.grab`** (additive): where the pointer holds the item, from its top left corner; default
  the middle of `regions.item`.
- `./drag`, **`LandingRelease.at`** (additive): on a sliding spot, the landing's start along the lane, exactly as the
  frame shows it (a snap point, else on the spot's `step`), read once at the release; `home` holds only at the
  item's own place.
- `./drag`, **`LandingSlide.step`** (additive, default 1): the grain of a start that snaps to nothing, px, clamped to
  `[from, to]` (0: wherever the pointer puts it). The frame, a release's `at` and the spot's own commit round by the
  same step, so the rect a frame draws is the rect the drop commits; placement's spots carry `step: 1` (whole pixels).
  A host that builds its own sliding spots and wants the old unrounded frame gives `step: 0`.
- `./drag`, **the lift zone is the item's own lane's** (fix): within `margins.lift` of the lift point the landing model
  now takes `home.lane` as the lane whenever the pointer lies in it, whatever lane the pointer came through, and
  `home.spot` as the spot (a sliding one still lets the landing follow the hand and snap). Before, only owning lanes (a rail drop strip) were kept out of the zone: a plain lane's
  band lying over the home lane's corner (an empty bar over the top of a rail) kept the pointer on a slow return and
  the release landed in that lane instead of home. Away and back to the lift point is home on every layout, at any
  speed; within `lift` of the press no nudge to a neighboring spot is reachable. The zone is a held state with
  hysteresis: the drag starts in it, leaves it past `margins.lift` and re-enters only within `margins.lift -
  margins.spot`, so a wobble at its edge never flips a cut near the press.
- `./drag`, **`guideRects` keeps every guide `clearance` px clear of `clear`** (fix, `GuideRectsOptions.clearance`,
  additive, default 2): a box never read `clear` and could touch the content (0 px); it is now cut on the side that faces
  each clear rect (the rect grown by `clearance` taken out, the largest remaining part kept, none: dropped). A thin guide
  keeps being thinned from the content side, now with the same 2 px gap (a strip beside content is 2 px thinner than
  before, and may fall under `minThickness` and be left out). Clearance is per clear rect: `clear` takes `Rect |
  ClearRect` (`{ rect, clearance, kinds? }`, additive type). A plain rect keeps the default gap for every kind; pass
  `{ rect, clearance: 0 }` for content a thin guide may run flush against, which is the old thin-guide result, and `kinds:
  ["line", "hatch"]` where a box may still lie over it (an empty lane's real-size box moves the content aside).

## 26.11.49

Guides placed inside the window, and no "Can't go here" while the pointer enters a lane. With `@n-uf/placement`
26.11.49. Host notes: draw guides through `guideRects` (or keep your own placing); nothing else changes for a host.

- `./drag`, **`guideRects(guides, { inside, inset?, clear?, minThickness? })`** (additive): where to draw guides
  inside a window. Every guide lies inside `inside` by `inset` (2 px). A box is clipped. A thin guide (a line, a
  striped strip or end: its shorter side is its thickness) keeps its thickness and moves inside rather than being
  clipped, so a line at a lane's far end is as thick as at its head. It is then thinned from the content side to stay
  clear of `clear` (the content), so a thin strip lies between the inset and the content, the same on both sides. A
  thin guide under `minThickness` (2 px) is left out. A guide already in place comes back as given (the same object).
  `GuideRectsOptions` and `PlacedGuide` are its types.
- `./drag`, **`pending` past a held lane's rect** (fix): a pointer coming from a refused stretch of a column into a
  docked rail beside it showed "Can't go here" in the rail's first pixels (the column still holds there, within its
  exit margin, and refuses). The held lane still holds, so lane to lane never passes through the float, and where the
  pointer is inside another lane it hasn't entered yet the frame names that lane `pending`: a host shows no "Can't go
  here" while it is set.

## 26.11.48

The landing model's guides gain a kind, and a lane over a place that takes nothing is easier to reach. With
`@n-uf/placement` 26.11.48. Host notes: `LandingMark.kind` and `LandingGuide.kind` gain `"hatch"` (a host with an
exhaustive `switch` over them adds a case: a striped cue in the guides' color, never the accent); show no "Can't go
here" while `LandingFrame.pending` is set.

- `./drag`, **hatched guides** (additive kind): a guide may be a `hatch`, a cue only: a striped end inside a box whose
  room partly fits, or a thin striped edge where an empty side rail would open (`lanes()` gives them).
- `./drag`, **`LandingFrame.pending`** (additive): the lane the pointer is inside but hasn't entered yet (a fast pass,
  or the moment before a slow step). A host shows no "Can't go here" while it is set, though a release still lands
  nowhere: an empty side rail's strip never says "Can't go here".
- `./drag`, **entering a lane over a place that takes nothing** (fix): where the pointer lies over something that takes
  nothing reaching past a lane (an empty side rail's band over a column) and in no other lane, the lane is entered on
  the first slow step (not on the lift), instead of showing "Can't go here" until its gate passed. A fly-through still
  opens no room there (P10); bars and rails over open space keep their gate.
- `./drag`, **`LandingLane.owns`** (additive): a lane that owns its rect (a rail drop strip at the window's side, as
  `lanes()` marks it) takes the pointer inside it from any lane it overlaps, a held one too, once its own gate passes
  and once the pointer came into it from outside since the lift: a panel settled in the strip lands in the rail even
  where the strip lies over a flush column's edge, and a press in that edge, or a slow reorder along it, stays in the
  column. A host that builds its own regions sets it on its strip lanes; one reading `lanes()` gets it. Within
  `LandingMargins.lift` (additive, optional, 16 px, as the drag intent's `liftZone`) of where the item was lifted an
  owning lane takes the pointer by no gate: a panel pressed in the strip, taken away and brought straight back there,
  lands home. Elsewhere in the strip, once the pointer came in, the strip takes it, so a lone panel reaches its own
  side's rail; a slow slide along the strip toward the lift point can be taken by the strip before it gets there.
  The lift point is `LandingOptions.lift` (additive, optional: the press, for a host whose first update comes late),
  else the first point, and stays for the whole drag, `hide()` included.
- `./drag`, **`DropPreviewMode.emptyLanes`** (additive, `"real" | "edge"`): `previewPlan()` carries it as
  `PreviewPlan.emptyLanes`, `"real"` by default, for a host to pass to `lanes()`: an empty lane drawn at its real size,
  or as a thin striped edge.

## 26.11.47

No changes in `@n-uf/motion`: the version is shared with `@n-uf/placement` 26.11.47 (its landing rows' `home` check).

## 26.11.46

No changes in `@n-uf/motion`: the version is shared with `@n-uf/placement` 26.11.46, whose `lanes()` now takes the
grab. A host that drags with `createLandingModel` passes its grab to `lanes()` so a toolbar brought back to its press
point lands on its own place.

## 26.11.45

The landing model, opt-in: nothing a host already uses changes behavior. Host notes: `DragPreview` gains `"item"` (a
host with an exhaustive `switch` over it adds a case); `PreviewPlan.guides` is optional, so a plan a host builds itself
still compiles. With `@n-uf/placement` 26.11.45 (`lanes()`).

- `./drag`, **`createLandingModel`** (additive): the landing model of a docking drag as state (region, lane, spot) over
  the lanes `@n-uf/placement/scene`'s `lanes()` gives. Up to 48 px past the stage counts as on its edge; a held lane
  holds within a 12 px exit margin, and inside a lane touching it until that lane's gate passes or the pointer has
  slid 40 px along it at any speed (across it at most a third as far); entry passes a path
  gate (40 px of slow path along the lane) or a still gate (depth from the sides facing in); spots change past a 6 px
  margin, on a slow step where the change reflows the window or once the landing trails the pointer by 40 px; a spot's
  own regions confirm a reflowing change (`regionsFor`, replaceable with `setRegions`); Shift floats; guides are the
  lanes' marks, keyed by id. No waits; stillness needs the pointer put for 22 ms after a slow step or on the stage's
  edge, else 60 ms, so a host may update per sample or per frame, whatever the sample rate. `createDragIntent` is
  unchanged.

- `./drag`, **place guides** (additive). `previewPlan` also takes `{ mode: "outline" | "placeholder" | "snap",
  placeGuides? }` (`DropPreviewMode`), drawn with `"indicator"`'s, `"gap"`'s and `"item"`'s plan. Its result gains an
  optional `guides` (`PlaceGuides`: `"off"`, `"near"`, `"all"`; absent means `"off"`, so a `PreviewPlan` a host builds
  itself still compiles): the mode's `placeGuides` (defaults `PLACE_GUIDES_DEFAULT`: snap
  and placeholder near, outline off) while no landing shows, `"off"` whenever one does. The string forms give
  `guides: "off"` and are otherwise unchanged.

- `./drag`, **`DragFrame.landing`** (additive): what a release at the frame's point lands on, by the one check
  `release` makes (`earlyRelease` included), so a host draws the landing from the same answer a release gives. The
  field is optional in the type, so a host or a test that builds a frame itself needn't set it; `createDragIntent`
  always does.

- `./drag`, **`previewPlan`'s `"item"`** (additive): the dragged item is the only preview. No indicator shows for any
  target; the item sits in a slotted target once the room is open and otherwise stays on the pointer. `DragPreview` gains
  the value, so a host with an exhaustive switch over it adds a case.

- `./drag`, **`earlyRelease`** (additive). `DragIntentOptions.earlyRelease` says what a release does before the item has
  settled on a target. `"target"`, the default, works as a release always has: it lands on the shown target, else the one under
  the pointer, an `opensRoom` target that hasn't shown included. `"float"` makes what shows what lands: until the room
  is open the item is on the pointer, so it floats there; over a refusal or outside the float's `bounds` it lands nowhere.

## 26.11.44

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.44 (`contentMin.chromeWidth` in `./scene`).

## 26.11.43

- `./drag`, **`DragTarget.roomHit`** (additive): the zone an `opensRoom` target holds once its room is open, the drawn
  room (`@n-uf/placement` gives its hit and landing rect). While the target shows with its room open it holds in
  `hit ∪ roomHit`, inside its `bounds`: a refusal or a target no more precise than it under the room doesn't take over,
  and the frame isn't `refused`; those places are reachable once the pointer leaves the room. A more precise target past
  the breakthrough and a held key still win; out of both it is held by its hit and band as before. A target without it
  is unchanged.

## 26.11.42

- `./drag`, docs: **a refused place is never drawn.** `frame.refused` is unchanged; the docs now say a host draws
  nothing over the refused place and may say "Can't go here" at the pointer while it is set.

- `./drag`, fixed: **a rail's room opens with its target, never after it** (additive). A rail's indicator showed once
  the pointer aimed and its room `roomAfter` (160 ms) later, so for that time it lay over the column the room moves
  aside. New `DragTarget.opensRoom`: showing the target and making its room are one decision. It shows once it has held
  `roomAfter`, or its own `DragTarget.roomHold` (ms) when it has one, and the frame that first shows it has `room`; a
  sweep across it still moves nothing, and a release before it shows lands on it, though no frame showed it. A host that
  draws only a marker opens the room on `frame.room && frame.shown?.opensRoom`. An armed spring-loaded target now
  has its room in the frame that shows it, about 160 ms earlier than before. `roomAfter` stays, with its default, for
  every other target.

## 26.11.41

- `./drag`, fixed: **a floating item's own place loses to a refusal and ends at the window's edge.** Home gated every
  pick, refusals included, so a float whose box lay over a refused place, lifted and let go there, was over home (no
  `refused`, a host moved it where it was let go). New `DragIntentOptions.floating`: the held item floats and `home` is
  its box, a free placement ranked like the float target. Its home then holds only where the pick there, home ignored,
  is no refusal and inside the window: over a refusal the frame is refused, `atHome` is false and a release lands
  nowhere; on or past the window's edge (the float holds only inside its `bounds`) nothing is picked. Elsewhere in its
  box home holds as before (a host moves the float where it is let go). Without the option (a docked item) home is
  unchanged: its own home target beats a refusal. Hosts that lift a float pass `floating: true`.

## 26.11.40

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.40 (a drop names a zone only where the
  edge offers a choice, in `./scene`).

## 26.11.39

- `./drag`, fixed: **the float key chooses the float over dock targets, not over refusals or outside the window.**
  With Shift held, the float showed and a release floated wherever the pointer was, a refused place and a pointer
  clamped onto the window's edge included. Now, where the pick under the pointer is a refusal, the float key picks
  nothing: the frame is refused (`refused` says which, `forced` is still `"float"`), nothing shows, a release lands
  nowhere, and `refusedSinceShown` behaves as without the key. Outside the float target's `bounds` it picks nothing
  too. Over a dock target, a spring-loaded strip or open space inside the window it still floats. The rail key is
  unchanged: its drop lands on the rail, not where the pointer is.

## 26.11.38

- `./drag`, **`frame.refusedSinceShown`** (additive for reading; a host or test mock that builds a `DragFrame` itself
  must now set it, since the field is required). A refusal hides the shown target at once, and the next one shows
  only once the pointer aims again, so a pointer that crosses a refusal and is let go at speed beyond it has no
  indicator drawn, while `release` lands on what is under it. The new frame field is true then: no target shows, and
  the pointer has been over a refusal since a target last showed. A host that commits only what it has drawn commits
  such a release too (`frame.shown || frame.refusedSinceShown`), with no memory of its own: read both from the frame of
  an `update` at the release point, called before `release`. What shows, and when, is unchanged: no indicator flashes
  as a fast pointer leaves a refusal.

- `./drag`, **a real target always beats a refusal** (pick change). `targetAt` ranks a refusal (`refuse: true`) at the
  new `REFUSAL_RANK`, 2.5, whatever its own `priority`. It is an ordering rank, not a priority: priorities stay the
  integers 1, 2 and 3, and `refuse: true` is a refusal's tier, ordered after every target of priority 1 and 2 and
  before priority 3 (the float). Where a refusal and a real target meet or overlap, the target wins, so a gap that
  shares an edge with a smaller refusal keeps its end; over a refusal alone it still wins over the float, and the band
  rule is unchanged. `pickRank(t)` gives a target's rank. A pick with no refusal in it is unchanged.

- `./drag`, **a zone's bounds** (additive). `DragTarget.bounds` (a rect, the window's stage) makes a zone, its band
  and its gap grace half-open toward the outside: they hold only points strictly inside `bounds`, so a float shown
  inside the window hides on the first frame the pointer reaches the edge. The window's boundary belongs only
  to the targets drawn against it: a refusal and the whole-plane float carry `bounds`, a gap or a slot doesn't. So a
  pointer a host clamps onto the window's edge picks a gap whose hit reaches the edge, else nothing (a held gap keeps
  its band), and never a refusal or the float: a release past the window over open space commits nothing. This relies
  on the host clamping exactly onto the stage's edge (`x + width`, `y + height`): one that clamps to `width - 0.5`
  still picks inside the window. A target without `bounds` is unchanged.

## 26.11.37

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.37 (`Edge.hidden` in `./scene`).

## 26.11.36

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.36 (`./tiling` fixes, bars that give way by
  height, an overlay bar's `span: "full"`, anchored floats that keep clear of other floats and more in `./scene`).

## 26.11.35

Not published: its release run failed on a test timeout. Everything below ships in 26.11.36.

- `./drag`, **a lift zone as a rect** (additive). `DragIntentOptions.liftRect` gives the "changed my mind" spot as a
  rect: while the pointer is inside it, no spring-loaded target arms by dwell, and the 16 px `liftZone` radius is not
  applied. A kit passes the part of a wide grip that a drop strip covers, so the strip arms right beside the grip
  (180 px further down it, or 10 px below the grip) while a pause back on the grip still commits nothing. Without it,
  the radius works as before.

- `./drag`, **refusals take part in the pick** (additive; host note). A target may be a refusal (`DragTarget.refuse:
  true`): a place that takes no drop. It counts in the pick under the pointer, but it is never held or shown, and a
  release over it lands nowhere. Where the pick is a refusal, the band and the gap grace of the target held before no
  longer reach over it: a kit's rail stop, held, hid the "No room here" under its band. The frame's new `refused` says
  which refusal the pointer is over. Between real targets the band and the breakthrough are unchanged. Hosts: pass
  your refusals to `update` and `release` with the targets, and read `frame.refused` instead of looking them up.

## 26.11.34

- `./drag`, **the lift zone: back where it was lifted, a pause commits nothing.** A panel lifted by a grip under a
  rail strip (a flush drawer at the window's edge), dragged away and brought back to its grip, collapsed into the rail
  after the dwell. No spring-loaded target now arms by dwell within `DragTuning.liftZone` (new, 16 px: about a grip's
  size) of the lift point, `DragIntentOptions.lift` (new; default the first sample). Elsewhere, home under a strip
  included (an item alone in its column reaching its side's rail), arming is unchanged, and the rail key (⌘/Ctrl) still
  forces the rail anywhere, the lift zone too.

## 26.11.33

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.33 (a float stored taller than the clear
  stage is drawn between the bars).

## 26.11.32

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.32 (`withRefusals` and `resizeStep` in
  `./scene/cases`, and new case rows; the lab is now one Scene host).

## 26.11.31

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.31 (`foldedBy`, an edge's items in order,
  remembered `stops()` and resize never over bars in `./scene`).

## 26.11.30

- `./drag`, fixed: **spring-loading is not gated by home.** A strip that overlaps the held item's own place (an item alone
  in its column, dragged to its own side's edge) never armed by dwell, and a release there did nothing, even armed; an
  armed magnet reaching back over home lost its marker. Now a `arm: "dwell"` target arms while the pointer is over home,
  is picked and held while armed (the band and the grace too), and `release` over home returns it when the point is in its
  armed hit area. A target that isn't spring-loaded, and an unarmed one, behave as before (nothing shows over home, a
  release there does nothing). The frame's `atHome` can be true while an armed target shows.
- `./drag`, **the default rail key is now ⌘/Ctrl (`"Mod"`), not Alt.** `ModifierKey` gains `"Mod"`: ⌘ (Meta) or Ctrl,
  whichever is held, so no platform detection is needed. Alt is left free, so an app can keep it for unfreezing a
  frozen layout. `DragTuning.modifiers` defaults to Shift and ⌘/Ctrl. **Migration:** pass
  `modifiers: { on: true, floatKey: "Shift", railKey: "Alt" }` to keep Alt. README, host contract: while a drag is in
  progress, the host suppresses the context menu (a Ctrl-click on macOS) and the ⌘/Ctrl keydown shortcuts.
- `./drag`, fixed: **a spring-loaded target arms only after the pointer has entered it.** Dwelling on the item's own
  place armed a strip lying under the lift point (a flush window's panel at the window's edge: lift, pause, let go
  collapsed it into the rail). The lift point now counts as not entered: a drag that starts inside the hit area must
  leave it and come back before it arms; entering it from over home still counts. `DragTuning.railArmDwellMs` says so.

## 26.11.29

- `./drag`, **spring-loading and keys that win over geometry** (additive; targets without `arm` and hosts that pass
  no keys behave as before):
  - `DragTarget.arm: "dwell"` marks a spring-loaded target: no target until the pointer has dwelt in its zone for
    **`DragTuning.railArmDwellMs`** (default 200 ms, as platforms spring-load a few hundred ms after the pointer rests;
    0 arms at once). Armed, its zone is `DragTarget.armedHit` (a magnet), it shows at once, and leaving that zone
    disarms it. `DragFrame.arming` names the target dwelt on, for the host to highlight.
  - **`DragTuning.modifiers`** (`DragModifiers`: `{ on, floatKey, railKey }`, default Shift and Alt, on):
    `update(point, time, targets, keys?)` and `release(point, targets, keys?)` take the keys held (`DragKeys`); the
    float key shows and lands on the `free` target anywhere, the rail key on the nearest spring-loaded target.
    `DragFrame.forced` says which one won. Type `ModifierKey`.
- `./drag`, fixed: **leaving the float for a tile switches at once.** The breakthrough held the float (a `free`
  target) until the pointer was 4 px into a more precise zone, so a zone ending at the window's edge (a new-column
  line in a flush window) floated over its first px when the pointer came from outside. Hysteresis is for the seam
  between two tiles only: from a `free` target, or from none, the zone under the pointer takes over at once.

## 26.11.28

- No change in `@n-uf/motion`, apart from a README note on the drag intent: a host clamps the pointer into the stage
  before it reaches `update` and `release`. Released together with `@n-uf/placement` 26.11.28 (rail titles and edge-target
  fixes in `./scene`).

## 26.11.27

- `./drag`, **`createGripPress`: a double-click on a grip is its own gesture** (additive). A press tracker for grips:
  `move` answers the lift rule, `up` gives `"click"`, `"doubleActivate"` (the second press of two within
  `DOUBLE_CLICK`, or the platform's count when the host passes it) or null after a lift. The second click of a double
  is not a click, and a double never lifts. Types `GripPress`, `GripRelease`.
- **`DOUBLE_CLICK`** (`{ ms: 500, px: 5 }`, type `DoubleClick`; from the root and `./drag`): the package's one double
  click. **Changed:** the gesture recogniser's default (`RECOGNIZER_DEFAULTS.multiClick`, now this same object) goes
  from 300 ms to 500 ms, the desktop systems' own default, so two clicks 300–500 ms apart now count as a double
  (`clickCount` 2). Pass `multiClick: { ms: 300 }` to keep the old interval.
- `./drag`, **the band and the breakthrough scale with the zones** (`DragTuning.bandShare`, additive, default 0.2):
  along each axis they are at most a fifth of the held zone's extent and of the zone under the pointer, so a 28 px row
  holds 5.6 px past its edge, not 10, and a glide straight from home into a small neighbour's far half lands there.
  Zones 50 px and larger keep the whole 10 px band and 4 px breakthrough; `bandShare: 1` gives the old rule for zones over 10 px.
- `./values`: the spring and the settle share one critically damped step and one store of components (value,
  velocity, target), instead of two copies. Nothing public changes, and the numbers are bit-for-bit the same.
- `./drag`: `targetAt` is the one pick rule. `@n-uf/placement/scene/cases` takes it as an input
  (`createSceneHost({ pick: targetAt })`) instead of keeping a copy of its own.

## 26.11.26

- **Removed:** `SurfacePointer` (deprecated in 26.11.25); use `GesturePointer`.

- `./drag`, **`DragTarget.hits`** (additive, optional): a target's zone as several rects when it isn't one rect (`hit`
  the largest). `targetAt` and the drag intent's bands test every piece, and a zone's size is the pieces' together.

## 26.11.25

- `./gestures`, **`GesturePointer`**: the new name of the pointer the gesture stream reports. `SurfacePointer` stays
  as a deprecated alias of it, removed once its users have moved. **Migration:** import `GesturePointer`.

## 26.11.24

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.24 (`columnRoom` counts laid-out side
  bars; `isSideBar` in `./scene`).

## 26.11.23

- `./layout`, **`anchoredMorph(size, anchor, config?)`** (additive): a box held at a point that changes size about an
  anchor. `to(size, anchor)` settles the size and the anchor together, interruptible (a retarget mid-flight turns from
  where it is drawn: no jump, no overshoot), at `MORPH_TEMPO` (90 % in about 60 ms, within 1 % in about 125 ms; the
  last pixels take longer for large size changes) unless the settle config says otherwise;
  `rectAt(point)` keeps the anchor exactly on the point every frame, and `progress` (0 to 1 since the last retarget)
  drives a fade between the content it came from and the target's. Types `AnchoredMorph`, `BoxSize`. For a held item
  that takes another form mid-drag with its grip kept under the pointer: the caller anchors each form at its grip.

## 26.11.22

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.22 (static edges keep their place, outside
  top and bottom bars, the side order and float orient in `./scene`).

## 26.11.21

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.21 (local drop targets and refusals,
  toolbar priority and a strict grow-back order in `./scene` and `./stack`).

## 26.11.20

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.20 (the async case runner in
  `./scene/cases`; `columnRoom` as the sheet signal in `./scene`).

## 26.11.19

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.19 (bar alignment zones, `setSide`, the
  side parity options and `floatMin` in `./scene`).

## 26.11.18

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.18 (`wrap` forms and `grip` in `./stack`;
  compact edges, trays, `dockHome` and gap-hit rules in `./scene`; the new `./scene/cases` entry).

## 26.11.17

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.17 (a title bar keeps room for groups
  to drop back into it).

## 26.11.16

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.16 (the new `./scene` entry: one
  model of a whole window, with its drop targets; and kinds, fixed items and own widths in `./stack`).

## 26.11.15

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.15 (a fix to `fitStack`'s opt-in
  `previous`: room comes back in the reverse of give-way order).

## 26.11.14

- No change in `@n-uf/motion`. Released together with `@n-uf/placement` 26.11.14 (the toolbar cases in `./stack` and
  `fitStack(…, { previous })`).

## 26.11.13

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
