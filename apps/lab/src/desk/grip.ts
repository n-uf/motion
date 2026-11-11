/**
 * Drag handles (grips) for the desk's panels: one handle per movable unit, and it carries every action the unit has.
 *
 * - The glyph: dots in a line along the edge they sit on. A horizontal unit (a panel's header, a collapsed bar, a tab
 *   row) has it at its left edge, the dots running top to bottom; a vertical unit (a rail segment) on its top edge,
 *   centred, the dots running left to right. Full density (two lines of 3) on expanded headers, compact (one line)
 *   on thin units: collapsed bars and rail segments. The lab can draw a short line instead, plain, engraved or in a
 *   well.
 * - The actions: a drag moves the unit (the header drags along its whole length, the handle shows where from); a
 *   double-click collapses or expands it; a click on a collapsed bar or a rail segment expands it; a right-click, a
 *   long press, Shift+F10 or the Menu key opens the unit's menu, anchored at the handle. There is no other menu or
 *   fold button.
 * - The menu, always in this order: Collapse or Expand · Move to › (the construction's zones, the current one
 *   checked) · Float or Dock · Reset position. What doesn't apply is left out.
 * - Frozen layout: nothing moves or collapses; every glyph hides, the cursor says not-allowed and the title bar's
 *   tooltip says how to move anyway; the menu still opens (a right-click on the title bar) with those items greyed
 *   under a line that says why. Holding Alt shows the glyphs and unfreezes while held; letting go hides them again.
 *   The frozen switch is the page's one `input[name=freeze]` (made here if no other part has made it).
 */
import type { Rect } from "@n-uf/motion";
import { cancelPress } from "../shared/press";
import { dropAt, targetsFor, without, type DropTarget, type TargetInput } from "./drops";
import type { Construction, ConstructionId } from "./layouts";
import { idOf, panelKey, titleOf, toggleClosed, toggleFold, touch, type DeskState, type Layout, type Options, type Side, type Size } from "./model";

/** What the grips need from the page. */
export interface GripHost {
  readonly stage: HTMLElement;
  construction(): Construction;
  state(): DeskState;
  layout(): Layout;
  size(): Size;
  options(): Options;
  /** The desk's state changes; everything glides to the new layout. */
  commit(s: DeskState): void;
  /** An item is held (a drag runs). */
  busy(): boolean;
  /** The last press became a drag (its click is not a click). */
  dragged(): boolean;
  /** A rail icon's own action: open its dock or drawer on that panel. */
  icon(side: Side, id: number): void;
  /** Track a press that may lift `key`, held like a tab, its home zone `from`. */
  press(key: string, e: PointerEvent, from: () => Rect): void;
  /** Pick `key` up from the keyboard (the arrow key that asked for it then steps). */
  pickUp(key: string): void;
  /** An element's rect in stage units. */
  rectOf(el: Element): Rect;
}

/** One entry of a unit's menu. */
export interface MenuEntry {
  readonly label: string;
  /** A hint at the right edge (the mouse's way to the same thing). */
  readonly hint?: string;
  readonly checked?: boolean;
  /** Greyed (only on a frozen layout). */
  readonly disabled?: boolean;
  /** Starts a new group (a hairline above it). */
  readonly group?: boolean;
  readonly run?: () => void;
  readonly sub?: readonly MenuEntry[];
}

export interface Grips {
  /** Give a panel's header its handle and its actions. */
  header(key: string, bar: HTMLElement): void;
  /** Make a rail button a rail segment: the compact glyph on top, it drags and opens the menu too. */
  segment(b: HTMLButtonElement, side: Side, id: number): HTMLButtonElement;
  /** A rail segment was clicked: it expands (not after a drag, not while frozen). */
  segmentClick(side: Side, id: number): void;
  /** Give a tab row (a drawer's or a navigator side's header) its handle: it moves the panel showing there. */
  tabRow(row: HTMLElement, side: Side): void;
  /** The layout is frozen now (and Alt isn't held): nothing may be lifted. */
  frozen(): boolean;
  /** For the scenarios. */
  readonly test: {
    setFrozen(on: boolean): void;
    setAlt(on: boolean): void;
    /** The unit's menu as it would open now. */
    menu(key: string): { note: string | null; entries: readonly MenuEntry[] };
    /** Open the unit's menu as a right-click on its handle does; null when it has no handle on the stage. */
    open(key: string): HTMLElement | null;
    close(): void;
  };
}

