/**
 * Desk placement: a toolbar, panels and documents placed on a desk (panel columns, a top band, a work area, things
 * pinned over the view; see desk/placement.ts for the rules and their credits: Hyprland's master and dwindle, the
 * Wayland xdg-positioner, GNOME/KDE smart placement), moving by the lab's motion rules: every move settles, what
 * the pointer holds is glued to it, content is revealed rather than stretched, and the toolbar's size jumps to its
 * new place's content size while only its position settles.
 *
 * `window.__motionLab.runAll()` runs the scripted scenarios in both drop previews and returns which rules failed.
 */
import { createFrameLoop, createSettle, SETTLE_TEMPO, type FrameInfo, type Rect, type Settle } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import type { CheckResult, HeldSample, ScaleSample, TargetSample } from "@n-uf/motion/testing";
import {
  G,
  closeDoc,
  docIds,
  docKey,
  isRail,
  layoutDesk,
  LABEL_RULE,
  normalize,
  openDoc,
  panelKey,
  placeOfPanel,
  positionPopup,
  setDocLayout,
  toggleFold,
  toolbarBox,
  withoutPanel,
  withPanel,
  withShape,
  withToolbar,
  DEFAULT_SHAPE,
  isBand,
  MENU_RULE,
  type ToolbarShape,
  workArea,
  type DeskLayout,
  type DeskSpec,
  type DeskState,
  type DocLayout,
  type Side,
  type ToolbarPlace,
} from "./desk/placement";
import { framesResult, merge, motionRows, renderChecks, renderTrace, verdict, type Row, type Segment } from "./shared/checks";
import { drawRevealed, layOut, measureFrame, onTopAt as onTopIn } from "./shared/frame";
import { inside, nextFrame, overlap, same, type Point } from "./shared/geometry";
import type { LabRun } from "./shared/hooks";
import { cancelPress, trackPress } from "./shared/press";

type Tempo = keyof typeof SETTLE_TEMPO;
type DropMode = "indicator" | "snap";

const STAGE_W = 960;
const STAGE_H = 560;
const STAGE: Rect = { x: 0, y: 0, width: STAGE_W, height: STAGE_H };

const PANELS = [
  { id: 1, title: "Files", minHeight: 130, born: 1, body: "Quarterly plan<br>Meeting notes<br>Reading list<br>Travel checklist" },
  { id: 2, title: "Notes", minHeight: 100, born: 2, body: "Call back on Monday<br>Book the small room" },
  { id: 3, title: "Outline", minHeight: 110, born: 3, body: "1 Goals<br>2 Scope<br>3 Timeline<br>4 Open questions" },
  { id: 4, title: "Inspector", minHeight: 100, born: 4, body: "Size 14 KB<br>Modified today<br>Tags: plan, team" },
  { id: 5, title: "History", minHeight: 150, born: 5, body: "Opened Meeting notes<br>Renamed Budget draft<br>Moved Reading list" },
] as const;
const SPEC: DeskSpec = { stage: { width: STAGE_W, height: STAGE_H }, panels: PANELS };
const DOC_TITLES = ["Quarterly plan", "Meeting notes", "Reading list", "Travel checklist", "Budget draft", "Release notes", "Team roster", "Garden plan"];
const TOOL_ICONS = ["✎", "⌫", "↶", "↷", "⎘", "⌕", "☰", "⚙"];
const MAX_DOCS = 10;

const stage = document.getElementById("stage") as HTMLDivElement;
const hint = document.getElementById("hint") as HTMLDivElement;
const hintLabel = document.getElementById("hint-label") as HTMLDivElement;
const checksBody = document.querySelector("#checks tbody") as HTMLTableSectionElement;
const checksTitle = document.getElementById("checks-title") as HTMLHeadingElement;
const runsBody = document.querySelector("#runs tbody") as HTMLTableSectionElement;
const trace = document.getElementById("trace") as HTMLCanvasElement;
const readout = document.getElementById("readout") as HTMLParagraphElement;

/** Anything on the desk that moves: the toolbar, a panel or a document. */
interface Item {
  readonly uid: number;
  readonly key: string;
  readonly kind: "toolbar" | "panel" | "doc";
  readonly id: number;
  readonly name: string;
  readonly el: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly content: HTMLDivElement;
  readonly rect: Settle<Rect>;
  /** Where the element is laid out (its content's size); the drawn rect glides toward it. */
  target: Rect;
  readonly pop: Settle<number>;
  /** A panel's title-bar angle in radians: 0 upright, −π/2 in a left rail, +π/2 in a right one. */
  readonly rot: Settle<number>;
  closing: boolean;
  segment: Segment | null;
  runs: TargetSample[][];
}

let tempo: Tempo = "default";
let dropMode: DropMode = "indicator";
let state: DeskState;
let items: Item[] = [];
const names = new Map<number, string>();
let focusId: number | null = null;
let nextDoc = 1;
/** How the last opened documents were placed ("tiled", "free" or "cascade"), newest last. */
let opened: string[] = [];
/** The place and shape whose content size the toolbar has now. */
let toolbarSize: { place: ToolbarPlace; shape: ToolbarShape } = { place: "band-start", shape: DEFAULT_SHAPE };

const omega = (): number => SETTLE_TEMPO[tempo];
const itemOf = (key: string): Item | undefined => items.find((it) => it.key === key && !it.closing);
const toolbarItem = (): Item => itemOf("toolbar")!;

// --- the drag ----------------------------------------------------------------------------------------------------

/** A place the lifted item could land: the state with it there (normalized), its layout and the item's slot. */
interface Drop {
  readonly key: string;
  readonly zone: Zone;
  readonly state: DeskState;
  readonly layout: DeskLayout;
  readonly slot: Rect;
  readonly label: string;
  /** It lands pinned: it takes no room, so nothing has to leave its slot. */
  readonly pinned: boolean;
}
type Zone = ToolbarPlace;

let lifted: Item | null = null;
let grab: Point = { x: 0, y: 0 };
let liftSize = { width: 0, height: 0 };
let expected: Rect | null = null;
let pointer: Point = { x: 0, y: 0 };
let drop: Drop | null = null;
/** Snap mode: the drop the item is snapped into, or null while it follows the pointer. */
let snapped: Drop | null = null;
let home: { state: DeskState; rect: Rect; size: typeof toolbarSize } | null = null;
let leftHome = false;
/** The item kept above all others: the dragged one, and after the drop until it has settled. */
let raised: Item | null = null;
const SNAP_IN = 12;
/** The press on a title bar became a drag (so its click isn't a click on a rail tab). */
let dragged = false;

/** Where the others make room for the lifted item now (indicator: the marked drop; snap: the drop it is snapped into). */
const roomDrop = (): Drop | null => (!lifted ? null : dropMode === "snap" ? snapped : drop);

/**
 * The drop zones: the band along the top (its left half docks at the band's start, its right half at its end), a
 * strip at each edge, the view (pinned) everywhere else.
 */
function zoneRect(kind: Item["kind"], z: Zone): Rect {
  const edge = kind === "toolbar" ? 120 : 150;
  const top = kind === "toolbar" ? 56 : 0;
  if (z === "band-start") return { x: 0, y: 0, width: STAGE_W / 2, height: 56 };
  if (z === "band-end") return { x: STAGE_W / 2, y: 0, width: STAGE_W / 2, height: 56 };
  if (z === "left") return { x: 0, y: top, width: edge, height: STAGE_H - top };
  if (z === "right") return { x: STAGE_W - edge, y: top, width: edge, height: STAGE_H - top };
  return STAGE;
}

function zoneAt(kind: Item["kind"], p: Point): Zone {
  const order: Zone[] = kind === "toolbar" ? ["band-start", "band-end", "left", "right"] : ["left", "right"];
  return order.find((z) => inside(zoneRect(kind, z), p.x, p.y)) ?? "pinned";
}

