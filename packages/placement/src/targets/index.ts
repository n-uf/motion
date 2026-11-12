/**
 * @n-uf/placement/targets: drop-target lists for the desk, toolbar groups and tiling, in the shape
 * @n-uf/motion/drag takes (`{ id, priority, hit, slot?, label?, free? }`), so a drag intent can pick among them.
 */
export type { Target } from "./target";
export { SNAP, deskDrop, deskTargets, type DeskDrop, type DeskTarget, type DeskTargetInput, type Made } from "./desk";
export { LINE_REACH, ZONE_REACH, floatTarget, hostTargets, type HostTargetsInput, type ToolbarFloatTarget, type ToolbarTarget } from "./toolbar";
export { orderSlots, treeSlots, type OrderSlot, type TilingSlot, type TreeSlot } from "./tiling";