/** Constructions where a panel collapses to its header bar (a section, or a shaded palette). */
const COLLAPSES: readonly ConstructionId[] = ["docks", "docksFull", "dockTear", "floatOver", "floatAround"];

type Family = "docks" | "tree" | "strip" | "sides" | "palettes";
const familyOf = (id: ConstructionId): Family =>
  id === "docks" || id === "docksFull" || id === "dockTear" ? "docks" : id === "floatOver" || id === "floatAround" ? "palettes" : id === "navigator" || id === "drawers" ? "sides" : id;

/** The zone a drop target belongs to ("left", "right", "bottom", "centre", "col:<i>", "new", "float"). */
function zoneOfTarget(f: Family, tid: string): string | null {
  const [a, b] = tid.split(":");
  switch (f) {
    case "docks":
      return a === "rail" || a === "dock" ? b! : a === "bottom" ? "bottom" : a === "float" ? "float" : null;
    case "tree":
      return a === "rail" ? b! : a === "edge" ? (b === "L" ? "left" : "right") : a === "tile" ? ({ L: "left", R: "right", C: "centre" } as Record<string, string>)[b!]! : null;
    case "strip":
      return a === "into" ? `col:${b}` : a === "between" || a === "strip" ? "new" : null;
    case "sides":
      return b === "left" || b === "right" ? b : null;
    case "palettes":
      return a === "stack" ? b! : a === "free" ? "float" : null;
  }
}

/** The zone `key` is in now (strip columns counted as they are with it lifted out); null: none of the listed ones. */
function zoneOf(f: Family, s: DeskState, key: string): string | null {
  const id = idOf(key);
  const side = s.left.includes(id) ? "left" : s.right.includes(id) ? "right" : null;
  switch (f) {
    case "docks":
      return side ?? (s.bottom.includes(id) ? "bottom" : s.torn.some((x) => x.id === id) ? "float" : null);
    case "tree":
      return s.tree.L.includes(key) ? "left" : s.tree.R.includes(key) ? "right" : s.tree.C.includes(key) ? "centre" : null;
    case "strip": {
      const other = s.cols.find((c) => c.includes(key))?.find((k) => k !== key);
      return other ? `col:${without(s, key).cols.findIndex((c) => c.includes(other))}` : null;
    }
    case "sides":
      return side;
    case "palettes":
      return s.stacks.left.includes(id) ? "left" : s.stacks.right.includes(id) ? "right" : s.free.some((x) => x.id === id) ? "float" : null;
  }
}

function zoneLabel(c: ConstructionId, z: string, s0: DeskState): string {
  const side = z === "left" ? "Left" : "Right";
  switch (familyOf(c)) {
    case "docks":
      return z === "bottom" ? "Bottom dock" : `${side} dock`;
    case "tree":
      return z === "centre" ? "Centre" : `${side} column`;
    case "strip":
      return z === "new" ? "A new column" : `Column with ${titleOf(s0.cols[Number(z.slice(4))]![0]!)}`;
    case "sides":
      return c === "drawers" ? `${side} drawer` : `${side} side`;
    case "palettes":
      return `${side} stack`;
  }
}

/** Where `key` sits, zone and place, to tell whether it is where the construction starts it. */
function placeOf(s: DeskState, key: string): string {
  const id = idOf(key);
  for (const f of ["left", "right", "bottom"] as const) if (s[f].includes(id)) return `${f}:${s[f].indexOf(id)}`;
  for (const f of ["left", "right"] as const) if (s.stacks[f].includes(id)) return `stack-${f}:${s.stacks[f].indexOf(id)}`;
  for (const g of ["L", "R", "C"] as const) if (s.tree[g].includes(key)) return `tree-${g}:${s.tree[g].indexOf(key)}`;
  const ci = s.cols.findIndex((c) => c.includes(key));
  return ci >= 0 ? `col-${ci}:${s.cols[ci]!.indexOf(key)}` : "free";
}

const insert = <T>(list: readonly T[], i: number, x: T): T[] => [...list.slice(0, i), x, ...list.slice(i)];

