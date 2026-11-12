/**
 * Kits, case 1: panels vs groups, on the real packages. One document viewer window: toolbar groups in a top and a bottom bar
 * (@n-uf/placement/toolbar targets), and tool panels in side docks with rails, fold, give-way, floating, tear-off and
 * dock-back (@n-uf/placement/dock, the edge docks + tear-off construction). Every item is drawn by one
 * @n-uf/motion/layout motion; a held item follows the pointer by @n-uf/motion/layout's held drag, and what the
 * preview shows, when, and what a release lands on are @n-uf/motion/drag's drag intent's.
 *
 * The switch puts the panels on a naive drag (a ghost copy, an insert line under the pointer on the last move, an
 * instant drop), so both feels can be compared in one window. The groups always use the held drag.
 *
 * The scripted scenarios (kits-panels-scenarios.ts) drive it through `page`.
 */
import { createFrameLoop, type Rect } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import { DRAG_DEFAULTS, createDragIntent, inRect, previewPlan, targetAt, type DragIntent, type DragPreview, type DragTarget } from "@n-uf/motion/drag";
import { createLayoutMotion, domDrawable, holdItem, type HeldDrag, type LayoutItem } from "@n-uf/motion/layout";
import { DEFAULT_OPTIONS, createDesk, idOf, isPanelKey, liftOut, panelKey, toggleFold, touch, type DeskState, type Layout, type Options, type Placed } from "@n-uf/placement/dock";
import { deskDrop, deskTargets, floatTarget, hostTargets, type DeskTarget, type DeskTargetInput, type ToolbarFloatTarget, type ToolbarTarget } from "@n-uf/placement/targets";
import { arrangement, layoutHost, type Arrangement, type GroupSize, type HostSpec } from "@n-uf/placement/toolbar";
import { same, type Point } from "../shared/geometry";

// --- the window ----------------------------------------------------------------------------------------------------

/** The stage (the window), its title bar, the two toolbar hosts and the panels' area between them, in stage px. */
export const W = 1040;
export const H = 600;
const TITLE_H = 30;
const BAR_T = 40;
const TOP: Point = { x: 0, y: TITLE_H };
const BOTTOM: Point = { x: 0, y: H - BAR_T };
/** The desk (docks, rails, the document) lays out here. */
export const MID: Rect = { x: 0, y: TITLE_H + BAR_T, width: W, height: H - TITLE_H - 2 * BAR_T };
const HOST: HostSpec = { length: W, thickness: BAR_T, lead: 10, tail: 10 };
/** A group's thickness across its bar. */
const ACROSS = 30;
/** The settle tempo every item lands with (ω, 1/s). */
export const OMEGA = 25;

export type GroupId = "nav" | "zoom" | "ann" | "review" | "share";
export const GROUPS: Readonly<Record<GroupId, { label: string; html: string }>> = {
  nav: { label: "Navigate", html: `<button type="button">‹</button><span class="kp-val">2 / 12</span><button type="button">›</button>` },
  zoom: { label: "Zoom", html: `<button type="button">−</button><span class="kp-val">80%</span><button type="button">+</button>` },
  ann: { label: "Annotate", html: `<button type="button" class="on">↖</button><button type="button">A</button><button type="button">▢</button><button type="button">✎</button>` },
  review: { label: "Review", html: `<button type="button" class="text">Approve</button><button type="button" class="text">Request changes</button>` },
  share: { label: "Share", html: `<button type="button" class="text">Share</button><button type="button" class="text">Print</button>` },
};
const GROUP_IDS = Object.keys(GROUPS) as GroupId[];
const START_GROUPS = arrangement<GroupId>({ top: { start: ["nav"], center: ["zoom"], end: ["ann", "review", "share"] } });

/** The panels: ids, titles, rail icons, sample rows; natural heights so that two fit a dock and three don't. */
export const PANELS = [
  { id: 1, title: "Outline", icon: "☰", natural: 210, rows: ["1. Scope", "2. Budget", "3. Timeline", "4. Risks", "5. Appendix", "6. Sign-off"] },
  { id: 2, title: "Notes", icon: "✎", natural: 190, rows: ["Check the Q3 total", "Ask Finance about p. 7", "Redo the chart", "Reply to Sam", "Move the risks up"] },
  { id: 3, title: "History", icon: "↺", natural: 180, rows: ["p. 3 edited", "p. 7 commented", "Shared with Finance", "Renamed", "Opened"] },
] as const;
const panelOf = (id: number) => PANELS.find((p) => p.id === id)!;

