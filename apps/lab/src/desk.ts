/**
 * Desk constructions: nine ways to build a desk from a toolbar, five tool panels and open documents (see
 * desk/layouts.ts for each one's rules). The "Construction" switch picks one; every item glides to its place by the
 * lab's motion rules: a move settles, a size change is revealed rather than stretched, a panel that folds away fades
 * out with a uniform scale, and what the pointer holds is glued to it.
 *
 * `window.__motionLab.runAll()` runs the scripted scenarios and returns which rules failed.
 */
import { createFrameLoop, createSettle, SETTLE_TEMPO, type FrameInfo, type Rect, type Settle } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import type { CheckResult, HeldSample, ScaleSample, TargetSample } from "@n-uf/motion/testing";
import { docBody, panelBody, toolbarCells, withGlyph } from "./desk/content";
import { draggable, dropAt, targetsFor, without, type Drop, type DropTarget, type TargetInput } from "./desk/drops";
import { createGrips } from "./desk/grip";
import { gripScenarios } from "./desk/grip-scenarios";
import { DRAG, createIntent, rawTarget, within, type Intent } from "./desk/intent";
import { CONSTRUCTIONS, DEFAULT_CONSTRUCTION, constructionOf, stripGeometry, type ConstructionId } from "./desk/layouts";
import {
  DEFAULT_OPTIONS,
  DOC_TITLES,
  LAYER,
  MAX_DOCS,
  PANELS,
  docKey,
  idOf,
  isDocKey,
  isPanelKey,
  panelKey,
  titleOf,
  toggleClosed,
  toggleFold,
  touch,
  withActive,
  withDocs,
  type DeskState,
  type Layout,
  type Options,
  type Placed,
  type Side,
  type Size,
} from "./desk/model";
import { LABEL_RULE, positionPopup } from "./desk/positioner";
import { makeScenarios, type DeskLab, type DragResult, type IndicatorEntry, type PathAction, type PathKey, type Scenario } from "./desk/scenarios";
import { toolbarGrip, wireToolbar } from "./desk/toolbar-drag";
import { toolbarScenarios } from "./desk/toolbar-scenarios";
import { initToolbarFrame, withGroupOptions } from "./desk/toolbar-frame";
import { toolbarGroupScenarios } from "./desk/toolbar-group-scenarios";
import { framesResult, merge, motionRows, renderChecks, renderTrace, verdict, type Row, type Segment } from "./shared/checks";
import { drawRevealed, layOut, measureFrame, onTopAt } from "./shared/frame";
import { inside, nextFrame, overlap, same, wait, type Point } from "./shared/geometry";
import type { LabRun } from "./shared/hooks";
import { cancelPress, trackPress } from "./shared/press";

type Tempo = keyof typeof SETTLE_TEMPO;

const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const stage = document.getElementById("stage") as HTMLDivElement;
const hint = document.getElementById("hint") as HTMLDivElement;
const hintLabel = document.getElementById("hint-label") as HTMLDivElement;
// The indicator's fade and glide come from the drag model.
stage.style.setProperty("--hint-fade", `${DRAG.FADE}ms`);
stage.style.setProperty("--hint-glide", `${DRAG.GLIDE}ms`);
const checksBody = document.querySelector("#checks tbody") as HTMLTableSectionElement;
const runsBody = document.querySelector("#runs tbody") as HTMLTableSectionElement;
const trace = document.getElementById("trace") as HTMLCanvasElement;
const readout = document.getElementById("readout") as HTMLParagraphElement;
const ideaEl = document.getElementById("idea") as HTMLParagraphElement;
const wInput = document.getElementById("w") as HTMLInputElement;
const hInput = document.getElementById("h") as HTMLInputElement;
const wOut = document.getElementById("wo") as HTMLOutputElement;
const hOut = document.getElementById("ho") as HTMLOutputElement;

/** Anything on the desk that moves: the toolbar, a panel, a document, or chrome (a rail, a tab row, the strip's scroll bar). */
interface Item {
  readonly uid: number;
  readonly key: string;
  readonly kind: "toolbar" | "panel" | "doc" | "chrome";
  readonly name: string;
  readonly el: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly content: HTMLDivElement;
  readonly rect: Settle<Rect>;
  /** Where the element is laid out (its content's size); the drawn rect glides toward it. */
  target: Rect;
  /** Shown (1) or folded away / closing (0): a uniform scale and a fade. */
  readonly pop: Settle<number>;
  /** How the current layout places it. */
  placed: Placed | null;
  /** What its content was last built from (rails and tab rows rebuild when it changes). */
  built: string;
  closing: boolean;
  segment: Segment | null;
  runs: TargetSample[][];
}

let tempo: Tempo = "default";
let cid: ConstructionId = DEFAULT_CONSTRUCTION;
const states = new Map<ConstructionId, DeskState>();
const optionsOf = new Map<ConstructionId, Options>();
let size: Size = { width: 960, height: 560 };
let items: Item[] = [];
const names = new Map<number, string>();
let nextDoc = 1;
let nextChrome = 300;
let layout: Layout = { items: new Map(), notes: [] };

const omega = (): number => SETTLE_TEMPO[tempo];
const construction = () => constructionOf(cid);
const stateOf = (id: ConstructionId): DeskState => states.get(id)!;
const state = (): DeskState => stateOf(cid);
// The toolbar groups set the pill's width and hide it when it holds none (desk/toolbar-frame.ts).
const options = (): Options => withGroupOptions(optionsOf.get(cid) ?? DEFAULT_OPTIONS);
const itemOf = (key: string): Item | undefined => items.find((it) => it.key === key && !it.closing);

/** Change every construction's documents at once (they share them); each keeps its own arrangement. */
function setDocs(docs: readonly number[], focus: number | null): void {
  for (const c of CONSTRUCTIONS) states.set(c.id, withDocs(stateOf(c.id), docs, focus));
}

/** The current construction's state changes; everything glides to the new layout. */
function commit(s: DeskState): void {
  states.set(cid, s);
  relayout();
}

// --- the drag ------------------------------------------------------------------------------------------------------

let lifted: Item | null = null;
let grab: Point = { x: 0, y: 0 };
let liftSize = { width: 0, height: 0 };
let expected: Rect | null = null;
let pointer: Point = { x: 0, y: 0 };
/** Where the lifted item came from: the desk's state then (the others keep its place until room is made) and its home zone. */
let home: { state: DeskState; rect: Rect } | null = null;
/** The lifted item's drop targets (stable while it is held: only the strip's edge scroll rebuilds them). */
let targets: DropTarget[] = [];
let intent: Intent<DropTarget> | null = null;
/** What the indicator shows, and the drop the others make room for. */
let shown: Drop | null = null;
let room: Drop | null = null;
/** A keyboard drag: the stops the arrow keys step through, the current one, and since when. */
let keys: { stops: { target: DropTarget; p: Point }[]; i: number; since: number } | null = null;
/** The press became a drag (so its click isn't a click on a tab). */
let dragged = false;
/** When the indicator's place (its drop) last changed. */
let placeSince = 0;
/** The strip scrolled at the stage's edge during this drag (null: as it was): kept only if the item lands. */
let dragScroll: number | null = null;
/**
 * The drop preview: the indicator outlines the slot, or (snap) the item itself glides into it. Snap takes over at
 * the moment the drag model shows the indicator and makes room, never while the pointer flies.
 */
type Preview = "indicator" | "snap";
let preview: Preview = "indicator";
/** Snap: the drop the item sits in, and whether it is gliding back to the pointer after leaving one. */
let snapped: Drop | null = null;
let returning = false;
/**
 * What gates a snap: the drag model ("model"), or (only to check that the scenarios catch it) the target under the
 * pointer, with no aiming or room ("hover").
 */
