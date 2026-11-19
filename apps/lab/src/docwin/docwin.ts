/**
 * The Document window page: a document viewer's window (title bar, top and bottom bars, two side columns, scrolling
 * pages, floats) as one `@n-uf/placement/scene` Scene, driven by `@n-uf/motion/drag` (./scene), a bar of presets that
 * are the Scene's acceptance cases (./presets), a Window drawer, and a headless API at `window.__docwin` for a drag
 * matrix driven by real mouse events:
 *
 * - `items()`: every item's id, kind, region, form, rect (window px) and client rect, and its grip's client point;
 * - `targets(id)`: the Scene's targets a drag of `id` has now (with `accepted`: whether the scene's kinds allow it),
 *   with window and client rects;
 * - `layout()`: the stored form and the Scene's layout (edges, content, floats, notes);
 * - `reset()`, `preset(name)` (sets it up and checks it), `presets()`, `checkAll()`.
 */
import type { Rect } from "@n-uf/placement";
import { railModeOf, type RailMode, type SceneTarget } from "@n-uf/placement/scene";
import { onReset, parseRoute } from "../shell/api";
import { ALL, EDGES, type Counts, type ItemId } from "./model";
import { PRESETS, type Preset, type Verdict } from "./presets";
import { createScene } from "./scene";
import { createDocwinHost } from "./host";
import { CASES, runCasesAsync } from "@n-uf/placement/scene/cases";
import { DEFAULT_FEEL, type DragFeel } from "./feel";
import { feelPanel } from "./feel-panel";
import type { DragPreview } from "@n-uf/motion/drag";
import { passes, type LabRun, type ScenarioFilter } from "../shared/hooks";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $<HTMLDivElement>("dw-root");
const win = $<HTMLDivElement>("dw-win");
const status = $<HTMLParagraphElement>("dw-status");
const storedOut = $<HTMLPreElement>("dw-stored");
const inputs = { w: $<HTMLInputElement>("dw-w"), h: $<HTMLInputElement>("dw-h") };
const freeze = $<HTMLInputElement>("dw-freeze");
/** Each side's rails: titles (the default) or icons, as `rails[side].mode`. */
const railInputs = { left: $<HTMLSelectElement>("dw-rail-left"), right: $<HTMLSelectElement>("dw-rail-right") };
const countInputs: Partial<Record<keyof Counts, HTMLInputElement>> = { notes: $("dw-c-notes"), findings: $("dw-c-findings"), marked: $("dw-c-marked") };
/** The drop preview: indicator only, make room (the default), snap to slot. */
const previewInput = $<HTMLSelectElement>("dw-preview");

const EMBED = parseRoute().embed;
/**
 * The routes that open this page on one group of cases: the drag intent's (`motion/intent`), or, for the routes of the
 * pages this one replaced, all of them.
 */
const GROUP = parseRoute().id === "motion/intent" ? "intent" : null;
const KEY = EMBED ? "motion-lab:docwin:checks" : "motion-lab:docwin";
const PAGE_KEY = `${KEY}:page`;

const c = createScene({ root, win, status, storageKey: KEY, onChange: readouts });
// The drag feel: the drawer's controls, stored per viewer; the next drag reads it.
const feel = feelPanel($("dw-feel-body"), `${KEY}:feel`, (f) => c.setFeel(f));

function readouts(): void {
  const s = c.scene.stage;
  inputs.w.value = String(s.width);
  inputs.h.value = String(s.height);
  $("dw-w-out").textContent = `${s.width}`;
  $("dw-h-out").textContent = `${s.height}`;
  freeze.checked = c.frozen;
  for (const side of ["left", "right"] as const) railInputs[side].value = railModeOf(c.scene, side);
  for (const [k, el] of Object.entries(countInputs)) if (el && document.activeElement !== el) el.value = String(c.counts[k as keyof Counts]);
  previewInput.value = c.dropPreview;
  storedOut.textContent = JSON.stringify(c.stored(), null, 1);
  placeReset();
}

/**
 * The window's Reset: beside the window (outside its frame, level with the title bar) when the page has room for both;
 * otherwise on the drawer's row, right-aligned above the window's top-right corner. The window is never clipped.
 */
function placeReset(): void {
  const btn = document.getElementById("dw-reset-win");
  const page = document.querySelector<HTMLElement>(".dw-page");
  const side = document.querySelector<HTMLElement>(".dw-side");
  const top = document.getElementById("dw-top-slot");
  if (!btn || !page || !side || !top) return;
  const winWidth = win.getBoundingClientRect().width;
  const room = page.clientWidth >= winWidth + 10 + btn.getBoundingClientRect().width + 4;
  const to = room ? side : top;
  if (btn.parentElement !== to) to.append(btn);
  // Above the window, its right edge on the window's right edge.
  top.style.marginRight = "";
  if (!room) top.style.marginRight = `${Math.max(0, top.getBoundingClientRect().right - win.getBoundingClientRect().right)}px`;
}
new ResizeObserver(() => placeReset()).observe(document.querySelector(".dw-page") ?? document.body);

