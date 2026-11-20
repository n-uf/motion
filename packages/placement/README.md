# @n-uf/placement

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/placement is young and still changing. Its API (the scene and its solver, the drop targets and lanes, and tiling) is not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md) before you upgrade.

Where things go. A window's edges (bars, rails and columns), items and floats are solved into a layout, and every drag gets its drop targets, refusals and lanes, each target carrying the layout a release there makes, so the preview is the result. State in, rects and drop targets out: pure functions over plain data, with no DOM, no framework, no motion and no dependencies. Rendering stays in the app: it draws the rects, measures its items and feeds pointer samples to a drag intent.

```sh
npm i @n-uf/placement
```

## Entry points

| Entry | What it gives |
|---|---|
| `@n-uf/placement/scene` | **The main entry.** One model of a whole window: `solve` for every rect, `targets` and `refusals` for every drag, `lanes` for a landing model, pure changes (`moveTo`, `fold`, `floatAt`, ...) and a stored form (`storeScene`, `readScene`). |
| `@n-uf/placement/stack` | A building block: the solver of one edge (`fitStack`) and the form vocabulary every item declares its forms in (`StackForm`). `./scene` lays out each of its edges with it. |
| `@n-uf/placement/scene/cases` | A building block: conformance rows (`CASES`, `LANDING_CASES`) and runners (`runCase`, `createSceneHost`) that a host's test suite plays against `./scene`. |
| `@n-uf/placement/tiling` | A building block: panes that divide an area. Order layouts (`masterStack`, `columns`, `grid`), the split tree (`layoutSplit`, `dropOnPane`) and their drop targets. |
| `@n-uf/placement` | The shared shapes (`Rect`, `Size`, `Point`), the geometry, the `Target` shape and the popup positioner (`positionPopup`). |

`./dock`, `./toolbar`, `./targets`, `./panels` and `./desk` are older entries, replaced by `./scene` and `./tiling`, to be removed.

## A window

A scene is the stage, its edges, the items with their forms, the floats and the chrome they keep clear of. `solve` gives every rect to draw; `targets` gives every drop target for one item, and a drop's `after()` is the scene to store and the layout to draw.

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

## Documentation

- [Design page](https://github.com/n-uf/motion/blob/main/docs/placement.md): the concept, the parts, the rules a consumer relies on, and the SDK entry by entry.
- [Reference](https://github.com/n-uf/motion/blob/main/docs/placement-reference.md): every entry point's rules, ids, options and longer examples.
- [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md)
- Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

Its sibling [`@n-uf/motion`](https://www.npmjs.com/package/@n-uf/motion) owns how things move.

## License

[PolyForm Perimeter 1.0.1](https://github.com/n-uf/motion/blob/main/LICENSE).
