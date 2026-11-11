/**
 * The desk's window frame and its toolbar groups: a title bar over the stage, a bottom toolbar under it and a side
 * toolbar on each side, plus the top toolbar (the construction's own pill or bar, inside the stage). Each holds
 * groups in three zones (desk/toolbars.ts has the model and the layout rules).
 *
 * - Bars and groups move by the lab's motion rules: a settle to the new place, content laid out at its target size
 *   and revealed (never stretched); a group that changes bars glides from where it was drawn.
 * - A bar with no groups takes no space; while something is dragged, each empty host shows as a drop strip.
 * - A group drags by its handle or empty space (its buttons stay buttons), through the shared drag model
 *   (desk/intent.ts): the insertion line shows only when aiming, room is made after ROOM_AFTER, snap glides the group
 *   into its slot; Escape and a cancelled pointer put it back. A side toolbar or the bottom toolbar drags by its grip
 *   to another edge and swaps groups with the toolbar there; the top toolbar does the same through the page's drag
 *   (its targets: pillSwapTargets). The title bar stays where it is.
 * - The top toolbar's width follows its groups and it hides with none (withGroupOptions: the pill's options).
 */
import { createSettle, SETTLE_TEMPO, type Rect, type Settle } from "@n-uf/motion";
import { overlap, nextFrame, type Point } from "../shared/geometry";
import { cancelPress, trackPress } from "../shared/press";
import { toolGroupCells } from "./content";
import type { DropTarget, TargetInput } from "./drops";
import { DRAG, createIntent, within, type Intent, type Target } from "./intent";
import type { Options } from "./model";
import type { DeskLab, IndicatorEntry, PathKey } from "./scenarios";
import {
  CASES,
  DEFAULT_ARRANGEMENT,
  GROUPS,
  GROUP_LABEL,
  HOSTS,
  HOST_LABEL,
  ZONES,
  autoMore,
  hostNeed,
  insertGroup,
  insertions,
  isEmptyHost,
  layoutHost,
  sameArrangement,
  swapHosts,
  vertical,
  withoutGroup,
  type Arrangement,
  type GroupId,
  type HostId,
  type HostLayout,
  type HostSpec,
} from "./toolbars";

/** Bar sizes (px): the title bar's and bottom bar's height, a side bar's width; what each end keeps. */
export const TITLE_H = 38;
export const BAR_H = 38;
export const SIDE_W = 40;
const CONTROLS = 76;
const BAR_LEAD = 22;
const PILL_LEAD = 26;
const TAIL = 8;
/** A drop strip's thickness (an empty host while dragging). */
const STRIP = 34;
/** The pill's default width (layouts.ts): the groups widen it only past this. */
const PILL_DEFAULT = 320;
const GAP_EDGE = 6;

type FrameHost = "title" | "bottom" | "left" | "right";
type BottomMode = "reserved" | "floating";

let lab: DeskLab | null = null;
let stage: HTMLElement | null = null;
let win: HTMLDivElement | null = null;
let layer: HTMLDivElement | null = null;
let indEl: HTMLDivElement | null = null;
let indLabel: HTMLDivElement | null = null;
let measureBox: HTMLDivElement | null = null;
const bars = new Map<FrameHost, { el: HTMLDivElement; rect: Settle<Rect> }>();
const strips = new Map<HostId, HTMLDivElement>();
/** The pill's (or the top bar's) group container, and the pill element. */
let topBox: HTMLElement | null = null;
let topItem: HTMLElement | null = null;

let arrangement: Arrangement = DEFAULT_ARRANGEMENT;
/** While a drag has made room: the arrangement shown (the dragged one dropped where the indicator is). */
let preview: Arrangement | null = null;
let bottomMode: BottomMode = "reserved";
const shownArrangement = (): Arrangement => preview ?? arrangement;

const omega = (): number => SETTLE_TEMPO[(document.querySelector<HTMLInputElement>("input[name=tempo]:checked")?.value as keyof typeof SETTLE_TEMPO | undefined) ?? "default"] ?? SETTLE_TEMPO.default;
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.01;

// --- groups' markup and sizes ----------------------------------------------------------------------------------------

const word = (t: string, i: string): string => `<button type="button" class="tb-cell tg-word" tabindex="-1" title="${t}" aria-label="${t}"><span class="t">${t}</span><span class="i">${i}</span></button>`;
const text = (t: string, title: string): string => `<button type="button" class="tb-cell tg-sym" tabindex="-1" title="${title}" aria-label="${title}">${t}</button>`;

function groupBody(id: string): string {
  switch (id.startsWith("more") ? "more" : (id as GroupId)) {
    case "doc":
      return `<span class="tg-doc"><span class="tg-dot"></span><span class="tg-name">Quarterly plan</span><span class="tg-page">P 1/3</span></span>`;
    case "edit":
      return toolGroupCells(0);
    case "history":
      return toolGroupCells(1);
    case "view":
      return toolGroupCells(2);
    case "zoom":
      return `${text("−", "Zoom out")}<span class="tg-zoom">100%</span>${text("+", "Zoom in")}`;
    case "more":
      return `${text("⋯", "More")}<span class="tg-badge"></span>`;
    case "panel":
      return word("Panel", "◧");
    case "share":
      return `${word("Share", "⇪")}${word("Print", "⎙")}`;
    default:
      return "";
  }
}
const labelOf = (id: string): string => (id.startsWith("more") ? "More" : GROUP_LABEL[id as GroupId]);

function groupMarkup(id: string): string {
  return `<div class="tg-in"><span class="tg-handle" tabindex="0" role="button" aria-label="Move the ${labelOf(id)} group" title="Drag to move; Space, then the arrow keys"></span>${groupBody(id)}</div>`;
}

