/**
 * Window chrome made of toolbar groups, on @n-uf/docking and @n-uf/motion: every figure's bars (components/Chrome.astro)
 * and the toolbar-groups page's sample window. One instance runs per window; a page may hold several.
 *
 * - **The model is a dock state** (demos/chrome-dock.ts): the title bar, a top and a bottom bar (each with start,
 *   center and end zones), a compact rail down each side, and floats. `solve` gives every group's rect and form: as a
 *   bar runs out of room its groups step down from their row to their icons, then to grip and », then into the bar's »
 *   menu, the lowest priority first and then the one used longest ago, and come back in reverse.
 * - **A drag** is a grip press (`createGripPress` through the lab's drag session: a lift past 5 px, a double-click within
 *   `DOUBLE_CLICK`), the drag intent (`createDragIntent`) over docking's `targets` and `refusals`, and the real group
 *   held by `holdItem` (no copy). The drop preview mode is the page's switch (islands/drop-mode.ts), read into motion's
 *   `previewPlan`: an outline, room made by the others (drawn from the shown target's `after().layout`), or the group
 *   gliding into its slot. Over a side rail the held group takes the form the drop gives it. A release commits the
 *   shown target's `after().state`; a release on a refusal, at home or nowhere puts it back.
 * - **Moves glide** on `createLayoutMotion` (the site's loop, tempo and reduced motion): each group is a layout item
 *   drawn by `domDrawable`, and a commit that moves groups between bars is a `flip` from where each is drawn.
 * - **The menu** (right-click, long-press, Shift+F10 or the menu key on a grip): Collapse or Expand (`foldItem`), Move
 *   to (`moveTo` on docking's last stop in that bar or rail), Float (`moveTo` a float on the content's bottom edge), Dock
 *   (`dockHome`), Move this bar's groups to, Reset position (`dockHome` to the page's default), Reset all.
 * - **Keys** on a focused grip: Enter or Space folds or unfolds, the arrow keys move the group to the previous or next of
 *   docking's `stops` (reading order: left rail, bars top to bottom, right rail), Escape cancels a drag or closes a menu.
 * - **Stored** per figure (`storeDockState` / `readDockState`); an arrangement stored before the chrome ran on docking
 *   is migrated once, or forgotten.
 * - **Frozen** (the freeze switch): no grips, nothing moves; holding Alt brings them back while held.
 *
 * The groups are the server-rendered elements (their controls keep their listeners): the first frame is the server's
 * flow layout, which the dock state reproduces, and each group is then placed at its solved rect in its bar.
 */
import type { Point, Rect } from "@n-uf/motion";
import { createDragIntent, previewPlan as planOf, type DragFrame, type DragIntent, type DragKeys, type PreviewMode } from "@n-uf/motion/drag";
import { createLayoutMotion, holdItem, type HeldDrag, type LayoutItem } from "@n-uf/motion/layout";
import { domDrawable, flip } from "@n-uf/motion/browser";
import {
  dockHome,
  foldItem,
  homeFor,
  markUsed,
  moveTo,
  refusals,
  refusalTargets,
  solve,
  stops,
  storeDockState,
  targets,
  zoneIn,
  type DockDrop,
  type DockItemLayout,
  type DockLayout,
  type DockRefusalTarget,
  type DockState,
  type DropResult,
} from "@n-uf/docking";
import { createDragSession } from "../../../lab/src/shared/session";
import { loop, omega, onMotionChange, reduced } from "./motion";
import { dropMode, previewPlan } from "./drop-mode";
import { setDragging, userAction } from "./showcase";
import { xrayOf, type XR, type XrayFrame } from "./xray";
import { HOSTNAME, HOSTS, ZONENAME, clone, type Host, type Model } from "../demos/toolbar";
import { FLOAT_FRAME, FLOAT_HOME, arrangementOf, dockStateOf, readStored, withSizes, type ChromeGroup, type GroupSize, type WindowSize } from "../demos/chrome-dock";

export interface ChromeOptions {
  /** The window: the element holding the bars, zones and groups (`.win`). */
  root: HTMLElement;
  /** Each group's name, for labels and the menu. */
  labels: Record<string, string>;
  /** The arrangement the server rendered. */
  initial: Model;
  /** What "Reset" restores (default: `initial`). */
  defaults?: Model;
  /** Persist the arrangement under this localStorage key. */
  storageKey?: string;
  /** The freeze lock's checkbox and its label element. */
  freeze?: { input: HTMLInputElement; lock: HTMLElement };
  /** A line of status text after each action. */
  onStatus?: (text: string) => void;
  /** After every change the user made (a drop, a menu action, a key). */
  onChange?: (model: Model) => void;
}

/** The demo inside a window, for ↺ Reset: whether it is at its default, and how to put it back (gliding). */
export interface DemoState { isDefault(): boolean; reset(): void }

export interface Chrome {
  model(): Model;
  /** Show another arrangement (a case), gliding from where each group is drawn. */
  setModel(m: Model, animate?: boolean): void;
  /** Register the window's demo with ↺ Reset. */
  setDemo(d: DemoState): void;
  /** The demo's state changed: refresh ↺ Reset. */
  demoChanged(): void;
  /** The drag in progress, for checks. */
  drag(): { shown: string | null; snapped: boolean; marker: boolean; vertical: boolean } | null;
  /** The dock state and its layout, for checks. */
  dock(): { state: DockState; layout: DockLayout };
}

