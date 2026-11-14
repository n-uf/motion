/**
 * The Stack · drop page: a column and a bar of sample panels and groups. Drag any item into any gap of either. The
 * targets are `stackTargets` (one per gap, each with the exact solve a drop there makes), what shows and when is
 * @n-uf/motion/drag's intent (`createDragIntent` + `previewPlan`, the "gap" preview: a dashed preview at the dragged
 * item's rect in the solve, a marker line where its leading edge lands, and the others moving to the places the
 * solve gives them once the room opens). A release lands on the same solve, so the item arrives on the preview's rect.
 *
 * The page writes every word. The scripted scenarios (drop-scenarios.ts) drive it through `page`.
 */
import type { Rect } from "@n-uf/motion";
import { DRAG_DEFAULTS, createDragIntent, previewPlan, type DragIntent } from "@n-uf/motion/drag";
import { fitStack, stackTargets, type StackFit, type StackInput, type StackTarget } from "@n-uf/placement/stack";
import { ALL, inputOf, itemOf, titleOf, type ItemId, type Placed } from "./sample";
import { createStackView, dress, type StackView } from "./view";
import { noteWords, sayFit } from "./words";

export type StackName = "column" | "bar";
const AXIS = { column: "column", bar: "row" } as const;
const AT = { column: { x: 24, y: 44 }, bar: { x: 330, y: 44 } } as const;
/** The app widens a gap's zone across a thin stack so it is easy to hit. */
const REACH = { column: 80, bar: 56 };

const DEFAULT_ORDERS = (): Record<StackName, ItemId[]> => ({ column: ["views", "pages", "annotations", "findings"], bar: ["tools", "zoom"] });
const DEFAULT_USED = (): Record<ItemId, number> => ({ pages: 1, annotations: 2, findings: 3, views: 4, tools: 5, zoom: 6 });

let orders = DEFAULT_ORDERS();
let used = DEFAULT_USED();
/** Items kept open, and panels folded by hand (their first form), as a person would set them. */
let kept = new Set<ItemId>();
let firstForm: Partial<Record<ItemId, number>> = {};
let clock = 6;
const lengths: Record<StackName, number> = { column: 440, bar: 560 };

const stage = document.getElementById("sd-stage") as HTMLDivElement;
const status = document.getElementById("st-status") as HTMLParagraphElement;
const colIn = document.getElementById("sd-col") as HTMLInputElement;
const barIn = document.getElementById("sd-bar") as HTMLInputElement;
const hitsIn = document.getElementById("sd-hits") as HTMLInputElement;

const zone = (text: string, x: number, y: number): void => {
  const l = document.createElement("div");
  l.className = "st-zone-label";
  l.textContent = text;
  l.style.left = `${x}px`;
  l.style.top = `${y}px`;
  stage.append(l);
};
zone("Column (a side edge)", AT.column.x, 18);
zone("Bar (the top edge)", AT.bar.x, 18);
const paper = document.createElement("div");
paper.className = "st-paper";
paper.innerHTML = `<h4>2. Scope of work</h4>${'<div class="st-l"></div>'.repeat(9)}<div class="st-l short"></div>`;
paper.style.width = "420px";
paper.style.height = "300px";
stage.append(paper);
const views: Record<StackName, StackView> = {
  column: createStackView(stage, "column", "Column"),
  bar: createStackView(stage, "row", "Bar"),
};
for (const name of ["column", "bar"] as const) {
  views[name].el.style.left = `${AT[name].x}px`;
  views[name].el.style.top = `${AT[name].y}px`;
}
const ind = document.createElement("div");
ind.className = "st-ind";
const indLabel = document.createElement("div");
indLabel.className = "st-ind-label";
const marker = document.createElement("div");
marker.className = "st-marker";
ind.hidden = indLabel.hidden = marker.hidden = true;
stage.append(ind, indLabel, marker);

