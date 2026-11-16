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

- **`@n-uf/placement`**: the shapes (`Rect`, `Size`, `Point`), the geometry every entry shares, and a popup positioner,
  as Wayland's xdg-positioner: an anchor point, gravity and offset, then flip, slide and resize, each only when the
  rule allows it. The geometry is `rect`, `overlap`, `clampInto`, `centre`, `EPS`, `PLANE`, `area`, `overlaps`,
  `contains`, `clamp` and `subtract` (a rect less another, as disjoint rects), with the hit sizes `COLUMN_REACH` (22 px,
  each way of a column line) and `RAIL_EDGE` (10 px). The `Target` type (a drop target's shape, as
  `@n-uf/motion/drag` takes it) is exported here too, with its optional `hits` (every piece of a zone that isn't one
  rect; `hit` is the largest); `./targets` and `./panels` still export it and the hit sizes.
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
  sets the width, `gap` and `pad` in the length. It is the edge solver `/scene` lays each edge with. Its window-level
  parts (a drop target for every gap, a stored form, floats with their drop target and stored form) are
  **deprecated**: `/scene` owns the window and replaces each of them (see Edge stacks). Not tied to `/panels`.
- **`/scene`**: one model of a whole window, each edge laid with `/stack`: edges cut ring by ring along the stage's
  sides (full and between bars, columns, overlay edges), each a stack with start, center and end zones, fixed items (a
  title, window controls), floats clear of every bar and chrome (`fitFloat`), one `solve` for every rect, one
  `targets` for every drop target of one item (each carrying the layout a release makes, so the preview is the
  result), pure changes and a stored form.
- **`/scene/cases`**: the Scene's behaviour as data: conformance rows (a scene, what a user does, the layout and DOM
  expected after) and `runCase`, which plays one on a host, so a UI kit's suite and the lab run the same rows.

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
structural `kind` (a panel's `open`, `header`, `rail`, `menu`; a group's `row`, `stacked`, `wrap`, `icons`, `fold`, `menu`), a `main`
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
- A growing fixed item (a title: `fixed`, with a form that `grows`) holds its natural length first. While the other
  items can still step to a form of the kind they are in (a toolbar's compact variants, a row to a smaller row) or shrink
  toward their least, they do so before the title gives up any of its natural length; then the title shrinks toward its
  `main.min`, and after it come the steps that change a form's kind (icons, fold, the » menu), by rank, then age. Room
  coming back is the exact reverse. `StackFit.need` is the forms' least with every growing fixed item at its minimum.
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
  top); `./scene` reports its rect as the item's `grip`. A `wrap` form's grip is its lead cell instead.
- `StackForm.hides` (control ids): what the form leaves out against the item's first form, for a toolbar's compact
  variants (see Compact variants under Scenes). The stack never reads it; `./scene` reports it as the item's `hidden`.
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
  whatever presses changed the ages since, the menu included: under a priority (see Scenes), a higher-priority toolbar is
  back at its form before a lower one leaves the menu. A `previous` without `steps` (built by hand, or by an older
  version) grows the old way: a fresh fit that is a pure gain over the kept forms, else the item that gave way most
  recently (highest rank, then `kept`, then the newest used, then the earlier in the stack) first, one at a time, menu
  items out only while that keeps the order. A scene's `storeScene` doesn't store the steps, so the first growth after a
  reload uses the old order; the steps are carried again from then on. One px of room, or a badge losing a digit after a
  press, moves
  nothing. Results under `previous` depend on history: a shrink then a grow can end at another arrangement than a fresh
  solve, and more room never undoes a growth along successive solves. Growing back is meant for stacks of up to about
  50 items (60 small menu items take about 9 ms). An item whose form at the kept index is of another kind starts over;
  one only re-measured (a badge changed a digit) keeps its place: a smaller form frees room that grows the kept forms, a
  larger one gives way from them. After changing the forms' cross sizes (a lowered `cross.min`, say) solve once without
  `previous`: that alone doesn't bring a form back. `previous` is the `StackFit` last returned; a
  hand-built one with no `need` is no help. `stackTargets(…, { previous })` solves every gap's preview the same way, so it
  equals the drop solved with the same `previous`.
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

> **Deprecated:** `stackTargets`, `createStack`, `storeStack`, `readStack` and the floats below (`fitFloat`,
> `stackFloatTarget`, `storeFloats`, `readFloats`) belong to the window, which `@n-uf/placement/scene` owns:
> `targets(scene, id)` replaces `stackTargets` and `stackFloatTarget` (its `float:<id>` target), `storeScene` /
> `readScene` replace the stack's and the floats' stored forms, and `fitFloat` is exported by `./scene`. They stay
> until the next breaking release. `fitStack` and the forms are the edge solver and stay.

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

### A title bar, targets by kind, a group's own size

Opt-in options for hosts that dock several kinds of item. All are additive: an input that uses none of them gives the
fit and the targets it always gave. Item kinds are the host's; placement only calls the predicates.

- **`StackInput.accepts(item)`**: the stack takes this item or not. `stackTargets` gives no target (`[]`) for a dragged
  item the stack doesn't accept, so a toolbar-only bar takes no panel and a panel-only column no group. `fitStack`
  never calls it: the items already in the stack are laid out as given.
- **`stackTargets(input, dragged, { allows })`**: `allows(dragged, at)` is asked per gap (`at` is the gap's
  `place.at`) and a gap it refuses has no target. The other targets keep their ids, hits and fits. The stack's
  `accepts` is asked first.
- **`StackItem.fixed`**: a reserved room, such as the window title, a page readout and the window controls in a title
  bar. A fixed item never gives way: it is skipped when the stack is too long and keeps its first allowed form
  (`forms[from]`) for the length and for the cross size (a `too-wide` note says when it doesn't fit across), so a stack
  too short for it `overflow`s. It counts toward the length and takes no part in `previous`'s growing back. It is never
  dragged (`stackTargets` with a fixed dragged item is `[]`), and it has no drop slot inside it: the gaps before and
  after it stay, the hit of the gap before it ends where it starts and the hit of the gap after it begins where it ends,
  so its own area is in no hit (also when it runs past an overflowing bar). A fixed form that `grows` still takes spare
  length like any form.
- **`stackTargets(input, dragged, { onlyFits: true })`**: offer a gap only where the dragged item fits beside the
  others. A gap has no target when its fit puts the dragged item into the menu, has an `overflow` note, has a `too-wide`
  note the stack didn't have before the drop, or squeezes a fixed item: it is in another form, shorter along the stack
  than its form's `main.min`, or narrower across than before the drop. A fixed item may shrink down to its `main.min` to
  make room (a title with `grows` gives back the spare length it took, down to its minimum), so the room for the others
  is the length less the fixed items' minimum sizes. In a narrow window, under that, there is no target, so neither the
  slot nor the group covers the title. The gaps left are the unrestricted ones, unchanged. Position is not a size: dropping before a fixed
  item moves it along, as a drop anywhere moves what follows. The solve doesn't depend on where the dragged item is
  inserted (it counts as the newest, and the give-way order is the same at every gap), so what `onlyFits` leaves is all
  the gaps or none; `allows` is what tells gaps apart.
- **`StackInput.ownCross`** (default off): an item whose current form is a group kind (`row`, `stacked`, `wrap`, `icons`,
  `fold`) is drawn at its own `cross.natural` (a `wrap` form: as wide as its rows need), clamped to the stack's cross size and from its start edge (the left of a
  column, the top of a bar), not across the whole stack. Panel kinds (`open`, `header`, `rail`) and the » entry still
  span it, so every open panel and header fills the column, as wide as the widest open panel. The kind decides, not
  `setsCross`, which still decides the stack's cross size as before. `cross`, the forms, the notes and the lengths are
  as without it. A target's `slot` is that rect, while its `hit` and `marker` still span the stack.
