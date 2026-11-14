/**
 * The board the floats page and the store, freeze and no-jump page share: a window-like stage with a bar of groups
 * along the top, a column of panels and groups down the left, the pages (a scrolling sheet) filling the rest, and
 * floats above everything. Items are docked in the bar or the column (`fitStack`, drops by `stackTargets`) or float
 * (`fitFloat`, drops by `floatTarget`); a float is in the stage's own px, so the pages scrolling under it never move
 * it. Drags run on @n-uf/motion/drag's intent and previewPlan. The page writes every word.
 *
 * - Stored form: `storeStack` for each stack and `storeFloats` for the floats, in localStorage under `key`. `reload()`
 *   throws the in-memory arrangement away (everything docked in the column), then rebuilds from the stored form.
 * - Frozen: grips hidden, nothing moves. The freeze is the app's flag, read once at the press (as case 8 of the kit
 *   cases does): a press without Alt while frozen never becomes a drag, so no target is built and nothing is dropped;
 *   holding Alt shows the grips and everything works, a drag that began finishes. The library needs nothing for it.
 * - Count and phase: each item has a count badge (a fixed slot, "99+" at most) and a phase; neither is an input to the
 *   solver, so changing one moves no item.
 */
import type { Rect } from "@n-uf/motion";
import { DRAG_DEFAULTS, createDragIntent, previewPlan, type DragIntent, type DragTarget } from "@n-uf/motion/drag";
import {
  fitFloat,
  fitStack,
  floatTarget,
  readFloats,
  readStack,
  stackTargets,
  storeFloats,
  storeStack,
  type FloatTarget,
  type StackFit,
  type StackFloat,
  type StackInput,
  type StackState,
  type StackTarget,
} from "@n-uf/placement/stack";
import { ALL, FLOAT_SIZE, defaultMeta, inputOf, isPanel, itemOf, titleOf, type ItemId, type ItemMeta, type Phase, type Placed } from "./sample";
import { createStackView, dress, type StackView } from "./view";
import { sayFit } from "./words";

export type Side = "column" | "bar";
const SIDES: readonly Side[] = ["column", "bar"];
const AXIS = { column: "column", bar: "row" } as const;

/**
 * The stage (its height is the window's: `setHeight` changes it, in place, and the column is as long as what is left
 * under the bar), and the bar's fixed thickness (a bar of groups is a rail tall).
 */
export const STAGE = { width: 880, height: 500 };
export const STAGE_HEIGHT = { min: 240, max: 500 };
export const BAR_H = 32;
export const ORIGIN: Record<Side, { x: number; y: number }> = { bar: { x: 0, y: 0 }, column: { x: 0, y: BAR_H } };
export const STAGE_RECT: Rect = { x: 0, y: 0, width: STAGE.width, height: STAGE.height };
const LENGTH: Record<Side, number> = { column: STAGE.height - BAR_H, bar: STAGE.width };
/** The app widens a gap's zone across a thin stack so it is easy to hit, and past the stack's far ends. */
const REACH = { column: 44, bar: 40 };
const END_REACH = 24;

export interface Layout {
  /** Where each side's items go; the order is the stack's. */
  readonly column: readonly ItemId[];
  readonly bar: readonly ItemId[];
  readonly floats: readonly { readonly id: ItemId; readonly rect: Rect }[];
}
export const DEFAULT_LAYOUT: Layout = {
  column: ["pages", "annotations"],
  bar: ["views", "tools", "zoom"],
  floats: [{ id: "findings", rect: { x: 440, y: 130, width: 220, height: 190 } }],
};

interface State {
  orders: Record<Side, ItemId[]>;
  floats: StackFloat[];
  used: Record<ItemId, number>;
  kept: Set<ItemId>;
  from: Partial<Record<ItemId, number>>;
  meta: Record<ItemId, ItemMeta>;
}

const sideKeys = (key: string): Record<Side | "floats", string> => ({ column: `${key}:column`, bar: `${key}:bar`, floats: `${key}:floats` });

export interface BoardOptions {
  /** The stage and the status line the page markup gives. */
  readonly stage: HTMLElement;
  readonly status: HTMLElement;
  /** localStorage key prefix for the stored form. */
  readonly key: string;
  /** Write the stored form after every change (default true). */
  readonly autosave?: boolean;
  /** Load the stored form when the board is made (default false: the page starts from its default layout). */
  readonly restore?: boolean;
  /** Called after the arrangement, a count or phase, or the freeze changed (the page refreshes its readouts). */
  readonly onChange?: () => void;
}

