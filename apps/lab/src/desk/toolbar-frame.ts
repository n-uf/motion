/**
 * The desk's window frame and its toolbar groups: a title bar over the stage, a bottom bar under it and a toolbar on
 * each side edge, plus the top bar (the construction's own pill or bar, inside the stage). Toolbars are slots: they
 * never move themselves; their groups do (desk/toolbars.ts has the model and the layout rules).
 *
 * - Every group of two or more controls has one handle, the compact dots glyph, at its leading edge: left in a row
 *   (dots top to bottom), on top in a column (dots left to right). It is the separator; there are no frames or
 *   dividers. Pointing at or focusing a handle dims the other groups of its toolbar.
 * - The handle carries every action: drag moves the group (through the shared drag model), double-click collapses
 *   or expands it to handle + », right-click (long-press, Shift+F10) opens its menu. No menu buttons anywhere.
 * - A group dropped over the documents floats there (its handle at its leading edge, a frame and a shadow).
 * - Toolbars never wrap: when room runs out, groups collapse from the trailing end; » opens their hidden controls.
 * - Freeze layout: the handles fade and nothing moves, until Alt is held.
 * - The window's title bar has no grip (the lab's window doesn't move); a right-click on its empty part opens the window menu.
 * - Bars and groups move by the lab's motion rules: a settle to the new place, laid out at the target size and
 *   revealed (never stretched); a group that changes bars glides from where it was drawn.
 */
import type { Rect } from "@n-uf/motion";
import { domDrawable, flip, holdItem, type HeldDrag, type LayoutItem, type LayoutMotion, type RectLike } from "@n-uf/motion/layout";
import { overlap, nextFrame, type Point } from "../shared/geometry";
import { cancelPress, trackPress } from "../shared/press";
import { overflowOpen, wireOverflow, zoomValue } from "./compact";
import { toolGroupCells } from "./content";
import { isLayoutFrozen, mountFreezeSwitch, onFreezeChange, setLayoutFrozen } from "./freeze";
import { DRAG_DEFAULTS, createDragIntent, inRect, previewPlan, type DragIntent, type DragTarget } from "@n-uf/motion/drag";
import { constructionOf } from "./layouts";
import type { Options, Placed } from "./model";
import type { DeskLab, IndicatorEntry, PathKey } from "./scenarios";
import { closeMenu, menuOpen, openMenu, type MenuItem } from "./toolbar-menu";
import {
  CASES,
  DEFAULT_ARRANGEMENT,
  GROUPS,
  GROUP_LABEL,
  HOSTS,
  HOST_LABEL,
  ZONES,
  dockGroup,
  floatGroup,
  hostNeed,
  hostOf,
  insertGroup,
  insertions,
  isEmptyHost,
  layoutHost,
  moveBar,
  moveToHost,
  resetGroup,
  sameArrangement,
  toggleCollapsed,
  vertical,
  withoutGroup,
  type Arrangement,
  type GroupId,
  type HostId,
  type HostSpec,
} from "./toolbars";

/** Bar sizes (px): the title bar's and bottom bar's height, a side toolbar's width; what each end keeps. */
export const TITLE_H = 38;
export const BAR_H = 38;
export const SIDE_W = 40;
/** The title bar's start: its glyph and the window controls. */
const TITLE_LEAD = 96;
const LEAD = 8;
const TAIL = 8;
/** A drop strip's thickness (an empty host while dragging). */
const STRIP = 34;
/** The pill's default width (layouts.ts): the groups widen it only past this. */
const PILL_DEFAULT = 320;
const GAP_EDGE = 6;
const FROZEN_TIP = "Frozen: hold Alt to move";

type FrameHost = "title" | "bottom" | "left" | "right";
type BottomMode = "reserved" | "floating";
type Where = HostId | "float";

let lab: DeskLab | null = null;
let win: HTMLDivElement | null = null;
let layer: HTMLDivElement | null = null;
let floats: HTMLDivElement | null = null;
let indEl: HTMLDivElement | null = null;
let indLabel: HTMLDivElement | null = null;
let measureBox: HTMLDivElement | null = null;
/** The page's layout motion (@n-uf/motion/layout): the bars and groups move on it, with the desk's items. */
let motion: LayoutMotion | null = null;
const bars = new Map<FrameHost, { el: HTMLDivElement; item: LayoutItem }>();
const strips = new Map<HostId, HTMLDivElement>();
/** The pill's (or the top bar's) group container. */
let topBox: HTMLElement | null = null;

let arrangement: Arrangement = DEFAULT_ARRANGEMENT;
/** While a drag has made room: the arrangement shown (the dragged group where the indicator is). */
let preview: Arrangement | null = null;
let bottomMode: BottomMode = "reserved";
let altHeld = false;
const shownArrangement = (): Arrangement => preview ?? arrangement;
/** The frozen layout (desk/freeze.ts owns it and its switch; the panels' grips read the same one). */
const frozen = (): boolean => isLayoutFrozen();
/** Moves are allowed: the layout isn't frozen, or Alt is held. */
const canMove = (e?: { altKey?: boolean }): boolean => !frozen() || altHeld || !!e?.altKey;

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

// --- groups' markup and sizes ----------------------------------------------------------------------------------------

const icon = (t: string, title: string, cls = ""): string => `<button type="button" class="tb-cell tg-sym${cls}" tabindex="-1" title="${title}" aria-label="${title}">${t}</button>`;
const word = (t: string, i: string): string => `<button type="button" class="tb-cell tg-word" tabindex="-1" title="${t}" aria-label="${t}"><span class="t">${t}</span><span class="i">${i}</span></button>`;

function controls(id: GroupId): string {
  switch (id) {
    case "doc":
      return `<button type="button" class="tb-cell tg-title" tabindex="-1" title="Quarterly plan"><span class="tg-dot"></span><span class="tg-name">Quarterly plan</span></button><button type="button" class="tb-cell tg-page" tabindex="-1" title="Page 1 of 3">P 1/3</button>`;
    case "edit":
      return toolGroupCells(0);
    case "history":
      return toolGroupCells(1);
    case "view":
      return toolGroupCells(2);
    case "zoom":
      return `${icon("−", "Zoom out")}<button type="button" class="tb-cell tg-zoom" tabindex="-1" title="Zoom: 100 %">${zoomValue(100)}</button>${icon("+", "Zoom in")}`;
    case "panel":
      return `${icon("◧", "Left panel")}${icon("◨", "Right panel")}`;
    case "share":
      return `${word("Share", "⇪")}${word("Print", "⎙")}`;
  }
}

