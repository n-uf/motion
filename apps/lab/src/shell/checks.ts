/**
 * The Checks page: runs every page's scenarios (or one group's) and lists each one, green or red, with its first
 * failure. Each page module runs once, in a frame of its own (its route with `embed` and `all`), at the size the
 * headless runs use; a scenario is listed under the first page whose view takes it. `window.__motionLab.runAll` on
 * this page runs everything, so one headless call checks the whole lab.
 */
import { passes, type LabRun, type ScenarioFilter } from "../shared/hooks";
import { routeHash } from "./api";
import { FIXTURES, GROUPS, PAGES as LISTED, type GroupId, type PageDef, type View } from "./pages";

/** The listed pages and the check fixtures (pages in no menu whose scenarios still run here). */
const PAGES: readonly PageDef[] = [...LISTED, ...FIXTURES];

/** The frame's size: the viewport the headless runs use. */
const FRAME = { width: 1600, height: 1100 };

interface Job {
  readonly module: string;
  readonly pages: readonly PageDef[];
  readonly filter?: (name: string) => boolean;
}
export interface CheckRow extends LabRun {
  readonly page: string;
}

const inView = (v: View | undefined, name: string): boolean => (v === undefined ? true : typeof v === "string" ? name.includes(v) : v(name));

/** One job per page module: all of its scenarios, or those a group's pages show. */
function jobsFor(group: GroupId | "all"): Job[] {
  const pages = PAGES.filter((p) => p.module && (group === "all" || p.group === group));
  const modules = [...new Set(pages.map((p) => p.module!))];
  return modules.map((m) => {
    const ps = pages.filter((p) => p.module === m);
    // All of a module's pages share its scenarios: the group's pages' views are what runs.
    const filter = group === "all" ? undefined : (name: string) => ps.some((p) => inView(p.view, name));
    return { module: m, pages: PAGES.filter((p) => p.module === m && (group === "all" || p.group === group)), ...(filter ? { filter } : {}) };
  });
}

const viewport = document.getElementById("checks-viewport") as HTMLDivElement;
const cap = document.getElementById("checks-frame-cap") as HTMLElement;
const status = document.getElementById("checks-status") as HTMLParagraphElement;
const sum = document.getElementById("checks-sum") as HTMLParagraphElement;
const rowsBody = document.getElementById("checks-rows") as HTMLTableSectionElement;
const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-run]")];
let stopped = false;
let running = false;
let rows: CheckRow[] = [];

type LabWindow = Window & { __labReady?: boolean };

/** Load `page`'s module in a fresh frame and wait for it to be ready. */
async function frameFor(page: PageDef): Promise<LabWindow> {
  viewport.replaceChildren();
  const f = document.createElement("iframe");
  f.title = `${page.title}, running its checks`;
  f.width = String(FRAME.width);
  f.height = String(FRAME.height);
  f.src = `${location.pathname}${routeHash(page.id, { embed: true, all: true })}`;
  viewport.append(f);
  const w = f.contentWindow as LabWindow;
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 50));
    if (w.__labReady && w.__motionLab) return w;
  }
  throw new Error(`${page.title} didn't load`);
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function render(): void {
  if (!rows.length) {
    rowsBody.innerHTML = `<tr><td colspan="5">${running ? "Running…" : "No run yet."}</td></tr>`;
    return;
  }
  rowsBody.innerHTML = rows
    .map((r) => {
      const first = r.rows.find((x) => x.result && !x.result.ok);
      const why = first ? `${first.name}: ${first.result!.failures[0] ?? ""}` : "";
      return `<tr class="${r.failed.length ? "bad" : "ok"}"><td>${esc(r.page)}</td><td>${esc(r.scenario)}</td><td>${esc(r.mode)}</td><td class="${r.failed.length ? "bad" : "ok"}">${r.failed.length ? "✗ fail" : "✓ pass"}</td><td>${esc(why)}</td></tr>`;
    })
    .join("");
  const bad = rows.filter((r) => r.failed.length).length;
  sum.hidden = false;
  sum.className = `lab-checks-sum ${bad ? "bad" : "ok"}`;
  sum.textContent = `${rows.length} runs: ${rows.length - bad} passing, ${bad} failing${running ? " so far" : ""}.`;
}

/** Run the jobs, one frame at a time; `filter` narrows every job further. */
async function run(group: GroupId | "all", filter?: ScenarioFilter): Promise<CheckRow[]> {
  if (running) return [];
  running = true;
  stopped = false;
  rows = [];
  buttons.forEach((b) => (b.disabled = b.dataset.run !== "stop"));
  render();
  const jobs = jobsFor(group);
  try {
    for (const [i, job] of jobs.entries()) {
      if (stopped) break;
      const home = job.pages[0]!;
      const label = job.pages.map((p) => p.title).join(", ");
      status.textContent = `Running ${i + 1} of ${jobs.length}: ${label}…`;
      cap.textContent = home.title;
      try {
        const w = await frameFor(home);
        const f = (name: string): boolean => (!job.filter || job.filter(name)) && passes(name, filter);
        const runs = await w.__motionLab.runAll(f);
        for (const r of runs) rows.push({ ...r, page: (job.pages.find((p) => inView(p.view, r.scenario)) ?? home).title });
      } catch (e) {
        rows.push({ page: home.title, scenario: "the page ran", mode: "", failed: ["the page ran"], rows: [{ name: "the page ran", result: { ok: false, failures: [String(e)] } }] });
      }
      render();
    }
    const bad = rows.filter((r) => r.failed.length).length;
    status.textContent = stopped ? "Stopped." : `Done: ${bad ? `${bad} failing` : "all green"}.`;
  } finally {
    running = false;
    viewport.replaceChildren();
    cap.textContent = "Idle";
    buttons.forEach((b) => (b.disabled = b.dataset.run === "stop"));
    render();
  }
  return rows;
}

for (const b of buttons) {
  b.addEventListener("click", () => {
    const what = b.dataset.run!;
    if (what === "stop") {
      stopped = true;
      status.textContent = "Stopping after this page…";
      return;
    }
    void run(what as GroupId | "all");
  });
}
// The groups that have pages with checks.
for (const b of buttons) {
  const g = GROUPS.find((x) => x.id === b.dataset.run);
  if (g && !PAGES.some((p) => p.group === g.id && p.module)) b.hidden = true;
}

window.__motionLab = { runAll: (filter?: ScenarioFilter) => run("all", filter), runs: [], lastRows: () => [] };