/** Where an item is: a docked place, a float or the » menu. */
export type Where = { readonly kind: "dock"; readonly side: Side; readonly at: number } | { readonly kind: "float" };

export interface Seen {
  readonly id: ItemId;
  readonly where: Where;
  /** The form's kind (a float: "open" / "row"; in the » menu: "menu"). */
  readonly kind: string;
  readonly form: number;
  /** The rect the DOM draws it at (stage px); for an item in the menu, the » entry's. */
  readonly rect: Rect;
}

/** What a drop did, as the DOM and the solvers say. */
export interface DropRecord {
  readonly id: ItemId;
  readonly landed: Where | null;
  readonly shown: string | null;
  readonly previewDom: Rect | null;
  readonly previewSolve: Rect | null;
  readonly landedDom: Rect | null;
  readonly landedSolve: Rect | null;
  readonly cancelled: boolean;
}

interface DockT extends DragTarget {
  readonly kind: "dock";
  readonly priority: 2;
  readonly slot: Rect;
  readonly side: Side;
  readonly at: number;
  readonly target: StackTarget;
  readonly marker: Rect;
  readonly label: string;
}
interface FloatT extends DragTarget {
  readonly kind: "float";
  readonly priority: 3;
  readonly free: true;
  readonly target: FloatTarget;
  readonly label: string;
}
export type BoardTarget = DockT | FloatT;
export type { DockT, FloatT };

export interface LoadReport {
  /** Something stored was read and applied (otherwise the arrangement is left as it was). */
  readonly restored: boolean;
  /** Everything stored was read without an error. */
  readonly ok: boolean;
  /** What each stored piece dropped, listed as the readers list it (`dropped`), or why it couldn't be read. */
  readonly column: readonly string[];
  readonly bar: readonly string[];
  readonly floats: readonly string[];
  readonly errors: readonly string[];
}

const px = (n: number): string => `${n}px`;
const shiftBy = (r: Rect, o: { x: number; y: number }): Rect => ({ x: r.x + o.x, y: r.y + o.y, width: r.width, height: r.height });
const stackOfId = (s: State, id: ItemId): Side | null => SIDES.find((n) => s.orders[n].includes(id)) ?? null;

