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
 * A drag of a pane or a stack has one layout per held place: `tilingDrag(tree, subject, { ops, area, min })` over a
 * `TilingTree` adapter (the host's tree and changes; `splitTreeOps` is the reference one over `StackedSplit`) gives
 * the base (the tree with the subject released), home (the gap the release leaves) and `after(held)`, what a release
 * there commits and a frame holding it draws. `tilingConformance` runs its properties on a host's own adapter. Its hit
 * half, `hit("lift" | "base")`, is built once at the lift on that one layout: targets in `@n-uf/motion/drag`'s shape,
 * the one hold rule, and a reader of the intent's frame; `tilingHitConformance` runs its seven properties.
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
export { PANE_REGION_DEFAULTS, PANE_SIDES, paneCenter, paneRegion, paneRegionShapes, type PaneCenter, type PaneRegion, type PaneRegionOptions } from "./regions";
export {
  TILING_HIT_DEFAULTS,
  type TilingBasis,
  type TilingHit,
  type TilingHitFrame,
  type TilingHitIntent,
  type TilingHitOptions,
  type TilingHitRead,
  type TilingHitTarget,
  type TilingHold,
  type TilingMark,
  type TilingPart,
} from "./hit";
export { orderTargets, paneTargets, type OrderTarget, type PaneTarget, type PaneTargetsOptions } from "./targets";
export { giveWay } from "./give-way";
export {
  tilingDrag,
  type TilingAfter,
  type TilingDrag,
  type TilingDragOptions,
  type TilingHeld,
  type TilingLaidOut,
  type TilingMove,
  type TilingRefusal,
  type TilingSize,
  type TilingStack,
  type TilingSubject,
  type TilingTree,
} from "./drag";
export { splitTreeOps, type SplitTreeOpsOptions, type StackedSplit } from "./reference";
export { TILING_PROPERTIES, tilingConformance, tilingSubjects, type TilingConformance, type TilingProperty } from "./conformance";
export { TILING_HIT_PROPERTIES, tilingHitConformance, type TilingHitConformance, type TilingHitProperty } from "./hit-conformance";
export { neighbor, type Direction } from "./neighbor";