const desk = createDesk({ panels: PANELS.map(({ id, title, natural }) => ({ id, title, natural })), docTitle: () => "Quarterly plan.pdf", start: { left: [1, 2], right: [3], bottom: [] } });
const construction = desk.constructionOf("dockTear");
const OPT: Options = { ...DEFAULT_OPTIONS, bottom: "off", toolbarHidden: true };
const DESK_SIZE = { width: MID.width, height: MID.height };
/** History is the least recently used panel, Outline the most. */
const startDesk = (): DeskState => touch(touch(construction.initial([1]), 2), 1);

// --- state ---------------------------------------------------------------------------------------------------------

export type PanelMode = "naive" | "dock";
let groups: Arrangement<GroupId> = START_GROUPS;
let deskState: DeskState = startDesk();
let panelMode: PanelMode = "naive";
let preview: DragPreview = "snap";
let nextPreview: DragPreview | null = null;

const stage = document.getElementById("kp-stage") as HTMLDivElement;
const status = document.getElementById("kp-status") as HTMLParagraphElement;
const loop = createFrameLoop({ clock: createBrowserClock() });
/** Every item (groups, panels, rails, the document) on one layout motion: it settles each to the place it is given. */
export const motion = createLayoutMotion({ loop, omega: OMEGA, phase: "update" });

interface Item {
  readonly key: string;
  readonly el: HTMLElement;
  readonly m: LayoutItem;
}
const items = new Map<string, Item>();
const off = (r: Rect, o: Point): Rect => ({ x: r.x + o.x, y: r.y + o.y, width: r.width, height: r.height });
const toDesk = (p: Point): Point => ({ x: p.x - MID.x, y: p.y - MID.y });

function el(tag: string, cls: string, html = ""): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}
const dots = (n: number): string => "<i></i>".repeat(n);

// --- the chrome: title bar, bars, indicator ------------------------------------------------------------------------

stage.style.width = `${W}px`;
stage.style.height = `${H}px`;
const bar = (cls: string, at: Point, html = ""): HTMLElement => {
  const b = el("div", `kp-bar ${cls}`, html);
  b.style.cssText = `left:${at.x}px;top:${at.y}px;width:${W}px;height:${BAR_T}px`;
  return b;
};
stage.append(
  el("div", "kp-title", `<span class="kp-lights"><i></i><i></i><i></i></span><span class="kp-file">Quarterly plan.pdf</span><span class="kp-pages">12 pages</span>`),
  bar("top", TOP),
  bar("bottom", BOTTOM, `<span class="kp-empty">Bottom bar</span>`),
);
/** The drop indicator (an outline of where the item lands) and its label; the naive drag's insert line and ghost. */
export const ind = el("div", "kp-ind");
export const indLabel = el("div", "kp-ind-label");
export const line = el("div", "kp-line");
ind.hidden = indLabel.hidden = line.hidden = true;

// --- groups --------------------------------------------------------------------------------------------------------

const groupEls = new Map<GroupId, HTMLElement>();
for (const g of GROUP_IDS) {
  const e = el("div", "kp-group", `<span class="kp-handle" role="button" tabindex="0" aria-label="Move ${GROUPS[g].label}">${dots(6)}</span><span class="kp-ctl">${GROUPS[g].html}</span>`);
  e.dataset.g = g;
  groupEls.set(g, e);
  stage.append(e);
}
/** Each group's length along a bar, measured once from its content. */
const along = new Map<GroupId, number>([...groupEls].map(([g, e]) => [g, Math.ceil(e.offsetWidth)]));
const groupSize: GroupSize<GroupId> = (g, _v, collapsed) => ({ along: collapsed ? 18 : (along.get(g) ?? 80), across: ACROSS });
const groupKey = (g: GroupId): string => `g:${g}`;

