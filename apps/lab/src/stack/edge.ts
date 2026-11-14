/**
 * The Edge stack page: one stage (a side column, a 40 px top bar, pages that scroll under them and floats above), a
 * settings strip, and the cases on the left. Picking a case applies its settings and starting state, marks what to look
 * at, states its expectation and its steps, and runs its check with "Expected" next to "Now"; then the stage is back at
 * the case's start and free to play with. Every case is also a scenario on `window.__motionLab.runAll(filter?)`.
 *
 * The board (./board, with `edge`) does the drawing, the drags, the store, the freeze; the cases (./edge-cases) are data
 * and checks. The page writes every word.
 */
import { onReset, parseRoute } from "../shell/api";
import { nextFrame } from "../shared/geometry";
import { DEFAULT_LAYOUT, EDGE_DEFAULTS, createBoard, type Board, type EdgeSettings } from "./board";
import { aimers, createDriver } from "./drive";
import { CASE_GROUPS, EDGE_CASES, type Ctx, type EdgeCase, type Look, type Verdict } from "./edge-cases";
import { install, row, type Scenario } from "./run";
import { ALL, PHASES, titleOf, type ItemId, type Phase } from "./sample";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = $<HTMLDivElement>("es-stage");
const status = $<HTMLParagraphElement>("st-status");
const list = $<HTMLElement>("es-list");
const storedOut = $<HTMLPreElement>("es-stored");
const inputs = {
  height: $<HTMLInputElement>("es-height"),
  widthLimit: $<HTMLInputElement>("es-width"),
  barLength: $<HTMLInputElement>("es-bar"),
  gap: $<HTMLInputElement>("es-gap"),
  pad: $<HTMLInputElement>("es-pad"),
};
const outs: Record<keyof typeof inputs, HTMLOutputElement> = {
  height: $("es-height-out"),
  widthLimit: $("es-width-out"),
  barLength: $("es-bar-out"),
  gap: $("es-gap-out"),
  pad: $("es-pad-out"),
};
const preview = $<HTMLSelectElement>("es-preview");
const freeze = $<HTMLInputElement>("es-freeze");
const countItem = $<HTMLSelectElement>("es-count-item");
const count = $<HTMLInputElement>("es-count");
const phase = $<HTMLSelectElement>("es-phase");

/**
 * The page's own state across a reload: the case picked, the settings, the freeze. The arrangement is the board's stored
 * form. The Checks page's frame (`embed`) keeps its own keys, so a run never touches what a person left on this page.
 */
const EMBED = parseRoute().embed;
const KEY = EMBED ? "motion-lab:edge-stack:checks" : "motion-lab:edge-stack";
const PAGE_KEY = `${KEY}:page`;
interface PageState {
  readonly case?: string;
  readonly settings?: Partial<EdgeSettings>;
  readonly frozen?: boolean;
}
function readPage(): PageState {
  try {
    const raw = localStorage.getItem(PAGE_KEY);
    return raw ? (JSON.parse(raw) as PageState) : {};
  } catch {
    return {};
  }
}
function writePage(): void {
  try {
    localStorage.setItem(PAGE_KEY, JSON.stringify({ case: current?.id, settings: board.settings, frozen: board.frozen } satisfies PageState));
  } catch {
    // No storage: the page still works, a reload just starts over.
  }
}

let current: EdgeCase | null = null;
let checking = false;
/** A case clicked while a check runs: it is picked once the check is over. */
let queued: EdgeCase | null = null;
const results = new Map<string, Verdict>();

/** The cases of a group in id order: C before T, then by number. */
const byId = (a: EdgeCase, b: EdgeCase): number => a.id[0]!.localeCompare(b.id[0]!) || Number.parseInt(a.id.slice(1), 10) - Number.parseInt(b.id.slice(1), 10);

// --- the stage -------------------------------------------------------------------------------------------------------

// The board restores the stored form while it is made, before `board` is assigned: the readouts wait for it.
let made = false;
const board: Board = createBoard({ stage, status, key: KEY, autosave: true, restore: true, edge: true, onChange: () => made && refresh() });
made = true;
const d = createDriver(stage);
const ctx: Ctx = { b: board, d, aim: aimers(d, board) };

/** Mark what the case asks to look at. Items are redrawn by id, so this runs after every change. */
function highlight(): void {
  for (const el of stage.querySelectorAll(".es-hi")) el.classList.remove("es-hi");
  for (const l of current?.look ?? []) {
    const el = lookEl(l);
    el?.classList.add("es-hi");
  }
}
function lookEl(l: Look): Element | undefined {
  if (l === "column") return board.views.column.el;
  if (l === "bar") return board.views.bar.el;
  if (l === "pages") return board.scroller;
  return board.itemEl(l);
}

