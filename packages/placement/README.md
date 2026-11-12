# @n-uf/placement

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/placement is young and still changing. Its API (the tiling layouts, the desk constructions, the toolbar model and the drop targets) is not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md) before you upgrade.

Where things go. State in, rects and drop targets out: tiling layouts and split trees, a desk of docks, rails and
palettes, toolbar groups in hosts and zones, and the drop targets for each. Pure functions over plain data: no DOM,
no framework, no motion, no dependencies.

```sh
npm i @n-uf/placement
```

Its sibling [`@n-uf/motion`](https://www.npmjs.com/package/@n-uf/motion) owns how things move. The two compose
without importing each other: a target list from `@n-uf/placement/targets` is exactly what
`@n-uf/motion/drag`'s drag intent takes, and a rect from any layout here is what `@n-uf/motion/layout` glides to.

- **`@n-uf/placement`**: the shapes (`Rect`, `Size`, `Point`) and a popup positioner (anchor, gravity, offset,
  then flip, slide, resize, as Wayland's xdg-positioner).
- **`/tiling`**: equal columns, a grid, master and stack, dwindle; the split tree and its operations (split beside,
  remove, swap, move, split ratio); stacked columns at natural heights; the minimum-size give-way (the newest tile
  that breaks a minimum floats).
- **`/dock`**: a desk of documents and tool panels. Side docks and a bottom dock (between the side docks or across
  the full width), rails, natural-height sections whose last one takes the rest, fold and unfold, the give-way
  rules (sections fold least recently used first, docks fold to their rails), floating palettes with corner stacks,
  tear-off and dock-back; and nine constructions built from these parts, as presets (`createDesk`).
- **`/toolbar`**: toolbar groups in five hosts (title, top, bottom, left, right) and three zones (start, centre,
  end), floating groups, insertion points (before all, between, after all, an empty zone), trailing-first overflow,
  and "own place is home".
- **`/targets`**: drop targets (`{ id, priority, hit, slot?, label?, free? }`) for the desk's constructions,
  toolbar hosts and tiling.

Rendering stays in the app: it draws the rects, measures its groups, and feeds pointer samples to a drag intent.

## Tiling

```ts
import { layoutTree, setSplitRatio, splitLeaf, treeFromOrder } from "@n-uf/placement/tiling";

const area = { x: 0, y: 0, width: 1006, height: 600 };
let tree = treeFromOrder([1, 2]); // 1 | 2
tree = splitLeaf(tree, 2, 3, false); // 2 splits: 3 goes below it
tree = setSplitRatio(tree, 1, 0.6); // 1 takes 60 % of the width
const rects = layoutTree(tree, area, 6);
console.log(rects.get(1)!.width, rects.get(3)!.y); // 600 303
```

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
console.log(items.get("panel:3")!.look, notes); // header [ 'bottom dock folded to its header' ]
```

Each construction is `{ id, title, idea, initial(docs, size?), layout(state, size, options) }`. A layout returns a
`Placed` per item (its rect, look, layer, and whether it is hidden, has a minimum or may scroll off the stage) and
notes saying how it gave way.

## Toolbar groups

```ts
import { arrangement, layoutHost } from "@n-uf/placement/toolbar";

const a = arrangement({ top: { start: ["file", "edit"], end: ["share"] } });
const size = (_id: string, _vertical: boolean, collapsed: boolean) => ({ along: collapsed ? 30 : 120, across: 28 });
const top = layoutHost(a.top, "top", { length: 320, thickness: 34, lead: 8, tail: 8 }, size);
console.log(top.overflow); // [ 'share' ]
```

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
returned as `own`, for the drag's home) and `floatTarget`; tiling's from `treeSlots` and `orderSlots`.

## License

[PolyForm Perimeter 1.0.1](./LICENSE).