- **Recommended column forms for a group.** In a side column give a group `stacked` (one word per line, `setsCross:
  true`, so a column of groups is as wide as its widest), then `icons` (28 across, sets nothing: with every group in
  icons the column is a rail), then `menu`. No `row`: a row of words asks for more than a column has, and the group
  that keeps it widens the column. With `ownCross` each group is drawn at its own width, also beside a wider open panel.
  A bar's group is `row`, `stacked` or `fold`, `icons`, `menu`, as in the toolbar above. A group whose words should wrap to
  the column rather than stand one per line takes `wrap` (above) in place of `stacked`.

```ts
const title: StackItem = { id: "title", used: 0, fixed: true, forms: [form("row", 160, 160, 26)] };
const controls: StackItem = { id: "controls", used: 0, fixed: true, forms: [form("row", 72, 72, 26)] };
const group = (id: string, used: number): StackItem => ({ id, used, forms: [form("row", 100, 100, 26), form("fold", 36, 36, 26), form("menu", 0, 0, 0)] });
const panels = new Set(["pages"]); // the host's kinds
const bar = { axis: "row", length: 400, cross: { min: 36, max: 40 }, accepts: (item: StackItem) => !panels.has(item.id), items: [title, group("views", 1), group("tools", 2), controls] } as const;

console.log(fitStack(bar).items.map((p) => [p.id, p.kind, p.rect.x, p.rect.width]));
// [ [ 'title', 'row', 0, 160 ], [ 'views', 'fold', 160, 36 ], [ 'tools', 'row', 196, 100 ], [ 'controls', 'row', 296, 72 ] ]
// (the three groups need 432: Views, the oldest, folds; the title and the controls stay as they are)

const gaps = stackTargets(bar, group("marks", 4));
console.log(gaps.map((t) => [t.hit.x, t.hit.x + t.hit.width]));
// [ [ 0, 0 ], [ 160, 178 ], [ 178, 246 ], [ 246, 296 ], [ 368, 400 ] ] (none over the title or the controls)
console.log(stackTargets(bar, group("pages", 4)).length, stackTargets(bar, title).length); // 0 0: not accepted, fixed
console.log(stackTargets(bar, group("marks", 4), { allows: (_dragged, at) => at !== 2 }).map((t) => t.id));
// [ 'gap:0', 'gap:1', 'gap:3', 'gap:4' ]

// A column: words groups in their stacked form, each at its own width beside a wider open panel.
const words = (id: string, used: number, wide: number): StackItem => ({ id, used, forms: [{ ...form("stacked", 78, 78, wide), setsCross: true }, form("icons", 72, 72, 28), form("menu", 0, 0, 0)] });
const side = fitStack({ axis: "column", length: 400, cross: { min: 120, max: 360 }, ownCross: true, items: [open, words("views", 2, 84), words("tools", 3, 110)] });
console.log(side.items.map((p) => [p.id, p.rect.x, p.rect.width])); // [ [ 'pages', 0, 240 ], [ 'views', 0, 84 ], [ 'tools', 0, 110 ] ]
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

## Scenes

`@n-uf/placement/scene` holds a whole window in one model, so every rule that spans it (kinds, chrome, fixed room,
preview equals result) has one owner. A `Scene` is the stage (the window's inner rect), its `edges`, the `items`
(each with a host `kind`, its forms along a column and along a row from `./stack`, its age, and its flags), the
`floats` and the `chrome` they keep clear of. `solve(scene)` gives every rect the host draws; `targets(scene, id)` gives
every drop target for one item. Nothing is module-global, so two windows on a page are two scenes.

```ts
import { readScene, solve, storeScene, targets, type Scene, type SceneItem } from "@n-uf/placement/scene";
import type { StackForm } from "@n-uf/placement/stack";