let snapGate: "model" | "hover" = "model";

/** Where the others make room for the lifted item now. */
const roomDrop = (): Drop | null => (lifted ? room : null);
/** The desk while an item is held and no room is made: as it was, scrolled as the drag scrolled it. */
const heldState = (): DeskState => (dragScroll === null ? home!.state : { ...home!.state, stripScroll: dragScroll });
const dragInput = (it: Item): TargetInput => ({ c: construction(), s0: without(heldState(), it.key), key: it.key, size, opt: options() });

/**
 * Lift `it` with the pointer at (px, py). `hold` is where the pointer holds it (default: where it was pressed);
 * `from` its home zone (default: where it is drawn); `keyboard`: picked up from the keyboard.
 */
function beginDrag(it: Item, px: number, py: number, hold?: Point, from?: Rect, keyboard = false): void {
  // A frozen layout lifts nothing (unless Alt is held).
  if (lifted || it.closing || !draggable(construction(), it.key) || grips.frozen()) return;
  dragged = true;
  ensureLoop();
  const d = it.rect.value;
  grab = hold ?? { x: px - d.x, y: py - d.y };
  liftSize = { width: d.width, height: d.height };
  home = { state: state(), rect: from ?? { ...d } };
  dragScroll = null;
  intent = createIntent<DropTarget>(home.rect);
  dragLog = [];
  dragFrames = [];
  liftedAt = performance.now();
  lifted = it;
  raised = it;
  targets = targetsFor(dragInput(it));
  shown = null;
  room = null;
  snapped = null;
  returning = false;
  snapLog = [];
  keys = keyboard ? { stops: targets.flatMap((t) => (t.stops ?? [centre(t.hit)]).map((p) => ({ target: t, p }))), i: -1, since: 0 } : null;
  it.el.classList.add("lifted");
  it.el.classList.remove("hidden");
  it.el.style.zIndex = "10";
  // A panel lifted from behind its tab shows while it is held.
  it.el.style.visibility = "visible";
  it.pop.setTarget(1);
  it.segment = null;
  newRun(it);
  moveDrag(px, py);
}

/** Where the pointer holds the lifted item: from the grab point, at the size it was lifted at. */
const heldRect = (): Rect => ({ x: pointer.x - grab.x, y: pointer.y - grab.y, width: liftSize.width, height: liftSize.height });

/** The pointer moved: the item follows it 1:1 from the grab point (unless it sits in a slot or is gliding back). */
function moveDrag(px: number, py: number): void {
  const it = lifted;
  if (!it) return;
  pointer = { x: px, y: py };
  if (snapped || returning) {
    expected = null;
    return;
  }
  expected = heldRect();
  it.rect.hold(expected);
}

/** Once a frame while an item is lifted: scroll the strip at the stage's edge, else read the aim. */
function aim(now: number, dt: number): void {
  const it = lifted;
  if (!it || !intent) return;
  if (keys) {
    const stop = keys.stops[keys.i];
    show(stop ? dropAt(dragInput(it), stop.target, stop.p, grab) : null, now, !!stop && !stop.target.free && now - keys.since >= DRAG.ROOM_AFTER);
    place(it, now, false);
    return;
  }
  dragFrames.push({ t: now - liftedAt, x: pointer.x, y: pointer.y, speed: intent.speed, item: { ...it.rect.value } });
  if (cid === "strip" && edgeScroll(it, now, dt)) return place(it, now, true);
  const f = intent.update(pointer, now, targets);
  show(f.shown ? dropAt(dragInput(it), f.shown, pointer, grab) : null, now, f.room, !f.aiming);
  place(it, now, !f.aiming);
}

/** A drop the item can sit in: a slot (not a free placement, not folded away into a rail). */
const slotted = (d: Drop | null): d is Drop => !!d && !d.free && !d.hidden;

/**
 * Snap preview: once the model shows the indicator and makes room, the item glides into the slot (settle; its size
 * revealed); when the model moves or hides the indicator, it glides back to the pointer and follows it 1:1 again.
 */
function place(it: Item, now: number, flying: boolean): void {
  if (preview !== "snap") return;
  // From the pointer and from the keyboard alike, the item snaps once the others have made room for it.
  let want: Drop | null = slotted(room) ? room : null;
  if (snapGate === "hover" && !keys) {
    const t = rawTarget(targets, pointer);
    const d = t ? dropAt(dragInput(it), t, pointer, grab) : null;
    want = slotted(d) ? d : null;
  }
  if (want) {
    // The same slot, unless the desk was laid out again (a resize): then the item glides to where the slot is now.
    if (snapped?.key === want.key && same(snapped.slot, want.slot)) return;
    if ((snapped?.target ?? null) !== want.target) logSnap(now, want.target, false);
    // From the pointer (held, or on its way back) into a slot: a new glide.
    if (!snapped) newRun(it);
    snapped = want;
    returning = false;
    expected = null;
    glideTo(it, want.slot);
    return;
  }
  if (snapped) {
    logSnap(now, null, flying);
    snapped = null;
    returning = true;
    newRun(it);
  }
  if (!returning) return;
  // Back to the pointer: the glide follows the pointer as it moves, until the item is under it again.
  const goal = heldRect();
  glideTo(it, goal);
  const d = it.rect.value;
  if (Math.max(Math.abs(d.x - goal.x), Math.abs(d.y - goal.y), Math.abs(d.width - goal.width), Math.abs(d.height - goal.height)) < 0.5) {
    returning = false;
    newRun(it);
    expected = goal;
    it.rect.hold(goal);
  }
}

/** The lifted item glides to `r` (settle), its content laid out at `r` (reveal: never stretched). */
function glideTo(it: Item, r: Rect): void {
  if (!same(it.target, r)) {
    it.target = { ...r };
    layOut(it, r);
  }
  if (same(it.rect.target, r)) return;
  const drawn = it.rect.value;
  it.segment = { id: it.uid, t0: time, from: { ...drawn }, to: { ...r }, samples: [{ t: time, rect: { ...drawn } }] };
  episode?.segments.push(it.segment);
  it.rect.configure({ omega: omega() });
  it.rect.setTarget(r);
}

/** Snaps for the checks: the target the item sits in (null: back on the pointer; `flying`: because it flew off). */
function logSnap(now: number, id: string | null, flying: boolean): void {
  const e = { id, ...(id === null ? { flying } : {}) };
  episode?.snaps.push({ t: now, ...e });
  snapLog.push({ t: now - liftedAt, ...e });
}

/**
 * Near the stage's left or right edge the strip scrolls, faster the closer the pointer; the indicator hides while it
 * does, and the item's home scrolls with the strip. The scroll is the drag's own until the item lands (Escape undoes
 * it). Returns whether it scrolled.
 */
function edgeScroll(it: Item, now: number, dt: number): boolean {
  const dist = Math.min(pointer.x, size.width - pointer.x);
  if (dist >= DRAG.EDGE || !home || !intent) return false;
  const g = stripGeometry(heldState(), size);
  const dir = pointer.x < size.width / 2 ? -1 : 1;
  const next = Math.min(Math.max(0, g.total - size.width), Math.max(0, g.scroll + dir * DRAG.EDGE_SPEED * (1 - Math.max(0, dist) / DRAG.EDGE) * dt));
  if (Math.abs(next - g.scroll) < 0.01) return false;
  dragScroll = next;
  const dx = g.scroll - next;
  home = { ...home, rect: { ...home.rect, x: home.rect.x + dx } };
  intent.moveHome(dx, 0);
  targets = targetsFor(dragInput(it));
  intent.hide(now);
  // Hidden for the scroll, as for a pointer flying: not a flash.
  show(null, now, false, true);
  relayout();
  return true;
}