/** Where every group is drawn for an arrangement (stage px). */
function groupRects(a: Arrangement<GroupId>): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const [h, o] of [["top", TOP], ["bottom", BOTTOM]] as const) {
    for (const [g, r] of layoutHost(a[h], h, HOST, groupSize, a.collapsed).slots) out.set(groupKey(g), off(r, o));
  }
  for (const f of a.floating) out.set(groupKey(f.id), { x: MID.x + f.x, y: MID.y + f.y, width: groupSize(f.id, false, false).along, height: ACROSS });
  return out;
}

// --- panels, rails, the document -----------------------------------------------------------------------------------

const deskLayout = (s: DeskState): Layout => construction.layout(s, DESK_SIZE, OPT);
const panelHtml = (id: number): string => {
  const p = panelOf(id);
  return `<div class="kp-head"><span class="kp-grip" aria-hidden="true">${dots(6)}</span><span class="kp-name">${p.title}</span><button type="button" class="kp-fold" aria-label="Fold ${p.title}">▾</button></div><ul class="kp-body">${p.rows.map((r) => `<li>${r}</li>`).join("")}</ul>`;
};
const docHtml = `<div class="kp-paper"><h4>2. Scope of work</h4>${'<div class="kp-l"></div>'.repeat(9)}<div class="kp-l short"></div></div>`;

function addItem(key: string, e: HTMLElement, at: Rect): Item {
  stage.append(e);
  const it = { key, el: e, m: motion.add(key, domDrawable({ node: e }), at) };
  items.set(key, it);
  return it;
}

function makeItems(): void {
  const g0 = groupRects(groups);
  for (const g of GROUP_IDS) addItem(groupKey(g), groupEls.get(g)!, g0.get(groupKey(g))!);
  const l = deskLayout(deskState);
  for (const [key, placed] of l.items) {
    if (key === "toolbar") continue;
    const r = off(placed.rect, MID);
    if (isPanelKey(key)) {
      const e = el("section", "kp-panel", panelHtml(idOf(key)));
      e.dataset.p = String(idOf(key));
      addItem(key, e, r);
    } else if (key.startsWith("rail:")) {
      const e = el("nav", "kp-rail");
      e.dataset.side = key.slice(5);
      addItem(key, e, r);
    } else addItem(key, el("div", "kp-doc", docHtml), r);
  }
  stage.append(ind, indLabel, line);
}

/** A panel's look on the page: open section, folded header, floating palette. */
function dress(key: string, placed: Placed): void {
  const it = items.get(key);
  if (!it) return;
  if (isPanelKey(key)) {
    it.el.classList.toggle("folded", placed.look === "header");
    it.el.classList.toggle("floating", placed.look === "float" || (placed.look === "header" && !!placed.shadow));
    it.el.dataset.look = placed.look;
  }
  if (key.startsWith("rail:")) {
    const icons = placed.icons ?? [];
    const sig = icons.join(",");
    if (it.el.dataset.icons !== sig) {
      it.el.dataset.icons = sig;
      it.el.innerHTML = icons.map((id, i) => `<button type="button" class="kp-ri" data-p="${id}" style="top:${10 + i * 32}px" title="${panelOf(id).title}" aria-label="${panelOf(id).title}">${panelOf(id).icon}</button>`).join("");
    }
  }
  if (!!placed.hidden === it.m.showing) it.m.show(!placed.hidden);
}

function railLit(l: Layout): void {
  for (const b of stage.querySelectorAll<HTMLElement>(".kp-ri")) {
    const p = l.items.get(panelKey(Number(b.dataset.p)));
    b.classList.toggle("on", !!p && !p.hidden && p.look === "section");
  }
}

// --- layout --------------------------------------------------------------------------------------------------------

/** What a drop makes: the place (its key), where the item lands, and the arrangement or desk it makes. */
export interface Drop {
  readonly key: string;
  readonly target: string;
  readonly label: string;
  readonly slot: Rect;
  readonly free: boolean;
  readonly hidden: boolean;
  readonly groups?: Arrangement<GroupId>;
  readonly desk?: DeskState;
}
const slotted = (d: Drop | null): d is Drop => !!d && !d.free && !d.hidden;