/** The settings strip and the stored form, from the board. */
function refresh(): void {
  const s = board.settings;
  for (const k of Object.keys(inputs) as (keyof typeof inputs)[]) {
    inputs[k].value = String(s[k]);
    outs[k].textContent = `${s[k]} px`;
  }
  preview.value = s.preview;
  freeze.checked = board.frozen;
  const id = countItem.value as ItemId;
  if (id && document.activeElement !== count) count.value = String(board.meta[id].count);
  if (id) phase.value = board.meta[id].phase;
  const st = board.stored();
  storedOut.textContent = `column ${st.column}\nbar ${st.bar}\nfloats ${st.floats}`;
  highlight();
  markControls();
}

/** Mark the settings strip's controls the picked case uses: those its preset sets and those its steps name. */
function markControls(): void {
  const uses = new Set<string>([...Object.keys(current?.preset.settings ?? {}), ...(current?.preset.frozen ? ["freeze"] : []), ...(current?.preset.meta ? ["counts"] : []), ...(current?.controls ?? [])]);
  for (const el of document.querySelectorAll<HTMLElement>(".es-settings [data-ctl]")) el.classList.toggle("es-uses", uses.has(el.dataset.ctl!));
}

// --- a case ----------------------------------------------------------------------------------------------------------

/** Put the stage in the case's starting state. */
function applyPreset(c: EdgeCase): void {
  const p = c.preset;
  board.reset();
  board.setEdge({ ...EDGE_DEFAULTS, ...p.settings });
  board.setLayout(p.layout ?? DEFAULT_LAYOUT, { ...(p.used ? { used: p.used } : {}), ...(p.kept ? { kept: p.kept } : {}), ...(p.from ? { from: p.from } : {}) });
  for (const [id, m] of Object.entries(p.meta ?? {})) board.setMeta(id as ItemId, m!);
  if (p.frozen) board.setFrozen(true);
  refresh();
}

/** Set the case up, run its check, and set it up again so the stage shows its start. */
async function runCase(c: EdgeCase): Promise<Verdict> {
  applyPreset(c);
  await nextFrame();
  let v: Verdict;
  try {
    v = await c.check(ctx);
  } catch (e) {
    v = { ok: false, expected: c.expect, now: `the check threw: ${String(e)}` };
  }
  results.set(c.id, v);
  applyPreset(c);
  return v;
}

const markOf = (id: string): string => {
  const v = results.get(id);
  return v ? (v.ok ? "✓" : "✗") : "·";
};
const markClass = (id: string): string => {
  const v = results.get(id);
  return v ? (v.ok ? "ok" : "bad") : "";
};

function renderList(): void {
  list.innerHTML = CASE_GROUPS.map((g) => {
    const items = EDGE_CASES.filter((c) => c.group === g.id)
      .sort(byId)
      .map(
        (c) =>
          `<li><button type="button" data-case="${c.id}"${c === current ? ' aria-current="true"' : ""}${c === queued ? ' class="es-queued" title="Next, once the running check is over"' : ""}><span class="es-m ${markClass(c.id)}" aria-label="${results.get(c.id) ? (results.get(c.id)!.ok ? "passes" : "fails") : "not run"}">${markOf(c.id)}</span><span class="es-n">${c.id}</span><span class="es-t">${c.title}</span></button></li>`,
      )
      .join("");
    return `<div class="es-group"><p class="es-group-k">${g.title}</p><ul>${items}</ul></div>`;
  }).join("");
}

function renderCase(): void {
  const c = current;
  if (!c) return;
  $("es-case-id").textContent = c.id;
  $("es-case-group").textContent = CASE_GROUPS.find((g) => g.id === c.group)!.title;
  $("es-case-title").textContent = c.title;
  $("es-case-expect").textContent = c.expect;
  $("es-case-try").innerHTML = c.tries.map((t) => `<li>${t}</li>`).join("");
  const v = results.get(c.id);
  $("es-expected").textContent = v?.expected ?? c.expect;
  $("es-now").textContent = checking ? `Running…${queued ? ` (${queued.id} next)` : ""}` : (v?.now ?? "Not checked yet: press Check again.");
  const mark = $("es-mark");
  mark.textContent = checking ? "" : v ? (v.ok ? "✓ pass" : "✗ fail") : "";
  mark.className = `es-mark ${checking ? "" : markClass(c.id)}`;
  $("es-fixtures").textContent = c.fixtures.length ? `Also under Edge stack on the Checks page (add ?checks to the address): ${c.fixtures.join(" · ")}.` : "";
}

