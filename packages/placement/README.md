# @n-uf/placement

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/placement is young and still changing. Its API (the desk constructions, the panel columns, the toolbar model and the drop targets) is not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md) before you upgrade.

Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

Where things go. State in, rects and drop targets out: a desk of docks, rails and palettes, panels in columns per
side that give way by age, toolbar groups in hosts and zones, and the drop targets for each. A tiling entry (a split
tree with ratios, groups and workspaces) is planned. Pure functions over plain data: no DOM, no framework, no
motion, no dependencies.

```sh
npm i @n-uf/placement
```

Its sibling [`@n-uf/motion`](https://www.npmjs.com/package/@n-uf/motion) owns how things move. The two compose
without importing each other: a target list from `@n-uf/placement/targets` is exactly what
`@n-uf/motion/drag`'s drag intent takes, and a rect from any layout here is what `@n-uf/motion/layout` glides to.

- **`@n-uf/placement`**: the shapes (`Rect`, `Size`, `Point`) and a popup positioner, as Wayland's xdg-positioner: an anchor
  point, gravity and offset, then flip, slide and resize, each only when the rule allows it.
- **`/dock`**: a desk of documents and tool panels. Side docks and a bottom dock (between the side docks or across
  the full width), rails, natural-height sections whose last one takes the rest, fold and unfold, the give-way
  rules (sections fold least recently used first, docks fold to their rails), floating palettes with corner stacks,
  tear-off and dock-back; and nine constructions built from these parts, as presets (`createDesk`).
- **`/toolbar`**: toolbar groups in five hosts (title, top, bottom, left, right) and three zones (start, centre,
  end), floating groups, insertion points (before all, between, after all, an empty zone), collapse when a host
  runs out of room (lowest keep first, trailing groups first among equal keeps), and "own place is home".
- **`/targets`**: drop targets (`{ id, priority, hit, slot?, label?, free? }`) for the desk's constructions,
  toolbar hosts (each with its `slot`, and `allows` to leave out places a group may not take) and pane zones; and
  `keyboardStops`, one ordered list of places for the arrow keys and a "Move to" menu.
- **`/panels`**: tool panels with string ids: full-height columns per side, each with its own width, shown as a
  stack of sections or as tabs; folding to a title bar or a rail; give-way by age when the pages run out of room (and,
  opt-in, when a column runs out of height); resizable floats, some pinned to the view; opt-in top and bottom bands;
  room kept clear for a toolbar the app draws; their drop targets; and a stored form.
- **`/desk`**: desk presets (`docks`, `docksFull`, `dockTear`, `navigator`) as data on `/panels`: options and a
  start state.
- **`/stack`**: the items along one edge, a column or a bar, each a panel or a control group with forms from largest to
  smallest (open, header, rail icon, » menu; row, stacked, icons, fold, » menu): one form and rect per item, giving
  way by age and `rank`, only to a form that is shorter, spare room to the panels that grow, a rail when nothing open
  sets the width, `gap` and `pad` in the length; a drop target for every gap, each with the exact solve a drop makes; a
  stored form; and floats (an item above the pages, in the stage's own px, kept inside the stage and clear of the docked
  items, with its drop target and stored form). Not tied to `/panels`.

Rendering stays in the app: it draws the rects, measures its groups, and feeds pointer samples to a drag intent.

## A desk

```ts
import { DEFAULT_OPTIONS, createDesk } from "@n-uf/placement/dock";

const desk = createDesk({
  panels: [
    { id: 1, title: "Files", natural: 160 },
    { id: 2, title: "Outline", natural: 200 },
    { id: 3, title: "History", natural: 160 },
  ],
  start: { left: [1, 2], right: [], bottom: [3] },
});
const docks = desk.constructionOf("docks");
const { items, notes } = docks.layout(docks.initial([1, 2]), { width: 960, height: 420 }, DEFAULT_OPTIONS);
console.log(items.get("panel:3")!.look, notes.map((n) => n.code)); // header [ 'bottom-folded' ]
```

Each construction is `{ id, title, idea, initial(docs, size?), layout(state, size, options) }`. A layout returns a
`Placed` per item (its rect, look, layer, and whether it is hidden, has a minimum or may scroll off the stage) and
notes saying how it gave way. A note's `code` (with its `side` and `items` where they apply) is the contract; its
`text` is English for people, and its wording may change in any release. The codes (`NoteCode`):

| Code | Says | Also |
|---|---|---|
| `bottom-folded` | the bottom dock folded to its header | |
| `dock-folded` | a side dock folded to its rail | `side` |
| `sections-folded` | sections folded to their headers by themselves, least recently used first | |
| `torn-floating` | panels torn off a dock float | `items` |
| `torn-shaded` | some torn-off panels shade because they don't fit | |
| `columns-railed` | the tiling tree's side columns folded to rails | `side` when only one |
| `tiles-float` | tiles that broke a minimum float, newest first | `items` |
| `tabs-folded` | a tabbed side folded to icon tabs | `side` |
| `drawer-over` | a drawer slides over the documents | `side` |
| `column-split` | a strip column split in two | `items` |
| `strip-scrolls` | the strip is wider than the stage | |
| `stacks-merged` | both palette stacks share one corner | |
| `palettes-shaded` | palettes shaded to their title bars | |
| `palettes-cover` | how much of the documents the palettes cover | |
| `docs-room` | how much room the palettes leave the documents | |

## Toolbar groups

```ts
import { arrangement, layoutHost } from "@n-uf/placement/toolbar";

const a = arrangement({ top: { start: ["file", "edit"], end: ["share"] } });
const size = (_id: string, _vertical: boolean, collapsed: boolean) => ({ along: collapsed ? 30 : 120, across: 28 });
const top = layoutHost(a.top, "top", { length: 320, thickness: 34, lead: 8, tail: 8 }, size);
console.log(top.overflow); // [ 'share' ]

// A primary group keeps its full form longest: a higher keep folds later (equal keeps fold from the trailing end).
const kept = layoutHost(a.top, "top", { length: 320, thickness: 34, lead: 8, tail: 8, keep: { share: 1 } }, size);
console.log(kept.overflow); // [ 'edit' ]
```

An arrangement is stored as versioned plain data; reading it back never throws:

```ts
import { arrangement, readArrangement, storeArrangement } from "@n-uf/placement/toolbar";

const saved = JSON.stringify(storeArrangement(arrangement({ top: { start: ["file", "edit"] } }))); // { "v": 1, "hosts": … }
console.log(readArrangement(JSON.parse(saved)).ok); // true
console.log(readArrangement({ v: 9 })); // { ok: false, error: 'unknown version 9 (this reads version 1)' }
```

`readArrangement` takes parsed data, not the string. It accepts an arrangement that lacks some of your groups (one
stored before you added a group, say): place each missing group yourself, with `resetGroup(read, group, defaults)`
to put it where your default arrangement has it, or `dockGroup` for a group that floated.

## Drop targets

```ts
import { DEFAULT_OPTIONS, createDesk, liftOut } from "@n-uf/placement/dock";
import { deskDrop, deskTargets } from "@n-uf/placement/targets";

const desk = createDesk({
  panels: [{ id: 1, title: "Files", natural: 160 }, { id: 2, title: "Outline", natural: 200 }],
  start: { left: [1, 2], right: [], bottom: [] },
});
const c = desk.constructionOf("dockTear");
const key = "panel:2";
const input = { c, s0: liftOut(c.initial([1]), key), key, size: { width: 1200, height: 700 }, opt: DEFAULT_OPTIONS };
const targets = deskTargets(input); // hand these to @n-uf/motion/drag's createDragIntent
const float = targets.find((t) => t.id === "float")!;
const drop = deskDrop(input, float, { x: 600, y: 300 }, { x: 20, y: 10 });
console.log(drop.label, drop.slot.x, drop.slot.y); // Float here 580 290
```

A toolbar group's targets come from `hostTargets` (a host's lines and empty zones, with its own place left out and
returned as `own`, for the drag's home) and `floatTarget`. Each host target carries its `slot`, the group's rect
once it lands there; `allows(group, place)` leaves out places a group may not go (its `place.index` counts the
groups there without the dragged one, as `insertGroup` does). The same rule says whether a group may float: add
`floatTarget` only when `allows(group, "float")`. `keyboardStops` puts the targets in reading order (title, top,
left, right, bottom; start, centre, end) for the arrow keys and a "Move to" menu, with the group's own place as
`home`:

```ts
import { floatTarget, hostTargets, keyboardStops } from "@n-uf/placement/targets";
import { arrangement, hostOf, type Place } from "@n-uf/placement/toolbar";

const a = arrangement({ top: { start: ["file", "edit"], end: ["share"] } });
const size = (_id: string, _vertical: boolean, collapsed: boolean) => ({ along: collapsed ? 30 : 120, across: 28 });
const allows = (g: string, place: Place | "float") => g !== "share" || (place !== "float" && place.host === "top"); // share stays in the top bar
const top = { origin: { x: 0, y: 40 }, spec: { length: 800, thickness: 34, lead: 8, tail: 8 } };
const { targets } = hostTargets({ group: "share", arrangement: a, host: "top", ...top, size, allows });
console.log(targets[0]!.slot); // { x: 8, y: 43, width: 120, height: 28 }
// Floating, by the same rule: share may not float, so it gets no float target.
const stage = { x: 0, y: 80, width: 800, height: 500 };
const all = [...targets, ...(allows("share", "float") ? [floatTarget({ group: "share", arrangement: a, stage, width: 120, height: 28 })] : [])];
console.log(all.length === targets.length); // true
const stops = keyboardStops(targets, { home: { place: hostOf(a, "share")!, arrangement: a } });
console.log(stops.map((s) => (s.home ? "home" : s.id))); // [ 'g:top:start:0', 'g:top:start:1', 'g:top:start:2', 'g:top:center:0', 'home' ]
```

## Panels

`@n-uf/placement/panels` lays out tool panels the way an app's side columns work: each side holds full-height
columns from the outer edge inward, each column one or more panels and its own width (clamped to its panels'
`min` and `max`). A panel folded by hand is a title bar; a column whose panels are all folded becomes segments of
its side's rail, or with `fold: "ride"` bars on the side's first open column. Panels may float instead, in page space
(they move with the page's offset and scale) or pinned to the view; a folded float is a title bar where it floats, and
a folded panel torn off stays folded. The output is geometry and structure only: each panel's rect, layer, `kind`
(`column`, `bar`, `segment`, `float`; a folded float is a `bar`) and its folded, kept, pinned, floating and rides
flags, the columns, the rails, the pages' rect and coded notes. Chrome sizes
(`bar`, `rail`, `segment`) are options.

```ts
import { createPanels, keep, layoutPanels, readPanels, storePanels, type PanelDef } from "@n-uf/placement/panels";

const defs: PanelDef[] = [
  { id: "files", width: { min: 180, natural: 220, max: 360 } },
  { id: "outline", width: { min: 160, natural: 200, max: 320 } },
  { id: "notes", width: { min: 200, natural: 260, max: 420 } },
];
// Files was used first, so it is the oldest.
const state = createPanels(defs, { left: [["files"], ["outline"]], right: [["notes"]] });
const narrow = layoutPanels(defs, state, { width: 780, height: 600 });
console.log(narrow.notes.map((n) => n.code), narrow.items.get("files")!.kind); // [ 'column-shrunk', 'column-folded' ] segment
const kept = layoutPanels(defs, keep(state, "files", true), { width: 780, height: 600 });
console.log(kept.items.get("files")!.kind, kept.items.get("outline")!.kind); // column segment
const read = readPanels(JSON.parse(JSON.stringify(storePanels(state))), defs);
console.log(read.ok); // true
```

**Give-way** (`options.giveWay`, default `{ order: "oldest", by: "used" }`): when the open columns, the rails and
`pagesMin` (default 320) don't fit the stage width, columns shrink toward their `min`, then whole columns fold to the
rail, in the policy's order, until the pages fit. A column's age is its newest panel's (`used` counts opening,
focusing, moving, resizing and unfolding; `opened` only opening). Ties go to the outer column, then the left side.
Every column shrinks before any folds; then the unkept columns fold before any column holding a kept panel
(`keep(state, id, true)`), each group in the policy's order across both sides. When only kept columns are left and the
pages still don't fit, they fold too. Give-way never writes `folded`, so widening the stage brings a column back.

**Floats** (`options.floats`, default `"clamp"`): a float that fits the view stays wholly inside it; one that doesn't
even at its minimum size keeps its title bar and `floatVisible` (default 48) px of its width in the view. A float's
size is screen px and never scales. A pinned float is clamped where it is; an unpinned one has its page-space position
clamped so that its screen rect at pan 0 fits the view, so it still scrolls with the page. The clamp runs at layout
time and the state keeps the stored rect, so a larger view brings a float back where it was. `"free"` never moves a
float. A float folded by hand (`toggleFold`) lays out as a title bar: `kind` `"bar"`, `folded` `"hand"`, at its own x,
y and width and `options.bar` tall, clamped as a bar. It is still a float (`floating: true`) to its targets and drags,
pinned or not, and unfolding brings its full rect back: the stored rect never changes.

**Folded columns** (`options.fold`, default `"rail"`): a column folded by hand goes to its side's rail. With `"ride"`,
it rides instead while its side still has an open column: its panels become title bars (`kind` `"bar"`, `rides`: the
host's index) stacked in column order on top of the side's first open column (outer edge first), as wide as it, and
the host's open panels share the rest of the height. The open columns lie as if the folded one were gone (the pages
gain its room), and its stored place and width are untouched, so unfolding puts it back as its own column. Only when
every column on a side is folded does the side show its rail. Give-way's folds (`column-folded`, `kept-folded`) go to
the rail in both modes.

**Tabs**: a column with `show: "tabs"` shows one panel at a time, its `active` one (default, or when `active` isn't
one of them: the first panel in the column that isn't closed), under a strip
`options.tabs` tall (default 28). The strip is `PlacedColumn.strip`, and each panel's `tab` is its header's rect in it
(panel order, equal widths); the others are `hidden`. A tabbed column folds as a whole: with its active panel in
`folded` it shows only its strip (the active panel is a `"bar"` there); with every panel folded it goes to the rail,
or rides, as a stack column does. `showTabs(state, side, index, on)` switches a column; `activate(state, id)` shows a
tab and counts as a use. A drop `into` a tabbed column adds a tab at the end and shows it, and `open` on a panel in a
tabbed column shows its tab too.

**Section heights** (opt-in): a `PanelDef.height` (`{ min, natural }`) gives a section of a stack column its natural
height; the column's last open section takes the rest, never under its min, and sections without one share what is
left equally, never under a bar's height (`options.bar`). The others' natural heights give way toward their mins
first. When the open sections' mins and the bars still don't fit, open sections fold to bars by the give-way policy
(kept last, never the last open one, and never one whose min is no more than a bar, since folding it gains nothing),
each with a `section-folded` note; that never writes `folded`, so a taller stage unfolds them. Columns without
`height` defs lay out as before.

**Changes** are pure: `open`, `close`, `focus`, `toggleFold`, `keep`, `dock(state, id, side, index, { into?, at?, width? })` (`at` with `into`: before that member, else at the bottom),
`float`, `pin(state, id, on, view?, shown?)` (pass the layout's rect as `shown` so a clamped float pins where it
shows), `resizeColumn`, `resizeFloat`, `showTabs`, `activate`, and for bands `dockBand`, `resizeBand`.

### Bands

A band is a horizontal dock along the stage's top or bottom edge (opt-in: `options.bands`, default none). Its panels
sit side by side, left to right, and share its width equally; it has one stored height, clamped to its panels' limits
(`PanelDef.band`, default `BAND_SIZE`: min 120, max 480, natural 200; the largest min and the smallest max win, as a
column's width does). Each enabled edge says how its band lies:

- `mode: "reserved"` shortens the pages; `"overlay"` lies over the pages' upper or lower part (layer 5, over columns'
  layer 0 and under floats) and leaves the pages' rect as it is.
- `span: "full"` takes its height from the stage first, across the whole width, and the columns and rails stand on it
  (or hang from it); `"between"` runs between the innermost open column (or rail) on each side.

A band's open panels are `kind` `"band"` (with `edge` and `index`); `layout.bands` has each band as laid out
(`PlacedBand`: `rect`, `height`, `min`, `max`, `folded`, `shrunk`, `kept`, `mode`, `span`, `panels`). It folds as a
whole: `toggleFold` on any of its panels folds or unfolds them all, and a folded band is one bar, `options.bar` tall,
each panel a `"bar"` side by side. `keep` works on band panels.

**Height give-way**: when the pages would be shorter than `pagesMinHeight` (default 240; counted after the top and
bottom reserves), reserved bands shrink toward their min, then fold to a bar, unkept before kept, in the give-way
policy's order, bottom before top on a tie (`band-shrunk`, `band-folded`, or `kept-folded` with `edge`); they leave the
pages room for the overlay bands' bars at least. Then the overlay bands give way the same way, together, until they leave
`pagesMinHeight` of the pages uncovered, so a top and a bottom one never meet. Give-way never writes `folded`, so a
taller stage brings a band back. If the pages' rect is still under the min: `pages-short` (overlay bands don't change
the pages' rect, so they never cause it; how far one covers the pages is its own `band-shrunk` or `band-folded`).
Columns never give way by height to a band.

`dockBand(state, id, edge, index, defs?)` puts a panel into a band (0 the leftmost, past the end the rightmost; a new
band takes the panel's natural band height); `open(state, id, { edge, height? })` puts a panel placed nowhere at a
band's right end; `liftPanel`, `dock` and `float` take a panel out, and an emptied band goes from the state.
`createPanels` takes `top` and `bottom` (the clock counts left, right, top, bottom, floats). A band in the state on an
edge the options don't enable is left out of `items` (`band-off`). A def's `sides` may name edges: without `sides` a
panel may go to every enabled edge; with them, only where they say. The drop targets add `band:<edge>:<i>` (the slots
at a band's ends and between its panels, the band split at its panels' middles) and, on an empty enabled edge,
`band:<edge>` (a strip `2 × bar` tall along it inside the pages); a drop's `slot` is the panel's share of the band.

```ts
import { createPanels, layoutPanels, panelTargets, type PanelDef } from "@n-uf/placement/panels";

const defs: PanelDef[] = [
  { id: "files", width: { min: 180, natural: 220, max: 360 } },
  { id: "history", width: { min: 200, natural: 240, max: 360 }, band: { min: 100, max: 400, natural: 180 } },
];
const state = createPanels(defs, { left: [["files"]], bottom: ["history"] });
const options = { bands: { bottom: { mode: "reserved", span: "between" } } } as const;
const tall = layoutPanels(defs, state, { width: 1200, height: 700 }, options);
console.log(tall.bands.bottom!.rect, tall.pages); // { x: 220, y: 520, width: 980, height: 180 } { x: 220, y: 0, width: 980, height: 520 }
const short = layoutPanels(defs, state, { width: 1200, height: 300 }, options);
console.log(short.notes.map((n) => n.code), short.items.get("history")!.kind); // [ 'band-folded' ] bar
const targets = panelTargets({ defs, state, id: "files", stage: { width: 1200, height: 700 }, options });
console.log(targets.filter((t) => t.place.kind === "band").map((t) => t.id)); // [ 'band:bottom:0', 'band:bottom:1' ]
```

### Reserved room

`options.reserve` (`{ top?, right?, bottom?, left? }`, px, default none) keeps room clear along the pages' edges for a
toolbar the app draws; `./toolbar` stays the toolbar's model, and placement neither draws nor names it. The reserve
comes off the pages' area after the columns and bands: `layout.reserved.top` is the pages' full width and `reserve.top`
tall at their top (bottom likewise), and the left and right reserves are as tall as what the top and bottom reserves
(and overlay bands) leave. `pagesMin` counts after the left and right reserves, `pagesMinHeight` after the top and
bottom ones; a reserve never shrinks or folds. An overlay band lies next to the reserve on its edge, on the pages' side, never over it.

```ts
// The defs and state above; without band options the band is off (a `band-off` note).
const l = layoutPanels(defs, state, { width: 1200, height: 700 }, { reserve: { top: 40 } });
console.log(l.reserved.top, l.pages); // { x: 220, y: 0, width: 980, height: 40 } { x: 220, y: 40, width: 980, height: 660 }
```

Without band options, no `bands` in the state and no reserve, every layout, target and note is what it was before
bands.

**Drop targets**: `panelTargets({ defs, state, id, stage, options?, allows? })` gives `column:<side>:<i>` (a new
column as wide as the panel's own width), `into:<side>:<i>` (stack into a column), `rail:<side>` (dock folded) and
`float` (free), in the shape `@n-uf/motion/drag`'s `createDragIntent` takes. Each carries a structured `place`, not
words. A place the panel may not take (its def's `sides` and `floats`, or `allows`) and its own place are no targets.
`panelDrop(input, target, point, grab)` lays out the drop: its `slot` is where the panel lands. `keyboardStops` from
`@n-uf/placement/targets` puts panel targets in reading order, with `homePlace(state, id)` as `home`:

```ts
import { createPanels, homePlace, panelDrop, panelTargets, type PanelDef } from "@n-uf/placement/panels";
import { keyboardStops } from "@n-uf/placement/targets";

const defs: PanelDef[] = [
  { id: "files", width: { min: 180, natural: 220, max: 360 } },
  { id: "outline", width: { min: 160, natural: 200, max: 320 }, floats: false },
];
const state = createPanels(defs, { left: [["files"], ["outline"]] });
const input = { defs, state, id: "outline", stage: { width: 1200, height: 600 } };
const targets = panelTargets(input); // hand these to createDragIntent
console.log(targets.map((t) => t.id)); // [ 'rail:left', 'column:left:0', 'into:left:0', 'column:right:0', 'rail:right' ]
const drop = panelDrop(input, targets[3]!, { x: 1190, y: 300 }, { x: 0, y: 0 });
console.log(drop.slot); // { x: 1000, y: 0, width: 200, height: 600 }
const stops = keyboardStops(targets, { home: { place: homePlace(state, "outline")!, state } });
console.log(stops.map((s) => (s.home ? "home" : s.id))); // [ 'rail:left', 'column:left:0', 'into:left:0', 'home', 'column:right:0', 'rail:right' ]
```

**Into a stack at a position** (opt-in): with `stackSlots: true` in the input, a stacked column offers
`into:<side>:<i>:<k>` before each member k as well as `into:<side>:<i>` at its bottom. The column's area is split at
its members' middles, and each of these targets carries a `marker`: the line where the panel's top lands after the
drop (the column re-shares its height, so `marker` comes from the drop's layout), zero tall and as wide as the column,
for the app to draw; `panelDrop(...).slot` is the whole rect. Its `place` is `{ kind: "into", side, index, at }` (`at`
left out for the bottom), and a drop calls `dock(…, { into: true, at })`. `at` counts closed members, which keep their
place in the column's list; only members shown get slots. A tabbed column keeps its one `into` target.
`homePlace(state, id, { stackSlots: true })` says a stacked panel's position as `at`, so `keyboardStops` puts home
among the column's slots. Without `stackSlots` the targets are exactly as before.

`storePanels(state)` gives `{ v: 1, sides, floats, folded, kept, closed, clock }`; `readPanels(data, defs?)` reads
parsed data back and never throws. Anything but an object of version 1 is `{ ok: false, error }`; inside one, unknown
or repeated ids and malformed entries are dropped and listed in `dropped`, and widths and float sizes are clamped to
the defs. Version 1 only gains optional fields: a field this reader doesn't know is skipped and listed in `dropped`
too (`"theme"`, `"sides.bottom"`, `"column.<field>"`, `"float.<field>"`, `"clock.<id>"`). A column's `show` and
`active` are carried; an `active` that isn't one of the column's panels is dropped as `"column.active:<id>"`. `bands`
is carried too, only when the state has one: an unknown edge is dropped as `"bands.<key>"`, a band without a panels
list or a numeric height (or whose panels are all dropped) as `"bands.<edge>"`, an unknown field in one as
`"band.<field>"`, and heights are clamped to the defs. The note codes (`PanelsNoteCode`):

| Code | Says | Also |
|---|---|---|
| `column-shrunk` | a column narrowed toward its minimum | `side`, `column`, `items`, `from`, `to` |
| `column-folded` | a column folded to its side's rail | `side`, `column`, `items` |
| `kept-folded` | a kept column folded: the pages needed the room | `side`, `column`, `items` |
| `section-folded` | a section of a stack column folded to a bar: the column was short | `side`, `column`, `items` |
| `pages-under-min` | the pages are under `pagesMin` with every column folded | `width`, `min` |
| `float-resized` | a float shrank to fit the view | `items` |
| `float-clamped` | a float moved to stay in the view | `items` |
| `band-shrunk` | a band lowered toward its min: the pages needed the height | `edge`, `items`, `from`, `to` |
| `band-folded` | a band folded to a bar: the pages needed the height | `edge`, `items` |
| `kept-folded` | (on a band) a kept band folded, last | `edge`, `items` |
| `band-off` | a band on an edge the options don't enable: its panels aren't laid out | `edge`, `items` |
| `pages-short` | the pages' rect is under `pagesMinHeight` with every reserved band folded (or by the reserves alone) | `height`, `min` |

## Desk presets

`@n-uf/placement/desk` holds desk presets as data on `./panels`: each is panels options and a start state. It imports
only the panels entry, carries no titles or words and wires no toolbar; the app names the presets and draws them.

| Preset | Columns, bands and floats |
|---|---|
| `docks` | one stack column per side, sections at their natural heights when the defs give `height`, folding to the rail; a bottom band between the columns (reserved), folding to a bar on a short stage; no floats |
| `docksFull` | as `docks`, with the bottom band full width: the columns stand on it |
| `dockTear` | as `docks` (with its bottom band), and panels may float (tear-off and dock-back); one panel floats at the start |
| `navigator` | a tabbed column on the left, a stack column on the right; no band, no floats |

The bottom band starts with the hint's `bottom` panels (`start(defs, { bottom: [...] })`), else with the last def whose
`sides` names `"bottom"`; a def without `sides` may be dropped into the band but doesn't start there. `presetTargets`
and `presetDrop` include the band's targets.

```ts
import { PRESETS, presetLayout, presetTargets } from "@n-uf/placement/desk";
import type { PanelDef } from "@n-uf/placement/panels";

const defs: PanelDef[] = [
  { id: "files", width: { min: 200, natural: 240, max: 360 }, height: { min: 80, natural: 160 } },
  { id: "outline", width: { min: 200, natural: 240, max: 360 }, height: { min: 80, natural: 200 } },
  { id: "history", width: { min: 200, natural: 240, max: 360 } },
];
const nav = PRESETS.navigator;
const state = nav.start(defs, { left: ["files", "outline"] });
const layout = presetLayout(nav, defs, state, { width: 1200, height: 600 });
console.log(layout.columns[0]!.strip, layout.items.get("outline")!.hidden); // { x: 0, y: 0, width: 240, height: 28 } true
const targets = presetTargets(nav, { defs, state, id: "history", stage: { width: 1200, height: 600 } });
console.log(targets.some((t) => t.id === "float")); // false
```

`presetLayout(preset, defs, state, stage, options?)` is `layoutPanels` with the preset's options under the caller's;
`presetTargets(preset, input)` and `presetDrop(preset, input, target, point, grab)` are `panelTargets` and `panelDrop`
the same way, offering only the places the preset allows (`presetInput` gives that input). `./dock` stays as it is for
now.

## Edge stacks

`@n-uf/placement/stack` lays out the items along one edge of a stage: a column (`axis: "column"`, a side region) or a
row (`"row"`, a bar). An item is a panel or a control group and declares its forms, largest first. Each form has a
structural `kind` (a panel's `open`, `header`, `rail`, `menu`; a group's `row`, `stacked`, `icons`, `fold`, `menu`), a `main`
size along the stack (`min`, `natural`, `grows`) and a `cross` size. `fitStack(input)` picks one form per item and
places them; it is not tied to `./panels` columns, and nothing in it is a word.

- Every item starts in its largest form, or at `from` (an index into its forms; a panel the user folded by hand
  starts at its header). While the smallest sizes don't fit the `length`, one item takes a smaller form: the step into
  the lowest `rank` (below), and among equals the item used longest ago (`used`: the smaller, the older), unkept
  before `kept`, the later in the stack first on a tie. A `menu` form takes no room: the » entry does (`menu.main`,
  default 28 px), while any item is in it.
- A give-way step goes only to a later form that shortens the stack: its `main.min` is smaller, counting the » entry
  when the form is the menu and the gaps gained or lost. A form that doesn't (the same length, or longer) is skipped,
  and an item with none stays; when no item can give more way and the stack is still too long, `overflow` says by how
  much. The first item into the menu opens the » entry, so one shorter than the entry (a 24 px icon, a 28 px entry)
  can't go in alone: the items stuck that way go in together, in give-way order, as few as shorten the stack (two
  icons, 48 px, for one entry, 28 px); each item after that saves its whole size. If all of them together don't beat
  the entry, they stay.
- `StackForm.rank` (default 0) orders the steps: the lowest rank of the form an item would step into goes first, then
  unkept before kept, then the oldest, then the later in the stack. Give a pinned primary's last forms a higher rank
  and every other group gives way before it does.
- `gap` is the space between neighbouring drawn items (the » entry is a neighbour) and `pad` (`{ start, end }`) the
  space before the first item and after the last (or the » entry). Both count toward the length and every rect
  includes them, so an app draws at the solver's rects and the preview is exact. A non-number or a negative one is 0.
- Spare length goes to the forms that `grows`, shared by their natural sizes. With none, the items keep their
  natural sizes from the start of the stack.
- The stack's cross size is the widest `cross.natural` among the forms that set it (a panel's `open`, by default;
  `setsCross` overrides), clamped to `cross.min` and `max`. With none it is the rail, `cross.rail` (default 30 px).
- Cross-fit: a form that doesn't set the cross size and whose `cross.min` (default its `natural`) is over the stack's
  takes its next form, so a group alone is a rail of icons and a column with nothing open shrinks to a rail. Give a
  header a small `cross.min` and it stays in a column an open panel made narrower. Cross size never puts an item in
  the menu: an item that is still too wide in its last drawn form keeps it, and `too-wide` says so (the app clips it).
  Cross-fit and give-way repeat until nothing changes, because a panel folding can narrow the column.
- A form that does set the cross size steps down too when its `cross.min` (default its `natural`) is over the limits'
  `max`: in a top bar with `cross.max` 40, an open panel that needs 120 across becomes a header instead of being
  squeezed to 40. Give a form a `cross.min` it can live with and it is only clamped.
- The solver has no open or closed state: it lays out the items it is given. An item with no forms is left out
  (`no-forms`). Panel and group kinds may be mixed on one item; only `menu` and `open` mean anything to the solver.

```ts
import { fitStack, readStack, stackTargets, storeStack, type StackForm, type StackItem } from "@n-uf/placement/stack";

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

`stackTargets(input, dragged)` takes the stack (an item of it with the dragged id is lifted out first, so a reorder
within a stack works) and gives a target for every gap, before each item and after the last, in the shape
`@n-uf/motion/drag` takes: `id` `gap:<k>`, priority 2, `place` `{ kind: "gap", at: k }`, `hit` (the stack split at
its items' middles, so it covers the gap and padding between its neighbours, as wide across as the larger of the
stack and the drop's fit; with every item in the menu only the last gap has any length) and `slot`, the rect the
dragged item gets.
`fit` is the full solve with the item inserted at k (`input` the stack that was solved), so the preview is exactly the
rect after the drop; `marker` is the line where the item's leading edge lands (a rect with no thickness, the stack's
cross size long). The dragged item counts as just used, so the others give way before it, and a group lands in the form
that fits. A third argument, `{ endReach }`, makes the first gap's hit reach that many px before the stack's start
and the last gap's past its end (default 0), so a pointer just outside a bar still drops at an end.

```ts
const targets = stackTargets({ ...column, items: [panel("pages", 1), panel("findings", 2)] }, tools);
console.log(targets.map((t) => t.id), targets[1]!.slot, targets[1]!.fit.items[1]!.kind);
// [ 'gap:0', 'gap:1', 'gap:2' ] { x: 0, y: 28, width: 240, height: 96 } row (Pages folds to its header to make room)
```

### A toolbar's rows

A top bar of control groups uses the same solver, with a few more things it can say:

- A group's `fold` form is its handle with its own » in line: it keeps its place in the stack and takes its own `main`
  length. The shared » entry (`menu`) stays a later step: give the `menu` form a higher `rank` than the folds, or
  an older group may go into it before a newer one folds.
- `rank`, `gap`, `pad`, `cross.max` and `endReach` as above. The kit draws every group at the solver's rect, so there
  is nothing to measure and the drop preview is exact.
- Hysteresis is not here: a pointer that flickers between two gaps is `@n-uf/motion/drag`'s to calm (the intent's
  band, and `placeOf` with `previous`), and `stackTargets` only says where the gaps are.

```ts
const group = (id: string, used: number): StackItem => ({ id, used, forms: [form("row", 100, 100, 26), form("fold", 36, 36, 26), form("menu", 0, 0, 0)] });
const bar = { axis: "row", length: 330, cross: { min: 36, max: 40 }, gap: 8, pad: { start: 12, end: 12 }, items: [group("views", 1), group("tools", 2), group("zoom", 3)] } as const;

const row = fitStack(bar);
console.log(row.items.map((p) => [p.kind, p.rect.x, p.rect.width]));
// [ [ 'fold', 12, 36 ], [ 'row', 56, 100 ], [ 'row', 164, 100 ] ] (three rows need 340: Views, the oldest, folds)

const gaps = stackTargets(bar, group("marks", 4), { endReach: 24 });
console.log(gaps.map((t) => [t.hit.x, t.hit.x + t.hit.width]));
// [ [ -24, 30 ], [ 30, 106 ], [ 106, 214 ], [ 214, 354 ] ] (split at the groups' middles; the ends reach 24 px past the bar)
```

`storeStack(state)` and `readStack(data, known?)` keep what the user chose, as `{ v: 1, … }`: `order`, `kept`,
`closed`, `used` (the use order, oldest first, so a reload restores who gives way first) and `forms` (the largest form
index each item may take, `StackItem.from`; stored only from 1). Reading never throws: anything but an object of
version 1 is `{ ok: false, error }`; inside one, an id that isn't a string, repeats or (with `known`) isn't one the
consumer has, a `kept`, `closed`, `used` or `forms` entry for an item not in `order`, a form that isn't a whole number
from 1, the key `__proto__` in `forms` (`forms` is an object with no prototype; `constructor` and `prototype` are ids
like any other), and a field this version doesn't know are dropped and listed in `dropped`. An id listed twice in
`used` counts at its last place (the newest use wins).

```ts
const saved = JSON.stringify(storeStack({ order: ["pages", "tools"], kept: ["pages"], closed: [], used: ["pages", "tools"], forms: { tools: 1 } }));
console.log(saved); // {"v":1,"order":["pages","tools"],"kept":["pages"],"closed":[],"used":["pages","tools"],"forms":{"tools":1}}
console.log(readStack(JSON.parse(saved), ["pages", "tools", "findings"]).ok, readStack({ v: 2 }).ok); // true false
```

### Floats

An item that isn't docked is a float. It lies above the pages in the stage's own px (view space), so the pages scrolling
under it never move it, and it has no pinned flag: there is one kind of float, `{ id, rect }`. `./stack` keeps floats
apart from the stacks (an item is in a stack's order or in the floats, the app's choice) and offers three parts, all
pure.

- `fitFloat(rect, stage, avoid?)` gives the rect a float gets: moved (never resized) to lie inside the `stage`, then
  beside any of the `avoid` rects (the docked items' rects, and the » entries', in the same px) it would cover, at the
  nearest place that is clear and inside the stage. A float larger than the stage keeps its top-left corner on the
  stage's. A clear place is found whenever one exists, and then `covers` is empty. Only when the stage has no clear
  place for it, the float stays where it covers the least (among the 2,048 nearest candidate places) and `covers` lists
  the `avoid` indexes it still covers. `FloatFit`: `rect`, `clamped` (also true when a position that wasn't a number was
  replaced), `snapped`, `covers`, `searchCapped`. Fit the floats again whenever the stacks or the stage change: a stack
  that grew may lie under one.
  Cost: the candidate x's (every edge of the stage and of an `avoid` rect) are tried nearest first; for each, the
  stretches of y the rects block are merged and skipped, so no clear place is missed however many lie between, and the
  search stops when no later x can be nearer. Measured in a test run on a laptop: about 100 `avoid` rects 0.1 ms, 300
  a few ms even when no place is clear (6 ms median, 15 ms worst), 1,000 about 17 ms. A safety net stops the clear
  search after 3 million rect tests (thousands of rects) and sets `searchCapped`: the place found may then not be the
  nearest, or a clear place may exist that was not found. Keep `avoid` to the docked items, not to every pixel.
- `stackFloatTarget({ id, stage, size, avoid?, label? })` is a drop target in the shape `@n-uf/motion/drag` takes: `id`
  `float:<id>` (not `"float"`, which `./desk` uses) and `kind: "float"`, priority 3 (a stack's gaps, priority 2, win
  where they are), `free` (no room is made for it) and a `hit` that covers the whole plane, so a pointer past the
  stage's edge, above, below or beside it, still hits it and a float drop never cancels. `make(point, grab?)` is the one
  answer for the preview and the drop: the float's rect with the pointer at `point` holding it at `grab` (its offset in
  the float; default the middle), run through `fitFloat`. Draw `make(...).rect` as the preview, and land the float on
  the same call at the release. The intent lets a higher priority target take over from the current one only when the
  pointer is `breakthrough` px (4) inside it, so a gap zone thinner than 8 px (2 × the breakthrough) along either axis
  can never take over from the float target: give the gaps' `hit` at least that much room (the lab widens a thin
  stack's zone across, and the first and last gap's past the stack's ends).
- `storeFloats(floats)` and `readFloats(data, known?)`: `{ v: 1, floats: [{ id, x, y, width, height }] }`, in stacking
  order (the last is on top). It writes no `pinned`. `storeFloats` leaves out, silently, a float whose position isn't a
  finite number or whose size isn't over 0, and keeps the last readable entry of a repeated id (the one on top, at its
  own place in the order). Reading never throws: anything but an object of version 1 with a `floats` array is
  `{ ok: false, error }` (the version worded as the stack's reader words it, a string quoted); inside one, a float that
  isn't an object, has no string id, isn't one the consumer has (with `known`) or has a position that isn't a finite
  number or a size that isn't over 0 is dropped and listed in `dropped` as `float:<id>`; of a repeated id the last
  readable entry stays and the earlier ones are listed the same way; a field this version doesn't know is listed as
  `"<field>"` (a float's own as `float:<id>:<field>`). A `pinned` key, which an older store may have, is read and
  ignored: the float loads as a plain float, at the rect it was stored with, and `pinned:<id>` is listed.

```ts
import { fitFloat, readFloats, stackFloatTarget, storeFloats } from "@n-uf/placement/stack";

const stage = { x: 0, y: 0, width: 900, height: 500 };
const docked = [{ x: 0, y: 32, width: 240, height: 468 }]; // a column of docked items, in the stage's px

const fit = fitFloat({ x: 100, y: 200, width: 200, height: 150 }, stage, docked);
console.log(fit.rect, fit.snapped); // { x: 240, y: 200, width: 200, height: 150 } true

const target = stackFloatTarget({ id: "notes", stage, size: { width: 200, height: 150 }, avoid: docked });
const drop = target.make({ x: 500, y: -400 }, { x: 20, y: 10 }); // the pointer is above the stage
console.log(drop.rect, drop.fit.clamped); // { x: 480, y: 0, width: 200, height: 150 } true

console.log(JSON.stringify(storeFloats([{ id: "notes", rect: drop.rect }]))); // {"v":1,"floats":[{"id":"notes","x":480,"y":0,"width":200,"height":150}]}
const old = readFloats({ v: 1, floats: [{ id: "notes", x: 480, y: 0, width: 200, height: 150, pinned: true }] });
console.log(old.ok && old.dropped); // [ 'pinned:notes' ]
```

Freezing the layout needs nothing from the library: the freeze is the app's flag, and the app reads it once at the press.
A press on a grip while frozen (and Alt not held) never becomes a drag, so no target is built and nothing is dropped;
holding Alt shows the grips and everything works, a drag that began finishes. `fitStack` reads sizes, not what an item
says, so a count or a phase that leaves its forms' sizes alone moves no other item.

## Pane zones

`paneZone(rect, point, previous, options?)` says which of a pane's five zones a point is in: the centre rectangle
(34 % of each axis, at least 24 px) or one of four edge trapezoids. The previous zone holds for 6 px past its
boundary. It fits `@n-uf/motion/drag`'s `placeOf(target, point, previous)`: one target per pane, the zone as the
place, and a null place for a zone that takes no drop.

```ts
import { paneZone, type PaneZone } from "@n-uf/placement/targets";

const pane = { x: 0, y: 0, width: 200, height: 200 };
console.log(paneZone(pane, { x: 100, y: 100 }), paneZone(pane, { x: 190, y: 100 })); // center right
console.log(paneZone(pane, { x: 137, y: 100 }, "center")); // center: 3 px past the line, it holds

// As a placeOf: the pane's id and zone, none where this pane can't take a drop beside it.
const canSplit = false;
const placeOf = (t: { id: string; hit: typeof pane }, p: { x: number; y: number }, previous: string | null): string | null => {
  const zone = paneZone(t.hit, p, (previous?.split(":")[1] as PaneZone | undefined) ?? null);
  return zone === "center" || canSplit ? `${t.id}:${zone}` : null;
};
console.log(placeOf({ id: "a", hit: pane }, { x: 100, y: 100 }, null), placeOf({ id: "a", hit: pane }, { x: 10, y: 100 }, null)); // a:center null
```

## License

[PolyForm Perimeter 1.0.1](./LICENSE).
