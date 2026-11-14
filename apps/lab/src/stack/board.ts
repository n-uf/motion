/**
 * The board the floats page and the store, freeze and no-jump page share: a window-like stage with a bar of groups
 * along the top, a column of panels and groups down the left, the pages (a scrolling sheet) filling the rest, and
 * floats above everything. Items are docked in the bar or the column (`fitStack`, drops by `stackTargets`) or float
 * (`fitFloat`, drops by `stackFloatTarget`); a float is in the stage's own px, so the pages scrolling under it never
 * move it. Drags run on @n-uf/motion/drag's intent and previewPlan. The page writes every word.
 *
 * - Stored form: `storeStack` for each stack and `storeFloats` for the floats, in localStorage under `key`. `rebuild()`
 *   throws the in-memory arrangement away (everything docked in the column), then rebuilds from the stored form; a
 *   browser reload does the same at load (the page starts with `restore`).
 * - Frozen: grips hidden, nothing moves. The freeze is the app's flag, read once at the press (as case 8 of the kit
 *   cases does): a press without Alt while frozen never becomes a drag, so no target is built and nothing is dropped;
 *   holding Alt shows the grips and everything works, a drag that began finishes. The library needs nothing for it.
 * - Count and phase: each item has a count badge (a fixed slot, "99+" at most) and a phase. The solver is given sizes,
 *   never a count or a phase, so with sizes that don't depend on them changing one moves no other item. `setMeasured`
 *   is the control that breaks that on purpose: a bar group's row form is then measured from its words and its badge
 *   (which grows with its digits), so a count with more digits does move the items after it.
 *
 * With `edge` it is the Edge stack page's one stage: the top bar is a toolbar edge (40 px tall at most, `strictCross`;
 * groups fold in line, the ranked primary last, real gaps and padding, ends that reach past it: T1 to T6), the column's
 * width limit, the stage's width, the gap and the padding and the preview mode are settings, a press or a count solves
 * with the fit on screen as `previous` (C23), and while a drop is previewed every other item, floats too, is drawn at
 * its rect after the drop (C22). Without it the board is the one the floats and keep fixtures always had.
 */
import type { Rect } from "@n-uf/motion";
import { DRAG_DEFAULTS, createDragIntent, previewPlan, type DragIntent, type DragPreview, type DragTarget } from "@n-uf/motion/drag";
import {
  fitFloat,
  fitStack,
  readFloats,
  readStack,
  stackFloatTarget,
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
import { ALL, FLOAT_SIZE, defaultMeta, inputOf, isPanel, itemOf, titleOf, toolbarInputOf, toolbarItemOf, type ItemId, type ItemMeta, type Phase, type Placed } from "./sample";
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
  /** The Edge stack page's stage (see the file's header). */
  readonly edge?: boolean;
}