const f = (kind: StackForm["kind"], min: number, natural: number, cross: number, more: Partial<StackForm> = {}): StackForm => ({ kind, main: { min, natural }, cross: { natural: cross }, ...more });
const panel = (id: string, used: number): SceneItem => ({
  id, kind: "panel", used,
  forms: { column: [f("open", 120, 240, 260, { main: { min: 120, natural: 240, grows: true }, cross: { natural: 260, min: 180 } }), f("header", 28, 28, 260, { cross: { natural: 260, min: 60 } }), f("rail", 28, 28, 30), f("menu", 0, 0, 0)] },
});
const group = (id: string, used: number, align?: "end"): SceneItem => ({
  id, kind: "group", used, ...(align ? { align } : {}),
  forms: { row: [f("row", 180, 200, 28), f("icons", 84, 84, 28), f("menu", 0, 0, 0)], column: [f("stacked", 96, 96, 84), f("icons", 84, 84, 28), f("menu", 0, 0, 0)] },
});
const fixed = (id: string, kind: string, form: StackForm, align?: "center" | "end"): SceneItem => ({ id, kind, used: 0, fixed: true, forms: { row: [form] }, ...(align ? { align } : {}) });
const bar = { accepts: ["group"], cross: { min: 36, max: 36, rail: 36 }, gap: 4, pad: { start: 8, end: 8 } };
const column = { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } };
const items = [
  fixed("title", "title", f("row", 80, 160, 32, { main: { min: 80, natural: 160, grows: true } })),
  fixed("controls", "controls", f("row", 84, 84, 32), "end"),
  fixed("readout", "readout", f("row", 72, 72, 28), "center"),
  panel("pages", 1), panel("findings", 2), panel("notes", 3),
  group("views", 4), group("tools", 5), group("zoom", 6, "end"), group("search", 7, "end"), group("marks", 8),
];
const scene: Scene = {
  stage: { x: 0, y: 0, width: 1200, height: 800 },
  edges: [
    { id: "titlebar", side: "top", ring: 0, accepts: ["group"], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } },
    { id: "toolbar", side: "top", ring: 1, items: ["views", "tools", "zoom"], ...bar },
    { id: "status", side: "bottom", ring: 0, span: "between", items: ["readout", "search"], ...bar, cross: { min: 28, max: 28, rail: 28 } },
    { id: "left", side: "left", ring: 0, items: ["pages"], ...column },
    { id: "right", side: "right", ring: 0, items: ["findings", "marks"], ...column },
  ],
  items: Object.fromEntries(items.map((it) => [it.id, it])),
  floats: [{ id: "notes", rect: { x: 500, y: 200, width: 280, height: 320 } }],
  floatKinds: ["panel", "group"],
};
const layout = solve(scene);
console.log(layout.content); // { x: 260, y: 68, width: 680, height: 704 }
console.log(layout.items.title!.rect.width, layout.items.controls!.rect.x, layout.items.marks!.rect.width); // 1116 1116 84
const drops = targets(scene, "views", { previous: layout });
console.log(drops.filter((t) => t.id.startsWith("gap:status")).map((t) => t.id)); // [ 'gap:status:start:0' ]
const drop = drops.find((t) => t.id === "gap:right:start:2")!.after({ x: 0, y: 0 });
console.log(JSON.stringify(solve(drop.scene, { previous: layout })) === JSON.stringify(drop.layout)); // true
console.log(readScene(JSON.parse(JSON.stringify(storeScene(drop.scene))), scene).dropped); // []
```

**The cut.** Reserved edges cut the stage from the outside in: the full bars first (top then bottom, each by `ring`,
0 outermost), across the whole width; then the columns (left then right, by ring), down the height the full bars
leave; then the `span: "between"` bars, across the width the columns leave. What remains is `layout.content`. Edges
with `mode: "overlay"` are cut the same way from a copy of the content: they lie over it and leave it as it is. An edge
with nothing drawn in it takes no room.

**Each edge is a stack.** Left and right edges are columns (`forms.column`), top and bottom ones bars (`forms.row`),
each solved by `fitStack` along the length it gets, with `gap`, `pad` and `menu` passed through, its cross limits never
wider than the room the cut leaves. Group forms in a column take their own width (`ownCross`); open panels and headers
span it. Spare room goes to the forms that grow, so a column's open panels share its height through `grows` and equal
naturals. A column where nothing sets the width is a rail: its items that have a `rail` form take it and are listed in
`edges[id].tabs` (with `railShowsClosed`, closed items too, marked `closed`); the host draws tabs only from the layout.

**Rail titles.** A panel may declare two rail forms: its title (`{ kind: "rail", title: true }`, its `main` the length
of its name and count turned along the rail, measured by the host) and then its tile (a plain `rail` form). In a rail
they are two steps on its ladder: while the rail's length fits every title, each item shows its title; when it runs
short, titles step down to tiles by the usual rules (priority, then the item used longest ago) and come back in exact
reverse as room returns (`StackFit.steps`). That holds for a column drawn as a rail and for a side's rail strip
(`layout.rails[side]`, whose fit is `rails[side].stack`). Each side has a mode, `scene.railModes[side]`: `"titles"`
(the default) or `"icons"`, which passes title forms over so every item shows its tile; `setRailMode(scene, side,
mode)` changes it, `railModeOf(scene, side)` reads it (`RAIL_MODES` lists the modes), and `storeScene` / `readScene` keep it. A title form is offered nowhere else (a stack offers it only
with `StackInput.titles`), and an item with no title form shows its tile in either mode, so a host that hasn't measured
titles sees no change. An item drawn in its title reports `railTitle: "left" | "right"`; the host turns it to read
toward the content: on the left bottom to top (−90°), on the right top to bottom (+90°), the count at the title's end.
Hits, clicks, drags and `after()` work as for the tile, at the title's length.
`Edge.size` is the user's size across, clamped to the widest open setter's `cross.min` (and the edge's `cross.min`) at
least and `cross.max` at most; `resize` sets it.

**Zones.** An item's `align` (`start`, the default, `center` or `end`) is its zone in its edge. Give-way is as without
zones (it sums the minimum sizes); when room is spare, start items pack from the start, end items from the end (before
the » entry) and center items sit on the edge's middle, moved only as far as they must to stay between the other two.

**Bar alignment zones.** A horizontal bar picks the zone of a drop by thirds of its length: a pointer in the left third
is over the leading zone (`start`), in the middle third over the center zone, in the right third over the trailing zone
(`end`), and within the zone the nearest of its gaps wins, each zone's gaps splitting only that zone's third. A zone whose
toolbars run past its third spreads its gap lines inside the third, so its last gap keeps a slice of it. An empty bar's
strip is three targets, `strip:<bar>:start`, `strip:<bar>:center` and `strip:<bar>:end` (it was one `strip:<bar>`), one
per third. Every empty edge does the same along its own axis: a side edge or a compact rail by thirds of its height
(`strip:<edge>:start|center|end`, top, middle, bottom). On an occupied edge the items' halves win over the thirds where
they disagree: a pointer over an item's half aims before or after that item, in its zone (see Aim order under
Targets); the thirds decide only between and beyond the items, and on empty zones and empty edges.

A **title bar**, a bar with a fixed item that grows (the window title), is a constrained host: a toolbar dropped there
must land in its first form, nothing else in the bar may change form for it, and the title keeps its natural width (it may
no longer shrink to its `min` to make room). A zone where that can't hold has no target and no slot, so a bar too full
takes no drop in that zone. The zones are then laid with the title at its natural width, not at the width it grew to:

- a leading toolbar sits right after the title's natural rect;
- the trailing toolbars sit right before the end items (the window controls);
- a center toolbar sits at the bar's true centre when that is clear of both, else it is centred in the free span between
  the leading and the trailing ones;
- the title takes the spare room only when nothing follows it in its zone, so a toolbar after the title is no longer
  separated from it by a stretch of title.

**Fixed items** (a title, window controls, a page readout) never change form, are never reordered, never dragged, and
no hit covers them. Their length shrinks toward `main.min` and grows with spare room when the form `grows` (a title
holds its natural length while the toolbars of its bar can still step to a compact variant or shrink, and shrinks before
any step that changes a form's kind); window
controls have `min` equal to `natural`. A stage too short for them overflows instead of folding them. A `kept` item with
no smaller form never folds either: it reports `overflow` or `too-wide`.

**Give-way priority.** `SceneItem.priority` (number, default the edge's `Edge.priority`, else 0) says who steps down
first when an edge runs short. Items step down their forms in a fixed ladder, row, then wrap (in a column), then icons,
then the edge's » menu; the lowest priority steps first, and among equals the one used longest ago. Priority adds to every
one of the item's forms' `rank` (`./stack`), which is the mechanism, so a host may still rank single forms. Give the
controls that must stay out of the menu the highest priority, and a title bar's `Edge.priority` a lower one than the items
moved into it from other bars, so its own toolbars step down first. Room coming back brings items up in exactly the
reverse order, each to its remembered form, the » menu included. A host reads, and never decides: each item's layout has
`form` (the index into the forms of its axis), `formKind` and `inMenu`, and `edges[id].menu.items` lists the ids in the
» menu in order. Without priorities nothing changes.

**Closed items** keep their place in their edge (or their float rect) but take no room and have no targets.

**Toolbar shapes.** A group in a column draws its words in rows that wrap to the column: give it the column forms
`[wrap, icons, menu]` (a `wrap` form from `./stack`; no one-word-per-line `stacked` form). The layout reports a wrapped
item's `rows` (the word indexes per row; the words wrap beside the grip, a hanging indent) and its `grip` (the lead cell at
the start of row one; for a form with `StackForm.grip` such as an icons strip, that strip at the form's start along the
axis). A `wrap` form applies only in a column edge. Vertical means icons: in a column drawn as a rail, and in a float
with `orient: "column"`, a group skips its `wrap` forms and shows its next form (its icons) at that form's natural size,
whatever its `from`. An item with only `wrap` forms left has no form there: it is left out with a `no-vertical-form` note,
so give a word group an `icons` form. A drop's `after()` gives the wrapped rect as the slot.

**Compact variants.** A toolbar that can drop controls before it wraps declares them as more row forms between its full
row and its next form, largest first, each at its own measured size with its "+N" cell counted, and each naming the
control ids it leaves out (`StackForm.hides`, against the item's first form; any form may set it). Variants are forms
like any other: taken in declared order, giving way by priority then age, coming back in the exact reverse. The layout
reports the chosen form's ids as `hidden` on every item (empty when it hides none or sits in a » menu), and `form`
names the variant; a host draws the kept controls and a "+N" control that lists exactly `hidden`. A drop's `after()`
previews the variant the drop lands in. A drop onto a title bar lands in a form of its first form's kind (the full row
or a variant), read from the forms.

```ts
const zoom: SceneItem = {
  id: "zoom", kind: "group", used: 3,
  forms: {
    row: [
      f("row", 150, 150, 28),                          // − 86% + FIT
      { ...f("row", 118, 118, 28), hides: ["fit"] },        // − 86% + "+1"
      { ...f("row", 70, 70, 28), hides: ["-", "+", "fit"] }, // 86% "+3"
      f("fold", 30, 30, 28),
      f("menu", 0, 0, 0),
    ],
  },
};
```

**Compact edges.** `Edge.compact: true` makes a thin rail of vertical toolbars along a window side: its items take only
their `icons` form (and the » menu after it), stacked, each item's grip the divider. An item with no `icons` form is left
out of it with a `no-icons-form` note.

**Trays.** `Edge.zoneAccepts` (and `ColumnTemplate.zoneAccepts`, for the columns a drop makes) narrows `accepts` per zone:
the kinds each zone takes, and a zone not listed takes nothing. A panel column with `{ start: ["panel"], end: ["group"] }`
has its panels at the top and a tray of toolbars at its foot (the end zone, one toolbar per row): a toolbar in the tray
takes only its `wrap` or `icons` form, never the menu, and the panels give way first. Gaps are offered only in the zones
that take the dragged kind, `moveTo` puts an item in the zone asked for, else in its own zone if that takes its kind, else in the first that does. An empty edge offers
each third of its strip only to the kinds that third's zone takes (the other thirds are refusals), and a group never
opens such a column on its own: an empty side column offers its strip only to the kinds its start zone takes, so a
group's drag gets the compact rail's strips but none for an empty panel column, and a panel's gets the column's top
third.

**Columns and rails.** A left or right edge with `column: true` is a dynamic column: drops make it (a `column` place, from
`scene.columns[side]`: `accepts`, `cross`, `gap`, `pad`, `menu`), and it is deleted, its side's rings closed up, when it
holds no item. On a side with `scene.rails[side]` (`{ width, accepts }`), folded columns show as segments of that side's
one rail (`layout.rails[side]`, each member at its `rail` form's length, in ring order), lying just outside the side's
first column. A column folds:

- by give-way: while the content is narrower than `scene.contentMin.width` (after `inset`, and a `gutter` after each side
  edge and rail), dynamic columns shrink toward their minimum (the edge's `cross.min` and the widest open setter's
  `cross.min`: a stack costs its widest member's minimum), then fold whole, unkept before kept, the one whose newest use
  is oldest first, the outer first, the left first (`column-shrunk`, `column-folded`, `kept-folded`). Under `previous`,
  what gave way stays so while the content still fits, room that comes back unfolds in the reverse order, and ages alone
  change nothing. Still too narrow: `content-narrow`; under `contentMin.height` (overlay bars counted): `content-short`.
- by hand: when every member is folded by hand (`from` over 0) it goes to the rail; with `handFold: "ride"` a one-member
  column instead rides as a title bar over the side's first open column, at that column's width, taking no width
  (`rides`), while the side has an open column.

A member folded by hand in a column with others is a bar in place (its header form). The open members share the height
through `grows`. Anchors (a thumbnails column, a fixed drawer) are ring-0 edges with `accepts: []` and fixed items.

**Side parity options.** For a host with panel columns, anchors and a narrow fallback. All are opt-in; a scene that sets
none lays out as before.

- **`Edge.outsideInset`**: an anchor edge (a left or right edge that takes nothing, such as a thumbnail strip) lies
  outside `Scene.inset` and the gutter: at the window's side, with the inset after it toward the content, and inside its
  side's rail when one shows. It runs into the inset above and below only where no reserved bar lies on that side. On a
  full top or bottom bar it lies at the window's edge, full width, with the inset after it; the side edges then run
  between such bars, and an anchor runs through the inset beside them. Without it nothing changes.
- **`Edge.giveWay`**: a static left or right edge that gives way like a dynamic column. It shrinks toward its minimum,
  then folds whole into its side's rail, in give-way order with the columns (by its items' ages). It is never deleted.
- **`Edge.moves: "side"`**: a static edge whose fixed item (an anchor, such as page thumbnails) the user may drag to the
  other side of the edge's axis. `targets` then gives that item one target, `side:<other side>`, over the place the edge
  takes there, landing as `setSide` puts it; its own place is home. Left out, a fixed item has no targets. `readScene`
  moves an anchor's edge to the side and size of the stored entry that lists it.
- **`Edge.foldable: true`**: the user may fold this edge's fixed items (an anchor) by hand, like a panel:
  `fold(scene, id, true)` shows the item in its rail form, `fold(scene, id, false)` reopens it, and `storeScene` /
  `readScene` keep it folded. Left out, `fold` leaves a fixed item as it is and a stored fold is dropped.
- **`ColumnTemplate.hitBand`**: the `Edge.hitBand` (a number of px, or `"middle"`) that the columns a template makes
  inherit; see the gap targets below.
- **`Scene.insetWhen`** (`"always"`, the default, or `"docked"`): with `"docked"` the inset applies only while something is
  docked beside the content, that is an open panel column or a rail showing panels (an item whose first column form is
  `open`, `header` or `rail`, not closed). Only panels count: an anchor alone doesn't, and neither does a toolbar group
  in a side bar. With nothing docked, the content is the whole stage.
- **`layout.columnRoom`** and the note **`no-column-room`** (`{ width, need }`): with `contentMin` and a dynamic column,
  whether one column at its minimum fits beside the content's minimum. Anchors and rails don't count: every column, an
  anchor included, can fold into its rail. A side toolbar bar that lays out an item does count: it never folds (unless it gives way), so its
  width (and the gutter after it, when it lies inside the inset) comes off the room before the column's minimum is
  tested, and the note's `width` is the room left after it; an empty or all-closed bar counts for nothing. A docked column counts whether or not its side has a rail. Before any column
  holds an item, the `Scene.columns` template answers, with the larger of its `cross.min` and the least width the items
  it takes need, so docking a panel doesn't flip the answer. It answers as if the one column were open: under
  `insetWhen: "docked"` with nothing docked it counts the inset that column would bring, and a column folded whole by hand
  (and a template's floating items) counts at its open minimum, not as a rail. `false` comes with the
  note, where `width` is the room the stage leaves and `need` the content's minimum plus that column and its gutter. A
  host shows its narrow fallback (one panel over the content) while it is `false`. An exhaustive `switch` over
  `SceneNote["code"]` needs the new code.
- **`handFold: "ride"`** rides every column folded by hand, not only a one-panel one: each member is a bar over the
  side's first open panel column (never over an anchor), stacked in zone order.
- **The order of a side's outer edges.** A side's rail is its outermost *panel* edge. With a side bar, from the window's
  edge inward a side lies: its toolbar bars with `outsideInset`, the rail, its static column edges with `outsideInset`
  (anchors), then the inset, then the columns. The kinds tell them apart, with no new option: a side bar takes something
  and nothing the side's columns or rail take (`Scene.columns[side].accepts`, `Scene.rails[side].accepts`), an anchor takes nothing; `isSideBar(scene, edge)`
  says whether an edge is a side toolbar bar (only on a side that has a column template or a rail), and
  `isOutsideSideBar(scene, edge)` whether it is one with `outsideInset`. On a side with no side
  bar the rail stays inside the inset, as before. With no rail shown, the `rail:` strip lies past the side's bars too.
- **Static edges keep their place.** A new column (a `column:` or `rail:` target, `moveTo` with a column or rail place,
  `dockHome`) goes no further out than just inside the static edges that lie outer to the side's dynamic columns, so a
  bar or an anchor at the window's edge is never pushed inward. Column and rail places count rings as the side's edges
  lie (by ring, then by order, no ties), and `homeFor` gives a start column's ring that way.

**Floats** lie above the content in stage px, last on top. Each is moved inside the stage and clear of every docked
item, every bar and every `chrome` rect (`fitFloat`, which `./scene` exports with `FloatFit`), with `float-clamped`, `float-moved` or `float-covers` notes. With
`anchor` (such as `"content-top-right"`) it sits flush with that side or corner of the content and follows it until a
drop gives it a real rect. `orient` picks the forms it uses; folded by hand (`from` over 0) it is its
bar: that form's natural length along its orient, its other size kept.

A float that names no `orient` takes its item's: **`SceneItem.floatOrient`** (`"row"` or `"column"`), else
**`floatOrientOf(item)`**, the axis of the first form the item declares, so a toolbar group declared row first floats as
a row. **`SceneTargetOptions.floatOrient`** overrides that for the drag's float target. With no `floatSize`, a float takes
its first form's natural size along that orient (**`floatSizeOf(item, orient?)`**), not 280 × 360; a form that grows (a
panel's card) keeps `DEFAULT_FLOAT_SIZE` (280 × 360), so panels float as before. Give a float `orient: "column"` (or the
item `floatOrient: "column"`) to keep a row-first group vertical.

The **float region** is [pad, W − pad] × the full height: the stage less `Scene.inset`'s left and right (its top and
bottom don't cut it). A float is clamped into it, and one larger than it is shrunk to fit. **`SceneItem.floatMin`**
(`Size`) is the floor of that shrink: a float of the item is laid out at `max(floatMin, min(its size, the region))` each
way. Without it a shrink stops at the form's own minimums (`cross.min` across, `main.min` along), and a float asked for
smaller than those keeps its size. A float wider than the region even at the floor keeps the floor and lies at the
region's left edge; a folded float keeps its height. **`SceneItem.floatMax`** (`Size`, optional) is the ceiling: a
larger float is laid out at it, its top-left corner kept (never under `floatMin`).

**Resizing a float by hand.** Per pointer move a host calls **`fitResize(scene, id, rect, moving)`**: `rect` is the
rect asked for (the float as drawn, the dragged edges where the pointer put them) and `moving`
(`{ left?, right?, top?, bottom? }`) names those edges; the others stay put, so a left-edge drag keeps the right edge.
In one pass, with no iteration, it keeps the size within `floatMin` (else the open form's minimums, which only stop a
shrink below the size drawn now, as `solve` lays it) and `floatMax`, the float in the float region, and stops every
growing edge at what floats are kept clear of (a bar, a docked item, the chrome; such a stop beats the minimum). It
then lays the rect through the one clamp `solve` lays floats with, so `solve` lays the result exactly there. A float
that already covers something (no clear place at its size) may move to a clear place once a resize opens one; the
preview is still the commit. It gives `{ rect, limits }`, `limits` naming what bound it:
`"min"`, `"max"`, `"region"`, `"docked"`. It gives null for anything but a float drawn at a first form that grows (a
panel's card): a toolbar group's size and a folded float's bar come from their forms. On commit (each move, or the
release) `resize(scene, id, rect, moving)` stores that same rect as the float's rect and the item's `floatSize`, so the
preview is the commit and the size survives `storeScene`. `fitFloat` is the other half: it moves a float to a clear
place and never resizes it.

**`previous`.** `solve(scene, { previous })` hands each edge's fits (`edges[id].free` and `.stack`) to `fitStack`, so a
change of ages alone (a press, `use`) or `raise` changes no rect (C23), a form that was only re-measured keeps its place,
and one whose kind changed starts over. Whenever `content` isn't the rect `previous.content` was, the layout has a
`content-changed` note (`{ from, to }`): a host refits its zoom only on that note, so a press or a float move never
refits it. Columns that gave way stay folded, in the order they folded (the fold notes' order), while the content still
fits; room that comes back unfolds them in the reverse of that order, never by age, so a press unfolds nothing, and
solving again from a layout changes nothing. An item docked now that was closed or absent in `previous` has just
opened. Opened beside items that stayed open in its edge, it counts as the newest and takes its largest form that fits
its edge as laid out, and its column is weighed again. A closed item is not a removed one: opened into an edge whose
items were all closed, it comes back with its age, and the column's folds, kept while it was closed, apply again. The
columns' fold and shrink state otherwise follows `previous`, so to reweigh a column fully, pass `fresh: [columnId]`.
`fresh` (edge or item ids, on `solve` and `targets`) solves those edges without `previous`.

`use` alone never reshapes anything: ages decide only who gives way anew. A user's explicit request to show an item
is passed as `fresh`:

| Action | What to pass |
|---|---|
| focus (a press on a header) | `use` only |
| expand a folded or railed item | `use` + `fresh: [id]` |
| Keep open | `keep` + `fresh: [id]` |
| open a closed item | `open`: it counts as fresh by itself beside items that stayed open in its edge. Into an edge whose items were all closed it comes back as it was (its column may stay folded by give-way); to show it regardless, `open` + `use` + `fresh: [id]`, as for expanding |

**Targets.** `targets(scene, id, { previous, endReach, floatSize, floatOrient })` gives, in the `@n-uf/motion/drag` shape:

Every hit lies where the user sees things: the layout as it is, the dragged item in place. Its own place is home, and so
are the gaps right beside it (a drop there is the same move). An edge the lift would delete (the item alone in its
column) is home as a whole. A zone of a bar reaches over every card seen in it. Each target's `after` is the solved
drop, so where the lift would reflow a neighbour the preview moves it under a fixed pointer, and the tiles stay put.

**Aim order.** Along every occupied edge (a rail, a bar, a title bar, a tray, a column), the dragged item is taken out
first and the pointer aims at the other items: over the leading half of one (its upper half on a side edge, its left
half on a bar) the drop goes right before it, over its trailing half right after it. The tiles split at the midpoints of
the remaining items, whatever their order and zones. Where that aim gives the order the edge has now, the target is home
(no slot elsewhere): home covers the item's own rect and the facing halves of its two neighbours, even a neighbour in
another zone. That holds for **cards**, items whose bodies are drop places (toolbar groups, and panels under
`hitBand: "middle"`); an open panel's body is no drop place, so over a panel the pointer aims only in the bands at its
ends. Zones come in only where no item is aimed at: in the free stretch between two items, beyond the last one
and on an empty zone or edge, the zone extents (thirds, or the solved spans) say which zone's slot the pointer is over,
so a drop there can move the item to another zone with its order kept. A slot whose whole tile lies over its neighbours'
facing halves is home's, and is no target of its own. The slot is where the item lands, at its size in that edge's form.

- `gap:<edge>:<zone>:<at>` (priority 2) for every edge whose `accepts` lists the item's kind (deny by default), before
  each item of each zone and at each zone's end, so an empty center or end zone can be opened; only where the item
  fits: not in the » menu, no `overflow`, nothing newly `too-wide`, every fixed item of the edge keeping its form and its
  place, and no chrome under its slot. Along the edge the gaps tile it: neighbouring gaps meet at the midpoint of the
  item between them (see Aim order), else halfway between their lines, so an edge of a few short items (a bar, a rail,
  a column's tray) is covered from end to end. Only over an
  open item's body (a panel) the hit narrows to `Edge.hitBand` px around its line (default 24), so the middle of a
  panel is no gap and the pointer falls through to the float target (or to none). Gaps on one line are one target, the
  first in zone order: when a bar has no spare length, `center:0` and `end:0` lie on the start zone's last line and
  merge into that start gap (its id stays `gap:<edge>:start:<n>`). The first and last reach `endReach` px past the
  edge's ends, but only a hit that reaches the edge's end goes on past it (a tray's gap at the foot never covers the
  top). Another edge's rect trims a gap's hit: one across from the edge (a bar above a column) at the hit's end along
  the edge, one beside it (a neighbouring column) at its side. Across, the hit is the larger of the edge's thickness
  before and after the drop; a compact edge's hits reach 24 px further inward, except where another edge's gap is.
  Hits are cut clear of chrome and of every fixed item that doesn't grow (controls, a readout). A fixed item that grows
  (a title filling its bar) takes hits over its text, which land in the nearest gap; it reserves only its natural rect,
  placed by its zone (from its start, from its end in the end zone, centred in the centre zone), and
  `reservedRect(scene, layout, id)` gives that rect, for a host that marks where nothing may drop. The length it grew
  by is spare room: the drop shrinks it toward its natural size (to its `min` if the room needs it), so a group moved
  out of a title bar can always go back while the room allows. No slot lies over a fixed item's reserved rect. `slot`
  is the item's rect after the drop and `marker` the insertion line across the edge.
- `strip:<edge>:<zone>` (2; three per empty edge, `:start`, `:center` and `:end`, one per third along the edge: a bar's
  width, a side edge's height, see Bar alignment zones): an accepting edge with no members at all (one that holds only
  closed members keeps its `gap:` ids), a strip `Edge.strip` px deep (default 24) along its side, inside the
  content and clear of the other edges (overlay ones included), so never over a docked edge or a panel's body: a
  full-width empty bar's strip covers only the content between the columns. A compact rail's strip alone stays at the
  window edge, its own place. A gap hit that spans it across trims its start or end (a bar's strip along the top never
  covers the columns' first gaps); one across its middle is left to the smaller-hit tie-break. With nothing left (an
  empty outer bar on a non-empty inner one, a bar's strip all under an overlay column) it has no target. A third is
  offered only for a kind its zone takes (`Edge.zoneAccepts`); the others are refusals.
- `side:<side>` (2), only for a fixed item on an edge with `moves: "side"` (an anchor such as page thumbnails): the
  place its edge takes on the other side of its axis, landing as `setSide` puts it. A fixed item has no other target
  but home.
- `float:<id>` (3, free) when `floatKinds` lists the kind: the whole plane, landing with the pointer holding the float
  at `grab`, clamped and moved clear. It has no fixed `slot`: the slot to draw is
  `after(point, grab).layout.items[id].rect`, for the pointer at the time.
- `column:<side>:<ring>` (2): a new column on each column line of a side whose template's start zone takes the kind (outside the
  outermost open column, between two, inside the innermost, or at the content's edge), 22 px each way. Column lines
  about the item's own column when it is alone in it are the same move as home, so their pieces join home's hits
  (`home:<id>`), leaving no sliver beside it.
- `rail:<side>:<ring>` (1): docking folded into the side's rail, before each folded column's segments and after the
  last, or, while no rail shows, the outer 10 px from the side's outer edge (the window's, an inset's strip included;
  flush after the side's outside toolbar bars), landing where the rail lands. The outermost column line starts where
  it ends. A rail stop takes its place at the side's edge only where one of its slots lands (home's counts); when the
  rail would be covered (every stop refused, a panel riding over it), the outermost column line is laid from the
  window's edge instead.
- `none:<i>` (1) over each `scene.blocked` rect, and `home:<id>` (1) over a docked item's own rect: a release there
  commits nothing. A floating item has no home, so a move inside its own rect is a float move. A gap, column line or rail
  drop that would put the item back where it is (the gap beside it, its own column's line) keeps its id but is a home
  too: no slot, nothing committed. Every rail target on the side whose rail already holds the item is a home: a segment
  dropped on its own rail, even below the last segment, never splits or reorders it (P9).

**The target model.** `targets` and `refusals` come from one generation: edge, then zones, then slots, then tiles, then
one ordered filter (accepts and zones, fit, clipping, `blocked`). A target wins only where its own hit is, and every point
of an edge that takes the dragged kind is one target or one refusal of its own zone, never a hole, an overlap or another
zone's.

- **Zones.** A zone's extent is where its items lie: the thirds of a bar, of a compact rail or of a side toolbar bar;
  the solver's spans where items fill the edge (a plain panel column is one zone, its whole length; a tray column its
  panels' span and its tray's). An **empty zone is one slot**, a single place that takes the drop.
- **Slots and tiles.** A zone's slots are the places a drop can land (before each item, after the last); the zone's
  extent is cut into one tile per slot, each tile meeting its neighbour halfway. Slots that are the same move (one line
  and one landing, or both putting the item back) are one slot, the lowest `at` keeping its id. A place that would move a
  fixed item of its edge (before a title, after the window controls) is no slot.
- **Home.** Home's tile is the item's own interval, with no band around it: a stretch with no slot of its own is refused,
  never home's and never another zone's. Beside an item alone in its zone it is refused as `own-place`.
- **Space ownership** decides where tiles of different edges meet: owned, then virtual, then overreach.
  - A drawn edge owns its rect. An empty edge owns only a thin place band of 12 px (half the hit band) at the boundary
    where it would appear; so does the side's rail where none shows. The item's own place is owned before everything.
  - A column line is where a new column would appear, so it owns a 12 px place band too, centred on its line. Owned rects
    are ranked by the order the layout lays edges out: an edge laid first, whose filling pushes the other, wins (outer
    before inner on one side, full bars before the sides, the rail before its side's columns, a column line over the
    inner column it would push but not the outer one). Between edges laid independently a drawn rect wins over an empty
    edge's band. Two columns that touch keep the line at their seam.
  - A zone loses what an edge ranked before it owns, and its panel bodies and reserved rects before it is tiled; a zone
    left with no room offers no slot.
  - Overreach, the part of a tile past what its edge owns (the depth a column will have after the drop, an empty
    strip past its band, a compact rail's inward reach), comes last: it yields to the column lines and to every other
    edge's owned rect.
  - An overlay column is drawn on top, and what shows on top wins: an empty rail's place under it offers no `rail:` stop
    there, and a column line beside it yields to it.
  - A refused place owns nothing against other edges, zone by zone: an edge owns its band only along the zones with a
    slot the filter keeps (home's place aside), and a refusal of a zone with none takes only what every surviving target's
    tile and every other edge's owned rect leave (within its own edge a refusal keeps its tile). So a panel can always
    become its own column beside the others: an empty rail that would refuse the drop doesn't hide the new-column target
    just inside a side bar, and an empty top bar whose zone holds only the dragged item's place doesn't cover a column's
    top band.
  - An edge that only moves when the dragged item lifts (a side bar pushed inward by a rail that empties) owns where it
    lies after the lift, where its tiles are, never its old place.
  - Clipping changes a slot's shape, never who owns it: whatever is left of a slot's tile is the slot's. A target left in
    pieces has **`hits`**, every piece (optional on `Target`), and `hit` is the largest piece, for hosts that read one
    rect; `pickTarget` (`./scene/cases`) tests every piece, as `@n-uf/motion/drag` does. Nothing of a slot's own room is
    refused.
- **The column lines and the rail are edges like the others**, tiled by the same rule. A column line or rail stop whose
  drop wouldn't land or fit, and any piece clipping cuts off its tile, is refused (`refuse:column:<side>:start`,
  `refuse:rail:<side>:start`, `no-room`) rather than left to the float.
- **Strips.** `strip:<edge>:<zone>` names a slot only on an edge with no members at all. On an edge that draws nothing
  but holds closed members (or the dragged item's own place), every slot keeps its `gap:<edge>:<zone>:<at>` id.
- **`SceneLayout.railPlaces`:** where each side's rail lies, or would lie were one shown, for every side with a rail
  (`Scene.rails`): the shown rail's rect, else where a drop into the rail lands. With no rail shown, the `rail:` strip is
  `RAIL_EDGE` px of it. Targets read it; a host draws `rails` (the shown rails), never `railPlaces`.

**Refusals.** `refusals(scene, dragged, options?)` gives the places a drop is refused, as `{ id, edge, zone, hit,
reason }[]` (type `SceneRefusal`): the stretches of a zone with no slot of their own, and the side edges that don't take
the kind (as a whole, zone `start`). `reason` is `"no-room"` when the zone takes the kind but no place of it fits (a
title bar at the title's natural width say), `"not-accepted"` when the zone or the edge doesn't take the kind, and
**`"own-place"`** for the stretch beside an item alone in its zone: there is room, but the zone's only place is the item's
own. An exhaustive `switch` over `SceneRefusal["reason"]` needs the `own-place` case. Ids are `refuse:<edge>:<zone>` and,
when a zone has more than one refusal, `refuse:<edge>:<zone>:<n>`, numbered by where they lie along the edge (then
across it), so an id holds from one frame to the next; no id is given twice by one call. A refused slot is refused over
its own tile. A host shows "no room here" at the pointer over one, with no slot anywhere; a release there commits
nothing, the item goes home. It takes the same `previous` and `fresh` as `targets`.

**Ids, read and built.** These formats exist in one place. A host reads an id with `parseTargetId(id)` and builds one
with `targetId(parts)`, so it never splits strings (an edge id may hold `:`):

| Helper | What it does |
|---|---|
| `targetId(parts)` | The id for `{ kind: "gap", edge, zone, at }`, `{ kind: "strip", edge, zone }`, `{ kind: "column" \| "rail", side, ring }`, `{ kind: "home" \| "float", item }`, `{ kind: "none", index }` or `{ kind: "refuse", edge, zone, n }` (`n` 0 for a zone's first refusal). |
| `parseTargetId(id)` | The same parts (`TargetIdParts`), or null for an id outside the scheme. |
| `placeTargetId(place, item)` | The id `targets` gives the target at a `ScenePlace` (null for `none`). |
| `virtualEdgeId(kind, side)` | `column:<side>` or `rail:<side>`: the virtual edge a refusal names in `edge`. |

A gap, column or rail target exists only where the drop keeps the whole scene sound (C29): it adds no `overflow` or
`too-wide` note to any edge, changes no fixed item's form, squeezes none under its `main.min` anywhere (a between bar
under a new column included), and lands its slot on no chrome. The rule compares notes: in an edge that already
overflows (or holds an item already too wide), a drop that adds no new note is accepted, even when it shifts a fixed
item that was already squeezed.

`stops(scene, id)` gives the same targets, home and none left out, in reading order (the left side outer to inner, the
top bars, the bottom bars, the right side inner to outer, floating last) for "Move to ›" and the arrow keys.

Each target's `after(point, grab)` is `{ scene, layout }`: the scene to commit (the item moved and just used) and
`solve(scene, { previous })`. The host draws every item from `after.layout` during the preview and commits
`after.scene` on release, so the preview is the result by construction.

**Changes** are pure and return the scene given when nothing applies: `moveTo(scene, id, { edge, zone?, at })`,
`floatAt(scene, id, rect?, orient?)` (with no rect: its last `floatSize`, anchored to the content's top-right), `fold`,
`use`, `keep`, `raise` (a float on top: no use, no reshape), `open`, `close`, `orient`, `resize` and
`setSide(scene, edgeId, side)`. `resize(scene, edgeId, size)` sets the user's size across an edge;
`resize(scene, floatId, rect, moving?)` resizes a float by hand at `fitResize`'s rect (see "Resizing a float by hand";
the scene given back where `fitResize` gives null). `setSide` moves an edge to the other side of its axis (left ⇄ right, top ⇄ bottom) as
its side's outermost edge: ring 0, before that side's other edges, whose rings close up behind it (the side it left
closes up too). Its items, size and options go with it; the scene is given back unchanged for an unknown edge, the side
it is already on, or a side across its axis. Like every change it ticks no use clock: a host that moves an edge by hand
calls `use()` on its items afterwards, as a drop does. The stored form keeps the side, and `readScene` moves a static edge stored
on the other side of `base`'s with `setSide`. `moveTo` and
`floatAt` refuse fixed items and kinds the edge or `floatKinds` doesn't list. `moveTo` also takes `{ kind: "column",
side, ring }` (`ring: Infinity` is the side's inner end: "Move to › Dock left"), `{ kind: "rail", side, ring }` (docked
folded) and `{ kind: "float", rect?, anchor? }`. `homeFor(scene, id, start)` is the place a start scene gives the item
(the same edge before the same neighbour, a new column at its ring when its column is gone, or its float), for Dock,
Put back and Reset position: `moveTo(scene, id, homeFor(scene, id, start)!)`. `dockHome(scene, id, start)` is that and the
start fold too: the item goes to `homeFor`'s place and takes `start`'s `from` (unfolded when `start` has none), so a "Move to ›
rail" (which folds it) followed by Dock brings it back open; the scene is given back unchanged when `start` places it
nowhere. `lift(scene, id)` is the scene while an item is held: the item out of every edge and float, and a dynamic
column it leaves empty gone (its side's rings closed up). While an item is held, a host draws every item from the shown
target's `after(point, grab).layout`; with **no target under the pointer** it draws the committed layout with the held
item's place left empty and nothing else moved (a release there commits nothing). It does not reflow the others with
`solve(lift(scene, id), { previous })`, which would show a result no drop gives.

**Stored form.** `storeScene(scene)` gives `{ v: 1, edges: [{ id, side, ring, items, size?, column? }], floats: [{ id, x, y,
width, height, orient?, anchor? }], items: { [id]: { used, kept?, from?, closed?, align?, floatSize? } } }`; no float has a
pinned field. `readScene(data, base)` takes kinds, forms, limits and edges from `base` and order, sizes and states from
the store, never throws, and lists what it drops: unknown edges and items, kinds an edge doesn't accept, fixed items
stored in another edge than `base`'s, bad fields, an old `pinned`. A stored edge's order is kept exactly, fixed items
where the store put them, so a drop after a fixed item round-trips; a fixed item the store lacks goes back to its base
place (trailing ones last). An item the store places nowhere goes where `base` has it, and floats are clamped into the stage by what `solve` draws (a folded float by
its bar), never cut, so a reload lands where it was drawn. Dynamic columns are the store's: one
`base` lacks is made from `base.columns[side]` at its stored ring, and empty ones are deleted. Anything but version 1
gives `base` back with an `error`.

## Scene conformance rows

`@n-uf/placement/scene/cases` is the Scene's behaviour as data, so a UI kit's suite and the lab run the same rows. A row
is `{ id, title, expect, scene, settings?, gestures, expectLayout, expectDom? }`: a scene, the stage and freeze it runs
at, what a user does (`press`, `move`, `release`, `key`, `click`, `resize`, `scroll`, `hold`; a `move` may name a target
by its `place` instead of pixels), and what must be true after: a partial layout (per item: `rect`, `formKind`, `edge`,
`floating`, `inMenu`, `rail`…, within a tolerance, 0.5 px by default) and, for a host with a page, DOM checks on the
session's marks (`data-drag-session` on the root during a drag only, `[data-drag-slot][data-drag-target]` for the slot
(the attribute holds the target's id), `[data-drag-marker]` for the insertion line, `[data-drag-held]` for the held item).
A drawn item's element is `[data-dock-item="<id>"]` by default, and a DOM check names it with `item` (not a literal
selector), optionally pinning its `rect` in stage px; a host that marks items another way gives `itemSelector(id)`. A row
may also carry `checkpoints`: the layout after an earlier gesture, for what the preview shows while the
pointer is still down; a checkpoint or DOM check is never read right after a `move`, a `hold` comes first so a host's drag
intent can settle. `expectStored` pins the stored form (ages, folds, no `pinned` flag) and `expectStops` the places "Move
to ›" offers, in order. A press's grab (`point`) is the row's: a float lands at the pointer minus the grab, so every press
that ends in a float gives one. A `move` with no target under the pointer draws the committed layout with the held item's
place left empty and nothing else moved. A row with `lacks` names a library rule the Scene doesn't have yet and is expected
to fail until it lands. A host reaches the end gaps 24 px (`END_REACH`) past an edge's ends.

```ts
import { targetAt } from "@n-uf/motion/drag";
import { CASES, createSceneHost, runCase } from "@n-uf/placement/scene/cases";

