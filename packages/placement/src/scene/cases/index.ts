/**
 * @n-uf/placement/scene/cases: the conformance rows for the Scene and the runner that plays them, so an integrating app's test suite and
 * the lab run the same rows.
 *
 * A row (`CaseRow`) is plain data: a `Scene`, the `settings` it runs at, the `gestures` a user makes, and the layout (and
 * DOM) expected after them. `runCase(row, host)` plays one on a `CaseHost` (`load`, `perform`, `layout`, and optionally
 * `root` and `itemSelector`) and says what differs; DOM checks are skipped, and listed, when the host has no root. A DOM
 * check names an item by `item`, found with the host's `itemSelector(id)` (default `[data-dock-item="<id>"]`). A host
 * that docks panels only from some stage width says so in `dockMinWidth`, and the runner skips the rows that need
 * docked panels (`requires.docks`) on a narrower stage. `createSceneHost()` is the
 * in-memory reference host: every row passes on it except the DOM checks. `CASES` is every row, `CASE_GROUPS` the groups.
 * `resolvePlace` is the pure step a host needs to aim a gesture's `place` with `targets()`, and `resizeStep` the pure
 * step of a `resize` gesture (an edge's size, an item measured again, the window's size). The pick rule (which target
 * the pointer is over) is `@n-uf/motion/drag`'s `targetAt`, taken as an input: `createSceneHost({ pick: targetAt })`,
 * `resolvePlace(…, targetAt)`, a host's `pick` (`PickRule`). `pickTarget`, the default when none is given, is deprecated.
 * `withRefusals(pick, refusals(scene, dragged))` is that rule with the scene's refusals: over a refused tile, where
 * nothing but the float would be picked, nothing is, and a release there puts the item back.
 * `runCaseAsync` and `runCasesAsync` play the same rows on an `AsyncCaseHost` (a page driven from a browser runner),
 * awaiting each host call.
 *
 * Pure data and logic: no DOM, no time, no globals.
 */
import { DOCKING_ROWS } from "./rows-docking";
import { BAR_ROWS } from "./rows-bars";
import { RULE_ROWS } from "./rows-rules";
import { GESTURE_ROWS } from "./rows-gestures";
import { WINDOW_ROWS } from "./rows-windows";
import { withDocks } from "./docks";
import type { CaseGroup, CaseRow } from "./types";

export { createSceneHost, END_REACH, LIFT_THRESHOLD, pickTarget, resizeStep, resolvePlace, withRefusals, type AimArea, type SceneHost, type SceneHostOptions } from "./host";
export { defaultItemSelector, layoutIssues, runCase, runCaseAsync, runCases, runCasesAsync } from "./run";
export { g } from "./gestures";
export { idRenames, mapGesture, mapLayout, mapPlace, mapScene, mapStored, type IdMap, type Rename } from "./ids";
export { WINDOW_A, WINDOW_B, WINDOW_BARE, winScene, type WinOptions, type WinSpec } from "./windows";
export {
  createLandingHost,
  LANDING_CASES,
  landingIssues,
  LANES_DEADLINE,
  LANES_SINCE,
  LAST_WITHOUT_LANES,
  lanesRatchet,
  runLandingCases,
  type LandingCase,
  type LandingCaseFrame,
  type LandingCaseGuide,
  type LandingCaseHost,
  type LandingCaseResult,
  type LandingModelLike,
  type LandingRegionName,
  type LandingRule,
} from "./landing";
export type { AsyncCaseHost, CaseGroup, CaseHost, CaseRequires, CaseResult, CaseRow, CaseSettings, Checkpoint, DomCheck, DomRoot, EdgeExpect, Gesture, GestureType, ItemExpect, LayoutExpect, PickCandidate, PickRule, StoredExpect } from "./types";

/**
 * Every row, in order: the docking cases, the bar cases, the built-in rules, the panel gestures, the two windows. The
 * rows that need docked panels carry `requires: { docks: true }` (see `./docks`).
 */
export const CASES: readonly CaseRow[] = withDocks([...DOCKING_ROWS, ...BAR_ROWS, ...RULE_ROWS, ...GESTURE_ROWS, ...WINDOW_ROWS]);

/** The groups rows are listed under, in order, with their titles. */
export const CASE_GROUPS: readonly { readonly id: CaseGroup; readonly title: string }[] = [
  { id: "panels", title: "Panels in a column" },
  { id: "groups", title: "Groups and toolbars" },
  { id: "drag", title: "Dragging" },
  { id: "floats", title: "Floats, saving, freeze" },
  { id: "bars", title: "Bars give way" },
  { id: "previous", title: "What previous keeps" },
  { id: "kinds", title: "Kinds, chrome and reserved room" },
  { id: "bands", title: "Gap hit areas, refits and slots" },
  { id: "gestures", title: "Panel gestures" },
  { id: "window-a", title: "Window A: width thresholds" },
  { id: "window-b", title: "Window B: width thresholds" },
];

/** The row with this id, or undefined. */
export const caseById = (id: string): CaseRow | undefined => CASES.find((c) => c.id === id);
