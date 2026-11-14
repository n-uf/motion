/**
 * What the Stack pages' scenario files share: a row, a rect comparison and the `runAll` hook the Checks page and the
 * headless runs call (`window.__motionLab.runAll(filter?)`). Each scenario drives its page, then asserts: a failed
 * assertion is a row with a message, never a printed number.
 */
import type { Rect } from "@n-uf/motion";
import { verdict, type Row } from "../shared/checks";
import { passes, type LabRun, type ScenarioFilter } from "../shared/hooks";

export interface Scenario<P> {
  readonly name: string;
  readonly modes: readonly string[];
  run(p: P, mode: string): Promise<Row[]>;
}

/** One checked rule: its failures (none: it passes) and an optional note. */
export const row = (name: string, failures: readonly string[], info?: string): Row => ({ name, result: verdict(failures), ...(info ? { info } : {}) });

/** Collects failures for one rule: `ok(cond, message)` records the message when `cond` is false. */
export function rule(name: string, body: (ok: (cond: boolean, message: string) => void) => void | Promise<void>): Promise<Row> {
  const failures: string[] = [];
  const ok = (cond: boolean, message: string): void => {
    if (!cond && failures.length < 6) failures.push(message);
  };
  return Promise.resolve(body(ok)).then(() => row(name, failures));
}

/** Two rects the same within `tol` px. */
export const near = (a: Rect, b: Rect, tol = 0.5): boolean => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.width - b.width) <= tol && Math.abs(a.height - b.height) <= tol;
export const fmt = (r: Rect | null | undefined): string => (r ? `${Math.round(r.x * 10) / 10},${Math.round(r.y * 10) / 10} ${Math.round(r.width * 10) / 10} × ${Math.round(r.height * 10) / 10}` : "none");

/** Install `window.__motionLab` for a page: its scenarios, run one at a time, and a table of the last run. */
/** `after` runs once a run is over (after the last reset): a page puts back what the person was looking at. */
export function install<P>(page: P, scenarios: readonly Scenario<P>[], reset: () => void | Promise<void>, runButton: HTMLButtonElement, table: HTMLTableSectionElement, after?: () => void): void {
  const runs: LabRun[] = [];
  let lastRows: Row[] = [];
  let running = false;
  const render = (): void => {
    table.innerHTML = runs
      .map((r) => {
        const why = r.rows.filter((x) => x.result && !x.result.ok).map((x) => `${x.name}: ${x.result!.failures.slice(0, 2).join("; ")}`);
        return `<tr><td>${r.scenario}</td><td>${r.mode}</td><td class="${r.failed.length ? "bad" : "ok"}">${r.failed.length ? "✗" : "✓"}</td><td>${why.join(" · ")}</td></tr>`;
      })
      .join("");
  };
  async function runEach(filter?: ScenarioFilter): Promise<LabRun[]> {
    runs.length = 0;
    for (const s of scenarios) {
      if (!passes(s.name, filter)) continue;
      for (const mode of s.modes) {
        await reset();
        let rows: Row[];
        try {
          rows = await s.run(page, mode);
        } catch (e) {
          rows = [row("the scenario ran", [String(e)])];
        }
        lastRows = rows;
        runs.push({ scenario: s.name, mode, failed: rows.filter((r) => r.result && !r.result.ok).map((r) => r.name), rows });
        render();
      }
    }
    await reset();
    render();
    return [...runs];
  }
  async function runAll(filter?: ScenarioFilter): Promise<LabRun[]> {
    // One run at a time: two would drive the same page.
    if (running) return [];
    running = true;
    try {
      return await runEach(filter);
    } finally {
      running = false;
      after?.();
    }
  }
  runButton.addEventListener("click", async () => {
    runButton.disabled = true;
    await runAll();
    runButton.disabled = false;
  });
  window.__motionLab = { runAll, runs, lastRows: () => lastRows };
}
