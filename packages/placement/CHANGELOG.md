# @n-uf/placement

Versions are calendar versions, `YY.M.R` (year, month of the release, counter within the month), shared with
`@n-uf/motion`: both packages carry the same version, and a release bumps both.

## Unreleased

- **Fixed** (`@n-uf/placement/stack`, opt-in `fitStack(input, { previous })` only; a solve without `previous` is
  unchanged): growth under `previous` handed room to whichever item fitted, skipping one that couldn't grow, so a
  trailing group could open while a leading one that gave way after it stayed folded, and the result depended on resize
  history. Room now comes back in the reverse of give-way order, and growth stops at the first item that can't grow
  (highest rank first, then `kept`, then the newest used, then the earlier in the stack). Items in the » menu still come
  out together when only their leaving together fits, but only when that keeps the order. A pure gain still takes the
  fresh fit, and a wider stack still does. The docs no longer say results under `previous` are "never worse"; along
  successive solves, more room never undoes a growth. Affected: a grow under `previous` where the item next in that
  order can't grow but one behind it could; before, that one grew.

## 26.11.14

- `@n-uf/placement/stack`, the cases a toolbar needs. Additive: no rename, no removed export, no new required field, and
  an input that uses none of the new options gives the 26.11.13 fit, except in the three cases under "Changed
  behaviour". A seeded sweep of 4,000 inputs against a verbatim copy of the 26.11.13 solver
  (`test/stack-compat.test.ts`) checks it: every difference is one of those three.
  - **Type change:** `GroupFormKind` and `StackFormKind` gain `"fold"` (a group's handle with its own » in line). An
    exhaustive `switch` over `StackFormKind` needs a `fold` case; nothing else changes for typing. The solver treats it
    as an ordinary form: it keeps its place and takes its own `main` length; `menu` stays the shared » entry.
  - **Changed behaviour** (fixes the kits asked for):
    1. A give-way step goes only to the first later form that shortens the stack (a smaller `main.min`, the shared »
       entry counted when the form is `menu`). Forms of the same length or longer are skipped, with none shorter the item
       stays and the stack may report `overflow`. Affected: an item whose next form is not shorter than its current one
       (a `stacked` form as long as the `row`, a `fold` longer than the `icons` before it). Before, the item stepped
       into it.
    2. The menu: an item no longer goes into the menu alone when it is not longer than the » entry (a 24 px rail icon,
       the default 28 px entry), unless that shortens the stack. Items stuck that way go in together, in give-way order,
       as few as together shorten the stack (two 24 px icons for one 28 px entry); each one after that saves its whole
       size. Affected: a stack whose items end in a `menu` form that are at most as long as the entry. Before, such a
       step was taken whenever another item could still give way, so an item could end in the menu with room to spare, and
       one that nothing else could help stayed out.
    3. The pass limit: the old limit (as many passes as forms in all) could run out before a long run of cross-fit and
       give-way steps ended and return a stack that doesn't fit with no `overflow` note. It now counts twice the forms.
       Affected: such stacks only (none in the sweep).
  - **Opt-in via `strictCross`** (new optional `StackInput.strictCross`, default false): forms are never drawn thinner than
    their `cross.min` (default their `natural`), so a form that sets the cross size and has a `cross.min` over the limits'
    `max` steps down (an open panel with `cross.min` 120 in a bar with `cross.max` 40 becomes a header), never into the
    menu (`too-wide` if it is the last drawn form). Without it a form that sets the cross size is clamped to `max` whatever
    its `cross.min`, as in 26.11.13 (where `cross.min` already existed; a test holds that).
  - `fitStack(input, { previous })` (new optional second argument, `FitOptions`): keeps the forms of the previous fit while
    they still fit, so a change of `used` ages alone (a press on a header) reshapes nothing. Ages decide only who gives
    way anew (the length shrank, an item was added, a panel was opened). Growing never re-ranks: when the stack got
    wider across (a wider limit: a group that stepped to its stacked form for a narrow column returns to its row, a header
    folded to a rail by its `cross.min` to its header) the largest forms are tried again, as without it; when the forms
    kept leave more spare length than before (`StackFit.need`, optional and always set by the solver, is the length the
    chosen forms need) the fresh fit is taken only if it is a pure gain over them (no item further down, one further up),
    otherwise the kept forms grow back in the reverse of give-way order while the stack fits (so a badge losing a digit
    after a press moves nothing; an item goes back to the nearest larger form the stack fits with, even if that makes it
    shorter, and items in the menu come out together when only all of them leaving fits). Results under `previous` depend
    on history but are never worse: a shrink then a grow may end at a larger arrangement than a fresh solve. Growing back
    is meant for stacks of up to about 50 items (60 small menu items take about 9 ms). An item whose
    form at the kept index is of another kind starts over; one only
    re-measured keeps its place (smaller: room that grows the kept forms; larger: it gives way from them). A lowered `cross.min`, or any
    change of the forms' cross sizes, doesn't bring a form back under `previous`: solve once without it.
    `stackTargets(…, { previous })` solves every gap the same way.
  - `StackForm.rank` (default 0): the step taken is the one into the lowest-ranked form across all items; ties go
    unkept before kept, then the item used longest ago, then the later in the stack.
  - `StackInput.gap` (between neighbouring drawn items, the » entry included) and `StackInput.pad` (`{ start, end }`):
    both count toward the length and every rect includes them.
  - `stackTargets(input, dragged, { endReach })`: the first and last gaps' hits reach `endReach` px past the stack's
    ends. The marker's cross size is the stack's. No pointer hysteresis here: that is `@n-uf/motion/drag` (its band,
    and `placeOf` with `previous`). New export types `StackTargetOptions` and `FitOptions`.

## 26.11.13

- `@n-uf/placement/stack`, floats (new exports; `fitStack`, `stackTargets` and the stack's stored form are unchanged, and
  so are `./panels`, `./dock` and `./desk`). A float is an item above the pages, in the stage's own px (view space), so
  the pages scrolling under it never move it; it has no pinned flag.
  - `fitFloat(rect, stage, avoid?)`: the float's rect moved (never resized) inside the stage, then beside the docked
    items it would cover, at the nearest clear place; `FloatFit` has `rect`, `clamped` (also when a position that wasn't a
    number was replaced), `snapped`, `covers` (indexes into `avoid` it still covers; empty whenever a clear place exists,
    which it finds, and not empty only when the stage has none) and `searchCapped`. A float larger than the stage keeps
    its top-left corner on the stage's. The x's are tried nearest first and, for each, the stretches of y the rects
    block are merged and skipped. Measured in a test run on a laptop: about 100 `avoid` rects 0.1 ms, 300 a few ms even
    when no place is clear (6 ms median, 15 ms worst), 1,000 about 17 ms. A safety net stops the clear search after 3
    million rect tests and sets `searchCapped` (the place found may then not be the nearest, or a clear place may exist that was not found); with no clear place
    the least covered among the 2,048 nearest places is used.
  - `stackFloatTarget({ id, stage, size, avoid?, label? })`: a free, priority 3 drop target in the shape
    `@n-uf/motion/drag` takes, `kind: "float"`, id `float:<id>` (so it can't collide with `./desk`'s `"float"`; the
    toolbar `floatTarget` in `./targets` keeps its name), whose `hit` covers the whole plane, so a pointer past the
    stage's edge still hits it. `make(point, grab?)` gives the float's rect (clamped, clear of the docked items) for the
    preview and for the drop: one answer, so a drop past the edge lands clamped and never cancels. A gap's `hit`
    thinner than 8 px (twice the intent's 4 px breakthrough) can't take over from it.
  - `storeFloats` / `readFloats`: `{ v: 1, floats: [{ id, x, y, width, height }] }` in stacking order; never throws,
    drops what it can't use and lists it in `dropped`. `storeFloats` leaves out a float with a zero size or a bad number,
    and of a repeated id keeps the last readable entry (the one on top); `readFloats` does the same and words a bad
    version as the stack's reader does. It writes no `pinned`; one an old store has is read and ignored (listed as
    `pinned:<id>`), and the float loads as a plain float.
  - Exports: `fitFloat`, `stackFloatTarget`, `storeFloats`, `readFloats` and the types `StackFloat`, `FloatFit`,
    `FloatTarget`, `StackFloatTargetInput`, `FloatDrop`, `StoredFloats`, `FloatsRead`.

## 26.11.12

- New entry `@n-uf/placement/stack`: the items along one edge of a stage (a column or a row), each a panel or a control
  group with forms from largest to smallest. Pure, and not tied to `./panels` columns; `./panels`, `./dock` and `./desk`
  are unchanged.
  - `fitStack(input)`: one form, kind and rect per item. Every item starts in its largest form, or at `StackItem.from`.
    While the smallest sizes don't fit the length, the item used longest ago (unkept before `kept`, the later in the
    stack on a tie) takes its next form, panel `open` → `header` → `rail` → `menu`, group `row` → `stacked` → `icons`
    → `menu`; it doesn't go into the menu when that only lengthens a stack nothing else can shorten (`overflow`).
    Spare length goes to the forms that `grows`, shared by their natural sizes. The stack's cross size is the widest
    form that `setsCross` (a panel's `open`, by default), clamped, else the rail width (30).
  - Cross-fit: a form that doesn't set the cross size and whose `cross.min` (default `cross.natural`) is over the
    stack's takes its next form: a group alone is a rail of icons, a column with nothing open shrinks to a rail, and a
    header with a small `cross.min` stays in a narrower column. It never steps an item into the menu: the item keeps
    its last drawn form and a `too-wide` note says so. An item with no forms is left out (`no-forms`).
  - Result: `items` (`form` and `from`/`to` in notes are indexes into the item's forms), `cross`, `menu` (the » entry's
    rect and the ids in it) and coded `notes` (`form-down`, `to-menu`, `too-wide`, `no-forms`, `overflow`).
  - `stackTargets(input, dragged)`: a drop target for every gap (before each item and after the last; the dragged id is
    lifted out of the input first), in the shape `@n-uf/motion/drag` takes: `gap:<k>`, priority 2, `place`, `hit` (split
    at the items' middles, across as wide as the larger of the stack and the drop's fit), `slot`, `marker` and the full
    `fit` of the stack with the item inserted, so the preview is exactly the rect after the drop. `place.at` counts the
    input's items, not `fit.items` (which leaves out an item with no forms): look the dragged item up in it by id.
  - `storeStack` / `readStack` (`{ v: 1, order, kept, closed, used, forms }`): never throws, drops what it can't use
    (including the `__proto__` key in `forms`, an object with no prototype) and lists it; an id listed twice in `used`
    counts at its last place.
  - Exports: `fitStack`, `stackTargets`, `withItem`, `formSetsCross`, `storeStack`, `readStack`, `createStack`,
    `DEFAULT_RAIL`, `DEFAULT_MENU` and their types (`StackAxis`, `StackForm`, `StackItem`, `StackInput`, `StackFit`, …).

## 26.11.11

- `@n-uf/placement/panels`, drops into a stacked column at a position (opt-in; without it every target is what it was):
  - `DockOptions.at`: with `into`, the panel goes before the column's member at that index (counted with the panel
    lifted out; clamped; left out or not a number: the bottom). Into a tabbed column it is the tab's position.
  - `PanelTargetInput.stackSlots`: a stacked column also offers `into:<side>:<i>:<k>`, before member k, its area
    split at the members' middles; `into:<side>:<i>` keeps the part below the last member's middle. These targets
    carry `PanelTarget.marker`, the line where the panel's top lands after the drop (from the drop's layout; zero
    tall, the column's width). k counts closed members, which keep their place; only members shown get slots. Tabbed
    columns keep their one `into` target.
  - Typing: the `into` place gains an optional `at` (no new `kind`, so exhaustive switches still hold);
    `PanelTarget.marker?` is new. `homePlace(state, id, { stackSlots })` gives a stacked panel's `at`, and
    `keyboardStops` puts such a home at its position among the slots.

