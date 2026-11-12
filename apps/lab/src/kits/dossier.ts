/**
 * A small dossier window for the kit cases: title, top, left, right and bottom bars, five toolbar groups (Navigate,
 * Zoom, Annotate, Redact, Share), on the real packages:
 *
 * - @n-uf/placement/toolbar lays the groups out in their hosts; @n-uf/placement/targets lists the drop targets a
 *   lifted group has (`hostTargets` per bar, `floatTarget` over the document);
 * - @n-uf/motion/drag decides what a drag shows and where a release lands (`createDragIntent`, `previewPlan`);
 * - @n-uf/motion/layout moves the real groups: one item each, the held drag (`holdItem`), the glide home.
 *
 * Everything is in page space: the window's own coordinates, before any scale. A pointer comes in as client
 * coordinates and is converted, `(client − origin) / scale` (case 10), unless `convert` says not to (the bug the
 * conversion fixes). The slot, a group's own outline where it would land, shows whenever a target shows.
 */
import type { FrameLoop, Point, Rect } from "@n-uf/motion";
import { createDragIntent, previewPlan, type DragIntent } from "@n-uf/motion/drag";
import { createLayoutMotion, domDrawable, holdItem, type HeldDrag, type LayoutItem, type LayoutMotion } from "@n-uf/motion/layout";
import { floatTarget, hostTargets, type ToolbarFloatTarget, type ToolbarTarget } from "@n-uf/placement/targets";
import { HOSTS, arrangement, hostOf, layoutHost, sameArrangement, vertical, type Arrangement, type GroupSize, type HostId, type HostSpec } from "@n-uf/placement/toolbar";
import { keyboardOrder, placeKey } from "./stops";

export type GroupId = "navigate" | "zoom" | "annotate" | "redact" | "share";
export const GROUPS: readonly GroupId[] = ["navigate", "zoom", "annotate", "redact", "share"];
export const GROUP_LABEL: Readonly<Record<GroupId, string>> = { navigate: "Navigate", zoom: "Zoom", annotate: "Annotate", redact: "Redact", share: "Share" };
const CELLS: Readonly<Record<GroupId, readonly (readonly [string, string])[]>> = {
  navigate: [["‹", "Previous page"], ["›", "Next page"], ["⤒", "First page"]],
  zoom: [["−", "Zoom out"], ["%", "Fit width"], ["+", "Zoom in"]],
  annotate: [["✎", "Pen"], ["▭", "Box"], ["T", "Text"]],
  redact: [["▇", "Redact an area"], ["⌫", "Remove a redaction"]],
  share: [["⇪", "Share"], ["⎙", "Print"]],
};

/** Where the groups start. */
export const HOME: Arrangement<GroupId> = arrangement<GroupId>({ title: { end: ["share"] }, top: { start: ["navigate", "zoom"], end: ["annotate", "redact"] } });

export type KTarget = ToolbarTarget<GroupId> | ToolbarFloatTarget<GroupId>;

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const inRect = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x + a.width, b.x + b.width) - x, Math.max(a.y + a.height, b.y + b.height) - y);
};

// --- geometry (page space) -----------------------------------------------------------------------------------------

export const W = 600;
export const H = 360;
const T = 34;
export const HOST_RECT: Readonly<Record<HostId, Rect>> = {
  title: rect(0, 0, W, T),
  top: rect(0, T, W, T),
  bottom: rect(0, H - T, W, T),
  left: rect(0, 2 * T, T, H - 3 * T),
  right: rect(W - T, 2 * T, T, H - 3 * T),
};
/** The document area: where a group floats. */
export const STAGE: Rect = rect(T, 2 * T, W - 2 * T, H - 3 * T);
const spec = (h: HostId): HostSpec => ({ length: vertical(h) ? HOST_RECT[h].height : HOST_RECT[h].width, thickness: T, lead: h === "title" ? 64 : 6, tail: 6 });
const CELL = 24;
const HANDLE = 14;
const groupSize = (g: GroupId): { along: number; across: number } => ({ along: HANDLE + CELLS[g].length * CELL + 2, across: CELL });
const size: GroupSize<GroupId> = (g) => groupSize(g);
/** A group's rect at `form` (vertical: a column). */
const sized = (g: GroupId, form: boolean): { width: number; height: number } => {
  const s = groupSize(g);
  return form ? { width: s.across, height: s.along } : { width: s.along, height: s.across };
};

export interface Placed {
  readonly rect: Rect;
  readonly vertical: boolean;
  readonly host: HostId | "float";
}

