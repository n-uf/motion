/**
 * The Stack · toolbar page: a top bar of four control groups, as a toolbar needs it from @n-uf/placement/stack.
 * - A group folds to its own handle with a » in line (`fold`), taking its own length; the shared » entry is a later
 *   step (T1). Mark has a stacked form as long as its row: a give-way step skips it (T2/T4).
 * - Tools is the ranked primary: it goes to its one main tool, and folds after every other group (`rank`, T3).
 * - The bar has real gaps and padding, counted in its length and in every rect (T5), and the gaps at its ends reach
 *   past it (`endReach`). Drag a group by its grip to another gap.
 * - The bar is 40 px tall at most (`cross.max`): drag the Findings panel in and it lands as a header, not open (T6).
 *
 * Targets are `stackTargets`, what shows and when is @n-uf/motion/drag's intent (no hysteresis lives in placement).
 * The page writes every word. The scripted scenarios (toolbar-scenarios.ts) drive it through `page`.
 */
import type { Rect } from "@n-uf/motion";
import { DRAG_DEFAULTS, createDragIntent, previewPlan, type DragIntent } from "@n-uf/motion/drag";
import { fitStack, stackTargets, type StackFit, type StackForm, type StackFormKind, type StackInput, type StackItem, type StackTarget } from "@n-uf/placement/stack";

export type TbId = "views" | "tools" | "zoom" | "mark" | "findings";
export const GROUPS: readonly TbId[] = ["views", "tools", "zoom", "mark"];
export const TITLES: Record<TbId, string> = { views: "Views", tools: "Tools", zoom: "Zoom", mark: "Mark", findings: "Findings" };
const WORDS: Record<TbId, readonly string[]> = {
  views: ["Page", "Spread", "Scroll"],
  tools: ["Select", "Mark", "Note", "Stamp", "Redo"],
  zoom: ["Fit", "100 %", "Zoom"],
  mark: ["Highlight", "Underline", "Strike"],
  findings: ["3 open", "2 resolved", "1 needs review"],
};

const BAR_HEIGHT = 40;
const MENU = 28;
const END_REACH = 24;
const REACH_ACROSS = 56;
const AT = { bar: { x: 24, y: 44 }, tray: { x: 24, y: 150, width: 190, height: 120 } } as const;

const form = (kind: StackFormKind, main: number, extra: { rank?: number; cross?: number; crossNatural?: number; setsCross?: boolean } = {}): StackForm => ({
  kind,
  main: { min: main, natural: main },
  cross: { natural: extra.crossNatural ?? 28, ...(extra.cross !== undefined ? { min: extra.cross } : {}) },
  ...(extra.rank !== undefined ? { rank: extra.rank } : {}),
  ...(extra.setsCross !== undefined ? { setsCross: extra.setsCross } : {}),
});

/** An item's forms, largest first. Folds are 36 px (a handle and its own »); the shared » entry is 28. */
export function formsOf(id: TbId): StackForm[] {
  switch (id) {
    case "views":
      return [form("row", 150), form("fold", 36), form("menu", 0, { rank: 2 })];
    case "tools":
      // The primary: full row, its one main tool (rank 0), then the fold (rank 1, after every other fold).
      return [form("row", 220, { rank: 0 }), form("icons", 96, { rank: 0 }), form("fold", 36, { rank: 1 })];
    case "zoom":
      return [form("row", 130), form("fold", 36), form("menu", 0, { rank: 2 })];
    case "mark":
      // The stacked words are two lines in the bar, as long as the row: a step never goes there.
      return [form("row", 170), form("stacked", 170), form("fold", 36), form("menu", 0, { rank: 2 })];
    case "findings":
      // Open asks for 120 px across and can't be drawn thinner than that; the header fits a thin bar.
      return [form("open", 150, { crossNatural: 120, cross: 120, setsCross: true }), form("header", 110), form("rail", 26), form("menu", 0, { rank: 2 })];
  }
}

const DEFAULTS = { length: 740, gap: 8, pad: 12 };
const DEFAULT_ORDER = (): TbId[] => ["views", "tools", "zoom", "mark"];
const DEFAULT_USED = (): Record<TbId, number> => ({ views: 1, zoom: 2, mark: 3, tools: 9, findings: 5 });

