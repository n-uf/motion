/** The hooks each lab page puts on `window.__motionLab` for headless runs (scripts/run-all.mjs). */
import type { Row } from "./checks";

/** One scenario run: which rules failed, under which motion or drop preview (`mode`). */
export interface LabRun {
  readonly scenario: string;
  readonly mode: string;
  readonly failed: string[];
  readonly rows: Row[];
}

/** Which scenarios to run: those whose name contains the string, or passes the test. */
export type ScenarioFilter = string | ((name: string) => boolean);
/** Whether scenario `name` passes `filter` (no filter: every one does). */
export const passes = (name: string, filter?: ScenarioFilter): boolean => (filter === undefined || filter === "" ? true : typeof filter === "string" ? name.includes(filter) : filter(name));

export interface LabHooks {
  /** Run the page's scenarios: only those whose name contains `filter` (or passes it), when given. */
  runAll: (filter?: ScenarioFilter) => Promise<LabRun[]>;
  runs: LabRun[];
  lastRows: () => Row[];
  /** The desk page: what gates a snap ("hover" only to check that the scenarios catch an ungated snap). */
  snapGate?: (gate: "model" | "hover") => void;
}

declare global {
  interface Window {
    __motionLab: LabHooks;
  }
}
