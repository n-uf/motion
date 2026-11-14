/**
 * A small document viewer window for the kit cases: title, top, left, right and bottom bars, five toolbar groups (Navigate,
 * Zoom, Annotate, Review, Share), on the real packages:
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
import { createDragIntent, previewPlan, targetAt, type DragIntent, type DragPreview } from "@n-uf/motion/drag";
import { createLayoutMotion, domDrawable, holdItem, type HeldDrag, type LayoutItem, type LayoutMotion } from "@n-uf/motion/layout";
import { floatTarget, hostTargets, keyboardStops, type Allows, type KeyboardStop, type ToolbarFloatTarget, type ToolbarTarget } from "@n-uf/placement/targets";
import { HOSTS, arrangement, hostOf, layoutHost, sameArrangement, toggleCollapsed, vertical, withoutGroup, type Arrangement, type GroupSize, type HostId, type HostSpec, type Place } from "@n-uf/placement/toolbar";

export type GroupId = "navigate" | "zoom" | "annotate" | "review" | "share";
export const GROUPS: readonly GroupId[] = ["navigate", "zoom", "annotate", "review", "share"];
export const GROUP_LABEL: Readonly<Record<GroupId, string>> = { navigate: "Navigate", zoom: "Zoom", annotate: "Annotate", review: "Review", share: "Share" };
const CELLS: Readonly<Record<GroupId, readonly (readonly [string, string])[]>> = {
  navigate: [["‹", "Previous page"], ["›", "Next page"], ["⤒", "First page"]],
  zoom: [["−", "Zoom out"], ["%", "Fit width"], ["+", "Zoom in"]],
  annotate: [["✎", "Pen"], ["▭", "Box"], ["T", "Text"]],
  review: [["✓", "Approve"], ["↺", "Request changes"]],
  share: [["⇪", "Share"], ["⎙", "Print"]],
};

/** Where the groups start. */
export const HOME: Arrangement<GroupId> = arrangement<GroupId>({ title: { end: ["share"] }, top: { start: ["navigate", "zoom"], end: ["annotate", "review"] } });

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

/** A viewer's geometry at a width (case 4 narrows it): its hosts and its document area, in page space. */
export interface Geometry {
  readonly width: number;
  readonly hostRect: Readonly<Record<HostId, Rect>>;
  /** The document area: where a group floats. */
  readonly stage: Rect;
  /** How long each group keeps its full form when a bar runs out of room (case 4); placement's default when unset. */
  readonly keep?: Readonly<Partial<Record<GroupId, number>>>;
}
export function geometryAt(width: number, keep?: Geometry["keep"]): Geometry {
  return {
    width,
    hostRect: {
      title: rect(0, 0, width, T),
      top: rect(0, T, width, T),
      bottom: rect(0, H - T, width, T),
      left: rect(0, 2 * T, T, H - 3 * T),
      right: rect(width - T, 2 * T, T, H - 3 * T),
    },
    stage: rect(T, 2 * T, width - 2 * T, H - 3 * T),
    ...(keep ? { keep } : {}),
  };
}
const GEOMETRY = geometryAt(W);
export const HOST_RECT: Readonly<Record<HostId, Rect>> = GEOMETRY.hostRect;
/** The document area: where a group floats. */
export const STAGE: Rect = GEOMETRY.stage;
const spec = (h: HostId, geo: Geometry = GEOMETRY): HostSpec => ({
  length: vertical(h) ? geo.hostRect[h].height : geo.hostRect[h].width,
  thickness: T,
  lead: h === "title" ? 64 : 6,
  tail: 6,
  ...(geo.keep ? { keep: geo.keep } : {}),
});
const CELL = 24;
const HANDLE = 14;
/** A folded group's »: its length along the bar. */
const OVF = 20;
const groupSize = (g: GroupId, collapsed = false): { along: number; across: number } => ({ along: HANDLE + (collapsed ? OVF : CELLS[g].length * CELL) + 2, across: CELL });
const size: GroupSize<GroupId> = (g, _v, collapsed) => groupSize(g, collapsed);
/** A group's rect at `form` (vertical: a column), folded or not. */
const sized = (g: GroupId, form: boolean, collapsed = false): { width: number; height: number } => {
  const s = groupSize(g, collapsed);
  return form ? { width: s.across, height: s.along } : { width: s.along, height: s.across };
};