let order = DEFAULT_ORDER();
let used = DEFAULT_USED();
let clock = 9;
let length = DEFAULTS.length;
let gap = DEFAULTS.gap;
let pad = DEFAULTS.pad;
let toolsAge: "newest" | "oldest" = "newest";

const stage = document.getElementById("tb-stage") as HTMLDivElement;
const status = document.getElementById("tb-status") as HTMLParagraphElement;
const lengthIn = document.getElementById("tb-length") as HTMLInputElement;
const gapIn = document.getElementById("tb-gap") as HTMLInputElement;
const padIn = document.getElementById("tb-pad") as HTMLInputElement;
const hitsIn = document.getElementById("tb-hits") as HTMLInputElement;

const el = (cls: string, html = ""): HTMLDivElement => {
  const d = document.createElement("div");
  d.className = cls;
  d.innerHTML = html;
  return d;
};
const label = el("tb-label", "A toolbar (the top edge)");
Object.assign(label.style, { left: `${AT.bar.x}px`, top: "18px" });
const trayLabel = el("tb-label", "A panel, open: 120 px across");
Object.assign(trayLabel.style, { left: `${AT.tray.x}px`, top: `${AT.tray.y - 22}px` });
const paper = el("tb-paper", `<h4>2. Scope of work</h4>${'<div class="tb-l"></div>'.repeat(9)}<div class="tb-l short"></div>`);
Object.assign(paper.style, { width: "420px", height: "260px", left: "260px", top: "120px" });
const bar = el("tb-bar");
bar.setAttribute("role", "group");
bar.setAttribute("aria-label", "Toolbar");
Object.assign(bar.style, { left: `${AT.bar.x}px`, top: `${AT.bar.y}px` });
const menuEl = document.createElement("button");
menuEl.type = "button";
menuEl.className = "tb-menu";
menuEl.hidden = true;
menuEl.setAttribute("aria-label", "More");
bar.append(menuEl);
const dots = '<span class="tb-grip" data-grab aria-hidden="true">' + "<i></i>".repeat(6) + "</span>";
const tray = el("tb-tray", `<div class="tb-head">${dots}<b>Findings</b></div><ul>${WORDS.findings.map((w) => `<li>${w}</li>`).join("")}</ul>`);
tray.dataset.id = "findings";
Object.assign(tray.style, { left: `${AT.tray.x}px`, top: `${AT.tray.y}px`, width: `${AT.tray.width}px`, height: `${AT.tray.height}px` });
const ind = el("tb-ind");
const indLabel = el("tb-ind-label");
const marker = el("tb-marker");
ind.hidden = indLabel.hidden = marker.hidden = true;
stage.append(label, trayLabel, paper, tray, bar, ind, indLabel, marker);

/** What an item's element holds in a form. */
function dress(id: TbId, kind: StackFormKind): string {
  const words = WORDS[id];
  const title = TITLES[id];
  switch (kind) {
    case "row":
      return `${dots}${words.map((w) => `<span class="tb-pill">${w}</span>`).join("")}`;
    case "stacked":
      return `${dots}<span class="tb-col">${words.slice(0, 2).map((w) => `<span class="tb-pill">${w}</span>`).join("")}</span>`;
    case "icons":
      return `${dots}<span class="tb-pill main">${words[0]}</span>`;
    case "fold":
      return `${dots}<b class="tb-title">${title}</b><span class="tb-more" aria-hidden="true">»</span>`;
    case "open":
      return `${dots}<b class="tb-title">${title}</b>`;
    case "header":
      return `${dots}<b class="tb-title">${title}</b><span class="tb-caret" aria-hidden="true">▸</span>`;
    case "rail":
      return `${dots}`;
    default:
      return "";
  }
}