/** Each group's natural size, horizontal and vertical, measured once from its markup. */
const sizes = new Map<string, { along: number; across: number }>();
function groupSize(id: string, v: boolean): { along: number; across: number } {
  const key = `${id.startsWith("more") ? "more" : id}|${v}`;
  const known = sizes.get(key);
  if (known) return known;
  if (!measureBox) return { along: 60, across: 30 };
  const el = document.createElement("div");
  el.className = `tgroup${v ? " v" : ""}`;
  el.innerHTML = groupMarkup(id);
  measureBox.append(el);
  const inner = el.firstElementChild as HTMLElement;
  const w = inner.offsetWidth;
  const h = inner.offsetHeight;
  el.remove();
  const s = v ? { along: h, across: w } : { along: w, across: h };
  if (w > 0 && h > 0) sizes.set(key, s);
  return s;
}

// --- geometry --------------------------------------------------------------------------------------------------------

/** Where each host is (window coordinates: the frame's top-left), its room, and whether it shows. */
export interface Geometry {
  readonly L: number;
  readonly R: number;
  readonly B: number;
  /** The stage's outer size (its 1 px border included) and the window's. */
  readonly SW: number;
  readonly SH: number;
  readonly width: number;
  readonly height: number;
  readonly hosts: Readonly<Record<HostId, { readonly origin: Point; readonly spec: HostSpec; readonly shows: boolean; readonly strip: boolean }>>;
}

/** The window as the arrangement lays it out, at the stage's size as set (targets, not what is drawn). */
export function geometry(a: Arrangement, dragging = false): Geometry {
  const size = lab!.size();
  const SW = size.width + 2;
  const SH = size.height + 2;
  const L = isEmptyHost(a, "left") ? 0 : SIDE_W;
  const R = isEmptyHost(a, "right") ? 0 : SIDE_W;
  const floating = bottomMode === "floating";
  const B = !floating && !isEmptyHost(a, "bottom") ? BAR_H : 0;
  const width = L + SW + R;
  const height = TITLE_H + SH + B;
  const empty = (h: HostId): boolean => isEmptyHost(a, h);
  const strip = (h: HostId): boolean => dragging && empty(h);
  const bottomLen = Math.min(Math.max(80, hostNeed(a.bottom, { lead: BAR_LEAD, tail: TAIL }, groupSize, false)), SW - 24);
  const placed = lab!.layout().items.get("toolbar");
  const pillShows = !!placed && !placed.hidden;
  const pr = placed?.rect ?? rect(SW / 2 - PILL_DEFAULT / 2, GAP_EDGE, PILL_DEFAULT, 30);
  const top = pillShows
    ? { origin: { x: L + 1 + pr.x, y: TITLE_H + 1 + pr.y }, spec: { length: pr.width, thickness: pr.height, lead: placed!.look === "pill" ? PILL_LEAD : 8, tail: TAIL }, shows: true, strip: false }
    : { origin: { x: L + 1 + (SW - 2) / 2 - PILL_DEFAULT / 2, y: TITLE_H + 1 + GAP_EDGE }, spec: { length: PILL_DEFAULT, thickness: STRIP - 4, lead: 6, tail: 6 }, shows: false, strip: strip("top") };
  const side = (h: "left" | "right", x: number, stripX: number) =>
    empty(h)
      ? { origin: { x: stripX, y: TITLE_H }, spec: { length: SH, thickness: STRIP, lead: 6, tail: 6 }, shows: false, strip: strip(h) }
      : { origin: { x, y: TITLE_H }, spec: { length: SH, thickness: SIDE_W, lead: BAR_LEAD, tail: TAIL }, shows: true, strip: false };
  const bottom = empty("bottom")
    ? { origin: { x: L, y: TITLE_H + SH - STRIP }, spec: { length: SW, thickness: STRIP, lead: 6, tail: 6 }, shows: false, strip: strip("bottom") }
    : floating
      ? { origin: { x: L + SW / 2 - bottomLen / 2, y: TITLE_H + SH - 1 - GAP_EDGE - BAR_H }, spec: { length: bottomLen, thickness: BAR_H, lead: BAR_LEAD, tail: TAIL }, shows: true, strip: false }
      : { origin: { x: 0, y: TITLE_H + SH }, spec: { length: width, thickness: BAR_H, lead: BAR_LEAD, tail: TAIL }, shows: true, strip: false };
  return {
    L,
    R,
    B,
    SW,
    SH,
    width,
    height,
    hosts: {
      title: { origin: { x: 0, y: 0 }, spec: { length: width, thickness: TITLE_H, lead: CONTROLS, tail: TAIL }, shows: true, strip: false },
      top,
      bottom,
      left: side("left", 0, L),
      right: side("right", L + SW, L + SW - STRIP),
    },
  };
}

/** A host's rect in window coordinates. */
export function hostRect(g: Geometry, h: HostId): Rect {
  const { origin, spec } = g.hosts[h];
  return vertical(h) ? rect(origin.x, origin.y, spec.thickness, spec.length) : rect(origin.x, origin.y, spec.length, spec.thickness);
}

const layouts = (a: Arrangement, g: Geometry): Map<HostId, HostLayout> => new Map(HOSTS.filter((h) => g.hosts[h].shows || g.hosts[h].strip).map((h) => [h, layoutHost(a[h], h, g.hosts[h].spec, groupSize)]));

/** Every group's (and shown ⋯'s) place: its host, its rect there and in the window, folded or not, the ⋯ count. */
export interface Placement {
  readonly host: HostId;
  readonly local: Rect;
  readonly rect: Rect;
  readonly vertical: boolean;
  readonly folded: boolean;
  readonly badge: number;
}