/**
 * The indicator shows `d` (or nothing); the others make room for it when `makeRoom`. Within one target, a new place
 * (another tab or stack index) gets the room only once it has held ROOM_AFTER ms; until then the room stays put.
 * `flying`: a hide because the pointer started flying (or the strip scrolls), which is not a flash.
 */
function show(d: Drop | null, now: number, makeRoom: boolean, flying = false): void {
  if ((d?.target ?? null) !== (shown?.target ?? null)) {
    const e = { id: d?.target ?? null, ...(d ? {} : { flying }) };
    episode?.indicator.push({ t: now, ...e });
    dragLog.push({ t: now - liftedAt, ...e });
  }
  if (d?.key !== shown?.key) {
    // Snap previews a slot with the item itself: the indicator is drawn only for drops with no slot.
    if (d && !(preview === "snap" && slotted(d))) showHint(d);
    else hideHint();
    placeSince = now;
  }
  shown = d;
  let next: Drop | null = null;
  if (makeRoom && d) next = now - placeSince >= DRAG.ROOM_AFTER ? d : room && room.target === d.target ? room : null;
  // A new place, or the same place laid out anew (the stage resized under the drag).
  if (next?.key !== room?.key || (next && room && next !== room && !same(next.slot, room.slot))) {
    room = next;
    relayout();
  }
}

/**
 * Drop the lifted item. A release lands on the indicator's target if the pointer is within its band, else on the
 * target under the pointer, else nowhere: the item settles home (as on a release over home, Escape or a cancel).
 */
function endDrag(cancel = false): void {
  const it = lifted;
  if (!it || !home || !intent) return;
  let s = home.state;
  let landed: string | null = null;
  // The options a drop sets (a toolbar drop: its mode).
  let opt: Options | undefined;
  let apply: (() => void) | undefined;
  atRelease = { ...it.rect.value };
  if (!cancel) {
    // Both previews land by one rule: what is shown. A snapped item sits in the shown target's slot; moved to another
    // place of that target, it lands where the pointer is, even before it has glided there.
    const stop = keys?.stops[keys.i];
    const t = keys ? (stop?.target ?? null) : intent.release(pointer, targets);
    if (t) {
      const d = dropAt(dragInput(it), t, keys ? stop!.p : pointer, grab);
      s = d.state;
      opt = d.opt;
      apply = d.apply;
      landed = t.id;
    }
    if (!keys) {
      // The rule, checked from what the page showed: the indicator's target within its band, else what is under the
      // pointer.
      const showing = shown ? targets.find((x) => x.id === shown!.target) : undefined;
      const said = within(home.rect, pointer) ? null : showing && within(showing.hit, pointer, DRAG.BAND) ? showing.id : (rawTarget(targets, pointer)?.id ?? null);
      episode?.release.push(said === landed ? null : `landed on ${landed ?? "home"}, but the indicator said ${said ?? "home"}`);
    }
  }
  // Landing in the slot it sits in is not leaving it: no snap ends here.
  snapped = null;
  returning = false;
  show(null, performance.now(), false);
  lastLanding = landed;
  lifted = null;
  intent = null;
  keys = null;
  expected = null;
  home = null;
  dragScroll = null;
  targets = [];
  it.el.classList.remove("lifted");
  newRun(it);
  // A drop that sets options sets them as the switches do, and the switches show them.
  if (opt) {
    optionsOf.set(cid, opt);
    syncControls();
  }
  apply?.();
  // It stays raised until its drop settle ends.
  commit(s);
  // What waited for the drag to end: a preview chosen during it, and the stage fitting a window resized during it.
  if (nextPreview) setPreview(nextPreview);
  applyFit();
}
/** What the last drag landed on (a target id, or null: home), and where the item was drawn when it was let go. */
let lastLanding: string | null = null;
let atRelease: Rect | null = null;

const TOUCH = { hold: DRAG.LONG_PRESS, lift: DRAG.TOUCH_LIFT };

function onPress(it: Item, e: PointerEvent, hold?: Point, from?: () => Rect): void {
  trackPress(
    e,
    {
      point: stagePoint,
      lifted: () => lifted === it,
      begin: (start) => beginDrag(it, start.x, start.y, hold, from?.()),
      move: (q) => moveDrag(q.x, q.y),
      end: (cancel) => endDrag(cancel),
    },
    TOUCH,
  );
}

/** Space (or Enter on a title bar) picks the item up from the keyboard. */
function onKeyPickUp(it: Item, e: KeyboardEvent, hold?: Point, enter = true): void {
  if (lifted || !(e.key === " " || (enter && e.key === "Enter"))) return;
  e.preventDefault();
  e.stopPropagation();
  const d = it.rect.value;
  const g = hold ?? { x: 40, y: 11 };
  beginDrag(it, d.x + g.x, d.y + g.y, g, undefined, true);
}