/** Where every group sits in `a`, in page space. */
export function placements(a: Arrangement<GroupId>): Map<GroupId, Placed> {
  const out = new Map<GroupId, Placed>();
  for (const h of HOSTS) {
    const o = HOST_RECT[h];
    const l = layoutHost(a[h], h, spec(h), size, a.collapsed);
    for (const [g, s] of l.slots) out.set(g, { rect: rect(o.x + s.x, o.y + s.y, s.width, s.height), vertical: vertical(h), host: h });
  }
  for (const f of a.floating) {
    const s = sized(f.id, false);
    out.set(f.id, { rect: rect(STAGE.x + f.x, STAGE.y + f.y, s.width, s.height), vertical: false, host: "float" });
  }
  return out;
}

// --- the dossier ---------------------------------------------------------------------------------------------------

export interface DossierOptions {
  readonly title: string;
  readonly loop: FrameLoop;
  /** The targets a group may use (case 6: the kit's constraint); default all of them. */
  readonly allows?: (g: GroupId, t: KTarget) => boolean;
  /** The page's scale (case 10); default 1. */
  readonly scale?: () => number;
  /** Convert the pointer into page space before the intent reads it; default true (false: case 10's bug). */
  readonly convert?: () => boolean;
}

/** One frame of a drag, as the dossier drew it. */
export interface DragFrameRecord {
  readonly t: number;
  /** The point the intent read (page space). */
  readonly read: Point;
  readonly shown: string | null;
}

export interface DragRecord {
  readonly group: GroupId;
  readonly frames: readonly DragFrameRecord[];
  readonly landed: string | null;
  readonly release: Rect;
  readonly home: Rect;
  readonly grab: Point;
}

export interface Dossier {
  /** The window (page space; its client rect's top-left is the page origin). */
  readonly el: HTMLElement;
  readonly arrangement: () => Arrangement<GroupId>;
  readonly reset: () => void;
  /** The targets a drag of `g` uses (the constraint applied), and all of them. */
  readonly targets: (g: GroupId) => KTarget[];
  readonly allTargets: (g: GroupId) => KTarget[];
  /** The keyboard stops of `g`, in order; and the index the first forward arrow goes to. */
  readonly stops: (g: GroupId) => ToolbarTarget<GroupId>[];
  readonly firstStop: (g: GroupId, forward: boolean) => number;
  readonly handle: (g: GroupId) => HTMLButtonElement;
  readonly groupEl: (g: GroupId) => HTMLElement;
  /** A drawn element's rect in page space (from its client rect). */
  readonly drawn: (el: Element) => Rect;
  /** The slot as drawn (page space), or null when none shows. */
  readonly slot: () => Rect | null;
  readonly toClient: (p: Point) => Point;
  readonly toPage: (client: Point) => Point;
  readonly menu: () => HTMLElement | null;
  readonly openMenu: (g: GroupId) => HTMLElement;
  readonly closeMenu: () => void;
  readonly setXray: (on: boolean) => void;
  readonly dragging: () => boolean;
  /** A keyboard move in progress: the group and the stop it shows. */
  readonly keyMove: () => { readonly g: GroupId; readonly i: number } | null;
  readonly lastDrag: () => DragRecord | null;
  readonly idle: () => Promise<void>;
}

interface Drag {
  readonly g: GroupId;
  readonly home: Rect;
  readonly grab: Point;
  readonly targets: KTarget[];
  readonly intent: DragIntent<KTarget>;
  readonly held: HeldDrag;
  readonly homeVertical: boolean;
  pointer: Point;
  form: boolean;
  room: KTarget | null;
  readonly frames: DragFrameRecord[];
  readonly stop: () => void;
}

interface KeyMove {
  readonly g: GroupId;
  readonly stops: ToolbarTarget<GroupId>[];
  i: number;
}

