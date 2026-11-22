# @n-uf/placement

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/placement is young and still changing. Its API (the edge cut and fit, the form vocabulary, one edge's drop places, tiling and the popup positioner) is not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md) before you upgrade.

Where things fit. The stage cut into bands along its sides, the items along one band fitted with their forms (an open panel folds to a header, then a rail icon, then the » menu, and comes back in exact reverse), one band's drop places with the fit each drop makes, floats kept clear of what is docked, panes tiled and popups positioned. Geometry in, rects out: pure functions over plain data, with no DOM, no framework, no motion and no dependencies.

A whole window's docking model (edges, rails, floats, drop targets, lanes and a stored form) is built on this layer in [`@n-uf/docking`](https://www.npmjs.com/package/@n-uf/docking).

```sh
npm i @n-uf/placement
```

## Entry points

| Entry | What it gives |
|---|---|
| `@n-uf/placement/stack` | One edge: the cut of the stage into bands (`cutEdges`), the fit of its items (`fitStack`) in the form vocabulary every item declares its forms in (`StackForm`, with the flags `body`, `folded`, `compact`), its drop places (`stackGaps`) and the float fit (`fitFloat`). |
| `@n-uf/placement/tiling` | Panes that divide an area. Order layouts (`masterStack`, `columns`, `grid`), the split tree (`layoutSplit`, `layoutSplitTree`, with gaps, handles, floors and fixed lengths, `dropOnPane`, `canDropOnPane`), `neighbor` and the drop targets. |
| `@n-uf/placement/popup` | A popup positioned as Wayland's xdg-positioner does (`positionPopup`). |
| `@n-uf/placement` | The shared shapes (`Rect`, `Size`, `Point`), the geometry and the `Target` shape. |

## One edge

`fitStack` picks one form per item for the length it gets; `stackGaps` gives every gap where a dragged item fits, each with the fit its drop makes, and the reason where it doesn't.

```ts
import { fitStack, stackGaps, type StackForm, type StackItem } from "@n-uf/placement/stack";

const form = (kind: StackForm["kind"], min: number, natural: number, cross: number): StackForm => ({ kind, main: { min, natural }, cross: { natural: cross } });
const group = (id: string, used: number): StackItem => ({ id, used, forms: [form("row", 100, 100, 26), form("fold", 36, 36, 26), form("menu", 0, 0, 0)] });
const title: StackItem = { id: "title", used: 0, fixed: true, forms: [{ kind: "row", main: { min: 80, natural: 160, grows: true }, cross: { natural: 26 } }] };
const controls: StackItem = { id: "controls", used: 0, fixed: true, forms: [form("row", 72, 72, 26)] };
const bar = { axis: "row", length: 400, cross: { min: 36, max: 40 }, items: [title, group("views", 1), group("tools", 2), controls] } as const;

console.log(fitStack(bar).items.map((p) => [p.id, p.kind, p.rect.width]));
// [ [ 'title', 'row', 128 ], [ 'views', 'row', 100 ], [ 'tools', 'row', 100 ], [ 'controls', 'row', 72 ] ] (the title grows into the spare room)
const gaps = stackGaps(bar, group("marks", 4));
console.log(gaps.map((g) => (g.fits ? [g.at, g.slot.x] : [g.at, g.reason])));
// [ [ 0, 0 ], [ 1, 92 ], [ 2, 128 ], [ 3, 228 ], [ 4, 300 ] ] (the title gives back what it grew into; Views folds)
```

## Panes

Panes that divide an area with no overlap and no hole. A drop on a pane goes by the pane's drop region: the center swaps, a side splits. The targets are the shape `@n-uf/motion/drag`'s drag intent takes.

```ts
import { dropOnPane, layoutSplit, paneTargets, splitFromOrder } from "@n-uf/placement/tiling";

const area = { x: 0, y: 0, width: 800, height: 400 };
const tree = splitFromOrder(["a", "b"]);
const after = dropOnPane(tree, "c", "b", "top");
console.log(layoutSplit(after, area).get("c")); // { x: 400, y: 0, width: 400, height: 200 }
console.log(paneTargets(layoutSplit(tree, area)).map((t) => t.id)); // [ 'pane:a', 'pane:b' ]
```

A split puts the middle of its gutter (its gap plus its handle) at its ratio. `layoutSplitTree` also reports the box, ratio and divider of each split that has an `id`. The `floor`, `fixed` and `fixedAcross` options read a host's minimums and fixed lengths, `canDropOnPane` says whether a drop leaves room, and `neighbor` finds the nearest pane in a direction.

```ts
import { layoutSplitTree } from "@n-uf/placement/tiling";

const split = { id: "main", a: { pane: "a" }, b: { pane: "b" }, axis: "x" as const, ratio: 0.3 };
const { panes, splits } = layoutSplitTree(split, { x: 0, y: 0, width: 1000, height: 600 }, { gap: 6, handle: 4 });
console.log(panes.get("a")?.width, panes.get("b")?.x); // 295 305
console.log(splits.get("main")?.divider); // { x: 295, y: 0, width: 10, height: 600 }
```

## Documentation

- [Design page](https://github.com/n-uf/motion/blob/main/docs/placement.md): the concept, the rules a consumer relies on, and the SDK entry by entry.
- [Reference](https://github.com/n-uf/motion/blob/main/docs/placement-reference.md): every entry point's rules, options and longer examples.
- [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md): what changed, and where the window model went.
- Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

Its siblings: [`@n-uf/docking`](https://www.npmjs.com/package/@n-uf/docking) is the window's docking model built on it, [`@n-uf/motion`](https://www.npmjs.com/package/@n-uf/motion) owns how things move.

## License

[PolyForm Perimeter 1.0.1](https://github.com/n-uf/motion/blob/main/LICENSE).