const PLACE_LABEL: Record<Zone, string> = {
  "band-start": "Top band, left end",
  "band-end": "Top band, right end",
  left: "Left column",
  right: "Right column",
  pinned: "Pinned over the view",
};

function makeDrop(it: Item, zone: Zone, index = Infinity): Drop {
  let s: DeskState;
  if (it.kind === "toolbar") s = normalize(withToolbar(state, zone), SPEC);
  else s = normalize(withPanel(state, it.id, isBand(zone) ? "pinned" : zone, index), SPEC);
  const layout = layoutDesk(s, SPEC);
  const pinned = it.kind === "toolbar" ? s.toolbar === "pinned" : s.pinned.includes(it.id);
  let label = PLACE_LABEL[zone];
  if (it.kind === "panel" && (zone === "left" || zone === "right")) {
    // Normalising pins the newest panel, which may be another one than the dragged panel.
    const bumped = s.pinned.filter((id) => id !== it.id && !state.pinned.includes(id)).map((id) => PANELS.find((p) => p.id === id)?.title ?? `panel ${id}`);
    if (pinned) label = `${PLACE_LABEL[zone]} is full: pinned instead`;
    else label = `${PLACE_LABEL[zone]} · slot ${s[zone].indexOf(it.id)}` + (bumped.length ? ` · ${bumped.join(", ")} will pin` : "");
  }
  return { key: `${zone}:${index}`, zone, state: s, layout, slot: layout.rects.get(it.key)!, label, pinned };
}

/** Where the lifted item would land with the pointer at `p`: the zone under it, and in a column the nearest index. */
function bestDrop(it: Item, p: Point): Drop {
  // Until the pointer has left the item's own place, its own place is the drop (a toolbar at the top of a column
  // also lies in the band's zone: lifting it must not preview the band).
  if (home && !leftHome) {
    if (it.kind === "toolbar") return makeDrop(it, home.state.toolbar ?? "band-start");
    const side = placeOfPanel(home.state, it.id) ?? "pinned";
    return makeDrop(it, side, side === "pinned" ? Infinity : home.state[side].indexOf(it.id));
  }
  const zone = zoneAt(it.kind, p);
  if (it.kind !== "panel" || (zone !== "left" && zone !== "right")) return makeDrop(it, zone);
  let best: Drop | null = null;
  let bestDist = Infinity;
  for (let i = 0; i <= state[zone].length; i++) {
    const d = makeDrop(it, zone, i);
    const dy = p.y - (d.slot.y + d.slot.height / 2);
    const dist = (p.y >= d.slot.y && p.y <= d.slot.y + d.slot.height ? 0 : 1e6) + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best!;
}

function beginDrag(it: Item, px: number, py: number): void {
  if (lifted || it.closing) return;
  dragged = true;
  ensureLoop();
  const d = it.rect.value;
  grab = { x: px - d.x, y: py - d.y };
  liftSize = { width: d.width, height: d.height };
  home = { state, rect: { ...d }, size: toolbarSize };
  closeMenu();
  leftHome = false;
  snapped = null;
  drop = null;
  lifted = it;
  raised = it;
  it.el.classList.add("lifted");
  it.el.style.zIndex = Z.raised;
  // Lifted out of its place: the state no longer has it (the others close the gap unless a drop keeps it).
  state = it.kind === "toolbar" ? withToolbar(state, null) : withoutPanel(state, it.id);
  it.segment = null;
  newRun(it);
  moveDrag(px, py);
}

function moveDrag(px: number, py: number): void {
  const it = lifted;
  if (!it) return;
  pointer = { x: px, y: py };
  if (home && !inside(home.rect, px, py)) leftHome = true;
  const best = bestDrop(it, pointer);
  const before = roomDrop()?.key + "|" + roomDrop()?.zone;
  drop = best;
  if (dropMode === "snap") {
    if (snapped && snapped.zone !== best.zone) snapped = null;
    if (!snapped && inside(zoneRect(it.kind, best.zone), px, py, SNAP_IN)) snapped = best;
    else if (snapped) snapped = best;
    hideHint();
    const goal: Rect = snapped ? snapped.slot : { x: px - grab.x, y: py - grab.y, width: liftSize.width, height: liftSize.height };
    expected = null;
    if (it.kind === "toolbar") jumpToolbarSize(snapped?.state.toolbar ?? home!.size.place, home!.size.shape);
    // A panel snapped into a rail turns on its side on the way in, and upright again on the way out.
    if (it.kind === "panel" && snapped) turnPanel(it, angleIn(snapped.state, it.id));
    // Its content is laid out at the size it is going to (the frame reveals it, never stretches it).
    if (!same(it.target, goal)) {
      it.target = { ...goal };
      layOut(it, goal);
    }
    if (!same(it.rect.target, goal)) {
      const drawn = it.rect.value;
      it.segment = { id: it.uid, t0: time, from: { ...drawn }, to: { ...goal }, samples: [{ t: time, rect: { ...drawn } }] };
      episode?.segments.push(it.segment);
      it.rect.setTarget(goal);
    }
  } else {
    expected = { x: px - grab.x, y: py - grab.y, width: liftSize.width, height: liftSize.height };
    it.rect.hold(expected);
    showHint(best);
  }
  const after = roomDrop()?.key + "|" + roomDrop()?.zone;
  if (after !== before || !roomShown) {
    roomShown = true;
    relayout();
  }
}
/** This drag has laid the others out around its drop at least once. */
let roomShown = false;

/**
 * Drop the lifted item. `cancel` (Escape, pointercancel), or a drag whose pointer never left the item's own place,
 * puts the whole desk back as it was; otherwise it lands where the drop says.
 */
function endDrag(cancel = false): void {
  const it = lifted;
  if (!it) return;
  const back = home && (cancel || !leftHome) ? home : null;
  state = back ? back.state : (drop ?? makeDrop(it, "pinned")).state;
  lifted = null;
  expected = null;
  drop = null;
  snapped = null;
  home = null;
  roomShown = false;
  hideHint();
  it.el.classList.remove("lifted");
  newRun(it);
  // It stays raised until its drop settle ends.
  relayout();
}

function onGrip(it: Item, e: PointerEvent): void {
  trackPress(e, {
    point: stagePoint,
    lifted: () => lifted === it,
    begin: (start) => beginDrag(it, start.x, start.y),
    move: (q) => moveDrag(q.x, q.y),
    end: (cancel) => endDrag(cancel),
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu) closeMenu(true);
  else if (e.key === "Escape" && lifted) {
    cancelPress();
    endDrag(true);
  }
});

function stagePoint(e: PointerEvent): Point {
  const r = stage.getBoundingClientRect();
  // The same scale as measureFrame (shared/frame): the stage's border box is STAGE_W wide.
  const k = STAGE_W / r.width;
  return { x: (e.clientX - r.left - stage.clientLeft) * k, y: (e.clientY - r.top - stage.clientTop) * k };
}

// --- the drop indicator and its label ----------------------------------------------------------------------------

/** The indicator outlines the drop's slot; its label is placed by the xdg-positioner rule (data-how says how). */
function showHint(d: Drop): void {
  hint.hidden = false;
  Object.assign(hint.style, { left: `${d.slot.x}px`, top: `${d.slot.y}px`, width: `${d.slot.width}px`, height: `${d.slot.height}px` });
  hintLabel.hidden = false;
  if (hintLabel.textContent !== d.label) hintLabel.textContent = d.label;
  hintLabel.style.width = "";
  const size = { width: hintLabel.offsetWidth, height: hintLabel.offsetHeight };
  const placed = positionPopup(d.slot, size, STAGE, LABEL_RULE);
  const how = [placed.flipped.y ? "flipped up" : "", placed.flipped.x ? "flipped left" : "", placed.slid.x || placed.slid.y ? "slid" : "", placed.resized ? "resized" : ""].filter(Boolean).join(", ");
  Object.assign(hintLabel.style, { left: `${placed.rect.x}px`, top: `${placed.rect.y}px`, width: `${placed.rect.width}px` });
  hintLabel.dataset.how = how || "as anchored";
}

function hideHint(): void {
  hint.hidden = true;
  hintLabel.hidden = true;
}

// --- items -------------------------------------------------------------------------------------------------------

const Z = { tiled: "1", floating: "2", column: "3", toolbar: "4", pinned: "6", raised: "10" } as const;

function makeItem(kind: Item["kind"], id: number, key: string, name: string, html: string, at: Rect): Item {
  const el = document.createElement("div");
  el.className = `win ${kind}`;
  el.dataset.key = key;
  const frame = document.createElement("div");
  frame.className = "frame";
  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = html;
  el.append(frame, content);
  stage.append(el);
  const uid = kind === "toolbar" ? 100 : kind === "panel" ? 200 + id : id;
  names.set(uid, name);
  const it: Item = {
    uid,
    key,
    kind,
    id,
    name,
    el,
    frame,
    content,
    rect: createSettle(at, { omega: omega() }),
    target: { ...at },
    pop: createSettle(1, { omega: omega(), restDelta: 0.001 }),
    rot: createSettle(0, { omega: omega(), restDelta: 0.001 }),
    closing: false,
    segment: null,
    runs: [[]],
  };
  layOut(it, at);
  items.push(it);
  draw(it);
  return it;
}

function makeToolbar(at: Rect): Item {
  const cells = [
    `<div class="tb-cell tb-grip" role="button" tabindex="0" aria-haspopup="menu" aria-label="Toolbar grip" title="Drag to move; double-click to collapse; right-click for its menu">⠿</div>`, ...TOOL_ICONS.map((c) => `<button type="button" class="tb-cell" tabindex="-1">${c}</button>`)];
  const it = makeItem("toolbar", 0, "toolbar", "toolbar", `<div class="tb">${cells.join("")}</div>`, at);
  const grip = it.content.querySelector<HTMLElement>(".tb-grip")!;
  grip.addEventListener("pointerdown", (e) => onGrip(it, e as PointerEvent));
  // A double-click (two clicks under the drag threshold: trackPress lifts nothing) collapses or expands it.
  grip.addEventListener("dblclick", (e) => {
    e.preventDefault();
    if (!lifted) doCollapse();
  });
  // Right-click (or the context-menu key) opens the toolbar's own menu instead of the browser's, on the grip only.
  grip.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openMenu();
  });
  // From the keyboard: Enter, Space or ArrowDown on the focused grip opens the same menu.
  grip.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowDown") return;
    e.preventDefault();
    openMenu();
  });
  return it;
}