/** Build a dossier window into `host`. */
export function createDossier(host: HTMLElement, options: DossierOptions): Dossier {
  const scale = options.scale ?? (() => 1);
  const convert = options.convert ?? (() => true);
  const allows = options.allows ?? (() => true);
  let a: Arrangement<GroupId> = HOME;
  let drag: Drag | null = null;
  let keys: KeyMove | null = null;
  let last: DragRecord | null = null;
  let xray = false;

  const el = document.createElement("div");
  el.className = "kwin";
  el.style.width = `${W}px`;
  el.style.height = `${H}px`;
  for (const h of HOSTS) {
    const b = document.createElement("div");
    b.className = `kbar kbar-${h}`;
    Object.assign(b.style, { left: `${HOST_RECT[h].x}px`, top: `${HOST_RECT[h].y}px`, width: `${HOST_RECT[h].width}px`, height: `${HOST_RECT[h].height}px` });
    if (h === "title") b.innerHTML = `<span class="k-lights"><i></i><i></i><i></i></span><span class="k-name">${options.title}</span>`;
    el.append(b);
  }
  const stage = document.createElement("div");
  stage.className = "kstage";
  Object.assign(stage.style, { left: `${STAGE.x}px`, top: `${STAGE.y}px`, width: `${STAGE.width}px`, height: `${STAGE.height}px` });
  stage.innerHTML = `<div class="k-paper"><b>Quarterly plan.pdf</b>${'<i></i>'.repeat(6)}</div>`;
  el.append(stage);
  const xrayLayer = document.createElement("div");
  xrayLayer.className = "k-xray";
  el.append(xrayLayer);
  const slotEl = document.createElement("div");
  slotEl.className = "k-slot";
  el.append(slotEl);
  const readEl = document.createElement("div");
  readEl.className = "k-read";
  el.append(readEl);
  host.append(el);

  const motion: LayoutMotion = createLayoutMotion({ loop: options.loop });
  const items = new Map<GroupId, LayoutItem>();
  const els = new Map<GroupId, HTMLElement>();
  const handles = new Map<GroupId, HTMLButtonElement>();
  const start = placements(a);
  for (const g of GROUPS) {
    const ge = document.createElement("div");
    ge.className = "kgroup";
    ge.dataset.group = g;
    const hd = document.createElement("button");
    hd.type = "button";
    hd.className = "kg-handle";
    hd.setAttribute("aria-label", `Move ${GROUP_LABEL[g]}`);
    hd.innerHTML = "<i></i><i></i><i></i>";
    ge.append(hd);
    for (const [glyph, label] of CELLS[g]) {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "kg-cell";
      c.tabIndex = -1;
      c.title = label;
      c.textContent = glyph;
      ge.append(c);
    }
    el.append(ge);
    const p = start.get(g)!;
    ge.classList.toggle("v", p.vertical);
    els.set(g, ge);
    handles.set(g, hd);
    items.set(g, motion.add(g, domDrawable({ node: ge }), p.rect));
    hd.addEventListener("pointerdown", (e) => press(g, e));
    hd.addEventListener("keydown", (e) => key(g, e));
    hd.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(g);
    });
    hd.addEventListener("blur", () => {
      if (keys?.g === g) cancelKeys();
    });
  }

  // --- coordinates ---

  const origin = (): Point => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top };
  };
  const toPage = (c: Point): Point => {
    const o = origin();
    const s = convert() ? scale() : 1;
    return { x: (c.x - o.x) / s, y: (c.y - o.y) / s };
  };
  const toClient = (p: Point): Point => {
    const o = origin();
    const s = scale();
    return { x: o.x + p.x * s, y: o.y + p.y * s };
  };
  const drawn = (node: Element): Rect => {
    const r = node.getBoundingClientRect();
    const o = origin();
    const s = scale();
    return rect((r.left - o.x) / s, (r.top - o.y) / s, r.width / s, r.height / s);
  };

  // --- layout ---

  /** Every group to its place in `arr` (all but `except`, which the drag moves). */
  function layOut(arr: Arrangement<GroupId>, except?: GroupId): void {
    const ps = placements(arr);
    for (const g of GROUPS) {
      if (g === except) continue;
      const p = ps.get(g)!;
      els.get(g)!.classList.toggle("v", p.vertical);
      els.get(g)!.classList.toggle("floating", p.host === "float");
      items.get(g)!.moveTo(p.rect);
    }
  }

  function showSlot(r: Rect | null): void {
    slotEl.classList.toggle("on", !!r);
    if (r) Object.assign(slotEl.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  function allTargets(g: GroupId): KTarget[] {
    const label = (x: GroupId): string => GROUP_LABEL[x];
    const out: KTarget[] = [];
    for (const h of HOSTS) out.push(...hostTargets<GroupId>({ group: g, arrangement: a, host: h, origin: HOST_RECT[h], spec: spec(h), size, label }).targets);
    const s = sized(g, false);
    out.push(floatTarget<GroupId>({ group: g, arrangement: a, stage: STAGE, width: s.width, height: s.height }));
    return out;
  }
  const targets = (g: GroupId): KTarget[] => allTargets(g).filter((t) => allows(g, t));
  const ownStretch = (g: GroupId): Rect[] => HOSTS.flatMap((h) => hostTargets<GroupId>({ group: g, arrangement: a, host: h, origin: HOST_RECT[h], spec: spec(h), size }).own);

  /** Where `g` lands on `t` (the pointer at `p`, grabbed at `grab`): its own outline there. */
  function slotOf(g: GroupId, t: KTarget, p: Point, grab: Point): Rect {
    const arr = t.kind === "float" ? t.make(p, grab) : t.arrangement;
    return placements(arr).get(g)!.rect;
  }

  function drawXray(g: GroupId | null): void {
    xrayLayer.replaceChildren();
    if (!xray) return;
    for (const t of targets(g ?? "zoom")) {
      const d = document.createElement("div");
      d.className = `k-hit k-hit-${t.kind}`;
      Object.assign(d.style, { left: `${t.hit.x}px`, top: `${t.hit.y}px`, width: `${t.hit.width}px`, height: `${t.hit.height}px` });
      xrayLayer.append(d);
    }
  }

  // --- pointer drag ---

  function press(g: GroupId, e: PointerEvent): void {
    if (e.button !== 0 || drag) return;
    closeMenu();
    if (keys) cancelKeys();
    const from = { x: e.clientX, y: e.clientY };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // A scripted press has no real pointer to capture.
    }
    let lifted = false;
    const move = (ev: PointerEvent): void => {
      const c = { x: ev.clientX, y: ev.clientY };
      if (!lifted) {
        if (Math.hypot(c.x - from.x, c.y - from.y) < 4) return;
        lifted = true;
        begin(g, toPage(from));
      }
      if (drag) drag.pointer = toPage(c);
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (lifted && drag) {
        drag.pointer = toPage({ x: ev.clientX, y: ev.clientY });
        end(ev.type === "pointercancel");
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function begin(g: GroupId, p: Point): void {
    const item = items.get(g)!;
    const home = { ...item.drawn };
    const ts = targets(g);
    const homeZone = ownStretch(g).reduce(union, home);
    const grab = { x: p.x - home.x, y: p.y - home.y };
    const v = els.get(g)!.classList.contains("v");
    els.get(g)!.classList.add("lifted");
    const tick = (): boolean => {
      if (drag) frame(drag);
      return !!drag;
    };
    drag = {
      g,
      home,
      grab,
      targets: ts,
      intent: createDragIntent<KTarget>({ home: homeZone }),
      held: holdItem(item, grab),
      homeVertical: v,
      pointer: p,
      form: v,
      room: null,
      frames: [],
      stop: motion.task(tick),
    };
    drawXray(g);
  }

  function frame(d: Drag): void {
    const now = performance.now();
    const f = d.intent.update(d.pointer, now, d.targets);
    const shown = f.shown;
    const slotted = !!shown && shown.kind !== "float";
    const plan = previewPlan(f, "snap", slotted);
    // Its form follows the target shown: a side edge's column, a bar's or a float's row; no target, its own.
    const form = shown ? shown.kind !== "float" && shown.vertical : d.homeVertical;
    if (form !== d.form) {
      d.form = form;
      els.get(d.g)!.classList.toggle("v", form);
      d.held.resize(sized(d.g, form));
    }
    const room = plan.makeRoom && slotted ? shown : null;
    if ((room?.id ?? null) !== (d.room?.id ?? null)) {
      d.room = room;
      layOut(room ? room.arrangement : a, d.g);
    }
    const slot = shown ? slotOf(d.g, shown, d.pointer, d.grab) : null;
    showSlot(slot);
    d.held.move(d.pointer);
    d.held.preview({ snapItem: plan.snapItem }, plan.snapItem ? slot : null);
    readEl.classList.add("on");
    Object.assign(readEl.style, { left: `${d.pointer.x}px`, top: `${d.pointer.y}px` });
    d.frames.push({ t: now, read: { ...d.pointer }, shown: shown?.id ?? null });
  }

  function end(cancel: boolean): void {
    const d = drag;
    if (!d) return;
    const target = cancel ? null : d.intent.release(d.pointer, d.targets);
    const next = target ? (target.kind === "float" ? target.make(d.pointer, d.grab) : target.arrangement) : null;
    const goal = placements(next ?? a).get(d.g)!;
    const ge = els.get(d.g)!;
    ge.classList.toggle("v", goal.vertical);
    ge.classList.toggle("floating", goal.host === "float");
    ge.classList.remove("lifted");
    const release = next ? d.held.land(goal.rect) : d.held.cancel(goal.rect);
    d.stop();
    drag = null;
    showSlot(null);
    readEl.classList.remove("on");
    if (next) a = next;
    layOut(a, d.g);
    drawXray(null);
    last = { group: d.g, frames: d.frames, landed: target?.id ?? null, release, home: d.home, grab: d.grab };
  }

  // --- keyboard moves ---

  const stops = (g: GroupId): ToolbarTarget<GroupId>[] => keyboardOrder(targets(g).filter((t): t is ToolbarTarget<GroupId> => t.kind !== "float"));
  /** The stop the first arrow goes to: just after its own place (forward) or just before it. */
  function firstStop(g: GroupId, forward: boolean): number {
    const list = stops(g);
    const own = hostOf(a, g);
    // The stops before its own place (a floating group starts before the first).
    const before = own ? list.filter((t) => placeKey(t.place) < placeKey(own)).length : 0;
    return forward ? before % list.length : (before - 1 + list.length) % list.length;
  }

  function showStop(k: KeyMove): void {
    const t = k.stops[k.i]!;
    const p = placements(t.arrangement).get(k.g)!;
    // The slot shows the place; the group and the others glide to it (./layout).
    layOut(t.arrangement);
    showSlot(p.rect);
  }

  function cancelKeys(): void {
    if (!keys) return;
    keys = null;
    showSlot(null);
    layOut(a);
  }

  function commit(arr: Arrangement<GroupId>): void {
    keys = null;
    showSlot(null);
    a = arr;
    layOut(a);
  }

  function key(g: GroupId, e: KeyboardEvent): void {
    if (drag) {
      if (e.key === "Escape") {
        e.preventDefault();
        end(true);
      }
      return;
    }
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      e.preventDefault();
      openMenu(g);
      return;
    }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      closeMenu();
      const list = keys?.g === g ? keys.stops : stops(g);
      if (!list.length) return;
      if (keys?.g === g) keys.i = (keys.i + step + list.length) % list.length;
      else keys = { g, stops: list, i: firstStop(g, step > 0) };
      showStop(keys);
    } else if ((e.key === "Enter" || e.key === " ") && keys?.g === g) {
      e.preventDefault();
      commit(keys.stops[keys.i]!.arrangement);
    } else if (e.key === "Escape" && keys?.g === g) {
      e.preventDefault();
      cancelKeys();
    }
  }

  // --- the handle's menu: Move to › lists the keyboard stops, in the same order ---

  let menuEl: HTMLElement | null = null;
  function closeMenu(): void {
    menuEl?.remove();
    menuEl = null;
  }
  function openMenu(g: GroupId): HTMLElement {
    closeMenu();
    const r = items.get(g)!.drawn;
    const m = document.createElement("div");
    m.className = "k-menu";
    m.setAttribute("role", "menu");
    m.setAttribute("aria-label", `${GROUP_LABEL[g]} group`);
    Object.assign(m.style, { left: `${Math.min(r.x, W - 230)}px`, top: `${Math.min(r.y + r.height + 4, H - 40)}px` });
    const head = document.createElement("button");
    head.type = "button";
    head.className = "k-menu-item";
    head.textContent = "Move to ›";
    const sub = document.createElement("div");
    sub.className = "k-submenu";
    sub.setAttribute("role", "menu");
    for (const t of stops(g)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "k-menu-item";
      b.dataset.target = t.id;
      b.textContent = t.label;
      b.addEventListener("click", () => {
        closeMenu();
        commit(t.arrangement);
        handles.get(g)!.focus();
      });
      sub.append(b);
    }
    head.addEventListener("click", () => m.classList.toggle("open"));
    m.append(head, sub);
    el.append(m);
    menuEl = m;
    return m;
  }
  document.addEventListener("pointerdown", (e) => {
    if (menuEl && !menuEl.contains(e.target as Node)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuEl) closeMenu();
  });

  return {
    el,
    arrangement: () => a,
    reset() {
      if (drag) end(true);
      cancelKeys();
      closeMenu();
      a = HOME;
      layOut(a);
    },
    targets,
    allTargets,
    stops,
    firstStop,
    handle: (g) => handles.get(g)!,
    groupEl: (g) => els.get(g)!,
    drawn,
    slot: () => (slotEl.classList.contains("on") ? drawn(slotEl) : null),
    toClient,
    toPage,
    menu: () => menuEl,
    openMenu,
    closeMenu,
    setXray(on) {
      xray = on;
      drawXray(drag?.g ?? null);
    },
    dragging: () => !!drag,
    keyMove: () => (keys ? { g: keys.g, i: keys.i } : null),
    lastDrag: () => last,
    idle: () => motion.idle(),
  };
}

export { inRect, sameArrangement };