const DOTS = "<i></i><i></i><i></i>";
const groupMarkup = (id: GroupId): string =>
  `<div class="tg-in"><span class="tg-handle" tabindex="0" role="button" aria-label="${GROUP_LABEL[id]} group: drag to move, double-click to collapse, Shift+F10 for its menu" title="${GROUP_LABEL[id]}">${DOTS}</span><span class="tg-ctl">${controls(id)}</span><button type="button" class="tb-cell tg-over" tabindex="-1" title="Show the hidden controls" aria-label="Show the hidden ${GROUP_LABEL[id]} controls">»</button></div>`;

/** Each group's natural size, horizontal or vertical, expanded or collapsed, measured once from its markup. */
const sizes = new Map<string, { along: number; across: number }>();
function groupSize(id: GroupId, v: boolean, collapsed: boolean): { along: number; across: number } {
  const key = `${id}|${v}|${collapsed}`;
  const known = sizes.get(key);
  if (known) return known;
  if (!measureBox) return { along: 60, across: 30 };
  const el = document.createElement("div");
  el.className = `tgroup${v ? " v" : ""}${collapsed ? " collapsed" : ""}`;
  // Its compact form is keyed by the group (desk/compact.ts, lab.css).
  el.dataset.g = id;
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
  /** The stage's outer size (its 1 px border included), where its content starts, and the window's size. */
  readonly SW: number;
  readonly SH: number;
  readonly stage: Point;
  readonly width: number;
  readonly height: number;
  readonly hosts: Readonly<Record<HostId, { readonly origin: Point; readonly spec: HostSpec; readonly shows: boolean; readonly strip: boolean }>>;
}

const sameTop = (a: Arrangement, b: Arrangement): boolean => JSON.stringify(a.top) === JSON.stringify(b.top) && JSON.stringify(a.collapsed) === JSON.stringify(b.collapsed);

/** The pill (or top bar) as the arrangement would have it: as laid out now, or laid out for its groups. */
function pillFor(a: Arrangement): Placed | undefined {
  if (sameTop(a, shownArrangement())) return lab!.layout().items.get("toolbar");
  return constructionOf(lab!.construction()).layout(lab!.state(), lab!.size(), pillOptions(lab!.options(), a)).items.get("toolbar");
}