function makePanel(p: (typeof PANELS)[number], at: Rect): Item {
  const html = `<div class="title"><span>${p.title}</span><button type="button" class="fold" title="Fold to the title bar">▾</button></div><div class="body">${p.body}</div>`;
  const it = makeItem("panel", p.id, panelKey(p.id), p.title, html, at);
  const fold = it.content.querySelector<HTMLButtonElement>(".fold")!;
  fold.addEventListener("pointerdown", (e) => {
    // The press is the fold button's own: no title-bar press, so no drag, and no stale "was dragged" from before.
    dragged = false;
    e.stopPropagation();
  });
  fold.addEventListener("click", (e) => {
    // Folding the last open panel turns the column into a rail: the click must not bubble to the title bar's
    // handler, which would read the new rail's tab as clicked and unfold it again.
    e.stopPropagation();
    doFold(p.id);
  });
  const title = it.content.querySelector(".title")!;
  title.addEventListener("pointerdown", (e) => {
    dragged = false;
    onGrip(it, e as PointerEvent);
  });
  // A click on a rail tab unfolds that panel (the column returns to its width).
  title.addEventListener("click", () => {
    const side = placeOfPanel(state, p.id);
    if (!dragged && (side === "left" || side === "right") && isRail(state, side)) doFold(p.id);
  });
  return it;
}

function makeDoc(id: number, at: Rect): Item {
  const title = DOC_TITLES[(id - 1) % DOC_TITLES.length]!;
  const html = `<div class="title">Document ${id}</div><div class="body">${title}<br>Last edited today · 3 pages</div>`;
  const it = makeItem("doc", id, docKey(id), `document ${id}`, html, at);
  it.el.addEventListener("pointerdown", () => {
    if (!it.closing) focus(id);
  });
  return it;
}

function focus(id: number | null): void {
  focusId = id;
  for (const it of items) it.el.classList.toggle("focused", it.kind === "doc" && it.id === focusId);
}

// --- motion ------------------------------------------------------------------------------------------------------

function setTarget(it: Item, to: Rect): void {
  if (same(it.target, to) && same(it.rect.target, to)) return;
  ensureLoop();
  const drawn = it.rect.value;
  it.target = { ...to };
  layOut(it, to);
  it.segment = { id: it.uid, t0: time, from: { ...drawn }, to: { ...to }, samples: [{ t: time, rect: { ...drawn } }] };
  episode?.segments.push(it.segment);
  it.rect.configure({ omega: omega() });
  it.rect.setTarget(to);
}

/**
 * The toolbar's size jumps to its new place's content size (its buttons re-lay out at once); only its position
 * settles. A new run starts, so the jump isn't read as a jump in a glide.
 */
function jumpToolbarSize(place: ToolbarPlace, shape: ToolbarShape): void {
  const it = toolbarItem();
  const box = toolbarBox(place, shape);
  toolbarSize = { place, shape };
  // Collapsed shows only the grip; laid out at once with the size.
  it.el.classList.toggle("collapsed", shape.collapsed);
  const d = it.rect.value;
  if (Math.abs(d.width - box.width) < 0.01 && Math.abs(d.height - box.height) < 0.01) return;
  ensureLoop();
  it.rect.jumpTo({ x: d.x, y: d.y, width: box.width, height: box.height });
  // The move it was in ends here (its size is no longer between that move's start and end).
  it.segment = null;
  it.target = { x: it.target.x, y: it.target.y, width: box.width, height: box.height };
  layOut(it, it.target);
  newRun(it);
}

/** Every item glides to its place in the layout (the drop's, while the others make room for a lifted item). */
function relayout(): void {
  const room = roomDrop();
  const s = room?.state ?? state;
  const layout = room?.layout ?? layoutDesk(state, SPEC);
  for (const it of items) {
    if (it.closing) continue;
    const to = layout.rects.get(it.key);
    if (it === lifted) continue;
    if (!to) continue;
    if (it.kind === "toolbar") jumpToolbarSize(s.toolbar ?? toolbarSize.place, s.toolbarShape);
    setTarget(it, to);
    it.el.style.zIndex = it === raised ? Z.raised : zOf(it, s);
    if (it.kind === "panel") {
      const folded = s.folded.includes(it.id);
      it.el.classList.toggle("folded", folded);
      it.content.querySelector(".fold")!.textContent = folded ? "▸" : "▾";
      turnPanel(it, angleIn(s, it.id));
    }
  }
  focus(focusId);
  updateReadout();
}

const QUARTER = Math.PI / 2;

/** The angle a panel's title bar has in `s`: on its side in a rail (−90° on the left, +90° on the right), else upright. */
function angleIn(s: DeskState, id: number): number {
  const side = s.left.includes(id) ? "left" : s.right.includes(id) ? "right" : null;
  return side && isRail(s, side) ? (side === "left" ? -QUARTER : QUARTER) : 0;
}

/** Turn a panel's title bar to `angle`: the rotation settles (a rigid turn, never a stretch). */
function turnPanel(it: Item, angle: number): void {
  it.el.classList.toggle("rail", angle !== 0);
  if (it.rot.target === angle) return;
  ensureLoop();
  it.rot.configure({ omega: omega() });
  it.rot.setTarget(angle);
}

/**
 * A panel's title bar is laid out at a column's width whatever the panel's size, and turned about its top-left
 * corner by the settled angle (translated so it stays on its tab): rotate only, the content is never stretched.
 * What the turn would show of the body fades with it.
 */