/** `s` with `key` put back where `init` has it (a construction's start), the rest as it is. */
function placedLike(s: DeskState, init: DeskState, key: string): DeskState {
  const id = idOf(key);
  let n = without(s, key);
  for (const f of ["left", "right", "bottom"] as const) if (init[f].includes(id)) n = { ...n, [f]: insert(n[f], init[f].indexOf(id), id) };
  for (const f of ["left", "right"] as const) {
    if (init.stacks[f].includes(id)) n = { ...n, stacks: { ...n.stacks, [f]: insert(n.stacks[f], init.stacks[f].indexOf(id), id) } };
    if (init.active[f] === id) n = { ...n, active: { ...n.active, [f]: id } };
  }
  for (const g of ["L", "R", "C"] as const) if (init.tree[g].includes(key)) n = { ...n, tree: { ...n.tree, [g]: insert(n.tree[g], init.tree[g].indexOf(key), key) } };
  const ci = init.cols.findIndex((c) => c.includes(key));
  if (ci >= 0) {
    const col = init.cols[ci]!;
    const mate = col.find((k) => k !== key && n.cols.some((c) => c.includes(k)));
    const at = mate ? n.cols.findIndex((c) => c.includes(mate)) : -1;
    n = { ...n, cols: at >= 0 ? n.cols.map((c, i) => (i === at ? insert(c, Math.min(col.indexOf(key), c.length), key) : c)) : insert(n.cols, Math.min(ci, n.cols.length), [key]) };
  }
  return touch(n, id);
}

/** The glyph: a run of dots (or a short line) whose density and direction CSS takes from its handle. */
const DOTS = '<span class="grip-dots" aria-hidden="true"></span>';

const TIP = "Drag to move · double-click to collapse or expand · right-click for more";
const FROZEN_TIP = "Frozen: hold Alt to move";
const FROZEN_NOTE = "Frozen: hold Alt to move or collapse";
/** A press held this long without moving opens the menu. */
const LONG_PRESS = 550;

