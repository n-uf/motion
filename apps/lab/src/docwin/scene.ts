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
 * - the host contract, through the lab's one session wiring (../shared/session): while a drag is on, the root carries
 *   `data-drag-session="<kind>"` and one base CSS rule turns off hover, resize handles and selection under it; the
 *   content keeps its fit until the drop; the click after a drag's pointer-up is swallowed and focus goes back to where
 *   it was before the press;
 * - the store is `storeScene` / `readScene` (./store).
 */
import { clamp, contains, type Point, type Rect } from "@n-uf/placement";
import { createSettle, SETTLE_TEMPO, type Settle } from "@n-uf/motion";
import { createDragIntent, previewPlan, type DragIntent, type DragKeys, type DragPreview } from "@n-uf/motion/drag";
import { anchoredMorph, type AnchoredMorph } from "@n-uf/motion/layout";
import {
  close as closeItem,
  fitResize,
  floatOrientOf,
  fold,
  open as openItem,
  raise,
  refusals as sceneRefusals,
  stops as sceneStops,
  railModeOf,
  resize,
  setRailMode as setRailModeOf,
  solve,
  targets as sceneTargets,
  use,
  type RailMode,
  type ResizeEdges,
  type Scene,
  type SceneLayout,
  type SceneRefusal,
  type SceneTarget,
} from "@n-uf/placement/scene";
import { BAR, BAR_INSET, COL_MIN, COL_WIDE, DEFAULT_COUNTS, GROUPS, PANELS, RAIL, ROW_VARIANTS, TITLES, ZOOM_CONTROLS, defaultScene, edgeOf, reformPanels, titleOf, setGroupSizes, setTitleSizes, withStage, type Counts, type EdgeId, type GroupId, type GroupMeasure, type ItemId, type PanelId } from "./model";
import { DEFAULT_FEEL, keyName, tuningOf, withFeel, type DragFeel } from "./feel";
import { readDocwin, storeDocwin, type StoredDocwin } from "./store";
import { createDragSession, followPointer, swallowClick } from "../shared/session";

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

/** One form of the held copy, drawn at its measured size: its content, and where its grip anchors it to the pointer. */
interface HeldForm {
  readonly key: string;
  readonly formKind: string;
  readonly axis: "row" | "column";
  readonly size: { readonly width: number; readonly height: number };
  /** The spot that sits on the pointer: the grip's top-left corner plus the pointer's offset from it when lifted. */
  readonly anchor: Point;
  /** The grip's top-left corner in the form. */
  readonly grip: Point;
  readonly el: HTMLElement;
  /** How shown it is now, 0 to 1: it fades from there toward 1 (heading in) or 0 (any other form), never jumping. */
  opacity: number;
}

/** A form's fade from fully hidden to fully shown, or back (linear: a frame changes it by `min(dt, FADE_DT_CAP) / FADE_MS`). */
export const FADE_MS = 120;
/** The most of one frame's time a fade steps by (ms): a long frame on a slow machine doesn't make it jump. */
export const FADE_DT_CAP = 32;

/** A form to draw the held copy in: its kind, its axis, its rows (a wrap form) and its measured size. */
interface FormSpec {
  readonly formKind: string;
  readonly axis: "row" | "column";
  readonly rows?: readonly (readonly number[])[] | undefined;
  /** The controls the form leaves out (`SceneItemLayout.hidden`): a "+N" cell stands for them. */
  readonly hidden: readonly string[];
  readonly size: { readonly width: number; readonly height: number };
  /** A rail title's side (`SceneItemLayout.railTitle`): which way it reads. */
  readonly railTitle?: "left" | "right" | undefined;
}

/** What the held copy reports to checks: its form, the target it follows, the switches so far, the morph and the DOM. */
export interface HeldInfo {
  readonly formKind: string;
  readonly axis: "row" | "column";
  /** The target whose form it heads for (null: its own form, off every target). */
  readonly target: string | null;
  readonly switches: number;
  readonly settled: boolean;
  readonly progress: number;
  /** The pointer (window px), the held frame and the form heading in (its element carries `[data-grip]`). */
  readonly pointer: Point;
  readonly frame: HTMLElement;
  readonly el: HTMLElement;
}

interface Held {
  readonly id: ItemId;
  readonly kind: string;
  readonly grab: Point;
  readonly home: Rect;
  readonly docked: boolean;
  /** The held copy's frame: the morph's box with its anchor (the grip) on the pointer; each form's content inside. */
  readonly el: HTMLElement;
  /** The held copy's size and grip anchor, settling to the shown target's form and back (`@n-uf/motion/layout`). */
  readonly morph: AnchoredMorph;
  /** The pointer's offset from the grip's top-left corner when lifted, kept in every form. */
  readonly fromGrip: Point;
  /** The form it had when lifted, and every form drawn so far in this drag, by key. */
  readonly homeForm: HeldForm;
  readonly forms: Map<string, HeldForm>;
  /** The form heading in, and the forms still fading out (none at rest). */
  current: HeldForm;
  readonly fading: HeldForm[];
  /** The target the held form follows (its id; null: the home form), the form switches so far, the last frame's time. */
  formOf: string | null;
  switches: number;
  last: number;
  readonly intent: DragIntent<SceneTarget>;
  /** Its drop targets: asked again when the window changes under the drag (a resize). */
  targets: readonly SceneTarget[];
  /** Where the held frame is drawn: on the pointer, or settling into the snapped slot and back (`"snap"` preview). */
  readonly drawn: Settle<Rect>;
  /** The target the held frame sits in (snap preview), or null. */
  snappedTo: string | null;
  /** The held frame is settling into a slot or back onto the pointer (not held on it 1:1). */
  gliding: boolean;
  /** This drag, frame by frame (the checks read it): the shown target's changes, the snaps, every frame. */
  readonly trace: DragTrace;
  /** Where a drop is refused (`refusals`): over one, "No room here" at the pointer and no slot; a release goes home. */
  readonly refusals: readonly SceneRefusal[];
  readonly focus: Element | null;
  pointer: Point;
  shown: SceneTarget | null;
  refused: SceneRefusal | null;
  room: SceneTarget | null;
  homing: boolean;
  preview: Rect | null;
  /** The modifier keys held now; Alt held at the lift (it unfreezes a frozen window) counts only once pressed again. */
  keys: DragKeys;
  altFromLift: boolean;
  /** The rail target last said armed in the live region (its id), or null. */
  armedSaid: string | null;
}

/**
 * One drag, frame by frame: each change of the target the intent shows (`log`), each change of the slot the held item
 * sits in under the snap preview (`snaps`; `flying`: it left because the pointer flew off), and every frame's pointer,
 * speed and drawn rect of the held item (`frames`), at the session's times.
 */