/** The window as the arrangement lays it out, at the stage's size as set (targets, not what is drawn). */
export function geometry(a: Arrangement, dragging = false): Geometry {
  const size = lab!.size();
  // With Fit on, side bars this arrangement adds narrow the stage: the window keeps its width.
  const SW = fittedWidth(a) + 2;
  const SH = size.height + 2;
  const empty = (h: HostId): boolean => isEmptyHost(a, h);
  const L = empty("left") ? 0 : SIDE_W;
  const R = empty("right") ? 0 : SIDE_W;
  const floating = bottomMode === "floating";
  const B = !floating && !empty("bottom") ? BAR_H : 0;
  const width = L + SW + R;
  const height = TITLE_H + SH + B;
  const stage = { x: L + 1, y: TITLE_H + 1 };
  const strip = (h: HostId): boolean => dragging && empty(h);
  const bottomLen = Math.min(Math.max(80, hostNeed(a.bottom, a.collapsed, { lead: LEAD, tail: TAIL }, groupSize, false)), SW - 24);
  const placed = pillFor(a);
  const pillShows = !!placed && !placed.hidden;
  const pr = placed?.rect ?? rect(size.width / 2 - PILL_DEFAULT / 2, GAP_EDGE, PILL_DEFAULT, 30);
  const top = pillShows
    ? { origin: { x: stage.x + pr.x, y: stage.y + pr.y }, spec: { length: pr.width, thickness: pr.height, lead: LEAD, tail: TAIL }, shows: true, strip: false }
    : { origin: { x: stage.x + pr.x, y: stage.y + pr.y }, spec: { length: pr.width, thickness: pr.height, lead: LEAD, tail: TAIL }, shows: false, strip: strip("top") };
  const side = (h: "left" | "right", x: number, stripX: number) =>
    empty(h)
      ? { origin: { x: stripX, y: TITLE_H }, spec: { length: SH, thickness: STRIP, lead: LEAD, tail: TAIL }, shows: false, strip: strip(h) }
      : { origin: { x, y: TITLE_H }, spec: { length: SH, thickness: SIDE_W, lead: LEAD, tail: TAIL }, shows: true, strip: false };
  const bottom = empty("bottom")
    ? { origin: { x: L, y: TITLE_H + SH - STRIP }, spec: { length: SW, thickness: STRIP, lead: LEAD, tail: TAIL }, shows: false, strip: strip("bottom") }
    : floating
      ? { origin: { x: L + SW / 2 - bottomLen / 2, y: TITLE_H + SH - 1 - GAP_EDGE - BAR_H }, spec: { length: bottomLen, thickness: BAR_H, lead: LEAD, tail: TAIL }, shows: true, strip: false }
      : { origin: { x: 0, y: TITLE_H + SH }, spec: { length: width, thickness: BAR_H, lead: LEAD, tail: TAIL }, shows: true, strip: false };
  return {
    L,
    R,
    B,
    SW,
    SH,
    stage,
    width,
    height,
    hosts: {
      title: { origin: { x: 0, y: 0 }, spec: { length: width, thickness: TITLE_H, lead: TITLE_LEAD, tail: TAIL }, shows: true, strip: false },
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

/** Every group's place: its host (or floating), its rect there and in the window, its axis, collapsed or not. */
export interface Placement {
  readonly host: Where;
  readonly local: Rect;
  readonly rect: Rect;
  readonly vertical: boolean;
  readonly collapsed: boolean;
}

export function placements(a: Arrangement, g: Geometry): Map<GroupId, Placement> {
  const out = new Map<GroupId, Placement>();
  for (const h of HOSTS) {
    const host = g.hosts[h];
    if (!host.shows && !host.strip) continue;
    const l = layoutHost(a[h], h, host.spec, groupSize, a.collapsed);
    const o = host.origin;
    for (const [id, r] of l.slots) out.set(id, { host: h, local: r, rect: rect(o.x + r.x, o.y + r.y, r.width, r.height), vertical: vertical(h), collapsed: l.collapsed.includes(id) });
  }
  for (const f of a.floating) {
    const c = a.collapsed.includes(f.id);
    const s = groupSize(f.id, false, c);
    const local = rect(g.stage.x + f.x, g.stage.y + f.y, s.along, s.across);
    out.set(f.id, { host: "float", local, rect: local, vertical: false, collapsed: c });
  }
  return out;
}

/**
 * What breaks the layout's promises: groups of one host overlapping, a group outside its host, a host or group
 * outside the window, a floating group off the stage, groups of different hosts overlapping.
 */
export function layoutFailures(a: Arrangement = arrangement): string[] {
  const g = geometry(a);
  const out: string[] = [];
  const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;
  const win0 = rect(0, 0, g.width, g.height);
  const stage0 = rect(g.stage.x, g.stage.y, g.SW - 2, g.SH - 2);
  const inRect = (r: Rect, o: Rect): boolean => r.x >= o.x - 0.5 && r.y >= o.y - 0.5 && r.x + r.width <= o.x + o.width + 0.5 && r.y + r.height <= o.y + o.height + 0.5;
  for (const h of HOSTS) if (g.hosts[h].shows && !inRect(hostRect(g, h), win0)) out.push(`${HOST_LABEL[h]} at ${fmt(hostRect(g, h))} leaves the ${Math.round(g.width)} × ${Math.round(g.height)} window`);
  const shown = [...placements(a, g)];
  for (const [id, p] of shown) {
    const within0 = p.host === "float" ? stage0 : hostRect(g, p.host);
    if (!inRect(p.rect, within0)) out.push(`${GROUP_LABEL[id]} at ${fmt(p.rect)} leaves ${p.host === "float" ? "the stage" : `the ${HOST_LABEL[p.host]}`} (${fmt(within0)})`);
    if (!inRect(p.rect, win0)) out.push(`${GROUP_LABEL[id]} at ${fmt(p.rect)} leaves the window`);
  }
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) if (overlap(shown[i]![1].rect, shown[j]![1].rect) > 0.5) out.push(`${GROUP_LABEL[shown[i]![0]]} overlaps ${GROUP_LABEL[shown[j]![0]]}`);
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
  const need = hostNeed(a.top, a.collapsed, { lead: LEAD, tail: TAIL }, groupSize, false);
  return need > PILL_DEFAULT ? { ...out, toolbarWidth: Math.ceil(need) } : out;
}

/** The desk's options with the pill's width and visibility as the shown arrangement's top bar needs. */
export const withGroupOptions = (o: Options): Options => pillOptions(o, shownArrangement());

// --- the frame -----------------------------------------------------------------------------------------------------

interface GroupEl {
  readonly id: GroupId;
  readonly el: HTMLDivElement;
  readonly inner: HTMLElement;
  readonly handle: HTMLElement;
  /** Its motion: laid out at its box in its host, settled there, clipped while it grows (reveal). */
  readonly item: LayoutItem;
  container: HTMLElement | null;
  vertical: boolean;
}
const groupEls = new Map<GroupId, GroupEl>();

/** A bar: drawn at its drawn rect (its groups inside are clipped by it while it grows or shrinks). */
const barDrawable = (el: HTMLDivElement) => ({
  layOut: () => undefined,
  draw: (f: { readonly drawn: Rect }) => void Object.assign(el.style, { left: `${f.drawn.x}px`, top: `${f.drawn.y}px`, width: `${f.drawn.width}px`, height: `${f.drawn.height}px` }),
});

/**
 * The window's frame around the stage: title bar, bottom and side toolbars, the drop layer, the lab's switches. Its
 * bars and groups move on the page's layout motion `m`, on the same frame loop as the desk's items.
 */
export function initToolbarFrame(l: DeskLab, stageEl: HTMLElement, m: LayoutMotion): void {
  lab = l;
  motion = m;
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
    if (h === "title") buildTitle(el);
    win.append(el);
    bars.set(h, { el, item: m.add(`tf:${h}`, barDrawable(el), rect(0, 0, 0, 0)) });
  }
  floats = document.createElement("div");
  floats.className = "tg-floats";
  win.append(floats);
  layer = document.createElement("div");
  layer.className = "tg-layer";
  indEl = document.createElement("div");
  indEl.className = "tg-ind";
  indLabel = document.createElement("div");
  indLabel.className = "tg-ind-label";
  layer.append(indEl, indLabel);
  win.append(layer);
  for (const id of GROUPS) makeGroup(id);
  buildControls();
  document.addEventListener("keydown", onKey);
  window.addEventListener("keydown", (e) => e.key === "Alt" && setAlt(true));
  window.addEventListener("keyup", (e) => e.key === "Alt" && setAlt(false));
  window.addEventListener("blur", () => setAlt(false));
  for (const t of ["pointerdown", "pointermove"] as const) window.addEventListener(t, (e) => e.isTrusted && setAlt(e.altKey), true);
  // The page's Reset puts the default arrangement back too.
  document.querySelector("button[data-act=reset]")?.addEventListener("click", () => setArrangement(DEFAULT_ARRANGEMENT, "reserved"));
  const g = geometry(arrangement);
  for (const [h, b] of bars) b.item.jumpTo(barTarget(h, g));
  // Once a frame: the frame's layout (targets) before the items step; what follows from where they are drawn, after.
  m.task(placeAll);
  m.onFrame(afterFrame);
  m.wake();
}

/**
 * The title bar: the window's controls and its groups. The lab's window doesn't move, so it has no grip (a grip shows
 * only on what drags); a right-click on its empty part opens the window menu.
 */
function buildTitle(el: HTMLDivElement): void {
  el.innerHTML = `<span class="tf-controls" aria-hidden="true"><i></i><i></i><i></i></span>`;
  el.addEventListener("contextmenu", (e) => {
    if ((e.target as Element).closest(".tgroup")) return;
    e.preventDefault();
    const p = windowPoint(e);
    void openMenu(layer!, p.x, p.y, windowMenu(), "Window");
  });
}

/** The window's menu (the lab's window doesn't move or close: the items only show where they live). */
const windowMenu = (): MenuItem[] => ["Move", "Size", "Minimise", "Maximise", "Close"].map((label) => ({ label, action: () => undefined }));

/** The pill's (or top bar's) content: the top bar's groups go there (the page builds it afresh on a reset). */
export function attachTopHost(box: HTMLElement): void {
  topBox = box;
  box.querySelectorAll(":scope > .tb-cell, :scope > .tb-sep").forEach((x) => x.remove());
  box.classList.add("tg-host");
  for (const ge of groupEls.values()) if (ge.container && !ge.container.isConnected) ge.container = null;
  // Its groups are placed there on the next frame.
  motion?.wake();
}

function makeGroup(id: GroupId): void {
  const el = document.createElement("div");
  el.className = "tgroup";
  el.dataset.g = id;
  el.innerHTML = groupMarkup(id);
  const inner = el.firstElementChild as HTMLElement;
  const handle = inner.querySelector<HTMLElement>(".tg-handle")!;
  // The handle carries every action: drag, double-click (collapse), right-click or long-press (menu), keys.
  handle.addEventListener("pointerdown", (e) => pressGroup(id, e));
  handle.addEventListener("dblclick", (e) => {
    e.preventDefault();
    if (canMove(e)) setArrangement(toggleCollapsed(arrangement, id));
  });
  handle.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    groupMenu(id);
  });
  handle.addEventListener("keydown", (e) => keyOnHandle(id, e));
  // » opens a popover with the group's full form (desk/compact.ts).
  wireOverflow(inner.querySelector<HTMLButtonElement>(".tg-over")!, inner, layer!, GROUP_LABEL[id]);
  // Laid out at its box and drawn by the layout motion: moved by one transform, clipped while it grows.
  const item = motion!.add(`tg:${id}`, domDrawable({ node: el }), rect(0, 0, 0, 0));
  groupEls.set(id, { id, el, inner, handle, item, container: null, vertical: false });
}