## 26.11.10

- `@n-uf/placement/panels`, bands and reserved room (all opt-in; a state and options without them lay out as before,
  and the store stays v1):
  - Bands: a top and a bottom dock (`options.bands`, `{ top?, bottom? }`, each `{ mode: "reserved" | "overlay",
    span: "between" | "full" }`). Its panels sit side by side and share its width (`kind` `"band"`, `edge`, `index`);
    a stored height clamped to `PanelDef.band` (default `BAND_SIZE`, min 120, max 480, natural 200). It folds as a
    whole, to one bar. `layout.bands` (`PlacedBand`). New: `Edge`, `EDGES`, `Place`, `Band`, `BandOption`,
    `PanelsState.bands`, `PanelsStart.top` / `bottom`, `dockBand`, `resizeBand`, `bandSize`, `bandHeight`;
    `open(state, id, { edge, height? })`; `Where` and `PanelPlace` gain a `band` kind; `PanelDef.sides` may name
    edges.
  - Height give-way for bands: `options.pagesMinHeight` (default 240). Reserved bands shrink, then fold to a bar,
    unkept before kept, policy order, bottom first on a tie, until the pages keep the min; then the overlay bands,
    together, until they leave the min of the pages uncovered. Notes `band-shrunk`, `band-folded`, `kept-folded` with
    `edge`; `pages-short` when the pages' rect is still under the min (overlay bands never cause it); `band-off` for a
    band on an edge the options don't enable.
  - Reserved room: `options.reserve` (`{ top?, right?, bottom?, left? }`) keeps px clear along the pages' edges for an
    app's toolbar; `layout.reserved` has the rects. `pagesMin` and `pagesMinHeight` count after it. An overlay band
    lies next to the reserve on its edge, on the pages' side, never over it.
  - Targets `band:<edge>:<i>` and `band:<edge>` (an empty enabled edge). The stored form carries `bands` (an optional
    v1 field).
  - Typing: `PanelKind`, `PanelPlace`, `Where` and `PanelsNote` gain members, and `@n-uf/placement/desk`'s `PresetId`
    gains `"docksFull"` (so `PRESETS` has a fourth key), so an exhaustive `switch` over them, or a `Record` keyed by
    `PresetId`, in a consumer needs the new cases.