const row = CASES.find((c) => c.id === "C1")!; // the drop preview is the rect the item gets
const result = runCase(row, createSceneHost({ pick: targetAt })); // motion's pick rule
console.log(result.ok, result.failures, result.skipped.length); // true [] 6
```

`runCase(row, host)` loads the scene, performs the gestures in order and compares; it returns `{ ok, failures, skipped }`.
A host is `{ load(scene, settings), perform(gesture), layout(), root?(), itemSelector?(id), stored?(), stops?(item) }`:
`layout()` is what the page draws now (during a drag, the target's `after.layout`, the preview), `root()` is its root,
anything with `getAttribute` and `querySelectorAll` (and `getBoundingClientRect` for rect checks), `itemSelector(id)` the
selector under it of the element that draws an item (default `[data-dock-item="<id>"]`, also exported as
`defaultItemSelector`), `stored()` the stored form and `stops(item)` the "Move to ›" places; a check the host can't make is skipped and listed in `skipped`. A check pointing at
a gesture the row doesn't have fails the row. `createSceneHost()` is the reference: no page, no pointer, no clock, a drag
session that lifts past 4 px, asks `targets` for every target, takes the one under the pointer by its pick rule,
draws the preview from its `after.layout` and commits `after.scene` on release, every solve carrying the layout before
it as `previous`. A kit's host does the same with its own pointer; `resolvePlace(targets, place, item, { stage, content
}, pick)` turns a `place` into a point that reaches the target. Every row
passes on the in-memory host except its DOM checks, which it skips, and the rows with `lacks`, which fail on it until the
library rule lands. `CASE_GROUPS` lists the groups.

**The pick rule** (which target the pointer is over: the lowest priority number, then the smallest zone, every piece of
`hits` counted, a rect holding its edges exactly) is `@n-uf/motion/drag`'s `targetAt`, the rule the drag intent runs.
Placement doesn't import motion, so the host takes it as an input: `createSceneHost({ pick: targetAt })`, the last
argument of `resolvePlace`, and a host's optional `pick` (`PickRule`). Without one, the default is the same rule
(`pickTarget`, deprecated, held equal to `targetAt` by a test).

**The gesture grammar.** A row's `gestures` are plain objects (`g.press(...)` and the other `g` constructors build them),
played in order:

| `type` | What a host does |
|---|---|
| `press` | Pointer down on `item`'s handle (its grip, or its header); `point` is the grab, relative to the item's top-left corner, and is the row's, not the host's. Nothing lifts yet. |
| `move` | The pointer moves to `point` (stage px) or to the target at `place` (`resolvePlace` finds a point that reaches it). With an item pressed, the first move past the lift threshold lifts it (a `place` always lifts), and the pointer is then over whichever target the host's pick rule finds. With no target under it, the host draws the committed layout with the held item's place left empty and nothing else moved. |
| `hold` | The pointer rests for `ms`, so a host with a drag intent settles on its target. A checkpoint or DOM check is never read right after a `move`. |
| `release` | Pointer up: after a lift, it drops on the target under the pointer (a `home` or `none` target, or none, drops nothing); without one it was a press and nothing changes. |
| `key` | `"Escape"` cancels the drag, `"Alt"` holds Alt down and `"Alt:up"` lets it go (a frozen window moves while it is down), `"Reload"` stores the scene, drops the live one and reads it back. |
| `click` | The item's controls, not a drag. With neither `key` nor `place` it activates the item (a closed one opens, one folded by hand unfolds, a float rises). With `key`: `"use"`, `"open"`, `"close"`, `"fold"`, `"unfold"`, `"float"` or `"dock"` (`dockHome`: where the loaded scene had it). With `place`, the "Move to ›" row for that place. |
| `resize` | With `edge`, the user's size across that edge (`size` px); with `item`, that item's measured length changed by `size` px; with neither, the window is now `point.x` by `point.y`. |
| `scroll` | The pages scroll by `size` px. Nothing in a scene scrolls: only a host with a page can show it, with a DOM `rect` check. |

**Driving the rows from a browser runner.** A kit's page is driven from outside (Playwright, say) with real pointer
events and timers, so its host's calls are async. `runCaseAsync(row, host)` takes an `AsyncCaseHost`, the same members
as a `CaseHost` but each of `load`, `perform`, `layout`, `root`, `stored` and `stops` may return a promise
(`itemSelector` stays a plain function). It awaits every call, in the same order as `runCase` makes them, and checks the
same way: both play one list of steps. A rejected `load` or `perform` is a failed result with the error's message, as a
thrown one is in `runCase`. `runCasesAsync(rows, makeHost, { onResult })` runs the rows one after another (a page has one
pointer), each on a fresh host (`makeHost` may be async), and reports each result as it is known. A sync `CaseHost` works
with both.

```ts
import { CASES, runCasesAsync, type AsyncCaseHost } from "@n-uf/placement/scene/cases";

// A host over a Playwright page: each call goes to the page and resolves when the page has done it.
declare function pageHost(): Promise<AsyncCaseHost>;
const results = await runCasesAsync(CASES, pageHost, { onResult: (id, r) => console.log(id, r.ok) });
```

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