/** What the drag intent picks among: docking's targets and its refusals (`refuse: true`: never shown, a release there goes home). */
type Choice = DockDrop | DockRefusalTarget;
/** A group's natural sizes in each form (its content, without a float's or a held frame). */
type Size = { width: number; height: number };
interface Natural { row: Size; iconsRow: Size | null; fold: Size; icons: Size | null; foldDown: Size }
interface Group { id: string; el: HTMLElement; item: LayoutItem }
interface Drag {
  id: string;
  g: Group;
  intent: DragIntent<Choice>;
  list: Choice[];
  targets: DockDrop[];
  pointer: Point;
  keys: DragKeys;
  held: HeldDrag;
  /** Its layout as it was lifted: the form it holds off every target. */
  lifted: DockItemLayout;
  /** The form it is drawn in now (axis and kind). */
  form: string;
  /** Each target's drop, solved once (a float's depends on the pointer: never kept). */
  after: Map<string, DropResult>;
  shown: DockDrop | null;
  /** The target whose room is drawn, or "" for the committed layout. */
  room: string;
  frame: DragFrame<Choice> | null;
  /** The held frame's recent top-left corners, for X-ray's motion layer. */
  trail: Point[];
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]";
const same = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
const shift = (r: Rect, dx: number, dy: number): Rect => ({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height });
const xr = (r: Rect): XR => ({ x: r.x, y: r.y, w: r.width, h: r.height });
/** The page's preview switch (islands/drop-mode.ts) as motion's preview mode: read through its plan, never its ids. */
function previewMode(): PreviewMode {
  const p = previewPlan(dropMode());
  return p.glide ? "glide" : p.room ? "placeholder" : "outline";
}

let openMenuEl: HTMLElement | null = null;
const closeMenu = (): void => {
  openMenuEl?.remove();
  openMenuEl = null;
};
document.addEventListener("pointerdown", (e) => { if (openMenuEl && !openMenuEl.contains(e.target as Node)) closeMenu(); });

/** A control with a compact form for a side rail (styles/chrome.css); a group whose controls all have one has an icon form. */
const compact = (el: Element): boolean =>
  el.matches(".lab, .h-only, .side-form, .zoomval, .tb:not(.text), .tb.text:has(> .i)") || (el.matches(".tb-row, .zoom") && [...el.children].every(compact));
/** The held groups of every window, above the page (a held group may leave its window's frame). */
let heldLayer: HTMLElement | null = null;
const heldLayerEl = (): HTMLElement => {
  if (!heldLayer) {
    heldLayer = document.createElement("div");
    heldLayer.className = "chrome-held";
    document.body.appendChild(heldLayer);
  }
  return heldLayer;
};