function drawTurn(it: Item): void {
  const a = it.rot.value;
  const f = Math.min(1, Math.abs(a) / QUARTER);
  const title = it.content.firstElementChild as HTMLElement;
  const body = it.content.lastElementChild as HTMLElement;
  title.style.width = `${Math.max(it.target.width, G.column)}px`;
  title.style.transform = f === 0 ? "" : a < 0 ? `translate(0px, ${G.railTab * f}px) rotate(${a}rad)` : `translate(${G.title * f}px, 0px) rotate(${a}rad)`;
  body.style.opacity = String(1 - f);
  body.style.visibility = f > 0.999 ? "hidden" : "visible";
}

function zOf(it: Item, s: DeskState): string {
  if (it.kind === "doc") return s.floating.some((f) => f.id === it.id) ? Z.floating : Z.tiled;
  if (it.kind === "toolbar") return s.toolbar === "pinned" ? Z.pinned : Z.toolbar;
  return s.pinned.includes(it.id) ? Z.pinned : Z.column;
}

function draw(it: Item): void {
  drawRevealed(it, it.rect.value, it.target, it.pop.value);
  if (it.kind === "panel") drawTurn(it);
}

// --- actions -----------------------------------------------------------------------------------------------------

function doFold(id: number): void {
  if (lifted) return;
  state = normalize(toggleFold(state, id), SPEC);
  relayout();
}

function doOpen(): void {
  if (lifted || docIds(state).length >= MAX_DOCS) return;
  const id = nextDoc++;
  const r = openDoc(state, SPEC, id, focusId);
  state = normalize(r.state, SPEC);
  opened.push(r.how);
  const at = layoutDesk(state, SPEC).rects.get(docKey(id))!;
  const it = makeDoc(id, at);
  it.pop.jumpTo(0);
  ensureLoop();
  newRun(it);
  it.pop.setTarget(1);
  focus(id);
  relayout();
}

function doClose(): void {
  if (lifted) return;
  const ids = docIds(state);
  const id = focusId !== null && ids.includes(focusId) ? focusId : ids.at(-1);
  if (id === undefined) return;
  const it = itemOf(docKey(id))!;
  ensureLoop();
  it.closing = true;
  it.pop.setTarget(0);
  state = normalize(closeDoc(state, id), SPEC);
  focus(docIds(state).at(-1) ?? null);
  relayout();
}

function doToolbar(place: ToolbarPlace): void {
  if (lifted) return;
  state = normalize(withToolbar(state, place), SPEC);
  relayout();
}

/** A new toolbar shape (orientation or collapsed): its size jumps, its position settles, its place resizes. */
function doShape(shape: Partial<ToolbarShape>): void {
  if (lifted) return;
  state = normalize(withShape(state, shape), SPEC);
  relayout();
}

const doCollapse = (): void => doShape({ collapsed: !state.toolbarShape.collapsed });

// --- the toolbar's menu (right-click the grip) -------------------------------------------------------------------

let menu: HTMLDivElement | null = null;

function closeMenu(focusGrip = false): void {
  const m = menu;
  if (!m) return;
  // Forget it first: removing a focused menu item can fire focusout, which closes the menu.
  menu = null;
  m.remove();
  if (focusGrip) itemOf("toolbar")?.content.querySelector<HTMLElement>(".tb-grip")?.focus();
}

/**
 * Open the toolbar's menu beside the grip, placed by the xdg-positioner rule (anchored at the grip, flipped, then
 * slid to stay inside the stage): Horizontal / Vertical (radio), then Collapse or Expand.
 */
function openMenu(): void {
  closeMenu();
  if (lifted) return;
  const tb = toolbarItem();
  const shape = state.toolbarShape;
  const m = document.createElement("div");
  m.className = "desk-menu";
  m.setAttribute("role", "menu");
  m.setAttribute("aria-label", "Toolbar");
  const entries: { label: string; role: string; checked?: boolean; act: () => void }[] = [
    { label: "Horizontal", role: "menuitemradio", checked: shape.orientation === "horizontal", act: () => doShape({ orientation: "horizontal" }) },
    { label: "Vertical", role: "menuitemradio", checked: shape.orientation === "vertical", act: () => doShape({ orientation: "vertical" }) },
    { label: shape.collapsed ? "Expand" : "Collapse", role: "menuitem", act: doCollapse },
  ];
  entries.forEach((e, i) => {
    if (i === 2) {
      const sep = document.createElement("div");
      sep.setAttribute("role", "separator");
      sep.className = "sep";
      m.append(sep);
    }
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", e.role);
    b.tabIndex = -1;
    if (e.checked !== undefined) b.setAttribute("aria-checked", String(e.checked));
    b.textContent = e.label;
    b.addEventListener("click", () => {
      closeMenu(true);
      e.act();
    });
    m.append(b);
  });
  m.addEventListener("keydown", (ev) => {
    const buttons = [...m.querySelectorAll<HTMLButtonElement>("button")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number): void => buttons[(i + buttons.length) % buttons.length]!.focus();
    if (ev.key === "ArrowDown") go(at + 1);
    else if (ev.key === "ArrowUp") go(at - 1);
    else if (ev.key === "Home") go(0);
    else if (ev.key === "End") go(buttons.length - 1);
    else if (ev.key === "Escape") closeMenu(true);
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  });
  // Focus leaving the menu (Tab, or anything else taking it) closes it. A press inside it is a choice, not leaving:
  // some browsers don't focus a pressed button, which would otherwise close the menu before its click.
  let pressing = false;
  m.addEventListener("pointerdown", () => {
    pressing = true;
    setTimeout(() => (pressing = false), 500);
  });
  m.addEventListener("focusout", (ev) => {
    const to = ev.relatedTarget as Node | null;
    if (!pressing && !(to && m.contains(to))) closeMenu();
  });
  stage.append(m);
  menu = m;
  // Anchored at the grip as drawn now.
  const d = tb.rect.value;
  const grip: Rect = { x: d.x + G.toolbarPad, y: d.y + G.toolbarPad, width: G.button, height: G.button };
  const placed = positionPopup(grip, { width: m.offsetWidth, height: m.offsetHeight }, STAGE, MENU_RULE);
  Object.assign(m.style, { left: `${placed.rect.x}px`, top: `${placed.rect.y}px`, width: `${placed.rect.width}px`, maxHeight: `${placed.rect.height}px` });
  m.dataset.how = [placed.flipped.x ? "flipped left" : "", placed.flipped.y ? "flipped up" : "", placed.slid.x || placed.slid.y ? "slid" : ""].filter(Boolean).join(", ") || "as anchored";
  (m.querySelector<HTMLButtonElement>("[aria-checked=true]") ?? m.querySelector("button"))!.focus();
}

// An outside press closes the menu (a press inside it is a choice).
document.addEventListener(
  "pointerdown",
  (e) => {
    if (menu && !menu.contains(e.target as Node)) closeMenu();
  },
  true,
);

function setDocs(mode: DocLayout): void {
  // Mid-drag the layout does not change: the radio keeps showing the state's mode.
  const shown = lifted ? state.docLayout : mode;
  (document.querySelector(`input[name=docs][value=${shown}]`) as HTMLInputElement).checked = true;
  if (lifted) return;
  state = setDocLayout(state, SPEC, mode);
  relayout();
}

function updateReadout(): void {
  const s = state;
  const work = workArea(s, SPEC);
  readout.textContent =
    `Minimum document ${G.docMin.width} × ${G.docMin.height} px; panel minimum heights ${PANELS.map((p) => `${p.title} ${p.minHeight}`).join(", ")}. ` +
    `Work area ${Math.round(work.width)} × ${Math.round(work.height)}; documents: ${s.tiled.length} tiled, ${s.floating.length} floating` +
    (opened.length ? `; last opened: ${opened.at(-1)}.` : ".");
}

