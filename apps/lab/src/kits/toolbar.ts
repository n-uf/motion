/**
 * The kit cases on one page (until the lab shell mounts each as a page of its own): every case's windows, on the
 * real @n-uf/motion and @n-uf/placement. `window.__motionLab.runAll()` runs every case's scenarios.
 */
import { createFrameLoop } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import type { Row } from "../shared/checks";
import type { LabRun } from "../shared/hooks";
import { KIT_CASES } from "./cases";
import type { KitScenario, MountedCase } from "./kit-case";

const loop = createFrameLoop({ clock: createBrowserClock() });
const root = document.getElementById("cases")!;
const mounted: { readonly c: MountedCase; readonly title: string }[] = [];
for (const kc of KIT_CASES) {
  const section = document.createElement("section");
  section.id = `case-${kc.id}`;
  const h = document.createElement("h2");
  h.textContent = kc.title;
  section.append(h);
  root.append(section);
  mounted.push({ c: kc.mount(section, loop), title: kc.title });
}

const runsBody = document.getElementById("runs")!;
const runButton = document.getElementById("runall") as HTMLButtonElement;
const runs: LabRun[] = [];
let lastRows: Row[] = [];
let running = false;

async function runScenario(c: MountedCase, sc: KitScenario): Promise<LabRun> {
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

async function runAll(filter?: string): Promise<LabRun[]> {
  if (running) return [];
  running = true;
  runButton.disabled = true;
  runsBody.replaceChildren();
  const out: LabRun[] = [];
  try {
    for (const { c } of mounted) for (const sc of c.scenarios) if (!filter || sc.name.includes(filter)) out.push(await runScenario(c, sc));
  } finally {
    running = false;
    runButton.disabled = false;
  }
  runs.splice(0, runs.length, ...out);
  return out;
}
runButton.addEventListener("click", () => void runAll());

window.__motionLab = { runAll, runs, lastRows: () => lastRows };