// --- the stacks ----------------------------------------------------------------------------------------------------

/** A stack's input, with `without` (the dragged item) lifted out of it. */
const placedOf = (id: ItemId): Placed => ({ id, used: used[id], kept: kept.has(id), from: firstForm[id] ?? 0 });
const inputFor = (name: StackName, without?: ItemId): StackInput =>
  inputOf(AXIS[name], lengths[name], orders[name].filter((id) => id !== without).map(placedOf));

function fitsWithout(without?: ItemId): Record<StackName, StackFit> {
  return { column: fitStack(inputFor("column", without)), bar: fitStack(inputFor("bar", without)) };
}

const shift = (r: Rect, name: StackName): Rect => ({ x: r.x + AT[name].x, y: r.y + AT[name].y, width: r.width, height: r.height });

/** Draw both stacks: from their orders (the dragged item lifted out), or with the room a gap makes. */
function draw(room: DropTarget | null, without?: ItemId): void {
  const fits = fitsWithout(without);
  for (const name of ["column", "bar"] as const) {
    if (room && room.stack === name) views[name].draw(room.target.fit, room.target.item);
    else views[name].draw(fits[name]);
  }
  // The pages sheet sits below the bar.
  const barBottom = AT.bar.y + (room?.stack === "bar" ? room.target.fit.cross : fits.bar.cross);
  paper.style.left = `${AT.bar.x}px`;
  paper.style.top = `${barBottom + 16}px`;
  stage.style.width = `${AT.bar.x + Math.max(lengths.bar, 420) + 24}px`;
  stage.style.height = `${AT.column.y + Math.max(lengths.column, 340) + 24}px`;
}
const settle = (): void => draw(null);

// --- targets -------------------------------------------------------------------------------------------------------

export interface DropTarget {
  readonly id: string;
  readonly priority: 2;
  /** In stage px. */
  readonly hit: Rect;
  readonly slot: Rect;
  readonly stack: StackName;
  readonly at: number;
  readonly target: StackTarget;
  /** The marker line, in stage px. */
  readonly marker: Rect;
  readonly label: string;
}

const Cap = (s: StackName): string => (s === "column" ? "Column" : "Bar");
/** A gap in words: before the item that follows it, or at the end. */
function gapWords(name: StackName, at: number, without: ItemId): string {
  const order = orders[name].filter((id) => id !== without);
  return `${Cap(name)} · ${at < order.length ? `before ${titleOf(order[at]!)}` : "at the end"}`;
}

/** Every gap of both stacks for dragging `id`, in stage px. */
export function targetsFor(id: ItemId): DropTarget[] {
  const out: DropTarget[] = [];
  for (const name of ["column", "bar"] as const) {
    const dragged = itemOf(placedOf(id), AXIS[name]);
    for (const t of stackTargets(inputFor(name, id), dragged)) {
      const hit = shift(t.hit, name);
      const wide = name === "column" ? { ...hit, width: Math.max(hit.width, REACH.column) } : { ...hit, height: Math.max(hit.height, REACH.bar) };
      out.push({ id: `${name}:${t.id}`, priority: 2, hit: wide, slot: shift(t.slot!, name), stack: name, at: t.place.at, target: t, marker: shift(t.marker, name), label: gapWords(name, t.place.at, id) });
    }
  }
  return out;
}