/** The initial desk: the toolbar in the band, two panels left, three right, two documents. */
function reset(docs: DocLayout = docLayout(), count = 2, patch: Partial<DeskState> = {}): void {
  for (const it of items) it.el.remove();
  items = [];
  lifted = null;
  raised = null;
  drop = null;
  snapped = null;
  home = null;
  hideHint();
  nextDoc = 1;
  opened = [];
  closeMenu();
  state = normalize({ toolbar: "band-start", toolbarShape: DEFAULT_SHAPE, left: [1, 3], right: [2, 4, 5], pinned: [], autoPinned: [], folded: [], docLayout: docs, tiled: [], tree: null, floating: [], ...patch }, SPEC);
  for (let i = 0; i < count; i++) {
    const id = nextDoc++;
    const r = openDoc(state, SPEC, id, focusId);
    state = normalize(r.state, SPEC);
  }
  const layout = layoutDesk(state, SPEC);
  toolbarSize = { place: state.toolbar ?? "band-start", shape: state.toolbarShape };
  makeToolbar(layout.rects.get("toolbar")!).el.classList.toggle("collapsed", state.toolbarShape.collapsed);
  for (const p of PANELS) makePanel(p, layout.rects.get(panelKey(p.id))!);
  for (const id of docIds(state)) makeDoc(id, layout.rects.get(docKey(id))!);
  focus(docIds(state).at(-1) ?? null);
  for (const it of items) {
    it.el.style.zIndex = zOf(it, state);
    if (it.kind === "panel") {
      it.el.classList.toggle("folded", state.folded.includes(it.id));
      it.content.querySelector(".fold")!.textContent = state.folded.includes(it.id) ? "▸" : "▾";
      // A rail from the start is already turned.
      const angle = angleIn(state, it.id);
      it.rot.jumpTo(angle);
      it.el.classList.toggle("rail", angle !== 0);
      draw(it);
    }
  }
  lastRows = [];
  updateReadout();
}

// --- the frame ---------------------------------------------------------------------------------------------------

let time = 0;
let episode: {
  t0: number;
  segments: Segment[];
  runs: TargetSample[][];
  scale: ScaleSample[];
  held: HeldSample[];
  onTop: (string | null)[];
  room: (string | null)[];
  toolbarSize: (string | null)[];
  minSize: (string | null)[];
  label: (string | null)[];
  rigid: (string | null)[];
  pops: number;
  drop: DropMode;
} | null = null;
let idleWaiters: Array<() => void> = [];
const loop = createFrameLoop({ clock: createBrowserClock() });
let running = false;

function startEpisode(): void {
  if (episode) return;
  episode = { t0: time, segments: [], runs: [], scale: [], held: [], onTop: [], room: [], toolbarSize: [], minSize: [], label: [], rigid: [], pops: 0, drop: dropMode };
  for (const it of items) {
    it.runs = [[]];
    episode.runs.push(...it.runs);
  }
}

function newRun(it: Item): void {
  const run: TargetSample[] = [];
  it.runs.push(run);
  episode?.runs.push(run);
}

function ensureLoop(): void {
  startEpisode();
  if (running) return;
  running = true;
  loop.repeat("update", tick);
}

const measure = (it: Item): { scale: ScaleSample; frame: Rect } => measureFrame(stage, STAGE_W, it, time);

/** A panel's title bar as drawn is a rigid turn (a rotation and a translation: no scale, no skew), read back from the DOM. */
function rigidTurn(it: Item): string | null {
  const css = getComputedStyle(it.content.firstElementChild as HTMLElement).transform;
  const m = css && css !== "none" ? new DOMMatrixReadOnly(css) : new DOMMatrixReadOnly();
  const rigid = Math.abs(m.a - m.d) < 1e-3 && Math.abs(m.b + m.c) < 1e-3 && Math.abs(m.a * m.d - m.b * m.c - 1) < 1e-3;
  return rigid ? null : `t=${Math.round(time)} ${it.name}'s title bar is drawn with matrix(${[m.a, m.b, m.c, m.d].map((v) => v.toFixed(3)).join(", ")}), not a rotation`;
}

/** Stage rect of an element, from the DOM. */
function stageRectOf(el: Element): Rect {
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const k = STAGE_W / s.width;
  return { x: (r.left - s.left - stage.clientLeft) * k, y: (r.top - s.top - stage.clientTop) * k, width: r.width * k, height: r.height * k };
}

function tick(frame: FrameInfo): boolean {
  const dt = frame.delta;
  time += dt;
  let moving = lifted !== null;
  for (const it of [...items]) {
    if (it.rect.step(dt)) moving = true;
    if (it.pop.step(dt)) moving = true;
    if (it.rot.step(dt)) moving = true;
    draw(it);
    if (!episode) continue;
    const seen = measure(it);
    episode.scale.push(seen.scale);
    if (it.kind === "panel") episode.rigid.push(rigidTurn(it));
    if (!it.pop.settled) episode.pops++;
    const drawn = it.rect.value;
    if (it === lifted && dropMode === "indicator") {
      if (expected) episode.held.push({ t: time, rect: seen.frame, expected });
    } else {
      it.runs.at(-1)!.push({ t: time, rect: drawn, target: it.rect.target });
      it.segment?.samples.push({ t: time, rect: drawn });
    }
    // Never below the minimum: a document (drawn and laid out), a panel in a column (laid out, unless folded).
    if (it.kind === "doc" && !it.closing && it.pop.settled) {
      const small = [drawn, it.target].find((r) => r.width < G.docMin.width - 0.5 || r.height < G.docMin.height - 0.5);
      episode.minSize.push(small ? `t=${Math.round(time)} ${it.name} at ${Math.round(small.width)} × ${Math.round(small.height)}` : null);
    }
    if (it.kind === "panel" && it !== lifted) {
      const s = roomDrop()?.state ?? state;
      const inColumn = s.left.includes(it.id) || s.right.includes(it.id);
      const min = PANELS.find((p) => p.id === it.id)!.minHeight;
      if (inColumn && !s.folded.includes(it.id)) episode.minSize.push(it.target.height < min - 0.5 ? `t=${Math.round(time)} ${it.name} laid out ${Math.round(it.target.height)} px tall (min ${min})` : null);
    }
    if (it.closing && it.pop.settled) {
      it.el.remove();
      items = items.filter((x) => x !== it);
    }
  }
  if (episode) {
    // The toolbar keeps its place's and shape's content size on every frame: its frame is that size, it shows
    // that many cells (just the grip when collapsed), in that many rows and that many across.
    const tb = toolbarItem();
    const { place, shape } = toolbarSize;
    const box = toolbarBox(place, shape);
    const what = `${place}, ${shape.orientation}${shape.collapsed ? ", collapsed" : ""}`;
    const f = measure(tb).frame;
    const shown = [...tb.content.querySelectorAll<HTMLElement>(".tb-cell")].filter((c) => c.offsetParent !== null);
    const tops = new Set(shown.map((c) => c.offsetTop));
    const lefts = new Set(shown.map((c) => c.offsetLeft));
    const off = Math.max(Math.abs(f.width - box.width), Math.abs(f.height - box.height));
    episode.toolbarSize.push(
      off > 0.5
        ? `t=${Math.round(time)} toolbar drawn ${Math.round(f.width)} × ${Math.round(f.height)}, its ${what} content is ${box.width} × ${box.height}`
        : shown.length !== box.cells || tops.size !== box.rows || lefts.size !== Math.min(box.perRow, box.cells)
          ? `t=${Math.round(time)} toolbar shows ${shown.length} cells in ${tops.size} rows × ${lefts.size}, ${what} needs ${box.cells} in ${box.rows} × ${Math.min(box.perRow, box.cells)}`
          : null,
    );
    // The drop label stays inside the stage (the positioner's flip and slide).
    if (!hintLabel.hidden) {
      const r = stageRectOf(hintLabel);
      const out = r.x < -0.5 || r.y < -0.5 || r.x + r.width > STAGE_W + 0.5 || r.y + r.height > STAGE_H + 0.5;
      episode.label.push(out ? `t=${Math.round(time)} label at (${Math.round(r.x)}, ${Math.round(r.y)}) ${Math.round(r.width)} × ${Math.round(r.height)} leaves the stage` : null);
    }
  }
  // Room: once the others have settled, none of the ones that take room overlaps the slot kept for the lifted item.
  const room = roomDrop();
  if (lifted && room && !room.pinned && episode) {
    const s = room.state;
    const takesRoom = (it: Item): boolean =>
      it !== lifted &&
      !it.closing &&
      (it.kind === "doc" || (it.kind === "toolbar" ? s.toolbar !== "pinned" : !s.pinned.includes(it.id)));
    const others = items.filter(takesRoom);
    const blocking = others.every((o) => o.rect.settled) ? others.filter((o) => overlap(o.rect.value, room.slot) > 1) : null;
    if (blocking) episode.room.push(blocking.length ? `t=${Math.round(time)} ${blocking.map((o) => o.name).join(", ")} still in the slot kept for ${lifted.name}` : null);
  }
  const r = raised;
  if (r && episode) {
    const fr = measure(r).frame;
    const at = r === lifted && inside(fr, pointer.x, pointer.y) ? pointer : { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 };
    const v = onTopIn(stage, STAGE_W, { el: r.el, name: r.name }, at, fr, time, (top) => {
      const key = top.closest<HTMLElement>(".win")?.dataset.key;
      return key ? (items.find((x) => x.key === key)?.name ?? key) : null;
    });
    if (v !== undefined) episode.onTop.push(v);
    if (r !== lifted && r.rect.settled) {
      raised = null;
      r.el.style.zIndex = zOf(r, state);
    }
  }
  if (moving) return true;
  running = false;
  endEpisode();
  return false;
}