// --- presets ---------------------------------------------------------------------------------------------------------

const results = new Map<string, Verdict>();
let current: Preset | null = null;
const list = $<HTMLElement>("dw-presets");

/** A verdict's mark: pass, fail, or pending (a preset marked `pending` that still fails: not built yet, never red). */
const markOf = (p: Preset, v: Verdict | null | undefined): "pass" | "fail" | "pending" | "none" => (!v ? "none" : v.pass ? "pass" : p.pending ? "pending" : "fail");
const MARK_WORDS = { pass: "pass", fail: "fail", pending: "not built", none: "" } as const;

function drawList(): void {
  list.innerHTML = PRESETS.map((p, i) => {
    // Opened on one group (the drag intent's route): only its cases are listed; every case still runs in checkAll.
    if (GROUP && p.group !== GROUP) return "";
    const v = results.get(p.id);
    const mark = markOf(p, v);
    return `<button type="button" class="dw-chip" data-preset="${p.id}" data-mark="${mark}"${current?.id === p.id ? ' aria-current="true"' : ""} title="${p.expected.replace(/"/g, "&quot;")}"><span class="dw-dot"></span>${i + 1}. ${p.title}</button>`;
  }).join("");
}

function showCase(p: Preset, v: Verdict | null): void {
  $("dw-case-title").textContent = p.title;
  $("dw-expect").textContent = p.expected;
  $("dw-now").textContent = v ? v.now : "—";
  const mark = $("dw-mark");
  mark.dataset.mark = markOf(p, v);
  mark.textContent = MARK_WORDS[markOf(p, v)];
  $("dw-lacks").hidden = !p.lacks;
  $("dw-lacks-t").textContent = p.lacks ?? "";
}

const findPreset = (name: string): Preset | undefined => {
  const n = name.toLowerCase().replace(/[.\s]+$/, "");
  return PRESETS.find((p) => p.id === n || p.title.toLowerCase() === n) ?? PRESETS.find((p) => p.title.toLowerCase().includes(n) || p.id.includes(n));
};

/** Set a preset up, check it, and set it up again so the window is at its start, free to play with. */
function runPreset(p: Preset): Verdict {
  c.setFrozen(false);
  // Every case starts from the default feel (a case that tunes it sets its own); the viewer's comes back afterwards.
  const viewerFeel = c.feel;
  const viewerPreview = c.dropPreview;
  c.setFeel(DEFAULT_FEEL);
  c.setDropPreview("gap");
  c.setReducedMotion(false);
  p.setup(c);
  let v: Verdict;
  try {
    v = p.check(c);
  } catch (e) {
    v = { pass: false, now: `The check threw: ${e instanceof Error ? e.message : String(e)}` };
  }
  c.drive(false);
  c.setFrozen(false);
  c.setFeel(viewerFeel);
  // The viewer's drop preview comes back, unless the case sets its own (a drag intent case) to play with.
  c.setDropPreview(viewerPreview);
  c.setReducedMotion(false);
  p.setup(c);
  previewInput.value = c.dropPreview;
  results.set(p.id, v);
  return v;
}

function pick(p: Preset): Verdict {
  current = p;
  const v = runPreset(p);
  showCase(p, v);
  drawList();
  try {
    localStorage.setItem(PAGE_KEY, JSON.stringify({ preset: p.id }));
  } catch {
    // No storage.
  }
  // One short line; the detail stays in the case card.
  c.say(`${PRESETS.indexOf(p) + 1}. ${p.title}: ${v.pass ? "pass" : p.pending ? "not built yet" : "broken"}`);
  return v;
}

/** A case's result: `pass` true or false, or for a `pending` preset that still fails, `pending: true` and no `pass`. */
type CaseResult = { id: string; title: string; now: string; lacks: string | null } & ({ pass: boolean; pending?: undefined } | { pending: true; pass?: undefined });
const resultOf = (p: Preset, v: Verdict): CaseResult => {
  const base = { id: p.id, title: p.title, now: v.now, lacks: p.lacks ?? null };
  return !v.pass && p.pending ? { ...base, pending: true } : { ...base, pass: v.pass };
};

/**
 * The conformance rows (`@n-uf/placement/scene/cases`), each loaded into this window and played on its own drag session
 * (./host): `row:<id>` results. Afterwards the window goes back to its own scene and rules.
 */