export function placements(a: Arrangement, g: Geometry): Map<string, Placement> {
  const out = new Map<string, Placement>();
  for (const [h, l] of layouts(a, g)) {
    const o = g.hosts[h].origin;
    const at = (r: Rect): Rect => rect(o.x + r.x, o.y + r.y, r.width, r.height);
    for (const [id, r] of l.slots) out.set(id, { host: h, local: r, rect: at(r), vertical: vertical(h), folded: false, badge: id === l.more ? l.folded.length : 0 });
    const more = l.more ? l.slots.get(l.more) : undefined;
    for (const id of l.folded) if (more) out.set(id, { host: h, local: more, rect: at(more), vertical: vertical(h), folded: true, badge: 0 });
  }
  return out;
}

/**
 * What breaks the layout's promises: groups of one host overlapping, a group outside its host, a host or group
 * outside the window, groups of different hosts overlapping.
 */
export function layoutFailures(a: Arrangement = arrangement): string[] {
  const g = geometry(a);
  const out: string[] = [];
  const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;
  const win0 = rect(0, 0, g.width, g.height);
  const inRect = (r: Rect, o: Rect): boolean => r.x >= o.x - 0.5 && r.y >= o.y - 0.5 && r.x + r.width <= o.x + o.width + 0.5 && r.y + r.height <= o.y + o.height + 0.5;
  for (const h of HOSTS) if (g.hosts[h].shows && !inRect(hostRect(g, h), win0)) out.push(`${HOST_LABEL[h]} at ${fmt(hostRect(g, h))} leaves the ${Math.round(g.width)} × ${Math.round(g.height)} window`);
  const shown = [...placements(a, g)].filter(([, p]) => !p.folded);
  for (const [id, p] of shown) {
    if (!inRect(p.rect, hostRect(g, p.host))) out.push(`${labelOf(id)} at ${fmt(p.rect)} leaves the ${HOST_LABEL[p.host]} (${fmt(hostRect(g, p.host))})`);
    if (!inRect(p.rect, win0)) out.push(`${labelOf(id)} at ${fmt(p.rect)} leaves the window`);
  }
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) if (overlap(shown[i]![1].rect, shown[j]![1].rect) > 0.5) out.push(`${labelOf(shown[i]![0])} overlaps ${labelOf(shown[j]![0])}`);
  return out;
}

// --- the pill's options --------------------------------------------------------------------------------------------

/** The pill's options for an arrangement: hidden with no groups, wider when its groups need it. */
function pillOptions(o: Options, a: Arrangement): Options {
  const out: { -readonly [K in keyof Options]: Options[K] } = { ...o };
  delete out.toolbarWidth;
  delete out.toolbarHidden;
  if (!lab || !measureBox) return out;
  if (isEmptyHost(a, "top")) return { ...out, toolbarHidden: true };
  const need = hostNeed(a.top, { lead: PILL_LEAD, tail: TAIL }, groupSize, false);
  return need > PILL_DEFAULT ? { ...out, toolbarWidth: Math.ceil(need) } : out;
}

/** The desk's options with the pill's width and visibility as the shown arrangement's top toolbar needs. */
export const withGroupOptions = (o: Options): Options => pillOptions(o, shownArrangement());

/**
 * The top toolbar's swap targets, for the page's drag of the pill: the left and the right edge (stage coordinates);
 * a drop there swaps its groups with that side's toolbar.
 */
export function pillSwapTargets({ c, s0, size, opt }: TargetInput): DropTarget[] {
  if (!c.pill || !lab) return [];
  const g = geometry(arrangement, true);
  return (["left", "right"] as const).map((h) => {
    const swapped = swapHosts(arrangement, "top", h);
    const hit = h === "left" ? rect(-(g.L + 1), 0, g.L + 1 + STRIP, size.height) : rect(size.width - STRIP, 0, STRIP + 1 + g.R, size.height);
    const slot = h === "left" ? rect(0, 0, STRIP, size.height) : rect(size.width - STRIP, 0, STRIP, size.height);
    const label = `Top toolbar ⇄ ${HOST_LABEL[h].toLowerCase()}`;
    return {
      id: `toolbar:swap-${h}`,
      prio: 2 as const,
      hit,
      make: () => ({ state: s0, opt: pillOptions(opt, swapped), slot, label, key: `swap-${h}`, apply: () => setArrangement(swapHosts(arrangement, "top", h)) }),
    };
  });
}

// --- the frame -----------------------------------------------------------------------------------------------------

interface GroupEl {
  readonly id: string;
  readonly el: HTMLDivElement;
  readonly inner: HTMLElement;
  readonly rect: Settle<Rect>;
  container: HTMLElement | null;
  target: Rect;
  vertical: boolean;
}
const groupEls = new Map<string, GroupEl>();

const GRIP_SVG = `<svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">${[0, 1].flatMap((c) => [0, 1, 2].map((r) => `<circle cx="${2 + c * 4}" cy="${2 + r * 5}" r="1.3" fill="currentColor"/>`)).join("")}</svg>`;

