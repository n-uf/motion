# @n-uf/placement

Versions are calendar versions, `YY.M.R` (year, month of the release, counter within the month), shared with
`@n-uf/motion`: both packages carry the same version, and a release bumps both.

## 26.11.20

- `@n-uf/placement/scene/cases`, an async runner (additive): **`runCaseAsync(row, host)`** and
  **`runCasesAsync(rows, makeHost, { onResult? })`** play the rows on an **`AsyncCaseHost`** (a `CaseHost` whose `load`,
  `perform`, `layout`, `root`, `stored` and `stops` may return promises; `itemSelector` stays plain), so a kit's page can
  be driven from a browser runner with real pointer events and timers. They await each host call in the order `runCase`
  makes them, with the same checks (both play one list of steps). A failing `load`, `perform`, `layout` or `stored` is a
  failed result, as a thrown one is; a failing `root` or `stops` rejects `runCaseAsync` (and throws from `runCase`). A
  sync `CaseHost` works with both. `runCase`, `runCases` and `CaseHost` are unchanged.
- `@n-uf/placement/scene`, **`layout.columnRoom`** (**Changed**): with `contentMin` and a column, whether one column at
  its minimum fits beside the content's minimum. Anchors and rails don't count any more (26.11.19 counted the anchors'
  room): every column, an anchor included, can fold into its rail. A docked column counts whether or not its side has a
  rail. Before any column holds an item, the answer comes from the `Scene.columns` template: the larger of its
  `cross.min` and the least width the items it takes need, so docking a panel doesn't flip the answer. A host's narrow
  fallback (the sheet) reads it.
- `@n-uf/placement/scene`, `setSide` ticks no use clock, like every change: a host that moves an edge by hand calls
  `use()` on its items afterwards, as a drop does (documented, with a test).

## 26.11.19