export interface Placed {
  readonly rect: Rect;
  readonly vertical: boolean;
  readonly host: HostId | "float";
  /** Shown folded to its handle and » (by hand, or because its bar ran out of room). */
  readonly collapsed: boolean;
}

/**
 * Where every group sits in `a`, in page space. A floating group is a row, unless it is in `floatColumns` (case 3,
 * proposal B: the app keeps a direction for floats, which placement's float record has no field for).
 */
export function placements(a: Arrangement<GroupId>, floatColumns: ReadonlySet<GroupId> = new Set(), geo: Geometry = GEOMETRY): Map<GroupId, Placed> {
  const out = new Map<GroupId, Placed>();
  for (const h of HOSTS) {
    const o = geo.hostRect[h];
    const l = layoutHost(a[h], h, spec(h, geo), size, a.collapsed);
    for (const [g, s] of l.slots) out.set(g, { rect: rect(o.x + s.x, o.y + s.y, s.width, s.height), vertical: vertical(h), host: h, collapsed: l.collapsed.includes(g) });
  }
  for (const f of a.floating) {
    const v = floatColumns.has(f.id);
    const c = a.collapsed.includes(f.id);
    const s = sized(f.id, v, c);
    out.set(f.id, { rect: rect(geo.stage.x + f.x, geo.stage.y + f.y, s.width, s.height), vertical: v, host: "float", collapsed: c });
  }
  return out;
}

/** An app's words for a place (case 9): the group, where it would go, and the groups already in that zone. */
export type Words = (g: GroupId, place: Place | "float", zone: readonly GroupId[]) => string;

// --- the viewer ----------------------------------------------------------------------------------------------------

export interface ViewerOptions {
  readonly title: string;
  readonly loop: FrameLoop;
  /** Where a group may go (case 6: the app's constraint), as placement's `allows`; default anywhere. */
  readonly allows?: Allows<GroupId>;
  /** The page's scale (case 10); default 1. */
  readonly scale?: () => number;
  /** Convert the pointer into page space before the intent reads it; default true (false: case 10's bug). */
  readonly convert?: () => boolean;
  /** The app's places that are toolbar hosts (case 2); the rest offer no target. Default all five. */
  readonly hosts?: readonly HostId[];
  /** What the app calls each bar, drawn on it (case 2: a side rail, cards). */
  readonly barNames?: Partial<Record<HostId, string>>;
  /** Floats: always a row (case 3, proposal A, the default) or keep the direction they had (proposal B). */
  readonly floats?: () => "row" | "keep";
  /** The app's words for the places, set as each target's `label` (case 9); default placement's. */
  readonly words?: Words;
  /** While a group is dragged, light up the hit rect of every target it has (case 2: what can go where). */
  readonly lightUp?: boolean;
  /** Where the groups start (default `HOME`). */
  readonly home?: Arrangement<GroupId>;
  /** The window's width (default `W`); `setWidth` changes it (case 4). */
  readonly width?: number;
  /** How long each group keeps its full form when a bar runs out of room (case 4, placement's keep). */
  readonly keep?: Readonly<Partial<Record<GroupId, number>>>;
  /** The drop preview (case 5); default snap to slot. */
  readonly preview?: () => DragPreview;
  /**
   * A fold (a double-click on a handle, or the bar running out of room): revealed through ./layout, the neighbours
   * gliding (the default), or an instant swap, everything jumping (case 4).
   */
  readonly fold?: () => "reveal" | "instant";
  /**
   * Start frozen; `setFrozen` changes it. A frozen layout hides the grips; holding Alt shows them. The freeze is read
   * once, at the press, so a drag in flight always finishes.
   */
  readonly frozen?: boolean;
  /**
   * A hairline indicator (case 5): a naive drag, no intent, no preview motion; a 3 px line marks the insertion point
   * under the pointer on the last move (a float: its outline), and the group lands there.
   */
  readonly hairline?: boolean;
}

/** One frame of a drag, as the viewer drew it. */
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