export function createGrips(host: GripHost): Grips {
  let frozenFlag = false;
  let altHeld = false;
  const isFrozen = (): boolean => frozenFlag && !altHeld;
  /** Where a panel last docked before it floated from the menu: Dock takes it back there. */
  const dockedAt = new Map<string, string>();
  /** A click on a collapsed bar expanded it just now: the double-click that click starts is not a toggle. */
  let expandedByClick = 0;

  const stage = host.stage;
  const apply = (): void => {
    const f = isFrozen();
    stage.classList.toggle("frozen", f);
    for (const h of stage.querySelectorAll<HTMLElement>(".grip-handle, .win.chrome .segment")) h.title = f ? FROZEN_TIP : (h.dataset.tip ?? TIP);
    // The handles are hidden while frozen: the title bars say how to move anyway.
    for (const t of stage.querySelectorAll<HTMLElement>(".win.panel .title")) {
      if (f) t.title = FROZEN_TIP;
      else t.removeAttribute("title");
    }
  };
  const setAlt = (on: boolean): void => {
    if (on === altHeld) return;
    altHeld = on;
    apply();
  };
  document.addEventListener("keydown", (e) => e.key === "Alt" && setAlt(true), true);
  document.addEventListener("keyup", (e) => e.key === "Alt" && setAlt(false), true);
  window.addEventListener("blur", () => setAlt(false));
  for (const t of ["pointerdown", "pointermove"] as const) window.addEventListener(t, (e) => setAlt(e.altKey), true);

  // --- what a unit can do -----------------------------------------------------------------------------------------

  const placed = (key: string) => host.layout().items.get(key);
  /** The rail (if any) that shows panel `id`'s icon. */
  const railOf = (id: number): Side | null => {
    for (const side of ["left", "right"] as const) {
      const r = placed(`rail:${side}`);
      if (r && !r.hidden && r.icons?.includes(id)) return side;
    }
    return null;
  };

  /** Collapse or Expand, or null where neither applies. */
  function toggleOf(key: string): MenuEntry | null {
    const p = placed(key);
    if (!p) return null;
    const c = host.construction().id;
    const id = idOf(key);
    const s = host.state();
    if (p.hidden) {
      const rail = railOf(id);
      return rail ? { label: "Expand", run: () => host.icon(rail, id) } : null;
    }
    if (COLLAPSES.includes(c)) {
      if (p.look === "header") return { label: "Expand", run: () => host.commit(s.folded.includes(id) ? toggleFold(s, id) : touch(s, id)) };
      return { label: "Collapse", run: () => host.commit(toggleFold(s, id)) };
    }
    if (c === "drawers") {
      const side = s.left.includes(id) ? "left" : s.right.includes(id) ? "right" : null;
      if (side && !s.closed.includes(side)) return { label: "Collapse", run: () => host.commit(toggleClosed(s, side)) };
    }
    return null;
  }

  const input = (key: string): TargetInput => ({ c: host.construction(), s0: without(host.state(), key), key, size: host.size(), opt: host.options() });

  /** The construction's zones for `key`, each with the target a move there uses (its end: the last slot). */
  function zones(key: string): { id: string; label: string; target: DropTarget }[] {
    const inp = input(key);
    const f = familyOf(inp.c.id);
    const byZone = new Map<string, DropTarget[]>();
    for (const t of targetsFor(inp)) {
      const z = zoneOfTarget(f, t.id);
      if (z) byZone.set(z, [...(byZone.get(z) ?? []), t]);
    }
    const out: { id: string; label: string; target: DropTarget }[] = [];
    for (const [z, ts] of byZone) {
      if (z === "float") {
        out.push({ id: z, label: "Float", target: ts[0]! });
        continue;
      }
      const slots = ts.filter((t) => !t.free);
      const open = slots.filter((t) => t.prio >= 2);
      const t = (open.length ? open : slots).at(-1);
      if (t) out.push({ id: z, label: zoneLabel(inp.c.id, z, inp.s0), target: t });
    }
    return out;
  }

  function moveTo(key: string, zone: { id: string; target: DropTarget }): void {
    const inp = input(key);
    const h = zone.target.hit;
    // A float lands in the middle of its area; a slot at the zone's end.
    const p = zone.id === "float" ? { x: h.x + h.width / 2, y: h.y + h.height / 3 } : { x: h.x + h.width / 2, y: h.y + h.height - 1 };
    const d = dropAt(inp, zone.target, p, zone.id === "float" ? { x: 100, y: 11 } : { x: 0, y: 0 });
    host.commit(d.state);
  }

  function menuOf(key: string): { note: string | null; entries: MenuEntry[] } {
    const frozen = isFrozen();
    const c = host.construction();
    const f = familyOf(c.id);
    const s = host.state();
    const now = zoneOf(f, s, key);
    const all = zones(key);
    const docks = all.filter((z) => z.id !== "float");
    const float = all.find((z) => z.id === "float");
    const entries: MenuEntry[] = [];
    const lock = (e: MenuEntry): MenuEntry => (frozen ? { ...e, disabled: true } : e);
    const t = toggleOf(key);
    if (t) entries.push(lock({ ...t, hint: "double-click" }));
    const place: MenuEntry[] = [];
    if (docks.length > 1 || (docks.length === 1 && docks[0]!.id !== now))
      place.push(lock({ label: "Move to", sub: docks.map((z) => (z.id === now ? { label: z.label, checked: true } : { label: z.label, run: () => moveTo(key, z) })) }));
    if (now === "float") {
      const init = zoneOf(f, c.initial(s.docs, host.size()), key);
      const back = docks.find((z) => z.id === dockedAt.get(key)) ?? docks.find((z) => z.id === init) ?? docks[0];
      if (back) place.push(lock({ label: "Dock", run: () => moveTo(key, back) }));
    } else if (float) {
      place.push(
        lock({
          label: "Float",
          run: () => {
            if (now) dockedAt.set(key, now);
            moveTo(key, float);
          },
        }),
      );
    }
    if (place.length) entries.push({ ...place[0]!, group: entries.length > 0 }, ...place.slice(1));
    const init = c.initial(s.docs, host.size());
    if (placeOf(s, key) !== placeOf(init, key)) entries.push(lock({ label: "Reset position", group: entries.length > 0, run: () => host.commit(placedLike(s, init, key)) }));
    return { note: frozen && entries.some((e) => e.disabled) ? FROZEN_NOTE : null, entries };
  }

  /** Collapse or expand `key` (a double-click, Enter or Space on its handle). */
  function toggle(key: string): void {
    if (host.busy() || isFrozen()) return;
    toggleOf(key)?.run?.();
  }

  // --- the menu ---------------------------------------------------------------------------------------------------

  let menuEl: HTMLElement | null = null;
  let subEl: HTMLElement | null = null;
  let returnFocus: HTMLElement | null = null;

  function closeMenu(refocus = false): void {
    subEl?.remove();
    menuEl?.remove();
    subEl = null;
    menuEl = null;
    if (refocus && returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  /** A menu box at stage point `at` (kept on the stage), its entries as buttons. */
  function buildBox(entries: readonly MenuEntry[], note: string | null, at: { x: number; y: number }, sub: boolean): HTMLElement {
    const box = document.createElement("div");
    box.className = sub ? "grip-menu sub" : "grip-menu";
    box.setAttribute("role", "menu");
    if (note) {
      const n = document.createElement("div");
      n.className = "grip-note";
      n.textContent = note;
      box.append(n);
    }
    for (const e of entries) {
      if (e.group) box.append(Object.assign(document.createElement("div"), { className: "grip-sep" }));
      const b = document.createElement("button");
      b.type = "button";
      b.className = "grip-item";
      b.setAttribute("role", e.checked !== undefined ? "menuitemradio" : "menuitem");
      if (e.checked) b.setAttribute("aria-checked", "true");
      if (e.sub) b.setAttribute("aria-haspopup", "menu");
      b.disabled = !!e.disabled;
      b.innerHTML = `<span class="mark">${e.checked ? "✓" : ""}</span><span class="label"></span><span class="hint"></span>`;
      b.querySelector(".label")!.textContent = e.label;
      b.querySelector(".hint")!.textContent = e.sub ? "›" : (e.hint ?? "");
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (e.disabled) return;
        if (e.sub) return openSub(b, e.sub);
        if (!e.run) return closeMenu(true);
        closeMenu(true);
        e.run();
      });
      if (e.sub) b.addEventListener("pointerenter", () => !e.disabled && openSub(b, e.sub!));
      else if (!sub) b.addEventListener("pointerenter", () => closeSub());
      box.append(b);
    }
    box.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    box.addEventListener("contextmenu", (ev) => ev.preventDefault());
    box.addEventListener("keydown", (ev) => menuKey(ev, box, sub));
    stage.append(box);
    // Kept on the stage (its layout px are stage units).
    const sz = host.size();
    box.style.left = `${Math.max(0, Math.min(at.x, sz.width - box.offsetWidth))}px`;
    box.style.top = `${Math.max(0, Math.min(at.y, sz.height - box.offsetHeight))}px`;
    return box;
  }

  function closeSub(): void {
    subEl?.remove();
    subEl = null;
  }

  function openSub(from: HTMLButtonElement, entries: readonly MenuEntry[], focus = false): void {
    if (subEl?.dataset.of === from.querySelector(".label")!.textContent) {
      if (focus) firstItem(subEl)?.focus();
      return;
    }
    closeSub();
    const r = host.rectOf(from);
    subEl = buildBox(entries, null, { x: r.x + r.width - 2, y: r.y - 4 }, true);
    subEl.dataset.of = from.querySelector(".label")!.textContent ?? "";
    // No room on the right: it opens to the left of its item.
    const sr = host.rectOf(subEl);
    if (sr.x < r.x + r.width - 4) subEl.style.left = `${Math.max(0, r.x - sr.width + 2)}px`;
    if (focus) firstItem(subEl)?.focus();
  }

  const items = (box: HTMLElement): HTMLButtonElement[] => [...box.querySelectorAll<HTMLButtonElement>(".grip-item:not(:disabled)")];
  const firstItem = (box: HTMLElement): HTMLButtonElement | undefined => items(box)[0];

  function menuKey(e: KeyboardEvent, box: HTMLElement, sub: boolean): void {
    const list = items(box);
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const n = list.length;
      if (n) list[e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1]!.focus();
    } else if (e.key === "ArrowRight" && !sub && i >= 0 && list[i]!.getAttribute("aria-haspopup")) {
      list[i]!.click();
      if (subEl) firstItem(subEl)?.focus();
    } else if ((e.key === "ArrowLeft" || e.key === "Escape") && sub) {
      const owner = [...(menuEl?.querySelectorAll<HTMLButtonElement>(".grip-item") ?? [])].find((b) => b.querySelector(".label")!.textContent === box.dataset.of);
      closeSub();
      owner?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      closeMenu(true);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function openMenu(key: string, anchor: HTMLElement, keyboard: boolean): HTMLElement | null {
    closeMenu();
    if (host.busy()) return null;
    const { note, entries } = menuOf(key);
    if (!entries.length) return null;
    const r = host.rectOf(anchor);
    returnFocus = anchor;
    menuEl = buildBox(entries, note, { x: r.x, y: r.y + r.height + 2 }, false);
    menuEl.dataset.key = key;
    if (keyboard) firstItem(menuEl)?.focus();
    return menuEl;
  }

  // Anywhere else, the menu closes.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!(e.target instanceof Element && e.target.closest(".grip-menu"))) closeMenu();
    },
    true,
  );
  window.addEventListener("blur", () => closeMenu());

  // --- handles ----------------------------------------------------------------------------------------------------

  function makeHandle(label: string, axis: "h" | "v", density: "full" | "compact"): HTMLElement {
    const h = document.createElement("span");
    h.className = "grip-handle";
    h.dataset.axis = axis;
    h.dataset.density = density;
    h.tabIndex = 0;
    h.setAttribute("role", "button");
    h.setAttribute("aria-haspopup", "menu");
    h.setAttribute("aria-label", label);
    h.dataset.tip = TIP;
    h.title = isFrozen() ? FROZEN_TIP : TIP;
    h.innerHTML = DOTS;
    return h;
  }

  /** A long press on `el` opens `key`'s menu (and the press lifts nothing). */
  function longPress(el: HTMLElement, key: () => string | null, anchor: HTMLElement): void {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      const stop = (): void => {
        clearTimeout(timer);
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", stop, true);
        window.removeEventListener("pointercancel", stop, true);
      };
      const move = (ev: PointerEvent): void => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) stop();
      };
      const timer = setTimeout(() => {
        stop();
        const k = key();
        if (!k || host.busy()) return;
        cancelPress();
        openMenu(k, anchor, false);
      }, LONG_PRESS);
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", stop, true);
      window.addEventListener("pointercancel", stop, true);
    });
  }

  /** The handle's keys: Enter or Space collapses or expands, Shift+F10 or Menu opens the menu, an arrow lifts. */
  function handleKeys(h: HTMLElement, key: () => string | null): void {
    h.addEventListener("keydown", (e) => {
      const k = key();
      if (!k || host.busy() || e.target !== h) return;
      if (e.key === "Enter" || e.key === " ") {
        toggle(k);
      } else if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
        openMenu(k, h, true);
      } else if (e.key.startsWith("Arrow")) {
        // The unit lifts from the keyboard; this same key then steps to the first target.
        if (!isFrozen()) host.pickUp(k);
        return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function header(key: string, bar: HTMLElement): void {
    const h = makeHandle(`${titleOf(key)}: move, collapse, more`, "h", "full");
    bar.prepend(h);
    handleKeys(h, () => key);
    longPress(h, () => key, h);
    const onControl = (e: Event): boolean => !!(e.target as Element).closest("button, .tab");
    bar.addEventListener("contextmenu", (e) => {
      if (onControl(e)) return;
      e.preventDefault();
      openMenu(key, h, false);
    });
    bar.addEventListener("click", (e) => {
      // A click on a collapsed bar expands it.
      if (onControl(e) || e.detail > 1 || host.dragged() || placed(key)?.look !== "header") return;
      if (host.busy() || isFrozen()) return;
      expandedByClick = performance.now();
      toggle(key);
    });
    bar.addEventListener("dblclick", (e) => {
      if (onControl(e) || performance.now() - expandedByClick < 600) return;
      toggle(key);
    });
  }

  function segment(b: HTMLButtonElement, side: Side, id: number): HTMLButtonElement {
    const key = panelKey(id);
    b.classList.add("segment");
    b.insertAdjacentHTML("afterbegin", DOTS);
    b.dataset.tip = `${titleOf(key)}: click to expand · drag to move · right-click for more`;
    b.title = isFrozen() ? FROZEN_TIP : b.dataset.tip;
    b.setAttribute("aria-haspopup", "menu");
    b.addEventListener("pointerdown", (e) => host.press(key, e, () => host.rectOf(b)));
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(key, b, false);
    });
    b.addEventListener("keydown", (e) => {
      if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
        e.preventDefault();
        e.stopPropagation();
        openMenu(key, b, true);
      }
    });
    longPress(b, () => key, b);
    void side;
    return b;
  }

  function segmentClick(side: Side, id: number): void {
    if (host.busy() || host.dragged() || isFrozen()) return;
    host.icon(side, id);
  }

  function tabRow(row: HTMLElement, side: Side): void {
    const shownKey = (): string | null => {
      const t = placed(`tabs:${side}`);
      const id = t?.active ?? host.state().active[side];
      return id === null || id === undefined ? null : panelKey(id);
    };
    const k0 = shownKey();
    const h = makeHandle(`${k0 ? titleOf(k0) : "Panel"}: move, collapse, more`, "h", "full");
    row.prepend(h);
    handleKeys(h, shownKey);
    longPress(h, shownKey, h);
    const activeTab = (): Element => row.querySelector('.tab[aria-pressed="true"]') ?? h;
    h.addEventListener("pointerdown", (e) => {
      const k = shownKey();
      if (k) host.press(k, e, () => host.rectOf(activeTab()));
    });
    row.addEventListener("contextmenu", (e) => {
      const k = shownKey();
      if (!k || (e.target as Element).closest(".tab")) return;
      e.preventDefault();
      openMenu(k, h, false);
    });
    h.addEventListener("dblclick", () => {
      const k = shownKey();
      if (k) toggle(k);
    });
  }

  // --- the lab's switches: the glyph, its finish, and a frozen layout -----------------------------------------------

  function switches(): void {
    const controls = document.querySelector<HTMLElement>(".controls");
    if (!controls) return;
    const fs = document.createElement("fieldset");
    fs.id = "grip-options";
    fs.innerHTML =
      "<legend>Drag handle</legend>" +
      '<label><input type="radio" name="grip-glyph" value="dots" checked /> Dots</label>' +
      '<label><input type="radio" name="grip-glyph" value="line" /> Short line</label>' +
      '<span class="sep">·</span>' +
      '<label><input type="radio" name="grip-finish" value="plain" checked /> Plain</label>' +
      '<label><input type="radio" name="grip-finish" value="engraved" /> Engraved</label>' +
      '<label><input type="radio" name="grip-finish" value="well" /> Well</label>';
    // The shared "Freeze layout" switch, if the page has one; else this one.
    let freeze = document.querySelector<HTMLInputElement>("input[name=freeze]");
    if (!freeze) {
      const l = document.createElement("label");
      l.innerHTML = '<span class="sep">·</span> <input type="checkbox" name="freeze" /> Freeze layout';
      fs.append(l);
      freeze = l.querySelector("input")!;
    }
    controls.append(fs);
    stage.dataset.grip = "dots";
    stage.dataset.finish = "plain";
    fs.querySelectorAll<HTMLInputElement>("input[name=grip-glyph]").forEach((i) => i.addEventListener("change", () => (stage.dataset.grip = i.value)));
    fs.querySelectorAll<HTMLInputElement>("input[name=grip-finish]").forEach((i) => i.addEventListener("change", () => (stage.dataset.finish = i.value)));
    const f = freeze;
    f.addEventListener("change", () => {
      frozenFlag = f.checked;
      closeMenu();
      apply();
    });
  }
  switches();

  return {
    header,
    segment,
    segmentClick,
    tabRow,
    frozen: isFrozen,
    test: {
      // Through the page's one switch, so every part that listens to it (the toolbar's too) follows.
      setFrozen: (on) => {
        const f = document.querySelector<HTMLInputElement>("input[name=freeze]");
        if (f && f.checked !== on) {
          f.checked = on;
          f.dispatchEvent(new Event("change", { bubbles: true }));
        }
        frozenFlag = on;
        apply();
      },
      setAlt,
      menu: menuOf,
      open: (key) => {
        const it = stage.querySelector<HTMLElement>(`.win[data-key="${key}"] .grip-handle`);
        if (!it) return null;
        it.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
        return menuEl;
      },
      close: () => closeMenu(),
    },
  };
}