- `@n-uf/placement/desk`: `docks` and `dockTear` get a bottom band (reserved, between the columns); a new preset
  `docksFull` (the bottom band full width). `DeskHint.bottom` starts the band; else the last def whose `sides` names
  `"bottom"`. `navigator` has no band. Because the band is enabled, `docks` and `dockTear` now always offer a
  `band:bottom` drop strip along the pages' bottom, even when the band is empty (a drop there used to be a float in
  `dockTear`, and no drop in `docks`).
- Known limit: with `pagesMinHeight` below about 100 px on a very short stage, a column can be shorter than its title
  bars, which then run past it (column bars were always a fixed `options.bar` tall). Keep the default 240, or at least
  a few bars' height, when bands are on.

## 26.11.9

- `@n-uf/placement/panels`:
  - Tabs: `Column.show` (`"stack"`, the default, or `"tabs"`) and `Column.active`. A tabbed column draws a strip
    `options.tabs` tall (new chrome size, default 28; `PlacedColumn.strip`); its active panel takes the rest and the
    others are `hidden`, each with its `tab` rect in the strip. It folds as a whole: its active panel folded shows only
    the strip, every panel folded goes to the rail (or rides). `showTabs(state, side, index, on)`, `activate(state, id)`
    (a use). A drop `into` a tabbed column adds a tab at the end and shows it, and so does `open` on a panel in one; a
    panel that leaves takes its `active` mark with it. With no `active` (or one that isn't there), the column shows its
    first panel that isn't closed.
  - Height give-way, opt-in: `PanelDef.height` (`{ min, natural }`). In a stack column where an open section has one,
    sections get their natural heights and the last open one the rest (never under its min); sections without one
    share what is left, never under a bar's height. The others' natural heights give way toward their mins first;
    still short of room, open sections fold to bars in give-way policy order (kept last, never the last open one, never
    one whose min is no more than a bar), note `section-folded`. It never writes `folded`. Columns without `height`
    defs are unchanged.
  - The stored form carries a column's `show` and `active` (optional v1 fields); an `active` that isn't in its column
    is dropped as `"column.active:<id>"`, an unknown `show` as `"column.show"`.
- New entry `@n-uf/placement/desk`: presets as data on `./panels` (`docks`, `dockTear`, `navigator`; `PRESETS`,
  `presetLayout`, `presetTargets`, `presetDrop`, `presetInput`). It imports only `./panels`' public index (a guard test
  holds it to that) and carries no titles, words or toolbar wiring. `./dock` is unchanged.