async function checkRows(filter?: (id: string) => boolean): Promise<CaseResult[]> {
  const host = createDocwinHost(c);
  const rows = CASES.filter((r) => !filter || filter(r.id));
  const out: CaseResult[] = [];
  try {
    for (const { id, result } of await runCasesAsync(rows, () => host)) {
      const row = rows.find((r) => r.id === id)!;
      out.push({ id: `row:${id}`, title: row.title, now: result.ok ? "ok" : result.failures.join(" · "), lacks: row.lacks ?? null, pass: result.ok });
    }
  } finally {
    c.hostRules(null);
    c.drive(false);
    c.setFrozen(false);
    c.altOn(false);
    c.reset();
  }
  return out;
}

async function checkAll(): Promise<CaseResult[]> {
  const was = current;
  const out = PRESETS.map((p) => resultOf(p, runPreset(p)));
  out.push(...(await checkRows()));
  if (was) pick(was);
  else {
    c.reset();
    drawList();
  }
  return out;
}

list.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-preset]");
  const p = b && findPreset(b.dataset.preset!);
  if (p) pick(p);
});
$("dw-check").addEventListener("click", () => current && pick(current));
$("dw-check-all").addEventListener("click", async () => {
  const r = await checkAll();
  const pending = r.filter((x) => x.pending);
  const nums = (xs: typeof r): string => (xs.length ? ` (${xs.map((x) => r.indexOf(x) + 1).join(", ")})` : "");
  const broken = r.filter((x) => x.pass === false);
  c.say(`${r.filter((x) => x.pass).length} pass · ${pending.length} not built yet${nums(pending)} · ${broken.length} broken${nums(broken)}`);
});

// --- the Window drawer ---------------------------------------------------------------------------------------------

const resize = (): void => c.setSize(Number(inputs.w.value), Number(inputs.h.value));
inputs.w.addEventListener("input", resize);
inputs.h.addEventListener("input", resize);
freeze.addEventListener("change", () => c.setFrozen(freeze.checked));
previewInput.addEventListener("change", () => c.setDropPreview(previewInput.value as DragPreview));
for (const side of ["left", "right"] as const) railInputs[side].addEventListener("change", () => c.setRailMode(side, railInputs[side].value as RailMode));
for (const [k, el] of Object.entries(countInputs)) el?.addEventListener("input", () => c.setCount(k as keyof Counts, Math.max(0, Math.min(999, Number(el.value) || 0))));
$("dw-reload").addEventListener("click", () => location.reload());
const reset = (): void => {
  current = null;
  c.setFrozen(false);
  c.reset();
  $("dw-case-title").textContent = "Pick a case";
  $("dw-mark").dataset.mark = "none";
  $("dw-mark").textContent = "";
  drawList();
};
$("dw-reset").addEventListener("click", reset);
// The Reset beside the window: the same reset as the drawer's and `window.__docwin.reset()`.
$("dw-reset-win").addEventListener("click", reset);
onReset(reset);
// "About this page" goes to the page's foot, after the case card.
{
  const about = document.querySelector(".lab-about");
  const page = document.querySelector(".dw-page");
  if (about && page) page.after(about);
}

// --- the headless API ----------------------------------------------------------------------------------------------

const client = (r: Rect): Rect => {
  const w = win.getBoundingClientRect();
  return { x: r.x + w.left, y: r.y + w.top, width: r.width, height: r.height };
};

