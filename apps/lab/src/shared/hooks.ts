/** The hooks each lab page puts on `window.__motionLab` for headless runs (scripts/run-all.mjs). */
import type { Row } from "./checks";

/** One scenario run: which rules failed, under which motion or drop preview (`mode`). */
export interface LabRun {
  readonly scenario: string;
  readonly mode: string;
  readonly failed: string[];
  readonly rows: Row[];
}

export interface LabHooks {
  /** Run the page's scenarios (the desk page: only those whose name contains `filter`, when given). */
  runAll: (filter?: string) => Promise<LabRun[]>;
  runs: LabRun[];
  lastRows: () => Row[];
}

declare global {
  interface Window {
    __motionLab: LabHooks;
  }
}
