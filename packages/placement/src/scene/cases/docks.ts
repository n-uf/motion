/**
 * Which rows need docked panels (`requires: { docks: true }`): those whose expected outcome depends on panels being
 * docked (in columns or rails, an order along an edge, or a docked panel's rect or form). A host that docks panels only
 * from some stage width (`CaseHost.dockMinWidth`) has the runner skip them below it. The list is audited: a test
 * recomputes it from every row's expectations and the reference host's layout, and fails when the two differ.
 */
import type { CaseRow } from "./types";

const DOCKED = new Set([
  "C6", "C8", "C9", "C9b", "C18", "C23", "C23b", "C2", "C10", "C10b", "C11", "C21", "C1", "C3", "C4", "C20", "C22", "C7",
  "C13", "C14", "C14b", "C15", "C16", "T6", "C24", "C25", "C25b", "C25b-control-column", "C26a", "C26b", "C28",
  "R4-band-at-a-boundary", "R4b-leaving-the-band", "R4-no-gap-over-a-body", "R4-between-gap-is-its-own-slot",
  "R5-group-into-the-tray", "R5-group-is-offered-no-gap-above-the-tray", "R5-group-never-opens-a-column",
  "R5-panel-opens-an-empty-column", "P1-lift-follows-and-nothing-reflows", "P2-drop-into-another-column-at-a-position",
  "P3-restore-pages-above-annotations", "P4-escape-cancels", "P5-own-place-is-a-no-op", "P5-gap-beside-it",
  "P5-neighbour-half-facing-it", "P6-new-outer-column-from-outside", "P6-outer-line-at-11-px",
  "P6-new-outer-column-from-inside", "P6-left-outer-edge", "P6-between-columns-line", "P7-end-reach",
  "P8-folded-bar-drags-like-a-card", "P9-rail-segment-on-its-own-rail", "P9-to-the-other-rail",
  "P10-float-keeps-its-place-and-last-size", "P11-a-float-never-covers-chrome", "P11-big-stored-float-is-clamped",
  "P12-a-press-is-no-use", "P12b-a-press-is-no-use-by-the-stored-ages", "P13-kinds", "P13-a-group-never-gets-panel-targets",
  "P14-open-close-and-dock-at-default", "P14b-dock-after-a-column-id-is-reused", "P15-stops-for-the-keyboard",
  "P15-rail-stop-then-dock", "P16-first-px-left", "P16-first-px-right", "P16-outer-reach-is-the-column-line",
  "P16-own-column-line-is-home", "window-a-three-808", "window-a-three-807", "window-a-three-620", "window-a-three-619",
  "window-a-three-576", "window-a-three-575", "window-a-three-807-walk", "window-a-three-619-walk", "window-a-pair-808",
  "window-a-pair-807", "window-a-pair-620", "window-a-pair-619", "window-a-bare-760", "window-a-bare-759",
  "window-a-bare-576", "window-a-bare-575", "window-b-three-720", "window-b-three-719", "window-b-three-552",
  "window-b-three-551", "window-b-three-520", "window-b-three-519", "window-b-three-552-walk", "window-b-three-551-walk",
  "window-b-pair-720", "window-b-pair-719", "window-b-pair-590", "window-b-pair-552", "window-b-pair-551",
  "window-a-hand-bar", "window-a-hand-ride", "window-a-hand-all",
]);

/** `rows`, each one that needs docked panels carrying `requires: { docks: true }` beside its other requirements. */
export const withDocks = (rows: readonly CaseRow[]): CaseRow[] =>
  rows.map((row) => (DOCKED.has(row.id) ? { ...row, requires: { ...row.requires, docks: true } } : row));