/** The handle's menu, anchored at it: collapse, move to a dock zone, move the bar's groups, float or dock, reset. */
function groupMenu(id: GroupId): HTMLElement {
  const ge = groupEls.get(id)!;
  const r = toWindow(ge.handle.getBoundingClientRect());
  const a = arrangement;
  const at = hostOf(a, id);
  const off = !canMove();
  const items: MenuItem[] = [
    ...(off ? [{ label: "Layout frozen: hold Alt to change it", note: true }] : []),
    { label: a.collapsed.includes(id) ? "Expand" : "Collapse", disabled: off, action: () => setArrangement(toggleCollapsed(arrangement, id)) },
    { label: "Move to", disabled: off, items: HOSTS.map((h) => ({ label: HOST_LABEL[h], checked: at?.host === h, action: () => setArrangement(moveToHost(arrangement, id, h)) })) },
    {
      label: "Move this bar's groups to",
      disabled: off || !at,
      items: HOSTS.filter((h) => h !== at?.host).map((h) => ({ label: HOST_LABEL[h], action: () => at && setArrangement(moveBar(arrangement, at.host, h)) })),
    },
    { label: at ? "Float" : "Dock", disabled: off, action: () => setArrangement(at ? floatNear(id) : dockGroup(arrangement, id)) },
    { label: "Reset position", disabled: off, action: () => setArrangement(resetGroup(arrangement, id)) },
  ];
  return openMenu(layer!, r.x, r.y + r.height + 4, items, `${GROUP_LABEL[id]} group`, ge.handle);
}

/** Float a group over the documents near where it is now. */
function floatNear(id: GroupId): Arrangement {
  const g = geometry(arrangement);
  const p = placements(arrangement, g).get(id);
  const s = groupSize(id, false, arrangement.collapsed.includes(id));
  const W = g.SW - 2;
  const H = g.SH - 2;
  const x = Math.min(Math.max(8, (p?.rect.x ?? 0) - g.stage.x), W - s.along - 8);
  const y = Math.min(Math.max(8, (p?.rect.y ?? 0) - g.stage.y + 48), H - s.across - 8);
  return floatGroup(arrangement, id, x, y);
}

function buildControls(): void {
  const controlsEl = document.querySelector(".controls");
  if (!controlsEl) return;
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
  modes.innerHTML = `<legend>Bottom bar</legend><label><input type="radio" name="bottom-toolbar" value="reserved" checked /> Reserved</label><label><input type="radio" name="bottom-toolbar" value="floating" /> Floating</label>`;
  modes.querySelectorAll<HTMLInputElement>("input").forEach((input) => input.addEventListener("change", () => setArrangement(arrangement, input.value as BottomMode)));
  // The lock switch (desk/freeze.ts makes it; the frame only shows where).
  const freeze = document.createElement("fieldset");
  freeze.id = "layout-freeze";
  freeze.innerHTML = `<legend>Layout</legend>`;
  mountFreezeSwitch(freeze);
  onFreezeChange(applyFrozen);
  const anchor = document.getElementById("bottom-modes");
  if (anchor) anchor.after(modes, freeze, cases);
  else controlsEl.append(modes, freeze, cases);
}

