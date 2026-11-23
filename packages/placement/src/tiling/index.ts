/**
 * @n-uf/placement/tiling: panes that divide an area between them, with no overlap. Two models:
 *
 * - **Order layouts** (`masterStack`, `columns`, `grid`): panes in order, a rect each. `masterStack` takes a master
 *   count and side. A drop reorders: the dragged pane is inserted at an index (`orderTargets`).
 * - **The split tree** (`Split`, `layoutSplit`, `layoutSplitTree`): each node splits its rect in two, the middle of
 *   the gutter (gap plus handle) at the ratio; options read a host's floors and fixed lengths, and a split with an id
 *   reports its box, ratio and divider. A split may lay its panes out as master and stack. A drop splits a pane on a
 *   side or swaps with it (`paneTargets`, `paneRegion`, `dropOnPane`), and `canDropOnPane` says whether it leaves
 *   room (a host with its own projected layout asks the two rules apart: `canSplitPane` and `dropFits`);
 *   `splitFromOrder` builds dwindle (split along the longer side).
 *
 * `neighbor` finds the nearest pane in a direction from a map of rects. Both models give root `Target`s, for
 * `@n-uf/motion/drag`. `masterRatio` and `masterCount` are the master area's clamps, for a host that lays out its own.
 * `Rect` is the root's type, re-exported. `giveWay` floats the newest pane while one breaks its minimum. Pure: no DOM, no time.
 *
 * See docs/placement.md, Entry: tiling.
 */
export type { Rect } from "../geometry";
export { columns, grid, masterCount, masterRatio, masterStack, type MasterOptions, type OrderLayout, type OrderOptions, type TileOptions } from "./order";
export { dropOnPane, panesOf, removePane, splitFromOrder, splitPane, swapPanes, type Split } from "./split";
export { canDropOnPane, canSplitPane, dropFits, type DropFitsOptions, type DropOptions, type DropVerdict, type SplitRoomOptions } from "./drop";
export { layoutSplit, layoutSplitTree, type FixedLength, type MinLength, type SplitGeometry, type SplitLayout, type SplitOptions } from "./layout";
export { PANE_REGION_DEFAULTS, PANE_SIDES, paneCenter, paneRegion, type PaneCenter, type PaneRegion, type PaneRegionOptions } from "./regions";
export { orderTargets, paneTargets, type OrderTarget, type PaneTarget, type PaneTargetsOptions } from "./targets";
export { giveWay } from "./give-way";
export { neighbor, type Direction } from "./neighbor";