document.addEventListener("keydown", (e) => {
  if (!lifted) return;
  if (e.key === "Escape") {
    cancelPress();
    endDrag(true);
  } else if (keys && (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft")) {
    // A fixed order: the targets' stops as listed, wrapping round.
    const n = keys.stops.length;
    const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
    if (n) keys = { ...keys, i: forward ? (keys.i + 1) % n : keys.i <= 0 ? n - 1 : keys.i - 1, since: performance.now() };
  } else if (keys && e.key === "Enter") endDrag();
  else return;
  e.preventDefault();
});

function stagePoint(e: PointerEvent): Point {
  const r = stage.getBoundingClientRect();
  const k = (stageRect.value.width + 2) / r.width;
  return { x: (e.clientX - r.left - stage.clientLeft) * k, y: (e.clientY - r.top - stage.clientTop) * k };
}

/**
 * The indicator outlines the drop's slot (a drop into a folded rail: the rail); it fades in, and glides from one
 * target to the next. Its label is placed by the xdg-positioner rule.
 */
function showHint(d: Drop): void {
  const r = d.hidden ? (targets.find((t) => t.id === d.target)?.hit ?? d.slot) : d.slot;
  const appearing = !hint.classList.contains("on");
  // Appearing: it fades in where it is, without gliding from where it last was.
  for (const el of appearing ? [hint, hintLabel] : []) el.style.transitionProperty = "opacity";
  Object.assign(hint.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
  if (hintLabel.textContent !== d.label) hintLabel.textContent = d.label;
  hintLabel.style.width = "";
  const placed = positionPopup(r, { width: hintLabel.offsetWidth, height: hintLabel.offsetHeight }, { x: 0, y: 0, ...size }, LABEL_RULE);
  Object.assign(hintLabel.style, { left: `${placed.rect.x}px`, top: `${placed.rect.y}px`, width: `${placed.rect.width}px` });
  if (appearing) {
    void hint.offsetWidth;
    for (const el of [hint, hintLabel]) el.style.transitionProperty = "";
  }
  hint.classList.add("on");
  hintLabel.classList.add("on");
}

function hideHint(): void {
  hint.classList.remove("on");
  hintLabel.classList.remove("on");
}

// --- items ---------------------------------------------------------------------------------------------------------

function makeItem(kind: Item["kind"], key: string, uid: number, name: string, html: string, at: Rect): Item {
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
  names.set(uid, name);
  const it: Item = {
    uid,
    key,
    kind,
    name,
    el,
    frame,
    content,
    rect: createSettle(at, { omega: omega() }),
    target: { ...at },
    pop: createSettle(1, { omega: omega(), restDelta: 0.001 }),
    placed: null,
    built: "",
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
  const it = makeItem("toolbar", "toolbar", 100, "toolbar", `<div class="tb">${toolbarCells()}</div>`, at);
  // The toolbar drags by its empty space or its grip (see desk/toolbar-drag.ts).
  wireToolbar(it.el, it.content.querySelector<HTMLElement>(".tb")!, { press: (e) => draggable(construction(), it.key) && onPress(it, e), key: (e) => onKeyPickUp(it, e, toolbarHold(it), false) });
  return it;
}
const toolbarHold = (it: Item): Point => {
  const d = it.rect.value;
  const g = toolbarGrip(d);
  return { x: g.x - d.x, y: g.y - d.y };
};

function makePanel(p: (typeof PANELS)[number], at: Rect): Item {
  const html = `<div class="title"><span class="name">${p.title}</span></div><div class="body">${panelBody(p.id)}</div>`;
  const it = makeItem("panel", panelKey(p.id), 200 + p.id, p.title, html, at);
  const bar = it.content.querySelector<HTMLElement>(".title")!;
  bar.addEventListener("pointerdown", (e) => {
    dragged = false;
    onPress(it, e as PointerEvent);
  });
  // From the keyboard: Space or Enter on the focused title bar picks the panel up (not on its fold button).
  bar.addEventListener("keydown", (e) => {
    if (e.target === bar) onKeyPickUp(it, e);
  });
  // Its handle carries its actions (see desk/grip.ts).
  grips.header(it.key, bar);
  it.el.addEventListener("pointerdown", () => {
    if (!it.closing) states.set(cid, touch(state(), p.id));
  });
  return it;
}

function makeDoc(id: number, at: Rect): Item {
  const title = DOC_TITLES[(id - 1) % DOC_TITLES.length]!;
  const html = `<div class="title" tabindex="0">${title}</div><div class="body">${docBody(title)}</div>`;
  const it = makeItem("doc", docKey(id), id, title, html, at);
  it.el.addEventListener("pointerdown", () => {
    if (!it.closing && !lifted) doFocus(id);
  });
  // Documents are tiles of the tree and columns of the strip: there, they drag by their title bar.
  const bar = it.content.querySelector<HTMLElement>(".title")!;
  bar.addEventListener("pointerdown", (e) => {
    if (draggable(construction(), it.key)) onPress(it, e as PointerEvent);
  });
  bar.addEventListener("keydown", (e) => {
    if (draggable(construction(), it.key)) onKeyPickUp(it, e);
  });
  return it;
}

/** An element's rect in stage units. */
function stageRectOf(el: Element): Rect {
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const k = (stageRect.value.width + 2) / s.width;
  return { x: (r.left - s.left - stage.clientLeft) * k, y: (r.top - s.top - stage.clientTop) * k, width: r.width * k, height: r.height * k };
}

function makeChrome(key: string, at: Rect): Item {
  return makeItem("chrome", key, nextChrome++, key.replace(":", " "), "", at);
}

function button(className: string, id: number, text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = text;
  b.title = titleOf(panelKey(id));
  b.dataset.id = String(id);
  b.addEventListener("click", onClick);
  return b;
}

/** A rail's icons and a tab row's tabs, rebuilt when what they show changes. */
function buildChrome(it: Item, p: Placed): void {
  const side = it.key.split(":")[1] as Side;
  if (p.look === "rail") {
    const sig = `rail|${(p.icons ?? []).join()}`;
    if (sig === it.built) return;
    it.built = sig;
    it.content.replaceChildren(...(p.icons ?? []).map((id) => grips.segment(withGlyph(button("icon", id, "", () => grips.segmentClick(side, id)), id), side, id)));
  } else if (p.look === "tabs") {
    // Not while a drag holds the pointer: the pressed tab must stay in the page (it has the pointer capture).
    if (lifted) return;
    const tw = p.rect.width / Math.max(1, (p.tabs ?? []).length);
    const sig = `tabs|${(p.tabs ?? []).join()}|${p.active}|${tw > 70}`;
    if (sig === it.built) return;
    it.built = sig;
    it.content.replaceChildren(
      ...(p.tabs ?? []).map((id) => {
        const b = button("tab", id, tw > 70 ? titleOf(panelKey(id)) : titleOf(panelKey(id))[0]!, () => {
          if (!dragged) doTab(side, id);
        });
        b.setAttribute("aria-pressed", String(id === p.active));
        // A tab drags its panel (held by a title bar's grip point); its home is the tab. Space picks it up.
        b.addEventListener("pointerdown", (e) => {
          dragged = false;
          const panel = itemOf(panelKey(id));
          if (panel) onPress(panel, e, TAB_HOLD, () => stageRectOf(b));
        });
        b.addEventListener("keydown", (e) => {
          const panel = itemOf(panelKey(id));
          if (panel) onKeyPickUp(panel, e, TAB_HOLD, false);
        });
        return b;
      }),
    );
    grips.tabRow(it.content, side);
  }
}

/** Where the pointer holds a panel lifted by its tab. */
const TAB_HOLD: Point = { x: 40, y: 11 };

/** Constructions where a panel folds (or shades) to its title bar. */
const FOLDS: readonly ConstructionId[] = ["docks", "docksFull", "dockTear", "floatOver", "floatAround"];

/** Dress an item for how it is placed: its look, its layer, shown or folded away. */
function dress(it: Item, p: Placed): void {
  it.placed = p;
  it.el.dataset.look = p.look;
  it.el.classList.toggle("shadow", !!p.shadow);
  it.el.classList.toggle("accent", !!p.accent);
  it.el.classList.toggle("foldable", FOLDS.includes(cid));
  it.el.classList.toggle("draggable", draggable(construction(), it.key));
  it.el.classList.toggle("hidden", !!p.hidden);
  it.el.style.zIndex = it === raised ? "10" : String(p.layer);
  if (it.kind === "chrome") buildChrome(it, p);
  const want = p.hidden ? 0 : 1;
  if (it.pop.target !== want) {
    ensureLoop();
    it.pop.configure({ omega: omega() });
    it.pop.setTarget(want);
    if (want === 1) it.el.style.visibility = "visible";
  }
}

// --- motion --------------------------------------------------------------------------------------------------------

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

/** Lay the desk out again and send every item gliding to its place. */
function relayout(): void {
  // While an item is lifted, the others make room for it where the drop puts it.
  const room = roomDrop();
  layout = room ? room.layout : construction().layout(lifted && home ? heldState() : state(), size, options());
  const seen = new Set<string>();
  for (const [key, p] of layout.items) {
    seen.add(key);
    if (lifted && key === lifted.key) continue;
    let it = itemOf(key);
    if (!it) {
      // Chrome a construction has and the last one didn't: it pops in at its place.
      it = makeChrome(key, p.rect);
      it.pop.jumpTo(0);
      newRun(it);
    }
    setTarget(it, p.rect);
    dress(it, p);
  }
  for (const it of items) {
    if (seen.has(it.key) || it.closing) continue;
    if (it.kind === "chrome") close(it);
  }
  renderNotes();
}

/** Pop an item out; it is removed once the pop has settled. */
function close(it: Item): void {
  ensureLoop();
  it.closing = true;
  it.el.classList.add("hidden");
  it.pop.setTarget(0);
}

function draw(it: Item): void {
  drawRevealed(it, it.rect.value, it.target, it.pop.value);
  // Folded all the way away: out of sight and out of the way of the pointer.
  if (it.pop.settled && it.pop.value === 0) it.el.style.visibility = "hidden";
}

// --- actions -------------------------------------------------------------------------------------------------------

// While an item is held, the desk it was lifted from stays as it was: folds, rail icons and tabs wait for the drop.

function doFold(id: number): void {
  if (lifted) return;
  commit(toggleFold(state(), id));
}

/**
 * A rail icon: in the edge docks it folds the dock to its rail or opens it again (showing that panel); in the
 * drawers it opens the drawer on that panel, or closes it when that panel is already showing; in the navigator it
 * picks the panel the side shows once it has room again.
 */
function doIcon(side: Side, id: number): void {
  if (lifted) return;
  const s = state();
  if (cid === "navigator") return commit(withActive(s, side, id));
  const shown = layout.items.get(panelKey(id));
  const open = !!shown && !shown.hidden;
  if (cid === "drawers") {
    const next = withActive(s, side, id);
    return commit(s.closed.includes(side) || (open && s.active[side] === id) ? toggleClosed(next, side) : next);
  }
  if (open) return commit(s.closed.includes(side) ? s : { ...s, closed: [...s.closed, side] });
  const opened = { ...s, closed: s.closed.filter((x) => x !== side), opened: side, folded: s.folded.filter((x) => x !== id) };
  commit(touch(opened, id));
}

function doTab(side: Side, id: number): void {
  if (lifted) return;
  commit(withActive(state(), side, id));
}

function doFocus(id: number): void {
  const s = state();
  if (s.focus === id) return;
  setDocs(s.docs, id);
  relayout();
  focusMarks();
}

function focusMarks(): void {
  const f = state().focus;
  for (const it of items) it.el.classList.toggle("focused", it.kind === "doc" && idOf(it.key) === f);
}

function doOpen(): void {
  const s = state();
  if (s.docs.length >= MAX_DOCS) return;
  const id = nextDoc++;
  setDocs([...s.docs, id], id);
  layout = construction().layout(state(), size, options());
  const it = makeDoc(id, layout.items.get(docKey(id))!.rect);
  it.pop.jumpTo(0);
  ensureLoop();
  newRun(it);
  relayout();
  focusMarks();
}

function doClose(): void {
  const s = state();
  const id = s.focus !== null && s.docs.includes(s.focus) ? s.focus : s.docs.at(-1);
  if (id === undefined) return;
  close(itemOf(docKey(id))!);
  setDocs(
    s.docs.filter((d) => d !== id),
    null,
  );
  relayout();
  focusMarks();
}

function useConstruction(id: ConstructionId): void {
  cid = id;
  (document.querySelector(`input[name=construction][value=${id}]`) as HTMLInputElement).checked = true;
  syncControls();
  relayout();
  focusMarks();
}

function setOptions(patch: Partial<Options>): void {
  optionsOf.set(cid, { ...options(), ...patch });
  syncControls();
  relayout();
}

const stageRect = createSettle<Rect>({ x: 0, y: 0, width: size.width, height: size.height }, { omega: omega() });

/** The stage glides to its new size with everything on it (the same settle, so nothing leaves it on the way). */
function setSize(width: number, height: number): void {
  size = { width, height };
  wInput.value = String(width);
  hInput.value = String(height);
  wOut.textContent = String(width);
  hOut.textContent = String(height);
  ensureLoop();
  stageRect.configure({ omega: omega() });
  stageRect.setTarget({ x: 0, y: 0, width, height });
  if (lifted && home) relift(lifted);
  relayout();
}

/**
 * The stage resized under a drag: the targets, the keyboard's stops, the shown drop and the room are made again for
 * the new size (a snapped item then glides to where its slot is now).
 */
function relift(it: Item): void {
  targets = targetsFor(dragInput(it));
  if (keys) keys = { ...keys, stops: targets.flatMap((t) => (t.stops ?? [centre(t.hit)]).map((p) => ({ target: t, p }))) };
  const at = keys?.stops[keys.i]?.p ?? pointer;
  const again = (d: Drop | null): Drop | null => {
    const t = d && targets.find((x) => x.id === d.target);
    return t ? dropAt(dragInput(it), t, at, grab) : null;
  };
  shown = again(shown);
  room = again(room);
}

function drawStage(): void {
  const r = stageRect.value;
  // The stage's border is 1 px: its content box (where items are placed) is the stage size.
  stage.style.width = `${r.width + 2}px`;
  stage.style.height = `${r.height + 2}px`;
}

function renderNotes(): void {
  readout.replaceChildren();
  const b = document.createElement("b");
  b.textContent = layout.notes.length ? "Gives way: " : "Everything fits";
  readout.append(b, layout.notes.length ? layout.notes.join("; ") + "." : " at its natural size.");
}

function syncControls(): void {
  const c = construction();
  ideaEl.textContent = c.idea;
  const o = options();
  (document.getElementById("toolbar-modes") as HTMLFieldSetElement).hidden = !c.pill;
  (document.getElementById("bottom-modes") as HTMLFieldSetElement).hidden = !c.bottom;
  const tb = document.querySelector<HTMLInputElement>(`input[name=toolbar][value=${o.toolbar}-${o.toolbarSpace}]`);
  if (tb) tb.checked = true;
  const b = document.querySelector<HTMLInputElement>(`input[name=bottom][value=${o.bottom}]`);
  if (b) b.checked = true;
}

/** A fresh desk: every construction back to its own arrangement, `docCount` documents open. */
function reset(id: ConstructionId = cid, at: Size = size, opts: Partial<Options> = {}, docCount = 2): void {
  for (const it of items) it.el.remove();
  items = [];
  raised = null;
  lifted = null;
  intent = null;
  keys = null;
  shown = null;
  room = null;
  home = null;
  dragScroll = null;
  snapped = null;
  returning = false;
  targets = [];
  hideHint();
  states.clear();
  optionsOf.clear();
  nextDoc = 1;
  const docs = Array.from({ length: docCount }, () => nextDoc++);
  for (const c of CONSTRUCTIONS) states.set(c.id, c.initial(docs, at));
  cid = id;
  optionsOf.set(cid, { ...DEFAULT_OPTIONS, ...opts });
  size = at;
  wInput.value = String(at.width);
  hInput.value = String(at.height);
  wOut.textContent = String(at.width);
  hOut.textContent = String(at.height);
  stageRect.jumpTo({ x: 0, y: 0, width: at.width, height: at.height });
  drawStage();
  (document.querySelector(`input[name=construction][value=${id}]`) as HTMLInputElement).checked = true;
  syncControls();
  layout = construction().layout(state(), size, options());
  for (const [key, p] of layout.items) {
    if (key === "toolbar") makeToolbar(p.rect);
    else if (isPanelKey(key)) makePanel(PANELS.find((x) => x.id === idOf(key))!, p.rect);
    else if (isDocKey(key)) makeDoc(idOf(key), p.rect);
    else makeChrome(key, p.rect);
  }
  for (const it of items) {
    const p = layout.items.get(it.key)!;
    dress(it, p);
    if (p.hidden) {
      it.pop.jumpTo(0);
      it.el.style.visibility = "hidden";
    }
    draw(it);
  }
  focusMarks();
  renderNotes();
  lastRows = [];
  // Building the desk afresh is not a move: no episode of its own.
  episode = null;
}

// --- the frame -----------------------------------------------------------------------------------------------------

/** The item kept above all others: the dragged one, and after its drop until it has settled. */
let raised: Item | null = null;

let time = 0;
let episode: {
  t0: number;
  segments: Segment[];
  runs: TargetSample[][];
  scale: ScaleSample[];
  held: HeldSample[];
  onTop: (string | null)[];
  room: (string | null)[];
  minSize: (string | null)[];
  offStage: (string | null)[];
  label: (string | null)[];
  pops: number;
  /** What the drop indicator showed, and when (a target id; null: nothing). */
  indicator: IndicatorEntry[];
  /** Snap preview: the slots the item sat in, and when (null: back on the pointer). */
  snaps: IndicatorEntry[];
  /** Per release: null when it landed where the indicator (or the pointer) said, else what went wrong. */
  release: (string | null)[];
} | null = null;
let idleWaiters: Array<() => void> = [];
const loop = createFrameLoop({ clock: createBrowserClock() });
let running = false;

function startEpisode(): void {
  if (episode) return;
  episode = { t0: time, segments: [], runs: [], scale: [], held: [], onTop: [], room: [], minSize: [], offStage: [], label: [], pops: 0, indicator: [], snaps: [], release: [] };
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

const measure = (it: Item): { scale: ScaleSample; frame: Rect } => measureFrame(stage, stageRect.value.width + 2, it, time);
const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;

/** Below its minimum (laid out, or drawn once settled), or null. */
function belowMin(it: Item): string | null {
  const min = it.placed?.min;
  if (!min) return null;
  const checks: [string, Rect][] = [["laid out", it.target]];
  if (it.rect.settled) checks.push(["drawn", it.rect.value]);
  for (const [what, r] of checks) {
    if ((min.width !== undefined && r.width < min.width - 0.5) || (min.height !== undefined && r.height < min.height - 0.5)) {
      return `t=${Math.round(time)} ${it.name} ${what} at ${Math.round(r.width)} × ${Math.round(r.height)} (min ${min.width ?? "any"} × ${min.height ?? "any"})`;
    }
  }
  return null;
}

/**
 * Outside the stage (laid out outside the stage's size, or drawn outside the stage as drawn), or null. A move that
 * starts off the stage (a strip column scrolled away) may be drawn outside it on its way in.
 */
function offStage(it: Item): string | null {
  if (it.placed?.offStage) return null;
  const s = stageRect.value;
  const out = (r: Rect, w: number, h: number): boolean => r.x < -0.5 || r.y < -0.5 || r.x + r.width > w + 0.5 || r.y + r.height > h + 0.5;
  if (out(it.target, size.width, size.height)) return `t=${Math.round(time)} ${it.name} laid out at ${fmt(it.target)}, outside the ${size.width} × ${size.height} stage`;
  const from = it.segment?.from;
  if (out(it.rect.value, s.width, s.height) && !(from && out(from, s.width, s.height))) return `t=${Math.round(time)} ${it.name} drawn at ${fmt(it.rect.value)}, outside the stage drawn ${Math.round(s.width)} × ${Math.round(s.height)}`;
  return null;
}

function tick(frame: FrameInfo): boolean {
  const dt = frame.delta;
  time += dt;
  let moving = lifted !== null;
  if (lifted) aim(performance.now(), dt);
  if (stageRect.step(dt)) moving = true;
  drawStage();
  for (const it of [...items]) {
    if (it.rect.step(dt)) moving = true;
    if (it.pop.step(dt)) moving = true;
    draw(it);
    if (!episode) continue;
    const seen = measure(it);
    episode.scale.push(seen.scale);
    if (!it.pop.settled) episode.pops++;
    const drawn = it.rect.value;
    if (it === lifted && !snapped && !returning) {
      // Held 1:1 once it has popped in (a panel lifted from behind its tab grows into view, uniformly).
      if (expected && it.pop.settled) episode.held.push({ t: time, rect: seen.frame, expected });
    } else {
      // Settling (as the lifted item does into a snapped slot and back to the pointer).
      it.runs.at(-1)!.push({ t: time, rect: drawn, target: it.rect.target });
      it.segment?.samples.push({ t: time, rect: drawn });
    }
    if (!it.closing && !it.placed?.hidden && it !== lifted) {
      episode.minSize.push(belowMin(it));
      episode.offStage.push(offStage(it));
    }
    if (it.closing && it.pop.settled) {
      it.el.remove();
      items = items.filter((x) => x !== it);
    }
  }
  // Room: once the others have settled, none of those beside it (not floating over) overlaps the lifted item's slot.
  const kept = roomDrop();
  const slotLayer = lifted && kept ? kept.layout.items.get(lifted.key)?.layer : undefined;
  if (lifted && kept && episode && !kept.free && !kept.hidden && slotLayer !== undefined && slotLayer <= LAYER.palette) {
    const others = items.filter((o) => o !== lifted && !o.closing && !!o.placed && !o.placed.hidden && o.placed.layer <= LAYER.palette);
    const blocking = others.every((o) => o.rect.settled) ? others.filter((o) => overlap(o.rect.value, kept.slot) > 1) : null;
    if (blocking) episode.room.push(blocking.length ? `t=${Math.round(time)} ${blocking.map((o) => o.name).join(", ")} still in the slot kept for ${lifted.name}` : null);
  }
  // The drop label stays inside the stage (the positioner's flip and slide).
  if (episode && hintLabel.classList.contains("on")) {
    const l = { x: hintLabel.offsetLeft, y: hintLabel.offsetTop, width: hintLabel.offsetWidth, height: hintLabel.offsetHeight };
    const out = l.x < -0.5 || l.y < -0.5 || l.x + l.width > size.width + 0.5 || l.y + l.height > size.height + 0.5;
    episode.label.push(out ? `t=${Math.round(time)} label at ${fmt(l)} leaves the stage` : null);
  }
  const r = raised;
  // A panel dropped into a folded dock fades into its rail: it is on its way out of sight, not on top.
  if (r && r !== lifted && r.placed?.hidden) {
    raised = null;
    r.el.style.zIndex = String(r.placed.layer);
  } else if (r && episode) {
    const fr = measure(r).frame;
    const at = r === lifted && inside(fr, pointer.x, pointer.y) ? pointer : { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 };
    const v = onTopAt(stage, stageRect.value.width + 2, { el: r.el, name: r.name }, at, fr, time, (top) => {
      const key = top.closest<HTMLElement>(".win")?.dataset.key;
      return key ? (items.find((x) => x.key === key)?.name ?? key) : null;
    });
    if (v !== undefined) episode.onTop.push(v);
    if (r !== lifted && r.rect.settled) {
      raised = null;
      r.el.style.zIndex = String(r.placed?.layer ?? 1);
    }
  }
  if (moving) return true;
  running = false;
  endEpisode();
  return false;
}

// --- checks --------------------------------------------------------------------------------------------------------

let lastRows: Row[] = [];
/** While a scenario runs: the rows of each of its moves. */
let collecting: Row[][] | null = null;

function endEpisode(): void {
  const ep = episode;
  episode = null;
  if (ep) record(ep);
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const resolve of waiters) resolve();
}

function record(ep: NonNullable<typeof episode>): void {
  const { rows, segments } = motionRows(ep, omega(), (uid) => names.get(uid) ?? `item ${uid}`);
  lastRows = [
    ...rows,
    { name: "Never below its minimum", result: ep.minSize.length > 0 ? framesResult(ep.minSize) : null },
    { name: "Nothing off the stage", result: ep.offStage.length > 0 ? framesResult(ep.offStage) : null },
    { name: "Drop label stays inside the stage", result: ep.label.length > 0 ? framesResult(ep.label) : null },
    { name: "No indicator flashes (shown under 150 ms)", result: ep.indicator.length > 0 ? framesResult(flashes(ep.indicator)) : null },
    { name: "No snap held under 150 ms", result: ep.snaps.length > 0 ? framesResult(flashes(ep.snaps)) : null },
    { name: "The drop is what the indicator (or the pointer) said", result: ep.release.length > 0 ? framesResult(ep.release) : null },
  ];
  collecting?.push(lastRows);
  renderChecks(checksBody, lastRows);
  renderTrace(trace, ep.t0, segments);
}

/**
 * An indicator replaced, or hidden while the pointer aims, less than DRAG.FLASH ms after it showed is a flash (a
 * hide because the pointer started flying is not).
 */
function flashes(log: readonly IndicatorEntry[]): (string | null)[] {
  return log.map((e, i) => {
    const next = log[i + 1];
    return e.id !== null && next && !(next.id === null && next.flying) && next.t - e.t < DRAG.FLASH ? `the indicator on ${e.id} showed for ${Math.round(next.t - e.t)} ms` : null;
  });
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

// --- scenarios -----------------------------------------------------------------------------------------------------

const idle = (): Promise<void> => (running || episode ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());

/** Where a scripted press lifts `it`: a tab for a panel under a tab row (the tab is its home), else its title bar. */
function gripOf(it: Item): { at: Point; hold?: Point; from?: Rect } {
  const p = layout.items.get(it.key);
  const id = idOf(it.key);
  if (it.kind === "panel" && (p?.look === "bare" || p?.hidden)) {
    for (const side of ["left", "right"] as const) {
      const tabs = layout.items.get(`tabs:${side}`);
      const i = tabs?.tabs?.indexOf(id) ?? -1;
      if (!tabs || tabs.hidden || i < 0) continue;
      const tw = tabs.rect.width / tabs.tabs!.length;
      const from = { x: tabs.rect.x + tw * i, y: tabs.rect.y, width: tw, height: tabs.rect.height };
      return { at: centre(from), hold: TAB_HOLD, from };
    }
  }
  const d = it.rect.value;
  if (it.kind === "toolbar") return { at: toolbarGrip(d), hold: toolbarHold(it) };
  return { at: { x: d.x + 40, y: d.y + 11 } };
}

/** What the indicator showed during the current (or last) drag (ms since the lift), and the pointer per frame. */
let dragLog: IndicatorEntry[] = [];
let dragFrames: { t: number; x: number; y: number; speed: number; item: Rect }[] = [];
let snapLog: IndicatorEntry[] = [];
let liftedAt = 0;

/**
 * A scripted drag in real time: lift `key` at its grip, move the pointer along `path` (keyframes [ms, x, y] from
 * the lift, made from the grip point), then release, or Escape at `escapeAt` ms.
 */
async function playPath(key: string, path: (grip: Point) => readonly PathKey[], opts: { escapeAt?: number | (() => number); at?: readonly PathAction[] } = {}): Promise<DragResult> {
  const it = itemOf(key);
  if (!it) return { log: [], landed: null };
  const g = gripOf(it);
  const keysOf = path(g.at);
  const escapeAt = typeof opts.escapeAt === "function" ? opts.escapeAt() : opts.escapeAt;
  // Times may come from the path (made just above): read them now.
  const pending = (opts.at ?? []).map((a) => ({ t: typeof a.t === "function" ? a.t() : a.t, run: a.run })).sort((a, b) => a.t - b.t);
  const first = keysOf[0]!;
  beginDrag(it, first[1], first[2], g.hold, g.from);
  if (lifted !== it) return { log: [], landed: null };
  const start = performance.now();
  const total = keysOf.at(-1)![0];
  for (;;) {
    await nextFrame();
    const t = Math.min(performance.now() - start, total);
    const p = along(keysOf, t);
    moveDrag(p.x, p.y);
    // Things that happen to the desk during the drag (a resize), at their times.
    while (pending.length && t >= pending[0]!.t) pending.shift()!.run();
    if (escapeAt !== undefined && t >= escapeAt) {
      cancelPress();
      endDrag(true);
      return { log: [...dragLog], frames: [...dragFrames], snaps: [...snapLog], atRelease, grab, landed: null };
    }
    if (t >= total) break;
  }
  endDrag();
  return { log: [...dragLog], frames: [...dragFrames], snaps: [...snapLog], atRelease, grab, landed: lastLanding };
}

/** The point on a keyframed path at `t` ms (linear between keyframes). */
function along(keysOf: readonly PathKey[], t: number): Point {
  for (let i = 1; i < keysOf.length; i++) {
    const [t1, x1, y1] = keysOf[i]!;
    if (t > t1) continue;
    const [t0, x0, y0] = keysOf[i - 1]!;
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
    return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f };
  }
  const last = keysOf.at(-1)!;
  return { x: last[1], y: last[2] };
}

/**
 * A plain scripted drag: from the grip to `to()` at an even pace, then held there long enough to aim, show the
 * indicator and make room (or Escape at `escapeAt`, a fraction of the way).
 */
async function scriptedDrag(key: string, to: () => Point, opts: { escapeAt?: number } = {}): Promise<DragResult> {
  let travel = 0;
  return playPath(
    key,
    (g) => {
      const end = to();
      travel = Math.max(250, Math.hypot(end.x - g.x, end.y - g.y) / 0.9);
      return [
        [0, g.x, g.y],
        [travel, end.x, end.y],
        [travel + DWELL_THEN_ROOM, end.x, end.y],
      ];
    },
    opts.escapeAt !== undefined ? { escapeAt: () => travel * opts.escapeAt! } : {},
  );
}
/** How long a plain drag holds still at its end: aim, indicator, room, and the others settling. */
const DWELL_THEN_ROOM = 650;

/** The panels' drag handles: their glyphs, their menus and the frozen layout (desk/grip.ts). */
const grips = createGrips({
  stage,
  construction,
  state,
  layout: () => layout,
  size: () => size,
  options,
  commit: (s) => !lifted && commit(s),
  busy: () => !!lifted,
  dragged: () => dragged,
  icon: doIcon,
  press: (key, e, from) => {
    const it = itemOf(key);
    dragged = false;
    if (it) onPress(it, e, TAB_HOLD, from);
  },
  pickUp: (key) => {
    const it = itemOf(key);
    if (it) onKeyPickUp(it, new KeyboardEvent("keydown", { key: " " }));
  },
  rectOf: stageRectOf,
});

const lab: DeskLab = {
  construction: () => cid,
  state,
  layout: () => layout,
  size: () => size,
  options,
  use: useConstruction,
  setOptions,
  setSize,
  open: doOpen,
  close: doClose,
  fold: doFold,
  touch: (id) => states.set(cid, touch(state(), id)),
  icon: doIcon,
  tab: doTab,
  focus: doFocus,
  drawn: (key) => itemOf(key)?.rect.value ?? null,
  shown: (key) => {
    const it = itemOf(key);
    return !!it && it.pop.value > 0.999;
  },
  idle,
  drag: scriptedDrag,
  path: playPath,
  keyboard: keyboardDrag,
  targets: (key) => targetsFor({ c: construction(), s0: without(state(), key), key, size, opt: options() }).map((t) => ({ id: t.id, prio: t.prio, hit: t.hit })),
  grip: (key) => {
    const it = itemOf(key);
    return it ? gripOf(it).at : null;
  },
  restart: () => setup(),
  preview: () => preview,
};
/** The running scenario's desk, to start it afresh. */
let setup: () => void = () => reset();

/** A keyboard drag: pick `key` up, step `steps` targets on with the arrow key (a moment on each), then Enter. */
async function keyboardDrag(key: string, steps: number): Promise<DragResult> {
  const it = itemOf(key);
  if (!it) return { log: [], landed: null };
  const press = (k: string): void => void document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const d = it.rect.value;
  const g = gripOf(it);
  beginDrag(it, d.x + (g.hold?.x ?? 40), d.y + (g.hold?.y ?? 11), g.hold ?? { x: 40, y: 11 }, g.from, true);
  for (let i = 0; i < steps; i++) {
    press("ArrowDown");
    // A moment on each stop: long enough for the room to be made and the item to snap in, and to be seen there.
    await wait(i === steps - 1 ? DWELL_THEN_ROOM : 400);
  }
  press("Enter");
  return { log: [...dragLog], landed: lastLanding };
}

initToolbarFrame(lab, stage);
const SCENARIOS: Record<string, Scenario> = { ...makeScenarios(lab), ...toolbarScenarios(lab), ...toolbarGroupScenarios(lab), ...gripScenarios(lab, grips) };
const runs: LabRun[] = [];

async function runScenario(name: string, mode: Preview): Promise<LabRun> {
  const sc = SCENARIOS[name]!;
  const c = sc.construction ?? DEFAULT_CONSTRUCTION;
  setPreview(mode);
  setup = () => reset(c, sc.size ? { width: sc.size[0], height: sc.size[1] } : { width: 960, height: 560 }, sc.options ?? {}, sc.docs ?? 2);
  setup();
  await nextFrame();
  await idle();
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
  // A scenario that only checks pure layouts moves nothing: "Something moved" is not its rule.
  const failed = lastRows.filter((r) => r.result && !r.result.ok && !(sc.still && r.name === "Something moved")).map((r) => r.name);
  const how = sc.drag ? (mode === "snap" ? " · snap to slot" : " · drop indicator") : "";
  const run: LabRun = { scenario: name, mode: constructionOf(c).title + how, failed, rows: lastRows };
  runs.push(run);
  const tr = document.createElement("tr");
  tr.innerHTML = "<td></td><td></td><td></td>";
  tr.children[0]!.textContent = name;
  tr.children[1]!.textContent = constructionOf(c).title + how;
  tr.children[2]!.textContent = failed.length ? failed.join(", ") : "none";
  (tr.children[2] as HTMLElement).className = failed.length ? "bad" : "ok";
  runsBody.append(tr);
  return run;
}

let runningAll = false;
let stopAll = false;
const runAllButton = document.querySelector("button[data-act=runall]") as HTMLButtonElement;

/** Run every scenario (or those whose name contains `filter`). */
async function runAll(filter?: string): Promise<LabRun[]> {
  if (runningAll) return [];
  runningAll = true;
  stopAll = false;
  runAllButton.textContent = "Stop scenarios";
  const before = { cid, size, preview };
  const out: LabRun[] = [];
  runsBody.replaceChildren();
  try {
    for (const name of Object.keys(SCENARIOS)) {
      if (filter && !name.includes(filter)) continue;
      // A drag runs with each preview (unless it is about one of them); everything else once.
      const sc = SCENARIOS[name]!;
      for (const mode of sc.preview ? [sc.preview] : sc.drag ? (["indicator", "snap"] as const) : [before.preview]) {
        if (stopAll) break;
        out.push(await runScenario(name, mode));
      }
    }
  } finally {
    // Each scenario pins its own stage size (960 × 560 unless it sets one); afterwards the stage fits again (with Fit
    // on) or takes back the size it had.
    setPreview(before.preview);
    runningAll = false;
    reset(before.cid, fit ? fitSize() : before.size);
    stopAll = false;
    runAllButton.textContent = "Run all scenarios";
  }
  return out;
}

// --- wiring --------------------------------------------------------------------------------------------------------

const switcher = document.getElementById("constructions") as HTMLFieldSetElement;
for (const c of CONSTRUCTIONS) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "construction";
  input.value = c.id;
  input.addEventListener("change", () => useConstruction(c.id));
  label.append(input, ` ${c.title}`);
  switcher.append(label);
}
document.querySelectorAll<HTMLInputElement>("input[name=toolbar]").forEach((input) =>
  input.addEventListener("change", () => {
    const [toolbar, toolbarSpace] = input.value.split("-") as [Options["toolbar"], Options["toolbarSpace"]];
    setOptions({ toolbar, toolbarSpace });
  }),
);
document.querySelectorAll<HTMLInputElement>("input[name=bottom]").forEach((input) => input.addEventListener("change", () => setOptions({ bottom: input.value as Options["bottom"] })));
document.querySelectorAll<HTMLInputElement>("input[name=tempo]").forEach((input) =>
  input.addEventListener("change", () => {
    tempo = input.value as Tempo;
    for (const it of items) {
      it.rect.configure({ omega: omega() });
      it.pop.configure({ omega: omega() });
    }
  }),
);
// --- the stage's size: fitted to the page, or set by hand ------------------------------------------------------------

/** The stage fits the page (Fit, the default) until a size is set by hand with the sliders or a preset. */
let fit = true;
/** Fit's bounds: the width between these (never wider than the page has room for), the height likewise. */
const FIT = { minWidth: 960, maxWidth: 1680, minHeight: 560, maxHeight: 960, below: 24 } as const;
const fitButton = document.querySelector("button[data-act=fit]") as HTMLButtonElement;

/**
 * The fitted size: the width the stage's container gives it (so the page never scrolls sideways), held to Fit's
 * bounds; the height the viewport has below the stage's top, less a margin, held to Fit's bounds.
 */
function fitSize(): Size {
  const box = stage.parentElement!;
  const cs = getComputedStyle(box);
  // The stage's border is 1 px each side: its content box (the desk) is 2 px less than its box.
  const room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
  const width = Math.floor(Math.min(room, Math.max(FIT.minWidth, Math.min(FIT.maxWidth, room))));
  const top = stage.getBoundingClientRect().top + window.scrollY;
  const height = Math.floor(Math.max(FIT.minHeight, Math.min(FIT.maxHeight, window.innerHeight - top - FIT.below - 2)));
  return { width, height };
}

function setFit(on: boolean): void {
  fit = on;
  fitButton.setAttribute("aria-pressed", String(on));
  fitButton.textContent = on ? "Fit ✓" : "Fit";
}

/** With Fit on, the stage takes the fitted size: everything settles to it (not while a drag or the scenarios run). */
function applyFit(): void {
  if (!fit || runningAll || lifted) return;
  const s = fitSize();
  if (s.width !== size.width || s.height !== size.height) setSize(s.width, s.height);
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyFit, 100);
});

