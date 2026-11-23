# @n-uf/docking

Versions are calendar versions, `YY.M.R` (year, month of the release, counter within the month), shared with
`@n-uf/motion` and `@n-uf/placement`: the packages carry the same version, and a release bumps them all. Before this
package, the docking model shipped as `@n-uf/placement/scene` and `/scene/cases`; their history is in
[placement's CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md).

Unreleased entries live in `changes/` until a release joins them.

## 26.11.59

- **One aim order for `targets()` and `lanes()`.** Both now cut where one place along an edge meets the next by one
  rule (`aimCut`): a panel column takes a panel by halves of what is drawn, as before; a bar or a toolbar rail takes the
  nearest landing, halfway across the gap between the two landings either side of a neighbor, at the grab where they
  overlap. `lanes()` cut this way already; `targets()` cut a toolbar's neighbor at its middle, so a host reading the
  tiles and one reading the lanes could put a toolbar on opposite sides of the same neighbor for the same pointer. The
  tiles now follow the lanes, across zones and past fixed items too (one place in the edge's order is one stretch, as a
  sliding spot is): dragged over a neighbor of its own length, a toolbar takes that neighbor's place, and
  home holds its own place only up to the cut beside it. A slot that lands within half a pitch of the item's own place
  (pushing a neighbor) is home's, as in the lanes. A toolbar tray at a column's foot cuts by halves, like its column, as
  before.
- **Two docks at one landing: the zone beside the stretch.** Where a sliding spot's start (or another of its snap points)
  is also a center dock's landing, the dock in the zone of the neighbor before the stretch wins, so a drop flush after
  the last start-zone toolbar stays in the start zone.
- New: `DockDropOptions.grab` (where the pointer holds the item, as `DockLaneOptions.grab`): the tiles cut overlapping
  landings there, as the lanes do; without it, the item's middle. `DockDropOptions.pitch` (as `DockLaneOptions.pitch`,
  which `lanes()` passes on): half of it is how far past an overlap the cut may move, in both paths.
- **Stops are the places; the pointer takes the nearest.** A place whose landing is never the nearest to any pointer
  (behind a fixed run, say) has no hit in `targets()` and a spot with no stretch in `lanes()` (its guide still drawn);
  `stops()` still lists it, at its landing, so "Move to ›" and the arrow keys keep every place they had.
- **A sliding spot's target holds its stretch.** Its `hit` now runs over the spot's stretch of the lane, not over its
  whole range of landings, which ran into the neighbors' stretches.
- **Three layouts, one job each.** On a bar or a toolbar rail which places exist and fit is read in the room, growth
  off (the gap beside a grown row stays a place); where the aim cut between two places lies is halfway between their
  landings, each in the layout its own drop commits (a grower as that commit draws it), in the tiles and the lanes
  alike, never from insertion lines; what is drawn is `shown(frame)`. A place over free room cuts from its range's
  ends, the room its drop makes, so beside a growing neighbor (a title, a stretchable panel) whose slack a dock takes,
  the slack is reachable: the place after it starts halfway from the landing before the neighbor. The tiles order
  places by their landings, not by their zone pieces, so where a grower moves a landing past another place's (a center
  dock beside stretchable panels), both paths agree. A place is unreachable only where its landing is another's.
- **A place whose cuts cross moves no other cut.** Where a place's cut after it would lie before its cut before it (a
  sliding spot where the item lands in a shorter form, between two docks that overlap), it is nearer no pointer: both
  paths leave it out of the cutting, its neighbors cut between themselves, and it keeps a spot with no stretch (a stop).
  Before, the lanes kept their cuts in order by pushing the next cut on, so the place after the crossed one started late.
- Changed (behavior): **a sliding or pitched dock counts the dropped item as just used**, as every target's drop
  already did ("a dropped item counts as just used"): one model on both paths. So on a full bar, after a slide, the
  neighbor that gives way is the one the solver gives up first for the freshly used item: the least used goes to the »
  where a neighbor used to step down to a shorter form to make a single start (a toolbar dropped beside two others on a
  bar with room for only two keeps the bar, and the least used of the two moves to the »). A slide's commit and the
  tile's for the same place now agree on which neighbor that is.