export interface Viewer {
  /** The window (page space; its client rect's top-left is the page origin). */
  readonly el: HTMLElement;
  readonly arrangement: () => Arrangement<GroupId>;
  readonly reset: () => void;
  /** The targets a drag of `g` uses (the constraint applied), and all of them. */
  readonly targets: (g: GroupId) => KTarget[];
  readonly allTargets: (g: GroupId) => KTarget[];
  /** The keyboard stops of `g` (placement's `keyboardStops`), its own place among them; and that place's index. */
  readonly stops: (g: GroupId) => KeyboardStop<GroupId>[];
  readonly homeIndex: (g: GroupId) => number;
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
  /** Fold or unfold `g` by hand (what a double-click on its handle does); false when frozen. */
  readonly toggleFold: (g: GroupId) => boolean;
  /** The groups drawn folded now (by hand, or for want of room). */
  readonly folded: () => GroupId[];
  /** The » popover with `g`'s full form, open, or null. */
  readonly popover: () => HTMLElement | null;
  readonly setWidth: (width: number) => void;
  readonly setFrozen: (on: boolean) => void;
  /** Alt is held (as the viewer saw it). */
  readonly alt: () => boolean;
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
  /** The hairline drag (case 5): the target under the pointer on the last move. */
  under: KTarget | null;
  readonly frames: DragFrameRecord[];
  readonly stop: () => void;
}

interface KeyMove {
  readonly g: GroupId;
  readonly stops: KeyboardStop<GroupId>[];
  i: number;
}