/** Show the frozen state: frozen hides the grips (Alt shows them while held). */
function applyFrozen(): void {
  const on = frozen();
  win?.classList.toggle("frozen", on);
  for (const ge of groupEls.values()) ge.handle.title = on ? FROZEN_TIP : GROUP_LABEL[ge.id];
  if (on && !altHeld) closeMenu();
}
function setAlt(on: boolean): void {
  if (on === altHeld) return;
  altHeld = on;
  win?.classList.toggle("alt", on);
  document.body.dataset.layoutAlt = String(on);
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

/**
 * The shown arrangement changed: the desk lays out again (the pill's width). With Fit on, the window keeps its width:
 * a side bar that appears takes its width from the stage at once (the stage settles narrower as the bar grows); one
 * that goes gives it back through the page's own fit, once the bars rest.
 */
function changed(): void {
  if (!lab) return;
  const sides = sideWidth(shownArrangement());
  if (fitOn() && sides > fittedSides) {
    const w = fittedWidth(shownArrangement());
    if (w < lab.size().width) lab.setSize(w, lab.size().height);
  } else if (fitOn() && sides < fittedSides) refitPending = true;
  fittedSides = sides;
  lab.setOptions({});
  // The groups and bars take their new places on the next frame (nothing on the desk may have moved).
  motion?.wake();
}

/** The side bars' width an arrangement takes. */
const sideWidth = (a: Arrangement): number => (isEmptyHost(a, "left") ? 0 : SIDE_W) + (isEmptyHost(a, "right") ? 0 : SIDE_W);
/** The side bars' width the stage is fitted to now. */
let fittedSides = 0;
/** A side bar went: the page's fit gives its width back to the stage once the bars rest. */
let refitPending = false;
/** Fit is on (and the scenarios aren't pinning the stage), or a scenario says what to assume. */
let fitOverride: boolean | null = null;
const fitOn = (): boolean =>
  fitOverride ?? (document.querySelector("button[data-act=fit]")?.getAttribute("aria-pressed") === "true" && document.querySelector("button[data-act=runall]")?.textContent === "Run all scenarios");
/**
 * The stage's width for an arrangement: with Fit on, one that adds side bars narrows the stage so the window keeps
 * the page's width (as the page's fit does: the room less the bars, never wider than it is now).
 */
function fittedWidth(a: Arrangement): number {
  const now = lab!.size().width;
  if (!fitOn() || !win || sideWidth(a) <= fittedSides) return now;
  return Math.min(now, Math.floor(win.clientWidth - sideWidth(a) - 2));
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

/**
 * Once a frame, before the items step: where every bar and group goes (the frame's layout), and the drag's aim. The
 * layout motion settles them there; frames keep coming while a group is held.
 */
function placeAll(): boolean {
  if (!lab || !win) return false;
  const a = shownArrangement();
  const g = geometry(a, !!drag);
  // Bars: glide to their places.
  for (const [h, b] of bars) {
    b.item.moveTo(barTarget(h, g));
    b.el.classList.toggle("floating", h === "bottom" && bottomMode === "floating");
  }
  // Drop strips: the empty hosts, while a group is dragged.
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
    // A lifted group is the drag's (aim moves it).
    if (drag?.id === ge.id || !p) continue;
    const container = p.host === "top" ? topBox : p.host === "float" ? floats : (bars.get(p.host)?.el ?? null);
    if (!container) continue;
    if (ge.container !== container) moveInto(ge, container, p.local);
    if (ge.vertical !== p.vertical) {
      ge.vertical = p.vertical;
      ge.el.classList.toggle("v", p.vertical);
    }
    ge.el.classList.toggle("collapsed", p.collapsed);
    ge.el.classList.toggle("floating", p.host === "float");
    ge.item.moveTo(p.local);
  }
  if (drag) aim(performance.now());
  return !!drag;
}

/** Once a frame, after the items have stepped and been drawn: the window's room for its bars, the drag's record. */
function afterFrame(): void {
  if (!win) return;
  for (const b of bars.values()) {
    const r = b.item.drawn;
    b.el.classList.toggle("gone", r.width < 1 || r.height < 1);
  }
  const L = bars.get("left")!.item.drawn.width;
  const R = bars.get("right")!.item.drawn.width;
  const B = bottomMode === "floating" ? 0 : bars.get("bottom")!.item.drawn.height;
  win.style.padding = `${TITLE_H}px ${R}px ${B}px ${L}px`;
  if (drag) drag.frames.push({ t: performance.now() - drag.t0, x: drag.pointer.x, y: drag.pointer.y, item: { ...groupEls.get(drag.id)!.item.drawn } });
  // A side bar went: once the bars rest, the page's fit gives the stage its width back.
  if (refitPending && [...bars.values()].every((b) => b.item.settled)) {
    refitPending = false;
    window.dispatchEvent(new Event("resize"));
  }
}

/** Window coordinates of a page rect. */
function toWindow(r: RectLike): Rect {
  const w = win!.getBoundingClientRect();
  const k = win!.offsetWidth / (w.width || 1);
  return rect((r.left - w.left) * k, (r.top - w.top) * k, r.width * k, r.height * k);
}
const pageToLocal = (container: HTMLElement, wr: Rect): Rect => {
  const c = toWindow(container.getBoundingClientRect());
  return rect(wr.x - c.x, wr.y - c.y, wr.width, wr.height);
};

/** A page (client) rect as the {@link RectLike} toWindow reads. */
const clientRect = (r: Rect): RectLike => ({ left: r.x, top: r.y, width: r.width, height: r.height });

/**
 * Into another host (`to` its place there): a FLIP from where it is drawn now (@n-uf/motion/layout), or placed at once
 * the first time (nowhere drawn yet).
 */
function moveInto(ge: GroupEl, container: HTMLElement, to: Rect): void {
  const enter = (): void => {
    container.append(ge.el);
    ge.container = container;
  };
  if (!ge.container?.isConnected || ge.el.getBoundingClientRect().width === 0) {
    enter();
    ge.item.jumpTo(to);
    return;
  }
  flip([{ item: ge.item, node: ge.el, place: (before) => ({ from: pageToLocal(container, toWindow(clientRect(before))), to }) }], enter);
}

// --- the group drag ------------------------------------------------------------------------------------------------

/**
 * A drop target: an insertion point (a line between groups), an empty zone (the group's own footprint, where it will
 * land), or the documents (it floats there).
 */
interface GTarget extends DragTarget {
  readonly label: string;
  readonly kind: "line" | "zone" | "float";
  readonly line: Rect;
  /** A group lands there in its vertical form (a side edge's column); a bar or a float holds it in its row form. */
  readonly vertical: boolean;
  /** The arrangement a drop at `p` makes (the pointer holding the group at the drag's grab point). */
  readonly make: (p: Point) => Arrangement;
}

interface Drag {
  readonly id: GroupId;
  readonly home: Rect;
  /** Home for the drag model: where it was and the stretch its own place owns. */
  readonly homeZone: Rect;
  readonly grab: Point;
  pointer: Point;
  readonly targets: GTarget[];
  readonly intent: DragIntent<GTarget>;
  shown: GTarget | null;
  room: GTarget | null;
  /** A keyboard move: the stop shown (once an arrow has moved it), and since when. */
  keys: { i: number; since: number; moved: boolean } | null;
  /** Where the group was before it lifted (its host's element) and its axis there. */
  readonly homeBox: HTMLElement | null;
  readonly homeVertical: boolean;
  /** The real group, held by the pointer (@n-uf/motion/layout): 1:1, a snap into a slot, the glide back. */
  readonly held: HeldDrag;
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
let lastDrag: GroupDragResult | null = null;

/**
 * The drop targets for dragging group `id` (the arrangement without it): insertion points and empty zones, host by
 * host, then the documents. Its own place is none of them: its stretch goes into `own` (part of home).
 */
function groupTargets(id: GroupId, own?: Rect[]): GTarget[] {
  const a0 = withoutGroup(arrangement, id);
  const g = geometry(a0, true);
  const out: GTarget[] = [];
  for (const h of HOSTS) {
    const host = g.hosts[h];
    if (!host.shows && !host.strip) continue;
    const l = layoutHost(a0[h], h, host.spec, groupSize, a0.collapsed);
    const v = vertical(h);
    const o = host.origin;
    const T = host.spec.thickness;
    const pts = insertions(a0[h], h, host.spec, l).sort((p, q) => ZONES.indexOf(p.zone) - ZONES.indexOf(q.zone) || p.index - q.index);
    for (const p of pts) {
      const [s0, s1] = p.span;
      const after = insertGroup(arrangement, id, h, p.zone, p.index);
      // Its own place is home, not a target: a drop there changes nothing, so nothing shows there (and the stretch it
      // owns joins home, so nothing behind it, the documents' float, shows either).
      if (sameArrangement(after, arrangement)) {
        own?.push(v ? rect(o.x - 12, o.y + s0, T + 24, s1 - s0) : rect(o.x + s0, o.y - 12, s1 - s0, T + 24));
        continue;
      }
      // An empty zone: the group's own footprint, where it will land; else the insertion line.
      const foot = p.empty ? placements(after, geometry(after, true)).get(id)?.rect : undefined;
      const hit = p.empty ? (v ? rect(o.x - 4, o.y + s0, T + 8, s1 - s0) : rect(o.x + s0, o.y - 4, s1 - s0, T + 8)) : v ? rect(o.x - 12, o.y + s0, T + 24, s1 - s0) : rect(o.x + s0, o.y - 12, s1 - s0, T + 24);
      const line = foot ?? (v ? rect(o.x + 4, o.y + p.at - 1.5, T - 8, 3) : rect(o.x + p.at - 1.5, o.y + 4, 3, T - 8));
      out.push({ id: `g:${h}:${p.zone}:${p.index}`, priority: p.empty ? 1 : 2, hit, label: p.label, kind: p.empty ? "zone" : "line", line, vertical: v, make: () => after });
    }
  }
  // Over the documents: it floats where it is dropped (kept on the stage).
  const stage = rect(g.stage.x, g.stage.y, g.SW - 2, g.SH - 2);
  out.push({
    id: "g:float",
    priority: 3,
    free: true,
    hit: stage,
    label: "Float here",
    kind: "float",
    line: stage,
    vertical: false,
    make: (p) => {
      const s = groupSize(id, false, arrangement.collapsed.includes(id));
      const grab = drag?.grab ?? { x: 0, y: 0 };
      const x = Math.min(Math.max(0, p.x - grab.x - g.stage.x), stage.width - s.along);
      const y = Math.min(Math.max(0, p.y - grab.y - g.stage.y), stage.height - s.across);
      return floatGroup(arrangement, id, x, y);
    },
  });
  return out;
}

function windowPoint(e: { clientX: number; clientY: number }): Point {
  const w = win!.getBoundingClientRect();
  const k = win!.offsetWidth / (w.width || 1);
  return { x: (e.clientX - w.left) * k, y: (e.clientY - w.top) * k };
}

/** A touch held this long without moving opens the handle's menu. */
const MENU_PRESS = 500;

/** The pointer of the press that may lift a group. */
let pressId: number | null = null;

function pressGroup(id: GroupId, e: PointerEvent): void {
  if (drag || e.button !== 0) return;
  pressId = e.pointerId;
  if (e.pointerType === "touch") {
    const t = setTimeout(() => !drag && groupMenu(id), MENU_PRESS);
    const stop = (): void => clearTimeout(t);
    e.currentTarget?.addEventListener("pointerup", stop, { once: true });
    e.currentTarget?.addEventListener("pointermove", stop, { once: true });
  }
  // Frozen: the handle still opens its menu, but nothing moves (unless Alt is held).
  if (!canMove(e)) return;
  trackPress(e, { point: windowPoint, lifted: () => drag?.id === id, begin: (s) => begin(id, s), move: (q) => moveTo(q), end: (c) => end(c) }, true);
}

/** Lift a group with the pointer at `p`; `keyboard`: stepped through its targets from where it is. */
function begin(id: GroupId, p: Point, keyboard = false): void {
  if (drag || !win || !layer) return;
  closeMenu();
  const ge = groupEls.get(id)!;
  const home = toWindow(ge.el.getBoundingClientRect());
  const homeBox = ge.container;
  // The group itself lifts (no copy): onto the drag layer, held where it is; its place stays, empty, until the drop.
  layer.append(ge.el);
  ge.container = layer;
  ge.item.jumpTo(home);
  ge.el.classList.add("lifted");
  // Moving it took its pointer capture with it: the press keeps the pointer.
  if (pressId !== null) {
    try {
      ge.handle.setPointerCapture(pressId);
    } catch {
      // A scripted press has no real pointer to capture.
    }
  }
  const own: Rect[] = [];
  const targets = groupTargets(id, own);
  // Home for the drag model: where it was, and the stretch of its host its own place owns (a release there is none).
  const zone = [home, ...own].reduce((u, r) => {
    const x = Math.min(u.x, r.x);
    const y = Math.min(u.y, r.y);
    return rect(x, y, Math.max(u.x + u.width, r.x + r.width) - x, Math.max(u.y + u.height, r.y + r.height) - y);
  });
  // From the keyboard, the steps start where the group is now.
  const here = ownStop(id, targets);
  const grab = { x: p.x - home.x, y: p.y - home.y };
  drag = {
    id,
    home,
    homeZone: zone,
    grab,
    pointer: p,
    targets,
    intent: createDragIntent<GTarget>({ home: zone }),
    shown: null,
    room: null,
    keys: keyboard ? { i: here, since: performance.now(), moved: false } : null,
    homeBox,
    homeVertical: ge.vertical,
    held: holdItem(ge.item, grab),
    snapped: null,
    returning: false,
    t0: performance.now(),
    log: [],
    snaps: [],
    frames: [],
    releaseNote: null,
  };
  // Frames come while it is held (the frame's task aims it).
  motion?.wake();
}

/**
 * Where the keyboard starts: between the stop before the group's own place and the one after it (its own place is
 * no stop). Returns the last stop before it (-1: none; a floating group starts before the first).
 */
export function ownStop(id: GroupId, targets: readonly { readonly id: string; readonly kind: string }[]): number {
  const own = hostOf(arrangement, id);
  if (!own) return -1;
  const key = (h: string, z: string, i: number): number => (HOSTS.indexOf(h as HostId) * ZONES.length + ZONES.indexOf(z as (typeof ZONES)[number])) * 1000 + i;
  const mine = key(own.host, own.zone, own.index);
  let last = -1;
  targets.forEach((t, i) => {
    const [, h, z, n] = t.id.split(":");
    if (t.kind !== "float" && key(h!, z!, Number(n)) < mine) last = i;
  });
  return last;
}

function moveTo(q: Point): void {
  if (drag) drag.pointer = q;
}

const heldRect = (d: Drag): Rect => rect(d.pointer.x - d.grab.x, d.pointer.y - d.grab.y, d.home.width, d.home.height);

/** Once a frame while dragging: the drag model's aim, the indicator, the room, and (snap) the ghost's slot. */
function aim(now: number): void {
  const d = drag!;
  let f: { shown: GTarget | null; room: boolean; aiming: boolean };
  if (d.keys) {
    const t = d.targets[d.keys.i] ?? null;
    const moved = d.keys.moved && t !== null;
    f = { shown: moved ? t : null, room: moved && now - d.keys.since >= DRAG_DEFAULTS.roomAfter, aiming: true };
  } else f = d.intent.update(d.pointer, now, d.targets);
  if ((f.shown?.id ?? null) !== (d.shown?.id ?? null)) d.log.push({ t: now - d.t0, id: f.shown?.id ?? null, ...(f.shown ? {} : { flying: !f.aiming }) });
  d.shown = f.shown;
  // The preview decides this frame (@n-uf/motion/drag's previewPlan): the indicator, the room (the open gap), the group
  // snapped into its slot. A float has no slot: it keeps its outline and never makes room.
  const plan = previewPlan({ shown: f.shown, room: f.room }, lab!.preview(), !!f.shown && f.shown.kind !== "float");
  showIndicator(plan.showIndicator ? d.shown : null, d);
  const room = plan.makeRoom && d.shown?.kind !== "float" ? d.shown : null;
  if ((room?.id ?? null) !== (d.room?.id ?? null)) {
    d.room = room;
    preview = room ? room.make(d.pointer) : null;
    changed();
  }
  // Its form follows the target the drag model shows (so never while flying, only once it aims): over a side edge the
  // held group swaps to its vertical markup, over a bar or a float to its row form, and with no target back to the
  // form it was lifted in. The held drag takes the new size (revealed from where it is drawn), so the drop that
  // follows lands with no second motion.
  const ge = groupEls.get(d.id)!;
  const form = d.shown ? d.shown.vertical : d.homeVertical;
  if (ge.vertical !== form) {
    ge.vertical = form;
    ge.el.classList.toggle("v", form);
    const s = groupSize(d.id, form, ge.el.classList.contains("collapsed"));
    d.held.resize(form ? { width: s.across, height: s.along } : { width: s.along, height: s.across });
  }
  // The group itself (@n-uf/motion/layout's held drag): 1:1 under the pointer (from the keyboard: where it was picked
  // up, home), or (snap) gliding into the slot the room was made for, and back to the pointer.
  const slot = plan.snapItem && d.room ? (placements(preview!, geometry(preview!, true)).get(d.id) ?? null) : null;
  if (slot && d.snapped !== d.room!.id) d.snaps.push({ t: now - d.t0, id: d.room!.id });
  if (!slot && d.snapped) d.snaps.push({ t: now - d.t0, id: null, flying: !f.aiming });
  d.snapped = slot ? d.room!.id : null;
  d.held.move(d.pointer);
  d.held.preview({ snapItem: !!slot }, slot?.rect ?? null);
  d.returning = d.held.returning;
}

function showIndicator(t: GTarget | null, d: Drag): void {
  if (!indEl || !indLabel) return;
  if (!t) {
    indEl.classList.remove("on");
    indLabel.classList.remove("on");
    return;
  }
  // The slot is the group's own outline, never a hairline: the rect it lands in (its size and form there), drawn over
  // its neighbours in the indicator preview, in the opened gap in the others. A drop lands exactly there.
  const made = t.make(d.pointer);
  let r = placements(made, geometry(made)).get(d.id)?.rect ?? t.line;
  if (t.kind === "float" && r === t.line) {
    const s = t.line;
    const h = d.held.held ?? heldRect(d);
    r = rect(Math.min(Math.max(s.x, h.x), s.x + s.width - h.width), Math.min(Math.max(s.y, h.y), s.y + s.height - h.height), h.width, h.height);
  }
  indEl.classList.add("area");
  Object.assign(indEl.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
  indEl.dataset.target = t.id;
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
  let next: Arrangement | null = null;
  if (!cancel) {
    // The release point is a sample too: a last jump of the pointer can hide the indicator before the drop.
    if (!d.keys) aim(performance.now());
    landed = d.keys ? (d.keys.moved ? (d.targets[d.keys.i] ?? null) : null) : d.intent.release(d.pointer, d.targets);
    // Snapped: it lands in the slot it sits in (the room's arrangement); else where the target puts it.
    next = landed ? (d.snapped && preview && landed.id === d.snapped ? preview : landed.make(d.pointer)) : null;
    if (!d.keys) {
      const under = d.targets.filter((t) => inRect(t.hit, d.pointer)).sort((a, b) => a.priority - b.priority || a.hit.width * a.hit.height - b.hit.width * b.hit.height)[0];
      const said = inRect(d.homeZone, d.pointer) ? null : (d.shown?.id ?? under?.id ?? null);
      d.releaseNote = said === (landed?.id ?? null) ? null : `landed on ${landed?.id ?? "home"}, but the indicator said ${said ?? "home"}`;
    }
  }
  drag = null;
  showIndicator(null, d);
  preview = null;
  // The group settles from where it was let go into its (new) place, or back home: never from its old home.
  const ge = groupEls.get(d.id)!;
  const release = toWindow(ge.el.getBoundingClientRect());
  const p = next ? placements(next, geometry(next)).get(d.id) : undefined;
  const container = p ? (p.host === "top" ? topBox : p.host === "float" ? floats : (bars.get(p.host)?.el ?? null)) : d.homeBox;
  ge.el.classList.remove("lifted");
  const goal = p ?? placements(arrangement, geometry(arrangement)).get(d.id);
  if (container && goal) {
    // A FLIP (@n-uf/motion/layout): drawn where it was let go in its new host, then a settle into its place.
    if (ge.vertical !== goal.vertical) {
      ge.vertical = goal.vertical;
      ge.el.classList.toggle("v", goal.vertical);
    }
    flip([{ item: ge.item, node: ge.el, place: () => ({ from: pageToLocal(container, release), to: goal.local }) }], () => {
      container.append(ge.el);
      ge.container = container;
    });
  }
  lastDrag = { log: d.log, snaps: d.snaps, frames: d.frames, landed: landed?.id ?? null, releaseNote: d.releaseNote, grab: d.grab, release, landFirst: toWindow(ge.el.getBoundingClientRect()) };
  if (next) setArrangement(next);
  else changed();
}

/**
 * Keys on a handle: Shift+F10 (or the menu key) opens its menu; the arrow keys move the group from slot to slot
 * (the indicator shows each), Enter or Space drops it there and Escape cancels; with no move going on, Enter or Space
 * collapses or expands it.
 */
function keyOnHandle(id: GroupId, e: KeyboardEvent): void {
  if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
    e.preventDefault();
    groupMenu(id);
  } else if (drag) return;
  else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (canMove(e)) setArrangement(toggleCollapsed(arrangement, id));
  } else if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) {
    e.preventDefault();
    if (!canMove(e)) return;
    const r = groupEls.get(id)!.handle.getBoundingClientRect();
    pressId = null;
    begin(id, windowPoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }), true);
    step(e.key);
    // This press is the first step: the page's key handler mustn't step again.
    e.stopPropagation();
  }
}

