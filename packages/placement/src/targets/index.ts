/**
 * @n-uf/placement/targets: drop-target lists for the desk and toolbar groups, in the shape
 * @n-uf/motion/drag takes (`{ id, priority, hit, slot?, label?, free? }`), so a drag intent can pick among them.
 */
export type { Target } from "./target";
export { SNAP, deskDrop, deskTargets, type DeskDrop, type DeskTarget, type DeskTargetInput, type Made } from "./desk";
export { LINE_REACH, ZONE_REACH, floatTarget, hostTargets, type Allows, type FloatTargetInput, type HostTargetsInput, type ToolbarFloatTarget, type ToolbarTarget } from "./toolbar";
export { HOST_READING_ORDER, keyboardStops, type KeyboardStop, type KeyboardStopsOptions } from "./stops";
export { PANE_EDGES, PANE_ZONE_DEFAULTS, paneCentre, paneZone, type PaneCentre, type PaneZone, type PaneZoneOptions } from "./zones";