/** Where every item goes now: the groups' and the desk's layouts, with the room a held drag makes (if any). */
export function layoutNow(): { rects: Map<string, Rect>; desk: Layout } {
  const room = drag?.room ?? null;
  const a = room?.groups ?? groups;
  const s = room?.desk ?? deskState;
  const rects = groupRects(a);
  const l = deskLayout(s);
  for (const [key, placed] of l.items) if (key !== "toolbar") rects.set(key, off(placed.rect, MID));
  return { rects, desk: l };
}

/** Give every item its place (the held one keeps following the pointer); `instant`: jump there (the naive drag's drop). */
function relayout(instant = false): void {
  const { rects, desk: l } = layoutNow();
  for (const [key, it] of items) {
    if (drag && key === drag.key) continue;
    const r = rects.get(key);
    if (!r) continue;
    const placed = l.items.get(key);
    if (placed) dress(key, placed);
    if (instant) it.m.jumpTo(r);
    else if (!same(it.m.target, r)) it.m.moveTo(r);
  }
  railLit(l);
}

// --- the held drag (groups always; panels on ./dock) ---------------------------------------------------------------

type Kind = "group" | "panel";
/** One frame of a held drag, as the page drew it. */
export interface DragFrameLog {
  readonly t: number;
  readonly pointer: Point;
  readonly aiming: boolean;
  readonly shown: string | null;
  /** The drop indicator is on the page. */
  readonly indicator: boolean;
  /** The held item sits in a slot. */
  readonly snapped: boolean;
  /** Items (other than the held one) whose place differs from where they were at the lift: the room. */
  readonly moved: readonly string[];
}

interface Held {
  readonly kind: Kind;
  readonly key: string;
  readonly item: Item;
  readonly grab: Point;
  readonly home: Rect;
  readonly held: HeldDrag;
  readonly intent: DragIntent<DragTarget>;
  readonly targets: readonly DragTarget[];
  readonly dropOf: (t: DragTarget, p: Point) => Drop;
  /** Each item's place at the lift (for the room check). */
  readonly at: ReadonlyMap<string, Rect>;
  readonly frames: DragFrameLog[];
  pointer: Point;
  shown: Drop | null;
  room: Drop | null;
  snapped: Drop | null;
}
let drag: Held | null = null;

/** A panel target in stage px: placement's target (desk px) with its hit moved onto the stage. */
interface PanelTarget extends DragTarget {
  readonly src: DeskTarget;
}

function groupTargets(g: GroupId): { targets: DragTarget[]; dropOf: (t: DragTarget, p: Point, grab: Point) => Drop } {
  const label = (x: GroupId): string => GROUPS[x].label;
  const hosts = (["top", "bottom"] as const).flatMap((h) => hostTargets({ group: g, arrangement: groups, host: h, origin: h === "top" ? TOP : BOTTOM, spec: HOST, size: groupSize, label }).targets);
  const fl = floatTarget({ group: g, arrangement: groups, stage: MID, width: groupSize(g, false, false).along, height: ACROSS });
  const dropOf = (t: DragTarget, p: Point, grab: Point): Drop => {
    const isFloat = t.id === fl.id;
    const a = isFloat ? (t as ToolbarFloatTarget<GroupId>).make(p, grab) : (t as ToolbarTarget<GroupId>).arrangement;
    const f = a.floating.find((x) => x.id === g);
    return { key: isFloat && f ? `g:float:${Math.round(f.x)},${Math.round(f.y)}` : t.id, target: t.id, label: t.label ?? t.id, slot: groupRects(a).get(groupKey(g))!, free: !!t.free, hidden: false, groups: a };
  };
  return { targets: [...hosts, fl], dropOf };
}