const items = new Map<string, HTMLElement>();
let lastFit: StackFit | null = null;
const px = (n: number): string => `${n}px`;
const put = (n: HTMLElement, r: Rect): void => {
  n.style.left = px(r.x);
  n.style.top = px(r.y);
  n.style.width = px(r.width);
  n.style.height = px(r.height);
};
/** Draw `fit` in the bar: one element per item at its rect; `skip` is the item held under the pointer. */
function drawFit(fit: StackFit, skip?: string): void {
  lastFit = fit;
  bar.style.width = px(fit.length);
  bar.style.height = px(fit.cross);
  const live = new Set(fit.items.map((p) => p.id));
  for (const [id, n] of items) {
    if (!live.has(id)) {
      n.remove();
      items.delete(id);
    }
  }
  for (const p of fit.items) {
    let n = items.get(p.id);
    if (!n) {
      n = document.createElement("section");
      n.className = `tb-item ${p.id === "findings" ? "tb-panel" : "tb-group"}`;
      n.dataset.id = p.id;
      bar.append(n);
      items.set(p.id, n);
    }
    if (n.dataset.kind !== p.kind) {
      n.dataset.kind = p.kind;
      n.innerHTML = dress(p.id as TbId, p.kind);
    }
    n.dataset.form = String(p.form);
    n.hidden = p.kind === "menu" || p.id === skip;
    if (p.kind !== "menu") put(n, p.rect);
  }
  if (fit.menu) {
    put(menuEl, fit.menu.rect);
    menuEl.hidden = false;
    menuEl.textContent = `» ${fit.menu.items.length}`;
    menuEl.title = fit.menu.items.map((id) => TITLES[id as TbId]).join(", ");
  } else menuEl.hidden = true;
}

// --- the stack -----------------------------------------------------------------------------------------------------

const itemOf = (id: TbId): StackItem => ({ id, used: used[id], forms: formsOf(id) });
/** The bar's input, with `without` (the dragged item) lifted out of it. */
const inputFor = (without?: string): StackInput => ({
  axis: "row",
  length,
  cross: { min: 36, max: BAR_HEIGHT, rail: BAR_HEIGHT },
  items: order.filter((id) => id !== without).map(itemOf),
  menu: { main: MENU },
  gap,
  pad: { start: pad, end: pad },
});

const shift = (r: Rect): Rect => ({ x: r.x + AT.bar.x, y: r.y + AT.bar.y, width: r.width, height: r.height });
const inBar = (id: TbId): boolean => order.includes(id);

/** Draw the bar from its order (the dragged item lifted out), or with the room a gap makes. */
function draw(room: DropTarget | null, without?: string): void {
  if (room) drawFit(room.target.fit, room.target.item);
  else drawFit(fitStack(inputFor(without)));
  // The panel waits under the bar until it is dropped in, then its place is dimmed.
  tray.style.opacity = inBar("findings") ? "0.35" : "1";
  const shown = room ? room.target.fit.cross : lastFit!.cross;
  stage.style.width = `${AT.bar.x + Math.max(length, 700) + 24}px`;
  stage.style.height = `${AT.tray.y + AT.tray.height + 24}px`;
  paper.style.top = `${AT.bar.y + shown + 16}px`;
}
const settle = (): void => draw(null);

// --- targets -------------------------------------------------------------------------------------------------------

export interface DropTarget {
  readonly id: string;
  readonly priority: 2;
  /** In stage px. */
  readonly hit: Rect;
  readonly slot: Rect;
  readonly at: number;
  readonly target: StackTarget;
  /** The marker line, in stage px. */
  readonly marker: Rect;
  readonly label: string;
}

/** A gap in words: before the item that follows it, or at the end. */
function gapWords(at: number, without: TbId): string {
  const rest = order.filter((id) => id !== without);
  return at < rest.length ? `before ${TITLES[rest[at]!]}` : "at the end";
}

/** Every gap of the bar for dragging `id`, in stage px: the solver's hits (with `endReach`), widened across the thin bar. */
export function targetsFor(id: TbId): DropTarget[] {
  return stackTargets(inputFor(id), itemOf(id), { endReach: END_REACH }).map((t) => {
    const hit = shift(t.hit);
    return {
      id: t.id,
      priority: 2,
      hit: { ...hit, height: Math.max(hit.height, REACH_ACROSS) },
      slot: shift(t.slot!),
      at: t.place.at,
      target: t,
      marker: shift(t.marker),
      label: gapWords(t.place.at, id),
    };
  });
}