- `@n-uf/placement/scene`, parity with the panels hosts draw today (Revisions 7 and 7b):
  - **`layout.columnRoom`** and the note **`no-column-room`** (`width`, `need`): with `contentMin` and dynamic columns,
    whether one column at its minimum fits beside the content's minimum and the anchors' room (an open anchor's width
    and gutter, a folded one's rail and gutter). A host's narrow fallback reads it.
  - **`Edge.outsideInset`**: an anchor edge (a side edge that takes nothing, a thumbnail strip) lies outside the inset
    and the gutter: at the window's side, the inset after it; inside the side's rail when one shows. It runs into the
    inset above and below only where no reserved bar lies on that side.
  - **`Edge.giveWay`**: a static side edge shrinks toward its minimum, then folds into its side's rail, in give-way
    order with the columns (by its items' ages). It is never deleted.
  - **`setSide(scene, edgeId, side)`**: moves an edge to the other side of its axis as its side's outermost edge (ring
    0); `readScene` moves a static edge stored on the other side.
  - **`Scene.insetWhen`** (`"always"`, the default, or `"docked"`): with `"docked"` the inset applies only while
    an open column or a rail is beside the content (an anchor alone doesn't count).
  - **Changed:** `handFold: "ride"` rides every column folded by hand, not only a one-panel one: each member a bar over
    the side's first open panel column (never over an anchor), stacked in zone order.
  - **Changed:** the side's rail is its outermost edge (it was placed just outside the first dynamic column).
  - **Changed:** floats are clamped into [pad, W − pad] × full height (the stage less the inset's left and right), and a
    float larger than that region is shrunk to fit it (they were clamped into the whole stage, never resized).
  - **`SceneItem.floatMin`** (`Size`): a float of the item is laid out at `max(floatMin, min(its size, the region))`
    each way. Without it a shrink stops at its form's own minimums (`cross.min` across, `main.min` along). A float
    wider than the region at that floor keeps it and lies at the region's left edge, one taller than the stage keeps it
    at the stage's top and runs past its bottom; a folded float (its header form) keeps its height.
  - Typing: `SceneNote` gains `no-column-room`; an exhaustive `switch` over `SceneNote["code"]` needs it.
  - Affected: scenes with an inset and floats near its sides, scenes riding a hand-folded column of two or more panels
    (they went to the rail), and scenes with a static edge outside a dynamic column on a side whose rail shows.
- `@n-uf/placement/scene`, **fixed:** an item moved into a new column (`moveTo` with a column or rail place) kept
  only the start zone since 26.11.18; it keeps its own zone (`align` end or center) again where the new column takes
  its kind there, else the first zone that does.
- `@n-uf/placement/scene`, **fixed:** `homeFor` (and `dockHome`) took a new column that reused a pruned column's id
  for the item's home. A start column is home only while the column under its id holds one of its items; otherwise
  home is a new column at its ring. Static edges still match by id. Conformance row `P14b-dock-after-a-column-id-is-reused`.
- `@n-uf/placement/scene`, bar alignment zones (**Changed**):
  - A horizontal bar's targets are picked by thirds: the left third is the leading (start) zone's, the middle the
    center zone's, the right the trailing (end) zone's, the nearest of the zone's gaps within. An empty bar's strip is
    three targets, `strip:<bar>:start`, `strip:<bar>:center` and `strip:<bar>:end` (was one `strip:<bar>`).
  - A title bar (a bar with a fixed item that grows) is a constrained host: a toolbar there must land in its first
    form, nothing in the bar may change form for it, and the title keeps its natural width (26.11.18 let it shrink to
    its `min`); otherwise that zone has no target and no slot.
  - In a title bar the zones are laid with the title at its natural width: a leading toolbar sits right after the
    title's natural rect, trailing ones right before the end items, and a center one at the bar's true centre when that
    is clear of both, else centred in the free span between them. The title takes the spare room only when nothing
    follows it in its zone.
  - Affected: bars' hits (a pointer in a bar's middle third now always offers the center zone, unless the toolbar
    doesn't fit there in a title bar), empty bars' strip ids, and the layout of title bars with a toolbar after the
    title (the title no longer grows between them).

## 26.11.18

- `@n-uf/placement/stack`: **`StackForm.wrap`** (`{ widths, row, gap?, lead? }`, a form of the new group kind `wrap`):
  words in rows that wrap to the cross size the item gets, beside a lead cell (the grip) as a hanging indent. Its length
  is rows × `row`, its natural cross the one-row width, and it fits a cross size when some row width up to it leaves no
  row but the last with a single word; it is laid out at the widest such width, so fitting is monotone (a form that fits
  a cross fits every wider one) and `formCrossMin` is the narrowest width that fits. Give-way, fits, `previous` and growth use the computed length; under `ownCross` it is drawn as wide as
  its rows need. New exports `formMain`, `formCrossMin`, `formFitsCross`, `wrapLines`, `wrapRows`, `wrapCross` and
  `WrapSpec`. **`StackForm.grip`** (px) is a grip strip at a form's start along the stack. Additive: both are optional,
  and a stack without them fits as before.
  - **Type change:** `GroupFormKind` and `StackFormKind` gain `"wrap"`. An exhaustive `switch` over them needs a `wrap`
    case.
- `@n-uf/placement/scene`, the toolbar rules:
  - A `wrap` form applies only in a column edge, and the layout reports a wrapped item's `rows` and its `grip` rect
    (`SceneItemLayout.rows`, `.grip`). In a column drawn as a rail and in a float with `orient: "column"`, a group skips
    its `wrap` forms and shows its next form (icons) at its natural size (vertical means icons); an item with only
    `wrap` forms left is left out with the new note `no-vertical-form`. Affected: a vertical float of a group whose
    first column form was a `wrap` form is drawn as its icons.
  - **`Edge.compact`**: an icons-only edge (a thin rail of vertical toolbars along a window side). Items take only
    their `icons` form; one without is left out with the new note `no-icons-form`.
  - **`Edge.zoneAccepts`** (and `ColumnTemplate.zoneAccepts`): the kinds each zone takes, narrowing `accepts`. A panel
    column with `{ start: ["panel"], end: ["group"] }` has a tray of toolbars at its foot: a toolbar there takes only
    its `wrap` or `icons` form, never the menu, and the panels give way first. Gaps are offered only in zones that take
    the kind, and `moveTo` puts an item in a zone that takes it. A new column (a `column:` target, a `rail:` target, a
    `moveTo` column or rail place) is offered only for a kind the template's start zone takes, so a group never opens
    such a column. New exports `ZoneAccepts`, `zoneTakes` and `zonesTaking`.
  - **`dockHome(scene, id, start)`**: Dock, Put back and Reset position restore the start scene's fold too, so a
    "Move to › rail" followed by Dock brings an item back open; an item already at its home place (the only item of a
    dynamic column) takes the start fold in place.
  - **Changed** (targets), the hit tiling: an edge's gap hits split halfway between the lines of the gaps a drop fits
    in and together cover the whole edge, short items included (a bar of a few toolbars, a rail, a column's tray); the
    24 px band (`hitBand`) lies over an open item's body only. A compact rail's hits reach 24 px inward past it, except
    where a column's gap is. A hit lies over a growing fixed item (a title) and lands in the nearest gap, never over a
    fixed item that doesn't grow (controls, a readout) or chrome; a slot never covers a fixed item's reserved rect.
    Another edge's rect trims a gap's hit: one across from the edge (a bar above a column) at the hit's end along the
    edge, one beside it at its side; the edges as they are now (not the dragged item's own) trim it at its side too. An
    empty edge's `strip:` hit lies inside the content and clear of overlay edges, so never over a docked edge or a
    panel's body (a compact rail's strip keeps its place at the window edge); a gap hit that spans it trims its ends,
    and it is dropped only when nothing is left (an empty outer bar lying on a non-empty inner one).
  - **Changed** (layout): a side rail shows a column's segments in zone order (start, center, end), as the column shows
    its items.
  - Affected, for scenes that set none of the new options (`wrap`, `compact`, `zoneAccepts`): gap hits on bars and
    rails are longer (they now meet halfway, also over the stretch beside a short item), bands over closed or folded
    items are gone, a title bar's stretch left of its controls and the text of a growing title take drops, columns'
    hits stop at the bars and columns around them, an empty bar's strip covers only the content (no longer the columns'
    tops; gone when an inner bar or an overlay column covers it), an empty column's strip stops at the bars above and
    below it, and a rail with center or end items orders its segments by zone.
    The layout of every scene is otherwise as in 26.11.17.
  - `SceneNote` gains the codes `no-vertical-form` and `no-icons-form`; an exhaustive `switch` over `SceneNote["code"]`
    needs them.
- New entry **`@n-uf/placement/scene/cases`**: the Scene's behaviour as data. `CASES` (conformance rows: a `Scene`, the
  gestures a user makes and the layout and DOM expected after them), `CASE_GROUPS`, `runCase` and `runCases`, the
  in-memory reference host `createSceneHost()`, the `CaseHost` contract (`load`, `perform`, `layout`, `root?`,
  `itemSelector?`, `stored?`, `stops?`), the gesture constructors `g`, `pickTarget` and `resolvePlace`, so a UI kit's
  suite and the lab run the same rows. A DOM check names an item with `item`, found with the host's `itemSelector(id)`
  (default `[data-dock-item="<id>"]`, `defaultItemSelector`). Pure data and logic, no DOM and no dependencies; a new
  `scene-cases` file in the build, checked by `check-dist` (every row runs on the built code).

## 26.11.17

- `@n-uf/placement/scene` exports `reservedRect(scene, layout, id)`: what a fixed item keeps clear of hits and slots.
- **Changed** (`@n-uf/placement/scene` targets): a fixed item that grows (a title filling its bar) reserves only its
  natural rect, placed by its zone, instead of its whole drawn rect. Gap hits may lie in the length it grew by, and the
  drop shrinks it toward its natural size (to its `min` if the room needs it), so a group moved out of a title bar can
  go back. No hit and no slot lies over the natural rect. Affected: bars whose growing fixed item filled them offered no
  gap in 26.11.16; they now offer one where a group fits.

## 26.11.16

- `@n-uf/placement/stack`, the cases a host with several kinds of item and a title bar needs. Additive: no rename, no
  removed export, no new required field, and an input that uses none of the new options gives the 26.11.15 fit and
  targets (`test/stack-compat.test.ts` checks it against a verbatim copy of the 26.11.15 solver and targets: 3,000
  fits with a chain of `previous` solves, 1,500 target lists, and the options at their defaults).
  - **`StackInput.accepts(item)`** (C25): `stackTargets` gives no target for a dragged item the stack doesn't accept.
    **`stackTargets(…, { allows(dragged, at) })`** leaves out the gaps it refuses. Item kinds stay the host's.
  - **`StackItem.fixed`** (C29, a bar's reserved room): never gives way (skipped as the victim, keeps its first allowed
    form, also across), counts toward the length, is never dragged (`stackTargets` gives `[]`), takes no part in
    `previous` growth, and has no drop slot inside it: the gaps before and after it stay, and its area is in no gap's
    `hit`.
  - **`stackTargets(…, { onlyFits: true })`**: a gap is offered only where the dragged item fits beside the others: not in
    the menu, no `overflow`, no new `too-wide`, no fixed item squeezed (in another form, shorter than its form's
    `main.min`, or narrower across than before the drop); a fixed item may shrink down to its `main.min` to make room.
  - **`StackInput.ownCross`** (C28, opt-in): an item in a group form (`row`, `stacked`, `icons`, `fold`) is drawn at its
    own `cross.natural`, clamped to the stack's and from its start edge; panel forms (`open`, `header`, `rail`) and the
    » entry still span, so every open panel fills the column, and hits and markers span the stack. The kind decides, not
    `setsCross`: a group's form that sets the cross size (the recommended column form for words, `stacked` with
    `setsCross`, then `icons`, then `menu`, no `row`) widens the column to the widest such group but is drawn at its own
    width.
  - Affected: none unless the options are used. The README has the recommended column forms for a group and a title bar
    example.
- **New entry `@n-uf/placement/scene`**: one model of a whole window, built on `./stack`. Additive: a new export path
  (`./scene` in `exports`, the tsup entry and the dist check); nothing else changes.
  - `Scene`, `Edge`, `SceneItem`, `SceneFloat`, `SceneLayout`. Edges are cut ring by ring (full bars, columns, between
    bars; overlay edges over the content), each a stack along its length with `forms.column` or `forms.row`; zones
    (`align`: start, center, end); fixed items that shrink and grow but never change form; closed items; a column with
    nothing setting its width is a rail of tabs (`railShowsClosed`); `Edge.size`, clamped to the widest open setter's
    `cross.min`; floats inside the stage, clear of docked items, bars and `chrome`, with `anchor`, `orient` and a bar form
    when folded.
  - `solve(scene, { previous })`: every rect; `previous` goes to each edge's `fitStack`.
  - `targets(scene, id, { previous, endReach, floatSize })`: `gap:<edge>:<zone>:<at>` where the item fits (kinds deny by
    default, no menu, no overflow, fixed items unmoved, hits clear of fixed items and chrome), `strip:<edge>` for an
    empty edge, `float:<id>` over the plane, `none:<i>` over `blocked`, `home:<id>`; each with `after(point, grab)`, the
    scene to commit and `solve` of it, so the preview is the result.
  - Pure changes `moveTo`, `floatAt`, `fold`, `use`, `keep`, `raise`, `open`, `close`, `orient`, `resize`; and
    `storeScene` / `readScene` (`StoredScene` v1, lenient, never throws, lists what it drops, no pinned field).
  - Panels as products have them (planned for the release after the bars): dynamic columns (`Edge.column`, made from
    `Scene.columns[side]`, deleted when empty, rings closed up), one rail per side (`Scene.rails`, `layout.rails`),
    column give-way by `Scene.contentMin` (shrink, then fold whole: unkept first, oldest newest use; held under
    `previous`), `handFold: "ride"`, `inset` and `gutter`; `moveTo` with `column`, `rail` and `float` places, `homeFor`;
    `column:<side>:<ring>` and `rail:<side>:<ring>` targets, own-place drops as homes, `stops`; stored columns
    (`column: true`). Two document windows' width thresholds are pinned in tests.
  - `Edge.hitBand` (`number | "middle"`; default 24 for columns, `"middle"` for bars): a column's gap hits are bands
    around the insertion lines, so a panel's body is no drop area for a group. Gaps on one line are one target.
  - A `content-changed` note (`{ from, to }`) whenever `content` differs from `previous.content`.
  - Under `previous`, a just-opened item counts as the newest (its largest form while it fits); `fresh` ids solve
    without `previous`. Folded columns unfold in the reverse of their fold order, to a fixpoint.
  - Targets: whole-scene C29 (no new `overflow` or `too-wide`, no fixed item changed or squeezed under its min,
    anywhere), hits clear of fixed items' drawn rects, no slot on chrome, no home for a floating item. The store clamps a
    float by its drawn size and never cuts it.

## 26.11.15

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