export function createChrome(o: ChromeOptions): Chrome {
  const root = o.root;
  const defaultModel = o.defaults ?? o.initial;
  const status = o.onStatus ?? (() => {});
  const label = (g: string): string => o.labels[g] ?? g;
  /** Elements of this window only (a figure's chrome may hold another window, as on the toolbar page). */
  const own = <T extends Element>(sel: string): T[] => [...root.querySelectorAll<T>(sel)].filter((e) => e.closest(".win") === root);
  const bars = new Map<Host, HTMLElement>(HOSTS.map((h) => [h, own<HTMLElement>(`.bar[data-host="${h}"]`)[0]!]));
  const mid = own<HTMLElement>(".mid")[0]!;
  const resetBtn = own<HTMLButtonElement>("[data-chrome-reset]")[0];
  const groupEls = own<HTMLElement>(".group[data-g]");
  // A group with no icon form shows its grip and » on a side rail.
  groupEls.forEach((g) => g.classList.toggle("noside", ![...g.querySelector(":scope > .ctl")!.children].every(compact)));
  const specs: ChromeGroup[] = groupEls.map((g) => ({ id: g.dataset.g!, priority: Number(g.dataset.priority ?? 0) || 0 }));
  let demo: DemoState | null = null;

  // ---- Measuring: the window, and each group in each of its forms ----------------------------------------------------
  /** Where the window's stage starts (its padding box), in the page's px. */
  const origin = (): Point => {
    const r = root.getBoundingClientRect();
    return { x: r.left + root.clientLeft, y: r.top + root.clientTop };
  };
  const toView = (r: Rect): Rect => {
    const p = origin();
    return shift(r, p.x, p.y);
  };
  const toStage = (p: Point): Point => {
    const q = origin();
    return { x: p.x - q.x, y: p.y - q.y };
  };
  function measureWindow(): WindowSize {
    const title = bars.get("title")!;
    const lights = title.querySelector<HTMLElement>(":scope > .winh");
    const fixed = [...title.querySelectorAll<HTMLElement>(":scope > .fixed")];
    // The window's own controls, from the first one's margin (the room before them, beyond the bar's gap) to the last.
    const tail = fixed.length ? fixed.at(-1)!.getBoundingClientRect().right - fixed[0]!.getBoundingClientRect().left + parseFloat(getComputedStyle(fixed[0]!).marginLeft) - 12 : 0;
    return {
      width: root.clientWidth,
      height: root.clientHeight,
      bar: title.offsetHeight,
      rail: parseFloat(getComputedStyle(bars.get("left")!).width) || 46,
      lead: lights ? lights.offsetWidth : 0,
      tail: Math.max(0, tail),
    };
  }
  const natural = new Map<string, Natural>();
  /** Each group's forms, measured on a hidden copy inside this window, so it wears the window's styles. */
  function measureGroups(): Record<string, GroupSize> {
    const box = document.createElement("div");
    box.className = "chrome-measure";
    box.setAttribute("aria-hidden", "true");
    root.appendChild(box);
    for (const g of groups.values()) {
      if (pop?.group === g.el) continue;
      const one = (cls: string): Size => {
        const c = g.el.cloneNode(true) as HTMLElement;
        c.removeAttribute("style");
        c.removeAttribute("data-g");
        c.querySelectorAll("[id], [data-handle], [data-ovf]").forEach((e) => ["id", "data-handle", "data-ovf"].forEach((a) => e.removeAttribute(a)));
        c.className = `group${g.el.classList.contains("noside") ? " noside" : ""} ${cls}`;
        box.appendChild(c);
        const r = c.getBoundingClientRect();
        c.remove();
        return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
      };
      const row = one("");
      const iconsRow = one("ir");
      const noside = g.el.classList.contains("noside");
      natural.set(g.id, { row, iconsRow: !noside && iconsRow.width < row.width - 1 ? iconsRow : null, fold: one("collapsed"), icons: noside ? null : one("vf"), foldDown: one("vf collapsed") });
    }
    box.remove();
    const out: Record<string, GroupSize> = {};
    natural.forEach((n, id) => (out[id] = { row: n.row, iconsRow: n.iconsRow?.width ?? null, fold: n.fold.width, icons: n.icons?.height ?? null, foldDown: n.foldDown.height }));
    return out;
  }

  // ---- The groups as layout items ----------------------------------------------------------------------------------------
  const groups = new Map<string, Group>();
  const motion = createLayoutMotion({ loop, omega: omega(), reducedMotion: reduced });
  onMotionChange(() => motion.configure({ omega: omega() }));
  let pop: { el: HTMLElement; ctl: HTMLElement; group: HTMLElement; btn: HTMLElement } | null = null;
  // Registered before measuring (the measure reads `groups`); each gets its layout item once placed.
  groupEls.forEach((el) => groups.set(el.dataset.g!, { id: el.dataset.g!, el, item: null as unknown as LayoutItem }));
  let sizes = measureGroups();
  let win = measureWindow();
  const build = (m: Model): DockState => dockStateOf(m, specs, sizes, win);
  const defaults = (): DockState => build(defaultModel);

  // ---- Stored arrangements ---------------------------------------------------------------------------------------------
  const atDefault = (): boolean => JSON.stringify(arrangementOf(state)) === JSON.stringify(arrangementOf(defaults()));
  const persist = (): void => {
    if (!o.storageKey) return;
    try {
      if (atDefault()) localStorage.removeItem(o.storageKey);
      else localStorage.setItem(o.storageKey, JSON.stringify(storeDockState(state)));
    } catch {
      /* storage blocked: the arrangement lasts for this page */
    }
  };
  let state = build(o.initial);
  let migrated = false;
  if (o.storageKey) {
    try {
      const raw = localStorage.getItem(o.storageKey);
      if (raw !== null) {
        const read = readStored(JSON.parse(raw), state, build);
        if (read) {
          // The stored state's sizes are another visit's: this page's measures win.
          state = withSizes(read.state, sizes, win);
          migrated = read.migrated;
        } else localStorage.removeItem(o.storageKey);
      }
    } catch {
      /* unreadable or storage blocked: the default */
    }
  }
  let layout = solve(state);
  if (migrated) persist();

  const isFrozen = (): boolean => !!o.freeze?.input.checked;
  const syncReset = (): void => {
    if (resetBtn) resetBtn.disabled = atDefault() && !isFrozen() && (demo ? demo.isDefault() : true);
  };
  const changed = (): void => {
    persist();
    syncReset();
    o.onChange?.(arrangementOf(state));
  };

  // ---- Drawing a layout ------------------------------------------------------------------------------------------------
  /** Each bar's » entry: the groups that went into its menu. */
  const barMenus = new Map<Host, HTMLButtonElement>();
  for (const h of HOSTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tb ovf bar-ovf";
    b.dataset.barOvf = h;
    b.hidden = true;
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-label", `${HOSTNAME[h]}: more groups`);
    b.textContent = "»";
    bars.get(h)!.appendChild(b);
    barMenus.set(h, b);
  }
  /** Where a group is drawn in a layout: its parent (its bar, or the body for a float) and its rect there. */
  function placeOf(l: DockLayout, id: string): { parent: HTMLElement; rect: Rect; p: DockItemLayout } | null {
    const p = l.items[id];
    if (!p) return null;
    if (p.floating) return { parent: mid, rect: shift(p.rect, 0, -l.content.y), p };
    const e = l.edges[p.edge!];
    if (!e || !bars.has(p.edge as Host)) return null;
    return { parent: bars.get(p.edge as Host)!, rect: shift(p.rect, -e.rect.x, -e.rect.y), p };
  }
  /** A group's form classes: grip and », icons in a row, the column form down a rail, a float's frame, in a » menu. */
  function setForm(el: HTMLElement, p: DockItemLayout): void {
    el.classList.toggle("collapsed", p.formKind === "fold");
    el.classList.toggle("ir", p.formKind === "icons" && p.axis === "row");
    el.classList.toggle("vf", p.axis === "column");
    el.classList.toggle("floating", !!p.floating);
    el.classList.toggle("inmenu", !!p.inMenu);
  }
  /** Bars with nothing drawn take no room (styles/chrome.css); the title bar always shows. */
  function syncBars(l: DockLayout): void {
    for (const h of HOSTS) {
      if (h === "title") continue;
      const e = l.edges[h];
      bars.get(h)!.classList.toggle("empty", !e || e.rect.width < 1 || e.rect.height < 1);
    }
  }
  function drawMenus(l: DockLayout): void {
    for (const h of HOSTS) {
      const b = barMenus.get(h)!;
      const e = l.edges[h];
      b.hidden = !e?.menu;
      if (!e?.menu) continue;
      const r = shift(e.menu.rect, -e.rect.x, -e.rect.y);
      const v = h === "left" || h === "right";
      // The » entry's own size, centered across its bar.
      const w = v ? Math.min(28, r.width) : r.width, ht = v ? r.height : 28;
      Object.assign(b.style, { left: `${r.x + (r.width - w) / 2}px`, top: `${r.y + (r.height - ht) / 2}px`, width: `${w}px`, height: `${ht}px` });
    }
  }
  const padOrigin = (el: HTMLElement): Point => {
    const r = el.getBoundingClientRect();
    return { x: r.left + el.clientLeft, y: r.top + el.clientTop };
  };
  /**
   * Draw `l`: every group in its bar at its rect and form. "glide": a flip, each group settling from where it is drawn
   * (between bars too); "jump": placed at once (a resize, a new measure).
   */
  function draw(l: DockLayout, how: "glide" | "jump"): void {
    // Moving a group to another bar moves its element: the focus inside it is put back.
    const focused = document.activeElement instanceof HTMLElement && document.activeElement.closest(".group") ? document.activeElement : null;
    const moves = [...groups.values()].flatMap((g) => {
      const at = placeOf(l, g.id);
      return at ? [{ g, ...at }] : [];
    });
    const change = (): void => {
      syncBars(l);
      for (const m of moves) {
        if (m.g.el.parentElement !== m.parent) m.parent.appendChild(m.g.el);
        m.g.el.classList.remove("lifted");
        setForm(m.g.el, m.p);
      }
      drawMenus(l);
    };
    if (how === "glide") {
      flip(
        moves.map((m) => ({
          item: m.g.item,
          node: m.g.el,
          place: (before: Rect) => {
            const q = padOrigin(m.parent);
            return { from: shift(before, -q.x, -q.y), to: m.rect };
          },
        })),
        change,
      );
    } else {
      change();
      for (const m of moves) if (!same(m.g.item.target, m.rect) || !same(m.g.item.box, m.rect)) m.g.item.jumpTo(m.rect);
    }
    if (focused && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    if (!drag) requestAnimationFrame(() => xrayRest());
  }

  // ---- The first frame: the server's flow layout, then each group placed at its solved rect -------------------------
  {
    const before = new Map([...groups.values()].map((g) => [g.id, g.el.getBoundingClientRect()]));
    syncBars(layout);
    for (const g of groups.values()) {
      const at = placeOf(layout, g.id);
      if (!at) continue;
      at.parent.appendChild(g.el);
      g.el.classList.add("placed");
      setForm(g.el, at.p);
    }
    // The server's float frames: a floating group wears its own frame from now on.
    own<HTMLElement>(".floating:not(.group)").forEach((f) => f.remove());
    drawMenus(layout);
    for (const g of groups.values()) {
      const at = placeOf(layout, g.id);
      if (!at) continue;
      g.item = motion.add(g.id, domDrawable({ node: g.el }), at.rect);
      // From where the server drew it: no motion when the dock state reproduces it (the default), a glide when the
      // visitor's stored arrangement differs.
      const b = before.get(g.id)!;
      if (b.width > 0) {
        const q = padOrigin(at.parent);
        g.item.glideFrom({ x: b.left - q.x, y: b.top - q.y, width: b.width, height: b.height }, at.rect);
      }
    }
    root.classList.add("docked");
  }

  /** Make `next` the state: solved against the layout before, drawn (gliding), said, and (a person's change) stored. */
  function commit(next: DockState, say?: string, opts: { how?: "glide" | "jump"; byPage?: boolean } = {}): void {
    state = next;
    layout = solve(state, { previous: layout });
    draw(layout, opts.how ?? "glide");
    if (say) status(say);
    if (opts.byPage) syncReset();
    else changed();
  }

  // ---- Refit: the window resized, or a group's controls changed size ---------------------------------------------------
  let refitPending = 0;
  let remeasure = false;
  function refit(): void {
    refitPending = 0;
    if (drag || pop) return;
    const w = measureWindow();
    const s = remeasure ? measureGroups() : sizes;
    remeasure = false;
    if (JSON.stringify(w) === JSON.stringify(win) && JSON.stringify(s) === JSON.stringify(sizes)) return;
    win = w;
    sizes = s;
    state = withSizes(state, sizes, win);
    layout = solve(state, { previous: layout });
    draw(layout, "jump");
  }
  const askRefit = (measure: boolean): void => {
    remeasure ||= measure;
    if (!refitPending) refitPending = requestAnimationFrame(refit);
  };
  new ResizeObserver(() => askRefit(false)).observe(root);
  const ro = new ResizeObserver(() => askRefit(true));
  groups.forEach((g) => ro.observe(g.el.querySelector(":scope > .ctl")!));
  void document.fonts?.ready.then(() => askRefit(true));

  // ---- Freeze -----------------------------------------------------------------------------------------------------------
  const syncFreeze = (): void => {
    root.classList.toggle("frozen", isFrozen());
    o.freeze?.lock.classList.toggle("on", isFrozen());
    syncReset();
  };
  o.freeze?.input.addEventListener("change", syncFreeze);
  window.addEventListener("keydown", (e) => { if (e.key === "Alt") root.classList.add("alt"); });
  window.addEventListener("keyup", (e) => { if (e.key === "Alt") root.classList.remove("alt"); });
  window.addEventListener("blur", () => root.classList.remove("alt"));
  const frozenNow = (alt = false): boolean => isFrozen() && !alt && !root.classList.contains("alt");

  // ---- » : a group's full row in a popover --------------------------------------------------------------------------------
  function closePop(focus = true): void {
    if (!pop) return;
    const p = pop;
    pop = null;
    p.group.insertBefore(p.ctl, p.group.querySelector(":scope > .ovf"));
    p.btn.setAttribute("aria-expanded", "false");
    p.el.remove();
    if (focus) p.btn.focus();
    askRefit(true);
  }
  /** Open `group`'s controls in a popover anchored to `btn` (its own », or its bar's). */
  function openPop(group: HTMLElement, btn: HTMLElement): void {
    closePop(false);
    closeMenu();
    userAction();
    const ctl = group.querySelector<HTMLElement>(":scope > .ctl")!;
    const el = document.createElement("div");
    el.className = "cpop";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", label(group.dataset.g!));
    el.appendChild(ctl);
    document.body.appendChild(el);
    pop = { el, ctl, group, btn };
    btn.setAttribute("aria-expanded", "true");
    // Anchored to »: beside a side rail, else below it, flipped above when there is no room; never off the page.
    const r = btn.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const bar = btn.closest<HTMLElement>(".bar");
    let x: number, y: number;
    if (bar?.classList.contains("left")) [x, y] = [r.right + 8, r.top];
    else if (bar?.classList.contains("right")) [x, y] = [r.left - 8 - w, r.top];
    else [x, y] = [r.left, r.bottom + 6 + h > innerHeight - 8 ? r.top - 6 - h : r.bottom + 6];
    el.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px";
    el.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + "px";
    el.addEventListener("pointerdown", () => userAction());
    el.addEventListener("keydown", (e) => {
      const list = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePop();
      } else if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key) && list.length && !(document.activeElement instanceof HTMLInputElement && document.activeElement.type === "range")) {
        e.preventDefault();
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
        list[(i + step + list.length) % list.length]!.focus();
      }
    });
    el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }
  document.addEventListener("pointerdown", (e) => {
    if (pop && !pop.el.contains(e.target as Node) && !pop.btn.contains(e.target as Node)) closePop(false);
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop) closePop(); });
  /** A bar's »: a menu of the groups in it; each opens that group's controls. */
  function openBarMenu(h: Host, btn: HTMLButtonElement): void {
    closeMenu();
    closePop(false);
    const ids = layout.edges[h]?.menu?.items ?? [];
    const m = document.createElement("div");
    m.className = "cmenu";
    m.setAttribute("role", "menu");
    m.innerHTML = `<div class="it head">${HOSTNAME[h]}: no room for</div><div class="sep"></div>${ids.map((id) => `<div class="it" role="menuitem" tabindex="-1" data-open="${id}">${label(id)}</div>`).join("")}`;
    document.body.appendChild(m);
    openMenuEl = m;
    placeMenu(m, btn);
    m.addEventListener("click", (ev) => {
      const id = (ev.target as HTMLElement).closest<HTMLElement>("[data-open]")?.dataset.open;
      if (!id) return;
      closeMenu();
      openPop(groups.get(id)!.el, btn);
    });
    menuKeys(m);
  }

  // ---- The menu ---------------------------------------------------------------------------------------------------------
  const placeMenu = (m: HTMLElement, anchor: HTMLElement): void => {
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + "px";
    m.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8)) + "px";
  };
  /** Arrow keys walk a menu's items, Enter or Space picks one, Escape closes it. */
  function menuKeys(m: HTMLElement): void {
    const items = (): HTMLElement[] => [...m.querySelectorAll<HTMLElement>("[data-act], [data-open]")].filter((x) => !x.classList.contains("dis"));
    items().forEach((x) => (x.tabIndex = -1));
    m.addEventListener("keydown", (e) => {
      const list = items(), i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    });
    items()[0]?.focus();
  }
  /** The groups docking offers a bar: its stops for `id` there, in reading order (none: it has no room for it). */
  const stopsIn = (id: string, h: Host): DockDrop[] => stops(state, id, { previous: layout }).filter((t) => t.place.kind === "gap" && t.place.edge === h);
  const handFolded = (id: string): boolean => (state.items[id]?.from ?? 0) >= 1;
  function openMenu(id: string, anchor: HTMLElement, alt: boolean): void {
    closeMenu();
    closePop(false);
    const frozen = frozenNow(alt);
    const p = layout.items[id];
    const edge = p && !p.floating ? (p.edge as Host) : null;
    const dis = frozen ? " dis" : "";
    const items: string[] = [`<div class="it head">${label(id)}</div><div class="sep"></div>`];
    if (frozen) items.push(`<div class="it note">Frozen: hold Alt to move or collapse</div><div class="sep"></div>`);
    items.push(`<div class="it${dis}" role="menuitem" data-act="toggle">${handFolded(id) ? "Expand" : "Collapse"}<span class="kb">double-click</span></div><div class="sep"></div>`);
    items.push(`<div class="it note">Move to</div>`);
    for (const h of HOSTS) {
      const room = h === edge || stopsIn(id, h).length > 0;
      items.push(`<div class="it sub${room ? dis : " dis"}" role="menuitem" data-act="move:${h}">${HOSTNAME[h]}${h === edge ? '<span class="kb">✓</span>' : room ? "" : '<span class="kb">no room</span>'}</div>`);
    }
    items.push(edge ? `<div class="it${dis}" role="menuitem" data-act="float">Float</div>` : `<div class="it${dis}" role="menuitem" data-act="dock">Dock</div>`);
    if (edge) {
      items.push(`<div class="sep"></div><div class="it note">Move this bar's groups to</div>`);
      for (const h of HOSTS) if (h !== edge && h !== "title") items.push(`<div class="it sub${dis}" role="menuitem" data-act="bar:${h}">${HOSTNAME[h]}</div>`);
    }
    items.push(`<div class="sep"></div><div class="it" role="menuitem" data-act="reset">Reset position</div><div class="it" role="menuitem" data-act="resetall">Reset all</div>`);
    const m = document.createElement("div");
    m.className = "cmenu";
    m.setAttribute("role", "menu");
    m.innerHTML = items.join("");
    document.body.appendChild(m);
    openMenuEl = m;
    placeMenu(m, anchor);
    m.addEventListener("click", (ev) => {
      const act = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (!act) return;
      closeMenu();
      doAct(id, act);
      groups.get(id)?.el.querySelector<HTMLElement>("[data-handle]")?.focus({ preventScroll: true });
    });
    menuKeys(m);
  }
  /** Where a drop lands, in words: the bar, the zone, and between which groups. */
  function placeWords(l: DockLayout, id: string): string {
    const p = l.items[id];
    if (!p) return "";
    if (p.floating) return "floating";
    const h = p.edge as Host;
    const zone = p.zone ?? "start";
    const ids = (l.edges[h]?.items ?? []).filter((x) => groups.has(x) && l.items[x]?.zone === zone && !l.items[x]?.inMenu);
    const i = ids.indexOf(id), a = ids[i - 1], b = ids[i + 1];
    const where = !a && !b ? "" : !a ? "before all" : !b ? "after all" : `between ${label(a)} and ${label(b)}`;
    return `${HOSTNAME[h]} · ${ZONENAME(h, zone)}${where ? " · " + where : ""}`;
  }
  function doAct(id: string, act: string): void {
    const [k, arg] = act.split(":") as [string, Host | undefined];
    const p = layout.items[id];
    if (k === "toggle") {
      if (!handFolded(id) && p?.foldedBy === "auto") return status(`${label(id)}: folded for room; widen the window or move a group away, or open it with »`);
      const next = foldItem(state, id, !handFolded(id));
      return next === state ? status(`${label(id)} has no folded form here`) : commit(next, `${label(id)}: ${handFolded(id) ? "expanded" : "collapsed"}`);
    }
    if (k === "move" && arg) {
      const t = stopsIn(id, arg).at(-1);
      if (!t || t.place.kind !== "gap") return status(`${HOSTNAME[arg]} has no room for ${label(id)}`);
      const next = moveTo(state, id, t.place);
      return commit(next, `${label(id)} → ${placeWords(solve(next, { previous: layout }), id)}`);
    }
    if (k === "float") return commit(moveTo(state, id, { kind: "float", anchor: FLOAT_HOME }), `${label(id)} floats on the content's bottom edge`);
    if (k === "dock") {
      const home = homeFor(state, id, defaults());
      const next = home && home.kind !== "float" ? dockHome(state, id, defaults()) : (() => {
        const t = stops(state, id, { previous: layout }).find((x) => x.place.kind === "gap");
        return t && t.place.kind === "gap" ? moveTo(state, id, t.place) : state;
      })();
      return next === state ? status(`No bar has room for ${label(id)}`) : commit(next, `${label(id)} docked: ${placeWords(solve(next, { previous: layout }), id)}`);
    }
    if (k === "bar" && arg && p?.edge) {
      const from = state.edges.find((e) => e.id === p.edge)!;
      const to = state.edges.find((e) => e.id === arg)!;
      let next = state;
      for (const gid of from.items.filter((x) => groups.has(x))) {
        const zone = zoneIn(to, next.items[gid]!);
        const there = next.edges.find((e) => e.id === arg)!.items.filter((x) => next.items[x] && !next.items[x]!.fixed && zoneIn(to, next.items[x]!) === zone);
        next = moveTo(next, gid, { kind: "gap", edge: arg, zone, at: there.length });
      }
      return commit(next, `${HOSTNAME[p.edge as Host]}'s groups → ${HOSTNAME[arg]}`);
    }
    if (k === "reset") return commit(dockHome(state, id, defaults()), `${label(id)} back to its default place`);
    if (k === "resetall") return commit(defaults(), "Every group back to its default place");
  }
  root.addEventListener("contextmenu", (e) => {
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    if (!h || h.closest(".win") !== root) return;
    e.preventDefault();
    openMenu(h.dataset.handle!, h, e.altKey);
  });
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const ov = t.closest<HTMLButtonElement>("[data-ovf]");
    if (ov && ov.closest(".win") === root) {
      if (pop && pop.btn === ov) closePop();
      else openPop(ov.closest<HTMLElement>(".group")!, ov);
      return;
    }
    const bo = t.closest<HTMLButtonElement>("[data-bar-ovf]");
    if (bo && bo.closest(".win") === root) {
      if (openMenuEl) closeMenu();
      else openBarMenu(bo.dataset.barOvf as Host, bo);
    }
  });
  // A press on a group's controls is a use: when room runs out, it gives way after the groups used longer ago.
  root.addEventListener("pointerdown", (e) => {
    const g = (e.target as HTMLElement).closest<HTMLElement>(".group[data-g]");
    if (!g || g.closest(".win") !== root || (e.target as HTMLElement).closest("[data-handle]")) return;
    const next = markUsed(state, g.dataset.g!);
    if (next === state) return;
    state = next;
    layout = solve(state, { previous: layout });
  });

  // ---- Keys on a grip: the menu, fold, and the arrow moves over docking's stops -----------------------------------------
  /** Where a rect lies in the stops' reading order (left rail, bars top to bottom, right rail), as `stops` sorts them. */
  function readingKey(side: string, r: Rect): [number, number, number] {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    if (side === "left") return [0, cx, cy];
    if (side === "right") return [3, -cx, cy];
    return side === "bottom" ? [2, -cy, cx] : [1, cy, cx];
  }
  const before = (a: [number, number, number], b: [number, number, number]): boolean => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) < 0;
  /** Move `id` to the next (1) or previous (-1) of docking's stops, from where it lies. */
  function stepStop(id: string, dir: 1 | -1): void {
    const p = layout.items[id];
    if (!p) return;
    const sideOf = (edge: string): string => state.edges.find((e) => e.id === edge)?.side ?? "float";
    const list = stops(state, id, { previous: layout }).filter((t) => t.place.kind === "gap");
    if (!list.length) return status(`No other place has room for ${label(id)}`);
    const keyOf = (t: DockDrop): [number, number, number] => readingKey(t.place.kind === "gap" ? sideOf(t.place.edge) : "float", t.slot ?? t.hit);
    const here: [number, number, number] = p.floating ? [dir > 0 ? -1 : 9, 0, 0] : readingKey(sideOf(p.edge!), p.rect);
    const t = dir > 0 ? list.find((x) => before(here, keyOf(x))) : list.findLast((x) => before(keyOf(x), here));
    if (!t || t.place.kind !== "gap") return status(`${label(id)}: no place ${dir > 0 ? "after" : "before"} this one`);
    const next = t.after({ x: 0, y: 0 }).state;
    commit(next, `${label(id)} → ${placeWords(solve(next, { previous: layout }), id)}`);
  }
  root.addEventListener("keydown", (e) => {
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    if (!h || h.closest(".win") !== root) return;
    const id = h.dataset.handle!;
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      e.preventDefault();
      openMenu(id, h, e.altKey);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!frozenNow(e.altKey)) doAct(id, "toggle");
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (frozenNow(e.altKey)) return status("Frozen: hold Alt to move");
      stepStop(id, e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Escape") closeMenu();
  });

  // ---- ↺ Reset ----------------------------------------------------------------------------------------------------------
  resetBtn?.addEventListener("click", () => {
    closeMenu();
    closePop(false);
    if (o.freeze && o.freeze.input.checked) {
      // Through a change event, so every window sharing the lock (the toolbar page's sample) unfreezes too.
      o.freeze.input.checked = false;
      o.freeze.input.dispatchEvent(new Event("change"));
    }
    demo?.reset();
    commit(defaults(), "Back to the default: every group, the demo, unfrozen");
  });

  // ---- Dragging a group by its grip ---------------------------------------------------------------------------------------
  const indlabel = document.createElement("div");
  indlabel.className = "chrome-label";
  indlabel.setAttribute("aria-hidden", "true");
  document.body.appendChild(indlabel);
  const marker = document.createElement("div");
  marker.className = "chrome-marker";
  document.body.appendChild(marker);
  /** The empty bars' and rails' drop strips (docking's `strip:` targets), drawn while a group is held. */
  const strips: HTMLElement[] = [];

  /** A group's content size in a form (axis and kind), and the rect its content takes inside a rect solved for it. */
  function contentOf(id: string, p: Pick<DockItemLayout, "axis" | "formKind" | "floating">): Size {
    const n = natural.get(id)!;
    if (p.axis === "column" && !p.floating) return p.formKind === "icons" && n.icons ? n.icons : n.foldDown;
    return p.formKind === "fold" ? n.fold : p.formKind === "icons" && n.iconsRow ? n.iconsRow : n.row;
  }
  /** The held frame for a solved rect: the content where the layout puts it, the frame around it (a float's rect is framed already). */
  function heldBox(id: string, p: DockItemLayout): Rect {
    if (p.floating) return p.rect;
    const c = contentOf(id, p), r = p.rect;
    const content = p.axis === "column" ? { x: r.x + (r.width - c.width) / 2, y: r.y, width: c.width, height: r.height } : { x: r.x, y: r.y + (r.height - c.height) / 2, width: r.width, height: c.height };
    return { x: content.x - FLOAT_FRAME.x, y: content.y - FLOAT_FRAME.y, width: content.width + 2 * FLOAT_FRAME.x, height: content.height + 2 * FLOAT_FRAME.y };
  }
  const framed = (s: Size): Size => ({ width: s.width + 2 * FLOAT_FRAME.x, height: s.height + 2 * FLOAT_FRAME.y });

  let drag: Drag | null = null;
  const session = createDragSession({ root, point: (e) => ({ x: e.clientX, y: e.clientY }), frame });
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag) return;
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    if (!h || h.closest(".win") !== root) return;
    const id = h.dataset.handle!;
    session.press(e, id, {
      lift: (start, p, keys) => {
        if (frozenNow(!!keys.alt)) {
          status("Frozen: hold Alt to move");
          return false;
        }
        return begin(id, start, p, keys);
      },
      move: (p, keys) => {
        if (!drag) return;
        drag.pointer = p;
        drag.keys = keys;
        drag.held.move(p);
      },
      release: (p, keys, cancel) => {
        if (!drag) return;
        drag.pointer = p;
        drag.keys = keys;
        end(cancel);
      },
      escape: () => end(true),
      keys: (k) => void (drag && (drag.keys = k)),
      ended: (how) => {
        if (how !== "doubleActivate") return;
        if (frozenNow(root.classList.contains("alt"))) status("Frozen: hold Alt to collapse");
        else doAct(id, "toggle");
      },
    });
  });

  /** Lift `id`, pressed at `start`, the pointer now at `p` (page px). False when nothing can be lifted. */
  function begin(id: string, start: Point, p: Point, keys: DragKeys): boolean {
    const g = groups.get(id), was = layout.items[id];
    if (!g || !was || was.inMenu) return false;
    closeMenu();
    closePop(false);
    setDragging(true);
    // The real group leaves its bar for the page's held layer, framed, its content where it was.
    const box = toView(heldBox(id, was));
    heldLayerEl().appendChild(g.el);
    g.el.classList.add("lifted");
    g.el.classList.remove("floating", "inmenu");
    g.item.jumpTo(box);
    const held = holdItem(g.item, { x: start.x - box.x, y: start.y - box.y });
    held.move(p);
    root.classList.add("dragging");
    const list = targets(state, id, { previous: layout });
    const refused = refusalTargets(refusals(state, id, { previous: layout }));
    drag = {
      id,
      g,
      // Home is its own rect (a float: the press point); the intent clamps the pointer onto the window's stage.
      intent: createDragIntent<Choice>({ home: was.floating ? { ...toStage(start), width: 0, height: 0 } : was.rect, lift: toStage(start), bounds: state.stage }),
      list: [...list, ...refused],
      targets: list,
      pointer: p,
      keys,
      held,
      lifted: was,
      form: `${was.axis}:${was.formKind}`,
      after: new Map(),
      shown: null,
      room: "",
      frame: null,
      trail: [],
    };
    // Empty bars and rails take no room: while a group is held, their drop strips show where they open.
    for (const t of list) {
      if (!t.id.startsWith("strip:")) continue;
      const s = document.createElement("div");
      s.className = "chrome-strip";
      Object.assign(s.style, { left: `${t.hit.x}px`, top: `${t.hit.y}px`, width: `${t.hit.width}px`, height: `${t.hit.height}px` });
      root.appendChild(s);
      strips.push(s);
    }
    session.started("group", performance.now());
    status(`${label(id)}: drop it in a bar or on a side rail, or over the content to float it`);
    return true;
  }

  /** A target's drop, solved once per drag (a float's follows the pointer). */
  function afterOf(d: Drag, t: DockDrop): DropResult {
    const hb = d.held.held;
    const grab = hb ? { x: d.pointer.x - hb.x, y: d.pointer.y - hb.y } : { x: 0, y: 0 };
    if (t.place.kind === "float") return t.after(toStage(d.pointer), grab);
    let r = d.after.get(t.id);
    if (!r) d.after.set(t.id, (r = t.after(toStage(d.pointer), grab)));
    return r;
  }

  /** One frame of the drag: the intent's pick, the held group's form and preview, the room, the outline. */
  function frame(now: number): void {
    const d = drag;
    if (!d) return;
    const f = d.intent.update(toStage(d.pointer), now, d.list, d.keys);
    d.frame = f;
    const plan = planOf(f, previewMode());
    const shown = f.shown && !f.shown.refuse ? (f.shown as DockDrop) : null;
    d.shown = shown;
    const after = shown ? afterOf(d, shown) : null;
    const mine = after?.layout.items[d.id] ?? null;
    // Over a target the held group takes the form the drop gives it (its column form over a rail); off every target, its own.
    const form = mine ?? d.lifted;
    const key = `${form.axis}:${form.formKind}`;
    if (key !== d.form) {
      d.form = key;
      d.g.el.classList.toggle("collapsed", form.formKind === "fold");
      d.g.el.classList.toggle("ir", form.formKind === "icons" && form.axis === "row");
      d.g.el.classList.toggle("vf", form.axis === "column" && !form.floating);
      d.held.resize(framed(contentOf(d.id, form)));
    }
    const docked = !!mine && !mine.floating;
    d.held.preview(plan, docked && plan.snapItem ? toView(heldBox(d.id, mine)) : null);
    // The room: the others where the shown target's drop puts them, or where they are.
    const roomKey = plan.makeRoom && shown && docked ? shown.id : "";
    if (roomKey !== d.room) {
      d.room = roomKey;
      const l = roomKey && after ? after.layout : layout;
      for (const g of groups.values()) {
        if (g === d.g) continue;
        const at = placeOf(l, g.id);
        // The others stay in their bars during a drag; only their place and form follow the room.
        if (!at || at.parent !== g.el.parentElement) continue;
        setForm(g.el, at.p);
        g.item.moveTo(at.rect);
      }
    }
    // The outline: the group's own size where it lands.
    const out = plan.showIndicator && mine ? toView(mine.floating ? mine.rect : inset(heldBox(d.id, mine))) : null;
    marker.classList.toggle("on", !!out);
    if (out) Object.assign(marker.style, { left: `${out.x}px`, top: `${out.y}px`, width: `${out.width}px`, height: `${out.height}px` });
    // Its words: where it lands, over the outline or the slot it sits in; "Can't go here" at the pointer over a refusal.
    const said = f.refused ? "Can't go here" : shown && after && (out || d.held.snapped) ? (shown.place.kind === "float" ? "Float here" : placeWords(after.layout, d.id)) : "";
    const at = out ?? d.held.snapped ?? (f.refused ? { x: d.pointer.x + 12, y: d.pointer.y + 28, width: 0, height: 0 } : null);
    indlabel.classList.toggle("on", !!said && !!at);
    if (said && at) {
      indlabel.textContent = said;
      Object.assign(indlabel.style, { left: `${Math.max(4, Math.min(at.x, innerWidth - indlabel.offsetWidth - 4))}px`, top: `${Math.max(4, at.y - 28)}px` });
    }
    xrayDrag(d, f, mine, plan.makeRoom);
  }
  const inset = (r: Rect): Rect => ({ x: r.x + FLOAT_FRAME.x, y: r.y + FLOAT_FRAME.y, width: r.width - 2 * FLOAT_FRAME.x, height: r.height - 2 * FLOAT_FRAME.y });

  /** Let go (`cancel`: Escape, or the system took the pointer): the drop commits the shown target's state, else it goes home. */
  function end(cancel: boolean): void {
    const d = drag;
    if (!d) return;
    const now = performance.now();
    const t = cancel ? null : (d.intent.release(toStage(d.pointer), now, d.list, d.keys) as Choice | null);
    const drop = t && !t.refuse && (t as DockDrop).place.kind !== "home" && (t as DockDrop).place.kind !== "none" ? (t as DockDrop) : null;
    const refusedHere = !cancel && !!d.frame?.refused;
    const next = drop ? afterOf(d, drop).state : null;
    drag = null;
    session.ended();
    root.classList.remove("dragging");
    marker.classList.remove("on");
    indlabel.classList.remove("on");
    strips.splice(0).forEach((s) => s.remove());
    setDragging(false);
    if (next) commit(next, `${label(d.id)} → ${placeWords(solve(next, { previous: layout }), d.id)}`);
    else {
      // Back home, gliding from where it was let go; the others back where they were.
      draw(layout, "glide");
      status(cancel ? "Canceled: back where it was" : refusedHere ? "Can't go there: back where it was" : t ? "Back in its place" : "Released with no target: back where it was");
    }
    xrayRest();
  }
  window.addEventListener("blur", () => end(true));

  // ---- X-ray: docking's solve rects and targets (rose), motion's held settle, trail and aim -----------------------------
  const xray = xrayOf(root.tagName === "FIGURE" ? root : (root.closest<HTMLElement>("figure.win") ?? root));
  const xowner = `chrome:${root.id || "win"}`;
  /** At rest: the rect `solve` gave each group, labelled with the form it took. */
  function xrayRest(): void {
    if (!xray.on || drag) return;
    const rects = [...groups.keys()].flatMap((id) => {
      const p = layout.items[id];
      return p && !p.inMenu ? [{ r: xr(toView(p.rect)), label: `${id} · ${p.formKind}` }] : [];
    });
    xray.draw(xowner, { dock: { rects } });
  }
  /** During a drag: docking's targets (their hits, with priority) and refusals, the shown slot; the held settle, trail and aim. */
  function xrayDrag(d: Drag, f: DragFrame<Choice>, mine: DockItemLayout | null, room: boolean): void {
    if (!xray.on) return;
    const hits = d.targets.filter((t) => t.place.kind !== "float").map((t) => ({ r: xr(toView(t.hit)), label: t.id === d.shown?.id ? `${t.id} · p${t.priority}` : undefined }));
    const refused = d.list.filter((t) => t.refuse).map((t) => ({ r: xr(toView(t.hit)) }));
    const slots = mine ? [{ r: xr(toView(mine.rect)), on: true, label: d.shown!.id }] : [];
    const drawn = d.g.item.drawn;
    d.trail.push({ x: drawn.x, y: drawn.y });
    if (d.trail.length > 48) d.trail.shift();
    const frame: XrayFrame = {
      dock: { hits, refused, slots },
      drawn: xr(drawn),
      target: xr(d.g.item.target),
      trail: d.trail,
      aim: { p: d.pointer, state: !f.aiming ? "fly" : room ? "room" : "aim" },
    };
    xray.draw(xowner, frame);
  }
  xray.onChange(() => xrayRest());

  syncFreeze();
  syncReset();
  return {
    model: () => clone(arrangementOf(state)),
    setModel(m, animate = true) {
      commit(build(m), undefined, { how: animate ? "glide" : "jump", byPage: true });
    },
    setDemo(dm) {
      demo = dm;
      syncReset();
    },
    demoChanged: syncReset,
    drag: () => (drag ? { shown: drag.shown ? (drag.shown.place.kind === "float" ? "Float here" : drag.shown.id) : null, snapped: !!drag.held.snapped, marker: marker.classList.contains("on"), vertical: drag.g.el.classList.contains("vf") } : null),
    dock: () => ({ state, layout }),
  };
}