export interface DragTrace {
  readonly log: { readonly id: string | null; readonly t: number }[];
  readonly snaps: { readonly id: string | null; readonly t: number; readonly flying: boolean }[];
  readonly frames: { readonly t: number; readonly x: number; readonly y: number; readonly speed: number; readonly item: Rect }[];
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

/** A floating panel's resize handles: its four edges and four corners. */
type FloatHandle = "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-right" | "bottom-left";
const FLOAT_HANDLES: readonly FloatHandle[] =["top", "right", "bottom", "left", "top-left", "top-right", "bottom-right", "bottom-left"];

export type DocwinScene = ReturnType<typeof createScene>;

export function createScene(o: SceneOptions) {
  const { root, win, status } = o;
  // An empty window until the groups are measured (below, before the first scene is built).
  let scene: Scene = { stage: { x: 0, y: 0, width: 0, height: 0 }, edges: [], items: {}, floats: [], floatKinds: [] };
  let layout: SceneLayout = solve(scene);
  let counts: Counts = { ...DEFAULT_COUNTS };
  let drag: Held | null = null;
  let lastDrop: LastDrop | null = null;
  /** The last drag's trace (the drag in progress, or the one before). */
  let lastTrace: DragTrace | null = null;
  /**
   * The drop preview (`@n-uf/motion/drag`'s `previewPlan`): the dashed slot only (`"indicator"`), the slot and the room
   * made for it (`"gap"`, the default), or the room with the item settling into its slot (`"snap"`).
   */
  let dropPreview: DragPreview = "gap";
  /** The press, the frames and the session mark: the lab's one wiring (../shared/session). */
  const session = createDragSession({ root, point: (e) => winPoint(e), frame: (now) => frame(now) });
  let pageKey = "";
  /** The drag feel (`./feel`): read by every drag's targets and tuning. */
  let feel: DragFeel = DEFAULT_FEEL;

  win.innerHTML = `
    <div class="dw-edges"></div>
    <div class="dw-scroll" tabindex="0" aria-label="Pages"><div class="dw-sheets"></div></div>
    <div class="dw-items"></div>
    <div class="dw-resize" data-resize="left" title="Drag to change the column's width"></div>
    <div class="dw-resize" data-resize="right" title="Drag to change the column's width"></div>
    <div class="dw-strips" aria-hidden="true"></div>
    <div class="dw-slot" hidden><span class="dw-slot-label"></span></div>
    <div class="dw-marker" hidden></div>
    <div class="dw-refuse" hidden></div>
    <div class="dw-refuse-label" hidden>No room here</div>
    <div class="dw-menu-list" role="menu" hidden></div>`;
  const q = <T extends HTMLElement>(sel: string): T => win.querySelector(sel) as T;
  const edgeLayer = q<HTMLDivElement>(".dw-edges");
  const layer = q<HTMLDivElement>(".dw-items");
  const scroll = q<HTMLDivElement>(".dw-scroll");
  const sheets = q<HTMLDivElement>(".dw-sheets");
  const slot = q<HTMLDivElement>(".dw-slot");
  const stripLayer = q<HTMLDivElement>(".dw-strips");
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
    return `<header class="dw-head" data-grip><span class="dw-dots" aria-hidden="true"></span><b>${titleOf(id)}</b>${c === null ? "" : badge(c)}<button type="button" class="dw-pm" data-pmenu="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="${titleOf(id)} menu">⋯</button><button type="button" class="dw-x" data-close="${id}" aria-label="Close ${titleOf(id)}">×</button></header>`;
  }