function panelTargets(key: string, kit: boolean): { targets: PanelTarget[]; dropOf: (t: DragTarget, p: Point, grab: Point) => Drop } {
  const input: DeskTargetInput = { c: construction, s0: liftOut(deskState, key), key, size: DESK_SIZE, opt: OPT };
  // The naive drag has no tear-off: only the docks and rails.
  const targets = deskTargets(input)
    .filter((t) => !kit || t.id !== "float")
    .map((t): PanelTarget => ({ id: t.id, priority: t.priority, hit: off(t.hit, MID), free: !!t.free, ...(t.label ? { label: t.label } : {}), src: t }));
  const dropOf = (t: DragTarget, p: Point, grab: Point): Drop => {
    const d = deskDrop(input, (t as PanelTarget).src, toDesk(p), grab);
    return { key: d.key, target: d.target, label: d.label, slot: off(d.slot, MID), free: d.free, hidden: d.hidden, desk: d.state };
  };
  return { targets, dropOf };
}

const nameOf = (key: string): string => (isPanelKey(key) ? panelOf(idOf(key)).title : GROUPS[key.slice(2) as GroupId].label);

/** Lift `it` with the pointer at `p`; `glide`: the pointer is elsewhere (a rail icon), so the item glides to it. */
function beginHeld(kind: Kind, it: Item, p: Point, grab: Point, glide: boolean): void {
  const home = { ...it.m.drawn };
  const src = kind === "group" ? groupTargets(it.key.slice(2) as GroupId) : panelTargets(it.key, false);
  const intent = createDragIntent<DragTarget>({ home, placeOf: (t, q) => src.dropOf(t, q, grab).key });
  const at = new Map([...items].map(([k, x]) => [k, { ...x.m.target }]));
  const held = holdItem(it.m, grab);
  drag = { kind, key: it.key, item: it, grab, home, held, intent, targets: src.targets, dropOf: (t, q) => src.dropOf(t, q, grab), at, frames: [], pointer: p, shown: null, room: null, snapped: null };
  it.el.classList.add("lifted");
  it.m.show(true);
  if (glide) {
    // From its place to the pointer: into its own rect, then out of it, so the held drag glides it back to the pointer.
    held.snapTo({ ...it.m.drawn });
    held.snapTo(null);
  }
  held.move(p);
  stage.classList.add("dragging");
  motion.task(() => {
    if (!drag) return false;
    aim(performance.now());
    return true;
  });
}

/** Once a frame while an item is held: the intent says what shows; the preview what moves. */
function aim(now: number): void {
  const d = drag;
  if (!d) return;
  const f = d.intent.update(d.pointer, now, d.targets);
  const drop = f.shown ? d.dropOf(f.shown, d.pointer) : null;
  const plan = previewPlan(f, preview, slotted(drop));
  const roomFor = plan.makeRoom ? f.roomPlace : null;
  const room = roomFor === null ? null : drop?.key === roomFor ? drop : d.room?.key === roomFor ? d.room : null;
  if (room?.key !== d.room?.key) {
    d.room = room;
    relayout();
  }
  d.shown = drop;
  showIndicator(plan.showIndicator ? drop : null);
  const want = plan.snapItem && slotted(d.room) ? d.room : null;
  if (want) {
    if (d.snapped?.key !== want.key) {
      d.snapped = want;
      d.held.snapTo(want.slot);
    }
  } else {
    if (d.snapped) {
      d.snapped = null;
      d.held.snapTo(null);
    }
    d.held.follow();
  }
  const moved = [...items].filter(([k, x]) => k !== d.key && !same(x.m.target, d.at.get(k)!)).map(([k]) => k);
  d.frames.push({ t: now, pointer: { ...d.pointer }, aiming: f.aiming, shown: drop?.target ?? null, indicator: !ind.hidden, snapped: !!d.snapped, moved });
}

