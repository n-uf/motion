/**
 * A kit case as a lab page: the shell mounts one `KitCase` (src/kits/cases.ts) into the page, on its own frame loop,
 * with a table of its scenarios under it. `window.__motionLab.runAll()` runs the case's scenarios; the header's
 * Reset puts its windows back.
 */
import { createFrameLoop } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import type { Row } from "../shared/checks";
import { passes, type LabRun, type ScenarioFilter } from "../shared/hooks";
import type { KitCase, KitScenario, MountedCase } from "../kits/kit-case";
import "../kits/kits.css";
import { onReset } from "./api";

export function mountKitCase(kc: KitCase, host: HTMLElement): void {
  const loop = createFrameLoop({ clock: createBrowserClock() });
  const section = document.createElement("section");
  section.id = `case-${kc.id}`;
  host.append(section);
  const c: MountedCase = kc.mount(section, loop);
  onReset(c.reset);

  const checks = document.createElement("section");
  checks.innerHTML = `<h2>Scenarios</h2>
    <p class="readout"><button type="button" class="lab-btn">Run this case's scenarios</button> Each one drives a window with real pointer or key events and checks what the page drew.</p>
    <table><thead><tr><th>Scenario</th><th>Result</th></tr></thead><tbody></tbody></table>`;
  host.append(checks);
  const runsBody = checks.querySelector("tbody")!;
  const runButton = checks.querySelector("button")!;
  const runs: LabRun[] = [];
  let lastRows: Row[] = [];
  let running = false;

  async function runScenario(sc: KitScenario): Promise<LabRun> {
    const failures: string[] = [];
    const expect = (ok: boolean, msg: string): void => {
      if (!ok) failures.push(msg);
    };
    c.reset();
    await c.idle();
    try {
      await sc.play(expect);
    } catch (e) {
      failures.push(`threw: ${String(e)}`);
    } finally {
      (document.activeElement as HTMLElement | null)?.blur?.();
      c.reset();
      await c.idle();
    }
    const rows: Row[] = [{ name: sc.name, result: { ok: failures.length === 0, failures } }];
    lastRows = rows;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td class="${failures.length ? "bad" : "ok"}"></td>`;
    tr.children[0]!.textContent = sc.name;
    tr.children[1]!.textContent = failures.length ? failures.slice(0, 3).join(" · ") : "ok";
    runsBody.append(tr);
    return { scenario: sc.name, mode: "snap", failed: failures.length ? [sc.name] : [], rows };
  }

  async function runAll(filter?: ScenarioFilter): Promise<LabRun[]> {
    if (running) return [];
    running = true;
    runButton.disabled = true;
    runsBody.replaceChildren();
    const out: LabRun[] = [];
    try {
      for (const sc of c.scenarios) if (passes(sc.name, filter)) out.push(await runScenario(sc));
    } finally {
      running = false;
      runButton.disabled = false;
    }
    runs.splice(0, runs.length, ...out);
    return out;
  }
  runButton.addEventListener("click", () => void runAll());
  window.__motionLab = { runAll, runs, lastRows: () => lastRows };
}