/** The window's frame around the stage: title bar, bottom and side toolbars, the drop layer, the cases picker. */
export function initToolbarFrame(l: DeskLab, stageEl: HTMLElement): void {
  lab = l;
  stage = stageEl;
  win = document.createElement("div");
  win.className = "deskwin";
  stageEl.before(win);
  win.append(stageEl);
  measureBox = document.createElement("div");
  measureBox.className = "tg-measure";
  win.append(measureBox);
  for (const h of ["title", "bottom", "left", "right"] as const) {
    const el = document.createElement("div");
    el.className = `tf-bar tf-${h}${vertical(h) ? " v" : ""}`;
    el.dataset.host = h;
    if (h === "title") el.innerHTML = `<span class="tf-controls" aria-hidden="true"><i></i><i></i><i></i></span>`;
    else {
      const grip = document.createElement("button");
      grip.type = "button";
      grip.className = "tf-grip";
      grip.title = `Move the ${HOST_LABEL[h].toLowerCase()} to another edge (drag, or Space then the arrow keys)`;
      grip.setAttribute("aria-label", `Move the ${HOST_LABEL[h].toLowerCase()}`);
      grip.innerHTML = GRIP_SVG;
      grip.addEventListener("pointerdown", (e) => pressBar(h, e));
      grip.addEventListener("keydown", (e) => keyPickUp(`b:${h}`, e));
      el.append(grip);
    }
    win.append(el);
    bars.set(h, { el, rect: createSettle<Rect>(rect(0, 0, 0, 0), { omega: omega() }) });
  }
  layer = document.createElement("div");
  layer.className = "tg-layer";
  indEl = document.createElement("div");
  indEl.className = "tg-ind";
  indLabel = document.createElement("div");
  indLabel.className = "tg-ind-label";
  layer.append(indEl, indLabel);
  win.append(layer);
  for (const id of [...GROUPS, ...HOSTS.map(autoMore)]) makeGroup(id);
  buildControls();
  document.addEventListener("keydown", onKey);
  // The page's Reset puts the default arrangement back too.
  document.querySelector("button[data-act=reset]")?.addEventListener("click", () => setArrangement(DEFAULT_ARRANGEMENT, "reserved"));
  // First frame: everything where it belongs, without a glide.
  const g = geometry(arrangement);
  for (const [h, b] of bars) b.rect.jumpTo(barTarget(h, g));
  requestAnimationFrame(frame);
}

/** The pill's (or top bar's) content: the top toolbar's groups go there (the page builds it afresh on a reset). */
export function attachTopHost(item: HTMLElement, box: HTMLElement): void {
  topItem = item;
  topBox = box;
  box.querySelectorAll(":scope > .tb-cell, :scope > .tb-sep").forEach((x) => x.remove());
  box.classList.add("tg-host");
  // Its groups are drawn there again from where they are.
  for (const ge of groupEls.values()) if (ge.container && !ge.container.isConnected) ge.container = null;
}

function makeGroup(id: string): void {
  const el = document.createElement("div");
  el.className = `tgroup${id.startsWith("more:auto") ? " auto folded" : ""}`;
  el.dataset.g = id;
  el.title = labelOf(id);
  el.innerHTML = groupMarkup(id);
  const inner = el.firstElementChild as HTMLElement;
  el.addEventListener("pointerdown", (e) => {
    // A button is a button: its press is a click, never a drag. An auto ⋯ doesn't move.
    if ((e.target as Element).closest("button") || id.startsWith("more:auto")) return;
    pressGroup(id as GroupId, e);
  });
  inner.querySelector(".tg-handle")!.addEventListener("keydown", (e) => keyPickUp(`g:${id}`, e as KeyboardEvent));
  groupEls.set(id, { id, el, inner, rect: createSettle<Rect>(rect(0, 0, 0, 0), { omega: omega() }), container: null, target: rect(0, 0, 0, 0), vertical: false });
}