/** Build a document viewer window into `host`. */
export function createViewer(host: HTMLElement, options: ViewerOptions): Viewer {
  const scale = options.scale ?? (() => 1);
  const convert = options.convert ?? (() => true);
  const hosts = options.hosts ?? HOSTS;
  const floats = options.floats ?? (() => "row" as const);
  const preview = options.preview ?? (() => "snap" as const);
  const fold = options.fold ?? (() => "reveal" as const);
  const start0 = options.home ?? HOME;
  let geo = geometryAt(options.width ?? W, options.keep);
  let a: Arrangement<GroupId> = start0;
  let frozen = !!options.frozen;
  let altHeld = false;
  /** Proposal B (case 3): the floating groups the app keeps as columns. */
  const floatColumns = new Set<GroupId>();
  let drag: Drag | null = null;
  let keys: KeyMove | null = null;
  let last: DragRecord | null = null;
  let xray = false;

  const el = document.createElement("div");
  el.className = "kwin";
  el.style.height = `${H}px`;
  const bars = new Map<HostId, HTMLElement>();
  for (const h of HOSTS) {
    const b = document.createElement("div");
    // A place the app doesn't declare as a host (a side rail, cards) is drawn, but offers no target.
    b.className = `kbar kbar-${h}${hosts.includes(h) ? "" : " kbar-off"}`;
    b.dataset.host = h;
    bars.set(h, b);
    const name = options.barNames?.[h];
    if (h === "title") b.innerHTML = `<span class="k-lights"><i></i><i></i><i></i></span><span class="k-name">${options.title}</span>`;
    if (name) {
      const tag = document.createElement("span");
      tag.className = "k-bar-name";
      tag.textContent = name;
      b.append(tag);
    }
    el.append(b);
  }
  const stage = document.createElement("div");
  stage.className = "kstage";
  /** The window, its bars and its document area at the geometry's width. */
  const frameAt = (): void => {
    el.style.width = `${geo.width}px`;
    for (const [h, b] of bars) {
      const r = geo.hostRect[h];
      Object.assign(b.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
    Object.assign(stage.style, { left: `${geo.stage.x}px`, top: `${geo.stage.y}px`, width: `${geo.stage.width}px`, height: `${geo.stage.height}px` });
  };
  frameAt();
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
  const start = placements(a, new Set(), geo);
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
    // A folded group is its handle and »; » opens the full group in a popover.
    const ovf = document.createElement("button");
    ovf.type = "button";
    ovf.className = "kg-ovf";
    ovf.textContent = "»";
    ovf.setAttribute("aria-label", `${GROUP_LABEL[g]}: show all`);
    ovf.setAttribute("aria-haspopup", "dialog");
    ovf.addEventListener("click", () => openPopover(g));
    ge.append(ovf);
    el.append(ge);
    const p = start.get(g)!;
    ge.classList.toggle("v", p.vertical);
    ge.classList.toggle("collapsed", p.collapsed);
    els.set(g, ge);
    handles.set(g, hd);
    items.set(g, motion.add(g, domDrawable({ node: ge }), p.rect));
    hd.addEventListener("pointerdown", (e) => press(g, e));
    hd.addEventListener("dblclick", () => toggleFold(g));
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

  /**
   * Every group to its place in `arr` (all but `except`, which the drag moves). A group that folds or unfolds is
   * laid out at its new size at once and revealed (clipped, never squeezed) as it settles, the others gliding; with
   * `instant` everything jumps, an instant swap.
   */
  function layOut(arr: Arrangement<GroupId>, except?: GroupId, instant = false): void {
    const ps = placements(arr, floatColumns, geo);
    for (const g of GROUPS) {
      if (g === except) continue;
      const p = ps.get(g)!;
      const ge = els.get(g)!;
      ge.classList.toggle("v", p.vertical);
      ge.classList.toggle("floating", p.host === "float");
      ge.classList.toggle("collapsed", p.collapsed);
      if (instant) items.get(g)!.jumpTo(p.rect);
      else items.get(g)!.moveTo(p.rect);
    }
  }

  // --- folding, the » popover ---

  let popEl: HTMLElement | null = null;
  function closePopover(): void {
    popEl?.remove();
    popEl = null;
  }
  /** The group's full form beside its »: its controls, cloned (a click on one presses the original). */
  function openPopover(g: GroupId): void {
    closePopover();
    closeMenu();
    const r = items.get(g)!.drawn;
    const pop = document.createElement("div");
    pop.className = "k-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", GROUP_LABEL[g]);
    for (const c of els.get(g)!.querySelectorAll<HTMLButtonElement>(".kg-cell")) {
      const copy = c.cloneNode(true) as HTMLButtonElement;
      copy.tabIndex = 0;
      copy.addEventListener("click", () => c.click());
      pop.append(copy);
    }
    const v = els.get(g)!.classList.contains("v");
    Object.assign(pop.style, v ? { left: `${r.x + r.width + 6}px`, top: `${r.y}px` } : { left: `${Math.min(r.x, geo.width - 120)}px`, top: `${r.y + r.height + 6}px` });
    el.append(pop);
    popEl = pop;
    (pop.firstElementChild as HTMLElement | null)?.focus();
  }

  /** Fold or unfold `g` by hand; a frozen layout folds nothing (unless Alt is held). */
  function toggleFold(g: GroupId): boolean {
    if (drag || (frozen && !altHeld)) return false;
    closePopover();
    a = toggleCollapsed(a, g);
    layOut(a, undefined, fold() === "instant");
    return true;
  }

  function showSlot(r: Rect | null): void {
    slotEl.classList.toggle("on", !!r);
    if (r) Object.assign(slotEl.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  /** The targets `g` has, those `rule` forbids left out by placement itself (no rule: all of them). */
  /**
   * The targets `g` has: the declared hosts' and the float, those `rule` forbids left out by placement itself (no
   * rule: all of them), each labelled in the app's words when it has its own.
   */
  function targetsWith(g: GroupId, rule?: Allows<GroupId>): KTarget[] {
    const label = (x: GroupId): string => GROUP_LABEL[x];
    const out: KTarget[] = [];
    for (const h of hosts) out.push(...hostTargets<GroupId>({ group: g, arrangement: a, host: h, origin: geo.hostRect[h], spec: spec(h, geo), size, label, allows: rule }).targets);
    // As it floats: a row, or (proposal B) the column it is now.
    const s = sized(g, keepsColumn(g), a.collapsed.includes(g));
    // The same rule says whether it may float at all: no float target where it may not.
    if (!rule || rule(g, "float")) out.push(floatTarget<GroupId>({ group: g, arrangement: a, stage: geo.stage, width: s.width, height: s.height }));
    const words = options.words;
    if (!words) return out;
    const a0 = withoutGroup(a, g);
    return out.map((t) => ({ ...t, label: words(g, t.kind === "float" ? "float" : t.place, t.kind === "float" ? [] : a0[t.place.host][t.place.zone]) }));
  }
  const allTargets = (g: GroupId): KTarget[] => targetsWith(g);
  const targets = (g: GroupId): KTarget[] => targetsWith(g, options.allows);
  const ownStretch = (g: GroupId): Rect[] => hosts.flatMap((h) => hostTargets<GroupId>({ group: g, arrangement: a, host: h, origin: geo.hostRect[h], spec: spec(h, geo), size }).own);
  /** Proposal B: a group that floats keeps the direction it has now (a column from a side edge, or a floating column). */
  const keepsColumn = (g: GroupId): boolean => floats() === "keep" && els.get(g)!.classList.contains("v");
  /** The float columns with `g` as `column` (where it would float, held in that form). */
  const columnsWith = (g: GroupId, column: boolean): Set<GroupId> => {
    const s = new Set(floatColumns);
    if (column) s.add(g);
    else s.delete(g);
    return s;
  };

  /** Where `g` lands on `t` (the pointer at `p`, grabbed at `grab`): its own outline there, a float as `column` or not. */
  function slotOf(g: GroupId, t: KTarget, p: Point, grab: Point, column: boolean): Rect {
    const arr = t.kind === "float" ? t.make(p, grab) : t.arrangement;
    return placements(arr, columnsWith(g, column), geo).get(g)!.rect;
  }

  function drawXray(g: GroupId | null): void {
    xrayLayer.replaceChildren();
    if (!xray && !(options.lightUp && drag)) return;
    for (const t of targets(g ?? "zoom")) {
      const d = document.createElement("div");
      d.className = `k-hit k-hit-${t.kind}`;
      Object.assign(d.style, { left: `${t.hit.x}px`, top: `${t.hit.y}px`, width: `${t.hit.width}px`, height: `${t.hit.height}px` });
      xrayLayer.append(d);
    }
  }

  // --- pointer drag ---

  /** The freeze lets a drag start: not frozen, or Alt held. */
  const unlocked = (alt: boolean): boolean => !frozen || alt;

  function press(g: GroupId, e: PointerEvent): void {
    if (e.button !== 0 || drag) return;
    closeMenu();
    closePopover();
    if (keys) cancelKeys();
    setAlt(e.altKey || altHeld);
    // The freeze is read once, at the press: a frozen press never becomes a drag, whatever Alt does later.
    if (!unlocked(e.altKey || altHeld)) return;
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
      under: null,
      frames: [],
      stop: motion.task(tick),
    };
    drawXray(g);
  }

  /** The hairline drag (case 5): the line under the pointer on the last move, the group 1:1 under the pointer. */
  function frameHairline(d: Drag, now: number): void {
    const t = inRect(d.home, d.pointer) ? null : targetAt(d.targets, d.pointer);
    d.under = t;
    const r = t ? (t.kind === "float" ? slotOf(d.g, t, d.pointer, d.grab, false) : t.line) : null;
    slotEl.classList.toggle("line", !!t && t.kind !== "float");
    showSlot(r);
    d.held.move(d.pointer);
    d.frames.push({ t: now, read: { ...d.pointer }, shown: t?.id ?? null });
  }

  function frame(d: Drag): void {
    const now = performance.now();
    if (options.hairline) return frameHairline(d, now);
    const f = d.intent.update(d.pointer, now, d.targets);
    const shown = f.shown;
    const slotted = !!shown && shown.kind !== "float";
    const plan = previewPlan(f, preview(), slotted);
    // Its form follows the target shown: a side edge's column, a bar's row; a float a row (proposal A) or the form
    // it was lifted in (proposal B); no target, its own.
    const floatColumn = floats() === "keep" && d.homeVertical;
    const form = shown ? (shown.kind === "float" ? floatColumn : shown.vertical) : d.homeVertical;
    if (form !== d.form) {
      d.form = form;
      els.get(d.g)!.classList.toggle("v", form);
      d.held.resize(sized(d.g, form, els.get(d.g)!.classList.contains("collapsed")));
    }
    const room = plan.makeRoom && slotted ? shown : null;
    if ((room?.id ?? null) !== (d.room?.id ?? null)) {
      d.room = room;
      layOut(room ? room.arrangement : a, d.g);
    }
    const slot = shown ? slotOf(d.g, shown, d.pointer, d.grab, floatColumn) : null;
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
    const target = cancel ? null : options.hairline ? d.under : d.intent.release(d.pointer, d.targets);
    const next = target ? (target.kind === "float" ? target.make(d.pointer, d.grab) : target.arrangement) : null;
    // Proposal B: a group that lands floating keeps the direction it was lifted in; docked, it has none to keep.
    if (target?.kind === "float" && floats() === "keep" && d.homeVertical) floatColumns.add(d.g);
    else if (target) floatColumns.delete(d.g);
    const goal = placements(next ?? a, floatColumns, geo).get(d.g)!;
    const ge = els.get(d.g)!;
    ge.classList.toggle("v", goal.vertical);
    ge.classList.toggle("floating", goal.host === "float");
    ge.classList.toggle("collapsed", goal.collapsed);
    ge.classList.remove("lifted");
    const release = next ? d.held.land(goal.rect) : d.held.cancel(goal.rect);
    d.stop();
    drag = null;
    showSlot(null);
    slotEl.classList.remove("line");
    readEl.classList.remove("on");
    if (next) a = next;
    layOut(a, d.g);
    drawXray(null);
    last = { group: d.g, frames: d.frames, landed: target?.id ?? null, release, home: d.home, grab: d.grab };
  }

  // --- keyboard moves ---

  /** Placement's keyboard stops: every place in reading order, its own place among them (where the arrows start). */
  function stops(g: GroupId): KeyboardStop<GroupId>[] {
    const own = hostOf(a, g);
    if (!own) return keyboardStops<GroupId>(targets(g));
    // Its own place in the app's words too, when it has its own (the zone as it is, the group in it).
    const label = options.words?.(g, own, a[own.host][own.zone].filter((x) => x !== g));
    return keyboardStops<GroupId>(targets(g), { home: { place: own, arrangement: a, ...(label ? { label: `${label} · current place` } : {}) } });
  }
  /** Where the arrows start: its own place's stop, or -1 (floating). */
  const homeIndex = (g: GroupId): number => stops(g).findIndex((s) => s.home);

  function showStop(k: KeyMove): void {
    const t = k.stops[k.i]!;
    const p = placements(t.arrangement, floatColumns, geo).get(k.g)!;
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
      else {
        const home = list.findIndex((s) => s.home);
        keys = { g, stops: list, i: home < 0 ? (step > 0 ? 0 : list.length - 1) : (home + step + list.length) % list.length };
      }
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
    Object.assign(m.style, { left: `${Math.min(r.x, geo.width - 230)}px`, top: `${Math.min(r.y + r.height + 4, H - 40)}px` });
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
      // A tick marks where it sits now.
      b.className = `k-menu-item${t.home ? " here" : ""}`;
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
    if (popEl && !popEl.contains(e.target as Node) && !(e.target as Element).closest?.(".kg-ovf")) closePopover();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuEl) closeMenu();
    if (e.key === "Escape" && popEl) closePopover();
  });

  // --- freeze and Alt: frozen hides the grips; holding Alt shows them ---

  function setAlt(on: boolean): void {
    altHeld = on;
    el.classList.toggle("alt", on);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Alt") setAlt(true);
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt") setAlt(false);
  });
  window.addEventListener("blur", () => setAlt(false));
  el.classList.toggle("frozen", frozen);

  return {
    el,
    arrangement: () => a,
    reset() {
      if (drag) end(true);
      cancelKeys();
      closeMenu();
      closePopover();
      a = start0;
      floatColumns.clear();
      layOut(a);
    },
    toggleFold,
    folded: () => GROUPS.filter((g) => els.get(g)!.classList.contains("collapsed")),
    popover: () => popEl,
    setWidth(width) {
      if (width === geo.width) return;
      if (drag) end(true);
      cancelKeys();
      closePopover();
      geo = geometryAt(width, options.keep);
      frameAt();
      // The bars change length: groups fold or unfold for room, by the same rule as a fold by hand.
      layOut(a, undefined, fold() === "instant");
    },
    setFrozen(on) {
      frozen = on;
      el.classList.toggle("frozen", on);
    },
    alt: () => altHeld,
    targets,
    allTargets,
    stops,
    homeIndex,
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