function showIndicator(d: Drop | null): void {
  if (!d) {
    ind.hidden = indLabel.hidden = true;
    return;
  }
  // The item's own outline where it lands; folded into a rail: the rail.
  const r = d.hidden && isPanelKey(drag?.key ?? "") ? off(deskLayout(d.desk!).items.get(d.target.startsWith("rail:") ? d.target : "rail:left")!.rect, MID) : d.slot;
  Object.assign(ind.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
  ind.classList.toggle("free", d.free);
  indLabel.textContent = d.label;
  Object.assign(indLabel.style, { left: `${Math.max(4, r.x)}px`, top: `${Math.max(4, r.y - 24)}px` });
  ind.hidden = indLabel.hidden = false;
}

/** The last drop: what it landed on (null: home), what the page showed at the release, and the rects. */
export interface DropRecord {
  readonly kind: Kind | "kit";
  readonly key: string;
  readonly landed: string | null;
  readonly shownAtRelease: string | null;
  readonly release: Rect;
  readonly to: Rect | null;
  readonly folded: readonly string[];
}
export let lastDrop: DropRecord | null = null;
/** The frames of the last held drag. */
export let lastFrames: readonly DragFrameLog[] = [];

const foldedPanels = (l: Layout): string[] => [...l.items].filter(([k, p]) => isPanelKey(k) && p.look === "header").map(([k]) => k);

/** Let go: a release lands where the intent says (the shown target, else the one under the pointer), else goes home. */
function endHeld(cancel: boolean): void {
  const d = drag;
  if (!d) return;
  if (!cancel) aim(performance.now());
  const t = cancel ? null : d.intent.release(d.pointer, d.targets);
  const drop = t ? d.dropOf(t, d.pointer) : null;
  const before = foldedPanels(deskLayout(deskState));
  const shownAtRelease = d.shown?.target ?? null;
  const release = { ...d.item.m.drawn };
  if (drop?.groups) groups = drop.groups;
  if (drop?.desk) deskState = drop.desk;
  lastFrames = d.frames;
  drag = null;
  d.item.el.classList.remove("lifted");
  stage.classList.remove("dragging");
  showIndicator(null);
  relayout();
  // The held item settles from where it was let go into its place (or home).
  const to = layoutNow().rects.get(d.key) ?? null;
  if (to) d.item.m.moveTo(to);
  const after = foldedPanels(deskLayout(deskState));
  const folded = after.filter((k) => !before.includes(k) && k !== d.key);
  lastDrop = { kind: d.kind, key: d.key, landed: drop?.target ?? null, shownAtRelease, release, to, folded };
  say(drop ? `${nameOf(d.key)} → ${drop.label}.${folded.length ? ` ${folded.map(nameOf).join(", ")} folded to make room (least recently used first).` : ""}` : cancel ? "Cancelled: back where it was." : "No target: it glided home.");
  applyPreview();
}

// --- the naive drag (panels only) ----------------------------------------------------------------------------------

interface KitDrag {
  readonly key: string;
  readonly item: Item;
  readonly start: Point;
  readonly from: Rect;
  readonly ghost: HTMLElement;
  readonly home: Rect;
  readonly targets: readonly DragTarget[];
  readonly dropOf: (t: DragTarget, p: Point) => Drop;
  readonly frames: { t: number; line: boolean; ghost: boolean }[];
  pointer: Point;
  over: DragTarget | null;
}
let kit: KitDrag | null = null;

function beginKit(it: Item, start: Point, p: Point): void {
  const src = panelTargets(it.key, true);
  const from = { ...it.m.drawn };
  const ghost = it.el.cloneNode(true) as HTMLElement;
  ghost.classList.add("kp-ghost");
  ghost.removeAttribute("data-p");
  Object.assign(ghost.style, { left: `${from.x}px`, top: `${from.y}px`, width: `${from.width}px`, height: `${from.height}px`, transform: "", clipPath: "" });
  stage.append(ghost);
  it.el.classList.add("kit-orig");
  kit = { key: it.key, item: it, start, from, ghost, home: from, targets: src.targets, dropOf: (t, q) => src.dropOf(t, q, { x: start.x - from.x, y: start.y - from.y }), frames: [], pointer: p, over: null };
  stage.classList.add("dragging");
  moveKit(p);
}

/** Last move wins: whatever is under the pointer now gets the insert line, flying or not. */
function moveKit(p: Point): void {
  const k = kit;
  if (!k) return;
  k.pointer = p;
  k.ghost.style.left = `${k.from.x + p.x - k.start.x}px`;
  k.ghost.style.top = `${k.from.y + p.y - k.start.y}px`;
  k.over = inRect(k.home, p) ? null : targetAt(k.targets, p);
  if (k.over) {
    const d = k.dropOf(k.over, p);
    const r = d.hidden ? off(deskLayout(d.desk!).items.get(k.over.id.startsWith("rail:") ? k.over.id : "rail:left")!.rect, MID) : { x: d.slot.x, y: d.slot.y - 4.5, width: d.slot.width, height: 3 };
    Object.assign(line.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
    line.classList.toggle("area", d.hidden);
    line.hidden = false;
  } else line.hidden = true;
  k.frames.push({ t: performance.now(), line: !line.hidden, ghost: k.ghost.isConnected });
}

export let lastKitFrames: readonly { t: number; line: boolean; ghost: boolean }[] = [];

/** The drop is instant: everything jumps to its new place. */
function endKit(cancel: boolean): void {
  const k = kit;
  if (!k) return;
  kit = null;
  k.ghost.remove();
  k.item.el.classList.remove("kit-orig");
  stage.classList.remove("dragging");
  line.hidden = true;
  lastKitFrames = k.frames;
  const drop = !cancel && k.over ? k.dropOf(k.over, k.pointer) : null;
  const before = foldedPanels(deskLayout(deskState));
  if (drop?.desk) deskState = drop.desk;
  relayout(true);
  const to = layoutNow().rects.get(k.key) ?? null;
  const folded = foldedPanels(deskLayout(deskState)).filter((x) => !before.includes(x) && x !== k.key);
  lastDrop = { kind: "kit", key: k.key, landed: drop?.target ?? null, shownAtRelease: drop?.target ?? null, release: { ...k.from }, to, folded };
  say(drop ? `${nameOf(k.key)} → ${drop.label} (instant).` : "Dropped on nothing: it stays where it was.");
}

// --- input ---------------------------------------------------------------------------------------------------------

const stagePoint = (e: { clientX: number; clientY: number }): Point => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const busy = (): boolean => !!drag || !!kit;

/**
 * A press on a group's handle, a panel's title bar or a rail icon: a tap (no lift) brings a panel forward; past the
 * lift distance it lifts (the naive drag lifts at 4 px, the held drag by the drag model's lift rule).
 */
function press(e: PointerEvent, kind: Kind, it: Item, fromRail: boolean): void {
  if (e.button !== 0 || busy()) return;
  e.preventDefault();
  const start = stagePoint(e);
  const useKit = kind === "panel" && panelMode === "naive";
  const lift = useKit ? 4 : DRAG_DEFAULTS.lift;
  let lifted = false;
  const move = (ev: PointerEvent): void => {
    const p = stagePoint(ev);
    if (!lifted) {
      if (Math.hypot(p.x - start.x, p.y - start.y) < lift) return;
      lifted = true;
      if (useKit) beginKit(it, start, p);
      else {
        const d = it.m.drawn;
        const grab = fromRail ? { x: Math.min(36, d.width / 2), y: 11 } : { x: start.x - d.x, y: start.y - d.y };
        beginHeld(kind, it, p, grab, fromRail);
      }
    }
    if (useKit) moveKit(p);
    else if (drag) {
      drag.pointer = p;
      drag.held.move(p);
    }
  };
  const up = (ev: PointerEvent): void => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    const cancel = ev.type === "pointercancel";
    if (!lifted) {
      if (!cancel && kind === "panel") bringForward(idOf(it.key));
      return;
    }
    if (useKit) endKit(cancel);
    else endHeld(cancel);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

/** A tap on a panel's title bar or its rail icon: it is the most recently used (and unfolds if folded by hand). */
function bringForward(id: number): void {
  deskState = deskState.folded.includes(id) ? toggleFold(deskState, id) : touch(deskState, id);
  relayout();
  say(`${panelOf(id).title} is the most recently used; the least recently used section gives way if there is no room.`);
}

stage.addEventListener("pointerdown", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest(".kp-fold")) return;
  const handle = t.closest<HTMLElement>(".kp-handle");
  if (handle) return press(e, "group", items.get(groupKey(handle.closest<HTMLElement>(".kp-group")!.dataset.g as GroupId))!, false);
  const head = t.closest<HTMLElement>(".kp-head");
  if (head) return press(e, "panel", items.get(panelKey(Number(head.closest<HTMLElement>(".kp-panel")!.dataset.p)))!, false);
  const ri = t.closest<HTMLElement>(".kp-ri");
  if (ri) return press(e, "panel", items.get(panelKey(Number(ri.dataset.p)))!, true);
});
stage.addEventListener("click", (e) => {
  const f = (e.target as HTMLElement).closest<HTMLElement>(".kp-fold");
  if (!f || busy()) return;
  const id = Number(f.closest<HTMLElement>(".kp-panel")!.dataset.p);
  const was = deskState.folded.includes(id);
  deskState = toggleFold(deskState, id);
  relayout();
  say(`${panelOf(id).title} ${was ? "opened" : "folded"}.`);
});
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (drag) endHeld(true);
  if (kit) endKit(true);
});
window.addEventListener("blur", () => {
  if (drag) endHeld(true);
  if (kit) endKit(true);
});