function buildControls(): void {
  const controls = document.querySelector(".controls");
  if (!controls) return;
  const cases = document.createElement("fieldset");
  cases.id = "toolbar-cases";
  cases.innerHTML = `<legend>Toolbar cases</legend>`;
  CASES.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${i + 1} · ${c.name}`;
    b.title = c.note;
    b.dataset.case = String(i);
    b.addEventListener("click", () => setArrangement(c.arrangement));
    cases.append(b);
  });
  const modes = document.createElement("fieldset");
  modes.id = "bottom-toolbar-modes";
  modes.innerHTML = `<legend>Bottom toolbar</legend><label><input type="radio" name="bottom-toolbar" value="reserved" checked /> Reserved</label><label><input type="radio" name="bottom-toolbar" value="floating" /> Floating</label>`;
  modes.querySelectorAll<HTMLInputElement>("input").forEach((input) => input.addEventListener("change", () => setArrangement(arrangement, input.value as BottomMode)));
  const anchor = document.getElementById("bottom-modes");
  if (anchor) anchor.after(modes, cases);
  else controls.append(modes, cases);
}

/** Show a new arrangement (and bottom mode): everything glides there; the desk lays out again for the pill. */
export function setArrangement(a: Arrangement, mode: BottomMode = bottomMode): void {
  arrangement = a;
  bottomMode = mode;
  const radio = document.querySelector<HTMLInputElement>(`input[name=bottom-toolbar][value=${mode}]`);
  if (radio) radio.checked = true;
  document.querySelectorAll<HTMLButtonElement>("#toolbar-cases button").forEach((b) => b.setAttribute("aria-pressed", String(sameArrangement(CASES[Number(b.dataset.case)]!.arrangement, a))));
  changed();
}

/** The shown arrangement changed: the desk lays out again (the pill's width), and with Fit on the stage refits. */
function changed(): void {
  lab?.setOptions({});
  const fitOn = document.querySelector("button[data-act=fit]")?.getAttribute("aria-pressed") === "true";
  if (fitOn) window.dispatchEvent(new Event("resize"));
}

const barTarget = (h: FrameHost, g: Geometry): Rect => {
  const r = hostRect(g, h);
  if (g.hosts[h].shows) return r;
  // Gone: no room, at its edge.
  if (h === "left") return rect(0, TITLE_H, 0, g.SH);
  if (h === "right") return rect(g.L + g.SW, TITLE_H, 0, g.SH);
  if (h === "bottom") return rect(0, TITLE_H + g.SH, g.width, 0);
  return r;
};

// --- the frame loop ----------------------------------------------------------------------------------------------

let last = 0;
let idleWaiters: (() => void)[] = [];
let moving = false;

function frame(now: number): void {
  const dt = last ? Math.min(50, now - last) : 16;
  last = now;
  moving = false;
  if (!lab || !win || !stage) return void requestAnimationFrame(frame);
  const dragging = !!drag || !!topItem?.classList.contains("lifted");
  const a = shownArrangement();
  const g = geometry(a, dragging);
  // Bars: glide to their places; the window keeps their room around the stage.
  for (const [h, b] of bars) {
    const t = barTarget(h, g);
    if (!sameRect(b.rect.target, t)) {
      b.rect.configure({ omega: omega() });
      b.rect.setTarget(t);
    }
    if (b.rect.step(dt)) moving = true;
    const r = b.rect.value;
    Object.assign(b.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
    b.el.classList.toggle("floating", h === "bottom" && bottomMode === "floating");
    b.el.classList.toggle("gone", r.width < 1 || r.height < 1);
  }
  const L = bars.get("left")!.rect.value.width;
  const R = bars.get("right")!.rect.value.width;
  const B = bottomMode === "floating" ? 0 : bars.get("bottom")!.rect.value.height;
  win.style.padding = `${TITLE_H}px ${R}px ${B}px ${L}px`;
  // Drop strips: the empty hosts, while something is dragged.
  for (const h of HOSTS) {
    const on = g.hosts[h].strip;
    let s = strips.get(h);
    if (on && !s) {
      s = document.createElement("div");
      s.className = `tg-strip${vertical(h) ? " v" : ""}`;
      layer!.prepend(s);
      strips.set(h, s);
    }
    if (s) {
      const r = hostRect(g, h);
      Object.assign(s.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
      s.classList.toggle("on", on);
    }
  }
  // Groups: each glides to its place in its host (a new host: from where it was drawn).
  const places = placements(a, g);
  for (const ge of groupEls.values()) {
    const p = places.get(ge.id);
    const held = drag?.kind === "group" && drag.id === ge.id;
    ge.el.classList.toggle("folded", !p || p.folded);
    ge.el.classList.toggle("tg-away", held);
    if (!p || held) {
      if (held) {
        if (ge.rect.step(dt)) moving = true;
        drawGroup(ge);
      }
      continue;
    }
    const container = p.host === "top" ? topBox : (bars.get(p.host as FrameHost)?.el ?? null);
    if (!container) continue;
    if (ge.container !== container) moveInto(ge, container, p.local);
    if (ge.vertical !== p.vertical) {
      ge.vertical = p.vertical;
      ge.el.classList.toggle("v", p.vertical);
    }
    const badge = ge.inner.querySelector(".tg-badge");
    if (badge) badge.textContent = p.badge ? `+${p.badge}` : "";
    ge.el.classList.toggle("badged", p.badge > 0);
    if (!sameRect(ge.target, p.local)) {
      ge.target = p.local;
      ge.rect.configure({ omega: omega() });
      ge.rect.setTarget(p.local);
    }
    if (ge.rect.step(dt)) moving = true;
    drawGroup(ge);
  }
  if (drag) aim(now, g, dt);
  if (!moving && !drag && idleWaiters.length) {
    const w = idleWaiters;
    idleWaiters = [];
    for (const r of w) r();
  }
  requestAnimationFrame(frame);
}

/** Laid out at its target, translated to where it is drawn, clipped to the drawn size (reveal, never stretched). */
function drawGroup(ge: GroupEl): void {
  const t = ge.target;
  const d = ge.rect.value;
  Object.assign(ge.el.style, { left: `${t.x}px`, top: `${t.y}px`, width: `${t.width}px`, height: `${t.height}px`, transform: `translate(${d.x - t.x}px, ${d.y - t.y}px)` });
  ge.el.style.clipPath = `inset(0 ${Math.max(0, t.width - d.width)}px ${Math.max(0, t.height - d.height)}px 0)`;
}

/** Window coordinates of a page rect. */
function toWindow(r: DOMRect): Rect {
  const w = win!.getBoundingClientRect();
  const k = win!.offsetWidth / (w.width || 1);
  return rect((r.left - w.left) * k, (r.top - w.top) * k, r.width * k, r.height * k);
}
const pageToLocal = (container: HTMLElement, wr: Rect): Rect => {
  const c = toWindow(container.getBoundingClientRect());
  return rect(wr.x - c.x, wr.y - c.y, wr.width, wr.height);
};

/** Into another host: from where it is drawn now (a glide from there), or placed at once the first time. */
function moveInto(ge: GroupEl, container: HTMLElement, local: Rect): void {
  const wasDrawn = ge.container?.isConnected ? toWindow(ge.el.getBoundingClientRect()) : null;
  container.append(ge.el);
  ge.container = container;
  if (wasDrawn && wasDrawn.width > 0) {
    ge.rect.jumpTo(pageToLocal(container, wasDrawn));
    ge.target = rect(-1, -1, 0, 0);
  } else {
    ge.rect.jumpTo(local);
    ge.target = local;
  }
}

// --- the group and toolbar drag --------------------------------------------------------------------------------------

/** A drop target: an insertion point (a group drag) or an edge (a toolbar drag), with what a drop there makes. */
interface GTarget extends Target {
  readonly label: string;
  readonly arrangement: Arrangement;
  /** The insertion line (or the edge's area), window coordinates. */
  readonly line: Rect;
  readonly area: boolean;
}

interface Drag {
  readonly kind: "group" | "bar";
  readonly id: string;
  readonly home: Rect;
  readonly grab: Point;
  pointer: Point;
  readonly targets: GTarget[];
  readonly intent: Intent<GTarget>;
  shown: GTarget | null;
  room: GTarget | null;
  keys: { i: number; since: number } | null;
  ghost: { el: HTMLDivElement; rect: Settle<Rect> } | null;
  snapped: string | null;
  returning: boolean;
  readonly t0: number;
  readonly log: IndicatorEntry[];
  readonly snaps: IndicatorEntry[];
  readonly frames: { t: number; x: number; y: number; item: Rect }[];
  releaseNote: string | null;
}
let drag: Drag | null = null;
/** What the last drag did (for the scenarios). */
let lastDrag: { log: IndicatorEntry[]; snaps: IndicatorEntry[]; frames: Drag["frames"]; landed: string | null; releaseNote: string | null; grab: Point } | null = null;

/** The insertion points for dragging group `g` (the arrangement without it), in the keyboard's order. */
function groupTargets(gid: GroupId): GTarget[] {
  const a0 = withoutGroup(arrangement, gid);
  const g = geometry(a0, true);
  const out: GTarget[] = [];
  for (const h of HOSTS) {
    const host = g.hosts[h];
    if (!host.shows && !host.strip) continue;
    const l = layoutHost(a0[h], h, host.spec, groupSize);
    const v = vertical(h);
    const o = host.origin;
    const T = host.spec.thickness;
    const pts = insertions(a0[h], h, host.spec, l).sort((p, q) => ZONES.indexOf(p.zone) - ZONES.indexOf(q.zone) || p.index - q.index);
    for (const p of pts) {
      const [s0, s1] = p.span;
      const hit = v ? rect(o.x - 12, o.y + s0, T + 24, s1 - s0) : rect(o.x + s0, o.y - 12, s1 - s0, T + 24);
      const line = v ? rect(o.x + 4, o.y + p.at - 1.5, T - 8, 3) : rect(o.x + p.at - 1.5, o.y + 4, 3, T - 8);
      out.push({ id: `g:${h}:${p.zone}:${p.index}`, prio: 2, hit, label: p.label, arrangement: insertGroup(arrangement, gid, h, p.zone, p.index), line, area: false });
    }
  }
  return out;
}

/** The edges a side or bottom toolbar can move to: the others (the top toolbar's place too); a drop swaps them. */
function barTargets(from: HostId): GTarget[] {
  const g = geometry(arrangement, true);
  const W = g.width;
  const edges: Record<"top" | "bottom" | "left" | "right", Rect> = {
    top: rect(g.L + 1, TITLE_H + 1, g.SW - 2, 48),
    bottom: rect(0, TITLE_H + g.SH - 44, W, 44 + g.B),
    left: rect(0, TITLE_H + 48, g.L + 44, g.SH - 96),
    right: rect(W - g.R - 44, TITLE_H + 48, g.R + 44, g.SH - 96),
  };
  return (Object.keys(edges) as (keyof typeof edges)[])
    .filter((h) => h !== from)
    .map((h) => ({
      id: `b:${h}`,
      prio: 2 as const,
      hit: edges[h],
      label: `Move the ${HOST_LABEL[from].toLowerCase()} to the ${h}${isEmptyHost(arrangement, h) ? "" : ` (swaps with the ${HOST_LABEL[h].toLowerCase()})`}`,
      arrangement: swapHosts(arrangement, from, h),
      line: edges[h],
      area: true,
    }));
}

function windowPoint(e: PointerEvent): Point {
  const w = win!.getBoundingClientRect();
  const k = win!.offsetWidth / (w.width || 1);
  return { x: (e.clientX - w.left) * k, y: (e.clientY - w.top) * k };
}

const TOUCH = { hold: DRAG.LONG_PRESS, lift: DRAG.TOUCH_LIFT };

function pressGroup(id: GroupId, e: PointerEvent): void {
  if (drag) return;
  trackPress(e, { point: windowPoint, lifted: () => drag?.id === id, begin: (s) => begin("group", id, s), move: (q) => moveTo(q), end: (c) => end(c) }, TOUCH);
}
function pressBar(h: HostId, e: PointerEvent): void {
  if (drag) return;
  trackPress(e, { point: windowPoint, lifted: () => drag?.id === h, begin: (s) => begin("bar", h, s), move: (q) => moveTo(q), end: (c) => end(c) }, TOUCH);
}

/** Lift a group (or start moving a toolbar) with the pointer at `p`; `keyboard`: stepped through its targets. */
function begin(kind: "group" | "bar", id: string, p: Point, keyboard = false): void {
  if (drag || !win || !layer) return;
  const g = geometry(arrangement);
  let home: Rect;
  let ghost: Drag["ghost"] = null;
  if (kind === "group") {
    const ge = groupEls.get(id)!;
    home = toWindow(ge.el.getBoundingClientRect());
    const el = ge.el.cloneNode(true) as HTMLDivElement;
    el.classList.add("tg-ghost");
    el.style.clipPath = "";
    el.style.transform = "";
    layer.append(el);
    ghost = { el, rect: createSettle<Rect>(home, { omega: omega() }) };
  } else home = hostRect(g, id as HostId);
  const targets = kind === "group" ? groupTargets(id as GroupId) : barTargets(id as HostId);
  drag = {
    kind,
    id,
    home,
    grab: { x: p.x - home.x, y: p.y - home.y },
    pointer: p,
    targets,
    intent: createIntent<GTarget>(home),
    shown: null,
    room: null,
    keys: keyboard ? { i: -1, since: performance.now() } : null,
    ghost,
    snapped: null,
    returning: false,
    t0: performance.now(),
    log: [],
    snaps: [],
    frames: [],
    releaseNote: null,
  };
  if (kind === "bar") bars.get(id as FrameHost)?.el.classList.add("tf-lifted");
}

function moveTo(q: Point): void {
  if (!drag) return;
  drag.pointer = q;
}

const heldRect = (d: Drag): Rect => rect(d.pointer.x - d.grab.x, d.pointer.y - d.grab.y, d.home.width, d.home.height);

/** Once a frame while dragging: the drag model's aim, the indicator, the room, and (snap) the ghost's slot. */
function aim(now: number, g: Geometry, dt: number): void {
  const d = drag!;
  let f: { shown: GTarget | null; room: boolean; aiming: boolean };
  if (d.keys) {
    const t = d.targets[d.keys.i] ?? null;
    f = { shown: t, room: !!t && now - d.keys.since >= DRAG.ROOM_AFTER, aiming: true };
  } else f = d.intent.update(d.pointer, now, d.targets);
  if ((f.shown?.id ?? null) !== (d.shown?.id ?? null)) d.log.push({ t: now - d.t0, id: f.shown?.id ?? null, ...(f.shown ? {} : { flying: !f.aiming }) });
  d.shown = f.shown;
  const snap = lab!.preview() === "snap" && d.kind === "group";
  showIndicator(d.shown && !(snap && d.shown && !d.shown.area) ? d.shown : null);
  const room = f.room ? d.shown : null;
  if ((room?.id ?? null) !== (d.room?.id ?? null)) {
    d.room = room;
    preview = room ? room.arrangement : null;
    changed();
  }
  if (!d.ghost) return;
  // The ghost: held 1:1 under the pointer, or (snap) gliding into the slot the room was made for, and back.
  const ghost = d.ghost;
  let want: Rect | null = null;
  if (snap && d.room) want = placements(d.room.arrangement, g).get(d.id)?.rect ?? null;
  if (want) {
    if (d.snapped !== d.room!.id) d.snaps.push({ t: now - d.t0, id: d.room!.id });
    d.snapped = d.room!.id;
    d.returning = false;
    if (!sameRect(ghost.rect.target, want)) {
      ghost.rect.configure({ omega: omega() });
      ghost.rect.setTarget(want);
    }
  } else {
    if (d.snapped) {
      d.snaps.push({ t: now - d.t0, id: null, flying: !f.aiming });
      d.snapped = null;
      d.returning = true;
    }
    const goal = heldRect(d);
    if (d.returning) {
      ghost.rect.configure({ omega: omega() });
      ghost.rect.setTarget(goal);
      const v = ghost.rect.value;
      if (Math.max(Math.abs(v.x - goal.x), Math.abs(v.y - goal.y)) < 0.5) d.returning = false;
    } else ghost.rect.hold(goal);
  }
  ghost.rect.step(dt);
  const r = ghost.rect.value;
  Object.assign(ghost.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${d.home.width}px`, height: `${d.home.height}px` });
  d.frames.push({ t: now - d.t0, x: d.pointer.x, y: d.pointer.y, item: { ...r } });
  if (!ghost.rect.settled) moving = true;
}