export function createBoard(opt: BoardOptions) {
  const { stage, status } = opt;
  const keys = sideKeys(opt.key);
  const autosave = opt.autosave ?? true;
  const clearStage = (): void => stage.replaceChildren();

  // --- state -----------------------------------------------------------------------------------------------------------

  const fresh = (l: Layout = DEFAULT_LAYOUT): State => ({
    orders: { column: [...l.column], bar: [...l.bar] },
    floats: l.floats.map((f) => ({ id: f.id, rect: { ...f.rect } })),
    used: { pages: 1, annotations: 2, findings: 3, views: 4, tools: 5, zoom: 6 },
    kept: new Set(),
    from: {},
    meta: defaultMeta(),
  });
  let st = fresh();
  let clock = 6;
  let frozen = false;
  let altDown = false;
  let lastDrop: DropRecord | null = null;

  // --- the stage ---------------------------------------------------------------------------------------------------------

  clearStage();
  stage.style.width = px(STAGE.width);
  stage.style.height = px(STAGE.height);
  const scroller = document.createElement("div");
  scroller.className = "fl-pages";
  scroller.setAttribute("aria-label", "Pages");
  scroller.innerHTML = `<div class="fl-sheet">${[1, 2, 3, 4]
    .map((n) => `<div class="fl-page"><h4>Page ${n}</h4>${'<div class="st-l"></div>'.repeat(10)}<div class="st-l short"></div></div>`)
    .join("")}</div>`;
  stage.append(scroller);
  const metaOf = (id: string): ItemMeta | undefined => st.meta[id as ItemId];
  const views: Record<Side, StackView> = {
    bar: createStackView(stage, "row", "Bar", metaOf),
    column: createStackView(stage, "column", "Column", metaOf),
  };
  for (const n of SIDES) {
    views[n].el.style.left = px(ORIGIN[n].x);
    views[n].el.style.top = px(ORIGIN[n].y);
    views[n].el.style.zIndex = "5";
  }
  const ind = document.createElement("div");
  ind.className = "st-ind";
  const indLabel = document.createElement("div");
  indLabel.className = "st-ind-label";
  const marker = document.createElement("div");
  marker.className = "st-marker";
  ind.hidden = indLabel.hidden = marker.hidden = true;
  stage.append(ind, indLabel, marker);
  const floatEls = new Map<string, HTMLElement>();

  // --- layout ----------------------------------------------------------------------------------------------------------------

  const placedOf = (id: ItemId): Placed => ({ id, used: st.used[id], kept: st.kept.has(id), from: st.from[id] ?? 0, badge: true });
  const inputFor = (side: Side, without?: ItemId): StackInput => inputOf(AXIS[side], LENGTH[side], st.orders[side].filter((id) => id !== without).map(placedOf));
  const fitsWithout = (without?: ItemId): Record<Side, StackFit> => ({ column: fitStack(inputFor("column", without)), bar: fitStack(inputFor("bar", without)) });

  /** The docked content, in stage px: every drawn item's rect and each » entry (the dragged item `without` left out). */
  function avoidRects(without?: ItemId): Rect[] {
    const fits = fitsWithout(without);
    const out: Rect[] = [];
    for (const n of SIDES) {
      for (const p of fits[n].items) if (p.kind !== "menu") out.push(shiftBy(p.rect, ORIGIN[n]));
      if (fits[n].menu) out.push(shiftBy(fits[n].menu!.rect, ORIGIN[n]));
    }
    return out;
  }

  /** Every float lies inside the stage and clear of the docked content (the stacks may have grown under it). */
  function refloat(): void {
    const avoid = avoidRects();
    st.floats = st.floats.map((f) => ({ id: f.id, rect: fitFloat(f.rect, STAGE_RECT, avoid).rect }));
  }

  const domRect = (el: Element): Rect => {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left - stage.clientLeft, y: r.top - s.top - stage.clientTop, width: r.width, height: r.height };
  };
  const stagePoint = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left - stage.clientLeft, y: e.clientY - r.top - stage.clientTop };
  };

  // --- drawing -----------------------------------------------------------------------------------------------------------------

  const floatKind = (id: ItemId): "open" | "row" => (isPanel(id) ? "open" : "row");

  function drawFloats(lifted?: ItemId): void {
    const live = new Set(st.floats.map((f) => f.id));
    for (const [id, el] of floatEls) {
      if (!live.has(id as ItemId)) {
        el.remove();
        floatEls.delete(id);
      }
    }
    st.floats.forEach((f, i) => {
      let el = floatEls.get(f.id);
      if (!el) {
        el = document.createElement("section");
        el.className = `st-item st-float ${isPanel(f.id) ? "st-panel" : "st-group"}`;
        el.dataset.id = f.id;
        stage.append(el);
        floatEls.set(f.id, el);
      }
      const m = st.meta[f.id as ItemId];
      const sig = `${floatKind(f.id as ItemId)}|${m.count}|${m.phase}`;
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.dataset.kind = floatKind(f.id as ItemId);
        el.innerHTML = dress(f.id, floatKind(f.id as ItemId), m);
      }
      el.dataset.phase = m.phase;
      el.hidden = f.id === lifted;
      Object.assign(el.style, { left: px(f.rect.x), top: px(f.rect.y), width: px(f.rect.width), height: px(f.rect.height), zIndex: String(10 + i) });
    });
  }

  /** Draw: the stacks from the state (the dragged item lifted out), or with the room a gap makes; then the floats. */
  function draw(room: DockT | null, lifted?: ItemId): void {
    const fits = fitsWithout(lifted);
    for (const n of SIDES) {
      if (room && room.side === n) views[n].draw(room.target.fit, room.target.item);
      else views[n].draw(fits[n]);
    }
    const colCross = room?.side === "column" ? room.target.fit.cross : fits.column.cross;
    Object.assign(scroller.style, { left: px(colCross), top: px(BAR_H), width: px(STAGE.width - colCross), height: px(STAGE.height - BAR_H) });
    drawFloats(lifted);
    syncGrips();
  }
  const settle = (): void => {
    draw(null);
    if (autosave) save();
    opt.onChange?.();
  };

  function syncGrips(): void {
    stage.dataset.grips = !frozen || altDown ? "shown" : "hidden";
    stage.dataset.frozen = String(frozen);
  }

  // --- the stored form -------------------------------------------------------------------------------------------------------

  const stateOf = (side: Side): StackState => {
    const order = st.orders[side];
    const byAge = [...order].sort((a, b) => st.used[a] - st.used[b]);
    const forms: Record<string, number> = {};
    for (const id of order) if ((st.from[id] ?? 0) >= 1) forms[id] = st.from[id]!;
    return { order, kept: order.filter((id) => st.kept.has(id)), closed: [], used: byAge, forms };
  };
  const parse = (text: string | null): unknown => {
    if (text === null) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return Symbol.for("unparsable");
    }
  };
  function stored(): { column: string; bar: string; floats: string } {
    return { column: JSON.stringify(storeStack(stateOf("column"))), bar: JSON.stringify(storeStack(stateOf("bar"))), floats: JSON.stringify(storeFloats(st.floats)) };
  }
  function save(): void {
    try {
      const s = stored();
      localStorage.setItem(keys.column, s.column);
      localStorage.setItem(keys.bar, s.bar);
      localStorage.setItem(keys.floats, s.floats);
    } catch {
      // No storage (a private window): the page still works, it just forgets.
    }
  }
  const read = (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  function clearStored(): void {
    try {
      for (const k of Object.values(keys)) localStorage.removeItem(k);
    } catch {
      // See `save`.
    }
  }

  /**
   * Rebuild from the stored form: the stacks' order, kept, use order and folded-by-hand forms, and the floats'
   * rects. Whatever can't be read leaves that piece as it is; an item no piece places is docked in the column or the
   * bar by its kind. Never throws.
   */
  function load(): LoadReport {
    const errors: string[] = [];
    const dropped: Record<Side | "floats", string[]> = { column: [], bar: [], floats: [] };
    const next = fresh({ column: [], bar: [], floats: [] });
    const placed = new Set<ItemId>();
    let any = false;
    for (const side of SIDES) {
      const raw = parse(read(keys[side]));
      if (raw === undefined) continue;
      const r = readStack(raw, ALL);
      if (!r.ok) {
        errors.push(`${side}: ${r.error}`);
        continue;
      }
      any = true;
      dropped[side] = [...r.dropped];
      for (const id of r.state.order as ItemId[]) {
        if (placed.has(id)) {
          dropped[side].push(`placed twice:${id}`);
          continue;
        }
        placed.add(id);
        next.orders[side].push(id);
      }
      r.state.used.forEach((id, i) => {
        if (next.orders[side].includes(id as ItemId)) next.used[id as ItemId] = i + 1;
      });
      for (const id of r.state.kept) if (next.orders[side].includes(id as ItemId)) next.kept.add(id as ItemId);
      for (const [id, f] of Object.entries(r.state.forms)) if (next.orders[side].includes(id as ItemId)) next.from[id as ItemId] = f;
    }
    const rawFloats = parse(read(keys.floats));
    if (rawFloats !== undefined) {
      const r = readFloats(rawFloats, ALL);
      if (!r.ok) errors.push(`floats: ${r.error}`);
      else {
        any = true;
        dropped.floats = [...r.dropped];
        for (const f of r.floats) {
          if (placed.has(f.id as ItemId)) dropped.floats.push(`docked too:${f.id}`);
          else {
            placed.add(f.id as ItemId);
            next.floats.push({ id: f.id as ItemId, rect: f.rect } as StackFloat);
          }
        }
      }
    }
    if (!any) return { restored: false, ok: false, column: [], bar: [], floats: [], errors: errors.length ? errors : ["nothing stored"] };
    // Anything no piece placed is docked by its kind, after what is there.
    for (const id of ALL) if (!placed.has(id)) next.orders[isPanel(id) ? "column" : "bar"].push(id);
    st = { ...next, meta: st.meta };
    clock = Math.max(clock, ...Object.values(st.used));
    refloat();
    settle();
    say(`Restored from the stored form. ${readout()}`);
    return { restored: true, ok: errors.length === 0, column: dropped.column, bar: dropped.bar, floats: dropped.floats, errors };
  }

  /** The Reload button: forget the arrangement in memory (everything docked in the column), then rebuild from the stored form. */
  function reload(between?: () => void): LoadReport {
    if (drag) endDrag(true);
    const meta = st.meta;
    st = fresh({ column: [...ALL], bar: [], floats: [] });
    st.meta = meta;
    // Drawn, not saved: the stored form is what is about to be read. `between` sees the blank arrangement.
    draw(null);
    between?.();
    const rep = load();
    // Nothing usable stored: the page's own default arrangement, not the blank one.
    if (!rep.restored) {
      st = fresh();
      st.meta = meta;
      settle();
      say(`Nothing usable stored (${rep.errors.join("; ")}): the default arrangement. ${readout()}`);
    }
    return rep;
  }

  // --- targets -------------------------------------------------------------------------------------------------------------------

  const Cap = (s: Side): string => (s === "column" ? "Column" : "Bar");
  function gapWords(side: Side, at: number, without: ItemId): string {
    const order = st.orders[side].filter((id) => id !== without);
    return `${Cap(side)} · ${at < order.length ? `before ${titleOf(order[at]!)}` : "at the end"}`;
  }
  const sidesFor = (id: ItemId): readonly Side[] => (isPanel(id) ? ["column"] : SIDES);

  /** Every place for dragging `id`: the gaps of the stacks it may dock in (stage px), and the float target. */
  function targetsFor(id: ItemId): BoardTarget[] {
    const out: BoardTarget[] = [];
    for (const side of sidesFor(id)) {
      const dragged = itemOf(placedOf(id), AXIS[side]);
      const targets = stackTargets(inputFor(side, id), dragged);
      const o = ORIGIN[side];
      for (const t of targets) {
        const hit = shiftBy(t.hit, o);
        const last = t.place.at === targets.length - 1;
        const first = t.place.at === 0;
        let wide: Rect;
        if (side === "column") {
          wide = { ...hit, width: Math.max(hit.width, REACH.column) };
          // Past the column's far end (the stage's bottom edge); its near end is the bar's.
          wide = { ...wide, height: wide.height + (last ? END_REACH : 0) };
        } else {
          wide = { ...hit, height: Math.max(hit.height, REACH.bar) };
          wide = { ...wide, x: wide.x - (first ? END_REACH : 0), width: wide.width + (first ? END_REACH : 0) + (last ? END_REACH : 0) };
        }
        out.push({ kind: "dock", id: `${side}:${t.id}`, priority: 2, hit: wide, slot: shiftBy(t.slot!, o), side, at: t.place.at, target: t, marker: shiftBy(t.marker, o), label: gapWords(side, t.place.at, id) });
      }
    }
    const ft = floatTarget({ id, stage: STAGE_RECT, size: FLOAT_SIZE[id], avoid: avoidRects(id) });
    out.push({ kind: "float", id: ft.id, priority: 3, free: true, hit: ft.hit, label: ft.label!, target: ft });
    return out;
  }

  // --- a drag ----------------------------------------------------------------------------------------------------------------------

  interface Point {
    x: number;
    y: number;
  }
  interface Held {
    readonly id: ItemId;
    readonly grab: Point;
    readonly home: Rect;
    readonly el: HTMLElement;
    readonly intent: DragIntent<BoardTarget>;
    readonly targets: readonly BoardTarget[];
    /** The float drop the preview showed on the last frame. */
    floatDrop: ReturnType<FloatTarget["make"]> | null;
    pointer: Point;
    shown: BoardTarget | null;
    room: DockT | null;
    raf: number;
  }
  let drag: Held | null = null;

  const whereIs = (id: ItemId): Where | null => {
    const side = stackOfId(st, id);
    if (side) return { kind: "dock", side, at: st.orders[side].indexOf(id) };
    return st.floats.some((f) => f.id === id) ? { kind: "float" } : null;
  };

  function floatWords(d: ReturnType<FloatTarget["make"]>): string {
    return `Float here${d.fit.snapped ? " · moved clear of the docked items" : d.fit.clamped ? " · kept inside the stage" : ""}`;
  }

  function showPreview(rectOf: Rect | null, text: string, id: ItemId, line?: Rect): void {
    if (!rectOf) {
      ind.hidden = indLabel.hidden = marker.hidden = true;
      return;
    }
    Object.assign(ind.style, { left: px(rectOf.x), top: px(rectOf.y), width: px(rectOf.width), height: px(rectOf.height) });
    indLabel.textContent = `${titleOf(id)} → ${text}`;
    Object.assign(indLabel.style, { left: px(Math.max(4, rectOf.x + 4)), top: px(Math.max(4, rectOf.y + 4)) });
    ind.hidden = indLabel.hidden = false;
    if (line) {
      Object.assign(marker.style, line.height === 0 ? { left: px(line.x), top: px(line.y - 1.5), width: px(line.width), height: "3px" } : { left: px(line.x - 1.5), top: px(line.y), width: "3px", height: px(line.height) });
      marker.hidden = false;
    } else marker.hidden = true;
  }

  function beginDrag(id: ItemId, start: Point, p: Point): void {
    const where = whereIs(id);
    const itemEl = where?.kind === "dock" ? views[where.side].itemEl(id) : floatEls.get(id);
    if (!where || !itemEl || itemEl.hidden) return;
    const was = domRect(itemEl);
    const grab = { x: start.x - was.x, y: start.y - was.y };
    const el = document.createElement("section");
    el.className = `st-item st-held ${isPanel(id) ? "st-panel" : "st-group"}`;
    const kind = itemEl.dataset.kind!;
    el.dataset.kind = kind;
    el.innerHTML = dress(id, kind as Parameters<typeof dress>[1], st.meta[id]);
    Object.assign(el.style, { width: px(was.width), height: px(was.height), left: px(p.x - grab.x), top: px(p.y - grab.y) });
    stage.append(el);
    // The item is lifted out of where it was: the stacks are drawn without it.
    draw(null, id);
    const targets = targetsFor(id);
    // A docked item's home is its place (a release there does nothing); a float is moved anywhere, so its home is the point.
    const home: Rect = where.kind === "dock" ? was : { x: start.x, y: start.y, width: 0, height: 0 };
    const intent = createDragIntent<BoardTarget>({ home });
    drag = { id, grab, home, el, intent, targets, floatDrop: null, pointer: p, shown: null, room: null, raf: 0 };
    stage.classList.add("dragging");
    const loop = (): void => {
      if (!drag) return;
      aim(performance.now());
      drag.raf = requestAnimationFrame(loop);
    };
    drag.raf = requestAnimationFrame(loop);
    say(`${titleOf(id)} lifted. Move over a gap, or anywhere else to float it.`);
  }

  /** Once a frame while an item is held: the intent says what shows; the preview says what moves. */
  function aim(now: number): void {
    const d = drag;
    if (!d) return;
    Object.assign(d.el.style, { left: px(d.pointer.x - d.grab.x), top: px(d.pointer.y - d.grab.y) });
    const f = d.intent.update(d.pointer, now, d.targets);
    const plan = previewPlan(f, "gap");
    const room = plan.makeRoom && f.shown?.kind === "dock" ? f.shown : null;
    if (room?.id !== d.room?.id) {
      d.room = room;
      draw(room, d.id);
    }
    if (f.shown?.id !== d.shown?.id) say(f.shown ? `${titleOf(d.id)} → ${f.shown.label}: release to drop it on the dashed rectangle.` : `${titleOf(d.id)}: move over a gap, or anywhere else to float it.`);
    d.shown = f.shown;
    d.floatDrop = null;
    const s = plan.showIndicator ? f.shown : null;
    if (!s) showPreview(null, "", d.id);
    else if (s.kind === "dock") showPreview(s.slot, s.label, d.id, s.marker);
    else {
      // A float's preview is its drop: where the pointer holds it, clamped into the stage and clear of the docked items.
      d.floatDrop = s.target.make(d.pointer, d.grab);
      showPreview(d.floatDrop.rect, floatWords(d.floatDrop), d.id);
    }
  }

  function endDrag(cancel: boolean): void {
    const d = drag;
    if (!d) return;
    if (!cancel) aim(performance.now());
    const t = cancel ? null : d.intent.release(d.pointer, d.targets);
    cancelAnimationFrame(d.raf);
    const shown = d.shown;
    const previewDom = ind.hidden ? null : domRect(ind);
    let previewSolve: Rect | null = null;
    if (shown?.kind === "dock") previewSolve = shown.slot;
    else if (shown?.kind === "float") previewSolve = d.floatDrop?.rect ?? null;
    drag = null;
    d.el.remove();
    stage.classList.remove("dragging");
    showPreview(null, "", d.id);
    let landedSolve: Rect | null = null;
    let landed: Where | null = null;
    const id = d.id;
    if (t?.kind === "dock") {
      for (const n of SIDES) st.orders[n] = st.orders[n].filter((x) => x !== id);
      st.floats = st.floats.filter((f) => f.id !== id);
      st.orders[t.side].splice(t.at, 0, id);
      st.used[id] = ++clock;
      landedSolve = t.slot;
      landed = { kind: "dock", side: t.side, at: t.at };
    } else if (t?.kind === "float") {
      const drop = t.target.make(d.pointer, d.grab);
      for (const n of SIDES) st.orders[n] = st.orders[n].filter((x) => x !== id);
      st.floats = [...st.floats.filter((f) => f.id !== id), { id, rect: drop.rect }];
      st.used[id] = ++clock;
      landedSolve = drop.rect;
      landed = { kind: "float" };
    }
    // A stack that grew may lie under a float: every float is fitted again.
    refloat();
    settle();
    let landedDom: Rect | null = null;
    const now = whereIs(id);
    if (now?.kind === "dock") {
      const el = views[now.side].itemEl(id);
      if (el && !el.hidden) landedDom = domRect(el);
    } else if (now?.kind === "float") landedDom = domRect(floatEls.get(id)!);
    lastDrop = { id, landed, shown: shown?.id ?? null, previewDom, previewSolve, landedDom, landedSolve, cancelled: cancel };
    if (landed) say(`${titleOf(id)} → ${t!.label}. ${readout()}`);
    else say(cancel ? "Cancelled: back where it was." : "No target: it went home.");
  }

  // --- input ---------------------------------------------------------------------------------------------------------------------------

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
    const stop = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
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
        endDrag(true);
        stop();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
  }

  /** The gate at the press: the freeze (and Alt) are read here, once. A drag that began finishes whatever happens to Alt. */
  const allowed = (e: { altKey: boolean }): boolean => !frozen || altDown || e.altKey;

  stage.addEventListener("pointerdown", (e) => {
    if (drag) return;
    const t = e.target as HTMLElement;
    const it = t.closest<HTMLElement>(".st-item");
    if (!it || !t.closest("[data-grab]")) return;
    if (!allowed(e)) {
      say("Frozen: nothing moves. Hold Alt to move.");
      return;
    }
    track(e, it.dataset.id as ItemId);
  });
  // Folding a docked panel by hand: a double-click on its header (it starts at its header from then on, or back open).
  stage.addEventListener("dblclick", (e) => {
    const head = (e.target as HTMLElement).closest<HTMLElement>(".st-head");
    const it = head?.closest<HTMLElement>(".st-item.st-panel:not(.st-float)");
    if (!it) return;
    if (!allowed(e)) {
      say("Frozen: nothing moves. Hold Alt to fold.");
      return;
    }
    fold(it.dataset.id as ItemId);
  });
  const altKey = (down: boolean) => (ev: KeyboardEvent): void => {
    if (ev.key !== "Alt") return;
    altDown = down;
    syncGrips();
  };
  window.addEventListener("keydown", altKey(true));
  window.addEventListener("keyup", altKey(false));
  window.addEventListener("blur", () => {
    altDown = false;
    syncGrips();
  });

  // --- the page's actions ----------------------------------------------------------------------------------------------------------------

  function say(text: string): void {
    status.textContent = text;
  }
  const readout = (): string => `${sayFit("Column", views.column.fit()!)} ${sayFit("Bar", views.bar.fit()!)}`;

  /** Fold a docked panel to its header by hand, or open it again. */
  function fold(id: ItemId): void {
    if (!isPanel(id) || !stackOfId(st, id)) return;
    st.from[id] = (st.from[id] ?? 0) >= 1 ? 0 : 1;
    if (st.from[id] === 0) delete st.from[id];
    st.used[id] = ++clock;
    settle();
    say(`${titleOf(id)} ${st.from[id] ? "folded to its header" : "opened"}. ${readout()}`);
  }
  function keep(id: ItemId, on: boolean): void {
    if (on) st.kept.add(id);
    else st.kept.delete(id);
    settle();
  }
  function setMeta(id: ItemId, patch: Partial<{ count: number; phase: Phase }>): void {
    st.meta[id] = { ...st.meta[id], ...patch };
    draw(null);
    opt.onChange?.();
  }
  function setFrozen(on: boolean): void {
    frozen = on;
    syncGrips();
    opt.onChange?.();
    say(on ? "Frozen: the grips are hidden and nothing moves. Hold Alt to move." : "Unfrozen.");
  }
  /** Put the items where a scenario wants them. */
  function setLayout(l: Layout, extra?: { used?: Partial<Record<ItemId, number>>; kept?: readonly ItemId[]; from?: Partial<Record<ItemId, number>> }): void {
    if (drag) endDrag(true);
    st.orders = { column: [...l.column], bar: [...l.bar] };
    st.floats = l.floats.map((f) => ({ id: f.id, rect: { ...f.rect } }));
    if (extra?.used) for (const [id, n] of Object.entries(extra.used)) st.used[id as ItemId] = n!;
    if (extra?.kept) st.kept = new Set(extra.kept);
    if (extra?.from) st.from = { ...extra.from };
    clock = Math.max(clock, ...Object.values(st.used));
    refloat();
    settle();
  }
  /** The window's height: the stage, the column (what is left under the bar) and the pages. */
  function applyHeight(h: number): void {
    const height = Math.min(Math.max(Math.round(h), STAGE_HEIGHT.min), STAGE_HEIGHT.max);
    STAGE.height = height;
    STAGE_RECT.height = height;
    LENGTH.column = height - BAR_H;
    stage.style.height = px(height);
  }
  /** Resize the window: the column gives way or grows, and a float the stage no longer holds is clamped back in. */
  function setHeight(h: number): void {
    if (drag) endDrag(true);
    applyHeight(h);
    refloat();
    settle();
    say(readout());
  }
  function reset(): void {
    if (drag) endDrag(true);
    clearStored();
    applyHeight(STAGE_HEIGHT.max);
    st = fresh();
    clock = 6;
    frozen = false;
    altDown = false;
    lastDrop = null;
    scroller.scrollTop = 0;
    settle();
    say(readout());
  }

  /** Every item as the DOM draws it now: where it is, its form and its rect (stage px). */
  function seen(): Seen[] {
    const out: Seen[] = [];
    for (const id of ALL) {
      const w = whereIs(id);
      if (!w) continue;
      if (w.kind === "float") {
        const el = floatEls.get(id)!;
        out.push({ id, where: w, kind: el.dataset.kind!, form: 0, rect: domRect(el) });
        continue;
      }
      const fit = views[w.side].fit()!;
      const p = fit.items.find((x) => x.id === id)!;
      const el = views[w.side].itemEl(id)!;
      const r = p.kind === "menu" ? shiftBy(fit.menu!.rect, ORIGIN[w.side]) : domRect(el);
      out.push({ id, where: w, kind: p.kind, form: p.form, rect: r });
    }
    return out;
  }

  /** The solvers' rects (no DOM): each docked item's rect from its fit, in stage px, by id. */
  function solved(): Map<string, Rect> {
    const out = new Map<string, Rect>();
    for (const n of SIDES) for (const p of views[n].fit()!.items) out.set(p.id, shiftBy(p.rect, ORIGIN[n]));
    for (const f of st.floats) out.set(f.id, { ...f.rect });
    return out;
  }

  draw(null);
  if (opt.restore) load();
  say(readout());

  return {
    stage,
    views,
    scroller,
    ind,
    indLabel,
    marker,
    reset,
    reload,
    load,
    save,
    stored,
    setLayout,
    setHeight,
    setMeta,
    setFrozen,
    fold,
    keep,
    targetsFor,
    seen,
    solved,
    avoidRects,
    refloat: (): void => {
      refloat();
      settle();
    },
    storageKeys: keys,
    domRect,
    /** An item's element: docked in a stack (not in the » menu) or floating. */
    itemEl(id: ItemId): HTMLElement | undefined {
      const w = whereIs(id);
      return w?.kind === "dock" ? views[w.side].itemEl(id) : w?.kind === "float" ? floatEls.get(id) : undefined;
    },
    /** The part of an item a person grabs. */
    gripOf(id: ItemId): HTMLElement | undefined {
      const w = whereIs(id);
      const el = w?.kind === "dock" ? views[w.side].itemEl(id) : floatEls.get(id);
      return el && !el.hidden ? (el.querySelector<HTMLElement>("[data-grab]") ?? undefined) : undefined;
    },
    /** The first page heading's rect (stage px): it moves with the pages. */
    sheetMark: (): Rect => domRect(scroller.querySelector(".fl-page h4")!),
    get orders() {
      return { column: [...st.orders.column], bar: [...st.orders.bar] };
    },
    get floats() {
      return st.floats.map((f) => ({ id: f.id, rect: { ...f.rect } }));
    },
    get meta() {
      return structuredClone(st.meta);
    },
    get used() {
      return { ...st.used };
    },
    get from() {
      return { ...st.from };
    },
    get kept() {
      return [...st.kept];
    },
    get height() {
      return STAGE.height;
    },
    get frozen() {
      return frozen;
    },
    get altDown() {
      return altDown;
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
    /** How many grips the person can see: not hidden by the freeze, drawn in a shown item. */
    visibleGrips(): number {
      return [...stage.querySelectorAll<HTMLElement>(".st-grip")].filter((g) => !g.closest("[hidden]") && getComputedStyle(g).visibility !== "hidden").length;
    },
    fits: () => ({ column: views.column.fit()!, bar: views.bar.fit()! }),
    origin: ORIGIN,
  };
}
export type Board = ReturnType<typeof createBoard>;