// --- a drag --------------------------------------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}
interface Held {
  readonly id: TbId;
  readonly grab: Point;
  readonly home: Rect;
  readonly el: HTMLElement;
  readonly intent: DragIntent<DropTarget>;
  readonly targets: readonly DropTarget[];
  readonly hits: HTMLElement[];
  pointer: Point;
  shown: DropTarget | null;
  room: DropTarget | null;
  raf: number;
}
let drag: Held | null = null;

/** The last drop: the preview at the release, where the item then was, and the bar's height at each moment. */
export interface DropRecord {
  readonly id: TbId;
  readonly landed: { at: number } | null;
  readonly shown: string | null;
  readonly previewDom: Rect | null;
  readonly previewSolve: Rect | null;
  readonly landedDom: Rect | null;
  readonly landedSolve: Rect | null;
  readonly landedKind: StackFormKind | null;
  readonly cancelled: boolean;
}
let lastDrop: DropRecord | null = null;

const domRect = (n: HTMLElement): Rect => {
  const s = stage.getBoundingClientRect();
  const r = n.getBoundingClientRect();
  return { x: r.left - s.left - stage.clientLeft, y: r.top - s.top - stage.clientTop, width: r.width, height: r.height };
};
const stagePoint = (e: { clientX: number; clientY: number }): Point => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left - stage.clientLeft, y: e.clientY - r.top - stage.clientTop };
};

function showPreview(t: DropTarget | null, id: TbId): void {
  if (!t) {
    ind.hidden = indLabel.hidden = marker.hidden = true;
    return;
  }
  Object.assign(ind.style, { left: `${t.slot.x}px`, top: `${t.slot.y}px`, width: `${t.slot.width}px`, height: `${t.slot.height}px` });
  indLabel.textContent = `${TITLES[id]} → ${t.label}`;
  Object.assign(indLabel.style, { left: `${Math.max(4, t.slot.x + 4)}px`, top: `${Math.max(4, t.slot.y - 22)}px` });
  const m = t.marker;
  Object.assign(marker.style, { left: `${m.x - 1.5}px`, top: `${m.y}px`, width: "3px", height: `${m.height}px` });
  ind.hidden = indLabel.hidden = marker.hidden = false;
}

function beginDrag(id: TbId, start: Point, p: Point): void {
  const source = inBar(id) ? items.get(id) : tray;
  if (!source || source.hidden) return;
  const home = domRect(source);
  const grab = { x: start.x - home.x, y: start.y - home.y };
  const held = document.createElement("section");
  const panel = id === "findings";
  held.className = `tb-item tb-held ${panel ? "tb-panel" : "tb-group"}`;
  const kind = (inBar(id) ? source.dataset.kind : "open") as StackFormKind;
  held.dataset.kind = kind;
  held.innerHTML = dress(id, kind);
  Object.assign(held.style, { width: `${home.width}px`, height: `${home.height}px`, left: `${p.x - grab.x}px`, top: `${p.y - grab.y}px` });
  stage.append(held);
  // The item is lifted out of the bar: the bar is drawn without it.
  draw(null, id);
  const targets = targetsFor(id);
  const hits = hitsIn.checked
    ? targets.map((t) => {
        const h = el("tb-hit");
        Object.assign(h.style, { left: `${t.hit.x}px`, top: `${t.hit.y}px`, width: `${t.hit.width}px`, height: `${t.hit.height}px` });
        stage.append(h);
        return h;
      })
    : [];
  const intent = createDragIntent<DropTarget>({ home });
  drag = { id, grab, home, el: held, intent, targets, hits, pointer: p, shown: null, room: null, raf: 0 };
  stage.classList.add("dragging");
  const loop = (): void => {
    if (!drag) return;
    aim(performance.now());
    drag.raf = requestAnimationFrame(loop);
  };
  drag.raf = requestAnimationFrame(loop);
  say(`${TITLES[id]} lifted. Move over a gap of the bar.`);
}