for (const input of [wInput, hInput])
  input.addEventListener("input", () => {
    setFit(false);
    setSize(Number(wInput.value), Number(hInput.value));
  });
document.querySelectorAll<HTMLButtonElement>("button[data-size]").forEach((b) =>
  b.addEventListener("click", () => {
    const [w, h] = b.dataset.size!.split(",").map(Number) as [number, number];
    setFit(false);
    setSize(w, h);
  }),
);
const actions: Record<string, () => void> = {
  open: doOpen,
  close: doClose,
  fit: () => {
    setFit(true);
    applyFit();
  },
  reset: () => reset(cid, fit ? fitSize() : size),
  runall: () => {
    if (runningAll) {
      stopAll = true;
      runAllButton.textContent = "Stopping…";
    } else void runAll();
  },
};
document.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) => b.addEventListener("click", () => actions[b.dataset.act!]?.()));

/** A preview chosen while an item is held: it takes effect when the drag ends (switching mid-drag would leave the
 * snap and the indicator half in one preview, half in the other). */
let nextPreview: Preview | null = null;

function setPreview(m: Preview): void {
  (document.querySelector(`input[name=preview][value=${m}]`) as HTMLInputElement).checked = true;
  if (lifted) {
    nextPreview = m;
    return;
  }
  nextPreview = null;
  preview = m;
}
document.querySelectorAll<HTMLInputElement>("input[name=preview]").forEach((input) => input.addEventListener("change", () => setPreview(input.value as Preview)));
tempo = (document.querySelector<HTMLInputElement>("input[name=tempo]:checked")?.value as Tempo | undefined) ?? tempo;
preview = (document.querySelector<HTMLInputElement>("input[name=preview]:checked")?.value as Preview | undefined) ?? preview;
setFit(true);
reset(DEFAULT_CONSTRUCTION, fitSize());

window.__motionLab = {
  runAll,
  runs,
  lastRows: () => lastRows,
  // Only to check that the snap scenarios catch a snap on raw hover, with the drag model's gate removed.
  snapGate: (g) => {
    snapGate = g;
  },
};