// --- checks ------------------------------------------------------------------------------------------------------

let lastRows: Row[] = [];
/** While a scenario runs: the rows of each of its moves. */
let collecting: Row[][] | null = null;

function endEpisode(): void {
  const ep = episode;
  episode = null;
  if (!ep) return;
  const { rows, segments } = motionRows(ep, omega(), (uid) => names.get(uid) ?? `item ${uid}`);
  lastRows = [
    ...rows,
    { name: "Toolbar keeps its content size per place", result: ep.toolbarSize.length > 0 ? framesResult(ep.toolbarSize) : null },
    { name: "Never below min size", result: ep.minSize.length > 0 ? framesResult(ep.minSize) : null },
    { name: "Drop label stays inside the stage (flip, slide)", result: ep.label.length > 0 ? framesResult(ep.label) : null },
    { name: "Rail tab turns rigidly (rotation only)", result: ep.rigid.length > 0 ? framesResult(ep.rigid) : null },
  ];
  collecting?.push(lastRows);
  checksTitle.textContent = `Checks of the last move · drop preview: ${ep.drop === "snap" ? "snap to slot" : "drop indicator"}`;
  renderChecks(checksBody, lastRows);
  renderTrace(trace, ep.t0, segments);
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const resolve of waiters) resolve();
}

/** The rows of several moves as one: a rule fails if it failed in any move, and is exercised if it was in any. */
function mergeRows(all: readonly Row[][]): Row[] {
  const first = all[0] ?? [];
  return first.map((row, i) => {
    const results = all.map((rows) => rows[i]!.result).filter((r): r is CheckResult => r !== null);
    const info = all.map((rows) => rows[i]!.info).filter(Boolean).at(-1);
    return { name: row.name, result: results.length ? merge(results) : null, ...(info ? { info } : {}) };
  });
}

// --- scenarios ---------------------------------------------------------------------------------------------------

const idle = (): Promise<void> => (running || episode ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());

const gripOf = (it: Item): Point => {
  const d = it.rect.value;
  return it.kind === "toolbar" ? { x: d.x + G.toolbarPad + G.button / 2, y: d.y + G.toolbarPad + G.button / 2 } : { x: d.x + 40, y: d.y + 13 };
};

/** A scripted drag: lift at `it`'s grip, glide the pointer to `to()` (found after the lift), release or Escape. */
async function scriptedDrag(it: Item, to: () => Point, opts: { escapeAt?: number } = {}): Promise<void> {
  const from = gripOf(it);
  beginDrag(it, from.x, from.y);
  const end = to();
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    await nextFrame();
    const f = i / steps;
    const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
    moveDrag(from.x + (end.x - from.x) * e, from.y + (end.y - from.y) * e);
    if (opts.escapeAt === i) {
      cancelPress();
      endDrag(true);
      return;
    }
  }
  // Hold still until the others have made room (at most half a second), then release.
  for (let i = 0; i < 30 && items.some((o) => o !== it && !o.rect.settled); i++) await nextFrame();
  await nextFrame();
  endDrag();
}

const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const ZONE_POINT: Record<Zone, Point> = { "band-start": { x: 200, y: 26 }, "band-end": { x: STAGE_W - 200, y: 26 }, left: { x: 60, y: 320 }, right: { x: STAGE_W - 60, y: 320 }, pinned: { x: STAGE_W / 2, y: 300 } };
/** Where to point to dock the lifted panel at `index` of `side`: the centre of that drop's slot. */
const slotPoint = (it: Item, side: Side, index: number) => (): Point => centre(makeDrop(it, side, index).slot);

type Expect = (ok: boolean, failure: string) => void;
interface Scenario {
  readonly setup?: () => void;
  readonly play: (expect: Expect) => Promise<void>;
}

const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;

async function toolbarTo(place: ToolbarPlace, expect: Expect): Promise<void> {
  await scriptedDrag(toolbarItem(), () => ZONE_POINT[place]);
  await idle();
  const tb = toolbarItem();
  const box = toolbarBox(place, state.toolbarShape);
  expect(state.toolbar === place, `the toolbar is in ${state.toolbar}, not ${place}`);
  expect(Math.abs(tb.rect.value.width - box.width) < 0.5 && Math.abs(tb.rect.value.height - box.height) < 0.5, `the toolbar is ${Math.round(tb.rect.value.width)} × ${Math.round(tb.rect.value.height)} in ${place}, its content is ${box.width} × ${box.height}`);
  expect(sameRect(tb.rect.value, layoutDesk(state, SPEC).rects.get("toolbar")!), `the toolbar didn't settle in its ${place} place`);
}

const panelItem = (id: number): Item => itemOf(panelKey(id))!;
const heightOf = (id: number): number => layoutDesk(state, SPEC).rects.get(panelKey(id))!.height;