  /** A group's words, one HTML piece each, in the order the `wrap` form's widths list them; `hidden` controls left out. */
  function groupWords(id: ItemId, hidden: readonly string[] = []): string[] {
    if (id === "tools") return Array.from({ length: 5 }, (_, i) => `<button type="button" class="dw-tool" aria-label="Tool ${i + 1}"><i></i></button>`);
    if (id === "zoom")
      return ZOOM_CONTROLS.filter((c) => c.id === null || !hidden.includes(c.id)).map((c) =>
        c.id === null
          ? `<span class="dw-zv">${counts.zoom}%</span>`
          : // The fit control mirrors the kits' FitToggle: one fixed-width outlined button, its word in capitals.
            `<button type="button" class="${c.id === "fit" ? "dw-fit" : "dw-w"}" data-zoom="${c.id}"${c.id === "fit" ? ' aria-pressed="false"' : ""}>${c.label}</button>`,
      );
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

  /**
   * The overflow cell of a form that hides controls: a narrow "»" (12 px) with a small count badge, the edge's "» N" menu
   * one level down. It opens the popover listing exactly the hidden controls, and is drawn after the form's words.
   */
  const moreCell = (id: ItemId, hidden: readonly string[]): string =>
    hidden.length === 0
      ? ""
      : `<button type="button" class="dw-more" data-more="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="${hidden.length} more ${esc(titleOf(id))} controls"><span class="dw-chev" aria-hidden="true">»</span><span class="dw-cnt" aria-hidden="true">${hidden.length}</span></button>`;

  function groupContent(id: ItemId, kind: string, hidden: readonly string[] = []): string {
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
    return wordRow(id, groupWords(id, hidden)) + moreCell(id, hidden);
  }

  /**
   * A panel's rail title: its name and count turned to run along the rail, read toward the pages (the left rail bottom
   * to top, the right one top to bottom), the count at the title's end. The same button as the tile: a click opens it,
   * a drag moves it, a double-click on it unfolds it.
   */
  const railTitle = (id: ItemId, side: "left" | "right"): string => {
    const c = countOf(id);
    return `<button type="button" class="dw-railbtn dw-railtitle dw-rt-${side}" data-grip data-open="${id}" aria-label="Open ${titleOf(id)}"><span class="dw-rt">${titleOf(id)}${c === null ? "" : badge(c)}</span></button>`;
  };

  function inner(id: ItemId, kind: string, rows?: readonly (readonly number[])[], hidden: readonly string[] = [], titleSide?: "left" | "right"): string {
    const it = scene.items[id]!;
    if (it.kind === "chrome") return id === "title" ? '<span class="dw-title-t">Document title</span>' : '<span class="dw-ctl"></span><span class="dw-ctl"></span><span class="dw-ctl"></span>';
    if (it.kind === "panel") {
      if (kind === "open") return head(id) + `<div class="dw-body">${body(id)}</div>`;
      if (kind === "header") return head(id);
      if (titleSide) return railTitle(id, titleSide);
      const c = countOf(id);
      return `<button type="button" class="dw-railbtn" data-grip data-open="${id}" aria-label="Open ${titleOf(id)}">${titleOf(id)[0]}${c === null ? "" : badge(c)}</button>`;
    }
    if (kind === "fold") return `<span class="dw-dots" data-grip aria-hidden="true"></span><button type="button" class="dw-sq" title="${titleOf(id)}">»</button>`;
    if (kind === "wrap" && rows) {
      // The grip's cell at the start of row one, the words wrapping in their own box beside it (from the layout's rows).
      const words = groupWords(id);
      return `<span class="dw-dots" data-grip aria-hidden="true"></span><div class="dw-gc dw-wrapbox">${rows.map((row) => `<div class="dw-wrow">${wordRow(id, row.map((i) => words[i] ?? ""))}</div>`).join("")}</div>`;
    }
    return `<span class="dw-dots" data-grip aria-hidden="true"></span><div class="dw-gc">${groupContent(id, kind, hidden)}</div>`;
  }

  /** The axis an item lies along in `l`: its edge's, or its float's orient (default the item's, `floatOrientOf`). */
  function axisOf(s: Scene, l: SceneLayout, id: string): "column" | "row" {
    const p = l.items[id]!;
    if (p.edge) {
      const side = l.edges[p.edge]?.side;
      return side === "left" || side === "right" ? "column" : "row";
    }
    const it = s.items[id];
    return s.floats.find((f) => f.id === id)?.orient ?? (it ? floatOrientOf(it) : "column");
  }

  function itemHtml(s: Scene, l: SceneLayout, id: ItemId): string {
    const p = l.items[id]!;
    const region = p.floating ? "float" : (p.edge ?? "none");
    const cls = `dw-item dw-${p.kind} dw-k-${p.formKind} dw-ax-${axisOf(s, l, id)}${p.floating ? " dw-float" : ""}`;
    const r = p.rect;
    // A floating open panel takes resize handles on its four edges and corners (a toolbar's size comes from its forms).
    const handles = p.floating && p.kind === "panel" && p.formKind === "open" ? FLOAT_HANDLES.map((h) => `<div class="dw-fh" data-fh="${h}" aria-hidden="true"></div>`).join("") : "";
    return `<section class="${cls}" data-id="${id}" data-kind="${p.kind}" data-form="${p.formKind}" data-region="${region}" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.width)};height:${px(r.height)}">${inner(id, p.formKind, p.rows, p.hidden, p.railTitle)}${handles}</section>`;
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
    // Every edge the layout has (this window's, or any scene's): a bar's or a column's background.
    edgeLayer.innerHTML = Object.entries(l.edges)
      .filter(([, e]) => e.rect.width > 0 && e.rect.height > 0)
      .map(([id, e]) => `<div class="${e.side === "left" || e.side === "right" ? "dw-colbg" : "dw-bar"}" data-edge="${esc(id)}" style="left:${px(e.rect.x)};top:${px(e.rect.y)};width:${px(e.rect.width)};height:${px(e.rect.height)}"></div>`)
      .join("");
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
    const menus = Object.keys(l.edges).flatMap((e) => {
      const m = l.edges[e]?.menu;
      return m ? [`<button type="button" class="dw-menu" data-edge="${e}" title="${esc(m.items.map((id) => titleOf(id)).join(", "))}" style="left:${px(m.rect.x)};top:${px(m.rect.y)};width:${px(m.rect.width)};height:${px(m.rect.height)}">» ${m.items.length}</button>`] : [];
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
    // A "+N" popover belongs to the form it was opened from: any change redraws the items, and closes it.
    closeMore(false);
    scene = next;
    let previous: SceneLayout | undefined = layout;
    if (opts.fresh === true) previous = undefined;
    else if (Array.isArray(opts.fresh)) {
      const drop = new Set<string>(opts.fresh);
      previous = { ...layout, edges: Object.fromEntries(Object.entries(layout.edges).filter(([id]) => !drop.has(id))) };
    }
    layout = solve(scene, previous ? { previous } : {});
    // During a drag (the window resized under it) the held item stays drawn by the drag, and its targets are asked again.
    draw(scene, layout, drag?.id, !previous || layout.notes.some((n) => n.code === "content-changed"));
    if (drag) {
      drag.targets = targetsOf(drag.id);
      // The room is drawn again from the new targets on the next frame.
      drag.room = null;
    }
    restingStrips();
    store();
    o.onChange?.();
    return layout;
  }

  const edgeHolding = (id: ItemId): EdgeId | null => (scene.edges.find((e) => e.items.includes(id))?.id as EdgeId | undefined) ?? null;

  // --- actions -----------------------------------------------------------------------------------------------------

  /** A grip's double-click: folded by hand, or unfolded (`fold`); only its own edge reflows. */
  function toggleFold(id: ItemId): void {
    const it = scene.items[id];
    if (!it) return;
    const on = !((it.from ?? 0) >= 1);
    const next = fold(scene, id, on);
    if (next === scene) return;
    commit(next);
    say(`${titleOf(id)} ${on ? "folded" : "unfolded"}. Double-click its grip again to ${on ? "unfold" : "fold"} it.`);
  }

  /** A press on a header: the item counts as just used. With the layout before, nothing moves. */
  function press(id: ItemId): void {
    commit(use(scene, id));
  }
  /**
   * Open a panel (a Views word, a rail icon or title): newest, and its edge solved afresh so it takes its largest form
   * that fits. A panel shown but folded by hand (in a rail) unfolds; a closed one comes back as it was.
   */
  function open(id: ItemId): void {
    const e = edgeHolding(id);
    const it = scene.items[id];
    const s = it && !it.closed && (it.from ?? 0) >= 1 ? fold(scene, id, false) : openItem(scene, id);
    commit(use(s, id), { fresh: e ? [e] : [] });
    say(`${titleOf(id)} opened.`);
  }
  function close(id: ItemId): void {
    commit(closeItem(scene, id));
    say(`${titleOf(id)} closed. Its Views word opens it again.`);
  }
  const toggle = (id: ItemId): void => (scene.items[id]!.closed ? open(id) : close(id));
  /** A side's rails show their panels' titles (while they fit) or their tiles: `rails[side].mode`, stored. */
  function setRailMode(side: "left" | "right", mode: RailMode): void {
    const next = setRailModeOf(scene, side, mode);
    if (next === scene) return;
    commit(next);
    say(`The ${side} rail shows ${mode === "titles" ? "the panels' titles while they fit" : "icons"}.`);
  }

  // The drag feel: the rail drop policies per kind go into the scene the targets read; the tuning into each drag.
  // A scene loaded from elsewhere (a conformance row, `hostRules`) keeps its own rail drop policies and the rows' end
  // reach, and drags with the intent's default tuning.
  let rowRules: { readonly endReach: number } | null = null;
  const ruled = (): Scene => (rowRules ? scene : withFeel(scene, feel));
  const reachOf = (): { previous: SceneLayout; endReach: number } => ({ previous: layout, endReach: rowRules?.endReach ?? END_REACH });
  const targetsOf = (id: ItemId): SceneTarget[] => sceneTargets(ruled(), id, reachOf());
  const refusalsOf = (id: ItemId): SceneRefusal[] => sceneRefusals(ruled(), id, reachOf());
  const stopsOf = (id: ItemId): SceneTarget[] => sceneStops(ruled(), id, reachOf());

  /**
   * The side rails' drop strips: while a panel is held, each rail target's strip (`whileDragging`); with `always`, also
   * at rest (the strips a docked panel's drag would offer). The one dwelt on is highlighted (`arming`), the armed one
   * grown by its magnet (`armed`); under reduced motion it grows with no animation.
   */
  function drawStrips(list: readonly SceneTarget[], arming: string | null, armed: SceneTarget | null): void {
    const seen = new Map<string, SceneTarget>();
    for (const t of list) if (t.strip) seen.set(`${t.strip.x}:${t.strip.y}`, t);
    const els = [...stripLayer.children] as HTMLElement[];
    let i = 0;
    for (const t of seen.values()) {
      const el = els[i++] ?? stripLayer.appendChild(document.createElement("div"));
      el.className = "dw-railstrip";
      const side = t.place.kind === "rail" ? t.place.side : "left";
      el.dataset.side = side;
      const on = armed && armed.place.kind === "rail" && armed.place.side === side;
      el.toggleAttribute("data-arming", !on && list.some((x) => x.id === arming && x.place.kind === "rail" && x.place.side === side));
      el.toggleAttribute("data-armed", !!on);
      const r = on && armed.armedHit ? { ...t.strip!, x: Math.min(t.strip!.x, armed.armedHit.x), width: Math.max(t.strip!.width, armed.armedHit.width) } : t.strip!;
      place(el, r);
    }
    for (; i < els.length; i++) els[i]!.remove();
  }
  /** At rest, with `always`: the strips a docked panel's drag would offer, one per side. */
  function restingStrips(): void {
    if (drag) return;
    if (feel.panel.railVisibility !== "always") return drawStrips([], null, null);
    const found: SceneTarget[] = [];
    for (const id of PANELS) {
      if (!layout.items[id] || layout.items[id]!.floating || scene.items[id]?.closed) continue;
      for (const t of targetsOf(id)) if (t.strip && !found.some((x) => x.place.kind === "rail" && t.place.kind === "rail" && x.place.side === t.place.side)) found.push(t);
      if (found.length >= 2) break;
    }
    drawStrips(found, null, null);
  }
  const inside = (r: Rect, p: Point): boolean => contains(r, p, 0);

  /** Over a refusal: the zone tinted, "No room here" at the pointer; elsewhere both hidden. */
  function showRefusal(r: SceneRefusal | null, p: Point): void {
    refuseTint.hidden = refuseLabel.hidden = !r;
    // The host contract's mark: the refusal shown, by its id.
    if (r) refuseTint.dataset.dragRefusal = r.id;
    else delete refuseTint.dataset.dragRefusal;
    if (!r) return;
    place(refuseTint, r.hit);
    refuseTint.dataset.reason = r.reason;
    refuseLabel.textContent = r.reason === "no-room" ? "No room here" : r.reason === "own-place" ? "Already its place" : "Can't go here";
    refuseLabel.style.left = px(p.x + 12);
    refuseLabel.style.top = px(p.y + 12);
  }

  // --- the drag session ----------------------------------------------------------------------------------------------

  const frozen = (): boolean => root.dataset.frozen !== undefined && root.dataset.alt === undefined;

  /** `node`'s top-left corner in `box`'s border box (layout px, so a scaled window doesn't change it). */
  const offsetIn = (node: HTMLElement, box: HTMLElement): Point => {
    let x = 0;
    let y = 0;
    for (let n: HTMLElement | null = node; n && n !== box; n = n.offsetParent as HTMLElement | null) {
      // An offset is from the offset parent's padding edge: its border lies outside that.
      const parent = n.offsetParent as HTMLElement | null;
      x += n.offsetLeft + (parent?.clientLeft ?? 0);
      y += n.offsetTop + (parent?.clientTop ?? 0);
    }
    return { x, y };
  };

  /**
   * One form of the held copy, in its `frame`: the content drawn at the form's measured size, anchored at its grip plus
   * `fromGrip` (the pointer's offset from the grip when lifted; null: the grip's own corner). Drawn once per drag.
   */
  function heldForm(frame: HTMLElement, forms: Map<string, HeldForm>, id: ItemId, kind: string, spec: FormSpec, fromGrip: Point | null): HeldForm {
    const w = spec.size.width;
    const h = spec.size.height;
    const key = `${spec.formKind}|${spec.axis}|${JSON.stringify(spec.rows ?? null)}|${spec.hidden.join(",")}|${spec.railTitle ?? ""}|${Math.round(w)}x${Math.round(h)}`;
    const had = forms.get(key);
    if (had) return had;
    const el = document.createElement("section");
    el.className = `dw-item dw-${kind} dw-k-${spec.formKind} dw-ax-${spec.axis}`;
    el.innerHTML = inner(id, spec.formKind, spec.rows, spec.hidden, spec.railTitle);
    // Hidden until it heads in; it fades in from there.
    Object.assign(el.style, { left: "0px", top: "0px", width: px(w), height: px(h), opacity: "0", visibility: "hidden" });
    frame.append(el);
    const g = el.matches("[data-grip]") ? el : el.querySelector<HTMLElement>("[data-grip]");
    const grip = g ? offsetIn(g, el) : { x: 0, y: 0 };
    const anchor = fromGrip ? { x: clamp(grip.x + fromGrip.x, 0, w), y: clamp(grip.y + fromGrip.y, 0, h) } : grip;
    const f: HeldForm = { key, formKind: spec.formKind, axis: spec.axis, size: { width: w, height: h }, anchor, grip, el, opacity: 0 };
    if (fromGrip) forms.set(key, f);
    return f;
  }

  /** The form the drop at `t` gives the held item, at its measured size; null when it lands in no drawn form. */
  function formAt(d: Held, t: SceneTarget): FormSpec | null {
    const a = t.after(d.pointer, d.grab);
    const it = a.layout.items[d.id];
    if (!it || it.inMenu || it.floating) return null;
    return { formKind: it.formKind, axis: axisOf(a.scene, a.layout, d.id), rows: it.rows, hidden: it.hidden, size: it.rect, railTitle: it.railTitle };
  }

  /**
   * The held copy takes `next`'s form: the morph heads for its size and grip anchor from where it is drawn, `next`
   * fades in from its opacity now and every other form shown fades out from its own, so a fast sweep retargets
   * mid-flight with no snap and no pop.
   */
  function switchForm(d: Held, next: HeldForm): void {
    if (next === d.current) return;
    if (d.current.opacity > 0 && !d.fading.includes(d.current)) d.fading.push(d.current);
    const i = d.fading.indexOf(next);
    if (i >= 0) d.fading.splice(i, 1);
    d.current = next;
    next.el.style.visibility = "";
    d.morph.to(next.size, next.anchor);
    d.switches++;
  }

  /**
   * Draw the held copy for this frame: the frame at the morph's box, each form shown with its own anchor on the
   * pointer. The form heading in fades toward 1, the others toward 0, each from where it is (`FADE_MS` for the whole
   * way); a form is dropped once it is all gone. Under the snap preview the frame settles into `slot` (the shown
   * target's) and, once the pointer leaves it, back onto the pointer; otherwise it is on the pointer 1:1.
   */
  function drawHeld(d: Held, now: number, slot: Rect | null, speed: number): void {
    const dt = Math.max(0, now - d.last);
    d.morph.step(dt);
    d.last = now;
    const onPointer = d.morph.rectAt(d.pointer);
    // Into the slot, or out of it back to the pointer, on the settle; on the pointer, held 1:1.
    if (slot) d.gliding = true;
    if (d.gliding) {
      d.drawn.setTarget(slot ?? onPointer);
      d.drawn.step(dt);
      if (!slot && d.drawn.settled) d.gliding = false;
    } else d.drawn.hold(onPointer);
    const item = d.drawn.value;
    place(d.el, item);
    d.trace.frames.push({ t: now, x: d.pointer.x, y: d.pointer.y, speed, item });
    const at = d.morph.anchor;
    const by = Math.min(dt, FADE_DT_CAP) / FADE_MS;
    d.current.opacity = Math.min(1, d.current.opacity + by);
    for (const f of d.fading) f.opacity = Math.max(0, f.opacity - by);
    for (let i = d.fading.length - 1; i >= 0; i--) {
      const f = d.fading[i]!;
      if (f.opacity > 0) continue;
      f.el.style.visibility = "hidden";
      f.el.style.opacity = "0";
      d.fading.splice(i, 1);
    }
    for (const f of [d.current, ...d.fading]) {
      f.el.style.left = px(at.x - f.anchor.x);
      f.el.style.top = px(at.y - f.anchor.y);
      f.el.style.opacity = String(f.opacity);
    }
  }


  /** The keys held when the next drag lifts (a press's modifier state). */
  let liftKeys: DragKeys = {};
  /** The keys held now, during a drag: Alt held since the lift counts only once let go and pressed again. */
  function setKeys(k: DragKeys): void {
    const d = drag;
    if (!d) return;
    if (d.altFromLift && !k.alt) d.altFromLift = false;
    d.keys = { ...k, alt: !!k.alt && !d.altFromLift };
  }

  /** Lift `id`, pressed at `start` and now at `p` (window px). False when nothing can be lifted. */
  function begin(id: ItemId, start: Point, p: Point, now = performance.now()): boolean {
    if (drag || frozen() || scene.items[id]?.fixed) return false;
    const was = layout.items[id];
    if (!was) return false;
    const targets = targetsOf(id);
    // The held copy: a frame (the morph's box, its anchor on the pointer) holding each form's content.
    const el = document.createElement("div");
    el.className = `dw-held dw-morph dw-${was.kind}`;
    el.dataset.dragHeld = id;
    const grab = { x: start.x - was.rect.x, y: start.y - was.rect.y };
    place(el, { x: p.x - grab.x, y: p.y - grab.y, width: was.rect.width, height: was.rect.height });
    win.append(el);
    const forms = new Map<string, HeldForm>();
    const homeForm = heldForm(el, forms, id, was.kind, { formKind: was.formKind, axis: axisOf(scene, layout, id), rows: was.rows, hidden: was.hidden, size: was.rect }, null);
    // The pointer's offset from the grip in the lifted form: every form keeps it, so the grip stays under the pointer.
    const fromGrip = { x: grab.x - homeForm.anchor.x, y: grab.y - homeForm.anchor.y };
    // Shown in full from the lift.
    const home0: HeldForm = { ...homeForm, anchor: grab, opacity: 1 };
    Object.assign(home0.el.style, { opacity: "1", visibility: "" });
    forms.set(home0.key, home0);
    const docked = !was.floating;
    // Home is the item's own rect. A side rail's drop strip may overlap it (an item alone in its column reaches the rail
    // at its window edge): the drag intent arms a spring-loaded strip by dwell even over home.
    const home: Rect = docked ? was.rect : { x: start.x, y: start.y, width: 0, height: 0 };
    drag = {
      id,
      kind: was.kind,
      grab,
      home,
      docked,
      el,
      morph: anchoredMorph(was.rect, grab),
      fromGrip,
      homeForm: home0,
      forms,
      current: home0,
      fading: [],
      formOf: null,
      switches: 0,
      last: now,
      intent: createDragIntent<SceneTarget>({ home, tuning: rowRules ? {} : tuningOf(feel, was.kind) }),
      targets,
      drawn: createSettle<Rect>({ x: p.x - grab.x, y: p.y - grab.y, width: was.rect.width, height: was.rect.height }, { omega: SETTLE_TEMPO.default }),
      snappedTo: null,
      gliding: false,
      trace: (lastTrace = { log: [], snaps: [], frames: [] }),
      refusals: refusalsOf(id),
      focus: document.activeElement,
      pointer: p,
      shown: null,
      refused: null,
      room: null,
      homing: false,
      preview: null,
      // In a frozen window Alt unfreezes it for the lift: that Alt isn't the rail key until pressed again.
      keys: root.dataset.frozen !== undefined ? { ...liftKeys, alt: false } : { ...liftKeys },
      altFromLift: root.dataset.frozen !== undefined && !!liftKeys.alt,
      armedSaid: null,
    };
    liftKeys = {};
    // No target shown yet: the committed layout, the held item's place left empty, nothing else moving.
    draw(scene, layout, id);
    say(`${titleOf(id)} lifted. Move over a gap, or anywhere else to float it.`);
    session.started(was.kind, now);
    return true;
  }

  /**
   * The dashed slot (and the marker's insertion line) at `r`. The host contract's marks: a slot where a drop commits
   * carries `data-drag-slot` and `data-drag-target="<target id>"` (`target`), its line `data-drag-marker`; the "Back to
   * its place" slot over home carries neither (a drop there commits nothing).
   */
  function showSlot(r: Rect | null, text = "", line?: Rect, target?: string): void {
    slot.toggleAttribute("data-drag-slot", !!r && target !== undefined);
    if (r && target !== undefined) slot.dataset.dragTarget = target;
    else delete slot.dataset.dragTarget;
    marker.toggleAttribute("data-drag-marker", !!r && !!line);
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
    if (p.kind === "rail" && t.arm) return `collapse into the ${p.side} rail`;
    if (p.kind === "column" || p.kind === "rail") return `new ${p.kind} ${p.side} ${p.ring}`;
    return p.kind;
  };

  /**
   * The point a drag picks with: the pointer clamped into the window (the stage), so a pointer past the window's edge
   * means its nearest point of the window. The held copy still follows the pointer itself.
   */
  const pickPoint = (d: Held): Point => {
    const s = scene.stage;
    return { x: clamp(d.pointer.x, s.x, s.x + s.width - 0.5), y: clamp(d.pointer.y, s.y, s.y + s.height - 0.5) };
  };

  /** One frame of the drag: the intent says what shows; the preview plan whether the room is open. */
  function frame(now: number): void {
    const d = drag;
    if (!d) return;
    const f = d.intent.update(pickPoint(d), now, d.targets, d.keys);
    const plan = previewPlan(f, dropPreview);
    // The trace: each change of the shown target, and of the slot the held item sits in (snap).
    if ((f.shown?.id ?? null) !== (d.trace.log.at(-1)?.id ?? null)) d.trace.log.push({ id: f.shown?.id ?? null, t: now });
    const snapTo = plan.snapItem && docks(f.shown) && f.shown!.slot ? f.shown! : null;
    if ((snapTo?.id ?? null) !== d.snappedTo) {
      d.snappedTo = snapTo?.id ?? null;
      d.trace.snaps.push({ id: d.snappedTo, t: now, flying: !snapTo && !f.aiming });
    }
    // The side rails' strips, the one dwelt on highlighted, the armed one grown; the armed state said in the live region.
    const armed = f.shown && f.shown.place.kind === "rail" ? f.shown : null;
    drawStrips(d.targets, f.arming?.id ?? null, armed);
    if ((armed?.id ?? null) !== d.armedSaid) {
      d.armedSaid = armed?.id ?? null;
      if (armed && armed.place.kind === "rail") say(`${titleOf(d.id)}: release to collapse it into the ${armed.place.side} rail${f.forced === "rail" ? ` (${keyName(feel.panel.modifiers.railKey)} held)` : ""}.`);
      else if (f.arming) say(`${titleOf(d.id)} over the ${f.arming.place.kind === "rail" ? f.arming.place.side : ""} rail: hold still to collapse it there.`);
    }
    const room = plan.makeRoom && docks(f.shown) ? f.shown : null;
    const homing = f.atHome && d.docked && f.shown === null;
    // A toolbar group held over a target takes the form the drop there gives it (row, wrap, icons down a rail or along
    // a bar); off every target, the form it was lifted in. One switch per target change, the grip under the pointer.
    const over = (plan.showIndicator || plan.snapItem) && docks(f.shown) && !homing ? f.shown : null;
    const follows = d.kind === "group" ? (over?.id ?? null) : null;
    if (follows !== d.formOf) {
      d.formOf = follows;
      const spec = over && follows ? formAt(d, over) : null;
      switchForm(d, spec ? heldForm(d.el, d.forms, d.id, d.kind, spec, d.fromGrip) : d.homeForm);
    }
    drawHeld(d, now, snapTo?.slot ?? null, d.intent.state.speed);
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
    // A key held wins over geometry: no refusal then.
    const refused = !homing && !f.forced && (!f.shown || f.shown.place.kind === "float") ? (d.refusals.find((r) => inside(r.hit, pickPoint(d))) ?? null) : null;
    d.refused = refused;
    showRefusal(refused, d.pointer);
    const s = plan.showIndicator ? f.shown : null;
    if (refused) {
      d.preview = null;
      showSlot(null);
    } else if (homing || s?.place.kind === "home") {
      d.preview = layout.items[d.id]?.rect ?? null;
      showSlot(d.preview, "Back to its place");
    } else if (!s || s.place.kind === "none") {
      d.preview = null;
      showSlot(null);
    } else if (s.place.kind === "float") {
      const r = s.after(d.pointer, d.grab).layout.items[d.id]?.rect ?? null;
      d.preview = r;
      showSlot(r, "Float", undefined, s.id);
    } else {
      d.preview = s.slot ?? null;
      showSlot(d.preview, labelOf(s), s.marker, s.id);
    }
  }

  function move(p: Point): void {
    if (drag) drag.pointer = p;
  }

  /** What the page shows now: during a drag, the shown target's layout after its drop; with none, the held item's place empty. */
  function preview(): SceneLayout {
    const d = drag;
    // Back over its own place: the item drawn where it was ("Back to its place").
    if (!d || d.homing) return layout;
    // Over a refusal nothing is shown and a release commits nothing: the held item's place left empty.
    if (d.shown && !d.refused) return d.shown.after(d.pointer, d.grab).layout;
    const { [d.id]: _held, ...items } = layout.items;
    return { ...layout, items, floats: layout.floats.filter((f) => f !== d.id) };
  }

  /** The center of `el`, in window px, or null. */
  function pointOf(el: Element | null): Point | null {
    if (!el) return null;
    const w = win.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
  }

  /** A press on a grip: a float rises above the others (stacking only: no use, no reshape). */
  function grip(id: ItemId): void {
    if (layout.items[id]?.floating && layout.floats[layout.floats.length - 1] !== id) commit(raise(scene, id));
  }

  /** Let go (or cancel): the drop commits the shown target's `after(...).scene` as is. */
  function release(now = performance.now(), cancel = false): LastDrop | null {
    const d = drag;
    if (!d) return null;
    if (!cancel) frame(now);
    // A release over a refusal commits nothing: the item goes home.
    const refused = cancel ? null : d.refused;
    const t = cancel || refused ? null : d.intent.release(pickPoint(d), d.targets, d.keys);
    drag = null;
    // The frames, the session mark and the press's own listeners go with the drag: a reset mid-drag leaves none behind.
    session.ended();
    d.el.remove();
    showSlot(null);
    showRefusal(null, d.pointer);
    restingStrips();
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
    if (go && preview && landed && !sameRect(preview, landed)) say(`${titleOf(id)} → ${labelOf(t!)}, but it landed off its slot.`);
    else if (go) say(`${titleOf(id)} → ${labelOf(t!)}.`);
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
    const fh = t.closest<HTMLElement>("[data-fh]");
    const fhOf = fh?.closest<HTMLElement>("[data-id]");
    if (fh && fhOf) return resizeFloat(e, fhOf.dataset.id as ItemId, fh.dataset.fh as FloatHandle);
    const gripEl = t.closest<HTMLElement>("[data-grip]");
    const itemEl = t.closest<HTMLElement>("[data-id]");
    if (!gripEl || !itemEl) return;
    // A button inside a grip (a header's ×) is a click, not a drag.
    const btn = t.closest("button");
    if (btn && !btn.hasAttribute("data-grip")) return;
    const id = itemEl.dataset.id as ItemId;
    grip(id);
    // A double pairs two presses on the same item only: a click that redrew the window (a rail title opening its panel)
    // leaves another item under the second press, which is a plain click then.
    session.press(e, `${id}:${t.closest("[data-open]") ? "rail" : "grip"}`, {
      lift: (start, p, keys) => {
        liftKeys = keys;
        if (!begin(id, start, p)) return false;
        move(p);
        return true;
      },
      move: (p, keys) => {
        setKeys(keys);
        move(p);
      },
      release: (p, keys, cancel) => {
        move(p);
        setKeys(keys);
        release(performance.now(), cancel);
      },
      escape: () => release(performance.now(), true),
      // A modifier pressed or let go while held still: the keys win over geometry from the next frame.
      keys: setKeys,
      ended: (how) => {
        if (how === "doubleActivate") {
          // A double-click on a grip folds it, or unfolds it; frozen without Alt it does nothing (it isn't a click either).
          swallowClick();
          // On a rail item the first click has unfolded it already (a click opens it): the double only makes sure.
          if (!frozen() && (!t.closest("[data-open]") || (scene.items[id]?.from ?? 0) >= 1)) toggleFold(id);
        } else if (t.closest("[data-open]")) open(id);
        // A press that never lifted is a click: a rail icon opens its panel, a header press is a use.
        else if (t.closest(".dw-head")) press(id);
      },
    });
  });

  // --- the "+N" popover: the » menu's list, one level down ----------------------------------------------------------

  /** The item whose "+N" popover is open, or null. */
  let moreOf: ItemId | null = null;
  const moreButton = (id: ItemId): HTMLElement | null => layer.querySelector<HTMLElement>(`.dw-item[data-id="${id}"] .dw-more`);
  const controlLabel = (id: ItemId, c: string): string => (id === "zoom" ? (ZOOM_CONTROLS.find((x) => x.id === c)?.label ?? c) : c);

  /** Opens `btn`'s popover under it, listing exactly its form's hidden controls (each acts as the real one). */
  function openMore(btn: HTMLElement, focusFirst: boolean): void {
    const id = btn.dataset.more as ItemId;
    if (moreOf === id && !menuList.hidden) return closeMore(true);
    const hidden = layout.items[id]?.hidden ?? [];
    moreOf = id;
    menuList.dataset.edge = "";
    menuList.dataset.more = id;
    menuList.setAttribute("aria-label", `More ${titleOf(id)} controls`);
    menuList.innerHTML = hidden
      .map((c) => `<button type="button" role="menuitem" tabindex="-1" data-hidden-control="${esc(c)}"${id === "zoom" ? ` data-zoom="${esc(c)}"` : ""}>${esc(controlLabel(id, c))}</button>`)
      .join("");
    const r = btn.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    menuList.style.left = px(Math.max(0, Math.min(r.left - w.left, w.width - 160)));
    menuList.style.top = px(r.bottom - w.top + 4);
    menuList.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if (focusFirst) menuList.querySelector<HTMLElement>("button")?.focus();
  }

  /** Closes the "+N" popover, the focus back on its cell when `refocus`. */
  function closeMore(refocus: boolean): void {
    if (moreOf === null) return;
    const id = moreOf;
    moreOf = null;
    delete menuList.dataset.more;
    menuList.hidden = true;
    const btn = moreButton(id);
    btn?.setAttribute("aria-expanded", "false");
    if (refocus) btn?.focus();
  }

  // Arrows move between the popover's controls, Home and End to its ends; Escape closes it, the focus back on "+N".
  menuList.addEventListener("keydown", (e) => {
    const pmenu = menuList.dataset.pmenu;
    if (moreOf === null && !menuList.dataset.rail && !pmenu) return;
    if ((menuList.dataset.rail || pmenu) && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      delete menuList.dataset.rail;
      closePanelMenu(true);
      menuList.hidden = true;
      return;
    }
    const items = [...menuList.querySelectorAll<HTMLElement>("button:not([aria-disabled])")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number): void => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") go(at + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMore(true);
    }
  });

  win.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    // An edge's » menu: the items it holds, in order; picking one acts as its control would (here, a stub).
    const pick = t.closest<HTMLElement>("[data-menu-item]");
    if (pick) {
      menuList.hidden = true;
      say(`${titleOf(pick.dataset.menuItem!)}, from the » menu: its controls would act here.`);
      return;
    }
    // A "+N" cell: the popover lists exactly the controls its form hides; picking one acts as the real control.
    const more = t.closest<HTMLElement>(".dw-more[data-more]");
    if (more) {
      // A keyboard press (Enter or Space) clicks with no pointer: the first control then takes the focus.
      openMore(more, (e as MouseEvent).detail === 0);
      return;
    }
    if (t.closest("[data-hidden-control]")) closeMore(false);
    // A panel's menu: its ⋯ button opens it (a keyboard press focuses the first item); "Move to › Rail (side)" moves.
    const pm = t.closest<HTMLElement>("button[data-pmenu]");
    if (pm) {
      if (menuList.dataset.pmenu === pm.dataset.pmenu && !menuList.hidden) closePanelMenu(true);
      else openPanelMenu(pm, (e as MouseEvent).detail === 0);
      return;
    }
    const mr = t.closest<HTMLElement>("[data-move-rail]");
    if (mr) {
      if (mr.getAttribute("aria-disabled") === "true") return;
      const [pid, side] = mr.dataset.moveRail!.split(":") as [ItemId, "left" | "right"];
      closePanelMenu(false);
      moveToRail(pid, side);
      return;
    }
    if (!t.closest(".dw-menu-list")) closePanelMenu(false);
    // The rail's menu: titles or icons for that side's rails.
    const rm = t.closest<HTMLElement>("[data-rail-mode]");
    if (rm) {
      const [side, mode] = rm.dataset.railMode!.split(":") as ["left" | "right", RailMode];
      menuList.hidden = true;
      delete menuList.dataset.rail;
      setRailMode(side, mode);
      return;
    }
    const m = t.closest<HTMLElement>(".dw-menu[data-edge]");
    if (m) {
      closeMore(false);
      const held = layout.edges[m.dataset.edge!]?.menu?.items ?? [];
      const open = !menuList.hidden && menuList.dataset.edge === m.dataset.edge;
      menuList.hidden = open;
      if (open) return;
      menuList.dataset.edge = m.dataset.edge!;
      menuList.innerHTML = held.map((id) => `<button type="button" data-menu-item="${id}">${esc(titleOf(id))}</button>`).join("");
      const r = m.getBoundingClientRect();
      const w = win.getBoundingClientRect();
      menuList.style.left = px(Math.min(r.left - w.left, w.width - 160));
      menuList.style.top = px(r.bottom - w.top + 4);
      return;
    }
    if (!t.closest(".dw-menu-list")) {
      closeMore(false);
      menuList.hidden = true;
    }
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

  /** The side a rail item (a panel drawn in its rail form, in a column drawn as a rail) lies on, or null. */
  const railSideOf = (el: Element | null): "left" | "right" | null => {
    const sec = el?.closest<HTMLElement>(".dw-items [data-id]");
    const p = sec ? layout.items[sec.dataset.id!] : undefined;
    const side = p?.tab && p.edge ? layout.edges[p.edge]?.side : undefined;
    return side === "left" || side === "right" ? side : null;
  };

  /**
   * A rail's menu (its context menu, or Shift+F10 / the menu key on one of its buttons): "Show titles" or "Show icons"
   * for that side's rails, the one it shows now checked.
   */
  function openRailMenu(side: "left" | "right", at: Rect, focusFirst: boolean): void {
    closeMore(false);
    const now = railModeOf(scene, side);
    menuList.dataset.edge = "";
    menuList.dataset.rail = side;
    menuList.setAttribute("aria-label", `The ${side} rail`);
    menuList.innerHTML = (["titles", "icons"] as const)
      .map((m) => `<button type="button" role="menuitemradio" tabindex="-1" aria-checked="${now === m}" data-rail-mode="${side}:${m}">${m === "titles" ? "Show titles" : "Show icons"}</button>`)
      .join("");
    const w = win.getBoundingClientRect();
    menuList.style.left = px(Math.max(0, Math.min(at.x - w.left + (side === "left" ? at.width + 4 : -164), w.width - 160)));
    menuList.style.top = px(at.y - w.top);
    menuList.hidden = false;
    if (focusFirst) menuList.querySelector<HTMLElement>("button")?.focus();
  }
  /**
   * A panel's menu (its header's ⋯ button): "Move to › Rail (left)" and "(right)", the keyboard path to the side rails
   * a drag reaches by its strips. Each is the Scene's own stop (`stops`), so its move is the drop's: the panel collapsed
   * at that side (a tile where the column shows as a rail, a header beside open panels). A side with no stop for it
   * (it is collapsed there already) is listed as unavailable.
   */
  function openPanelMenu(btn: HTMLElement, focusFirst: boolean): void {
    closeMore(false);
    const id = btn.dataset.pmenu as ItemId;
    const rails = stopsOf(id).filter((t) => t.place.kind === "rail");
    menuList.dataset.edge = "";
    delete menuList.dataset.rail;
    menuList.dataset.pmenu = id;
    menuList.setAttribute("aria-label", `${titleOf(id)} menu`);
    menuList.innerHTML = (["left", "right"] as const)
      .map((side) => {
        const t = rails.find((x) => x.place.kind === "rail" && x.place.side === side);
        return `<button type="button" role="menuitem" tabindex="-1" data-move-rail="${id}:${side}"${t ? "" : ' aria-disabled="true" title="No rail on this side for it now"'}>Move to › Rail (${side})</button>`;
      })
      .join("");
    const r = btn.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    menuList.style.left = px(Math.max(0, Math.min(r.left - w.left, w.width - 170)));
    menuList.style.top = px(r.bottom - w.top + 4);
    menuList.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if (focusFirst) menuList.querySelector<HTMLElement>("button:not([aria-disabled])")?.focus();
  }
  /** Closes the panel menu (if open), the focus back on its ⋯ button when `refocus`. */
  function closePanelMenu(refocus: boolean): void {
    const id = menuList.dataset.pmenu;
    if (!id) return;
    delete menuList.dataset.pmenu;
    menuList.hidden = true;
    const btn = layer.querySelector<HTMLElement>(`button[data-pmenu="${id}"]`);
    btn?.setAttribute("aria-expanded", "false");
    if (refocus) btn?.focus();
  }
  /** "Move to › Rail (side)": the panel collapsed into that side's rail, as a drop there does. */
  function moveToRail(id: ItemId, side: "left" | "right"): boolean {
    const t = stopsOf(id).find((x) => x.place.kind === "rail" && x.place.side === side);
    if (!t) return false;
    commit(t.after({ x: 0, y: 0 }).scene);
    say(`${titleOf(id)} collapsed into the ${side} rail. Its rail button opens it again.`);
    return true;
  }

  win.addEventListener("contextmenu", (e) => {
    const side = railSideOf(e.target as Element);
    if (!side) return;
    e.preventDefault();
    const r = (e.target as Element).closest<HTMLElement>("[data-id]")!.getBoundingClientRect();
    openRailMenu(side, { x: r.left, y: e.clientY, width: r.width, height: 0 }, false);
  });
  win.addEventListener("keydown", (e) => {
    if (!(e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) return;
    const side = railSideOf(e.target as Element);
    if (!side) return;
    e.preventDefault();
    const r = (e.target as Element).getBoundingClientRect();
    openRailMenu(side, { x: r.left, y: r.top, width: r.width, height: r.height }, true);
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

  /**
   * A floating panel's resize handle: a plain pointer drag that sets the float's rect (`resize` with the handle), so
   * the edges it doesn't drag stay put and the Scene clamps it to the panel's minimum and into the window. It runs
   * under the drag-session rules (`data-drag-session="resize"`): nothing else takes hover, and only the float changes
   * (each step is solved with the layout before). Escape puts the size back. Frozen without Alt, the handles are hidden
   * and a press does nothing.
   */
  function resizeFloat(e: PointerEvent, id: ItemId, handle: FloatHandle): void {
    const r0 = layout.items[id]?.rect;
    if (frozen() || !r0) return;
    e.preventDefault();
    const before = scene;
    const start = winPoint(e);
    root.dataset.dragSession = "resize";
    root.dataset.resizeHandle = handle;
    const moving: ResizeEdges = { left: handle.includes("left"), right: handle.includes("right"), top: handle.includes("top"), bottom: handle.includes("bottom") };
    let limits: readonly string[] = [];
    const mv = (ev: PointerEvent): void => {
      const p = winPoint(ev);
      const dx = Math.round(p.x - start.x);
      const dy = Math.round(p.y - start.y);
      const width = moving.left ? r0.width - dx : moving.right ? r0.width + dx : r0.width;
      const height = moving.top ? r0.height - dy : moving.bottom ? r0.height + dy : r0.height;
      const asked = { x: moving.left ? r0.x + dx : r0.x, y: moving.top ? r0.y + dy : r0.y, width, height };
      // The one clamp a pointer move takes (what stopped it, for the status line); `resize` commits that same rect.
      limits = fitResize(scene, id, asked, moving)?.limits ?? [];
      commit(resize(scene, id, asked, moving));
    };
    const stop = (): void => {
      unlisten();
      delete root.dataset.dragSession;
      delete root.dataset.resizeHandle;
      session.releaseInput(stop);
    };
    const up = (): void => {
      stop();
      swallowClick();
      const r = layout.items[id]?.rect;
      if (r) say(`${titleOf(id)} resized to ${Math.round(r.width)} × ${Math.round(r.height)}${limits.length ? ` (stopped by: ${limits.join(", ")})` : ""}.`);
    };
    const key = (ev: KeyboardEvent): void => {
      if (ev.type !== "keydown" || ev.key !== "Escape") return;
      stop();
      commit(before);
      say("Resize cancelled.");
    };
    session.holdInput(stop);
    const unlisten = followPointer({ move: mv, up, key });
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
      const fold = copy(id, "fold", "row", `${dots}<button type="button" class="dw-sq" title="${titleOf(id)}">»</button>`, `${BAR}px`);
      // Each compact variant as `inner` draws it: the words it keeps and its "+N" cell.
      const variants = (ROW_VARIANTS[id] ?? []).map((hides) => copy(id, "row", "row", `${dots}<div class="dw-gc">${groupContent(id, "row", hides)}</div>`, `${BAR}px`));
      out[id] = { row: size(row).width, words: widths.map(round), gap: Math.max(0, Math.round(gap)), wrapRow, lead, icons: size(iconsCol), iconsRow: size(iconsRow).width, fold: size(fold).width, variants: variants.map((v) => size(v).width) };
      for (const el of [row, wrapped, iconsCol, iconsRow, fold, ...variants]) el.remove();
    }
    return out;
  }
  /**
   * Each panel's rail title length along the rail: its name and count as `railTitle` draws them (turned), measured from a
   * hidden copy, padding and border included. Counts change it, so a count change measures again.
   */
  function measureTitles(): Record<PanelId, number> {
    const out = {} as Record<PanelId, number>;
    for (const id of PANELS) {
      const el = document.createElement("section");
      el.className = "dw-item dw-panel dw-k-rail dw-ax-column";
      el.style.cssText = "left:0;top:0;width:28px;height:max-content;visibility:hidden";
      el.innerHTML = railTitle(id, "right");
      layer.append(el);
      const b = el.querySelector<HTMLElement>(".dw-railtitle")!;
      out[id] = Math.ceil(Math.max(b.getBoundingClientRect().height, b.scrollHeight) - 0.01);
      el.remove();
    }
    return out;
  }
  setGroupSizes(measureGroups());
  setTitleSizes(measureTitles());
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
    /** The drag in progress: the held item and its targets, or null. */
    get drag(): { readonly id: ItemId; readonly targets: readonly SceneTarget[] } | null {
      return drag ? { id: drag.id, targets: drag.targets } : null;
    },
    get lastDrop(): LastDrop | null {
      return lastDrop;
    },
    get shown(): SceneTarget | null {
      return drag?.shown ?? null;
    },
    /** The held copy during a drag (its form, the morph, its elements), or none. */
    get held(): HeldInfo | null {
      const d = drag;
      if (!d) return null;
      return { formKind: d.current.formKind, axis: d.current.axis, target: d.formOf, switches: d.switches, settled: d.morph.settled, progress: d.morph.progress, pointer: d.pointer, frame: d.el, el: d.current.el };
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
      // A click before the scene was replaced doesn't pair with one after it.
      session.pause();
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
      // A count is part of its panel's rail title: measured again, the forms re-built.
      setTitleSizes(measureTitles());
      commit(reformPanels(scene));
    },
    /** How a side's rails show their panels: their titles while they fit (the default), or their tiles. Stored. */
    setRailMode,
    /** A pause between gestures (the checks): the next press is a first click, never the second of a double. */
    pause(): void {
      session.pause();
    },
    setFrozen(on: boolean): void {
      if (on) root.dataset.frozen = "";
      else delete root.dataset.frozen;
    },
    get frozen(): boolean {
      return root.dataset.frozen !== undefined;
    },
    altOn,
    /** The drag feel (`./feel`): the next drag reads it. */
    get feel(): DragFeel {
      return feel;
    },
    setFeel(next: DragFeel): void {
      feel = next;
      restingStrips();
    },
    /** The modifier keys held during a drag driven by hand (the checks). */
    keys(k: DragKeys): void {
      setKeys(k);
    },
    /** Reduced motion forced on (the checks), as `prefers-reduced-motion: reduce` does: no strip animation. */
    setReducedMotion(on: boolean): void {
      if (on) root.dataset.reducedMotion = "";
      else delete root.dataset.reducedMotion;
    },
    stripLayer,
    moveToRail,
    targets: targetsOf,
    edge: (id: EdgeId) => edgeOf(scene, id),
    press,
    open,
    close,
    toggle,
    /** The drag, driven by hand (the checks): no animation frames while `on`. */
    drive(on: boolean): void {
      session.drive(on);
    },
    begin,
    move,
    frame,
    release,
    stored: (): StoredDocwin => storeDocwin(scene),
    say,
    preview,
    grip,
    stops: stopsOf,
    pointOf,
    /** The center of `id`'s grip, in window px, or null (no grip drawn). */
    gripOf: (id: ItemId): Point | null => pointOf(win.querySelector(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`)),
    /** The drop preview the next drag uses: indicator, gap (the default) or snap. */
    get dropPreview(): DragPreview {
      return dropPreview;
    },
    setDropPreview(mode: DragPreview): void {
      dropPreview = mode;
    },
    /** The last drag's trace: what the intent showed, the snaps, every frame. */
    get trace(): DragTrace | null {
      return lastTrace;
    },
    /** Commit a scene as a change (solved with the layout before), drawn and stored. */
    commit: (next: Scene): void => void commit(next),
    /**
     * A scene loaded from elsewhere (a conformance row): its own rail drop policies, `endReach` px of end reach and the
     * intent's default tuning, until switched off (null).
     */
    hostRules(rules: { readonly endReach: number } | null): void {
      rowRules = rules;
    },
  };
}
