/**
 * The document window, drawn and driven on the two libraries only:
 *
 * - the window is one `Scene` (./model); every rect drawn comes from `solve(scene, { previous })`, the layout before
 *   carried along so a press or a badge change reshapes nothing;
 * - one drag session for panels and groups: `@n-uf/motion/drag`'s intent and `previewPlan` over the Scene's
 *   `targets(scene, dragged)`; the held item follows the pointer, the dashed slot and the marker come from the shown
 *   target only (a gap's `slot` and `marker`, a float's `after(point, grab)` rect, home's own rect), the other items are
 *   drawn from the shown target's `after(...).layout` once the room opens (with no target shown: the committed layout, the
 *   held item's place left empty, nothing else moving), and the drop commits `after(...).scene` as is;
 * - the host contract: while a drag is on, the root carries `data-drag-session="<kind>"` and one base CSS rule turns
 *   off hover, resize handles and selection under it; the content keeps its fit until the drop; the click after a
 *   drag's pointer-up is swallowed and focus goes back to where it was before the press;
 * - the store is `storeScene` / `readScene` (./store).
 */
import type { Point, Rect } from "@n-uf/placement";
import { DRAG_DEFAULTS, createDragIntent, previewPlan, type DragIntent } from "@n-uf/motion/drag";
import {
  close as closeItem,
  open as openItem,
  refusals as sceneRefusals,
  resize,
  solve,
  targets as sceneTargets,
  use,
  type Scene,
  type SceneLayout,
  type SceneRefusal,
  type SceneTarget,
} from "@n-uf/placement/scene";
import { BAR, BAR_INSET, COL_MIN, COL_WIDE, DEFAULT_COUNTS, EDGES, GROUPS, RAIL, TITLES, defaultScene, edgeOf, isSideEdge, setGroupSizes, withStage, type Counts, type EdgeId, type GroupId, type GroupMeasure, type ItemId } from "./model";
import { readDocwin, storeDocwin, type StoredDocwin } from "./store";

export interface LastDrop {
  readonly id: ItemId;
  /** The target released on (a home or none target commits nothing), or null. */
  readonly target: string | null;
  readonly place: SceneTarget["place"]["kind"] | null;
  /** The rect the preview showed on the last frame (the dashed slot), and the rect after the drop. */
  readonly preview: Rect | null;
  readonly landed: Rect | null;
  readonly committed: boolean;
  readonly cancelled: boolean;
}

interface Held {
  readonly id: ItemId;
  readonly kind: string;
  readonly grab: Point;
  readonly home: Rect;
  readonly docked: boolean;
  readonly size: { width: number; height: number };
  readonly el: HTMLElement;
  readonly intent: DragIntent<SceneTarget>;
  readonly targets: readonly SceneTarget[];
  /** Where a drop is refused (`refusals`): over one, "No room here" at the pointer and no slot; a release goes home. */
  readonly refusals: readonly SceneRefusal[];
  readonly focus: Element | null;
  pointer: Point;
  shown: SceneTarget | null;
  refused: SceneRefusal | null;
  room: SceneTarget | null;
  homing: boolean;
  preview: Rect | null;
  raf: number;
}

export interface SceneOptions {
  readonly root: HTMLElement;
  readonly win: HTMLElement;
  readonly status: HTMLElement;
  readonly storageKey: string;
  /** Called after every committed change (the page's readouts). */
  readonly onChange?: () => void;
}

const px = (n: number): string => `${Math.round(n * 100) / 100}px`;
const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const place = (el: HTMLElement, r: Rect): void => {
  Object.assign(el.style, { left: px(r.x), top: px(r.y), width: px(r.width), height: px(r.height) });
};
const sameRect = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
/** A target that docks the item (it has a slot in an edge and makes room there). */
const docks = (t: SceneTarget | null): boolean => !!t && (t.place.kind === "gap" || t.place.kind === "column" || t.place.kind === "rail");
const commits = (t: SceneTarget | null): boolean => !!t && t.place.kind !== "home" && t.place.kind !== "none";

/** How far the first and last gaps of a bar reach past its ends. */
const END_REACH = BAR_INSET;

export type DocwinScene = ReturnType<typeof createScene>;