/** Once a frame while an item is held: the intent says what shows; the preview says what moves. */
function aim(now: number): void {
  const d = drag;
  if (!d) return;
  Object.assign(d.el.style, { left: `${d.pointer.x - d.grab.x}px`, top: `${d.pointer.y - d.grab.y}px` });
  const f = d.intent.update(d.pointer, now, d.targets);
  const plan = previewPlan(f, "gap");
  const room = plan.makeRoom ? f.shown : null;
  if (room?.id !== d.room?.id) {
    d.room = room;
    draw(room, d.id);
  }
  if (f.shown?.id !== d.shown?.id) say(f.shown ? `${TITLES[d.id]} → ${f.shown.label}: release to drop it on the dashed rectangle.` : `${TITLES[d.id]}: move over a gap.`);
  d.shown = f.shown;
  showPreview(plan.showIndicator ? f.shown : null, d.id);
}

function endDrag(cancel: boolean): void {
  const d = drag;
  if (!d) return;
  if (!cancel) aim(performance.now());
  const t = cancel ? null : d.intent.release(d.pointer, d.targets);
  cancelAnimationFrame(d.raf);
  const shown = d.shown;
  const previewDom = ind.hidden ? null : domRect(ind);
  const previewSolve = shown ? shown.slot : null;
  drag = null;
  d.el.remove();
  for (const h of d.hits) h.remove();
  stage.classList.remove("dragging");
  showPreview(null, d.id);
  let landedSolve: Rect | null = null;
  if (t) {
    order = order.filter((x) => x !== d.id);
    order.splice(t.at, 0, d.id);
    used[d.id] = ++clock;
    landedSolve = t.slot;
  }
  settle();
  let landedDom: Rect | null = null;
  const n = items.get(d.id);
  if (n && !n.hidden) landedDom = domRect(n);
  lastDrop = { id: d.id, landed: t ? { at: t.at } : null, shown: shown?.id ?? null, previewDom, previewSolve, landedDom, landedSolve, landedKind: (n?.dataset.kind as StackFormKind | undefined) ?? null, cancelled: cancel };
  if (t) say(`${TITLES[d.id]} → ${t.label}. ${readout()}`);
  else say(cancel ? "Cancelled: back where it was." : "No target: it went home.");
}

// --- input ---------------------------------------------------------------------------------------------------------

function track(e: PointerEvent, id: TbId): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const start = stagePoint(e);
  let lifted = false;
  const stop = (): void => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("keydown", key);
  };
  const move = (ev: PointerEvent): void => {
    const p = stagePoint(ev);
    if (!lifted) {
      if (Math.hypot(p.x - start.x, p.y - start.y) < DRAG_DEFAULTS.lift) return;
      lifted = true;
      beginDrag(id, start, p);
    }
    if (drag) drag.pointer = p;
  };
  const up = (ev: PointerEvent): void => {
    stop();
    if (lifted && drag) {
      drag.pointer = stagePoint(ev);
      endDrag(ev.type === "pointercancel");
    }
  };
  const key = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape" && drag) {
      stop();
      endDrag(true);
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  window.addEventListener("keydown", key);
}

stage.addEventListener("pointerdown", (e) => {
  if (drag) return;
  const t = e.target as HTMLElement;
  const it = t.closest<HTMLElement>(".tb-item, .tb-tray");
  if (!it || !t.closest("[data-grab]")) return;
  if (it.classList.contains("tb-tray") && inBar("findings")) return;
  track(e, it.dataset.id as TbId);
});

// --- words ---------------------------------------------------------------------------------------------------------

const KIND_WORDS: Partial<Record<StackFormKind, string>> = { row: "its row", stacked: "stacked", icons: "its main tool", fold: "a fold », in line", menu: "the » menu", header: "its header", rail: "a rail icon", open: "open" };
function readout(): string {
  const fit = lastFit!;
  const parts = fit.items.map((p) => `${TITLES[p.id as TbId]} ${KIND_WORDS[p.kind] ?? p.kind}`);
  return `Bar ${fit.cross} px tall, ${Math.round(fit.length)} px long: ${parts.join(" · ")}${fit.notes.some((n) => n.code === "overflow") ? " · overflows" : ""}.`;
}
function say(text: string): void {
  status.textContent = text;
}

