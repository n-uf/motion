/**
 * @n-uf/placement/tiling: panes that divide an area between them, with no overlap. Two models:
 *
 * - **Order layouts** (`masterStack`, `columns`, `grid`): panes in order, a rect each. A drop reorders: the dragged
 *   pane is inserted at an index (`orderTargets`).
 * - **The split tree** (`Split`, `layoutSplit`): each node splits its rect in two. A drop splits a pane on a side or
 *   swaps with it (`paneTargets`, `paneRegion`, `dropOnPane`); `splitFromOrder` builds dwindle (split along the longer
 *   side).
 *
 * Both give root `Target`s, for `@n-uf/motion/drag`. `giveWay` floats the newest pane while one breaks its minimum.
 * Pure: no DOM, no time.
 *
 * See docs/placement.md, Entry: tiling.
 */
export { columns, grid, masterStack, type OrderLayout, type TileOptions } from "./order";
export { dropOnPane, panesOf, removePane, splitFromOrder, splitPane, swapPanes, type Split } from "./split";
export { layoutSplit } from "./layout";
export { PANE_REGION_DEFAULTS, PANE_SIDES, paneCenter, paneRegion, type PaneCenter, type PaneRegion, type PaneRegionOptions, type PaneSide } from "./regions";
export { orderTargets, paneTargets, type OrderTarget, type PaneTarget, type PaneTargetsOptions } from "./targets";
export { giveWay } from "./give-way";