function step(key: string): void {
  if (!drag?.keys) return;
  const n = drag.targets.length;
  const fwd = key === "ArrowDown" || key === "ArrowRight";
  // The documents (floating) aren't a keyboard stop: the menu's Float does that. Before the first step the group sits
  // between two stops (its own place is none): back goes to the one before it, forward to the one after.
  let i = drag.keys.moved || fwd ? drag.keys.i : drag.keys.i + 1;
  for (let k = 0; k < n; k++) {
    i = fwd ? (i + 1 + n) % n : (i - 1 + n) % n;
    if (drag.targets[i]!.kind !== "float") break;
  }
  drag.keys = { i, since: performance.now(), moved: true };
}

function onKey(e: KeyboardEvent): void {
  if (!drag) {
    if (e.key === "Escape" && menuOpen()) closeMenu();
    return;
  }
  if (e.key === "Escape") {
    cancelPress();
    end(true);
  } else if (drag.keys && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) step(e.key);
  else if (drag.keys && (e.key === "Enter" || e.key === " ")) end(false);
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
  /** Where the group was drawn when it was let go, and in the landing's first frame (window coordinates). */
  readonly release?: Rect;
  readonly landFirst?: Rect;
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

const groupOf = (kind: string): GroupId => kind.slice(2) as GroupId;

export const toolbarGroups = {
  arrangement: (): Arrangement => arrangement,
  shown: (): Arrangement => shownArrangement(),
  set: (a: Arrangement, mode?: BottomMode): void => setArrangement(a, mode),
  geometry: (): Geometry => geometry(shownArrangement()),
  placements: (): Map<GroupId, Placement> => placements(shownArrangement(), geometry(shownArrangement())),
  failures: (): string[] => layoutFailures(arrangement),
  /** The targets a drag of "g:<group>" would have now. */
  targets: (kind: string): GTarget[] => groupTargets(groupOf(kind)),
  /** Where a drag of "g:<group>" starts: its handle's centre (window coordinates). */
  grip(kind: string): Point | null {
    const h = groupEls.get(groupOf(kind))?.handle;
    if (!h) return null;
    const r = toWindow(h.getBoundingClientRect());
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  },
  rectOf: (el: Element): Rect => toWindow(el.getBoundingClientRect()),
  groupEl: (id: GroupId): HTMLElement | null => groupEls.get(id)?.el ?? null,
  handle: (id: GroupId): HTMLElement | null => groupEls.get(id)?.handle ?? null,
  window: (): HTMLElement | null => win,
  /** The indicator as shown now (window coordinates), or null. */
  indicator: (): { rect: Rect; target: string } | null => (indEl?.classList.contains("on") ? { rect: toWindow(indEl.getBoundingClientRect()), target: indEl.dataset.target ?? "" } : null),
  toClient(p: Point): Point {
    const w = win!.getBoundingClientRect();
    const k = (w.width || 1) / win!.offsetWidth;
    return { x: w.left + p.x * k, y: w.top + p.y * k };
  },
  freeze: (on: boolean): void => setLayoutFrozen(on),
  /** Assume Fit is on (true) or off (false) while the scenarios pin the stage; null: the page's own Fit. */
  fit: (on: boolean | null): void => {
    fitOverride = on;
  },
  alt: (on: boolean): void => setAlt(on),
  menu: (id: GroupId): HTMLElement => groupMenu(id),
  menuOpen: (): HTMLElement | null => menuOpen() ?? overflowOpen(),
  /** A scripted drag in real time along keyframes [ms, x, y] (window coordinates) from the handle; Escape at `escapeAt`; `onFrame` sees each frame. */
  async path(kind: string, keysOf: (grip: Point) => readonly PathKey[], opts: { escapeAt?: () => number; onFrame?: (t: number) => void } = {}): Promise<GroupDragResult> {
    const grip = toolbarGroups.grip(kind);
    const none: GroupDragResult = { log: [], snaps: [], frames: [], landed: null, releaseNote: null, grab: { x: 0, y: 0 } };
    if (!grip) return none;
    const keys = keysOf(grip);
    const escapeAt = opts.escapeAt?.();
    if (!canMove()) return none;
    begin(groupOf(kind), { x: keys[0]![1], y: keys[0]![2] });
    const start = performance.now();
    const total = keys.at(-1)![0];
    for (;;) {
      await nextFrame();
      const t = Math.min(performance.now() - start, total);
      moveTo(along(keys, t));
      opts.onFrame?.(t);
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
  /** A keyboard move: the arrow key `steps` times on the handle (a moment each), then Enter (or Escape). */
  async keyboard(kind: string, steps: number, finish: "Enter" | "Escape" = "Enter"): Promise<GroupDragResult | null> {
    const h = groupEls.get(groupOf(kind))?.handle;
    if (!h) return null;
    h.focus();
    const press = (k: string, on: EventTarget): void => void on.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    for (let i = 0; i < steps; i++) {
      press("ArrowDown", i === 0 ? h : document);
      await new Promise((r) => setTimeout(r, i === steps - 1 ? 650 : DRAG_DEFAULTS.roomAfter + DRAG_DEFAULTS.switchHold + 90));
    }
    press(finish, document);
    return lastDrag;
  },
  dragging: (): boolean => !!drag,
  /** Resolves once the frame's bars and groups rest and nothing is dragged (the layout motion is idle). */
  idle: (): Promise<void> => motion?.idle() ?? Promise.resolve(),
};
