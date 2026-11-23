/**
 * The Tiling drag page: a split tree on a stage (./host), the tree switch, the presets (./presets) and the headless API.
 *
 * Headless: `window.__tilingDrag` has `presets()`, `preset(id)` (sets it up and checks it), `reset()` and `checkAll()`,
 * the lab's preset format (docs/lab-checks.md); `host` is the page's host, to drive a drag by hand. The Checks page
 * runs the presets through `window.__motionLab.runAll`.
 */
import type { LabRun, ScenarioFilter } from "../shared/hooks";
import { passes } from "../shared/hooks";
import { onReset } from "../shell/api";
import { Host, type Preview, type TreeId } from "./host";
import { PRESETS, type Preset, type Verdict } from "./presets";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const host = new Host($("td-stage"), $("td-status"));
const treeButtons = [...document.querySelectorAll<HTMLButtonElement>("#td-trees [data-tree]")];
const list = $<HTMLOListElement>("td-list");
const sum = $<HTMLParagraphElement>("td-sum");
const results = new Map<string, Verdict>();

function showTree(which: TreeId): void {
  for (const b of treeButtons) b.setAttribute("aria-checked", String(b.dataset.tree === which));
}
for (const b of treeButtons) {
  b.addEventListener("click", () => {
    host.setTree(b.dataset.tree as TreeId);
    showTree(host.start);
  });
}

const previewButtons = [...document.querySelectorAll<HTMLButtonElement>("#td-previews [data-preview]")];
function showPreview(which: Preview): void {
  for (const b of previewButtons) b.setAttribute("aria-checked", String(b.dataset.preview === which));
}
for (const b of previewButtons) {
  b.addEventListener("click", () => {
    host.setPreview(b.dataset.preview as Preview);
    showPreview(host.preview);
  });
}

function reset(): void {
  host.setPreview("snap");
  showPreview("snap");
  host.setTree("three");
  showTree("three");
}
$("td-reset").addEventListener("click", reset);
onReset(reset);

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function renderList(): void {
  list.innerHTML = PRESETS.map((p) => {
    const v = results.get(p.id);
    const verdict = v ? `<span class="td-verdict" data-pass="${v.pass}">${v.pass ? "pass" : "fail"}</span><span class="td-now">${esc(v.now)}</span>` : "";
    return `<li><button type="button" data-preset="${p.id}" title="${esc(p.expected)}">${esc(p.title)}</button>${verdict}</li>`;
  }).join("");
  const done = [...results.values()];
  if (done.length) sum.textContent = `${done.length} of ${PRESETS.length} checked: ${done.filter((v) => v.pass).length} pass, ${done.filter((v) => !v.pass).length} fail.`;
}
list.addEventListener("click", (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>("[data-preset]")?.dataset.preset;
  if (id) preset(id);
});

/** Set `p` up and check it; the page is left as the check left it, except a preset whose gesture is still held is shown held. */
function run(p: Preset): Verdict {
  let v: Verdict;
  try {
    p.setup(host);
    showTree(host.start);
    showPreview(host.preview);
    v = p.check(host);
  } catch (e) {
    v = { pass: false, now: `threw: ${String(e)}` };
  }
  results.set(p.id, v);
  return v;
}

function preset(id: string): (Verdict & { id: string; title: string }) | { error: string; presets: string[] } {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return { error: `no preset "${id}"`, presets: PRESETS.map((x) => x.id) };
  const v = run(p);
  // Show the case as it was held: set it up again and leave it held, so a person sees what the check saw.
  p.setup(host);
  renderList();
  return { id: p.id, title: p.title, ...v };
}

interface CaseResult {
  readonly id: string;
  readonly title: string;
  readonly now: string;
  readonly lacks: string | null;
  readonly pass: boolean;
  readonly pending?: boolean;
}

function checkAll(filter?: ScenarioFilter): CaseResult[] {
  const out = PRESETS.filter((p) => passes(`${p.id} ${p.title}`, filter)).map((p): CaseResult => {
    const v = run(p);
    return { id: p.id, title: p.title, now: v.now, lacks: p.lacks ?? null, pass: v.pass, ...(p.pending ? { pending: true } : {}) };
  });
  reset();
  renderList();
  return out;
}
$("td-run-all").addEventListener("click", () => checkAll());

const api = {
  presets: () => PRESETS.map((p) => ({ id: p.id, title: p.title, expected: p.expected, lacks: p.lacks ?? null, pending: !!p.pending, result: results.get(p.id) ?? null })),
  preset,
  reset,
  checkAll,
  host,
};
(window as unknown as { __tilingDrag: typeof api }).__tilingDrag = api;

const runs: LabRun[] = [];
window.__motionLab = {
  runAll: async (filter?: ScenarioFilter) => {
    runs.length = 0;
    for (const r of checkAll(filter)) {
      runs.push({ scenario: `${r.id} ${r.title}`, mode: "tiling drag", failed: r.pass ? [] : [r.id], rows: [{ name: r.title, result: { ok: r.pass, failures: r.pass ? [] : [r.now] } }] });
    }
    return runs;
  },
  runs,
  lastRows: () => runs.flatMap((r) => r.rows),
};

renderList();