function gripPoint(id: ItemId): { x: number; y: number } | null {
  const el = win.querySelector(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Whether the scene's kinds allow the target, read from the scene's data (an edge's `accepts`, `floatKinds`, a side's
 * column template); home and none allow any item. The Scene gives no target its kinds deny, so this is a cross-check.
 */
function accepted(t: SceneTarget, id: ItemId): boolean {
  const kind = c.scene.items[id]?.kind ?? "";
  const p = t.place;
  if (p.kind === "gap") return !!c.scene.edges.find((e) => e.id === p.edge)?.accepts.includes(kind);
  if (p.kind === "float") return c.scene.floatKinds.includes(kind);
  if (p.kind === "column" || p.kind === "rail") return !!c.scene.columns?.[p.side]?.accepts.includes(kind);
  return true;
}

const api = {
  items: () =>
    ALL.map((id) => {
      const p = c.layout.items[id];
      const it = c.scene.items[id]!;
      return {
        id,
        kind: it.kind,
        fixed: !!it.fixed,
        closed: !!it.closed,
        region: p ? (p.floating ? "float" : (p.edge ?? null)) : null,
        form: p?.formKind ?? null,
        inMenu: !!p?.inMenu,
        rect: p?.rect ?? null,
        client: p ? client(p.rect) : null,
        grip: it.fixed ? null : gripPoint(id),
      };
    }),
  targets: (id: ItemId) =>
    c.targets(id).map((t) => {
      const p = t.place;
      return {
        id: t.id,
        kind: p.kind,
        place: p,
        edge: p.kind === "gap" ? p.edge : null,
        zone: p.kind === "gap" ? p.zone : null,
        at: p.kind === "gap" ? p.at : null,
        priority: t.priority,
        free: !!t.free,
        accepted: accepted(t, id),
        hit: t.hit,
        hits: t.hits ?? null,
        bounds: t.bounds ?? null,
        arm: t.arm ?? null,
        opensRoom: t.opensRoom === true,
        roomHold: t.roomHold ?? null,
        hitClient: client(t.hit),
        slot: t.slot ?? null,
        slotClient: t.slot ? client(t.slot) : null,
        marker: t.marker ?? null,
      };
    }),
  /** The places a drop of `id` is refused, as the drag intent takes them. */
  refusals: (id: ItemId) => c.refusals(id).map((r) => ({ id: r.id, hit: r.hit, hits: r.hits ?? null, bounds: r.bounds ?? null })),
  layout: () => ({
    stored: c.stored(),
    window: client(c.scene.stage),
    content: c.layout.content,
    edges: Object.fromEntries(
      EDGES.map((e) => {
        const l = c.layout.edges[e];
        return [e, l ? { rect: l.rect, cross: l.cross, items: Object.entries(c.layout.items).filter(([, p]) => p.edge === e).map(([id, p]) => ({ id, form: p.formKind, inMenu: !!p.inMenu })), menu: l.menu } : null];
      }),
    ),
    floats: c.layout.floats.map((id) => ({ id, rect: c.layout.items[id]?.rect ?? null })),
    notes: c.layout.notes,
  }),
  reset,
  preset: (name: string) => {
    const p = findPreset(name);
    if (!p) return { error: `no preset "${name}"`, presets: PRESETS.map((x) => x.id) };
    const v = pick(p);
    return { expected: p.expected, ...resultOf(p, v) };
  },
  presets: () => PRESETS.map((p) => ({ id: p.id, title: p.title, expected: p.expected, lacks: p.lacks ?? null, pending: !!p.pending, result: results.get(p.id) ?? null })),
  checkAll,
  /** The conformance rows only, played on this window (ids containing `filter`, if given). */
  checkRows: (filter?: string) => checkRows(filter ? (id) => id.includes(filter) : undefined),
  lastDrop: () => c.lastDrop,
  /** The last drag's trace: the shown target's changes, the snaps and every frame (pointer, speed, the held item's rect). */
  trace: () => c.trace,
  dragging: () => c.dragging,
  frozen: (on?: boolean) => {
    if (on !== undefined) c.setFrozen(on);
    return c.frozen;
  },
  size: (width: number, height: number) => c.setSize(width, height),
  /** The drag feel (`./feel`): read it, or set and store it (as the drawer's controls do). */
  feel: (next?: DragFeel) => {
    if (next) feel.set(next);
    return c.feel;
  },
};
(window as unknown as { __docwin: typeof api }).__docwin = api;

/**
 * The Checks page's hooks: every case (`<id> · <title>`) and every conformance row (`row:<id> · <title>`) as a run, a
 * pending one (not built, or played by a rule the in-memory host lacks) listed with its reason and never failed.
 */
const labRuns: LabRun[] = [];
window.__motionLab = {
  runAll: async (filter?: ScenarioFilter) => {
    const named = (r: CaseResult): string => `${r.id} · ${r.title}`;
    const wanted = (r: { id: string; title: string }): boolean => passes(`${r.id} · ${r.title}`, filter);
    const out: CaseResult[] = PRESETS.filter((p) => wanted(p)).map((p) => resultOf(p, runPreset(p)));
    out.push(...(await checkRows((id) => wanted({ id: `row:${id}`, title: CASES.find((r) => r.id === id)?.title ?? "" }))));
    c.reset();
    drawList();
    labRuns.splice(0, labRuns.length, ...out.map((r): LabRun => ({ scenario: named(r), mode: r.id.startsWith("row:") ? "row" : "case", failed: r.pass === false ? [r.now] : [], rows: [{ name: named(r), result: { ok: r.pass !== false, failures: r.pass === false ? [r.now] : [] }, ...(r.pending ? { info: `pending: ${r.lacks ?? r.now}` } : {}) }] })));
    return labRuns;
  },
  runs: labRuns,
  lastRows: () => labRuns.at(-1)?.rows ?? [],
};

// --- start ---------------------------------------------------------------------------------------------------------

const dropped = c.load();
drawList();
let last: string | undefined;
try {
  last = (JSON.parse(localStorage.getItem(PAGE_KEY) ?? "{}") as { preset?: string }).preset;
} catch {
  last = undefined;
}
const lastPreset = last ? PRESETS.find((p) => p.id === last) : undefined;
if (lastPreset) {
  current = lastPreset;
  showCase(lastPreset, null);
  drawList();
}
c.say(dropped.length ? `Layout restored; the store dropped: ${dropped.join(", ")}.` : "Drag a panel by its header or a group by its dots; the dashed slot is where it lands.");