/** The Edge stack page's settings, and their defaults. */
export interface EdgeSettings {
  /** The stage's width: the bar's length. */
  readonly width: number;
  /** The stage's height: the column is what is left under the bar. */
  readonly height: number;
  /** The column's width limit (an open panel's cross.max). */
  readonly widthLimit: number;
  readonly gap: number;
  readonly pad: number;
  readonly preview: DragPreview;
}
export const EDGE_DEFAULTS: EdgeSettings = { width: 880, height: 500, widthLimit: 360, gap: 8, pad: 12, preview: "gap" };
export const EDGE_BAR_H = 40;
export const EDGE_WIDTH = { min: 420, max: 1000 };

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
  const edge = !!opt.edge;
  /** The bar's thickness: the column starts under it. */
  const barH = edge ? EDGE_BAR_H : BAR_H;
  ORIGIN.column.y = barH;
  LENGTH.column = STAGE.height - barH;
  let settings: EdgeSettings = { ...EDGE_DEFAULTS };

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
  /** The control for the no-jump check: bar groups are sized from their content (see the file's header). */
  let measured = false;
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
  /** An item's count and phase as drawn: with `fluid`, the badge is as wide as its digits (it says the whole count). */
  const metaFor = (id: string): ItemMeta => ({ ...st.meta[id as ItemId], ...(measured ? { fluid: true } : {}) });
  const metaOf = (id: string): ItemMeta | undefined => metaFor(id);
  // Measures a group's row form (words and badge) from the DOM, for `measured`.
  const meter = document.createElement("section");
  meter.className = "st-item st-group";
  meter.dataset.kind = "row";
  meter.setAttribute("aria-hidden", "true");
  Object.assign(meter.style, { visibility: "hidden", left: "-9999px", top: "0", width: "max-content", height: "30px" });
  stage.append(meter);
  const measureRow = (id: ItemId): number => {
    meter.innerHTML = dress(id, "row", metaFor(id));
    return Math.ceil(meter.getBoundingClientRect().width);
  };
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

  const placedOf = (id: ItemId): Placed => ({ id, used: st.used[id], kept: st.kept.has(id), from: st.from[id] ?? 0, badge: true, ...(measured && !isPanel(id) ? { rowMain: measureRow(id) } : {}) });
  function inputFor(side: Side, without?: ItemId): StackInput {
    const items = st.orders[side].filter((id) => id !== without).map(placedOf);
    if (!edge) return inputOf(AXIS[side], LENGTH[side], items);
    return side === "bar" ? toolbarInputOf({ length: LENGTH.bar, height: barH, gap: settings.gap, pad: settings.pad }, items) : inputOf("column", LENGTH.column, items, settings.widthLimit);
  }
  const itemFor = (side: Side, id: ItemId) => (edge && side === "bar" ? toolbarItemOf(placedOf(id)) : itemOf(placedOf(id), AXIS[side]));
  /** Each stack's fit; `keep` solves with the fit on screen as `previous`, so the forms that still fit stay (C23). */
  function fitsWithout(without?: ItemId, keep = false): Record<Side, StackFit> {
    const fit = (n: Side): StackFit => {
      const prev = keep ? views[n].fit() : null;
      return fitStack(inputFor(n, without), prev ? { previous: prev } : {});
    };
    return { column: fit("column"), bar: fit("bar") };
  }

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

  /** `avoid`: the docked content a previewed drop makes; each float is drawn where it goes after that drop (C22). */
  function drawFloats(lifted?: ItemId, avoid?: readonly Rect[]): void {
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
      const m = metaFor(f.id);
      const sig = `${floatKind(f.id as ItemId)}|${m.count}|${m.phase}|${m.fluid}`;
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.dataset.kind = floatKind(f.id as ItemId);
        el.innerHTML = dress(f.id, floatKind(f.id as ItemId), m);
      }
      el.dataset.phase = m.phase;
      el.hidden = f.id === lifted;
      const r = avoid ? fitFloat(f.rect, STAGE_RECT, avoid).rect : f.rect;
      Object.assign(el.style, { left: px(r.x), top: px(r.y), width: px(r.width), height: px(r.height), zIndex: String(10 + i) });
    });
  }

  /** The docked content in stage px when the room's drop is made: the room's stack as its solve has it, the other as it stands. */
  function roomAvoid(room: DockT, fits: Record<Side, StackFit>): Rect[] {
    const out: Rect[] = [];
    for (const n of SIDES) {
      const fit = room.side === n ? room.target.fit : fits[n];
      for (const p of fit.items) if (p.kind !== "menu") out.push(shiftBy(p.rect, ORIGIN[n]));
      if (fit.menu) out.push(shiftBy(fit.menu.rect, ORIGIN[n]));
    }
    return out;
  }

  /**
   * Draw: the stacks from the state (the dragged item lifted out), or with the room a gap makes; then the floats. `keep`
   * solves with the fits on screen as `previous` (a press, a count).
   */
  function draw(room: DockT | null, lifted?: ItemId, homing = false, keep = false): void {
    // Homing: the pointer is back over the held item's own place, so the others stand where they were and the place is held for it.
    const fits = fitsWithout(homing ? undefined : lifted, keep);
    for (const n of SIDES) {
      if (room && room.side === n) views[n].draw(room.target.fit, room.target.item);
      else views[n].draw(fits[n], homing ? lifted : undefined);
    }
    const colCross = room?.side === "column" ? room.target.fit.cross : fits.column.cross;
    Object.assign(scroller.style, { left: px(colCross), top: px(barH), width: px(STAGE.width - colCross), height: px(STAGE.height - barH) });
    drawFloats(lifted, edge && room ? roomAvoid(room, fits) : undefined);
    syncGrips();
  }
  const settle = (keep = false): void => {
    draw(null, undefined, false, keep);
    if (autosave) save();
    say(readout());
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

  /** The "Rebuild from the stored form" button: forget the arrangement in memory (everything docked in the column), then rebuild from the stored form. */
  function rebuild(between?: () => void): LoadReport {
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
      const dragged = itemFor(side, id);
      // The Edge stack's bar is a toolbar: the solver's `endReach` lets its first and last gaps reach past its ends (T5).
      const toolbar = edge && side === "bar";
      const targets = stackTargets(inputFor(side, id), dragged, toolbar ? { endReach: END_REACH } : {});
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
        } else if (toolbar) {
          wide = { ...hit, height: Math.max(hit.height, barH) };
        } else {
          wide = { ...hit, height: Math.max(hit.height, REACH.bar) };
          wide = { ...wide, x: wide.x - (first ? END_REACH : 0), width: wide.width + (first ? END_REACH : 0) + (last ? END_REACH : 0) };
        }
        out.push({ kind: "dock", id: `${side}:${t.id}`, priority: 2, hit: wide, slot: shiftBy(t.slot!, o), side, at: t.place.at, target: t, marker: shiftBy(t.marker, o), label: gapWords(side, t.place.at, id) });
      }
    }
    const ft = stackFloatTarget({ id, stage: STAGE_RECT, size: FLOAT_SIZE[id], avoid: avoidRects(id) });
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
    /** Lifted from a stack (a float's home is a point, nothing to show there). */
    readonly docked: boolean;
    /** The pointer is back over its place and the place is shown. */
    homing: boolean;
    /** The held item's size as lifted. */
    readonly size: { readonly width: number; readonly height: number };
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
    ind.hidden = indLabel.hidden = false;
    // The label sits at the preview's corner, kept inside the stage (a clamped preview touches its edge).
    const room = Math.max(4, STAGE.width - indLabel.offsetWidth - 4);
    Object.assign(indLabel.style, { left: px(Math.min(Math.max(4, rectOf.x + 4), room)), top: px(Math.max(4, rectOf.y + 4)) });
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
    el.innerHTML = dress(id, kind as Parameters<typeof dress>[1], metaFor(id));
    Object.assign(el.style, { width: px(was.width), height: px(was.height), left: px(p.x - grab.x), top: px(p.y - grab.y) });
    stage.append(el);
    // The item is lifted out of where it was: the stacks are drawn without it.
    draw(null, id);
    const targets = targetsFor(id);
    // A docked item's home is its place (a release there does nothing); a float is moved anywhere, so its home is the point.
    const home: Rect = where.kind === "dock" ? was : { x: start.x, y: start.y, width: 0, height: 0 };
    const intent = createDragIntent<BoardTarget>({ home });
    drag = { id, grab, home, el, intent, targets, floatDrop: null, pointer: p, shown: null, room: null, docked: where.kind === "dock", homing: false, size: { width: was.width, height: was.height }, raf: 0 };
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
    const wasHoming = d.homing;
    const f = d.intent.update(d.pointer, now, d.targets);
    const plan = previewPlan(f, edge ? settings.preview : "gap");
    const room = plan.makeRoom && f.shown?.kind === "dock" ? f.shown : null;
    // Snap: the held item sits in its slot instead of under the pointer.
    if (plan.snapItem && f.shown?.kind === "dock") {
      const s = f.shown.slot;
      Object.assign(d.el.style, { left: px(s.x), top: px(s.y), width: px(s.width), height: px(s.height) });
    } else if (edge) Object.assign(d.el.style, { width: px(d.size.width), height: px(d.size.height) });
    // Back over its own place (a docked item): the intent shows no target there and a release puts it back, so say so.
    const homing = f.atHome && d.docked && f.shown === null;
    if (room?.id !== d.room?.id || homing !== d.homing) {
      d.room = room;
      d.homing = homing;
      draw(room, d.id, homing);
      if (homing) say(`${titleOf(d.id)}: Back to its place. Release to put it back.`);
    }
    if (!homing && (f.shown?.id !== d.shown?.id || wasHoming)) say(f.shown ? `${titleOf(d.id)} → ${f.shown.label}: release to drop it on the dashed rectangle.` : `${titleOf(d.id)}: move over a gap, or anywhere else to float it.`);
    d.shown = f.shown;
    d.floatDrop = null;
    const s = plan.showIndicator ? f.shown : null;
    if (homing) showPreview(d.home, "Back to its place", d.id);
    else if (!s) showPreview(null, "", d.id);
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
    else if (d.homing) previewSolve = d.home;
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
    else say(cancel ? "Cancelled: back where it was." : d.homing ? "Back in its place." : "No target: it went home.");
  }

  // --- input ---------------------------------------------------------------------------------------------------------------------------

  /** What a click opens: a header's caret, or a rail icon (the panel's badge), in a docked panel. */
  const opens = (t: HTMLElement): boolean => !!t.closest(".st-caret, .st-item[data-kind='rail'] .st-badge") && !t.closest(".st-float");

  function track(e: PointerEvent, id: ItemId): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.target as HTMLElement;
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
      } else if (!lifted && ev.type === "pointerup" && opens(target)) {
        // A press and a release that never went past the lift distance is a click, never a drag; a drag is never a click.
        open(id);
      } else if (edge && !lifted && ev.type === "pointerup") press(id);
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
    // The second click of a double-click on a caret lands on the header the first one opened: that isn't a fold. Only
    // that panel is guarded; a double-click on another panel's header right after folds it.
    if (opened.id === it.dataset.id && performance.now() - opened.at < 500) return;
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

  /** The panel a click opened last, and when: its double-click guard. */
  let opened: { id: string; at: number } = { id: "", at: -1e9 };
  /** Open a docked panel (a click on its caret or rail icon): its form from the first again, newest used. */
  function open(id: ItemId): void {
    if (!isPanel(id) || !stackOfId(st, id)) return;
    delete st.from[id];
    st.used[id] = ++clock;
    opened = { id, at: performance.now() };
    settle();
    say(`${titleOf(id)} opened. ${readout()}`);
  }
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
    // On the Edge stack a re-measured item keeps the others' forms (`previous`), as a host does.
    draw(null, undefined, false, edge);
    opt.onChange?.();
  }
  /** A press on an item's grip or header, no drag, nothing opened (the Edge stack): a use of it, and nothing else reshapes (C23). */
  function press(id: ItemId): void {
    if (!whereIs(id)) return;
    st.used[id] = ++clock;
    settle(true);
    say(`${titleOf(id)} pressed: a use of it. ${readout()}`);
  }
  /** The Edge stack's settings: the stage's size, the column's width limit, the bar's gap and padding, the preview mode. */
  function setEdge(patch: Partial<EdgeSettings>): void {
    if (drag) endDrag(true);
    settings = { ...settings, ...patch };
    applyWidth(settings.width);
    applyHeight(settings.height);
    settings = { ...settings, width: STAGE.width, height: STAGE.height };
    refloat();
    settle();
  }
  function applyWidth(w: number): void {
    const width = Math.min(Math.max(Math.round(w), EDGE_WIDTH.min), EDGE_WIDTH.max);
    STAGE.width = width;
    STAGE_RECT.width = width;
    LENGTH.bar = width;
    stage.style.width = px(width);
  }
  /** The no-jump control: size bar groups' row form from their words and badge (the badge grows with its digits). */
  function setMeasured(on: boolean): void {
    measured = on;
    stage.dataset.fluid = String(on);
    settle();
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
    opened = { id: "", at: -1e9 };
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
    LENGTH.column = height - barH;
    stage.style.height = px(height);
  }
  /** Resize the window: the column gives way or grows, and a float the stage no longer holds is clamped back in. */
  function setHeight(h: number): void {
    if (drag) endDrag(true);
    applyHeight(h);
    settings = { ...settings, height: STAGE.height };
    refloat();
    settle();
    say(readout());
  }
  function reset(): void {
    if (drag) endDrag(true);
    clearStored();
    applyHeight(STAGE_HEIGHT.max);
    if (edge) {
      settings = { ...EDGE_DEFAULTS };
      applyWidth(settings.width);
    }
    st = fresh();
    clock = 6;
    frozen = false;
    altDown = false;
    measured = false;
    opened = { id: "", at: -1e9 };
    stage.dataset.fluid = "false";
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

  if (edge) applyWidth(settings.width);
  draw(null);
  if (opt.restore) load();
  say(readout());

  return {
    stage,
    views,
    scroller,
    press,
    setEdge,
    get settings(): EdgeSettings {
      return { ...settings };
    },
    barHeight: barH,
    /** Every item's rect as drawn now (stage px), the held one left out: what a previewed drop shows (C22). */
    drawnNow(): Map<ItemId, Rect> {
      const out = new Map<ItemId, Rect>();
      for (const n of SIDES) for (const [id, r] of views[n].drawn()) out.set(id as ItemId, shiftBy(r, ORIGIN[n]));
      for (const [id, el] of floatEls) if (!el.hidden) out.set(id as ItemId, domRect(el));
      return out;
    },
    ind,
    indLabel,
    marker,
    reset,
    rebuild,
    load,
    save,
    stored,
    setLayout,
    setHeight,
    setMeasured,
    open,
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
    get measured() {
      return measured;
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