function showIndicator(t: GTarget | null): void {
  if (!indEl || !indLabel) return;
  if (!t) {
    indEl.classList.remove("on");
    indLabel.classList.remove("on");
    return;
  }
  const r = t.line;
  indEl.classList.toggle("area", t.area);
  Object.assign(indEl.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
  indLabel.textContent = t.label;
  Object.assign(indLabel.style, { left: `${Math.max(4, Math.min(r.x - 10, (win?.offsetWidth ?? 0) - indLabel.offsetWidth - 4))}px`, top: `${r.y > 30 ? r.y - 24 : r.y + r.height + 4}px` });
  indEl.classList.add("on");
  indLabel.classList.add("on");
}

/** Drop (or cancel): it lands where the indicator shows (the drag model's release rule); else it goes home. */
function end(cancel: boolean): void {
  const d = drag;
  if (!d) return;
  let landed: GTarget | null = null;
  if (!cancel) {
    landed = d.keys ? (d.targets[d.keys.i] ?? null) : d.intent.release(d.pointer, d.targets);
    if (!d.keys) {
      const said = within(d.home, d.pointer) ? null : d.shown && within(d.shown.hit, d.pointer, DRAG.BAND) ? d.shown.id : (d.targets.filter((t) => within(t.hit, d.pointer)).sort((a, b) => a.hit.width * a.hit.height - b.hit.width * b.hit.height)[0]?.id ?? null);
      d.releaseNote = said === (landed?.id ?? null) ? null : `landed on ${landed?.id ?? "home"}, but the indicator said ${said ?? "home"}`;
    }
  }
  drag = null;
  showIndicator(null);
  preview = null;
  if (d.kind === "bar") bars.get(d.id as FrameHost)?.el.classList.remove("tf-lifted");
  if (d.ghost) {
    // The group takes over from its ghost: it glides from where the ghost is to its (new) place.
    const ge = groupEls.get(d.id)!;
    const at = d.ghost.rect.value;
    d.ghost.el.remove();
    if (ge.container) ge.rect.jumpTo(pageToLocal(ge.container, at));
    ge.el.classList.remove("tg-away");
    ge.target = rect(-1, -1, 0, 0);
    if (landed) {
      const p = placements(landed.arrangement, geometry(landed.arrangement)).get(d.id);
      const container = p?.host === "top" ? topBox : p ? bars.get(p.host as FrameHost)?.el : null;
      if (container && container !== ge.container) {
        container.append(ge.el);
        ge.container = container;
        ge.rect.jumpTo(pageToLocal(container, at));
      }
    }
  }
  lastDrag = { log: d.log, snaps: d.snaps, frames: d.frames, landed: landed?.id ?? null, releaseNote: d.releaseNote, grab: d.grab };
  if (landed) setArrangement(landed.arrangement);
  else changed();
}

function keyPickUp(kind: string, e: KeyboardEvent): void {
  if (drag || e.key !== " ") return;
  e.preventDefault();
  e.stopPropagation();
  const [k, id] = [kind.slice(0, 1), kind.slice(2)];
  const el = k === "g" ? groupEls.get(id)?.el : bars.get(id as FrameHost)?.el;
  if (!el) return;
  const r = toWindow(el.getBoundingClientRect());
  begin(k === "g" ? "group" : "bar", id, { x: r.x + 6, y: r.y + 6 }, true);
}

function onKey(e: KeyboardEvent): void {
  if (!drag) return;
  if (e.key === "Escape") {
    cancelPress();
    end(true);
  } else if (drag.keys && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) {
    const n = drag.targets.length;
    const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
    if (n) drag.keys = { i: fwd ? (drag.keys.i + 1) % n : drag.keys.i <= 0 ? n - 1 : drag.keys.i - 1, since: performance.now() };
  } else if (drag.keys && e.key === "Enter") end(false);
  else return;
  e.preventDefault();
  e.stopPropagation();
}

// --- for the scenarios -------------------------------------------------------------------------------------------

/** A drag result: the indicator's log, the snaps (null: back on the pointer), per-frame pointer and ghost, the landing. */
export interface GroupDragResult {
  readonly log: readonly IndicatorEntry[];
  readonly snaps: readonly IndicatorEntry[];
  readonly frames: readonly { t: number; x: number; y: number; item: Rect }[];
  readonly landed: string | null;
  readonly releaseNote: string | null;
  readonly grab: Point;
}

const along = (keys: readonly PathKey[], t: number): Point => {
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1, y1] = keys[i]!;
    if (t > t1) continue;
    const [t0, x0, y0] = keys[i - 1]!;
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
    return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f };
  }
  return { x: keys.at(-1)![1], y: keys.at(-1)![2] };
};

