# @n-uf/placement: reference

The detailed behavior of every entry of `@n-uf/placement`, with examples. The reference covers behavior; the exported
types are the contract. The design, the rules a consumer relies on and the export tables are on
[placement.md](./placement.md); every signature and type field is on [sdk.md](./sdk.md). A whole
window's docking model, built on this layer, is `@n-uf/docking` ([docking-reference.md](./docking-reference.md)).

- [Edge bands (`cutEdges`)](#edge-bands-cutedges)
- [Stack (`@n-uf/placement/stack`)](#stack-n-ufplacementstack)
- [A toolbar's rows](#a-toolbars-rows)
- [A title bar, kinds an edge takes, a group's own size](#a-title-bar-kinds-an-edge-takes-a-groups-own-size)
- [Form flags](#form-flags)
- [One edge's drop places (`stackGaps`)](#one-edges-drop-places-stackgaps)
- [Floats (`fitFloat`)](#floats-fitfloat)
- [Tiling (`@n-uf/placement/tiling`)](#tiling-n-ufplacementtiling)
- [Popup (`@n-uf/placement/popup`)](#popup-n-ufplacementpopup)
- [Root (`@n-uf/placement`)](#root-n-ufplacement)

## Edge bands (`cutEdges`)

`cutEdges(stage, bands)` cuts the stage into bands along its sides, in list order, and gives each band's rect by id and
what is left (`rest`). Each band (`EdgeBand`: `id`, `side`, `size` across, optional `gap` and `mode`) takes its `size`
at its side of what the bands before it left, so **the order decides the corners**: a top band cut before a left one
runs across the whole width and the left one starts below it; cut after it, the left one runs the whole height.

- A `reserve` band (the default) shortens the leftover: what follows is cut from what it leaves.
- An `over` band lies over the leftover without shortening it (a toolbar drawn over the pages). The `over` bands are
  cut after every reserved band, whatever the list order, from the final `rest` less the `over` bands before them, so
  each lies inside `rest`, two on one side lie side by side, and `rest` stays whole.
- A band is never thicker than the room left across it; a negative or missing size is 0. `gap` is space after the
  band, taken only when the band takes some room, and never more than the room left. A stage width or height that is
  negative or not finite is cut as 0, so every rect has a size of 0 or more.
- Band ids are unique: a repeated id throws.

The reserved bands and `rest` tile the stage with no overlap, each `over` band lies inside `rest`, and each corner
belongs to the band cut first along either side of it (`test/stack-cut.test.ts`, a property check over random cuts).

```ts
import { cutEdges } from "@n-uf/placement/stack";

const cut = cutEdges({ x: 0, y: 0, width: 900, height: 500 }, [
  { id: "title", side: "top", size: 32 },
  { id: "left", side: "left", size: 240, gap: 8 },
  { id: "status", side: "bottom", size: 24 },
  { id: "tools", side: "top", size: 40, mode: "over" },
]);
console.log(cut.bands.left, cut.bands.status, cut.bands.tools, cut.rest);
// { x: 0, y: 32, width: 240, height: 468 } (below the title: cut after it)
// { x: 248, y: 476, width: 652, height: 24 } (beside the left band and its gap: cut after them)
// { x: 248, y: 32, width: 652, height: 40 } (over the leftover)
// { x: 248, y: 32, width: 652, height: 444 } (the over band doesn't shorten it)
```

## Stack (`@n-uf/placement/stack`)

`fitStack(input)` lays out the items along one edge of a stage: a column (`axis: "column"`, a side region) or a row
(`"row"`, a bar). An item is a panel or a control group and declares its forms, largest first. Each form has a
`kind` (a panel's `open`, `header`, `rail`, `menu`; a group's `row`, `stacked`, `wrap`, `icons`, `fold`, `menu`), a
`main` size along the stack (`min`, `natural`, `grows`) and a `cross` size. `fitStack` picks one form per item and
places them; nothing in it is a word.

- Every item starts in its largest form, or at `from` (an index into its forms; a panel the user folded by hand
  starts at its header). While the smallest sizes don't fit the `length`, one item takes a smaller form: the step into
  the lowest `rank` (below), and among equals the least recently used item (`used`: the smaller, the longer ago), unkept
  before `kept`, the later in the stack first on a tie. A `menu` form takes no room: the » entry does (`menu.main`,
  default 28 px), while any item is in it.
- A give-way step goes only to a later form that shortens the stack: its `main.min` is smaller, counting the » entry
  when the form is the menu and the gaps gained or lost. A form that doesn't (the same length, or longer) is skipped,
  and an item with none stays; when no item can give more way and the stack is still too long, `overflow` says by how
  much. The first item into the menu opens the » entry, so one shorter than the entry (a 24 px icon, a 28 px entry)
  can't go in alone: the items stuck that way go in together, in give-way order, as few as shorten the stack (two
  icons, 48 px, for one entry, 28 px); each item after that saves its whole size. If all of them together don't beat
  the entry, they stay.
- A growing fixed item that takes no steps (a title: `fixed`, not `stepping`, with a form that `grows`) holds its
  natural length first. While the other items can still step to a form of the step group they are in (`stepGroup`,
  default the kind: a toolbar's compact variants, a row to a smaller row) or shrink toward their least, they do so
  before the title gives up any of its natural length; then the title shrinks toward its `main.min`, and after it come
  the steps that change a form's step group (icons, fold, the » menu), by rank, then age. Room
  coming back is the exact reverse. `StackFit.need` is the forms' least with every growing fixed item at its minimum.
- `StackForm.rank` (default 0) orders the steps: the lowest rank of the form an item would step into goes first, then
  unkept before kept, then the oldest, then the later in the stack. Give a pinned primary's last forms a higher rank
  and every other group gives way before it does.
- `gap` is the space between neighboring drawn items (the » entry is a neighbor) and `pad` (`{ start, end }`) the
  space before the first item and after the last (or the » entry). Both count toward the length and every rect
  includes them, so an app draws at the solver's rects and the preview is exact. A non-number or a negative one is 0.
- Spare length goes to the forms that `grows`, shared by their natural sizes (or by their asked lengths, see
  [Dividers](#dividers-asked-lengths-and-resizing-between-items)). With none, the items keep their natural sizes from
  the start of the stack.
- The stack's cross size is the widest `cross.natural` among the forms that set it (a form with `body`, by default
  a panel's `open`; `setsCross` overrides), clamped to `cross.min` and `max`. With none it is the rail, `cross.rail`
  (default 30 px).
- Cross-fit: a form that doesn't set the cross size and whose `cross.min` (default its `natural`) is over the stack's
  takes its next form, so a group alone is a rail of icons and a column with nothing open shrinks to a rail. Give a
  header a small `cross.min` and it stays in a column an open panel made narrower. Cross size never puts an item in
  the menu: an item that is still too wide in its last drawn form keeps it, and `too-wide` says so (the app clips it).
  Cross-fit and give-way repeat until nothing changes, because a panel folding can narrow the column.
- `strictCross: true` (off by default): a form is never drawn thinner than its `cross.min` (default its `natural`), so a
  form that sets the cross size and has a `cross.min` over the limits' `max` steps down too: in a top bar with `cross.max`
  40, an open panel with `cross.min` 120 becomes a header instead of being squeezed to 40. Without it such a form is
  clamped to `max`, whatever its `cross.min`.
- `StackForm.wrap` (`{ widths, row, gap?, lead? }`, a form of the group kind `wrap`, meant for a column of words): a form
  whose length depends on the cross size it gets. The words flow into rows of at most the stack's cross size, in a box
  beside `lead` (the grip's cell at the start of row one: a hanging indent, every row starts after it, so the grip never
  has a row of its own). A row always takes its first word. Its length is rows × `row`; its natural cross is the one-row
  width (the lead, the words and the gaps), which counts only with `setsCross: true`. It fits a cross size only when
  every word fits beside the lead and no row but the last holds a single word: narrower, it is too wide and takes its
  next form, and its `cross.min` is the narrowest cross where it fits. `main` and `cross` given on such a
  form are ignored. Give-way, fits, `previous` and growth use the computed length, and under `ownCross` it is drawn as
  wide as its rows need. A word group in a column needs an `icons` form after it: a vertical place skips `wrap` forms.
  `wrapLines(spec, cross)` gives the word indexes per row, the widest row and whether the form fits; `wrapRows(spec,
  cross)` the row count; `wrapCross(spec)` the one-row width and the narrowest cross it fits; `formFitsCross(form,
  cross)`, `formCrossMin(form)` and `formMain(form, "min" | "natural", cross)` read any form, wrap or not.
  A word 1 px wider moves nothing else while the rows don't change.
- `StackForm.grip` (px): a grip at the form's start along the stack, this long (an icons strip's horizontal grip on
  top); a window model reports its rect as the item's grip. A `wrap` form's grip is its lead cell instead.
- `StackForm.hides` (control ids): what the form leaves out against the item's first form, for a toolbar's compact
  variants. The stack never reads it; a window model reports it as the item's hidden controls.
- `fitStack(input, { previous })` keeps the forms of the fit the stack had before, while they still fit: a change of
  `used` ages alone (a press on a header) reshapes nothing. Ages decide only who gives way anew (the length shrank, an
  item was added, or a panel opened: its `from` went down, so it starts over). Growing never re-ranks. When the stack got
  wider across (a group's stacked form returns to its row, a header folded to a rail icon by its `cross.min` to its
  header) the largest forms are tried again, as without `previous`. When the fit's `need` (the length its forms need) left
  more spare length than before (the length grew, a gap or size shrank), room comes back by undoing the give-way history
  exactly in reverse. A fit carries that history as `StackFit.steps`, each step a `StackStep` (`{ id, from, to, batch? }`:
  item `id` went from form `from` to form `to`), in the order taken, and the next fit with that `previous` carries it on.
  Room coming back undoes the steps from the last one: an item goes back to the nearest earlier form the stack fits with
  (the last item out of the menu takes the » entry along), a batch that went into the menu together (steps sharing a
  `batch`) comes out together, and the first step that can't be undone stops all growth, so a leading group never opens
  while a trailing one that gave way after it stays folded. At every length the way back holds what the way down held,
  whatever presses changed the ages since, the menu included. A `previous` without `steps` (built by hand, or after a
  reload: a stored form keeps no steps) grows by this rule: a fresh fit that is a pure gain over the kept forms, else the
  item that gave way most recently (highest rank, then `kept`, then the newest used, then the earlier in the stack)
  first, one at a time, menu items out only while that keeps the order. One px of room, or a badge losing a digit after
  a press, moves nothing. Results under `previous` depend on history: a shrink then a grow can end at another
  arrangement than a fresh solve, and more room never undoes a growth along successive solves. Growing back is meant
  for stacks of up to about 50 items (60 small menu items take about 9 ms). An item whose form at the kept index is of
  another kind starts over; one only re-measured (a badge changed a digit) keeps its place: a smaller form frees room
  that grows the kept forms, a larger one gives way from them. After changing the forms' cross sizes (a lowered
  `cross.min`, say) solve once without `previous`: that alone doesn't bring a form back. `previous` is the `StackFit`
  last returned; a hand-built one with no `need` is no help. `stackGaps(…, { previous })` solves every gap the same way,
  so a gap's fit equals the drop solved with the same `previous`.
- The solver has no open or closed state: it lays out the items it is given. An item with no forms is left out
  (`no-forms`). Panel and group kinds may be mixed on one item.

```ts
import { fitStack, type StackForm, type StackItem } from "@n-uf/placement/stack";

const form = (kind: StackForm["kind"], min: number, natural: number, cross: number, grows = false, crossMin?: number): StackForm => ({
  kind,
  main: { min, natural, ...(grows ? { grows } : {}) },
  cross: { natural: cross, ...(crossMin === undefined ? {} : { min: crossMin }) },
});
const panel = (id: string, used: number): StackItem => ({
  id,
  used,
  forms: [form("open", 90, 160, 240, true), form("header", 28, 28, 240, false, 100), form("rail", 24, 24, 30), form("menu", 0, 0, 0)],
});
const tools: StackItem = { id: "tools", used: 3, forms: [form("row", 96, 96, 180), form("stacked", 78, 78, 84), form("icons", 72, 72, 28), form("menu", 0, 0, 0)] };
const column = { axis: "column", length: 250, cross: { min: 120, max: 360 } } as const;

const fit = fitStack({ ...column, items: [panel("pages", 1), panel("findings", 2), tools] });
console.log(fit.items.map((p) => p.kind), fit.cross, fit.notes);
// [ 'header', 'open', 'row' ] 240 [ { code: 'form-down', id: 'pages', from: 0, to: 1 } ]

const alone = fitStack({ ...column, items: [tools] });
console.log(alone.items[0]!.kind, alone.cross); // icons 30
```

The result has, per item, `form` (an index into its forms), `kind` and `rect` (stack-local px: the stack starts at
0, 0); `cross`, the stack's size across; `menu` (the » entry's `rect` and the ids in it, or `null`; an item in the
menu has the entry's rect; `menu.items` are exactly the items whose kind is `menu`); and coded `notes`: `form-down`
(`id`, `from`, `to`: the item took a smaller form than the one it started in, by length or by cross size, as indexes
into its forms), `to-menu` (`id`), `too-wide` (`id`), `no-forms` (`id`) and `overflow` (`over` px: no item can give
more way and the stack is still too long; forms that don't end in a `menu` form can't give more).

## Dividers: asked lengths and resizing between items

Stacked panels can share a draggable divider: one neighbor gets longer, the other shorter by the same amount, the
stack's total stays and nothing else in it moves. The state is one optional number per item and per axis.

```ts
interface StackLengths { readonly column?: number; readonly row?: number }
StackItem.lengths?: StackLengths;           // px along the stack, the length asked for

dividers(input: StackInput, fit: StackFit): StackDivider[];
interface StackDivider {
  before: string; after: string;            // ids of the nearest open growing items on each side
  rect: Rect;                               // the strip the divider sits on, stack-local
  range: { min: number; max: number };      // min <= 0 <= max: the delta allowed each way
}
resizeBetween(input: StackInput, before: string, after: string, delta: number, options?: FitOptions): StackInput;
resetBetween(input: StackInput, before: string, after: string, options?: FitOptions): StackInput;
resetLengths(input: StackInput): StackInput;
```

- **`StackItem.lengths`** is read, for the stack's axis, in place of the `main.natural` of the form the item is in, while
  that form grows (`main.grows`, not the menu; a `wrap` form that grows shares spare length, so it reads it too). The least stays the form's `main.min`, a floor on
  the drawn size, not on the ask; a length that isn't a finite number over 0 is no length (a 0 asks nothing: the item reads its natural). There is no new formula. With
  spare length the sized items share it in proportion to their lengths, as a splitter does, and one whose share would be
  under its least is drawn at its least while the others share the rest; short of length they interpolate between
  their least (an ask under it reads as the least) and their length, so a divider still trades room in a tight column. A form that doesn't grow (a header, a
  rail icon, a group, a folded item) ignores the length: it is kept for when the item grows again. A stack whose items
  declare none is laid out exactly as before, and what gives way, in which order, never reads a length. `lengths` is
  plain data: store it, read it back, and an older state without it lays out as it always did. A length in it is in ask
  units, not drawn px; with room to spare a drawn size is the ask times the shared scale, or its least when that is more.
- **A re-measured natural moves nothing** of a sized item. An item nobody sized asks its natural, so when its natural
  changes it re-shares the column with the sized ones: they keep their proportion to one another, not their px (content
  that grows takes room). Closing an item shares its room among the others in
  proportion; reopened with its length at the same stack length, it comes back as it was. A longer or shorter stack scales the
  lengths together (they are relative), so shrinking and growing back gives the same layout. An item that moves to
  another stack keeps its length; it is per axis, so a bar never reads a column length.
- **`resizeBetween(input, before, after, delta)`** moves `delta` px from `after` to `before` (a negative `delta` the other
  way) and returns the new state. `before` and `after` must be neighboring growing items, both ends, in that order;
  a header, a rail icon, a group or a folded item between them doesn't matter. A resize writes the lengths of the two
  items of the pair, and no other item gets one: a bystander keeps whatever it had, none when nobody sized it, so it goes
  to another stack as the item it is. The lengths are asks, not drawn sizes: with room to spare the pair's ask is its drawn
  size over `scale` (`scale` = how much longer than it asks a growing form is drawn); short of length it is
  `least + (drawn - least) / share`, `share` being the share of the way from least to ask the stack was drawn at. The
  pair's drawn sizes add up to what they did and every other item draws as it did, so the scale is unchanged and nothing
  else shifts; the pair lays out exactly as drawn, whatever the items that don't grow do. An end dragged to its least with
  room to spare asks `least / scale`, under its least, and is drawn at its least. A collapsed item gets no length from a
  drag: reopened, it asks its natural beside the pair's asks, which add up to what they did, so it keeps its proportion
  unless an end of the pair is held at its least (its ask under the least and its share of the column too); then it gives
  up that end's excess in proportion. Neither goes under its least: `delta` is clamped to
  the divider's `range`, so nothing collapses and nothing is pushed. It returns the same object when nothing changes
  (not neighbors, an unknown id, a `delta` that isn't a number, or one clamped to 0). A drag computes each frame from the state
  at the press and the pointer's distance from it. `options.previous` is the fit the stack had, as for `fitStack`.
- **`dividers(input, fit)`** gives one divider per pair of neighboring growing items that are both ends. A collapsed item
  (a header, a rail icon, a group, an item in the » menu) has no divider of its own; where collapsed items sit between two
  open ones there is one divider between the open ones, its `rect` on the far edge of the last collapsed one (the lower edge
  in a column). The `rect` starts there and is as thick as the gap to the next item (0 with no `gap`), as wide as `before`
  across. `range` is how far it may move each way, down to each end's least; a host clamps with it and draws from it. A
  divider spans only items drawn but not growing. A growing item that is not an end (a `fixed` one, a `wrap` form that
  grows) ends the chain: it has no divider, is never resized and nothing is dragged across it, though it shares spare
  length like any growing item (its length is written so it doesn't shift).
- **`resetBetween(input, before, after)`** gives the two items the split they would be drawn at if both asked for their
  natural, their combined drawn length kept and nothing else moving: in proportion to their naturals (`main.natural`) with
  room for both, and `least + (natural - least) * s` with one shared `s` when short. The double-click action. The same
  object when the two are at that split already, which a pair nobody resized always is, in every regime. Like a drag it
  writes the lengths of the two items only, in ask units.
- **`resetLengths(input)`** deletes every length of the stack's axis, back to the split a stack with none has. An item's
  length for the other axis stays; the same object when no item had a length for this axis.

## A toolbar's rows

A top bar of control groups uses the same solver, with a few more things it can say:

- A group's `fold` form is its grip with its own » in line (the group collapsed): it keeps its place in the stack and
  takes its own `main` length. The shared » entry (`menu`) stays a later step: give the `menu` form a higher `rank`
  than the folds, or an older group may go into it before a newer one folds.
- `rank`, `gap`, `pad` and `cross.max` as above. The app draws every group at the solver's rect, so there is nothing to
  measure and the drop preview is exact.
- Hysteresis is not here: a pointer that flickers between two gaps is `@n-uf/motion/drag`'s to calm (the intent's
  band), and `stackGaps` only says where the gaps are and what each drop makes.

```ts
const group = (id: string, used: number): StackItem => ({ id, used, forms: [form("row", 100, 100, 26), form("fold", 36, 36, 26), form("menu", 0, 0, 0)] });
const bar = { axis: "row", length: 330, cross: { min: 36, max: 40 }, gap: 8, pad: { start: 12, end: 12 }, items: [group("views", 1), group("tools", 2), group("zoom", 3)] } as const;

const row = fitStack(bar);
console.log(row.items.map((p) => [p.kind, p.rect.x, p.rect.width]));
// [ [ 'fold', 12, 36 ], [ 'row', 56, 100 ], [ 'row', 164, 100 ] ] (three rows need 340: Views, the oldest, folds)
```

## A group's ladder from its controls

`controlLadder(spec)` generates a group's forms from what it holds, so a bar runs short control by control and not group
by group. It is additive: a host that hand-writes its forms is unchanged, and nothing in `fitStack` knows about it. The
result is ordinary forms with `rank` and `hides` set, so the solver's rules do the work (the lowest-ranked next form
across all items, its tie-breaks, the way back by `previous`).

```ts
import { controlLadder, fitStack, type ControlLadderSpec } from "@n-uf/placement/stack";

const spec: ControlLadderSpec = {
  controls: [
    { id: "fit", tiers: [48, 30, 22] }, // lengths per tier, longest first, in the host's order of presentation
    { id: "in", tiers: [34, 26, 22] },
    { id: "out", tiers: [34, 26, 22] },
  ],
  gap: 4, grip: 10, more: 22, cross: 28,
};
const { row } = controlLadder(spec);
console.log(row.map((f) => [f.kind, f.main.min, f.rank ?? 0, f.hides ?? []]));
// [ ['row', 134, 0, []], ['row', 126, 100, []], ['row', 118, 100.33, []], ['row', 100, 100.67, []],
//   ['row', 96, 200, []], … ['row', 80, 400.33, ['out']], ['row', 54, 400.67, ['in', 'out']],
//   ['fold', 32, 500, ['fit', 'in', 'out']], ['menu', 0, 600, []] ]
```

- **The spec.** `controls` in drawing order, each `{ id, tiers, foldOrder? }`: `tiers` are the control's lengths along
  the stack per tier, longest first (a tier it doesn't list keeps its last length; the group's tier count is its longest
  list). `gap` is between two controls, `grip` the group's grip cell, `more` the group's own » cell, `cross` its
  thickness; the grip and `more` are the cells' own widths, with no gap added. `foldOrder` (default the control's index)
  says which control folds first: the higher number, ties to the later control. `column: { icons, cross? }` adds the
  group's forms down a column (an `icons` strip, then the menu); `keep` (default 0) lifts a pinned primary (below).
- **The ladder, in order.** For `n` controls and `T` tiers: (1) every control at tier 0, a `row`; (2) the tier steps, one
  control at a time in fold order: the control that folds first takes tier 1, then the next, then the first takes
  tier 2, and so on to tier `T - 1` for all, each a `row` with every control shown. Tiers 1 and 2 have rank
  `100 * t + i / n` (`i` the step's index within tier `t`), so groups of different sizes level within a tier; every later
  tier shares the band from 300 in tier order, rank `300 + (t - 3 + i / n) / (T - 3)`, strictly increasing along the
  group and under 400 for any `T`; (3) the partial folds, for `k = 1 … n - 1` a `row` at the last tier that hides the
  first `k` controls in fold order (`hides` lists them; its length is the shown controls, the gaps, the grip and `more`),
  rank `400 + k / n`, so the group with the fewest hidden controls folds next; (4) `fold` (the grip and `more`, `hides`
  every control), rank 500, then `menu`, rank 600. The bands are fixed whatever a group's tier count, so groups of
  different tier counts still keep the order across a bar. Along the ladder the `hides` sets only grow: the tier forms
  hide none, a partial fold's set holds the one before's, `fold` hides every control.
- **A fixed shape.** Every form is always emitted, even when it is no shorter than the one before (a partial fold whose
  `more` cell is longer than the controls it hides, tiers that repeat). `fitStack` passes over a form that doesn't
  shorten the stack and takes the next one that does, so the form count is `n * T + 2` (none with no controls) and an
  index in `previous`, in the history and in a hand fold's `from` stays valid when a length changes. When the control set
  itself changes, solve the group without `previous`.
- **Order across a bar.** Ranks are spaced by step type, so every group's tier steps come before any group's partial fold,
  every partial fold before any `fold`, and `fold` before `menu`; within a step type the usual tie-breaks decide. Two
  like groups never differ by more than one form. A growing fixed item (a title) keeps its natural length while any group
  has a `row` step left: the generated forms are all `row` kind until `fold`, so it gives way only after every group is
  down to its last partial fold. Growing back is the exact reverse, and a 1 px wobble around a step boundary flips only
  that step.
- **The room left.** Growth undoes the last step first, so the room left over is always less than that step needs back;
  it is not the cheapest step of the bar, because a cheaper step of another group sits earlier in the history.
- **A pinned primary.** `keep: 1` adds 1000 to the ranks of the partial folds, `fold` and `menu` (and of the column's
  menu), so every group of a lower level gives way entirely before it folds a control; its tier steps are unchanged.
  `@n-uf/docking`'s `DockItem.priority` still adds to every form's rank. It keeps a step inside its step type only while the items of a
  bar differ in priority by less than 99 (so `|priority| < 99` around 0): the `i / n` and `k / n` parts reach up to
  `(n - 1) / n`, so with a gap of 99 or more a step of one type can pass a step of the next.
- **In a dock state.** `controlLadder(spec)` is a `DockItem.forms` (`@n-uf/docking`): `{ id, kind: "group", used, forms: controlLadder(spec) }`.
  The chosen form's `hides` are the item's `hidden`, so a host draws the shown controls and the group's » with exactly
  those, and each row form's `tiers` (control id to tier index, 0 the longest, for the controls it shows; `fold` and
  `menu` have none; always a valid index into the control's own `tiers`) are the item's `tiers`, so a host draws each control at `tiers[id]` without knowing the ladder's order.

## A title bar, kinds an edge takes, a group's own size

Opt-in options for hosts that dock several kinds of item. All are additive: an input that uses none of them gives the
fit it always gave. Item kinds are the host's; placement only calls the predicates.

- **`StackInput.accepts(item)`**: the stack takes this item or not. `stackGaps` refuses every gap for an item the stack
  doesn't accept (`not-accepted`), so a toolbar-only bar takes no panel and a panel-only column no group. `fitStack`
  never calls it: the items already in the stack are laid out as given.
- **`StackItem.fixed`**: a reserved room, such as the window title, a page readout and the window controls in a title
  bar. A fixed item never gives way: it is skipped when the stack is too long and keeps its first allowed form
  (`forms[from]`) for the length and for the cross size (a `too-wide` note says when it doesn't fit across), so a stack
  too short for it `overflow`s. It counts toward the length and takes no part in `previous`'s growing back. It is never
  dropped (`stackGaps` refuses every gap with `fixed`). A fixed form that `grows` still takes spare length like any
  form.
- **`StackItem.stepping`** (read only with `fixed`): a fixed item that still takes steps, such as a page readout with a
  ladder of its own. It keeps only the reserved place (never dropped), and the solver treats it as an ordinary item: it
  steps through its forms and into the » menu, gives way by rank, `kept` and age, and grows back in exact reverse, so its
  fit equals a movable item's with the same forms, `used` and `kept`. It never holds for the title rule; to have it
  shorten last, make it `kept` or rank its forms. `itemSteps(item)` is the one reading: not `fixed`, or `stepping`.
- **`StackInput.ownCross`** (default off): an item whose current form is drawn at its own size (`StackForm.ownCross`,
  default the group kinds `row`, `stacked`, `wrap`, `icons`, `fold`) is drawn at its own `cross.natural` (a `wrap` form:
  as wide as its rows need), clamped to the stack's cross size and from its start edge (the left of a column, the top of
  a bar), not across the whole stack. Other forms (by default the panel kinds `open`, `header`, `rail`) and the » entry
  still span it, so every open panel and header fills the column, as wide as the widest open panel. That flag decides,
  not `setsCross`, which decides the stack's cross size. `cross`, the forms,
  the notes and the lengths are as without it.
- **Recommended column forms for a group.** In a side column give a group `stacked` (one word per line, `setsCross:
  true`, so a column of groups is as wide as its widest), then `icons` (28 across, sets nothing: with every group in
  icons the column is a rail), then `menu`. No `row`: a row of words asks for more than a column has, and the group
  that keeps it widens the column. With `ownCross` each group is drawn at its own width, also beside a wider open panel.
  A bar's group is `row`, `stacked` or `fold`, `icons`, `menu`, as in the toolbar above. A group whose words should wrap
  to the column rather than stand one per line takes `wrap` (above) in place of `stacked`.

```ts
const title: StackItem = { id: "title", used: 0, fixed: true, forms: [form("row", 160, 160, 26)] };
const controls: StackItem = { id: "controls", used: 0, fixed: true, forms: [form("row", 72, 72, 26)] };
const bar = { axis: "row", length: 400, cross: { min: 36, max: 40 }, items: [title, group("views", 1), group("tools", 2), controls] } as const;

console.log(fitStack(bar).items.map((p) => [p.id, p.kind, p.rect.x, p.rect.width]));
// [ [ 'title', 'row', 0, 160 ], [ 'views', 'fold', 160, 36 ], [ 'tools', 'row', 196, 100 ], [ 'controls', 'row', 296, 72 ] ]
// (the three groups need 432: Views, the oldest, folds; the title and the controls stay as they are)

// A column: word groups in their stacked form, each at its own width beside a wider open panel.
const words = (id: string, used: number, wide: number): StackItem => ({ id, used, forms: [{ ...form("stacked", 78, 78, wide), setsCross: true }, form("icons", 72, 72, 28), form("menu", 0, 0, 0)] });
const side = fitStack({ axis: "column", length: 400, cross: { min: 120, max: 360 }, ownCross: true, items: [panel("pages", 1), words("views", 2, 84), words("tools", 3, 110)] });
console.log(side.items.map((p) => [p.id, p.rect.x, p.rect.width])); // [ [ 'pages', 0, 240 ], [ 'views', 0, 84 ], [ 'tools', 0, 110 ] ]
```

## Form flags

A form's `kind` is the host's label; what the solver and a window model read is said by fields, each defaulting from
the kind, and a field the host sets wins over the kind (`test/stack-form-flags.test.ts`):

| Flag | Says | Default | Read by |
| --- | --- | --- | --- |
| `body` (`formBody`) | It shows its body: an open panel. | true for `open` | the stack's cross size (`formSetsCross` is `setsCross ?? formBody`); a window model reads it as the item being open |
| `folded` (`formFolded`) | It shows only its bar: a panel's header, a group's grip and ». | true for `header` and `fold` | a window model: a fold by hand takes the first such form, and a float in it keeps its bar's height |
| `compact` (`formCompact`) | Icons only. | true for `icons` | a window model's icons-only edge takes it |
| `setsCross` (`formSetsCross`) | It sets the stack's cross size. | its `body` | the stack |

`menu` (a form with no room of its own, behind the » entry), `wrap` (the computed length) and `title` stay what the
kind and the fields say above.

## One edge's drop places (`stackGaps`)

`stackGaps(input, item, { previous?, allows? })` gives one edge's drop places for `item`, fit only. Every gap of the
stack without the item is one entry, in order: before each item and after the last, so an empty stack has one. An item
of the input with the dragged id is lifted out first, so a reorder within the stack works, and `at` counts the stack
without it.

- A gap where the item fits beside the others is `{ at, fits: true, input, fit, slot }`: `input` is the stack with
  the item inserted there, `fit` its solve (with `previous`, when given) and `slot` the item's rect in it. **The drop is
  that same solve**, so a preview drawn from `fit` is the result.
- A gap where it doesn't is `{ at, fits: false, reason }`.

The item counts as just used: it is newer than every item in the stack, so the others give way before it. It fits a gap
when the drop's fit doesn't put it in the » menu (`to-menu`), has no `overflow`, makes no item `too-wide` that wasn't
before (`too-wide`), and squeezes no `fixed` item (`squeezes-fixed`: it keeps its form, is drawn at least its form's
`main.min` along the stack and at least as wide across as before; one with `stepping` may step to a later form, as a
movable item may, and is then only kept at its new form's `main.min`). A fixed item may shrink down to its `main.min` to
make room (a title that `grows` gives back the spare length it took), so the room for the others is the length less the
fixed items' minimum sizes. Position is not a size: dropping before a fixed item moves it along, as a drop anywhere
moves what follows.

`no-forms` (the item has none), `fixed` (a fixed item is never dropped) and `not-accepted` (`input.accepts` refuses it)
refuse every gap; `allows(item, at)` refuses single gaps (`not-allowed`) and leaves the others as they were. Since the
item is the newest at every gap, the give-way order is the same at each, so what the fit leaves is all the gaps or none;
`allows` is what tells gaps apart. The function is pure: no hit zones and no time. Where the pointer is, and how a
flicker between two gaps is calmed, is the host's (`@n-uf/motion/drag`'s drag intent or landing model).

```ts
import { stackGaps } from "@n-uf/placement/stack";

const title: StackItem = { id: "title", used: 0, fixed: true, forms: [{ kind: "row", main: { min: 80, natural: 160, grows: true }, cross: { natural: 26 } }] };
const bar = (length: number) => ({ axis: "row", length, cross: { min: 36, max: 40 }, items: [title, group("views", 1), group("tools", 2), controls] }) as const;

const gaps = stackGaps(bar(400), group("marks", 4));
console.log(gaps.map((g) => (g.fits ? [g.at, g.slot.x, g.slot.width] : [g.at, g.reason])));
// [ [ 0, 0, 100 ], [ 1, 92, 100 ], [ 2, 128, 100 ], [ 3, 228, 100 ], [ 4, 300, 100 ] ]
// (the title gives back what it grew into, 160 to 92, and Views folds; the controls keep their 72)

console.log(stackGaps(bar(200), group("marks", 4)).map((g) => g.fits || g.reason)); // five times 'to-menu'
console.log(stackGaps(bar(400), title).map((g) => g.fits || g.reason)); // four times 'fixed'
console.log(stackGaps(bar(400), group("marks", 4), { allows: (_item, at) => at !== 2 }).map((g) => g.fits || g.reason));
// [ true, true, 'not-allowed', true, true ]
```

A window model weighs a drop on the whole window (its other edges, floats and content) and keeps its own targets;
`stackGaps` is the one-edge answer for a host that has a single bar or column.

## Floats (`fitFloat`)

An item that isn't docked is a float. It lies above the pages in the stage's own px (view space), so the pages scrolling
under it never move it.

`fitFloat(rect, stage, avoid?)` gives the rect a float gets: moved (never resized) to lie inside the `stage`, then
beside any of the `avoid` rects (the docked items' rects, and the » entries', in the same px) it would cover, at the
nearest place that is clear and inside the stage. A float larger than the stage keeps its top-left corner on the
stage's. A clear place is found whenever one exists, and then `covers` is empty. Only when the stage has no clear
place for it, the float stays where it covers the least (among the 2,048 nearest candidate places) and `covers` lists
the `avoid` indexes it still covers. `FloatFit`: `rect`, `clamped` (also true when a position that wasn't a number was
replaced), `snapped`, `covers`, `searchCapped`. Fit the floats again whenever the stacks or the stage change: a stack
that grew may lie under one.

`fitFloat(rect, stage, avoid, { stay: true })` (`FloatFitOptions`) is for a float a person left over content on
purpose: it is only moved inside the stage, never beside what it covers. `rect` is the asked rect clamped into the
stage, `snapped` is false, `covers` lists every `avoid` index it covers there and `searchCapped` is false. Where it
covers nothing it is the same fit as without the option.

Cost: the candidate x's (every edge of the stage and of an `avoid` rect) are tried nearest first; for each, the
stretches of y the rects block are merged and skipped, so no clear place is missed however many lie between, and the
search stops when no later x can be nearer. Measured in a test run on a laptop: about 100 `avoid` rects 0.1 ms, 300
a few ms even when no place is clear (6 ms median, 15 ms worst), 1,000 about 17 ms. A safety net stops the clear
search after 3 million rect tests (thousands of rects) and sets `searchCapped`: the place found may then not be the
nearest, or a clear place may exist that was not found. Keep `avoid` to the docked items, not to every pixel.

```ts
import { fitFloat } from "@n-uf/placement/stack";

const stage = { x: 0, y: 0, width: 900, height: 500 };
const docked = [{ x: 0, y: 32, width: 240, height: 468 }]; // a column of docked items, in the stage's px

const fit = fitFloat({ x: 100, y: 200, width: 200, height: 150 }, stage, docked);
console.log(fit.rect, fit.snapped); // { x: 240, y: 200, width: 200, height: 150 } true
```

Freezing the layout needs nothing from the library: the freeze is the app's flag, and the app reads it once at the press.
A press on a grip while frozen (and Alt not held) never becomes a drag, so nothing is dropped; holding Alt shows the
grips and everything works, a drag that began finishes. `fitStack` reads sizes, not what an item says, so a count or a
phase that leaves its forms' sizes alone moves no other item.

## Tiling (`@n-uf/placement/tiling`)

`@n-uf/placement/tiling` divides an area among panes, with no overlap and no hole. It has two models; **use an order
layout when panes only reorder, and the split tree when a drop splits a pane on a side.**

- **Order layouts**: `masterStack`, `columns` and `grid` take panes in order and an area (`{ gap, ratio }`), and give a
  rect per pane. `masterStack` also takes `count` (how many panes are masters: rounded, within 1 to n, default 1) and
  `side` (`"left"` by default, `"right"`, `"top"` or `"bottom"`). Left and right make the master area a column with its
  panes stacked vertically; top and bottom make it a row with its panes side by side; right and bottom put the stack
  first in space. The master area takes `ratio` of the room the gap leaves, clamped to 0.05..0.95 (not finite: 0.5).
  With no stack (n at most `count`), all the panes fill the area, stacked along the side's cross axis. A drop inserts
  the dragged pane at an index: `orderTargets(arrange, panes, dragged, area)` gives one target per index
  (`at:<index>`), its slot the dragged pane's rect there and `layout` every pane's rect with it there.
- **The split tree**: a `Split` is a pane or `{ a, b, axis?, ratio?, gap?, id?, master? }`. `layoutSplit(tree, area,
  { gap, handle })` lays it out. A split's gutter is its gap (its own `gap`, else the layout's) plus the layout's
  `handle`, and the middle of the gutter sits at the extent times the ratio: the first side is that less half the
  gutter, the second starts half a gutter past it. The ratio is clamped to 0..1 (not finite: 0.5), and no size is
  below 0 however wide the gutter. A split with no axis divides along the longer side in halves, so
  `splitFromOrder(panes)` is dwindle (split along the longer side). `splitPane`, `removePane` and `swapPanes` change
  it. `layoutSplitTree` is `layoutSplit` and, for each split with an `id`, its box, axis, ratio in effect and
  `divider` (the gutter strip; null where a fixed length decided the split, or a master split has no stack).
  A host that needs only the pane rects calls `layoutSplit`: it builds no split geometry (no box, no divider), and
  `layoutSplitTree` builds a divider only for a split with an `id`. The rects a layout returns are its own objects,
  never the caller's `area`. `pnpm --filter @n-uf/placement bench` times both against a hand-written layout.
  A drop on a pane goes by the pane's drop region:
  `paneRegion(rect, point, previous)` is the center (34 % of each axis, at least 24 px) or one of four side trapezoids,
  and holds the previous region for 6 px past its boundary. `dropOnPane(tree, dragged, at, region)` swaps for the
  center and splits `at` on a side, writing that side's axis and ratio 0.5, so a side means the same on any pane.
  `paneTargets(layout, { except?, key? })` gives one target per pane, its id `pane:<key>` (`key` defaults to `String`;
  keys must be unique, since a drag intent follows targets by id). A drop on a pane that isn't in the tree, or on the
  dragged pane itself, changes nothing.
- **Floors, fixed lengths and master splits**, all options or fields the host fills per split (see Entry: tiling in
  the design page for the table). `floor(child, axis, split)` gives `{ min, net? }`: the ratio is clamped so each side
  keeps its minimum of the room less the gutter, within 0.05..0.95 unless a side says `net: false`, and is 0.5 where
  the minimums cannot both fit. `fixed(child, axis)` gives `{ length, keep? }`: the first child that gives one takes
  its length when it fits with the gutter, and the other side fills the rest; with `keep` on both, each keeps its own
  length and the leftover stays empty (when they do not fit, the second runs past the end). `fixedAcross(child, axis)`
  gives a length across the split, not checked against the cross extent. A negative or non-finite `gap` or `handle` is
  0, and the area is taken as given, so pass one with no negative side. A repeated split `id` keeps the split laid out
  last. Inside a master split a drop's side is one more slot next to `at` in the flat list. A split with
  `master: { count?, side? }` lays its panes out flat through `masterStack` by its ratio and its gap; the splits under
  it are not laid out. The callbacks are asked about the nodes of the tree being laid out, and `dropOnPane` copies the
  split nodes it changes, so answer by pane key and by split `id`.
- `canDropOnPane(tree, dragged, at, region, area, { ...layoutOptions, min })` says `{ ok, reason? }` whether a drop
  leaves room. The center is fine unless `dragged` is `at`. A side needs, in the layout of the tree without `dragged`,
  a span of `at` along the split of at least `2 * min` plus the gutter and across it of at least `min`; and in the
  layout the drop makes, both panes at least `min` wide and high. It is exactly the two rules in turn, which a host
  with its own projected layout (one that re-pins collapsed panes, say) asks itself:
  `canSplitPane(target, side, { min, gap?, handle? })` is the room rule for the rect of the target (as the host
  measures it with `dragged` lifted out): along the split (width for left and right, height for top and bottom) at
  least `2 * min` plus the gutter (`gap` plus `handle`), across it at least `min`. `dropFits(projected, dragged, at,
  area, { min, side })` is the fit rule for `projected`, a map of pane to rect for the layout the drop makes: both
  panes are in it and at least `min` wide and high (fine, with nothing to measure, when `area` has no width or no
  height; `side` only words the reason). Both give `{ ok, reason? }` with the reasons `canDropOnPane` gives, and a
  `min`, `gap` or `handle` that is negative or not finite is 0.
- `paneRegion(rect, point, previous, { paneCenter })` takes the pane's center rectangle as the host already has it
  (a `PaneCenter`, pane-local px, what `paneCenter(size, options)` gives) and uses it in place of measuring, so
  `center`, `centerX`, `centerY`, `centerMin` and `pixelRatio` are not read; hysteresis still applies. The same center
  gives the same region. It is an option of the one function, not a second name: the point, the previous region and
  the hysteresis are the same inputs either way.
- `paneRegion(rect, point, previous, { sides })` takes the sides that exist (default all four). A point is in the
  center unless it lies past the center's edge toward a side that exists, so a side left out gives its whole strip to the
  center, which then reaches the pane's edge there. `paneRegionShapes(rect, options)` gives the five regions as convex
  polygons in the rect's coordinates (the center, and each side's trapezoid; a side left out has none), the regions
  `paneRegion` names without hysteresis; a hit reads its zones from them.
- `masterRatio(ratio)` and `masterCount(count, n)` are the clamps `masterStack` and a master split apply: the ratio
  within 0.05..0.95 (0.5 when left out or not finite), the count rounded and within 1..n (1 when left out or NaN, and
  never 0). A host that lays out its own master and stack calls them instead of repeating the numbers.
- `Rect` is re-exported from `./tiling`: the root's type itself.
- `neighbor(rects, from, direction)` gives the nearest pane that way, or null: a candidate's center must be strictly on
  that side of the center of `from`; its score is the center distance along the direction plus a quarter of the one
  across it, plus 100 when it does not overlap `from` across the direction; the lowest score wins, ties to the first in
  the map's order. The host chooses the rects. One option: lay the tree out in a unit square with px floors. Every
  split then goes to 0.5 (a floor of tens of px cannot fit) and fixed lengths along a split do not fit either, so the
  choice follows the tree's shape and not its ratios. Fixed lengths across a split are not checked against the cross
  extent and still apply there, so leave `fixedAcross` out of that layout.
- `giveWay(panes, layout, min, age)` floats the newest pane while any pane is laid out below its minimum. It is the
  other policy of the same minimum: a floor moves the ratio while both sides can keep theirs, `giveWay` floats a pane
  when a minimum is still broken.

Both kinds of target are the root `Target`, so a drag intent from `@n-uf/motion/drag` takes them as they are; for the
split tree its `placeOf` is the pane's region:

```ts
import { dropOnPane, layoutSplit, paneRegion, paneTargets, splitFromOrder, type PaneRegion, type PaneTarget } from "@n-uf/placement/tiling";

const area = { x: 0, y: 0, width: 800, height: 400 };
const tree = splitFromOrder(["a", "b"]);
const after = dropOnPane(tree, "c", "b", "top");
console.log(layoutSplit(after, area).get("c")); // { x: 400, y: 0, width: 400, height: 200 }

const targets = paneTargets(layoutSplit(tree, area));
const placeOf = (t: PaneTarget<string>, p: { x: number; y: number }, previous: string | null): string =>
  `${t.id}:${paneRegion(t.hit, p, (previous?.split(":")[2] as PaneRegion | undefined) ?? null)}`;
console.log(placeOf(targets[1]!, { x: 600, y: 10 }, null)); // pane:b:top
```

### A tiling drag: one layout per held place (`tilingDrag`)

`tilingDrag(tree, subject, options)` is the layout half of a drag on a split tree: what a frame holding a place draws,
and what its release commits, are one layout. Its hit half, which place the pointer is over (targets, a pane's parts,
the hold), is `drag.hit(basis)`, described after the layout half below.

- **The adapter.** The host keeps its own tree type `T` and gives a `TilingTree<T, K>`: `split(tree)` (the tree as a
  `Split` of the drawn panes, a stack standing in it as its active member), `stackOf(tree, pane)` (optional), and the
  changes `release`, `beside`, `swap`, `join` (optional; without it every join is refused `join`) and `normalize`
  (optional). Each is pure and returns a new tree, or the same one when nothing changes. `splitTreeOps<K>()` is the
  reference adapter over `StackedSplit<K>` (`{ split, stacks? }`): a pane swap trades keys wherever each pane is, a join
  makes `at` a stack (`stack:<at>`) when it is alone, and `normalize` turns a stack of one into its pane.
- **Which tree each change takes.** `beside(released, …)` and `join(released, …)` take `release(tree, subject)`: the
  subject leaves its old place first, so the place it lands in is measured and changed without it, and a stack never
  holds it twice. `swap(tree, …)` takes the tree with the subject still in it: a swap exchanges two places, and the
  subject's old place is where the partner goes.
- **A swap with a stack.** A pane swaps with `at` alone, never with the stack `at` stands for: a lone pane swapped with
  a stack takes the place of its drawn member in it (drawn, as that member was), the stack's other members stay, and
  the member goes to the pane's old slot. A member torn out of a stack, swapped with a lone pane, leaves that pane in its
  place in the stack. A whole stack subject trades its slot with `at`'s; two stacks trade places, each whole.
- **Options.** `ops`, `area`, `min` (the least pane width and height a side, a swap or a join keeps), the `SplitOptions` the host
  lays out with (`gap`, `handle`, `floor`, `fixed`, `fixedAcross`), and `still(pane)` for panes that take no drop.
- **The subject.** `{ kind: "pane", pane }` (a member of a stack is torn out of it), or `{ kind: "stack", stack }` with
  the stack as `stackOf` reported it at the lift, so `beside` and `join` have its members after its release. A subject
  that is not in the tree (neither drawn nor a member of a drawn stack) throws.
- **What it gives.** `lift` and `base` (each `{ tree, layout, splits }`: the lift tree, and the tree with the subject
  released, laid out with `layoutSplitTree`); `home`, the gap the release leaves (the subject's lift rect when the
  release takes a drawn pane away, null for a member torn out of a stack that stays drawn); and `after(held)` for
  `{ kind: "home" }`, `{ kind: "swap", at }`, `{ kind: "beside", at, side }` and `{ kind: "join", at, index? }`, `at`
  a pane drawn in the base. `after(held)` gives `{ held, tree, layout, splits, landing, moved, refusal }`: the tree a
  release commits (normalized, but home's, which is the lift tree itself), its layout, the subject's rect there, every
  other pane whose rect differs from the lift's (`{ pane, from, to }`), and the refusal or null. Each held place is
  remembered: the same place gives the same object.
- **Refusals.** `self`, `still`, `missing`, `join`, `room-along` / `room-across` (`{ need, have }`, px, from
  `canSplitPane` on `at`'s base rect) and `fit` (`{ pane }`: in the layout a side, a swap or a join makes, the subject
  or `at` is below `min`, `dropFits`' rule; a swap hands each the other's rect, so either may fall below it). A refused
  place's `tree` and `layout` are the lift's, `landing` is null and nothing moves: its release commits nothing. For a
  refused place, draw `base`, not `after().layout`.
- **The draw rule.** Nothing held, or a refused place: the base. A place held: `after(held).layout` (`hit.drawn(read)`
  gives this on the base basis; on the lift basis a frame draws the lift and a mark). For a
  swap the subject's old place reopens (the neighbor that grew into it at the lift gives the room back): the partner's
  landing there is `after(swap).layout.get(partner)`, and a host may mark it (the lab draws a tinted wash with ⇄ and the
  partner's name, with no frame) while the partner is still drawn where it is, as the subject's landing.
- **Conformance.** `tilingConformance(trees, options)` runs the properties (`TILING_PROPERTIES`) on every subject of each
  tree (`tilingSubjects`: each pane alone, each stack whole, each member torn out) and every held place: home is the
  lift tree and the gap; home lies only over panes the release changed; every `after` is its tree laid out; a swap
  exchanges the two rects and moves nothing else (not checked under per-child callbacks, `fixed`, `fixedAcross` and
  `floor`, which may move the ratios); a swap trades the two slots of the split, the partner landing in the subject's
  old one (checked under every option); a pane swapped with a stack keeps the stack's other members in place; the
  subject is in every tree exactly once (out of the base, and every `after` holds the base's keys and the subject's,
  none twice, which catches an adapter whose `release` leaves the subject in); `beside` and `join` commit
  `normalize(change(release(tree)))`; a whole stack stays together; `normalize` is idempotent on every `after`; and the
  drag never changes its tree. It returns `{ ok, failures, counts }`.

```ts
import { splitTreeOps, tilingDrag, type StackedSplit } from "@n-uf/placement/tiling";

const tree: StackedSplit<string> = { split: { axis: "x", ratio: 0.4, a: { axis: "y", a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } } };
const drag = tilingDrag(tree, { kind: "pane", pane: "a" }, { ops: splitTreeOps(), area: { x: 0, y: 0, width: 800, height: 500 }, min: 40 });
console.log(drag.home); // { x: 0, y: 0, width: 320, height: 250 }: a's place, which b grows into in the base
const swap = drag.after({ kind: "swap", at: "c" });
console.log(swap.layout.get("c")); // { x: 0, y: 0, width: 320, height: 250 }: the partner lands in a's old place
console.log(swap.moved.map((m) => m.pane)); // ["c"]: b is back where it was at the lift
console.log(drag.after({ kind: "home" }).tree === tree); // true
```

### A tiling drag: which place the pointer is over (`drag.hit`)

`drag.hit(basis, options?)` is the hit half. Call it once, at the lift: `"lift"` hit-tests the layout at the lift (the
subject's slot open) for a host that draws a mark over it, `"base"` the tree with the subject released for a host that
draws the landed layout. Each call is a hit of its own, with its own hold. The design page has the rules and an example
with `@n-uf/motion/drag` (*A tiling drag's hit half*); [decision 0012](decisions/0012-one-zone-map-per-tiling-drag.md)
the reasons.

- **What it gives.** `basis`, `laid` (the layout it hit-tests), `home` (the subject's lift rect, or null), `targets`
  (frozen), `intent` (the options for `createDragIntent({ ...hit.intent, lift })`), and `zone(point)`, `hold(state,
  point)`, `place(id)`, `placeOf(target, point)`, `read(frame, point)`, `drawn(read)` and `release(read)`. A host never
  parses a place id: `place(id)` gives its `TilingHeld`.
- **Targets.** `home` (priority 1, the subject's lift rect); `pane:<key>` (priority 2, a pane's rect: its five regions,
  with the sides a run neighbor keeps); `part:<pane key>:<part key>` (priority 1, an adapter's part, a join, a slot giving
  the index). Each has `pane` and `at`, and `part` or `home` where it is one. A still pane has no target; on the lift
  the subject's own slot has none either. `options.key(pane)` gives the key in an id (default `String`; keys must be
  unique across panes).
- **Options.** `regions` (the `PaneRegionOptions`; `hysteresis` is not read), `edge` (6), `travel` (24) and `share`
  (0.25), the hold rule's measures, `TILING_HIT_DEFAULTS` having them. A negative `edge`, `travel` or `share` is 0.
- **The intent's options.** `hit.intent` has `home` as a rect no point is in, and `tuning` with `aimSpeed` unbounded,
  `dwell`, `switchHold`, `roomAfter`, `breakthrough` and `gapGrace` at 0, and `band` as wide as `edge` with `bandShare` 1,
  so the intent keeps every target the hit still holds and shows it; its `placeOf` is the hit's.
- **The reader.** `read(frame, point)` gives `{ held, refused, mark }`. `held` is a `TilingHeld` (`{ kind: "home" }` at
  home), or null with nothing held outside home. `refused` is the refused place under the pointer, when nothing is held.
  `mark` is a `TilingMark` on the lift basis for a held place other than home, else null: `{ kind: "side", at, side,
  rect }` (the target pane's half), `{ kind: "swap", at, rect, wash }` (its outline, and home as the wash, null with no
  slot) or `{ kind: "join", at, rect, slot }` (its outline, and the slot with an index). A place is shown only when the
  intent's shown target is one of its zones.
- **Draw and commit.** `drawn(read)` is the lift on the lift basis; on the base `after(held)` for a held place, the lift
  at home, the base with nothing held. `release(read)` is `after(held)`, or home's `after` with nothing held.
- **Parts.** `TilingTree.parts(tree, pane, rect)` gives `TilingPart`s (`key`, `rect`, `slots?`), read once per drag on
  the layout the hit is on. Slot `i` stands before the `i`-th member of the pane's stack in that tree (the subject's own
  members not counted), so over it the join has that index; a slot past the members, or over the part with no slot,
  joins last. Parts are the host's declared geometry: nothing is read from the DOM. `splitTreeOps({ bar, tab })` is
  the reference: a bar of height `bar` along each pane's top (none when 0, the default), and for a stack a slot per
  member, `tab(member)` px wide (default 80), cut at the bar's end.
- **The hold.** `hold(state, point)` is pure: `state` is `{ place, at }` or null, and it gives the state after the pointer
  is at `point`. The place at a point is the topmost live zone: home, then a slot, its part, the pane's region. A held
  place stays while the pointer is within `edge` px (capped) past one of its zones, and not deep inside a zone above it,
  or, inside its pane and not over home, within `travel` px (capped) of `at`. A place whose release has the lift's
  arrangement is home, and home's zones are all of theirs.
- **The run neighbor.** Judged once on the lift tree when the release leaves a slot. The pane's bounds across the run
  are the subject's within 0.5 px. The sides gone are those whose insert gives the lift's arrangement or the swap's.
  The pane's regions are then taken with `sides` the rest, and `centerX` (a run along y) or `centerY` (along x) set to
  `TILING_NEIGHBOR_SWAP_SHARE`, 0.56. A target that is a stack's drawn member counts as the pane it stands for.
- **Conformance.** `tilingHitConformance(trees, options, hitOptions?, limit?)` runs the nine properties of
  `TILING_HIT_PROPERTIES` on every subject of each tree (`tilingSubjects`) and both bases, over seeded points, walks and
  sweeps, and gives `{ ok, failures, counts, reported }`: the first `limit` failures (default 20) in words, per property
  how many checks ran and failed, and `reported`, the rows counted and not failed (`swapsBeside`, `insertsMoveOthers`,
  `insertsMoveOthersBeside`).

## Popup (`@n-uf/placement/popup`)

`positionPopup(anchorRect, size, bounds, rule)` places a popup (a drop label, a menu, a tooltip) as Wayland's
xdg-positioner does: an anchor point on the anchor rect, a gravity (the direction the popup grows from it), an offset,
then flip, slide and resize, each only when the rule allows it, tried in that order per axis, inside `bounds`.
`Positioned` gives the `rect` and says which adjustments happened (`flipped`, `slid`, `resized`). An `Align` is -1, 0
or 1 on an axis; `BELOW_LEFT` is a menu's usual rule.

```ts
import { BELOW_LEFT, positionPopup } from "@n-uf/placement/popup";

const menu = positionPopup({ x: 860, y: 4, width: 32, height: 24 }, { width: 160, height: 200 }, { x: 0, y: 0, width: 900, height: 500 }, BELOW_LEFT);
console.log(menu.rect.x + menu.rect.width <= 900, menu.slid.x || menu.flipped.x); // true true: it stays inside the window
```

## Root (`@n-uf/placement`)

The shapes (`Rect`, `Size`, `Point`: a rect is a top-left corner and a size, in whatever px the consumer lays out in,
the same shape as `@n-uf/motion`'s) and the geometry every entry shares: `rect`, `overlap`, `clampInto`, `center`,
`EPS`, `PLANE`, `area`, `overlaps`, `contains`, `clamp` and `subtract` (a rect less another, as disjoint rects).

Two words for direction, declared once here: `Side` (`"top" | "right" | "bottom" | "left"`: a side of a stage or a
pane) and `Axis` (`"x" | "y"`: `"x"` runs left to right, `"y"` top to bottom). `EdgeBand.side`, `MasterOptions.side`,
`PaneRegion`, `PANE_SIDES`, a split's `axis` and the `axis` the `SplitOptions` callbacks take are these types, and
`@n-uf/docking` re-exports both from its root; a narrower set is written in terms of `Side`
(`Extract<Side, "left" | "right">`). There is no `BandSide` or `PaneSide`: they were `Side` under other names.

The `Target` type (a drop target's shape, as `@n-uf/motion/drag` takes it) is exported here too, with its optional
`hits` (every piece of a zone that isn't one rect; `hit` is the largest). The pick's rank, `pickRank` with
`REFUSAL_RANK` (a refusal ranks after every priority 1 and 2 target and before priority 3; lower wins), is
`@n-uf/motion/drag`'s alone: this package no longer exports it. A `Target` is `id`, `priority`, `hit`, `hits`, `slot`,
`label`, `free`, `refuse` (a refusal; the pick ranks it) and `bounds` (the drawn space a zone belongs to), and nothing
else: it carries no time and no timing. The fields a drag intent reads for a spring-loaded target (`arm: "dwell"`,
`armedHit`) and for a room that opens as a target shows (`opensRoom`, `roomHold` in ms, `roomHit`) are not placement's:
`@n-uf/docking`'s `DockDrop` sets them, and `@n-uf/motion/drag`'s `DragTarget` reads them. This package reads none of
these fields; `stackGaps` and the tiling targets set none.