const SCENARIOS: Record<string, Scenario> = {
  "toolbar: band → left column → pinned → band": {
    play: async (expect) => {
      const work0 = workArea(state, SPEC);
      await toolbarTo("left", expect);
      expect(workArea(state, SPEC).height > work0.height, "the work area didn't grow when the band emptied");
      await toolbarTo("pinned", expect);
      await toolbarTo("band-start", expect);
      expect(sameRect(workArea(state, SPEC), work0), "the work area isn't back to its size with the toolbar in the band");
    },
  },
  "fold and unfold a panel": {
    play: async (expect) => {
      const outline = heightOf(3);
      doFold(1);
      await idle();
      expect(heightOf(1) === G.title, `Files folded to ${heightOf(1)} px, not its title bar`);
      expect(heightOf(3) > outline, "Outline didn't take the room Files gave up");
      expect(sameRect(panelItem(3).rect.value, layoutDesk(state, SPEC).rects.get(panelKey(3))!), "Outline didn't settle");
      doFold(1);
      await idle();
      expect(Math.abs(heightOf(3) - outline) < 0.5, "unfolding didn't give Outline its old height back");
    },
  },
  "fold a whole column into a rail, unfold a tab": {
    play: async (expect) => {
      const work0 = workArea(state, SPEC);
      doFold(1);
      await idle();
      expect(!isRail(state, "left"), "the left column is a rail with Outline still open");
      doFold(3);
      await idle();
      expect(isRail(state, "left"), "the left column isn't a rail with every panel folded");
      const files = panelItem(1);
      expect(Math.abs(files.rect.value.width - G.rail) < 0.5, `the rail is ${Math.round(files.rect.value.width)} px wide, not ${G.rail}`);
      expect(Math.abs(workArea(state, SPEC).width - (work0.width + G.column - G.rail)) < 0.5, "the work area didn't take the room the column gave up");
      expect(Math.abs(files.rot.value + QUARTER) < 0.001 && Math.abs(panelItem(3).rot.value + QUARTER) < 0.001, "the left tabs aren't at −90°");
      expect(Math.abs(panelItem(2).rot.value) < 0.001, "a panel of the other column is turned");
      for (const it of items.filter((x) => x.kind === "doc")) expect(sameRect(it.rect.value, layoutDesk(state, SPEC).rects.get(it.key)!), `${it.name} didn't settle in the work area`);
      // A click on a tab unfolds it: the column is a column again.
      doFold(3);
      await idle();
      expect(!isRail(state, "left"), "the left column is still a rail with Outline open");
      expect(Math.abs(panelItem(1).rect.value.width - G.column) < 0.5, "the column didn't return to its width");
      expect(Math.abs(panelItem(1).rot.value) < 0.001 && Math.abs(panelItem(3).rot.value) < 0.001, "the title bars aren't upright again");
      expect(Math.abs(workArea(state, SPEC).width - work0.width) < 0.5, "the work area isn't back to its size");
    },
  },
  "fold the last open panel by a click": {
    play: async (expect) => {
      doFold(1);
      await idle();
      expect(!isRail(state, "left"), "the left column is a rail with Outline still open");
      // A real click on Outline's fold button: the press, then the click (which bubbles up to the title bar).
      const button = panelItem(3).content.querySelector<HTMLButtonElement>(".fold")!;
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true }));
      button.click();
      await idle();
      expect(isRail(state, "left"), "the left column didn't become a rail when its last open panel was folded by a click");
      expect(state.folded.includes(3), "Outline was unfolded again by the same click");
      expect(Math.abs(panelItem(3).rect.value.width - G.rail) < 0.5, `the rail is ${Math.round(panelItem(3).rect.value.width)} px wide, not ${G.rail}`);
    },
  },
  "fold the right column into a rail": {
    play: async (expect) => {
      for (const id of [2, 4, 5]) doFold(id);
      await idle();
      expect(isRail(state, "right"), "the right column isn't a rail");
      expect([2, 4, 5].every((id) => Math.abs(panelItem(id).rot.value - QUARTER) < 0.001), "the right tabs aren't at +90°");
      const r = panelItem(2).rect.value;
      expect(Math.abs(r.width - G.rail) < 0.5 && Math.abs(r.x + r.width - (STAGE_W - G.gap)) < 0.5, "the right rail isn't one title bar wide at the edge");
    },
  },
  "dock a panel into a rail": {
    setup: () => reset(docLayout(), 2, { folded: [1, 3] }),
    play: async (expect) => {
      expect(isRail(state, "left"), "the left column didn't start as a rail");
      const notes = panelItem(2);
      await scriptedDrag(notes, slotPoint(notes, "left", 0));
      await idle();
      expect(state.left[0] === 2 && !isRail(state, "left"), `Notes is at ${state.left.indexOf(2)} and the left column is ${isRail(state, "left") ? "still a rail" : "a column"}`);
      expect(Math.abs(panelItem(1).rect.value.width - G.column) < 0.5 && Math.abs(panelItem(1).rot.value) < 0.001, "the rail didn't turn back into a column");
    },
  },
  "dock a panel at index 0, then at index 2": {
    play: async (expect) => {
      const notes = panelItem(2);
      await scriptedDrag(notes, slotPoint(notes, "left", 0));
      await idle();
      expect(state.left[0] === 2, `Notes is at ${state.left.indexOf(2)} of the left column, not 0`);
      const inspector = panelItem(4);
      await scriptedDrag(inspector, slotPoint(inspector, "left", 2));
      await idle();
      expect(state.left[2] === 4, `Inspector is at ${state.left.indexOf(4)} of the left column, not 2`);
      expect(state.left.join() === "2,1,4,3", `left column is ${state.left.join()}`);
    },
  },
  "move a panel between columns": {
    play: async (expect) => {
      const outline = panelItem(3);
      await scriptedDrag(outline, slotPoint(outline, "right", 3));
      await idle();
      expect(placeOfPanel(state, 3) === "right" && state.right.at(-1) === 3, `Outline is in ${placeOfPanel(state, 3)} at ${state.right.indexOf(3)}`);
      expect(state.left.join() === "1", `left column is ${state.left.join()}`);
    },
  },
  "open 1, then 5 documents (master)": {
    setup: () => reset("master"),
    play: async (expect) => openOneThenFive(expect),
  },
  "open 1, then 5 documents (floating)": {
    setup: () => reset("floating"),
    play: async (expect) => openOneThenFive(expect),
  },
  "pin a panel (the work area keeps its size)": {
    play: async (expect) => {
      const work0 = workArea(state, SPEC);
      await scriptedDrag(panelItem(2), () => ZONE_POINT.pinned);
      await idle();
      expect(state.pinned.includes(2), "Notes isn't pinned");
      expect(sameRect(workArea(state, SPEC), work0), "the work area changed size when a panel was pinned");
    },
  },
  "a vertical toolbar in the band: nothing pins, nothing leaves the stage": {
    play: async (expect) => {
      const start = new Map([...layoutDesk(state, SPEC).rects].map(([k, r]) => [k, { ...r }] as const));
      doShape({ orientation: "vertical" });
      await idle();
      const strip = layoutDesk(state, SPEC);
      expect(state.pinned.length === 0, `${state.pinned.length} panels pinned with the toolbar vertical in the band`);
      expect(Math.abs(strip.work.height - (STAGE_H - 2 * G.gap)) < 0.5, `the work area is ${Math.round(strip.work.height)} px tall, not the stage's full ${STAGE_H - 2 * G.gap}`);
      const tb = strip.rects.get("toolbar")!;
      expect(Math.abs(tb.x - G.gap) < 0.5 && Math.abs(tb.width - toolbarBox("band-start", state.toolbarShape).width) < 0.5, `the toolbar is at x ${Math.round(tb.x)}, ${Math.round(tb.width)} wide: not a strip at the band's start edge`);
      for (const [key, r] of strip.rects) {
        expect(r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= STAGE_W + 0.5 && r.y + r.height <= STAGE_H + 0.5, `${key} leaves the stage at ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`);
        if (key !== "toolbar") expect(overlap(r, tb) < 1, `${key} overlaps the toolbar strip`);
      }
      for (const it of items) if (!it.closing) expect(sameRect(it.rect.value, strip.rects.get(it.key)!), `${it.name} didn't settle beside the strip`);
      doShape({ orientation: "horizontal" });
      await idle();
      const back = layoutDesk(state, SPEC);
      expect(state.pinned.length === 0 && state.autoPinned.length === 0, "something is pinned after the toolbar went back to horizontal");
      for (const [key, r] of start) expect(back.rects.has(key) && sameRect(back.rects.get(key)!, r), `${key} isn't where it started once the toolbar is horizontal again`);
      for (const it of items) if (!it.closing) expect(sameRect(it.rect.value, start.get(it.key)!), `${it.name} didn't settle back to its starting place`);
    },
  },
  "panels the minimum pins dock back when the room returns": {
    setup: () => reset(docLayout(), 2, { left: [2, 1, 4, 3], right: [5] }),
    play: async (expect) => {
      // Panel 5 is pinned by hand: it must stay pinned. Inspector (4) is pinned by the rule: it must come back.
      await scriptedDrag(panelItem(5), () => ZONE_POINT.pinned);
      await idle();
      expect(state.pinned.join() === "5", `pinned: ${state.pinned.join() || "nothing"} after pinning History by hand`);
      await toolbarTo("left", expect);
      expect(state.pinned.join() === "5,4", `pinned: ${state.pinned.join() || "nothing"}; History by hand, then Inspector by the rule`);
      await toolbarTo("band-start", expect);
      expect(state.left.join() === "2,1,4,3", `left column is ${state.left.join()}; Inspector should dock back at its slot`);
      expect(state.pinned.join() === "5", `pinned: ${state.pinned.join() || "nothing"}; only History, pinned by hand, should stay`);
    },
  },
  "a pinned panel stays inside a short stage": {
    play: async (expect) => {
      // Pure placement: with little work height the first pinned panel is cut to fit, not placed below the stage.
      for (const height of [150, 200, 260]) {
        const short: DeskSpec = { stage: { width: STAGE_W, height }, panels: PANELS };
        const s: DeskState = { ...state, left: [], right: [], pinned: [1, 5, 2], folded: [], tiled: [], tree: null, floating: [] };
        const layout = layoutDesk(s, short);
        for (const id of s.pinned) {
          const r = layout.rects.get(panelKey(id))!;
          expect(r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= STAGE_W + 0.5 && r.y + r.height <= height + 0.5, `${names.get(200 + id)} is pinned at ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}, outside a ${STAGE_W} × ${height} stage`);
        }
      }
    },
  },
  "Escape mid-drag restores": {
    play: async (expect) => {
      const before = JSON.stringify(state);
      const rects = items.map((it) => [it.key, { ...it.rect.value }] as const);
      await scriptedDrag(toolbarItem(), () => ZONE_POINT.left, { escapeAt: 22 });
      await idle();
      expect(JSON.stringify(state) === before, "the desk isn't as it was before the lift");
      for (const [key, r] of rects) expect(sameRect(itemOf(key)!.rect.value, r), `${key} didn't go back home`);
    },
  },
  "a full column pins its newest panel": {
    setup: () => reset(docLayout(), 2, { left: [2, 1, 4, 3], right: [5] }),
    play: async (expect) => {
      expect(state.pinned.length === 0, "something was pinned before the move");
      await toolbarTo("left", expect);
      expect(state.pinned.join() === "4", `pinned: ${state.pinned.join() || "nothing"}; Inspector (the newest in the left column) should be`);
    },
  },
};