## 26.11.8

- `@n-uf/placement/panels`:
  - Folded floats: a float folded by hand lays out as a title bar (`kind` `"bar"`, `folded` `"hand"`) at its own x, y
    and width, `options.bar` tall, clamped as a bar, pinned or not. It is still a float to targets and drags; a drop
    moves it and keeps its full size, and unfolding brings the full rect back (the stored rect never changes). A
    folded docked panel dropped on the float target stays folded: it lands as a title bar at its natural float size.
  - `options.fold`: `"rail"` (default, as before) or `"ride"`. Riding, a column folded by hand on a side that still
    has an open column becomes title bars stacked on top of the side's first open column (`rides`: its index), as
    wide as it; the open columns lie as if the folded one were gone, and its stored place and width are untouched.
    When every column on the side is folded, the side shows its rail as before. Give-way's folds always go to the rail.
  - `PlacedPanel` gains `floating` (open or folded float) and `rides`; `PlacedColumn` gains `rides`.
  - `pin(…, shown)` takes only the position of `shown` and keeps the stored size, so pinning a folded or clamped
    float keeps its full size.
  - A column too short for its bars gives its open panels a height of 0, never a negative one.

## 26.11.7

- New entry `@n-uf/placement/panels`: tool panels with string ids, as an app's side columns work. `./dock` is
  unchanged.
  - Model: `PanelDef` (width limits, float size limits, the sides it may dock on, whether it may float; no title:
    words are the consumer's),
    `PanelsState` (`sides` of full-height `Column`s from the outer edge inward, `floats`, `folded`, `kept`,
    `closed`, a logical `clock` of opened and used), `createPanels(defs, start)`.
  - `layoutPanels(defs, state, stage, options?)`: geometry and structure only. Each panel's rect, layer, `kind`
    (`column`, `bar`, `segment`, `float`), folded, kept and pinned flags; the columns; the rails; the pages' rect;
    notes as a `code` plus data (`column-shrunk`, `column-folded`, `kept-folded`, `pages-under-min`,
    `float-resized`, `float-clamped`). Options: `giveWay` (`{ order: "oldest" | "newest", by: "used" | "opened" }`,
    default oldest by use), `floats` (`"clamp"` or `"free"`), `floatVisible`, `pagesMin`, `view` (the page's offset
    and scale), and the chrome sizes `bar`, `rail`, `segment`, `railInset`.
  - Give-way shrinks every column toward its minimum, then folds whole columns to the rail: unkept columns first, in
    policy order across both sides, then columns holding a kept panel, only when the pages still don't fit. It never
    writes `folded`, so a wider stage brings a column back.
  - Floats clamp at layout time (the state keeps the stored rect) so their screen rect stays in the view at any
    scale: a pinned float where it is, an unpinned one as it shows at pan 0, so it still scrolls with the page.
  - Changes: `open`, `close`, `focus`, `toggleFold`, `keep`, `dock`, `float`, `pin` (with `shown`, a clamped float
    pins where it shows), `resizeColumn`, `resizeFloat`, `liftPanel`. Opening, focusing, moving, resizing and
    unfolding are uses (they move the `used` clock). `samePlaces(a, b, defs?)` compares widths as laid out;
    `columnWidth(defs, column)`.
  - Targets: `panelTargets(input)` (`column:<side>:<i>`, `into:<side>:<i>`, `rail:<side>`, `float`) in the shape
    `@n-uf/motion/drag` takes, each with a structured `place` and no words; a place the panel may not take and its
    own place are no targets. `panelDrop(input, target, point, grab)` lays out a drop. `homePlace`, `panelStops`.
  - `storePanels(state)` / `readPanels(data, defs?)`: a versioned stored form (`{ v: 1, … }`); reading never throws,
    drops unknown or repeated ids and clamps to the defs. Version 1 only gains optional fields: a field the reader
    doesn't know is skipped and listed in `dropped`.
- `@n-uf/placement/targets`: `keyboardStops` also takes panel targets (with `{ home: { place, state }, floats? }`)
  and gives panel stops in reading order.

## 26.11.6

- `@n-uf/placement/targets`:
  - `keyboardStops(targets, { home?, floats? })`: a group's places in one list in reading order (hosts title, top,
    left, right, bottom; zones start, centre, end; each insertion point in order), with its own place as a `home`
    stop when given and floating last only when asked. Each stop has the target id, a label, its place and the
    arrangement a move there makes: one list for the arrow keys and a "Move to" menu, no parsing of target ids.
  - Host targets carry their `slot`: the group's rect in the host once it lands there. `hostAfter(arrangement)`
    says where the host is then, when it grows or appears; default: as it is now.
  - `allows(group, place | "float")` in `hostTargets`' input: a place it refuses is no target. Its `place.index`
    counts the groups there without the dragged one (as `insertGroup` does). For floating, the same rule decides
    whether you add `floatTarget` at all: `...(allows(g, "float") ? [floatTarget(input)] : [])`.