export function createScene(o: SceneOptions) {
  const { root, win, status } = o;
  // An empty window until the groups are measured (below, before the first scene is built).
  let scene: Scene = { stage: { x: 0, y: 0, width: 0, height: 0 }, edges: [], items: {}, floats: [], floatKinds: [] };
  let layout: SceneLayout = solve(scene);
  let counts: Counts = { ...DEFAULT_COUNTS };
  let drag: Held | null = null;
  /** Removes the window listeners of the press that began the drag: every end of a drag (a drop, Escape, a reset) calls it. */
  let endInput: (() => void) | null = null;
  let lastDrop: LastDrop | null = null;
  /** Checks drive the drag themselves: no animation frames then. */
  let driven = false;
  let pageKey = "";

  win.innerHTML = `
    ${EDGES.map((e) => `<div class="${isSideEdge(e) ? "dw-colbg" : "dw-bar"}" data-edge="${e}"></div>`).join("")}
    <div class="dw-scroll" tabindex="0" aria-label="Pages"><div class="dw-sheets"></div></div>
    <div class="dw-items"></div>
    <div class="dw-resize" data-resize="left" title="Drag to change the column's width"></div>
    <div class="dw-resize" data-resize="right" title="Drag to change the column's width"></div>
    <div class="dw-slot" hidden><span class="dw-slot-label"></span></div>
    <div class="dw-marker" hidden></div>
    <div class="dw-refuse" hidden></div>
    <div class="dw-refuse-label" hidden>No room here</div>
    <div class="dw-menu-list" role="menu" hidden></div>`;
  const q = <T extends HTMLElement>(sel: string): T => win.querySelector(sel) as T;
  const layer = q<HTMLDivElement>(".dw-items");
  const scroll = q<HTMLDivElement>(".dw-scroll");
  const sheets = q<HTMLDivElement>(".dw-sheets");
  const slot = q<HTMLDivElement>(".dw-slot");
  const slotLabel = q<HTMLSpanElement>(".dw-slot-label");
  const marker = q<HTMLDivElement>(".dw-marker");
  const refuseTint = q<HTMLDivElement>(".dw-refuse");
  const refuseLabel = q<HTMLDivElement>(".dw-refuse-label");
  const menuList = q<HTMLDivElement>(".dw-menu-list");

  const say = (t: string): void => {
    status.textContent = t;
  };

  // --- drawing ---------------------------------------------------------------------------------------------------

  const badge = (n: number): string => `<span class="dw-badge">${n}</span>`;
  const countOf = (id: ItemId): number | null => (id === "pages" ? counts.pages : id === "notes" ? counts.notes : id === "findings" ? counts.findings : null);

  function body(id: ItemId): string {
    if (id === "pages") return `<div class="dw-thumbs">${Array.from({ length: counts.pages }, (_, i) => `<i><span>${i + 1}</span></i>`).join("")}</div>`;
    const n = Math.min(40, id === "notes" ? counts.notes : counts.findings);
    const word = id === "notes" ? "Note" : "Finding";
    return `<ul class="dw-list">${Array.from({ length: n }, (_, i) => `<li><b>${word} ${i + 1}</b><span>page ${(i % counts.pages) + 1}</span></li>`).join("")}</ul>`;
  }

  function head(id: ItemId): string {
    const c = countOf(id);
    return `<header class="dw-head" data-grip><span class="dw-dots" aria-hidden="true"></span><b>${TITLES[id]}</b>${c === null ? "" : badge(c)}<button type="button" class="dw-x" data-close="${id}" aria-label="Close ${TITLES[id]}">×</button></header>`;
  }

  /** A group's words, one HTML piece each, in the order the `wrap` form's widths list them. */
  function groupWords(id: ItemId): string[] {
    if (id === "tools") return Array.from({ length: 5 }, (_, i) => `<button type="button" class="dw-tool" aria-label="Tool ${i + 1}"><i></i></button>`);
    if (id === "zoom") return [`<button type="button" class="dw-w" data-zoom="-">−</button>`, `<span class="dw-zv">${counts.zoom}%</span>`, `<button type="button" class="dw-w" data-zoom="+">+</button>`, `<button type="button" class="dw-w" data-zoom="fit">FIT</button>`];
    if (id === "views")
      return (["pages", "notes", "findings"] as const).map((p) => {
        const c = p === "pages" ? "" : ` <span class="dw-n">${countOf(p)}</span>`;
        return `<button type="button" class="dw-w dw-word" data-toggle="${p}" aria-pressed="${!scene.items[p]?.closed}">${TITLES[p]}${c}</button>`;
      });
    return [`<span class="dw-w"><span class="dw-n">${counts.marked}</span> marked</span>`, `<button type="button" class="dw-w">Original</button>`, `<button type="button" class="dw-w" aria-pressed="true">Marked</button>`, `<button type="button" class="dw-w" aria-label="Download">⬇</button>`];
  }

  /** Words in one row: Views' get a "·" between them (never at a row's end), Review's sit in a capsule. */
  function wordRow(id: ItemId, words: string[]): string {
    if (id === "views") return words.join('<span class="dw-sep">·</span>');
    if (id === "review") return `<span class="dw-cap">${words.join("")}</span>`;
    return words.join("");
  }

  function groupContent(id: ItemId, kind: string): string {
    const sq = (label: string, attrs = ""): string => `<button type="button" class="dw-sq" ${attrs}>${label}</button>`;
    if (kind === "icons") {
      if (id === "tools") return groupWords(id).join("");
      if (id === "zoom") return sq("−", 'data-zoom="-"') + sq("+", 'data-zoom="+"') + sq("F", 'data-zoom="fit"');
      // Each icon with its count under it (Notes 2, Findings 20), as the kits draw them.
      if (id === "views")
        return (["pages", "notes", "findings"] as const)
          .map((p) => {
            const n = p === "pages" ? null : countOf(p);
            return `<button type="button" class="dw-sq dw-sq-n" data-toggle="${p}" aria-pressed="${!scene.items[p]?.closed}" title="${TITLES[p]}${n === null ? "" : ` ${n}`}">${TITLES[p][0]!}${n === null ? "" : `<small>${n}</small>`}</button>`;
          })
          .join("");
      return sq("M") + sq("O") + sq("R") + sq("⬇");
    }
    return wordRow(id, groupWords(id));
  }

  function inner(id: ItemId, kind: string, rows?: readonly (readonly number[])[]): string {
    const it = scene.items[id]!;
    if (it.kind === "chrome") return id === "title" ? '<span class="dw-title-t">Document title</span>' : '<span class="dw-ctl"></span><span class="dw-ctl"></span><span class="dw-ctl"></span>';
    if (it.kind === "panel") {
      if (kind === "open") return head(id) + `<div class="dw-body">${body(id)}</div>`;
      if (kind === "header") return head(id);
      const c = countOf(id);
      return `<button type="button" class="dw-railbtn" data-grip data-open="${id}" aria-label="Open ${TITLES[id]}">${TITLES[id][0]}${c === null ? "" : badge(c)}</button>`;
    }
    if (kind === "fold") return `<span class="dw-dots" data-grip aria-hidden="true"></span><button type="button" class="dw-sq" title="${TITLES[id]}">»</button>`;
    if (kind === "wrap" && rows) {
      // The grip's cell at the start of row one, the words wrapping in their own box beside it (from the layout's rows).
      const words = groupWords(id);
      return `<span class="dw-dots" data-grip aria-hidden="true"></span><div class="dw-gc dw-wrapbox">${rows.map((row) => `<div class="dw-wrow">${wordRow(id, row.map((i) => words[i] ?? ""))}</div>`).join("")}</div>`;
    }
    return `<span class="dw-dots" data-grip aria-hidden="true"></span><div class="dw-gc">${groupContent(id, kind)}</div>`;
  }

  /** The axis an item lies along in `l`: its edge's, or its float's orient. */
  function axisOf(s: Scene, l: SceneLayout, id: string): "column" | "row" {
    const p = l.items[id]!;
    if (p.edge) {
      const side = l.edges[p.edge]?.side;
      return side === "left" || side === "right" ? "column" : "row";
    }
    return s.floats.find((f) => f.id === id)?.orient ?? "column";
  }

  function itemHtml(s: Scene, l: SceneLayout, id: ItemId): string {
    const p = l.items[id]!;
    const region = p.floating ? "float" : (p.edge ?? "none");
    const cls = `dw-item dw-${p.kind} dw-k-${p.formKind} dw-ax-${axisOf(s, l, id)}${p.floating ? " dw-float" : ""}`;
    const r = p.rect;
    return `<section class="${cls}" data-id="${id}" data-kind="${p.kind}" data-form="${p.formKind}" data-region="${region}" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.width)};height:${px(r.height)}">${inner(id, p.formKind, p.rows)}</section>`;
  }

  /**
   * The pages, fitted to the content's width. The fit is frozen while a drag is on and changes only after a commit whose
   * layout carries a `content-changed` note (or a fresh solve, or a zoom or count change).
   */
  function drawPages(content: Rect): void {
    if (drag) return;
    const w = Math.max(80, Math.min(content.width - 64, 640) * (counts.zoom / 86));
    const key = `${Math.round(w)}:${counts.pages}`;
    if (key === pageKey) return;
    pageKey = key;
    sheets.innerHTML = Array.from({ length: counts.pages }, (_, i) => `<div class="dw-sheet" style="width:${px(w)};height:${px(w * 1.3)}"><span>${i + 1}</span><i></i><i></i><i></i><i></i></div>`).join("");
  }

  /** Draw a layout of `s`; `hide` is the held item (drawn by the drag); `refit` fits the pages to the content again. */
  function draw(s: Scene, l: SceneLayout, hide?: ItemId, refit = false): void {
    win.style.width = px(s.stage.width);
    win.style.height = px(s.stage.height);
    for (const e of EDGES) {
      const el = q<HTMLDivElement>(`[data-edge=${e}]`);
      const r = l.edges[e]?.rect;
      el.hidden = !r || r.width <= 0 || r.height <= 0;
      if (r) place(el, r);
    }
    place(scroll, l.content);
    if (refit || pageKey === "") drawPages(l.content);
    for (const side of ["left", "right"] as const) {
      const el = q<HTMLDivElement>(`[data-resize=${side}]`);
      const e = l.edges[side];
      el.hidden = !e || e.cross <= RAIL;
      if (e) place(el, { x: side === "left" ? e.rect.x + e.rect.width - 3 : e.rect.x - 3, y: e.rect.y, width: 6, height: e.rect.height });
    }
    const docked: string[] = [];
    for (const id of Object.keys(l.items) as ItemId[]) if (id !== hide && !l.items[id]!.floating && !l.items[id]!.inMenu) docked.push(itemHtml(s, l, id));
    // Floats in their stacking order, the last on top.
    const floats = l.floats.filter((id) => id !== hide).map((id) => itemHtml(s, l, id as ItemId));
    const menus = EDGES.flatMap((e) => {
      const m = l.edges[e]?.menu;
      return m ? [`<button type="button" class="dw-menu" data-edge="${e}" title="${esc(m.items.map((id) => TITLES[id as ItemId]).join(", "))}" style="left:${px(m.rect.x)};top:${px(m.rect.y)};width:${px(m.rect.width)};height:${px(m.rect.height)}">» ${m.items.length}</button>`] : [];
    });
    layer.innerHTML = docked.join("") + menus.join("") + floats.join("");
  }

  // --- committing ------------------------------------------------------------------------------------------------

  function store(): void {
    try {
      localStorage.setItem(o.storageKey, JSON.stringify(storeDocwin(scene)));
    } catch {
      // No storage: the page works, a reload starts over.
    }
  }

  /**
   * Commit a scene: solved with the layout before as `previous` (a press reshapes nothing), drawn and stored. `fresh`
   * solves without it (true), or without it for the edges listed (an opened panel takes its largest form that fits).
   */
  function commit(next: Scene, opts: { fresh?: boolean | EdgeId[] } = {}): SceneLayout {
    scene = next;
    let previous: SceneLayout | undefined = layout;
    if (opts.fresh === true) previous = undefined;
    else if (Array.isArray(opts.fresh)) {
      const drop = new Set<string>(opts.fresh);
      previous = { ...layout, edges: Object.fromEntries(Object.entries(layout.edges).filter(([id]) => !drop.has(id))) };
    }
    layout = solve(scene, previous ? { previous } : {});
    draw(scene, layout, undefined, !previous || layout.notes.some((n) => n.code === "content-changed"));
    store();
    o.onChange?.();
    return layout;
  }

  const edgeHolding = (id: ItemId): EdgeId | null => (scene.edges.find((e) => e.items.includes(id))?.id as EdgeId | undefined) ?? null;

  // --- actions -----------------------------------------------------------------------------------------------------

  /** A press on a header: the item counts as just used. With the layout before, nothing moves. */
  function press(id: ItemId): void {
    commit(use(scene, id));
  }
  /** Open a panel (a Views word, a rail icon): newest, and its edge solved afresh so it takes its largest form that fits. */
  function open(id: ItemId): void {
    const e = edgeHolding(id);
    commit(use(openItem(scene, id), id), { fresh: e ? [e] : [] });
    say(`${TITLES[id]} opened.`);
  }
  function close(id: ItemId): void {
    commit(closeItem(scene, id));
    say(`${TITLES[id]} closed. Its Views word opens it again.`);
  }
  const toggle = (id: ItemId): void => (scene.items[id]!.closed ? open(id) : close(id));

  const targetsOf = (id: ItemId): SceneTarget[] => sceneTargets(scene, id, { previous: layout, endReach: END_REACH });
  const refusalsOf = (id: ItemId): SceneRefusal[] => sceneRefusals(scene, id, { previous: layout, endReach: END_REACH });
  const inside = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

  /** Over a refusal: the zone tinted, "No room here" at the pointer; elsewhere both hidden. */
  function showRefusal(r: SceneRefusal | null, p: Point): void {
    refuseTint.hidden = refuseLabel.hidden = !r;
    if (!r) return;
    place(refuseTint, r.hit);
    refuseTint.dataset.reason = r.reason;
    refuseLabel.textContent = r.reason === "no-room" ? "No room here" : "Can't go here";
    refuseLabel.style.left = px(p.x + 12);
    refuseLabel.style.top = px(p.y + 12);
  }

  // --- the drag session ----------------------------------------------------------------------------------------------

  const frozen = (): boolean => root.dataset.frozen !== undefined && root.dataset.alt === undefined;

  /** Lift `id`, pressed at `start` and now at `p` (window px). False when nothing can be lifted. */
  function begin(id: ItemId, start: Point, p: Point, now = performance.now()): boolean {
    if (drag || frozen() || scene.items[id]?.fixed) return false;
    const was = layout.items[id];
    if (!was) return false;
    const targets = targetsOf(id);
    const el = document.createElement("section");
    el.className = `dw-item dw-held dw-${was.kind} dw-k-${was.formKind} dw-ax-${axisOf(scene, layout, id)}`;
    el.innerHTML = inner(id, was.formKind, was.rows);
    const grab = { x: start.x - was.rect.x, y: start.y - was.rect.y };
    place(el, { x: p.x - grab.x, y: p.y - grab.y, width: was.rect.width, height: was.rect.height });
    win.append(el);
    const docked = !was.floating;
    const home: Rect = docked ? was.rect : { x: start.x, y: start.y, width: 0, height: 0 };
    drag = {
      id,
      kind: was.kind,
      grab,
      home,
      docked,
      size: { width: was.rect.width, height: was.rect.height },
      el,
      intent: createDragIntent<SceneTarget>({ home }),
      targets,
      refusals: refusalsOf(id),
      focus: document.activeElement,
      pointer: p,
      shown: null,
      refused: null,
      room: null,
      homing: false,
      preview: null,
      raf: 0,
    };
    root.dataset.dragSession = was.kind;
    // No target shown yet: the committed layout, the held item's place left empty, nothing else moving.
    draw(scene, layout, id);
    say(`${TITLES[id]} lifted. Move over a gap, or anywhere else to float it.`);
    frame(now);
    if (!driven) {
      const loop = (): void => {
        if (!drag) return;
        frame(performance.now());
        drag.raf = requestAnimationFrame(loop);
      };
      drag.raf = requestAnimationFrame(loop);
    }
    return true;
  }

  function showSlot(r: Rect | null, text = "", line?: Rect): void {
    if (!r) {
      slot.hidden = marker.hidden = true;
      return;
    }
    place(slot, r);
    // A thin slot (a rail's, 30 px) can't hold the label: it goes to the slot's title (shown on hover) and stays inside.
    const thin = r.width < 90;
    slotLabel.textContent = thin ? "" : text;
    slot.title = text;
    slot.hidden = false;
    if (line) {
      place(marker, line.height === 0 ? { x: line.x, y: line.y - 1.5, width: line.width, height: 3 } : { x: line.x - 1.5, y: line.y, width: 3, height: line.height });
      marker.hidden = false;
    } else marker.hidden = true;
  }

  const labelOf = (t: SceneTarget): string => {
    const p = t.place;
    if (p.kind === "gap") return `${p.edge} · ${p.zone} ${p.at}`;
    if (p.kind === "column" || p.kind === "rail") return `new ${p.kind} ${p.side} ${p.ring}`;
    return p.kind;
  };

  /** One frame of the drag: the intent says what shows; the preview plan whether the room is open. */
  function frame(now: number): void {
    const d = drag;
    if (!d) return;
    place(d.el, { x: d.pointer.x - d.grab.x, y: d.pointer.y - d.grab.y, width: d.size.width, height: d.size.height });
    const f = d.intent.update(d.pointer, now, d.targets);
    const plan = previewPlan(f, "gap");
    const room = plan.makeRoom && docks(f.shown) ? f.shown : null;
    const homing = f.atHome && d.docked && f.shown === null;
    if (room?.id !== d.room?.id || homing !== d.homing) {
      d.room = room;
      d.homing = homing;
      // The whole preview: every item drawn from the shown target's layout after the drop (C22).
      if (room) {
        const after = room.after(d.pointer, d.grab);
        draw(after.scene, after.layout, d.id);
      } else {
        // No target shown: the committed layout with the held item's place left empty and nothing else moving (a
        // release there commits nothing, so the preview is the result).
        draw(scene, layout, d.id);
      }
    }
    d.shown = f.shown;
    // A refused place under the pointer (nothing but the float target there): no slot anywhere, "No room here" at it.
    const refused = !homing && (!f.shown || f.shown.place.kind === "float") ? (d.refusals.find((r) => inside(r.hit, d.pointer)) ?? null) : null;
    d.refused = refused;
    showRefusal(refused, d.pointer);
    const s = plan.showIndicator ? f.shown : null;
    if (refused) {
      d.preview = null;
      showSlot(null);
    } else if (homing || s?.place.kind === "home") {
      d.preview = d.docked ? d.home : (layout.items[d.id]?.rect ?? null);
      showSlot(d.preview, "Back to its place");
    } else if (!s || s.place.kind === "none") {
      d.preview = null;
      showSlot(null);
    } else if (s.place.kind === "float") {
      const r = s.after(d.pointer, d.grab).layout.items[d.id]?.rect ?? null;
      d.preview = r;
      showSlot(r, "Float");
    } else {
      d.preview = s.slot ?? null;
      showSlot(d.preview, labelOf(s), s.marker);
    }
  }

  function move(p: Point): void {
    if (drag) drag.pointer = p;
  }

  /** The click that follows a drag's pointer-up is the drag's, not a press on whatever lies under the pointer. */
  function swallowClick(): void {
    const eat = (e: Event): void => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("click", eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 0);
  }

  /** Let go (or cancel): the drop commits the shown target's `after(...).scene` as is. */
  function release(now = performance.now(), cancel = false): LastDrop | null {
    const d = drag;
    if (!d) return null;
    if (!cancel) frame(now);
    // A release over a refusal commits nothing: the item goes home.
    const refused = cancel ? null : d.refused;
    const t = cancel || refused ? null : d.intent.release(d.pointer, d.targets);
    cancelAnimationFrame(d.raf);
    drag = null;
    // The press's own pointer, key and cancel listeners go with the drag: a reset mid-drag leaves none behind.
    endInput?.();
    d.el.remove();
    delete root.dataset.dragSession;
    showSlot(null);
    showRefusal(null, d.pointer);
    const id = d.id;
    let preview = d.preview;
    const go = commits(t);
    if (go) {
      const after = t!.after(d.pointer, d.grab);
      if (!preview) preview = after.layout.items[id]?.rect ?? null;
      commit(after.scene);
    } else draw(scene, layout);
    const landed = go ? (layout.items[id]?.rect ?? null) : null;
    lastDrop = { id, target: t?.id ?? refused?.id ?? null, place: t?.place.kind ?? null, preview: go ? preview : t?.place.kind === "home" || d.homing ? d.preview : null, landed, committed: go, cancelled: cancel };
    if (go && preview && landed && !sameRect(preview, landed)) say(`${TITLES[id]} → ${labelOf(t!)}, but it landed off its slot.`);
    else if (go) say(`${TITLES[id]} → ${labelOf(t!)}.`);
    else say(cancel ? "Cancelled: back where it was." : refused ? "No room here: back where it was." : t?.place.kind === "none" ? "No drop here." : d.homing || t?.place.kind === "home" ? "Back in its place." : "No target: it went home.");
    if (d.focus instanceof HTMLElement && d.focus.isConnected) d.focus.focus({ preventScroll: true });
    return lastDrop;
  }

  // --- input ---------------------------------------------------------------------------------------------------------

  const winPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = win.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  win.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag) return;
    const t = e.target as HTMLElement;
    const rz = t.closest<HTMLElement>("[data-resize]");
    if (rz) return resizeEdge(e, rz.dataset.resize as "left" | "right");
    const grip = t.closest<HTMLElement>("[data-grip]");
    const itemEl = t.closest<HTMLElement>("[data-id]");
    if (!grip || !itemEl) return;
    // A button inside a grip (a header's ×) is a click, not a drag.
    const btn = t.closest("button");
    if (btn && !btn.hasAttribute("data-grip")) return;
    const id = itemEl.dataset.id as ItemId;
    e.preventDefault();
    const start = winPoint(e);
    let lifted = false;
    const mv = (ev: PointerEvent): void => {
      const p = winPoint(ev);
      if (!lifted) {
        if (Math.hypot(p.x - start.x, p.y - start.y) < DRAG_DEFAULTS.lift) return;
        lifted = begin(id, start, p);
        if (!lifted) return stop();
      }
      move(p);
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      if (endInput === stop) endInput = null;
    };
    endInput = stop;
    const up = (ev: PointerEvent): void => {
      stop();
      if (lifted && drag) {
        move(winPoint(ev));
        swallowClick();
        release(performance.now(), ev.type === "pointercancel");
      } else if (!lifted && ev.type === "pointerup") {
        // A press that never lifted is a click: a rail icon opens its panel, a header press is a use.
        if (t.closest("[data-open]")) open(id);
        else if (t.closest(".dw-head")) press(id);
      }
    };
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape" && drag) {
        release(performance.now(), true);
        stop();
      }
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
  });

  win.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    // An edge's » menu: the items it holds, in order; picking one acts as its control would (here, a stub).
    const pick = t.closest<HTMLElement>("[data-menu-item]");
    if (pick) {
      menuList.hidden = true;
      say(`${TITLES[pick.dataset.menuItem as ItemId]}, from the » menu: its controls would act here.`);
      return;
    }
    const m = t.closest<HTMLElement>(".dw-menu[data-edge]");
    if (m) {
      const held = layout.edges[m.dataset.edge!]?.menu?.items ?? [];
      const open = !menuList.hidden && menuList.dataset.edge === m.dataset.edge;
      menuList.hidden = open;
      if (open) return;
      menuList.dataset.edge = m.dataset.edge!;
      menuList.innerHTML = held.map((id) => `<button type="button" data-menu-item="${id}">${esc(TITLES[id as ItemId])}</button>`).join("");
      const r = m.getBoundingClientRect();
      const w = win.getBoundingClientRect();
      menuList.style.left = px(Math.min(r.left - w.left, w.width - 160));
      menuList.style.top = px(r.bottom - w.top + 4);
      return;
    }
    if (!t.closest(".dw-menu-list")) menuList.hidden = true;
    const tg = t.closest<HTMLElement>("[data-toggle]");
    if (tg) return toggle(tg.dataset.toggle as ItemId);
    const x = t.closest<HTMLElement>("[data-close]");
    if (x) return close(x.dataset.close as ItemId);
    const z = t.closest<HTMLElement>("[data-zoom]");
    if (z) {
      const v = z.dataset.zoom;
      counts.zoom = v === "fit" ? 100 : Math.min(400, Math.max(25, counts.zoom + (v === "+" ? 10 : -10)));
      pageKey = "";
      commit(scene);
    }
  });

  /** The column's resize edge: a plain pointer drag that sets the user's size across (`resize`). */
  function resizeEdge(e: PointerEvent, side: "left" | "right"): void {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = layout.edges[side]?.cross ?? 240;
    const mv = (ev: PointerEvent): void => {
      const dx = (ev.clientX - x0) * (side === "left" ? 1 : -1);
      commit(resize(scene, side, Math.round(Math.min(COL_WIDE, Math.max(COL_MIN, w0 + dx)))));
    };
    const up = (): void => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  const altOn = (on: boolean): void => {
    if (on) root.dataset.alt = "";
    else delete root.dataset.alt;
  };
  window.addEventListener("keydown", (e) => e.key === "Alt" && altOn(true));
  window.addEventListener("keyup", (e) => e.key === "Alt" && altOn(false));
  window.addEventListener("blur", () => altOn(false));

  // --- load ------------------------------------------------------------------------------------------------------

  function load(): string[] {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(o.storageKey);
    } catch {
      raw = null;
    }
    if (!raw) {
      commit(defaultScene(scene.stage), { fresh: true });
      return [];
    }
    let data: unknown = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    const r = readDocwin(data);
    commit(r.scene, { fresh: true });
    return r.dropped;
  }

  // --- measuring -------------------------------------------------------------------------------------------------

  /**
   * Each group's sizes, from its buttons as the page renders them (hidden copies of its forms, each at its own content
   * size): the one-row width and its words' widths, a wrapped row's height, the vertical icons form's width and height,
   * the bar icons and fold widths. The scene's items hug what is drawn.
   */
  function measureGroups(): Record<GroupId, GroupMeasure> {
    const round = (x: number): number => Math.ceil(x - 0.01);
    /** A hidden copy of a group form: its section, appended (the caller removes it). */
    const copy = (id: GroupId, kind: string, axis: "row" | "column", html: string, height = "max-content"): HTMLElement => {
      const el = document.createElement("section");
      el.className = `dw-item dw-group dw-k-${kind} dw-ax-${axis}`;
      el.dataset.id = id;
      el.style.cssText = `left:0;top:0;width:max-content;height:${height};visibility:hidden`;
      el.innerHTML = html;
      layer.append(el);
      return el;
    };
    const size = (el: HTMLElement): { width: number; height: number } => {
      const r = el.getBoundingClientRect();
      return { width: round(Math.max(r.width, el.scrollWidth)), height: round(Math.max(r.height, el.scrollHeight)) };
    };
    const dots = '<span class="dw-dots" data-grip aria-hidden="true"></span>';
    const out = {} as Record<GroupId, GroupMeasure>;
    for (const id of GROUPS) {
      // As `inner` draws each form.
      const row = copy(id, "row", "row", `${dots}<div class="dw-gc">${groupContent(id, "row")}</div>`, `${BAR}px`);
      const gc = row.querySelector<HTMLElement>(".dw-gc")!;
      // The words: the capsule's pieces for Review, else the row's own children but the "·" separators.
      const box = gc.querySelector<HTMLElement>(".dw-cap") ?? gc;
      const words = [...box.children].filter((x) => !x.classList.contains("dw-sep")) as HTMLElement[];
      const widths = words.map((w) => w.getBoundingClientRect().width);
      const span = words.length > 0 ? words[words.length - 1]!.getBoundingClientRect().right - words[0]!.getBoundingClientRect().left : 0;
      const gap = words.length > 1 ? (span - widths.reduce((s, w) => s + w, 0)) / (words.length - 1) : 0;
      const wrapped = copy(id, "wrap", "column", `${dots}<div class="dw-gc dw-wrapbox"><div class="dw-wrow">${wordRow(id, groupWords(id))}</div></div>`);
      const wrapRow = round(wrapped.querySelector<HTMLElement>(".dw-wrow")!.getBoundingClientRect().height);
      // A wrapped row's lead: from the box's start to the first word, plus what a row draws after its last word (Review's
      // capsule edge), so the layout's row width is the drawn one.
      const wbox = wrapped.querySelector<HTMLElement>(".dw-wrow .dw-cap") ?? wrapped.querySelector<HTMLElement>(".dw-wrow")!;
      const wwords = [...wbox.children].filter((x) => !x.classList.contains("dw-sep") && !x.classList.contains("dw-cap")) as HTMLElement[];
      const capEnd = wbox.classList.contains("dw-cap") ? wbox.getBoundingClientRect().right - wwords[wwords.length - 1]!.getBoundingClientRect().right : 0;
      const lead = round(wwords[0]!.getBoundingClientRect().left - wrapped.getBoundingClientRect().left + capEnd);
      const iconsCol = copy(id, "icons", "column", `${dots}<div class="dw-gc">${groupContent(id, "icons")}</div>`);
      const iconsRow = copy(id, "icons", "row", `${dots}<div class="dw-gc">${groupContent(id, "icons")}</div>`, `${BAR}px`);
      const fold = copy(id, "fold", "row", `${dots}<button type="button" class="dw-sq" title="${TITLES[id]}">»</button>`, `${BAR}px`);
      out[id] = { row: size(row).width, words: widths.map(round), gap: Math.max(0, Math.round(gap)), wrapRow, lead, icons: size(iconsCol), iconsRow: size(iconsRow).width, fold: size(fold).width };
      for (const el of [row, wrapped, iconsCol, iconsRow, fold]) el.remove();
    }
    return out;
  }
  setGroupSizes(measureGroups());
  scene = defaultScene();
  layout = solve(scene);

  return {
    get scene(): Scene {
      return scene;
    },
    get layout(): SceneLayout {
      return layout;
    },
    get counts(): Counts {
      return counts;
    },
    get dragging(): boolean {
      return drag !== null;
    },
    get lastDrop(): LastDrop | null {
      return lastDrop;
    },
    get shown(): SceneTarget | null {
      return drag?.shown ?? null;
    },
    /** The refusal under the pointer during a drag ("No room here"), or none. */
    get refused(): SceneRefusal | null {
      return drag?.refused ?? null;
    },
    refusals: refusalsOf,
    win,
    root,
    layer,
    scroll,
    slot,
    load,
    /** Replace the scene (a preset): solved afresh. */
    setScene(next: Scene): void {
      if (drag) release(performance.now(), true);
      commit(next, { fresh: true });
    },
    reset(size?: { width: number; height: number }): void {
      if (drag) release(performance.now(), true);
      counts = { ...DEFAULT_COUNTS };
      pageKey = "";
      commit(defaultScene(size ?? { width: scene.stage.width, height: scene.stage.height }), { fresh: true });
    },
    setSize(width: number, height: number): void {
      commit(withStage(scene, { width, height }));
    },
    setCount(k: keyof Counts, v: number): void {
      counts[k] = v;
      pageKey = "";
      commit(scene);
    },
    setFrozen(on: boolean): void {
      if (on) root.dataset.frozen = "";
      else delete root.dataset.frozen;
    },
    get frozen(): boolean {
      return root.dataset.frozen !== undefined;
    },
    altOn,
    targets: targetsOf,
    edge: (id: EdgeId) => edgeOf(scene, id),
    press,
    open,
    close,
    toggle,
    /** The drag, driven by hand (the checks): no animation frames while `on`. */
    drive(on: boolean): void {
      driven = on;
    },
    begin,
    move,
    frame,
    release,
    stored: (): StoredDocwin => storeDocwin(scene),
    say,
  };
}