- **The grab's share reads the held item.** `targets()` reads `DockDropOptions.grab` as a share of the item's length as
  held (a movable grower at its natural length), as `lanes()` does.
- **Stops list every place that fits on a bar.** A slot of a bar or a toolbar rail whose stretch clipping left under a
  pixel is a stop too, as one the aim cuts leave none.
- Changed (breaking for conformance): the row `R4-bar-gaps-split-at-the-middle` is renamed
  `R4-bar-items-take-the-nearest-landing` (a toolbar over a neighbor of its length stays before it on either side of
  its middle); `R7-end-zone-pushes-fixed-behind-a-movable-leading` now expects the drop after Zoom, as the trailing row
  does, since the nearest landing over Zoom is Zoom's place. A host that lists either row by id or by its old outcome
  updates it.

## 26.11.58

- Fixed: **no guide lies over a movable grower while another item is held beside it.** The marks read a grower as the
  frame draws it: in a held place's layout, its release's commit, it has taken its bar's free stretch, so the box and
  hatch of the place after it are cut there, not where its natural length ends. A growing fixed title's slack stays free
  room for the marks, as before. Drop room still counts a grower at its natural length.
- Fixed: **a movable grower floats at its natural size, under the hand.** A form that grows without a body (a toolbar
  that grows on a bar) is not sized by hand (`sizedByHand`: a form that grows and shows a body, a panel's card): its
  float takes its `floatSizes` or its natural size, never `DEFAULT_FLOAT_SIZE` or a rect left from its grown length, and
  `fitResize` and `orientFloat` treat it as a toolbar group: a float of a movable toolbar grower is not resizable by hand
  (`fitResize` gives null), since its size comes from its forms. A float of it keeps the hand's share of the grown rect
  it was pressed on, so it lies under the pointer, and every frame of its drag lands as its release commits.
- Added: **a movable item that grows takes its bar's free span.** An item that isn't fixed, drawn in a form with
  `main.grows` on a bar (a top or bottom bar, a compact rail, a side toolbar bar; never a panel column, whose cards grow
  as before), no longer just takes the fit's spare length end to end: the zones are laid with every growing item at its
  natural length, then each free stretch goes to the movable growers in the zones beside it (a start-zone grower the
  stretch after its zone, an end-zone one the stretch before, a center one fills the stretches on both sides), so a
  centered item that doesn't grow stays put. Its asked length on a bar (`DockItem.lengths.row`) is replaced by the free
  span (it only weighs the shares where two growers border one stretch). A fixed grower on such a bar (a title, say)
  keeps its natural length. No new field: `main.grows` says it.
- Added: **for drop room a movable grower counts at its natural length**, as a growing title does: every drop-room
  reading of a bar (its zone extents, slot lines, cards, the dragged item's own place, an empty zone's probe, and
  `zoneExtents`) is taken in one layout, the window solved with every movable grower's growth off (once per drag), so
  what its growth pushes along (a toolbar after it in its zone) counts where it would lie without it. The targets,
  refusals and zone extents beside a grower are those of the same state with the growth off (a center drop beside it
  is no longer lost, a bar with a centered fixed item takes it).
- Added: **dragged, a movable grower previews and lands at its natural length.** Its drop layouts (a target's `after`,
  `dockDrag`'s `after(held)` and its `landing`, a lane spot's landing, the held item's size) are the drop's state solved
  with its growth off: it and its bar's neighbors lie at its natural length, with no hole in its zone, and solving the
  state grows it. This is the one exception to "a held frame and its commit read one layout". States with no movable
  grower on a bar lay out, target and land exactly as before.
- Added: **`DockItem.countsAsDocked`, so a side strip no longer switches on the inset of `insetWhen: "docked"`.** The
  declaration says whether an item counts as a docked panel; left out, the old rule holds (not closed, not fixed, its first
  column form `open`, `header` or `rail`). It overrides that either way: `false` on a narrow column that only moves the
  content aside leaves the inset off while it is open alone, so the content is the stage's less the strip's width and the
  strip lies flush at the window's side; `true` counts an item of another form. With a docked panel open as well the
  inset is on, as before. It is a declaration like `pushable`: `readDockState` takes it from `base`, `storeDockState`
  never writes it. A state that declares none lays out exactly as before.

## 26.11.57

- **Keep-clear rects anchored to the layout's content** (new, additive). A `DockState.keepClear` entry may now be
  `{ region: "content", side, size, for, id? }` (`AnchoredKeepClear`; `KeepClearRegion` is `"content"`, extensible):
  `size` px deep at that side of `DockLayout.content`, along its whole length, clamped to it, none in an empty content.
  `solve` resolves it once the edges and the content are final, before the floats, into the new
  `DockLayout.keepClear` (`DockKeepClearLayout`: `rect`, `for`, `id`), so an overlay strip a host draws at the content's
  edge moves with the content a drop opens or closes. Before, a host fed the strip as a fixed rect taken from the
  committed layout, and a drop that opened or closed a column solved its `after` with the strip where it was: the
  commit moved it and a float re-fitted off its marker. Nothing that sizes the content reads keep-clear rects. Each
  reader names its layout: the hits a drag shows and a float resize by hand read the layout on screen; a drop's fit
  and its floats read the drop's own `after`. A guide predicted in another layout (an empty lane, a Near lane not on
  screen) is trimmed by the anchored rects on screen; a `for: "floats"` rect cuts no lane guide. A declaration like
  `pushable`: taken from `base`, never stored. A state with fixed rects only lays out exactly as before, and its layout
  has no `keepClear`.
- **`minRegion` on an anchored entry** (new, additive): `minRegion?: { width?, height? }`. While the region as solved
  is narrower or shorter than a given bound the entry is inactive: it keeps nothing clear and is absent from
  `DockLayout.keepClear` (absent, not flagged), so a host draws its overlay exactly when the entry is there. A drop
  that opens a column and takes the content under the bound has no entry in its `after` layout.
- Breaking (type only): `DockState.keepClear` is now `readonly (KeepClear | AnchoredKeepClear)[]`; narrow an entry
  with `"region" in c` (or the root's new `isAnchoredKeepClear(c)`) before reading it as a rect. No behavior changes
  for a state with fixed rects only.
- Changed (breaking for a conformance host): **`@n-uf/docking/testing` row C1 expects no `[data-drag-marker]`.** A gap or
  strip landing draws one mark, the slot (`[data-drag-slot][data-drag-target]`), so a page that also drew an insertion
  line from `DockDrop.marker` now fails the row: draw the slot only. `DockDrop.marker` stays, as data.
- Fixed: **reach only adds, for a new column's line and a rail stop too.** A bar's `endReach` strip past its end (over an
  inset's strip beside the content) used to take the corner of the virtual `column:<side>:<n>` line's own hit there, so
  the line lost its corner points once `endReach` was set; a line whose drop is the same move as home or a rail stop lost
  its pieces the same way. A reach strip now never takes what another target holds as its own: a drawn edge's owned
  band, or the tiles an edge with no drawn ends (a column line, a rail stop) has as it tiles on its own. Every target's
  pieces with `endReach` cover its pieces without it.
- **`Side` is placement's, and `Axis` joins it; both re-exported from the root.** `Side` (`"top" | "right" | "bottom" |
  "left"`) is declared once, in `@n-uf/placement`, and `@n-uf/docking` re-exports it with the new `Axis` (`"x" | "y"`):
  a host's `import { type Side } from "@n-uf/docking"` still works. `DockLane.axis` and `LaneMarks.axis` are typed
  `Axis`, the same two strings. No runtime change.
- **Removed (breaking): `DockGuide`.** It was the deprecated alias of `DockLaneMark` (what `DockDrag.guides(frame)`
  returns). A host that wrote `DockGuide` writes `DockLaneMark`: a one-line rename, the type is the same.

## 26.11.56

- Behavior change: **"does not fit" is decided by the hand.** The float target's drop (`DockDrop.after`, so
  `dockDrag(...).after({ kind: "float", point })`) keeps a float clear of the docked items only while the pointer is
  still on the item at that clear place (on the hand rect as kept inside the stage). Otherwise the float lies at the
  hand, over the docked items it covers, still clear of the bars and the chrome, and the least-covered fallback is not
  used for it. A narrow float pushed at a column keeps the wall until the pointer enters the column, as before; a float
  wider than the open room follows the hand and lands where it is shown, instead of jumping to one of a few seams.
- Added: **`DockFloat.stays`**, the mark of a float the hand left over content. `solve` keeps a marked float inside the
  stage and clear of the bars and the chrome only, never beside what it covers (a `float-covers` note says what), so
  it stays put at rest; a float with no mark keeps the rule it had (it moves clear when a column opens under it or the
  window shrinks). The float target's drop decides the mark again each time; `floatAt` with a rect clears it;
  `resizeFloat`, `orientFloat`, `raiseFloat` and `markUsed` keep it. `FloatPlace.stays` sets it with a rect
  (`moveTo`), and the place `homeFor` gives carries it. `fitResize` on a marked float stops a growing edge at the bars
  and the chrome only. Stored as `stays: true` (`StoredDockStateFloat.stays`); a `stays` that isn't `true`, or one on an
  anchored float, is dropped and listed (`float:<id>:stays`).
- The conformance row `P5-neighbour-half-facing-it` now expects the float at the hand, over the neighbor's body
  (`140,190`), not beside it.
- A float at the hand, and a marked float at rest, is pushed the least it takes clear of the bars and the chrome, along
  the axis that needs it (as the stage's edge clamps it), and stays at the hand otherwise; it is never moved to a clear
  place elsewhere.
- Behavior change: **the float floated first wins the place both want; what the hand does moves nothing else.** An
  anchored float keeps clear of the anchored floats floated before it, as before, and of the floats with a rect of their
  own floated strictly before it (a smaller `since`), no longer of every float with a rect of its own. A float floated
  after an anchored float (or as early, with no `since`), grown over it by a corner resize or dropped on it, covers it
  (or lies under it, by the stacking order), and the anchored float keeps its place. A group sent to Float from a menu
  still lands beside the floats already there.
- Behavior change: **what the hand covers, it wins; what it doesn't cover never moves.** `floatAt` with a rect (a drop)
  and `resizeFloat` give the float one more than the largest `since` there only when its new rect lies over an anchored
  float as drawn, so a float dropped or grown over an anchored float wins over it whichever was floated first; a drop or
  resize that stays clear of every anchored float keeps its `since`, so a nudge beside an anchored float moves nothing.
  Re-anchoring with no rect, `raiseFloat` and `markUsed` keep it too.
- Fixed: **over a drawn rail, a new column's line and `targets()` and the lanes now decide the same** (the one-layout
  property over a rail has no exceptions left). A drawn rail owns its whole rect, less the held tile's own run, so `targets()` no longer offers a
  `column:<side>:<ring>` over the rest of a rail (past its last tile, or below a held tile's own run) where the lanes
  stayed, and a new column's lane gives way to the rail as seen: its hit rect stops at the rail's inner side, so a
  pointer on the held tile's own rail stays home or floats, as `targets()` says, instead of picking the new column whose
  box lands where that rail was. With a tile of a rail held, the strip beside the rail is
  home's in `targets()` (the new-column lines about its folded column are the same move as home), and the lanes now
  block it too (`regions.blocked` holds the rail's home pieces), so a pointer there stays instead of floating. The new column's marks are unchanged (they are laid in the layout that makes it).
- **Added: `DockItem.stepping`**, a fixed item that still takes steps (a page readout at a title bar's end with a
  `controlLadder` of its own). It is never dragged, no hit covers it and nothing lands between it and its zone's anchor
  (read from the order of ids while it is in the »), but it steps through its forms, folds and goes into its edge's »
  like a movable item with the same forms. A declaration like `pushable`: taken from `base`, never stored. Plain `fixed`
  is unchanged.
- Fixed: **a growing title no longer takes its zone's drop room.** Its growth is spare room, not owned room: for target
  room a growing fixed item counts at its natural length, not its grown length, so a drop beside it lands exactly where it
  would beside a fixed item of that length that doesn't grow (its neighbors giving way as on any bar), where it was
  refused before. The title yields its growth to the landing and never shrinks under its natural length for a drop. A
  title bar asks nothing else of a drop: the rules that the dropped item keep its first form's kind and that nothing
  else in the bar change form are gone.
- The model reads a form's » through `StackForm.menu` (or the fit's menu list), never its kind.
- Breaking: **`DockDrop` now carries the spring-loading and room fields itself.** `arm: "dwell"`, `armedHit`,
  `opensRoom`, `roomHold` (ms) and `roomHit` used to come with placement's root `Target`, which now holds only `id`,
  `priority`, `hit`, `hits`, `slot`, `label`, `free`, `refuse` and `bounds`; they are declared on `DockDrop`, with the same
  names, types and values on every target (`DockRefusalTarget` has none of them, as before). Only a drag intent
  (`@n-uf/motion/drag`'s `createDragIntent`) reads them; the landing model and `dockDrag` never do. `EDGE_ROOM_HOLD` and
  `RailDropPolicy.magnet` are unchanged. No behavior changes.

### The drag is the landing model's whole wiring

- **Added: `DockDrag.home`**, the item's own place at the lift, `{ lane, spot }` (the first spot `lanes()` marks `home`;
  absent for a float). So `createLandingModel({ ...dockDrag(...), preview })` is the whole wiring. Old: the host scanned
  `drag.regions.lanes[].spots[].home` for it and passed `home` by hand; a host that still passes its own `home` after the
  spread keeps working (its value wins), and a host that passed none now gets the drag's.
- `./testing`, **changed (breaking, type only): `LandingRule`'s options carry `preview` in place of `placeGuides`**
  (`{ mode, placeGuides? }`, motion's `DragPreview` shape), and `createLandingHost` hands the rule the drag as it is
  (`{ ...drag, preview }`, its `home` included). `createLandingModel` from `@n-uf/motion/drag` is a rule as before.
- `./testing`: the reference host keeps a private copy of the refusal rank (2.5), as it can't import it any more from
  `@n-uf/placement`, which dropped it (see its changelog). The reference pick is unchanged and a test holds it equal to
  motion's `targetAt`.

## 26.11.55

- Added: **`DockItem.lengths`** (`{ column?, row? }`, px along the edge, per axis), the length a person asked an item to
  have, read by the edge's stack in place of a growing form's natural, and the verbs on it: **`dividers(state, layout?)`**
  (`DockDivider`), **`resizeBetween`**, **`resetBetween`** and **`resetLengths(state, edgeId)`**. `storeDockState` keeps
  the length and `readDockState` reads it back (a bad entry is dropped as `item:<id>:lengths:<axis>`; a store without it
  reads with none). Additive: a state that declares no length lays out exactly as before. A layout passed to a verb is used
  only when it was solved from that very state object; otherwise the verb solves the state again.
- Fixed: **`resizeBetween` and `resetBetween` write `DockItem.lengths` for the pair only, in ask units** (not drawn px; with
  room to spare a drawn size is the ask times the shared scale, or its least when that is more), as placement's do. A
  bystander of a drag gets no length, so an item moved to another edge after a drag next to it is laid out as an item
  nobody resized, not at a length inflated by the column's scale.
- Behavior change (from `@n-uf/placement`): **a length under its least now reads as a weight with room**: the item is drawn
  at its least and the others share the rest by their asks. Short of room an ask under the least still reads as the least.
  A length of 0 is no length: the item asks its natural, `storeDockState` does not write one (and drops the `lengths`
  object when nothing is left), and `readDockState` drops a stored one like any bad entry (`item:<id>:lengths:<axis>`).
- Fixed: **a tile keeps its place among its own rail's tiles.** With `rails` declared, a column folded whole into its
  side's rail drew its members as the rail's tiles, but the rail's stops lay only between folded columns, so a tile held
  from it had no place among its own column's tiles (without `rails`, the same column drawn as a rail offered its gaps,
  and `foldedColumnDrop`'s documented contract said it would). A held tile now also has that column's gaps
  (`gap:<edge>:<zone>:<at>`, before each other tile and after the last, wherever it would stay a tile in the rail), over
  its own column's run of tiles only: over the tiles of the rail's other columns, and past the last tile, the place is
  the rail's, home for it, as before. A tile of another column, or the only tile of its column, gets the places it had.
  A host tells a home by `place.kind === "home"`, never by its id (`rail:<side>:<ring>` stays a home's id). The lanes
  agree: a column folded into a declared rail is a lane drawn where its run of tiles lies (the hull of its rail
  segments), so its hit rect, its spots' stretches and its marks stop at the run, where they took the whole rail (a spot
  over another column's tiles that reordered the held tile, a stretch past the rail's last tile); a column created folded
  draws no mark beyond its own tile. `lanes()` and `targets()` decide the same at every point of a rail, except the pending new-column-line cases
  (a new-column line over a rail where the lanes stay, in a narrow window and in one with a tray of toolbars, and with a
  second column holding the held tile the lanes' new-column lane over the rail's first pixels where `targets()` floats),
  which the sweep lists by name.
- Fixed: **a float pressed inside an empty lane's band no longer takes that lane when the drag starts** (the landing
  model gives a float's lift, one with no `home` and no spot marked home, the lift zone a docked item has; `@n-uf/motion`'s change of the
  same name). `dockDrag` has nothing new to pass: a float's drag has no home spot, and a host passes `home` only for a
  docked item.

### One layout for the held frame and the commit (breaking; with `@n-uf/motion`'s held place)

- **New: `dockDrag(state, dragged, options)`** (`DockDrag`): `regions` (hit-testing, as seen), `after(held)`
  (`DockAfter`: the `state` a release commits, its `layout` solved with the drag's one `previous`, the `landing`, every
  lane's `marks` in that one layout as `DockLaneMark`s, and for a spot its lane's `spots`), `landingOf(held)`,
  `spotsOf(spot)` and `guides(frame)` (`DockGuideFrame`, whose `guides` are `DockGuideRef`s `{ lane, held }`, →
  `DockGuide[]`, rule B: a lane on screen less the would-land
  landing; a lane the screen doesn't draw in the layout that creates it, giving way to whatever the screen draws: another
  lane's marks, a drawn bar or rail, the landing; the Near lane's marks win). `DockHeld` (a held place) is
  `{ kind: "spot", spot, point }` or `{ kind: "float", point }`. It fits `@n-uf/motion/drag`'s
  `LandingGeometry` as it is; `./testing` adds `AssertGeometry`.
- **Removed (breaking): the held-frame path of `lanes()`.** `DockLaneOptions.spot` and `lanes(…, { spot })`,
  `DockLane.entry` and `corners` (the prediction of an empty lane's marks): a held frame is `after(held)`, and a
  frame's guides `guides(frame)`. `lanes()` gives the regions and each lane's marks as seen.
- **Changed.** A held lane's marks follow its edge as drawn in that held place's layout, corners included (decision 0002:
  with both side rails holding a toolbar, a toolbar held in the empty top bar draws the bar full width, as the
  commit does). A neighbor's giving way (a striped end) is judged in the layout drawn, not the lifted one. Held on a
  sliding spot, the item is drawn where it lands and the room beside it is a box from 8 px; the bar keeps the corner
  between two empty lanes in a held frame. `./testing`'s `LandingRule` takes `{ regions, landingOf, spotsOf, home?,
  placeGuides? }`, and its host draws guides with `guides(frame)` and commits `after(release).state`.
- Added: **`DockDrag.shown(frame)`**, the layout a landing frame draws (`after(frame.held).layout` while the frame's room
  is open, else the window at rest), and **`DockGuideFrame.room`** (required; the landing model's `LandingFrame.room`, so a
  landing frame still fits; a host that builds its own frame passes it, and passes false where it draws no room for a spot).
- Fixed: **a float frame's guides are cut in the window as drawn.** `guides(frame)` took the screen from
  `after(frame.held)`, so on a float frame (whose room is not open: the gap closes on release) the marks were cut in
  the float's commit layout, the column closed up, while the host drew the window at rest. `guides(frame)` now cuts in
  `shown(frame)`. A frame whose room is open (every spot frame the landing model gives) gives the guides it gave before.

### Docs only

- **The design page and the reference catch up with the code.** No behavior, type or export change. The draw rule is
  stated once: a held frame draws `after(held).layout` while its room is open, and a float frame whose room is not
  open, and the Outline mode, draw the window at rest (the gap closes on release). `dockDrag` is in the page's
  paragraph, diagram, contents and SDK table, the landing model is named as the docking drag with `targets()` as the
  list of places for menus, keys and the conformance pick, and a panel drag's marks are written up here. The
  reference covers behavior, with the exported types as the contract, and adds entries for `Place` and its four kinds,
  `SolveOptions`, `DockLaneOptions`, `EmptyLanes` and the stored types.

## 26.11.54

The first release. The window's docking model moves here from `@n-uf/placement/scene`, and its conformance rows from
`@n-uf/placement/scene/cases` to `@n-uf/docking/testing`. Behavior is unchanged: for the same input, `solve`,
`targets`, `refusals`, `stops` and `lanes` give the same answers as `@n-uf/placement/scene` at its last state (26.11.53
and the fix below, unreleased there), and a stored state reads back to the same layout: the one exception is in form,
not in frames (a stored `floatSize` becomes `floatSizes`, see Removed). Each edge is fitted by `@n-uf/placement/stack`,
now this package's one dependency.

Fixed since `./scene` 26.11.53, on its release line when the model moved:
- **`endReach` only adds** (fix). With any `endReach` and an empty bar across a compact rail's end, the rail's end
  target shrank to the reach strip past the stage and its own end third was refused; with an inset (rail outside it, or
  the bar inside it) the predicted `entry` also stopped at the two-thirds line. A reach strip cut off from its zone's own
  room now takes no slot line and joins the zone's outermost slot (past a drawn bar it stops at the bar), and an edge's
  reach never takes another edge's own span. A column's footer gap under an empty bar no longer vanishes with reach:
  the panel bodies' cut places its line within the column's drawn ends, as the tiler does. The start side and both rails
  alike. New tests `rail-end-reach` and `end-reach-targets`; the pinned marks fixture's rail and bar boxes now run to
  the edge's end.

Host notes: install `@n-uf/docking`, change the imports, and apply the renames below (each a rename only, with the
same shape and meaning). A stored state from `storeScene` reads back with `readDockState` unchanged (the stored form
and its version are the same), but for one field: a stored `floatSize` reads back as `floatSizes` (see `floatSize`
under Removed). `@n-uf/docking/testing`'s types name `@n-uf/motion/drag`'s: `@n-uf/motion` is an optional peer
dependency, needed only by a suite that runs the landing rows. The edge-id error's prefix is `docking:` (it was
`placement:`): a host that matches the message changes the prefix.

Entries:
- `@n-uf/placement/scene` → `@n-uf/docking`.
- `@n-uf/placement/scene/cases` → `@n-uf/docking/testing`.

The model's types:
- `Scene` → `DockState`; `Edge` → `DockEdge`; `SceneItem` → `DockItem`; `SceneFloat` → `DockFloat`.
- `SceneChrome` → `KeepClear`, and the dock state's field `chrome` → `keepClear` (same rects, same `for` scope).
- The fields 26.11.52 added keep their names on the renamed types: `DockItem.pushable`, `DockItem.floatSizes`,
  `DockItemLayout.axis`.
- Added: **`DockItemLayout.tiers`**, the chosen form's `StackForm.tiers` (`@n-uf/placement/stack`'s `controlLadder`
  sets them), beside `hidden`: each shown control's tier by id, so a host draws each control at `tiers[id]` without
  knowing the ladder's order. Absent for a hand-written form, a `fold`, a `menu` and a » menu entry.
- Removed: **`SceneItem.floatSize`**, deprecated in 26.11.52. `floatSize` → `floatSizes[orient]`: declare the size for
  the orient the item floats in (both orients where it floats either way). A state stored with it still reads, and
  `storeDockState` writes `floatSizes` only. `readDockState` takes a stored `floatSize` as:
  - on an item the store docks: `floatSizes[floatOrientOf(item)]`, unless the store sizes that orient itself, so the
    user's float size survives the upgrade for the next float-out (a float target, `floatAt` with no rect);
  - on a float whose store gives `floatSizes`: the size for the orient the float is in, unless the store sizes it;
  - on a float whose store gives no `floatSizes`: nothing. It is dropped (`item:<id>:floatSize`), and the float stays
    framed at its stored rect, as before (a size there would replace that frame).
- `floatSizeOf(item, orient?)` and `floatSizesOf(item)` lose the orient the old size was set in (it was the legacy
  `floatSize`'s).
- `SceneLayout` → `DockLayout`; `SceneItemLayout` → `DockItemLayout`; `SceneEdgeLayout` → `DockEdgeLayout`;
  `SceneRailLayout` → `DockRailLayout`; `SceneNote` → `DockNote`; `SceneNoteCode` → `DockNoteCode`.
- `StoredScene` → `StoredDockState`; `StoredSceneEdge` → `StoredDockStateEdge`; `StoredSceneFloat` →
  `StoredDockStateFloat`; `StoredSceneItem` → `StoredDockStateItem`; `SceneRead` → `DockStateRead`, whose field
  `scene` is now `state` (`readDockState(data, base).state`).

Targets and lanes:
- `SceneTarget` → `DockDrop`; `SceneTargetOptions` → `DockDropOptions`; `ScenePlace` → `DropPlace`; `SceneAfter` →
  `DropResult`, whose field `scene` is now `state` (`after(point, grab).state`).
- `SceneRefusal` → `DockRefusal`; `SceneRefusalTarget` → `DockRefusalTarget`.
- `Regions` → `DockRegions`; `Lane` → `DockLane`; `LaneSpot` → `DockSpot`; `LaneMark` → `DockMark`; `LaneOptions` →
  `DockLaneOptions`. `LaneRefusal` and `LaneSlide` keep their names, and `Lane.entry` and `Lane.corners` are
  `DockLane.entry` and `DockLane.corners`.

Functions:
- `storeScene` → `storeDockState`; `readScene` → `readDockState`.
- `fold` → `foldItem`; `use` → `markUsed`; `keep` → `keepItem`; `open` → `openItem`; `close` → `closeItem`; `lift` →
  `liftItem`; `raise` → `raiseFloat`; `orient` → `orientFloat`.
- `resize` splits in two by what it resizes: `resize(state, edgeId, size)` → `resizeEdge(state, edgeId, size)`, and
  `resize(state, floatId, rect, moving?)` → `resizeFloat(state, floatId, rect, moving?)`.
- `fitFloat` and `FloatFit` are no longer re-exported here: import them from `@n-uf/placement/stack`.

What the model reads of a form: the form flags `body`, `folded` and `compact` from `@n-uf/placement/stack` (each
defaulting from the kind as before: `open`; `header` and `fold`; `icons`). A host that sets none sees no change.

Testing (`@n-uf/docking/testing`):
- `createSceneHost` → `createReferenceHost`; `SceneHost` → `ReferenceHost`, whose method `scene()` is now `state()`;
  `SceneHostOptions` → `ReferenceHostOptions`.
- `resizeStep(state, start, layout, gesture)` returns `{ state, start }` (its field `scene` is now `state`).
- `mapScene` → `mapState`; `winScene` → `winState`.
- A row's field `scene` → `state` (`CaseRow.state`, `LandingCase.state`), and a `CaseHost` loads with
  `load(state, settings)`. `CaseRequires.railDrop`'s one value is now `"state"`.
- Added: **`AssertLanding<R>`**, a type that compiles only while `R` fits `@n-uf/motion/drag`'s `LandingRegions`
  (`AssertLanding<DockRegions>` is checked in this package's tests). A type only: no runtime import of motion.
- Removed: `pickTarget`, the deprecated default pick. Pass `@n-uf/motion/drag`'s `targetAt` as `pick` (the reference
  host's default stays the same rule).
- Kept as 26.11.52 shipped them: the hand rule (`handBound`, `HAND_TRAIL`, `HAND_TRAIL_BEFORE_HOP`, `HAND_MARGIN`,
  `HAND_FAST`, a row's `moving.hand`) and the Near guides' rule (`nearGuideIssues`, `NEAR_REACH`, a row's
  `moving.nearGuides` and `moving.guideSwitches`, `end.pending`, `end.landing`, `LandingCaseFrame.pending`).
- Removed: the release bookkeeping, `LANES_SINCE`, `GRAB_SINCE`, `GRIP_SINCE`, `ROOM_SINCE`, `STEP_SINCE`, `NEAR_SINCE`, `LAST_WITHOUT_LANES`,
  `LANES_DEADLINE` and `lanesRatchet`, with `CaseRequires.lanes` (`requires.lanes.since`), `LandingCaseHost.version`
  and `createLandingHost`'s `version` option. Every landing row runs on every host: drop the ratchet from your suite
  and assert that no row fails.
