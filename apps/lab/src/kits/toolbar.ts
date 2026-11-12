/**
 * The kit toolbar cases page: three dossier windows on the real @n-uf/motion and @n-uf/placement.
 *
 * - 6 · Constraints: the kit filters the targets before the intent (Redact stays in the top bar, Share can't float).
 * - 7 · Keyboard moves: the arrows step through one ordered list of places, the same list "Move to ›" shows.
 * - 10 · Scaled page: the pointer is converted into page space before the intent reads it.
 *
 * `window.__motionLab.runAll()` runs the scenarios (same hooks as the other lab pages).
 */
import { createFrameLoop } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import type { LabRun } from "../shared/hooks";
import type { Row } from "../shared/checks";
import { createDossier, H, W, type GroupId, type KTarget } from "./dossier";
import { kitScenarios, type KitScenario } from "./scenarios";

const loop = createFrameLoop({ clock: createBrowserClock() });

/**
 * Case 6, the kit's rule: Redact stays in the top bar; Share can't float. Interim: placement's `allows(group, place)`
 * filter replaces this once it is on live.
 */
const constraint = (g: GroupId, t: KTarget): boolean => {
  if (g === "redact") return t.kind !== "float" && t.place.host === "top";
  if (g === "share") return t.kind !== "float";
  return true;
};

const host = (id: string): HTMLElement => document.getElementById(id)!;
const c6 = createDossier(host("c6"), { title: "Quarterly plan.pdf", loop, allows: constraint });
const c7 = createDossier(host("c7"), { title: "Quarterly plan.pdf", loop });
let scale = 0.7;
let convert = true;
const c10 = createDossier(host("c10"), { title: "Quarterly plan.pdf", loop, scale: () => scale, convert: () => convert });

// --- case 10's controls ---

const slider = document.getElementById("c10-scale") as HTMLInputElement;
const scaleOut = document.getElementById("c10-scale-out") as HTMLOutputElement;
const xrayBox = document.getElementById("c10-xray") as HTMLInputElement;
const convertBox = document.getElementById("c10-convert") as HTMLInputElement;
function setScale(s: number): void {
  scale = s;
  c10.el.style.transform = `scale(${s})`;
  // The scaled window's box: its border included.
  host("c10").style.width = `${(W + 2) * s}px`;
  host("c10").style.height = `${(H + 2) * s}px`;
  slider.value = String(s);
  scaleOut.textContent = s.toFixed(2);
}
function setConvert(on: boolean): void {
  convert = on;
  convertBox.checked = on;
}
slider.addEventListener("input", () => setScale(Number(slider.value)));
xrayBox.addEventListener("change", () => c10.setXray(xrayBox.checked));
convertBox.addEventListener("change", () => setConvert(convertBox.checked));
setScale(scale);

// --- case 7: the focused group's places, in order, the one shown marked ---

const stopsList = document.getElementById("c7-stops")!;
function showStops(): void {
  const g = (document.activeElement?.closest(".kgroup") as HTMLElement | null)?.dataset.group as GroupId | undefined;
  if (!g || !c7.el.contains(document.activeElement)) return;
  const k = c7.keyMove();
  stopsList.replaceChildren(
    ...c7.stops(g).map((t, i) => {
      const li = document.createElement("li");
      li.textContent = t.label;
      li.classList.toggle("on", !!k && k.g === g && k.i === i);
      return li;
    }),
  );
}
for (const type of ["focusin", "keyup", "click"]) c7.el.addEventListener(type, showStops);

const DOSSIERS = { c6, c7, c10 };
document.querySelectorAll<HTMLButtonElement>("button[data-reset]").forEach((b) => b.addEventListener("click", () => DOSSIERS[b.dataset.reset as keyof typeof DOSSIERS].reset()));

// --- scenarios ---

const SCENARIOS: readonly KitScenario[] = kitScenarios({ c6, c7, c10, setScale, setConvert });
const runsBody = document.getElementById("runs")!;
const runButton = document.getElementById("runall") as HTMLButtonElement;
const runs: LabRun[] = [];
let lastRows: Row[] = [];
let running = false;

function resetAll(): void {
  setConvert(true);
  setScale(0.7);
  for (const d of Object.values(DOSSIERS)) d.reset();
}

async function runScenario(sc: KitScenario): Promise<LabRun> {
  const failures: string[] = [];
  const expect = (ok: boolean, msg: string): void => {
    if (!ok) failures.push(msg);
  };
  resetAll();
  await Promise.all(Object.values(DOSSIERS).map((d) => d.idle()));
  try {
    await sc.play(expect);
  } catch (e) {
    failures.push(`threw: ${String(e)}`);
  } finally {
    (document.activeElement as HTMLElement | null)?.blur?.();
    resetAll();
    await Promise.all(Object.values(DOSSIERS).map((d) => d.idle()));
  }
  const rows: Row[] = [{ name: sc.name, result: { ok: failures.length === 0, failures } }];
  lastRows = rows;
  const run: LabRun = { scenario: sc.name, mode: "snap", failed: failures.length ? [sc.name] : [], rows };
  const tr = document.createElement("tr");
  tr.innerHTML = `<td></td><td class="${failures.length ? "bad" : "ok"}"></td>`;
  tr.children[0]!.textContent = sc.name;
  tr.children[1]!.textContent = failures.length ? failures.slice(0, 3).join(" · ") : "ok";
  runsBody.append(tr);
  return run;
}

async function runAll(filter?: string): Promise<LabRun[]> {
  if (running) return [];
  running = true;
  runButton.disabled = true;
  runsBody.replaceChildren();
  const out: LabRun[] = [];
  try {
    for (const sc of SCENARIOS) {
      if (filter && !sc.name.includes(filter)) continue;
      out.push(await runScenario(sc));
    }
  } finally {
    running = false;
    runButton.disabled = false;
  }
  runs.splice(0, runs.length, ...out);
  return out;
}
runButton.addEventListener("click", () => void runAll());

window.__motionLab = { runAll, runs, lastRows: () => lastRows };