async function openOneThenFive(expect: Expect): Promise<void> {
  const n0 = docIds(state).length;
  doOpen();
  await idle();
  for (let i = 0; i < 5; i++) doOpen();
  await idle();
  expect(docIds(state).length === n0 + 6, `${docIds(state).length} documents open, expected ${n0 + 6}`);
  expect(opened.includes("cascade"), `no document was placed by cascade (${opened.join(", ")})`);
  const work = workArea(state, SPEC);
  const layout = layoutDesk(state, SPEC);
  for (const id of docIds(state)) {
    const r = layout.rects.get(docKey(id))!;
    expect(r.x >= work.x - 0.5 && r.y >= work.y - 0.5 && r.x + r.width <= work.x + work.width + 0.5 && r.y + r.height <= work.y + work.height + 0.5, `document ${id} leaves the work area`);
  }
}

const runs: LabRun[] = [];

async function runScenario(name: string): Promise<LabRun> {
  const sc = SCENARIOS[name]!;
  if (sc.setup) sc.setup();
  else reset();
  await nextFrame();
  const failures: string[] = [];
  collecting = [];
  try {
    await sc.play((ok, failure) => {
      if (!ok) failures.push(failure);
    });
    await idle();
  } finally {
    const moves = collecting ?? [];
    collecting = null;
    lastRows = [...mergeRows(moves), { name: "Scenario expectations", result: verdict(failures) }];
  }
  renderChecks(checksBody, lastRows);
  const failed = lastRows.filter((r) => r.result && !r.result.ok).map((r) => r.name);
  const run: LabRun = { scenario: name, mode: dropMode, failed, rows: lastRows };
  runs.push(run);
  const tr = document.createElement("tr");
  tr.innerHTML = "<td></td><td></td><td></td>";
  tr.children[0]!.textContent = name;
  tr.children[1]!.textContent = dropMode === "snap" ? "snap to slot" : "drop indicator";
  tr.children[2]!.textContent = failed.length ? failed.join(", ") : "none";
  (tr.children[2] as HTMLElement).className = failed.length ? "bad" : "ok";
  runsBody.append(tr);
  return run;
}

let runningAll = false;
let stopAll = false;
const runAllButton = document.querySelector("button[data-act=runall]") as HTMLButtonElement;

async function runAll(): Promise<LabRun[]> {
  if (runningAll) return [];
  runningAll = true;
  stopAll = false;
  runAllButton.textContent = "Stop scenarios";
  const before = dropMode;
  const docsBefore = docLayout();
  const out: LabRun[] = [];
  runsBody.replaceChildren();
  try {
    outer: for (const m of ["indicator", "snap"] as const) {
      setDropMode(m);
      for (const name of Object.keys(SCENARIOS)) {
        if (stopAll) break outer;
        out.push(await runScenario(name));
      }
    }
  } finally {
    setDropMode(before);
    (document.querySelector(`input[name=docs][value=${docsBefore}]`) as HTMLInputElement).checked = true;
    reset(docsBefore);
    runningAll = false;
    stopAll = false;
    runAllButton.textContent = "Run all scenarios";
  }
  return out;
}

/** For screenshots: lift the toolbar and leave it held halfway to the left column, the indicator showing. */
async function midToolbarDrag(): Promise<void> {
  const it = toolbarItem();
  const from = gripOf(it);
  beginDrag(it, from.x, from.y);
  const end = { x: 90, y: 260 };
  for (let i = 1; i <= 12; i++) {
    await nextFrame();
    moveDrag(from.x + ((end.x - from.x) * i) / 12, from.y + ((end.y - from.y) * i) / 12);
  }
  for (let i = 0; i < 20; i++) await nextFrame();
}

// --- wiring ------------------------------------------------------------------------------------------------------

const checked = (name: string): string | undefined => document.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)?.value;
const docLayout = (): DocLayout => (checked("docs") as DocLayout | undefined) ?? "master";

function setDropMode(m: DropMode): void {
  dropMode = m;
  (document.querySelector(`input[name=drop][value=${m}]`) as HTMLInputElement).checked = true;
}

document.querySelectorAll<HTMLInputElement>("input[name=drop]").forEach((input) => input.addEventListener("change", () => setDropMode(input.value as DropMode)));
document.querySelectorAll<HTMLInputElement>("input[name=docs]").forEach((input) => input.addEventListener("change", () => setDocs(input.value as DocLayout)));
document.querySelectorAll<HTMLInputElement>("input[name=tempo]").forEach((input) =>
  input.addEventListener("change", () => {
    tempo = input.value as Tempo;
    for (const it of items) {
      it.rect.configure({ omega: omega() });
      it.rot.configure({ omega: omega() });
    }
  }),
);
const actions: Record<string, () => void> = {
  open: doOpen,
  open5: () => {
    for (let i = 0; i < 5; i++) doOpen();
  },
  close: doClose,
  "tb-band-start": () => doToolbar("band-start"),
  "tb-band-end": () => doToolbar("band-end"),
  "tb-collapse": doCollapse,
  "tb-left": () => doToolbar("left"),
  "tb-right": () => doToolbar("right"),
  "tb-pinned": () => doToolbar("pinned"),
  runall: () => {
    if (runningAll) {
      stopAll = true;
      runAllButton.textContent = "Stopping…";
    } else void runAll();
  },
};
document.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) => b.addEventListener("click", () => actions[b.dataset.act!]?.()));

// Start from what the controls show (a reload restores the browser's checked radios).
tempo = (checked("tempo") as Tempo | undefined) ?? tempo;
dropMode = (checked("drop") as DropMode | undefined) ?? dropMode;
reset(docLayout());

window.__motionLab = { runAll, runs, lastRows: () => lastRows, midToolbarDrag };