// --- a drag --------------------------------------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}
interface Held {
  readonly id: ItemId;
  readonly grab: Point;
  readonly home: Rect;
  readonly from: StackName;
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

/** The last drop: where the preview was drawn at the release and where the item then was, both as the DOM has them. */
export interface DropRecord {
  readonly id: ItemId;
  readonly landed: { stack: StackName; at: number } | null;
  /** The target the preview showed at the release (null: none). */
  readonly shown: string | null;
  /** The dashed preview's rect as drawn at the release (stage px), or null. */
  readonly previewDom: Rect | null;
  /** The solver's rect for the item in the target's fit (stage px). */
  readonly previewSolve: Rect | null;
  /** The item's rect as drawn after the drop (stage px), null if it isn't drawn (in the » menu). */
  readonly landedDom: Rect | null;
  /** The solver's rect for the item after the drop (stage px). */
  readonly landedSolve: Rect | null;
  readonly cancelled: boolean;
}
let lastDrop: DropRecord | null = null;

const domRect = (el: HTMLElement): Rect => {
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - s.left - stage.clientLeft, y: r.top - s.top - stage.clientTop, width: r.width, height: r.height };
};
const stagePoint = (e: { clientX: number; clientY: number }): Point => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left - stage.clientLeft, y: e.clientY - r.top - stage.clientTop };
};
const stackOf = (id: ItemId): StackName | null => (["column", "bar"] as const).find((n) => orders[n].includes(id)) ?? null;

function showPreview(t: DropTarget | null, id: ItemId): void {
  if (!t) {
    ind.hidden = indLabel.hidden = marker.hidden = true;
    return;
  }
  Object.assign(ind.style, { left: `${t.slot.x}px`, top: `${t.slot.y}px`, width: `${t.slot.width}px`, height: `${t.slot.height}px` });
  indLabel.textContent = `${titleOf(id)} → ${t.label}`;
  Object.assign(indLabel.style, { left: `${Math.max(4, t.slot.x + 4)}px`, top: `${Math.max(4, t.slot.y + 4)}px` });
  const m = t.marker;
  Object.assign(marker.style, m.height === 0 ? { left: `${m.x}px`, top: `${m.y - 1.5}px`, width: `${m.width}px`, height: "3px" } : { left: `${m.x - 1.5}px`, top: `${m.y}px`, width: "3px", height: `${m.height}px` });
  ind.hidden = indLabel.hidden = marker.hidden = false;
}

function beginDrag(id: ItemId, start: Point, p: Point): void {
  const from = stackOf(id);
  const itemEl = from ? views[from].itemEl(id) : undefined;
  if (!from || !itemEl || itemEl.hidden) return;
  const home = domRect(itemEl);
  const grab = { x: start.x - home.x, y: start.y - home.y };
  const el = document.createElement("section");
  el.className = `st-item st-held ${itemEl.classList.contains("st-panel") ? "st-panel" : "st-group"}`;
  const kind = itemEl.dataset.kind!;
  el.dataset.kind = kind;
  el.innerHTML = dress(id, kind as Parameters<typeof dress>[1]);
  Object.assign(el.style, { width: `${home.width}px`, height: `${home.height}px`, left: `${p.x - grab.x}px`, top: `${p.y - grab.y}px` });
  stage.append(el);
  // The item is lifted out of its stack: the stacks are drawn without it.
  draw(null, id);
  const targets = targetsFor(id);
  const hits = hitsIn.checked
    ? targets.map((t) => {
        const h = document.createElement("div");
        h.className = "st-hit";
        Object.assign(h.style, { left: `${t.hit.x}px`, top: `${t.hit.y}px`, width: `${t.hit.width}px`, height: `${t.hit.height}px` });
        stage.append(h);
        return h;
      })
    : [];
  const intent = createDragIntent<DropTarget>({ home });
  drag = { id, grab, home, from, el, intent, targets, hits, pointer: p, shown: null, room: null, raf: 0 };
  stage.classList.add("dragging");
  const loop = (): void => {
    if (!drag) return;
    aim(performance.now());
    drag.raf = requestAnimationFrame(loop);
  };
  drag.raf = requestAnimationFrame(loop);
  say(`${titleOf(id)} lifted from the ${from}. Move over a gap.`);
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
  if (f.shown?.id !== d.shown?.id) say(f.shown ? `${titleOf(d.id)} → ${f.shown.label}: release to drop it on the dashed rectangle.` : `${titleOf(d.id)}: move over a gap.`);
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
    for (const n of ["column", "bar"] as const) orders[n] = orders[n].filter((x) => x !== d.id);
    orders[t.stack].splice(t.at, 0, d.id);
    used[d.id] = ++clock;
    landedSolve = t.slot;
  }
  settle();
  let landedDom: Rect | null = null;
  const at = stackOf(d.id);
  if (at) {
    const el = views[at].itemEl(d.id);
    if (el && !el.hidden) landedDom = domRect(el);
  }
  lastDrop = { id: d.id, landed: t ? { stack: t.stack, at: t.at } : null, shown: shown?.id ?? null, previewDom, previewSolve, landedDom, landedSolve, cancelled: cancel };
  if (t) {
    const fit = views[t.stack].fit()!;
    say(`${titleOf(d.id)} → ${t.label}. ${sayFit(Cap(t.stack), fit)}`);
  } else say(cancel ? "Cancelled: back where it was." : "No target: it went home.");
}