export const toolbarGroups = {
  arrangement: (): Arrangement => arrangement,
  shown: (): Arrangement => shownArrangement(),
  set: (a: Arrangement, mode?: BottomMode): void => setArrangement(a, mode),
  bottomMode: (): BottomMode => bottomMode,
  geometry: (): Geometry => geometry(shownArrangement()),
  placements: (): Map<string, Placement> => placements(shownArrangement(), geometry(shownArrangement())),
  failures: (): string[] => layoutFailures(arrangement),
  /** The targets a drag of `kind` ("g:<group>" or "b:<host>") would have now. */
  targets: (kind: string): GTarget[] => (kind.startsWith("g:") ? groupTargets(kind.slice(2) as GroupId) : barTargets(kind.slice(2) as HostId)),
  /** Where a drag of `kind` starts (window coordinates): a group's handle, a toolbar's grip. */
  grip(kind: string): Point | null {
    const el = kind.startsWith("g:") ? groupEls.get(kind.slice(2))?.inner.querySelector(".tg-handle") : bars.get(kind.slice(2) as FrameHost)?.el.querySelector(".tf-grip");
    if (!el) return null;
    const r = toWindow(el.getBoundingClientRect());
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  },
  /** An element's rect in window coordinates. */
  rectOf: (el: Element): Rect => toWindow(el.getBoundingClientRect()),
  groupEl: (id: string): HTMLElement | null => groupEls.get(id)?.el ?? null,
  barEl: (h: HostId): HTMLElement | null => (h === "top" ? topBox : (bars.get(h as FrameHost)?.el ?? null)),
  /** A window point as client coordinates (for synthetic pointer events). */
  toClient(p: Point): Point {
    const w = win!.getBoundingClientRect();
    const k = (w.width || 1) / win!.offsetWidth;
    return { x: w.left + p.x * k, y: w.top + p.y * k };
  },
  /** A scripted drag in real time along keyframes [ms, x, y] (window coordinates) from the grip; Escape at `escapeAt`. */
  async path(kind: string, keysOf: (grip: Point) => readonly PathKey[], opts: { escapeAt?: () => number } = {}): Promise<GroupDragResult> {
    const grip = toolbarGroups.grip(kind);
    if (!grip) return { log: [], snaps: [], frames: [], landed: null, releaseNote: null, grab: { x: 0, y: 0 } };
    const keys = keysOf(grip);
    const escapeAt = opts.escapeAt?.();
    begin(kind.startsWith("g:") ? "group" : "bar", kind.slice(2), { x: keys[0]![1], y: keys[0]![2] });
    const start = performance.now();
    const total = keys.at(-1)![0];
    for (;;) {
      await nextFrame();
      const t = Math.min(performance.now() - start, total);
      moveTo(along(keys, t));
      if (escapeAt !== undefined && t >= escapeAt) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        break;
      }
      if (t >= total) {
        end(false);
        break;
      }
    }
    return lastDrag!;
  },
  /** A keyboard drag: Space on the handle or grip, `steps` arrow presses (a moment each), then Enter (or Escape). */
  async keyboard(kind: string, steps: number, finish: "Enter" | "Escape" = "Enter"): Promise<GroupDragResult | null> {
    const el = kind.startsWith("g:") ? groupEls.get(kind.slice(2))?.inner.querySelector(".tg-handle") : bars.get(kind.slice(2) as FrameHost)?.el.querySelector(".tf-grip");
    if (!el) return null;
    const press = (k: string, on: EventTarget = document): void => void on.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    press(" ", el);
    for (let i = 0; i < steps; i++) {
      press("ArrowDown");
      await new Promise((r) => setTimeout(r, i === steps - 1 ? 650 : 220));
    }
    press(finish);
    return lastDrag;
  },
  dragging: (): boolean => !!drag,
  /** Resolves once the frame's bars and groups rest and nothing is dragged. */
  idle: (): Promise<void> => new Promise((r) => idleWaiters.push(r)),
};