/** Pick a case: its preset, its words, its check. A pick while a check runs waits for it, the last one clicked wins. */
async function pick(c: EdgeCase, run = true): Promise<void> {
  if (checking) {
    queued = c;
    renderList();
    renderCase();
    return;
  }
  current = c;
  writePage();
  renderList();
  renderCase();
  if (!run) {
    highlight();
    return;
  }
  checking = true;
  renderCase();
  bringIntoView();
  stage.classList.add("es-checking");
  try {
    await runCase(c);
  } finally {
    checking = false;
    stage.classList.remove("es-checking");
    writePage();
    renderList();
    renderCase();
    bringIntoView();
  }
  const next = queued;
  queued = null;
  if (next) await pick(next);
}

/**
 * Bring the case card and the whole stage into the window: the card's top goes to the window's top when that shows the
 * stage's bottom too; otherwise the stage's bottom goes to the window's bottom. Nothing moves when both already show.
 */
function bringIntoView(): void {
  if (EMBED) return;
  const card = $("es-case").getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  const room = window.innerHeight;
  if (card.top >= 0 && s.bottom <= room) return;
  const by = s.bottom - card.top <= room - 8 ? card.top - 8 : s.bottom - room + 8;
  window.scrollBy({ top: by, behavior: "instant" as ScrollBehavior });
}

list.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-case]");
  const c = EDGE_CASES.find((x) => x.id === b?.dataset.case);
  if (c) void pick(c);
});
$("es-check").addEventListener("click", () => current && void pick(current));
$("es-reset").addEventListener("click", () => current && applyPreset(current));
onReset(() => current && applyPreset(current));

// --- settings ----------------------------------------------------------------------------------------------------------

for (const k of Object.keys(inputs) as (keyof typeof inputs)[]) {
  inputs[k].addEventListener("input", () => {
    board.setEdge({ [k]: Number(inputs[k].value) });
    writePage();
  });
}
preview.addEventListener("change", () => {
  board.setEdge({ preview: preview.value as EdgeSettings["preview"] });
  writePage();
});
freeze.addEventListener("change", () => {
  board.setFrozen(freeze.checked);
  writePage();
});
countItem.innerHTML = ALL.map((id) => `<option value="${id}">${titleOf(id)}</option>`).join("");
phase.innerHTML = PHASES.map((p) => `<option>${p}</option>`).join("");
countItem.addEventListener("change", refresh);
count.addEventListener("input", () => board.setMeta(countItem.value as ItemId, { count: Math.max(0, Number(count.value) || 0) }));
phase.addEventListener("change", () => board.setMeta(countItem.value as ItemId, { phase: phase.value as Phase }));
$("es-rebuild").addEventListener("click", () => board.rebuild());
$("es-reload").addEventListener("click", () => {
  board.save();
  writePage();
  location.reload();
});

// --- start -------------------------------------------------------------------------------------------------------------

// A reload keeps the case and the settings; the arrangement came back from the stored form when the board was made.
// In the Checks page's frame nothing runs on its own: the scenarios set every case up.
const saved = readPage();
const again = EDGE_CASES.find((c) => c.id === saved.case);
if (EMBED) void pick(EDGE_CASES[0]!, false);
else if (again) {
  board.setEdge({ ...EDGE_DEFAULTS, ...saved.settings });
  if (saved.frozen) board.setFrozen(true);
  void pick(again, false);
} else void pick(EDGE_CASES[0]!);
refresh();

// --- the scenarios -----------------------------------------------------------------------------------------------------

const scenarios: Scenario<null>[] = EDGE_CASES.map((c) => ({
  name: `${c.id}: ${c.title}`,
  modes: ["stage"],
  async run() {
    const v = await runCase(c);
    renderList();
    if (c === current) renderCase();
    return [row(c.expect, v.ok ? [] : [`expected ${v.expected}; now ${v.now}`], `now ${v.now}`)];
  },
}));
// After a run the stage goes back to the picked case's start, as a person left it.
install(null, scenarios, () => board.reset(), $<HTMLButtonElement>("es-run"), $<HTMLTableSectionElement>("es-runs"), () => current && applyPreset(current));