- `@n-uf/placement/toolbar`:
  - `HostSpec.keep`: a per-group keep priority (default 0). When room runs out, a lower keep collapses first;
    among equal keeps the trailing end still goes first, so a primary group at the end can stay open. `HostSpec`
    takes the group id type.
  - `storeArrangement(arrangement)` / `readArrangement(data, groups?)`: a versioned stored form (`{ v: 1, hosts,
    collapsed, floating }`). Reading parsed data gives `{ ok: true, arrangement }` or `{ ok: false, error }`, never a
    throw: an unknown version, a missing host or zone, a value of the wrong kind, a group in two places, an unknown
    group. An arrangement lacking some known groups reads fine; place those with `resetGroup` or `dockGroup`.
- New exports: the types `FloatTargetInput`, `Allows`, `KeyboardStop`, `KeyboardStopsOptions` and the constant
  `HOST_READING_ORDER`. `ToolbarTarget.slot` is a required field, so hand-built targets (fixtures, mocks) add it.

## 26.11.5

- `@n-uf/placement/targets`: `paneZone(rect, point, previous, options?)`, a pane's five drop zones: the centre
  rectangle (34 % of each axis, at least 24 px, its edges snapped to the device-pixel grid) or one of four edge
  trapezoids from the corners. The previous zone holds for 6 px past its boundary. `paneCentre` gives the centre's
  rectangle (to draw the zones); `PANE_ZONE_DEFAULTS` and `PANE_EDGES` (the tie-break order) come with it. It fits
  `@n-uf/motion/drag`'s new `placeOf(target, point, previous)`: the zone is the place, and a zone that takes no drop
  answers null. Ported from hypr-tiling's engine.