// --- input ---------------------------------------------------------------------------------------------------------

function track(e: PointerEvent, id: ItemId): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const start = stagePoint(e);
  let lifted = false;
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
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("keydown", key);
    if (lifted && drag) {
      drag.pointer = stagePoint(ev);
      endDrag(ev.type === "pointercancel");
    }
  };
  const key = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape" && drag) {
      endDrag(true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
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
  const it = t.closest<HTMLElement>(".st-item");
  if (!it || !t.closest("[data-grab]")) return;
  track(e, it.dataset.id as ItemId);
});

function say(text: string): void {
  status.textContent = text;
}
const readout = (): string => `${sayFit("Column", views.column.fit()!)} ${sayFit("Bar", views.bar.fit()!)}`;

function setLength(name: StackName, n: number): void {
  const input = name === "column" ? colIn : barIn;
  lengths[name] = Math.min(Math.max(Math.round(n), Number(input.min)), Number(input.max));
  input.value = String(lengths[name]);
  (document.getElementById(name === "column" ? "sd-col-out" : "sd-bar-out") as HTMLOutputElement).textContent = `${lengths[name]} px`;
  settle();
  say(readout());
}
colIn.addEventListener("input", () => setLength("column", Number(colIn.value)));
barIn.addEventListener("input", () => setLength("bar", Number(barIn.value)));

function reset(): void {
  if (drag) endDrag(true);
  orders = DEFAULT_ORDERS();
  used = DEFAULT_USED();
  kept = new Set();
  firstForm = {};
  clock = 6;
  lastDrop = null;
  setLength("column", 440);
  setLength("bar", 560);
}
document.getElementById("sd-reset")!.addEventListener("click", reset);

settle();
say(readout());

/** What the scenarios read and drive. */
export const page = {
  stage,
  views,
  ind,
  indLabel,
  marker,
  reset,
  setLength,
  targetsFor,
  noteWords,
  all: ALL,
  /** Put the items in these orders (and ages), for a scenario's start. */
  setOrders(next: Record<StackName, ItemId[]>, ages?: Partial<Record<ItemId, number>>, hand?: { kept?: readonly ItemId[]; from?: Partial<Record<ItemId, number>> }): void {
    orders = { column: [...next.column], bar: [...next.bar] };
    if (ages) for (const [id, n] of Object.entries(ages)) used[id as ItemId] = n!;
    if (hand?.kept) kept = new Set(hand.kept);
    if (hand?.from) firstForm = { ...hand.from };
    clock = Math.max(clock, ...Object.values(used));
    settle();
  },
  get orders() {
    return { column: [...orders.column], bar: [...orders.bar] };
  },
  get used() {
    return { ...used };
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
  get lengths() {
    return { ...lengths };
  },
  fits: () => ({ column: views.column.fit()!, bar: views.bar.fit()! }),
  at: AT,
};
export type DropPage = typeof page;