// --- controls ------------------------------------------------------------------------------------------------------

function say(text: string): void {
  status.textContent = text;
}

const MODE_COPY: Record<PanelMode, string> = {
  naive: "Panels on a naive drag. Lifts at 4 px; the panel stays put at 0.35 opacity under a ghost copy; an insert line shows whatever is under the pointer on the last move; the drop is instant. The groups use the held drag.",
  dock: "Panels on ./dock, with the groups' held drag: the real panel follows the pointer; a slot shows only while you aim; room opens after a beat and the least recently used section folds to make it; over the document a panel tears off as a palette; it lands on a critically damped spring (ω 25).",
};
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-pm]")];
export function setPanelMode(m: PanelMode): void {
  if (busy()) return;
  panelMode = m;
  // The naive drag can't float a panel: torn-off panels dock back into the left dock.
  if (m === "naive" && deskState.torn.length) {
    const ids = deskState.torn.map((f) => f.id);
    deskState = { ...deskState, torn: [], left: [...deskState.left, ...ids] };
    relayout();
  }
  for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.pm === m));
  stage.dataset.pm = m;
  (document.getElementById("kp-rule") as HTMLElement).textContent = MODE_COPY[m];
}
modeButtons.forEach((b) => b.addEventListener("click", () => setPanelMode(b.dataset.pm as PanelMode)));