- Fix: `sameArrangement` compares the collapsed groups and the floating groups' ids both ways, so a repeated group on
  one side no longer passes for a different group on the other.
- The README lists all fifteen layout note codes; every code has a test.

## 26.11.4

The first release: where things go, as pure functions over plain data. No DOM, no framework, no motion, no
dependencies.

- `@n-uf/placement`: `Rect`, `Size`, `Point`, `rect`, `overlap`, `clampInto`, `centre`, and `positionPopup` (anchor,
  gravity, offset, then flip, slide, resize per axis) with the `BELOW_LEFT` rule.
- `@n-uf/placement/dock`: `createDesk({ panels, docTitle?, start, opened? })` gives the nine desk constructions as
  presets (edge docks with the bottom dock between or full width, one tiling tree, navigator + inspector, a
  scrolling strip, drawers, palettes over or around the documents, edge docks + tear-off). Each is a pure layout:
  state, stage size and options in, a placed rect per item and notes on how it gave way out. A note's `code`
  (`bottom-folded`, `dock-folded`, `sections-folded`, `tiles-float`, …, with `side` and `items` where they apply)
  is the contract; its `text` may change. Also exported: `DEFAULT_OPTIONS`, `LAYER`, the gap `G`, the item keys
  (`panelKey`, `docKey`, `idOf`, …), `draggable`, `stripGeometry`, and the state changes `withDocs`, `touch`,
  `toggleFold`, `toggleClosed`, `withActive`, `liftOut`. Panel and document ids are numbers; item keys are strings.
- `@n-uf/placement/toolbar`: arrangements of groups in five hosts and three zones, or floating (`insertGroup`,
  `withoutGroup`, `floatGroup`, `dockGroup`, `resetGroup`, `moveToHost`, `moveBar`, `toggleCollapsed`);
  `layoutHost` (zones along the host, the centre centred, trailing-first collapse to handle and », an optional
  centre minimum counted in the need); `insertions` (before all, between, after all, empty zones); `isOwnPlace`
  and `sameArrangement` (field by field, whatever order the zones were written in). Group ids are the consumer's
  strings.
- `@n-uf/placement/targets`: drop targets in the shape `@n-uf/motion/drag` takes. `deskTargets` and `deskDrop` for
  every construction (rails, dock slots, tree slots, strip columns, tab strips, corner stacks, free placement with
  edge snapping); `hostTargets` and `floatTarget` for toolbar groups (own place left out, returned as `own`).
