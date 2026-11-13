# @n-uf/placement

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/placement is young and still changing. Its API (the desk constructions, the toolbar model and the drop targets) is not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md) before you upgrade.

Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

Where things go. State in, rects and drop targets out: a desk of docks, rails and palettes, toolbar groups in hosts
and zones, and the drop targets for each. A tiling entry (a split tree with ratios, groups and workspaces) is
planned. Pure functions over plain data: no DOM,
no framework, no motion, no dependencies.

```sh
npm i @n-uf/placement
```

Its sibling [`@n-uf/motion`](https://www.npmjs.com/package/@n-uf/motion) owns how things move. The two compose
without importing each other: a target list from `@n-uf/placement/targets` is exactly what
`@n-uf/motion/drag`'s drag intent takes, and a rect from any layout here is what `@n-uf/motion/layout` glides to.

- **`@n-uf/placement`**: the shapes (`Rect`, `Size`, `Point`) and a popup positioner (anchor, gravity, offset,
  then flip, slide, resize, as Wayland's xdg-positioner).
- **`/dock`**: a desk of documents and tool panels. Side docks and a bottom dock (between the side docks or across
  the full width), rails, natural-height sections whose last one takes the rest, fold and unfold, the give-way
  rules (sections fold least recently used first, docks fold to their rails), floating palettes with corner stacks,
  tear-off and dock-back; and nine constructions built from these parts, as presets (`createDesk`).
- **`/toolbar`**: toolbar groups in five hosts (title, top, bottom, left, right) and three zones (start, centre,
  end), floating groups, insertion points (before all, between, after all, an empty zone), trailing-first overflow,
  and "own place is home".
- **`/targets`**: drop targets (`{ id, priority, hit, slot?, label?, free? }`) for the desk's constructions and
  toolbar hosts.
- **`/panels`**: tool panels with string ids: full-height columns per side, each with its own width; folding to a
  title bar or a rail; give-way by age when the pages run out of room; resizable floats, some pinned to the view;
  their drop targets; and a stored form.

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
its side's rail. Panels may float instead, in page space (they move with the page's offset and scale) or pinned to
the view. The output is geometry and structure only: each panel's rect, layer, `kind` (`column`, `bar`, `segment`,
`float`) and its folded, kept and pinned flags, the columns, the rails, the pages' rect and coded notes. Chrome sizes
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
focusing, moving and unfolding; `opened` only opening). Ties go to the outer column, then the left side. A column
holding a kept panel (`keep(state, id, true)`) comes after every other one; when only kept columns are left and the
pages still don't fit, they fold too. Give-way never writes `folded`, so widening the stage brings a column back.

**Floats** (`options.floats`, default `"clamp"`): a float that fits the view stays wholly inside it; one that doesn't
even at its minimum size keeps its title bar and `floatVisible` (default 48) px of its width in the view. The clamp
runs at layout time and the state keeps the stored rect, so a larger view brings a float back where it was.
`"free"` never moves a float.

**Changes** are pure: `open`, `close`, `focus`, `toggleFold`, `keep`, `dock(state, id, side, index, { into?, width? })`,
`float`, `pin(state, id, on, view?)`, `resizeColumn`, `resizeFloat`.

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

`storePanels(state)` gives `{ v: 1, sides, floats, folded, kept, closed, clock }`; `readPanels(data, defs?)` reads
parsed data back and never throws. Anything but an object of version 1 is `{ ok: false, error }`; inside one, unknown
or repeated ids and malformed entries are dropped and listed in `dropped`, and widths and float sizes are clamped to
the defs. The note codes (`PanelsNoteCode`):

| Code | Says | Also |
|---|---|---|
| `column-shrunk` | a column narrowed toward its minimum | `side`, `column`, `items`, `from`, `to` |
| `column-folded` | a column folded to its side's rail | `side`, `column`, `items` |
| `kept-folded` | a kept column folded: the pages needed the room | `side`, `column`, `items` |
| `pages-under-min` | the pages are under `pagesMin` with every column folded | `width`, `min` |
| `float-resized` | a float shrank to fit the view | `items` |
| `float-clamped` | a float moved to stay in the view | `items` |

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