export function setPreview(p: DragPreview): void {
  nextPreview = p;
  applyPreview();
  const r = document.querySelector<HTMLInputElement>(`input[name=preview][value=${p}]`);
  if (r) r.checked = true;
}
function applyPreview(): void {
  if (busy() || !nextPreview) return;
  preview = nextPreview;
  nextPreview = null;
}
document.querySelectorAll<HTMLInputElement>("input[name=preview]").forEach((r) => r.addEventListener("change", () => r.checked && setPreview(r.value as DragPreview)));

/** Everything back where it started (the panels' mode and the preview stay). */
export function reset(): void {
  if (drag) endHeld(true);
  if (kit) endKit(true);
  groups = START_GROUPS;
  deskState = startDesk();
  relayout(true);
  lastDrop = null;
  lastFrames = [];
  lastKitFrames = [];
  say("");
}
document.getElementById("kp-reset")!.addEventListener("click", reset);

makeItems();
relayout(true);
setPanelMode("naive");

/** What the scenarios read and drive. */
export const page = {
  stage,
  items,
  ind,
  line,
  motion,
  omega: OMEGA,
  mid: MID,
  tornWidth: 200,
  reset,
  setPanelMode,
  setPreview,
  layoutNow,
  get groups() {
    return groups;
  },
  get desk() {
    return deskState;
  },
  get panelMode() {
    return panelMode;
  },
  get preview() {
    return preview;
  },
  get dragging(): { key: string; snapped: Rect | null; returning: boolean } | null {
    return drag ? { key: drag.key, snapped: drag.held.snapped, returning: drag.held.returning } : null;
  },
  get kitDragging(): { key: string; ghost: HTMLElement } | null {
    return kit ? { key: kit.key, ghost: kit.ghost } : null;
  },
  get lastDrop() {
    return lastDrop;
  },
  get lastFrames() {
    return lastFrames;
  },
  get lastKitFrames() {
    return lastKitFrames;
  },
  layout: () => deskLayout(deskState),
};
export type KitsPage = typeof page;