// --- controls ------------------------------------------------------------------------------------------------------

const out = (id: string, text: string): void => {
  (document.getElementById(id) as HTMLOutputElement).textContent = text;
};
const clampTo = (input: HTMLInputElement, n: number): number => Math.min(Math.max(Math.round(n), Number(input.min)), Number(input.max));
function setLength(n: number): void {
  length = clampTo(lengthIn, n);
  lengthIn.value = String(length);
  out("tb-length-out", `${length} px`);
  settle();
  say(readout());
}
function setGap(n: number): void {
  gap = clampTo(gapIn, n);
  gapIn.value = String(gap);
  out("tb-gap-out", `${gap} px`);
  settle();
  say(readout());
}
function setPad(n: number): void {
  pad = clampTo(padIn, n);
  padIn.value = String(pad);
  out("tb-pad-out", `${pad} px`);
  settle();
  say(readout());
}
function setToolsAge(age: "newest" | "oldest"): void {
  toolsAge = age;
  used.tools = age === "newest" ? ++clock : 0;
  for (const r of document.querySelectorAll<HTMLInputElement>("input[name=tb-age]")) r.checked = r.value === age;
  settle();
  say(readout());
}
lengthIn.addEventListener("input", () => setLength(Number(lengthIn.value)));
gapIn.addEventListener("input", () => setGap(Number(gapIn.value)));
padIn.addEventListener("input", () => setPad(Number(padIn.value)));
for (const r of document.querySelectorAll<HTMLInputElement>("input[name=tb-age]")) r.addEventListener("change", () => r.checked && setToolsAge(r.value as "newest" | "oldest"));

function reset(): void {
  if (drag) endDrag(true);
  order = DEFAULT_ORDER();
  used = DEFAULT_USED();
  clock = 9;
  lastDrop = null;
  toolsAge = "newest";
  for (const r of document.querySelectorAll<HTMLInputElement>("input[name=tb-age]")) r.checked = r.value === "newest";
  gap = DEFAULTS.gap;
  pad = DEFAULTS.pad;
  gapIn.value = String(gap);
  padIn.value = String(pad);
  out("tb-gap-out", `${gap} px`);
  out("tb-pad-out", `${pad} px`);
  setLength(DEFAULTS.length);
}
document.getElementById("tb-reset")!.addEventListener("click", reset);

settle();
say(readout());

/** What the scenarios read and drive. */
export const page = {
  stage,
  bar,
  menuEl,
  tray,
  ind,
  indLabel,
  marker,
  reset,
  setLength,
  setGap,
  setPad,
  setToolsAge,
  targetsFor,
  itemEl: (id: string): HTMLElement | undefined => items.get(id),
  /** Put the groups in this order (and ages), for a scenario's start; the panel is put in the bar only if listed. */
  setOrder(next: readonly TbId[], ages?: Partial<Record<TbId, number>>): void {
    order = [...next];
    if (ages) for (const [id, n] of Object.entries(ages)) used[id as TbId] = n!;
    clock = Math.max(clock, ...Object.values(used));
    settle();
  },
  get order() {
    return [...order];
  },
  get used() {
    return { ...used };
  },
  get toolsAge() {
    return toolsAge;
  },
  get dragging() {
    return drag ? { id: drag.id, room: drag.room?.id ?? null, shown: drag.shown?.id ?? null } : null;
  },
  get lastDrop() {
    return lastDrop;
  },
  get status() {
    return status.textContent ?? "";
  },
  get length() {
    return length;
  },
  get gap() {
    return gap;
  },
  get pad() {
    return pad;
  },
  /** The solver's input for the bar as it stands now. */
  input: (): StackInput => inputFor(),
  fit: (): StackFit => lastFit!,
  at: AT,
  endReach: END_REACH,
  barHeight: BAR_HEIGHT,
};
export type ToolbarPage = typeof page;
