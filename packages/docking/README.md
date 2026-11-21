# @n-uf/docking

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/docking is young and still changing. Its API (the dock state and its solver, the drop targets and lanes, the conformance rows) is not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things. Pin an exact version and read the [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/docking/CHANGELOG.md) before you upgrade.

Where panels and toolbars dock. A window's edges (bars, rails and columns), items and floats are one plain-data model, a dock state, solved into a layout; every drag gets its drop targets, refusals and lanes, each target carrying the state and layout a release there makes, so the preview is the result. Pure functions over plain data, with no DOM, no framework and no motion; one dependency, [`@n-uf/placement`](https://www.npmjs.com/package/@n-uf/placement), which fits each edge. Rendering stays in the app: it draws the rects, measures its items and feeds pointer samples to a drag intent.

```sh
npm i @n-uf/docking @n-uf/placement
```

## Entry points

| Entry | What it gives |
|---|---|
| `@n-uf/docking` | One model of a whole window: `solve` for every rect, `targets` and `refusals` for every drag, `dockDrag` for a landing model (its `after(state)`: the one layout a held frame draws and its release commits; `lanes` for hit-testing), pure changes (`moveTo`, `foldItem`, `floatAt`, `resizeEdge`, ...) and a stored form (`storeDockState`, `readDockState`). |
| `@n-uf/docking/testing` | Conformance rows (`CASES`, `LANDING_CASES`), runners (`runCase`, `runLandingCases`) and reference hosts (`createReferenceHost`, `createLandingHost`) that a host's test suite plays against the model, and `AssertLanding`, a type check that the lanes fit `@n-uf/motion/drag`'s landing model. |

Items declare their forms in `@n-uf/placement/stack`'s vocabulary (`StackForm`).

## A window

A dock state is the stage, its edges, the items with their forms, the floats and the rects they keep clear of. `solve` gives every rect to draw; `targets` gives every drop target for one item, and a drop's `after()` is the state to store and the layout to draw.

```ts
import { readDockState, solve, storeDockState, targets, type DockItem, type DockState } from "@n-uf/docking";
import type { StackForm } from "@n-uf/placement/stack";

const f = (kind: StackForm["kind"], min: number, natural: number, cross: number, more: Partial<StackForm> = {}): StackForm => ({ kind, main: { min, natural }, cross: { natural: cross }, ...more });
const panel = (id: string, used: number): DockItem => ({
  id, kind: "panel", used,
  forms: { column: [f("open", 120, 240, 260, { main: { min: 120, natural: 240, grows: true }, cross: { natural: 260, min: 180 } }), f("header", 28, 28, 260, { cross: { natural: 260, min: 60 } }), f("rail", 28, 28, 30), f("menu", 0, 0, 0)] },
});
const group = (id: string, used: number, align?: "end"): DockItem => ({
  id, kind: "group", used, ...(align ? { align } : {}),
  forms: { row: [f("row", 180, 200, 28), f("icons", 84, 84, 28), f("menu", 0, 0, 0)], column: [f("stacked", 96, 96, 84), f("icons", 84, 84, 28), f("menu", 0, 0, 0)] },
});
const fixed = (id: string, kind: string, form: StackForm, align?: "center" | "end"): DockItem => ({ id, kind, used: 0, fixed: true, forms: { row: [form] }, ...(align ? { align } : {}) });
const bar = { accepts: ["group"], cross: { min: 36, max: 36, rail: 36 }, gap: 4, pad: { start: 8, end: 8 } };
const column = { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } };
const items = [
  fixed("title", "title", f("row", 80, 160, 32, { main: { min: 80, natural: 160, grows: true } })),
  fixed("controls", "controls", f("row", 84, 84, 32), "end"),
  fixed("readout", "readout", f("row", 72, 72, 28), "center"),
  panel("pages", 1), panel("findings", 2), panel("notes", 3),
  group("views", 4), group("tools", 5), group("zoom", 6, "end"), group("search", 7, "end"), group("marks", 8),
];
const state: DockState = {
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
const layout = solve(state);
console.log(layout.content); // { x: 260, y: 68, width: 680, height: 704 }
const drops = targets(state, "views", { previous: layout });
const drop = drops.find((t) => t.id === "gap:right:start:2")!.after({ x: 0, y: 0 });
console.log(JSON.stringify(solve(drop.state, { previous: layout })) === JSON.stringify(drop.layout)); // true
console.log(readDockState(JSON.parse(JSON.stringify(storeDockState(drop.state))), state).dropped); // []
```

## Testing a host

```ts
import { targetAt } from "@n-uf/motion/drag";
import { CASES, createReferenceHost, runCases } from "@n-uf/docking/testing";

const results = runCases(CASES, () => createReferenceHost({ pick: targetAt })); // a page's host plays the same rows
```

The landing rows (`LANDING_CASES`, `runLandingCases`) check a host that drags with `@n-uf/motion/drag`'s landing model,
the hand rule included: while a lane holds, the landing is the nearest in its lane to the pointer, within
`handBound(g)` = `max(48, g / 2 + 6)` px of it ([decision 0001](https://github.com/n-uf/motion/blob/main/docs/decisions/0001-the-hand-rule.md)).

## Documentation

- [Design page](https://motion.n-uf.com/docs/docking/): the concept, the parts, the rules a consumer relies on, and the SDK entry by entry.
- [Reference](https://github.com/n-uf/motion/blob/main/docs/docking-reference.md): every rule, id, option and longer examples.
- [CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/docking/CHANGELOG.md): what changed, and how to move from `@n-uf/placement/scene`.
- Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

Its siblings: [`@n-uf/placement`](https://www.npmjs.com/package/@n-uf/placement) fits one edge, [`@n-uf/motion`](https://www.npmjs.com/package/@n-uf/motion) owns how things move.

## License

[PolyForm Perimeter 1.0.1](https://github.com/n-uf/motion/blob/main/LICENSE).
