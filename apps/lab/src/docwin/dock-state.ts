/**
 * The document window, drawn and driven on the two libraries only:
 *
 * - the window is one `DockState` (./model); every rect drawn comes from `solve(state, { previous })`, the layout before
 *   carried along so a press or a badge change reshapes nothing;
 * - one drag session for panels and groups: `@n-uf/motion/drag`'s intent and `previewPlan` over the DockState's
 *   `targets(state, dragged)`; by default the held item is the only preview (`"item"`: it sits in a place once the room
 *   is open, else follows the pointer inside the window, and shows what a release lands on). Under the other previews
 *   the held item follows the pointer, the dashed slot comes from the shown target only (a gap's `slot`, a float's `after(point, grab)` rect, home's own rect), the other items are
 *   drawn from the shown target's `after(...).layout` once the room opens (with no target shown: the committed layout, the
 *   held item's place left empty, nothing else moving), and the drop commits `after(...).state` as is;
 * - the host contract, through the lab's one session wiring (../shared/session): while a drag is on, the root carries
 *   `data-drag-session="<kind>"` and one base CSS rule turns off hover, resize handles and selection under it; the
 *   content keeps its fit until the drop; the click after a drag's pointer-up is swallowed and focus goes back to where
 *   it was before the press;
 * - the store is `storeDockState` / `readDockState` (./store).
 */
import { clamp, clampInto, contains, type Point, type Rect } from "@n-uf/placement";
import { createSettle, SETTLE_TEMPO, type Settle } from "@n-uf/motion";
import {
  createDragIntent,
  createLandingModel,
  DRAG_DEFAULTS,
  guideRects,
  guidesOf,
  previewPlan,
  type DragIntent,
  type DragKeys,
  type DragPreview,
  type DragTuning,
  type LandingFrame,
  type LandingModel,
  type PlaceGuides,
  type PreviewMode,
} from "@n-uf/motion/drag";
import { anchoredMorph, type AnchoredMorph } from "@n-uf/motion/layout";
import {
  closeItem,
  dividers,
  dockDrag,
  fitResize,
  type EmptyLanes,
  foldItem,
  heldRect,
  markUsed,
  mergeSideColumns,
  openItem,
  raiseFloat,
  refusalTargets,
  refusals as stateRefusals,
  stops as stateStops,
  railModeOf,
  resetBetween,
  resetLengths,
  resizeBetween,
  resizeEdge as resizeEdgeOf,
  resizeFloat as resizeFloatOf,
  setRailMode as setRailModeOf,
  solve,
  SPOT_PITCH,
  targets as stateTargets,
  type DockEdge,
  type RailMode,
  type DockRegions,
  type ResizeEdges,
  type DockState,
  type DockLayout,
  type DockRefusal,
  type DockRefusalTarget,
  type DockDrop,
  type DockDrag,
  type DockLaneMark,
} from "@n-uf/docking";

/** A landing frame as the window draws it: the model's answer, its guides drawn by the drag. */
export type DrawnLandingFrame = Omit<LandingFrame, "guides"> & { readonly guides: readonly DockLaneMark[] };

/** What the drag intent picks among: the DockState's targets and its refusals (`refuse: true`, never held or shown). */
type Pick = DockDrop | DockRefusalTarget;
import { BAR, BAR_INSET, COL_MIN, COL_WIDE, DEFAULT_COUNTS, GROUPS, PANELS, RAIL, ROW_VARIANTS, TITLES, ZOOM_CONTROLS, defaultState, edgeOf, reformPanels, titleOf, setGroupSizes, setTitleSizes, withStage, type Counts, type EdgeId, type GroupId, type GroupMeasure, type ItemId, type PanelId } from "./model";
import { LADDER_IDS, isLadder, ladderMenu, ladderWords, measureLadder, setLadderSizes, type LadderId, type LadderSize } from "./ladder";
import { DEFAULT_FEEL, keyName, tuningOf, withFeel, type DragFeel } from "./feel";
import { readDocwin, storeDocwin, type StoredDocwin } from "./store";
import { createDragSession, followPointer, swallowClick } from "../shared/session";

import type { DragSettings, DropCall, LastDrop } from "./drop";
export type { LastDrop } from "./drop";

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
  /** The controls the form leaves out (`DockItemLayout.hidden`): a "+N" cell stands for them. */
  readonly hidden: readonly string[];
  readonly size: { readonly width: number; readonly height: number };
  /** A rail title's side (`DockItemLayout.railTitle`): which way it reads. */
  readonly railTitle?: "left" | "right" | undefined;
  /** A ladder group's tiers (`DockItemLayout.tiers`) when it lies along a row (`./ladder`): set for every form it takes, a fold's included. */
  readonly ladder?: LadderDraw | undefined;
}

/** How a ladder group is drawn: each shown control at its tier (a fold has none). */
type LadderDraw = { readonly tiers: Readonly<Record<string, number>> };

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

/**
 * What one frame of a drag, or its release, shows: the facts the pre-render dumps (`window.__docwin.render`). Rects in
 * window px. Under the window's own rules the region, lane and spot are the landing model's; under the published rules
 * they come from the target the drag intent shows (`spot` is its id).
 */
export interface ProbeFrame {
  readonly kind: "frame" | "release";
  /** The time the frame was driven at (the session's clock). */
  readonly now: number;
  readonly pointer: Point;
  readonly held: { readonly id: ItemId; readonly rect: Rect; readonly placed: string | null };
  readonly landing: Rect | null;
  readonly region: string;
  readonly lane: string | null;
  readonly spot: string | null;
  readonly pending: string | null;
  readonly cantGo: string | null;
  readonly guides: readonly { readonly id: string; readonly kind: string; readonly lane: string; readonly rect: Rect }[];
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
  readonly intent: DragIntent<Pick>;
  /** Its drop targets: asked again when the window changes under the drag (a resize). */
  targets: readonly DockDrop[];
  /** Where the held frame is drawn: on the pointer, or settling into the snapped slot and back (`"snap"` preview). */
  readonly drawn: Settle<Rect>;
  /** The target the held frame sits in (snap preview), or null. */
  snappedTo: string | null;
  /** The held frame is settling into a slot or back onto the pointer (not held on it 1:1). */
  gliding: boolean;
  /** This drag, frame by frame (the checks read it): the shown target's changes, the snaps, every frame. */
  readonly trace: DragTrace;
  /** Where a drop is refused (`refusals`): over one, "Can't go here" at the pointer and no slot; a release goes home. */
  readonly refusals: readonly DockRefusal[];
  /** The same refusals as the intent picks among them (`refusalTargets`): the frame's `refused` says which is under it. */
  readonly refusalTargets: readonly DockRefusalTarget[];
  readonly focus: Element | null;
  pointer: Point;
  shown: DockDrop | null;
  refused: DockRefusal | null;
  room: DockDrop | null;
  homing: boolean;
  preview: Rect | null;
  /** The modifier keys held now; Alt held at the lift (it unfreezes a frozen window) counts only once pressed again. */
  keys: DragKeys;
  altFromLift: boolean;
  /** The rail target last said armed in the live region (its id), or null. */
  armedSaid: string | null;
  /** The float key won this frame: the item floats even over docked content. */
  keyFloats: boolean;
  /** Under the landing model (`"landing"`): the model and the drag it reads (`dockDrag()`); else null. */
  landing: { model: LandingModel; drag: DockDrag } | null;
  /** Under the landing model: the layout the room is drawn from now (`shown` of the drawn frame), or null. */
  roomLayout: DockLayout | null;
  /** Under the landing model: the frame as the window draws it (the model's, with the room the window makes), or null. */
  drawnFrame: (LandingFrame & { readonly room: boolean }) | null;
  /** The last frame's facts (`ProbeFrame`), or null before the first frame. */
  probed: ProbeFrame | null;
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
  /** Each frame's shown target and the target the others make room for (the layout drawn is its `after`). */
  readonly rooms: { readonly t: number; readonly shown: string | null; readonly room: string | null }[];
}

export interface DocwinOptions {
  readonly root: HTMLElement;
  readonly win: HTMLElement;
  readonly status: HTMLElement;
  readonly storageKey: string;
  /** Called after every committed change (the page's readouts). */
  readonly onChange?: () => void;
  /** Called after every drop, once `lastDrop` says what it did (the Code view's Last move). */
  readonly onDrop?: () => void;
}

const px = (n: number): string => `${Math.round(n * 100) / 100}px`;
const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const place = (el: HTMLElement, r: Rect): void => {
  Object.assign(el.style, { left: px(r.x), top: px(r.y), width: px(r.width), height: px(r.height) });
};
const sameRect = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
/**
 * The window's drop previews, by the names its viewer and cases use: the dashed slot only (`"indicator"`), the slot and
 * the room made for it (`"gap"`), the room with the item settling into its slot (`"snap"`), or the dragged item as the
 * only preview (`"item"`).
 */
export type ViewerPreview = "indicator" | "gap" | "snap" | "item";
/** Each viewer preview as `previewPlan`'s mode: Outline, Placeholder, Glide, Snap. */
const MODE_OF: Readonly<Record<ViewerPreview, PreviewMode>> = { indicator: "outline", gap: "placeholder", snap: "glide", item: "snap" };
/** The "Can't go here" mark for a pick that lands nothing and is no refusal (past the window, a blocked place). */
const NOTHING_LANDS = "nothing-lands";
/**
 * Where things land, whatever the preview: `"landing"`, the window's own rules (no panel strip, dwell or rail key; no
 * drop collapses a panel; columns take a panel by halves; no panel menu into a rail; `heldRect` and `floatFromHeld`; no
 * toolbar tray at a column's foot and one column per side, `sideColumns: "one"`), with where the item lands kept by
 * `@n-uf/motion/drag`'s landing model over `@n-uf/docking`'s `lanes()`; or `"published"`, the libraries'
 * defaults on the drag intent, which the older cases and the conformance rows check. The preview only changes how the
 * landing is shown.
 */
export type Behavior = "published" | "landing";
/** A panel column as a drop place takes panels only: no toolbar tray at its foot (a toolbar stored there stays drawn). */
const withoutTray = (e: DockEdge): DockEdge => {
  const { zoneAccepts: _tray, ...rest } = e;
  return { ...rest, accepts: e.accepts.filter((k) => k !== "group") };
};
/** A side edge that takes panels: a column, not a rail. */
const isPanelColumn = (e: DockEdge): boolean => (e.side === "left" || e.side === "right") && !e.compact && e.accepts.includes("panel");
/** The edge with its gaps split by halves over its open panels (`hitBand: "middle"`), or with the default band. */
const withHalves = (e: DockEdge, halves: boolean): DockEdge => {
  const { hitBand: _was, ...rest } = e;
  return halves ? { ...rest, hitBand: "middle" } : rest;
};

const docks = (t: DockDrop | null): boolean => !!t && (t.place.kind === "gap" || t.place.kind === "column" || t.place.kind === "rail");
const commits = (t: DockDrop | null): boolean => !!t && t.place.kind !== "home" && t.place.kind !== "none";

/** How far the first and last gaps of a bar reach past its ends. */
const END_REACH = BAR_INSET;

/** A floating panel's resize handles: its four edges and four corners. */
type FloatHandle = "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-right" | "bottom-left";
const FLOAT_HANDLES: readonly FloatHandle[] =["top", "right", "bottom", "left", "top-left", "top-right", "bottom-right", "bottom-left"];

export type Docwin = ReturnType<typeof createDocwin>;

export function createDocwin(o: DocwinOptions) {
  const { root, win, status } = o;
  // An empty window until the groups are measured (below, before the first state is built).
  let state: DockState = { stage: { x: 0, y: 0, width: 0, height: 0 }, edges: [], items: {}, floats: [], floatKinds: [] };
  let layout: DockLayout = solve(state);
  let counts: Counts = { ...DEFAULT_COUNTS };
  let drag: Held | null = null;
  /** The layout the window draws now (during a drag, the room's layout) and the item left out of it (the held one). */
  let drawnNow: { layout: DockLayout; hidden: ItemId | undefined } = { layout, hidden: undefined };
  /** The pre-render's listener: told every frame of a drag and its release (`ProbeFrame`). */
  let probe: ((f: ProbeFrame) => void) | null = null;
  /** The pre-render's listener for the key frames of a check that plays no drag (`keyFrame`). */
  let keyFrames: ((note: string) => void) | null = null;
  let lastDrop: LastDrop | null = null;
  /** The last drag's trace (the drag in progress, or the one before). */
  let lastTrace: DragTrace | null = null;
  /**
   * The drop preview, by the viewer's names (`ViewerPreview`), each mapped to a `PreviewMode` of `@n-uf/motion/drag`'s
   * `previewPlan`: the dragged item as the only preview (`"item"`, the library's `"snap"`, what this window does), or
   * for the cases that exercise the library's other modes, the dashed slot only (`"indicator"`, its `"outline"`), the
   * slot and the room made for it (`"gap"`, its `"placeholder"`), or the room with the item settling into its slot
   * (`"snap"`, its `"glide"`).
   */
  let dropPreview: ViewerPreview = "item";
  /** Where things land (`Behavior`): the window's own rules for the viewer; a case may ask for the published ones. */
  let behavior: Behavior = "landing";
  /** The window's own rules, on the landing model. */
  const approved = (): boolean => behavior === "landing";
  /** The viewer's place guides per mode (`PlaceGuides`); a mode left out follows its default (`PLACE_GUIDES_DEFAULT`). */
  let guidesByMode: Partial<Record<PreviewMode, PlaceGuides>> = {};
  /** How the guides draw an empty lane (`EmptyLanes`): at its real size (the default) or as a thin edge. */
  let emptyLanes: EmptyLanes = "real";
  /** The pitch of the spots over a bar's or a toolbar rail's free stretches, px (`DockLaneOptions.pitch`). */
  let pitch = SPOT_PITCH;
  /**
   * How a bar's or a toolbar rail's free stretches take a toolbar (`DockLaneOptions.stretchPositions`): `"free"` (the lab's
   * default), where the hand holds it, snapped within `snapDistance`; `"pitched"`, a spot every `pitch` px.
   */
  let stretchPositions: "free" | "pitched" = "free";
  /** Under `"free"`, how near a stretch's end or the item's own place a landing snaps there, px; unset, docking's default. */
  let snapDistance: number | undefined;
  /**
   * The preview `previewPlan` reads: under the window's own rules a mode and the viewer's guides for it; under the
   * published rules, and for the libraries' glide, no guides.
   */
  const previewOf = (): DragPreview => {
    const mode = MODE_OF[dropPreview];
    if (!approved() || dropPreview === "snap") return { mode, placeGuides: "off" };
    const g = guidesByMode[mode];
    return g ? { mode, placeGuides: g } : { mode };
  };
  /** The press, the frames and the session mark: the lab's one wiring (../shared/session). */
  const session = createDragSession({ root, point: (e) => winPoint(e), frame: (now) => frame(now) });
  let pageKey = "";
  /** The drag feel (`./feel`): read by every drag's targets and tuning. */
  let feel: DragFeel = DEFAULT_FEEL;

  win.innerHTML = `
    <div class="dw-edges"></div>
    <div class="dw-scroll" tabindex="0" aria-label="Pages"><div class="dw-sheets"></div></div>
    <div class="dw-keep-clear" aria-hidden="true"></div>
    <div class="dw-items"></div>
    <div class="dw-dividers"></div>
    <div class="dw-resize" data-resize="left" title="Drag to change the column's width"></div>
    <div class="dw-resize" data-resize="right" title="Drag to change the column's width"></div>
    <div class="dw-strips" aria-hidden="true"></div>
    <div class="dw-guides" aria-hidden="true"></div>
    <div class="dw-slot" hidden><span class="dw-slot-label"></span></div>
    <div class="dw-cant-go" hidden>Can't go here</div>
    <div class="dw-menu-list" role="menu" hidden></div>`;
  const q = <T extends HTMLElement>(sel: string): T => win.querySelector(sel) as T;
  const edgeLayer = q<HTMLDivElement>(".dw-edges");
  const keepClearLayer = q<HTMLDivElement>(".dw-keep-clear");
  const layer = q<HTMLDivElement>(".dw-items");
  const dividerLayer = q<HTMLDivElement>(".dw-dividers");
  const scroll = q<HTMLDivElement>(".dw-scroll");
  const sheets = q<HTMLDivElement>(".dw-sheets");
  const slot = q<HTMLDivElement>(".dw-slot");
  const stripLayer = q<HTMLDivElement>(".dw-strips");
  const guideLayer = q<HTMLDivElement>(".dw-guides");
  const slotLabel = q<HTMLSpanElement>(".dw-slot-label");
  const cantGo = q<HTMLDivElement>(".dw-cant-go");
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
    // Under the window's own rules a panel docks in a column or floats: the menu, whose only rows are "Move to › Rail", isn't made.
    const menu = approved() ? "" : `<button type="button" class="dw-pm" data-pmenu="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="${titleOf(id)} menu">⋯</button>`;
    return `<header class="dw-head" data-grip><span class="dw-dots" aria-hidden="true"></span><b>${titleOf(id)}</b>${c === null ? "" : badge(c)}${menu}<button type="button" class="dw-x" data-close="${id}" aria-label="Close ${titleOf(id)}">×</button></header>`;
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
        return `<button type="button" class="dw-w dw-word" data-toggle="${p}" aria-pressed="${!state.items[p]?.closed}">${TITLES[p]}${c}</button>`;
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
  const moreCell = (id: ItemId, hidden: readonly string[], count = hidden.length): string =>
    hidden.length === 0
      ? ""
      : `<button type="button" class="dw-more" data-more="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="${count} more ${esc(titleOf(id))} controls"><span class="dw-chev" aria-hidden="true">»</span><span class="dw-cnt" aria-hidden="true">${count}</span></button>`;

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
            return `<button type="button" class="dw-sq dw-sq-n" data-toggle="${p}" aria-pressed="${!state.items[p]?.closed}" title="${TITLES[p]}${n === null ? "" : ` ${n}`}">${TITLES[p][0]!}${n === null ? "" : `<small>${n}</small>`}</button>`;
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

  /**
   * A ladder group's row (`./ladder`) from its layout: the grip, then each control but the hidden ones at its tier, then
   * the » cell listing exactly them; its `fold` form is the grip and that cell alone.
   */
  function ladderInner(id: LadderId, kind: string, draw: LadderDraw, hidden: readonly string[]): string {
    const dots = '<span class="dw-dots" data-grip aria-hidden="true"></span>';
    const more = moreCell(id, hidden, ladderMenu(id, hidden, counts).length);
    if (kind === "fold") return dots + more;
    return `${dots}<div class="dw-gc">${wordRow(id, ladderWords(id, draw.tiers, hidden, counts, (c) => !state.items[c]?.closed))}${more}</div>`;
  }

  /** How to draw `id` when it is a ladder group lying along a row (a column's forms are the window's own). */
  const ladderOf = (id: ItemId, p: { readonly axis: string; readonly tiers?: Readonly<Record<string, number>> | undefined }): LadderDraw | undefined => (isLadder(state, id) && p.axis === "row" ? { tiers: p.tiers ?? {} } : undefined);

  function inner(id: ItemId, kind: string, rows?: readonly (readonly number[])[], hidden: readonly string[] = [], titleSide?: "left" | "right", ladder?: LadderDraw): string {
    const it = state.items[id]!;
    if (ladder) return ladderInner(id as LadderId, kind, ladder, hidden);
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

  function itemHtml(l: DockLayout, id: ItemId): string {
    const p = l.items[id]!;
    const region = p.floating ? "float" : (p.edge ?? "none");
    const cls = `dw-item dw-${p.kind} dw-k-${p.formKind} dw-ax-${p.axis}${p.floating ? " dw-float" : ""}`;
    const r = p.rect;
    // A floating open panel takes resize handles on its four edges and corners (a toolbar's size comes from its forms).
    const handles = p.floating && p.kind === "panel" && p.formKind === "open" ? FLOAT_HANDLES.map((h) => `<div class="dw-fh" data-fh="${h}" aria-hidden="true"></div>`).join("") : "";
    return `<section class="${cls}" data-id="${id}" data-kind="${p.kind}" data-form="${p.formKind}" data-region="${region}" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.width)};height:${px(r.height)}">${inner(id, p.formKind, p.rows, p.hidden, p.railTitle, ladderOf(id, p))}${handles}</section>`;
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
  function draw(s: DockState, l: DockLayout, hide?: ItemId, refit = false): void {
    drawnNow = { layout: l, hidden: hide };
    win.style.width = px(s.stage.width);
    win.style.height = px(s.stage.height);
    // Every edge the layout has (this window's, or any state's): a bar's or a column's background.
    edgeLayer.innerHTML = Object.entries(l.edges)
      .filter(([, e]) => e.rect.width > 0 && e.rect.height > 0)
      .map(([id, e]) => `<div class="${e.side === "left" || e.side === "right" ? "dw-colbg" : "dw-bar"}" data-edge="${esc(id)}" style="left:${px(e.rect.x)};top:${px(e.rect.y)};width:${px(e.rect.width)};height:${px(e.rect.height)}"></div>`)
      .join("");
    place(scroll, l.content);
    // The overlay strips anchored to the content, where this layout resolves them (`DockLayout.keepClear`).
    keepClearLayer.innerHTML = (l.keepClear ?? [])
      .map((c) => `<div class="dw-strip-over" data-keep-clear="${esc(c.id ?? "")}" data-for="${c.for}" style="left:${px(c.rect.x)};top:${px(c.rect.y)};width:${px(c.rect.width)};height:${px(c.rect.height)}"></div>`)
      .join("");
    if (refit || pageKey === "") drawPages(l.content);
    for (const side of ["left", "right"] as const) {
      const el = q<HTMLDivElement>(`[data-resize=${side}]`);
      const e = l.edges[side];
      el.hidden = !e || e.cross <= RAIL;
      if (e) place(el, { x: side === "left" ? e.rect.x + e.rect.width - 3 : e.rect.x - 3, y: e.rect.y, width: 6, height: e.rect.height });
    }
    const docked: string[] = [];
    for (const id of Object.keys(l.items) as ItemId[]) if (id !== hide && !l.items[id]!.floating && !l.items[id]!.inMenu) docked.push(itemHtml(l, id));
    // Floats in their stacking order, the last on top.
    const floats = l.floats.filter((id) => id !== hide).map((id) => itemHtml(l, id as ItemId));
    const menus = Object.keys(l.edges).flatMap((e) => {
      const m = l.edges[e]?.menu;
      return m ? [`<button type="button" class="dw-menu" data-edge="${e}" title="${esc(m.items.map((id) => titleOf(id)).join(", "))}" style="left:${px(m.rect.x)};top:${px(m.rect.y)};width:${px(m.rect.width)};height:${px(m.rect.height)}">» ${m.items.length}</button>`] : [];
    });
    layer.innerHTML = docked.join("") + menus.join("") + floats.join("");
    drawDividers(s, l);
  }

  /** The grab zone over a divider, px across its line. */
  const DIVIDER_HIT = 8;
  /**
   * The dividers between neighboring open panels (`dividers(state, layout)`), each a thin strip centered on the line the
   * library gives, a grab zone over it. None while a drag holds an item (the layout drawn is then the room's).
   */
  function drawDividers(s: DockState, l: DockLayout): void {
    const keep = new Set<string>();
    for (const d of drag ? [] : dividers(s, l)) {
      const key = JSON.stringify([d.before, d.after]);
      keep.add(key);
      let el = dividerEls.get(key);
      if (!el) {
        el = document.createElement("div");
        el.className = "dw-divider";
        el.setAttribute("data-divider", "");
        el.setAttribute("role", "separator");
        el.tabIndex = 0;
        el.title = "Drag to trade length between the two panels; double-click for their natural split, Shift+double-click for the column's";
        dividerEls.set(key, el);
        dividerLayer.append(el);
      }
      const side = l.edges[d.edge]?.side;
      const across = side === "left" || side === "right";
      el.dataset.edge = d.edge;
      el.dataset.before = d.before;
      el.dataset.after = d.after;
      el.dataset.across = String(across);
      el.setAttribute("aria-orientation", across ? "horizontal" : "vertical");
      place(
        el,
        across
          ? { x: d.rect.x, y: d.rect.y + d.rect.height / 2 - DIVIDER_HIT / 2, width: d.rect.width, height: DIVIDER_HIT }
          : { x: d.rect.x + d.rect.width / 2 - DIVIDER_HIT / 2, y: d.rect.y, width: DIVIDER_HIT, height: d.rect.height },
      );
      // The value is how long the panel before it is drawn; the limits are where the divider's `range` takes it.
      const r = l.items[d.before]?.rect;
      const now = r ? (across ? r.height : r.width) : 0;
      el.setAttribute("aria-valuenow", String(Math.round(now)));
      el.setAttribute("aria-valuemin", String(Math.round(now + d.range.min)));
      el.setAttribute("aria-valuemax", String(Math.round(now + d.range.max)));
    }
    for (const [key, el] of dividerEls) {
      if (keep.has(key)) continue;
      el.remove();
      dividerEls.delete(key);
    }
  }
  /** The divider elements by pair, kept between draws: a redraw updates one in place and never replaces a node. */
  const dividerEls = new Map<string, HTMLElement>();

  // --- committing ------------------------------------------------------------------------------------------------

  function store(): void {
    try {
      localStorage.setItem(o.storageKey, JSON.stringify(storeDocwin(state)));
    } catch {
      // No storage: the page works, a reload starts over.
    }
  }

  /**
   * Commit a state: solved with the layout before as `previous` (a press reshapes nothing), drawn and stored. `fresh`
   * solves without it (true), or without it for the edges listed (an opened panel takes its largest form that fits).
   */
  function commit(next: DockState, opts: { fresh?: boolean | EdgeId[] } = {}): DockLayout {
    // A "+N" popover belongs to the form it was opened from: any change redraws the items, and closes it.
    closeMore(false);
    state = next;
    let previous: DockLayout | undefined = layout;
    if (opts.fresh === true) previous = undefined;
    else if (Array.isArray(opts.fresh)) {
      const drop = new Set<string>(opts.fresh);
      previous = { ...layout, edges: Object.fromEntries(Object.entries(layout.edges).filter(([id]) => !drop.has(id))) };
    }
    layout = solve(state, previous ? { previous } : {});
    // During a drag (the window resized under it) the held item stays drawn by the drag, and its targets are asked again.
    draw(state, layout, drag?.id, !previous || layout.notes.some((n) => n.code === "content-changed"));
    if (drag) {
      // The room is drawn again from the new targets on the next frame; the intent clamps onto the window as it is now.
      drag.room = null;
      drag.intent.setBounds(state.stage);
      // Under the landing model its regions again (spots map by id, the new state answers for a held spot), and the
      // targets from them: one generation; under the published rules, the targets again.
      if (drag.landing) {
        // The new state's geometry, handed over whole: one drag, one previous (the layout committed now).
        const next = dragOf(drag.id, drag.grab);
        drag.landing.drag = next;
        drag.landing.model.setGeometry(next);
        drag.roomLayout = null;
        drag.targets = targetsFrom(next.regions);
      } else drag.targets = targetsOf(drag.id, drag.grab);
    }
    restingStrips();
    store();
    o.onChange?.();
    return layout;
  }

  const edgeHolding = (id: ItemId): EdgeId | null => (state.edges.find((e) => e.items.includes(id))?.id as EdgeId | undefined) ?? null;

  // --- actions -----------------------------------------------------------------------------------------------------

  /** A grip's double-click: folded by hand, or unfolded (`foldItem`); only its own edge reflows. */
  function toggleFold(id: ItemId): void {
    const it = state.items[id];
    if (!it) return;
    const on = !((it.from ?? 0) >= 1);
    const next = foldItem(state, id, on);
    if (next === state) return;
    commit(next);
    say(`${titleOf(id)} ${on ? "folded" : "unfolded"}. Double-click its grip again to ${on ? "unfold" : "fold"} it.`);
  }

  /** A press on a header: the item counts as just used. With the layout before, nothing moves. */
  function press(id: ItemId): void {
    commit(markUsed(state, id));
  }
  /**
   * Open a panel (a Views word, a rail icon or title): newest, and its edge solved afresh so it takes its largest form
   * that fits. A panel shown but folded by hand (in a rail) unfolds; a closed one comes back as it was.
   */
  function open(id: ItemId): void {
    const e = edgeHolding(id);
    const it = state.items[id];
    const s = it && !it.closed && (it.from ?? 0) >= 1 ? foldItem(state, id, false) : openItem(state, id);
    commit(markUsed(s, id), { fresh: e ? [e] : [] });
    say(`${titleOf(id)} opened.`);
  }
  function close(id: ItemId): void {
    commit(closeItem(state, id));
    say(`${titleOf(id)} closed. Its Views word opens it again.`);
  }
  const toggle = (id: ItemId): void => (state.items[id]!.closed ? open(id) : close(id));
  /** A side's rails show their panels' titles (while they fit) or their tiles: `rails[side].mode`, stored. */
  function setRailMode(side: "left" | "right", mode: RailMode): void {
    const next = setRailModeOf(state, side, mode);
    if (next === state) return;
    commit(next);
    say(`The ${side} rail shows ${mode === "titles" ? "the panels' titles while they fit" : "icons"}.`);
  }

  // The drag feel: the rail drop policies per kind go into the state the targets read; the tuning into each drag.
  // A state loaded from elsewhere (a conformance row, `hostRules`) keeps its own rail drop policies and the rows' end
  // reach, and drags with the intent's default tuning.
  let rowRules: { readonly endReach: number } | null = null;
  const ruled = (): DockState => {
    if (rowRules) return state;
    const { foldedColumnDrop: _was, ...plain } = withFeel(state, feel);
    const own = approved();
    // A panel column's gaps over an open panel: by halves (`hitBand: "middle"`: the upper half puts it above, the lower
    // half below), so a column takes a panel along its whole length; the published behavior keeps the band about each line.
    // Under the window's own rules a column takes panels only (no tray) and a side has one column (`sideColumns`).
    const felt: DockState = { ...plain, edges: plain.edges.map((e) => (isPanelColumn(e) ? (own ? withoutTray(withHalves(e, true)) : withHalves(e, false)) : e)) };
    // A panel keeps its state: no drop collapses it, and collapsed titles take it at one place. On a bar the item goes to
    // the zone whose landing is nearest the pointer (`barZones`).
    return own ? { ...felt, foldedColumnDrop: "end", sideColumns: "one", barZones: "nearest" } : felt;
  };
  /** The tuning of a drag: under the window's own rules, Shift floats any item; a rail has no key of its own. */
  const tuningFor = (kind: string): Partial<DragTuning> => {
    if (rowRules) return {};
    const t = tuningOf(feel, kind);
    return approved() ? { ...t, modifiers: { ...DRAG_DEFAULTS.modifiers, on: true } } : t;
  };
  const reachOf = (): { previous: DockLayout; endReach: number; floatFromHeld: boolean } => ({ previous: layout, endReach: rowRules?.endReach ?? END_REACH, floatFromHeld: approved() });
  /** The settings a drag's `lanes()` / `targets()` calls run with now (what the Code view writes out). */
  const dragSettings = (): DragSettings => ({ endReach: reachOf().endReach, floatFromHeld: approved(), stretchPositions, pitch, snapDistance, emptyLanes });
  /** A drag's targets; with the press's `grab`, cut by the same aim order as its lanes (`aimCut`). */
  const targetsOf = (id: ItemId, grab?: Point): DockDrop[] => stateTargets(ruled(), id, { ...reachOf(), ...(grab ? { grab } : {}) });
  const refusalsOf = (id: ItemId): DockRefusal[] => stateRefusals(ruled(), id, reachOf());
  const stopsOf = (id: ItemId): DockDrop[] => stateStops(ruled(), id, reachOf());
  /**
   * The drag of `id` (`dockDrag()` over the window's own rules, the layout committed now as its one `previous`): its
   * regions for hit-testing and the one layout of each held place, which the window draws and a release commits. With the
   * press's `grab`, so a toolbar brought back to where it was pressed lands on its own place, and the viewer's stretch
   * positions (free: a sliding spot per free stretch; pitched: spots at the pitch).
   */
  function dragOf(id: ItemId, grab: Point): DockDrag {
    return dockDrag(ruled(), id, { ...reachOf(), grab, emptyLanes, pitch, stretchPositions, snapDistance });
  }
  /** The drag's targets from its lanes (one generation): every spot's drop, once by id, and the float. */
  function targetsFrom(regions: DockRegions): DockDrop[] {
    const byId = new Map<string, DockDrop>();
    for (const l of regions.lanes) for (const s of l.spots) if (!byId.has(s.target.id)) byId.set(s.target.id, s.target);
    if (regions.float) byId.set(regions.float.id, regions.float);
    return [...byId.values()];
  }
  /** A landing model for a drag of `id` grabbed at `grab`, starting at the item's own place. */
  function landingFor(id: ItemId, grab: Point): NonNullable<Held["landing"]> {
    const drag = dragOf(id, grab);
    // The drag is the model's geometry as it is (its regions, `home`, `landingOf`, `spotsOf`); the preview, the one
    // `previewPlan` reads, names the guide level.
    return { model: createLandingModel({ ...drag, preview: previewOf() }), drag };
  }

  /**
   * The side rails' drop strips: while a panel is held, each rail target's strip (`whileDragging`); with `always`, also
   * at rest (the strips a docked panel's drag would offer). The one dwelt on is highlighted (`arming`), the armed one
   * grown by its magnet (`armed`); under reduced motion it grows with no animation.
   */
  function drawStrips(list: readonly DockDrop[], arming: string | null, armed: DockDrop | null): void {
    const seen = new Map<string, DockDrop>();
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
  /** The guides now: none fades the ones shown out (at once under reduced motion); a set is drawn by `drawMarks`. */
  function drawGuides(list: readonly { id: string; r: Rect; kind: "line" | "box" | "hatch"; lane?: string }[]): void {
    if (list.length > 0) return drawMarks(list);
    guideLanes = "";
    for (const el of guideLayer.children) el.toggleAttribute("data-off", true);
  }

  /**
   * The landing model's guides, keyed by their ids: a line between items, a dashed box over a free stretch, neutral
   * and apart from the landing's look. One that comes fades in, one that goes fades out (120 ms; at once under reduced
   * motion), and one that stays is moved, never redrawn, so nothing blinks.
   */
  /** The lanes the guides drawn now belong to: a change of them fades; a hop within them swaps at once. */
  let guideLanes = "";
  function drawMarks(list: readonly { id: string; r: Rect; kind: "line" | "box" | "hatch"; lane?: string }[]): void {
    const now = performance.now();
    const lanesNow = [...new Set(list.map((g) => g.lane ?? ""))].sort().join();
    const fade = lanesNow !== guideLanes;
    guideLanes = lanesNow;
    const els = new Map(([...guideLayer.children] as HTMLElement[]).map((el) => [el.dataset.guide ?? "", el]));
    const keep = new Set<string>();
    for (const g of list) {
      keep.add(g.id);
      let el = els.get(g.id);
      const fresh = !el;
      if (!el) {
        el = guideLayer.appendChild(document.createElement("div"));
        el.className = "dw-guide";
        el.dataset.guide = g.id;
        // Fading in only with a new lane; within the same lane it is there at once.
        el.toggleAttribute("data-off", fade);
      }
      el.dataset.kind = g.kind;
      delete el.dataset.offAt;
      delete el.dataset.line;
      if (g.kind === "line") el.dataset.line = g.r.width <= g.r.height ? "v" : "h";
      place(el, g.r);
      if (fresh && fade) void el.offsetWidth;
      el.removeAttribute("data-off");
    }
    for (const [id, el] of els) {
      if (keep.has(id)) continue;
      // Within the same lane a guide that goes goes at once; leaving a lane fades.
      if (!fade) el.remove();
      else if (!el.dataset.offAt) {
        el.dataset.offAt = String(now);
        el.toggleAttribute("data-off", true);
      } else if (now - Number(el.dataset.offAt) > 200) el.remove();
    }
  }

  /**
   * The guides to draw this frame: the drag's (`guides(frame)`: each lane's marks in the layout of the held place it names,
   * which already leave out every item drawn there and the landing), with only the host's cosmetics added: inside the
   * window, a box inset 2 px, a line 2 px across the lane, the thin kinds kept clear of the panels' content.
   */
  function guidesNow(drawn: readonly DockLaneMark[], held: Held | null = null, heldLane: string | null = null): { id: string; r: Rect; kind: "line" | "box" | "hatch"; lane: string }[] {
    if (drawn.length === 0) return [];
    // 2 px clear of the window's edges and corners, measured from the window's inside (its 1 px border takes the
    // stage's last px each side), and a thin strip clear of the panels' content (`guideRects`, below).
    const stage = state.stage;
    const inW = win.clientWidth > 0 ? win.clientWidth : stage.width;
    const inH = win.clientHeight > 0 ? win.clientHeight : stage.height;
    const inside: Rect = { x: stage.x, y: stage.y, width: Math.min(stage.width, inW), height: Math.min(stage.height, inH) };
    // The panels' content, in window px: each docked panel's body less its padding (what this host calls content).
    const origin = win.getBoundingClientRect();
    const content: Rect[] = [...win.querySelectorAll<HTMLElement>("section.dw-panel .dw-body")].flatMap((b) => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const l = parseFloat(cs.paddingLeft) || 0;
      const t = parseFloat(cs.paddingTop) || 0;
      const w = r.width - l - (parseFloat(cs.paddingRight) || 0);
      const h = r.height - t - (parseFloat(cs.paddingBottom) || 0);
      return w > 0 && h > 0 ? [{ x: r.left - origin.left + l, y: r.top - origin.top + t, width: w, height: h }] : [];
    });
    // Inside the window: boxes clipped, thin guides moved in whole and kept clear of the panels' content (a boundary a
    // thin edge may run flush against: `clearance: 0`, for the thin kinds only). A box keeps no clear of it: an empty
    // lane's real-size box lies over the content it moves aside.
    // The held copy's accent outline (1 px outside its rect, `.dw-held[data-placed]`) is this host's chrome: a guide keeps
    // 2 px clear of it in the held lane, and gives way only where the copy lies over it elsewhere. A cosmetic clear: the
    // drag's marks already leave out every item and the landing.
    const textClear: { rect: Rect; clearance: number; kinds: readonly ("line" | "box" | "hatch")[] }[] = content.map((rect) => ({ rect, clearance: 0, kinds: ["line", "hatch"] }));
    // The overlay strips as the window draws them now (the layout on screen): a drawing trim only, every guide kind flush
    // against one for every target. A strip for floats only constrains no lane guide: the float's own landing is the
    // held copy, which the drag already fits clear of it in the drop's layout.
    for (const c of drawnNow.layout.keepClear ?? []) if (c.for === "all") textClear.push({ rect: c.rect, clearance: 0, kinds: ["line", "hatch", "box"] });
    const copy = held ? [{ rect: held.drawn.value, clearance: heldLane ? 3 : 0 }, ...(held.preview ? [{ rect: held.preview, clearance: 2 }] : [])] : [];
    const place = (gs: readonly DockLaneMark[], clear: readonly { rect: Rect; clearance: number }[]) =>
      guideRects(
        gs.map((g) => ({ id: g.id, lane: g.lane, kind: g.kind, rect: g.rect })),
        { inside, inset: 2, clear: [...textClear, ...clear] },
      ).map(({ rect, ...g }) => ({ ...g, r: rect }));
    const bare = copy.map((c) => ({ ...c, clearance: 0 }));
    return [...place(drawn.filter((g) => g.lane === heldLane), copy), ...place(drawn.filter((g) => g.lane !== heldLane), bare)];
  }

  /** At rest, with `always`: the strips a docked panel's drag would offer, one per side. */
  function restingStrips(): void {
    if (drag) return;
    if (feel.panel.railVisibility !== "always") return drawStrips([], null, null);
    const found: DockDrop[] = [];
    for (const id of PANELS) {
      if (!layout.items[id] || layout.items[id]!.floating || state.items[id]?.closed) continue;
      for (const t of targetsOf(id)) if (t.strip && !found.some((x) => x.place.kind === "rail" && t.place.kind === "rail" && x.place.side === t.place.side)) found.push(t);
      if (found.length >= 2) break;
    }
    drawStrips(found, null, null);
  }

  /**
   * A refused place is never drawn: only "Can't go here" at the pointer, kept inside the window. `id` is the host
   * contract's mark: the refusal said there, or `NOTHING_LANDS` for a pick that lands nothing; null hides it.
   */
  function sayCantGo(id: string | null, p: Point): void {
    cantGo.hidden = !id;
    if (id) cantGo.dataset.dragRefusal = id;
    else delete cantGo.dataset.dragRefusal;
    if (!id) return;
    const at = clampInto({ x: p.x + 12, y: p.y + 12, width: cantGo.offsetWidth, height: cantGo.offsetHeight }, state.stage);
    cantGo.style.left = px(at.x);
    cantGo.style.top = px(at.y);
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
    const key = `${spec.formKind}|${spec.axis}|${JSON.stringify(spec.rows ?? null)}|${spec.hidden.join(",")}|${spec.railTitle ?? ""}|${JSON.stringify(spec.ladder ?? null)}|${Math.round(w)}x${Math.round(h)}`;
    const had = forms.get(key);
    if (had) return had;
    const el = document.createElement("section");
    el.className = `dw-item dw-${kind} dw-k-${spec.formKind} dw-ax-${spec.axis}`;
    el.innerHTML = inner(id, spec.formKind, spec.rows, spec.hidden, spec.railTitle, spec.ladder);
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
  function formAt(d: Held, t: DockDrop): FormSpec | null {
    const a = t.after(d.pointer, d.grab);
    const it = a.layout.items[d.id];
    if (!it || it.inMenu || (it.floating && t.place.kind !== "float")) return null;
    return { formKind: it.formKind, axis: it.axis, rows: it.rows, hidden: it.hidden, size: it.rect, railTitle: it.railTitle, ladder: ladderOf(d.id, it) };
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
  function drawHeld(d: Held, now: number, slot: Rect | null, speed: number, free: Rect | null = null): void {
    const dt = Math.max(0, now - d.last);
    d.morph.step(dt);
    d.last = now;
    // With the item as the only preview it is never cut off: wholly inside the window, on the pointer where it fits; a
    // float that would land elsewhere than the pointer (`free`, clear of what floats avoid) is drawn where it lands.
    const followed = d.morph.rectAt(d.pointer);
    const onPointer = approved() ? (free ?? heldRect(state, d.id, followed, d.pointer, { x: d.pointer.x - followed.x, y: d.pointer.y - followed.y })) : followed;
    // Into the slot, or out of it back to the pointer, on the settle; on the pointer, held 1:1.
    if (slot) d.gliding = true;
    if (d.gliding) {
      d.drawn.setTarget(slot ?? onPointer);
      d.drawn.step(dt);
      if (!slot && d.drawn.settled) d.gliding = false;
    } else d.drawn.jumpTo(onPointer);
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
    if (drag || frozen() || state.items[id]?.fixed) return false;
    const was = layout.items[id];
    if (!was) return false;
    const grab = { x: start.x - was.rect.x, y: start.y - was.rect.y };
    // Under the window's own rules one generation per lift: the landing model's lanes give the targets and refusals too.
    const landing0 = approved() ? landingFor(id, grab) : null;
    const targets = landing0 ? targetsFrom(landing0.drag.regions) : targetsOf(id, grab);
    // The held copy: a frame (the morph's box, its anchor on the pointer) holding each form's content.
    const el = document.createElement("div");
    el.className = `dw-held dw-morph dw-${was.kind}`;
    el.dataset.dragHeld = id;
    place(el, { x: p.x - grab.x, y: p.y - grab.y, width: was.rect.width, height: was.rect.height });
    win.append(el);
    const forms = new Map<string, HeldForm>();
    const homeForm = heldForm(el, forms, id, was.kind, { formKind: was.formKind, axis: was.axis, rows: was.rows, hidden: was.hidden, size: was.rect, ladder: ladderOf(id, was) }, null);
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
    const refused0 = landing0 ? landing0.drag.regions.refusals : refusalsOf(id);
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
      // The lift zone is about the press (the grip): back there, a pause arms no strip ("changed my mind"). The intent
      // clamps the pointer onto the window (the stage) itself.
      intent: createDragIntent<Pick>({ home, lift: start, bounds: state.stage, tuning: tuningFor(was.kind) }),
      targets,
      drawn: createSettle<Rect>({ x: p.x - grab.x, y: p.y - grab.y, width: was.rect.width, height: was.rect.height }, { omega: SETTLE_TEMPO.default }),
      snappedTo: null,
      gliding: false,
      trace: (lastTrace = { log: [], snaps: [], frames: [], rooms: [] }),
      refusals: refused0,
      refusalTargets: refusalTargets(refused0),
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
      keyFloats: false,
      landing: landing0,
      roomLayout: null,
      drawnFrame: null,
      probed: null,
    };
    liftKeys = {};
    // No target shown yet: the committed layout, the held item's place left empty, nothing else moving.
    draw(state, layout, id);
    say(`${titleOf(id)}: drop on ${was.kind === "panel" ? "a column" : "a bar or a rail"} to dock it, anywhere else to float it.`);
    session.started(was.kind, now);
    return true;
  }

  /**
   * The dashed slot at `r`: a landing's one mark, under every rule set, never an insertion line beside it. The host
   * contract's marks: a slot where a drop commits carries `data-drag-slot` and `data-drag-target="<target id>"`
   * (`target`); the "Back to its place" slot over home carries neither (a drop there commits nothing).
   */
  function showSlot(r: Rect | null, text = "", target?: string): void {
    slot.toggleAttribute("data-drag-slot", !!r && target !== undefined);
    if (r && target !== undefined) slot.dataset.dragTarget = target;
    else delete slot.dataset.dragTarget;
    if (!r) {
      slot.hidden = true;
      return;
    }
    place(slot, r);
    // Under the window's own rules the outline has no words: its place says it. Under the published ones a thin slot (a
    // rail's, 30 px) can't hold the label: it goes to the slot's title (shown on hover) and stays inside.
    const words = approved() ? "" : text;
    const thin = r.width < 90;
    slotLabel.textContent = thin ? "" : words;
    slot.title = words;
    slot.hidden = false;
  }

  const labelOf = (t: DockDrop): string => {
    const p = t.place;
    if (p.kind === "gap") return `${p.edge} · ${p.zone} ${p.at}`;
    if (p.kind === "rail" && t.arm) return `collapse into the ${p.side} rail`;
    if (p.kind === "column" || p.kind === "rail") return `new ${p.kind} ${p.side} ${p.ring}`;
    return p.kind;
  };
  /** Where a drop put the item, in the window's words: docked in which bar, column or rail, floating. */
  const outcomeOf = (t: DockDrop): string => {
    const p = t.place;
    if (p.kind === "float") return "floats";
    if (p.kind === "column") return `docked in a new ${p.side} column`;
    if (p.kind === "rail") return `collapsed into the ${p.side} rail`;
    if (p.kind === "gap") {
      const e = state.edges.find((x) => x.id === p.edge);
      const where = !e ? "its place" : e.compact ? `the ${e.side} rail` : e.side === "top" || e.side === "bottom" ? (e.id === "title" ? "the title bar" : `the ${e.side} bar`) : `the ${e.side} column`;
      return `docked in ${where}`;
    }
    return "moved";
  };

  /**
   * The point a refusal is looked up at: the pointer clamped into the window (the stage), as the drag intent clamps it
   * itself (its `bounds`), so a pointer past the window's edge means the edge itself, which belongs only to the targets
   * drawn against it (no refusal and no float holds it). The held copy still follows the pointer itself.
   */
  const pickPoint = (d: Held): Point => {
    const s = state.stage;
    return { x: clamp(d.pointer.x, s.x, s.x + s.width), y: clamp(d.pointer.y, s.y, s.y + s.height) };
  };

  /**
   * What an engine says for one frame, and all the frame pipeline (`frame`) draws from: the target shown and the one the
   * item settles into (snap), the room and whether it is back over its own place, the target whose form it takes, where
   * the item sits (or floats, drawn there), whether it sits placed, the refusal under it and the "Can't go here" mark,
   * the outline (a target and its rect), and the place guides.
   */
  interface Look {
    readonly shown: DockDrop | null;
    readonly snapTo: DockDrop | null;
    readonly aiming: boolean;
    readonly room: DockDrop | null;
    readonly homing: boolean;
    readonly over: DockDrop | null;
    readonly sits: Rect | null;
    readonly free: Rect | null;
    readonly placed: boolean;
    readonly refused: DockRefusal | null;
    readonly cantGo: string | null;
    readonly outline: { readonly target: DockDrop; readonly rect: Rect | null } | null;
    /** Under the landing model: the layout the room is drawn from (`shown` of the drawn frame), else absent. */
    readonly roomLayout?: DockLayout | null;
    /** The place guides, worked out last (from the item, its room and its landing as drawn this frame). */
    readonly guides: () => readonly { id: string; r: Rect; kind: "line" | "box" | "hatch"; lane?: string }[];
  }

  /**
   * One frame of the drag: the engine's look (the landing model under the window's own rules, the drag intent under the
   * published ones), drawn by one pipeline.
   */
  function frame(now: number): void {
    const d = drag;
    if (!d) return;
    const k = d.landing ? landingLook(d, d.landing, now) : intentLook(d, now);
    const onlyItem = dropPreview === "item";
    // The trace: each change of the shown target, of the slot the held item sits in (snap), and every frame's room.
    if ((k.shown?.id ?? null) !== (d.trace.log.at(-1)?.id ?? null)) d.trace.log.push({ id: k.shown?.id ?? null, t: now });
    if ((k.snapTo?.id ?? null) !== d.snappedTo) {
      d.snappedTo = k.snapTo?.id ?? null;
      d.trace.snaps.push({ id: d.snappedTo, t: now, flying: !k.snapTo && !k.aiming });
    }
    d.trace.rooms.push({ t: now, shown: k.shown?.id ?? null, room: k.room?.id ?? null });
    followForm(d, k.over, onlyItem);
    drawHeld(d, now, k.sits, d.intent.state.speed, onlyItem ? k.free : null);
    d.el.toggleAttribute("data-placed", k.placed);
    drawRoom(d, k.room, k.homing, k.roomLayout ?? null);
    d.shown = k.shown;
    d.refused = k.refused;
    sayCantGo(k.refused?.id ?? k.cantGo, d.pointer);
    // What says where it lands: the item itself (Snap), else the outline; nothing over a refusal.
    const s = k.outline?.target ?? null;
    if (onlyItem) {
      d.preview = k.sits ?? k.free;
      showSlot(null);
    } else if (k.refused) {
      d.preview = null;
      showSlot(null);
    } else if (k.homing || s?.place.kind === "home") {
      d.preview = layout.items[d.id]?.rect ?? null;
      showSlot(d.preview, "Back to its place");
    } else if (!s || s.place.kind === "none" || !k.outline!.rect) {
      d.preview = null;
      showSlot(null);
    } else if (s.place.kind === "float") {
      d.preview = k.outline!.rect;
      showSlot(d.preview, "Float", s.id);
    } else {
      d.preview = k.outline!.rect;
      showSlot(d.preview, labelOf(s), s.id);
    }
    const guides = k.guides();
    drawGuides(guides);
    if (probe) probe((d.probed = probeOf(d, k, guides, now)));
  }

  /** This frame's facts for the pre-render: the held item as drawn, where a release lands, the place and the marks. */
  function probeOf(d: Held, k: Look, guides: ReturnType<Look["guides"]>, now: number): ProbeFrame {
    const lf = d.landing?.model.frame ?? null;
    const p = k.shown?.place;
    const region = lf ? lf.region : k.refused ? "refused" : p?.kind === "float" ? "open" : p?.kind === "home" ? "home" : docks(k.shown) ? "lane" : "nowhere";
    const lane = lf ? lf.lane : p?.kind === "gap" ? p.edge : p?.kind === "column" || p?.kind === "rail" ? `${p.kind}:${p.side}` : null;
    const spot = lf ? lf.spot : (k.shown?.id ?? null);
    const rect = d.drawn.value;
    return {
      kind: "frame",
      now,
      pointer: { x: d.pointer.x, y: d.pointer.y },
      held: { id: d.id, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, placed: k.placed ? spot : null },
      landing: (lf ? lf.landing : d.preview) ?? null,
      region,
      lane,
      spot,
      pending: lf?.pending ?? null,
      cantGo: k.refused?.id ?? k.cantGo ?? null,
      guides: guides.map((g) => ({ id: g.id, kind: g.kind, lane: g.lane ?? "", rect: g.r })),
    };
  }

  /**
   * The published rules' look: the drag intent says what shows (its refusals picked among the targets), the preview
   * plan whether the room is open; the side rails' strips drawn, their armed state said. No place guides.
   */
  function intentLook(d: Held, now: number): Look {
    const picked = d.intent.update(d.pointer, now, [...d.targets, ...d.refusalTargets], d.keys);
    const f = { ...picked, shown: picked.shown as DockDrop | null, arming: picked.arming as DockDrop | null };
    const plan = previewPlan(f, previewOf());
    const onlyItem = dropPreview === "item";
    d.keyFloats = f.forced === "float";
    const armed = f.shown && f.shown.place.kind === "rail" ? f.shown : null;
    drawStrips(onlyItem ? [] : d.targets, f.arming?.id ?? null, armed);
    if ((armed?.id ?? null) !== d.armedSaid) {
      d.armedSaid = armed?.id ?? null;
      if (armed && armed.place.kind === "rail") say(`${titleOf(d.id)}: release to collapse it into the ${armed.place.side} rail${f.forced === "armed" ? ` (${keyName(feel.panel.modifiers.armKey)} held)` : ""}.`);
      else if (f.arming) say(`${titleOf(d.id)} over the ${f.arming.place.kind === "rail" ? f.arming.place.side : ""} rail: hold still to collapse it there.`);
    }
    const homing = f.atHome && d.docked && f.shown === null;
    const snapTo = plan.snapItem && docks(f.shown) && f.shown!.slot ? f.shown! : null;
    const s = plan.showIndicator ? f.shown : null;
    return {
      shown: f.shown,
      snapTo,
      aiming: f.aiming,
      room: plan.makeRoom && docks(f.shown) ? f.shown : null,
      homing,
      over: (plan.showIndicator || plan.snapItem) && docks(f.shown) && !homing ? f.shown : null,
      sits: snapTo?.slot ?? (onlyItem && homing ? (layout.items[d.id]?.rect ?? null) : null),
      free: null,
      placed: false,
      // A key held wins over geometry: the intent reports no refusal then.
      refused: !homing && f.refused ? (f.refused as DockRefusalTarget).refusal : null,
      cantGo: null,
      outline: s ? { target: s, rect: s.place.kind === "float" ? (s.after(d.pointer, d.grab).layout.items[d.id]?.rect ?? null) : (s.slot ?? null) } : null,
      guides: () => [],
    };
  }

  /**
   * A toolbar group held over a target takes the form the drop there gives it (row, wrap, icons down a rail or along a
   * bar); off every target (`over` null), the form it was lifted in. One switch per target change, the grip under the
   * pointer.
   */
  function followForm(d: Held, over: DockDrop | null, onlyItem: boolean): void {
    const follows = d.kind === "group" || onlyItem ? (over?.id ?? null) : null;
    if (follows === d.formOf) return;
    d.formOf = follows;
    const spec = over && follows ? formAt(d, over) : null;
    switchForm(d, spec ? heldForm(d.el, d.forms, d.id, d.kind, spec, d.fromGrip) : d.homeForm);
  }

  /**
   * The whole preview: every item drawn from the room's layout after its drop (C22); with no room, the committed layout
   * with the held item's place left empty and nothing else moving (a release there commits nothing). Drawn again only
   * when the room or the homing changes.
   */
  function drawRoom(d: Held, room: DockDrop | null, homing: boolean, roomLayout: DockLayout | null = null): void {
    // Under the landing model the room is the layout the drag says the frame draws (`shown`), drawn again whenever it changes.
    if (room?.id === d.room?.id && homing === d.homing && roomLayout === d.roomLayout) return;
    d.room = room;
    d.homing = homing;
    d.roomLayout = roomLayout;
    if (room) {
      if (roomLayout) draw(state, roomLayout, d.id);
      else {
        const after = room.after(d.pointer, d.grab);
        draw(after.state, after.layout, d.id);
      }
    } else draw(state, layout, d.id);
  }

  /** A spot of the drag's lanes by id (hit-testing data, as seen). */
  function spotOf(L: NonNullable<Held["landing"]>, id: string): DockRegions["lanes"][number]["spots"][number] | null {
    for (const l of L.drag.regions.lanes) for (const s of l.spots) if (s.id === id) return s;
    return null;
  }

  /** The target a landing frame or release lands on: the held spot's drop, the float, or none. */
  function landingTarget(L: NonNullable<Held["landing"]>, region: string, spot: string | null): DockDrop | null {
    if (region === "lane" && spot) return spotOf(L, spot)?.target ?? null;
    if (region === "open") return L.drag.regions.float;
    return null;
  }

  /**
   * The window's own rules' look, on the landing model: the model says the region, the spot and where a release lands; the mode
   * (`previewPlan`) says how it shows: Outline the dashed slot at the landing, Placeholder the slot with the room open,
   * Snap the item itself settling there with the room open. The place guides are the model's (the held lane's marks,
   * kept through the drag, hidden with Shift), drawn apart from the landing. The drag intent runs alongside only for the
   * pointer's speed and aim (the trace, and "Can't go here" waiting while a hand passes over docked content).
   */
  function landingLook(d: Held, L: NonNullable<Held["landing"]>, now: number): Look {
    const motion = d.intent.update(d.pointer, now, [...d.targets, ...d.refusalTargets], d.keys);
    const mf = L.model.update(d.pointer, now, d.keys);
    const spot = mf.region === "lane" && mf.spot ? spotOf(L, mf.spot) : null;
    const target = landingTarget(L, mf.region, mf.spot);
    // Every spot lands where the frame says (`landingOf` its held place: a sliding one at the hand), and is home where the
    // model's release says so (the item's own spot, landing where it lies). (At the frame's own point a release
    // samples nothing: it reads the frame.)
    const spotLanding = spot ? mf.landing : null;
    const rel = spot ? L.model.release(d.pointer, now, d.keys) : null;
    const homing = !!rel && rel.kind === "spot" && rel.home;
    const shown = target && !homing ? target : null;
    const plan = previewPlan({ shown, room: mf.room && !homing }, previewOf());
    const onlyItem = dropPreview === "item";
    d.keyFloats = mf.shift;
    drawStrips([], null, null);
    const docking = docks(shown);
    const snapTo = plan.snapItem && docking ? shown : null;
    const floats = mf.region === "open" ? L.drag.regions.float : null;
    // The room the window draws: a docked state's one layout. (Over the document, the one-preview model keeps the window
    // as committed until the release.)
    const room = plan.makeRoom && docking ? shown : null;
    // The frame as the window draws it: the room open where the window makes one (not for a float, nor in Outline).
    const drawn = { ...mf, room: room !== null };
    d.drawnFrame = drawn;
    const floatAt = floats ? mf.landing : null;
    const sits = snapTo && spot ? spotLanding : onlyItem && homing ? (layout.items[d.id]?.rect ?? null) : null;
    // A refused place: the refusal under the pointer, if any, else nothing lands there; past the window, nothing lands.
    const p = pickPoint(d);
    const refusal = mf.region === "refused" && !mf.pending ? (d.refusals.find((r) => (r.hits ?? [r.hit]).some((h) => contains(h, p, 0))) ?? null) : null;
    const nothing = mf.region === "refused" || mf.region === "nowhere";
    // Over docked content the message waits for the pointer to aim, so a pass across a column doesn't flash it.
    const passing = !refusal && mf.region === "refused" && !motion.aiming;
    // The outline (Outline, Placeholder): of the float where it lands, or of the spot's landing.
    const outline = !plan.showIndicator || homing ? null : floats && floatAt ? { target: floats, rect: floatAt } : shown && spot && spotLanding ? { target: shown, rect: spotLanding } : null;
    return {
      shown,
      snapTo,
      aiming: motion.aiming,
      room,
      homing,
      // The held form follows what a release lands on (a toolbar's row, icons down a rail; a float's own form), in every
      // mode alike: a mode changes only the preview. The landing's own margins keep it from flipping at a lane's edge.
      over: floats ?? (docking ? shown : null),
      sits,
      free: floatAt,
      placed: !!sits,
      refused: refusal,
      // Never inside a lane not yet entered (`pending`: an empty rail's strip before its slow step): that is no refused place.
      cantGo: nothing && !passing && !mf.pending ? NOTHING_LANDS : null,
      outline,
      // The room, when the window makes one: the layout the drag says the frame draws (else the window stays as committed).
      roomLayout: room ? L.drag.shown(drawn) : null,
      // Each lane's marks in the layout the frame draws (`shown(drawn)`), with the host's cosmetics.
      guides: () => guidesNow(L.drag.guides(drawn), d, mf.lane),
    };
  }

  function move(p: Point): void {
    if (drag) drag.pointer = p;
  }

  /** What the page shows now: during a drag, the shown target's layout after its drop; with none, the held item's place empty. */
  function preview(): DockLayout {
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
    if (layout.items[id]?.floating && layout.floats[layout.floats.length - 1] !== id) commit(raiseFloat(state, id));
  }

  /** Let go (or cancel): the drop commits the shown target's `after(...).state` as is. */
  function release(now = performance.now(), cancel = false): LastDrop | null {
    const d = drag;
    if (!d) return null;
    if (!cancel) frame(now);
    // A release over a refusal commits nothing: the item goes home.
    const refused = cancel ? null : d.refused;
    const r = d.landing && !cancel ? d.landing.model.release(d.pointer, now, d.keys) : null;
    const slid = !!r && r.kind === "spot" && !!d.landing && !!spotOf(d.landing, r.spot)?.slide;
    // Under the landing model the release commits its held place's one layout (`after`): what the frame drew.
    const landedAfter = !cancel && !refused && d.landing && r ? d.landing.drag.after(r) : null;
    const t =
      cancel || refused
        ? null
        : d.landing
          ? r?.kind === "spot"
            ? // On a sliding spot at the item's own place nothing changes.
              r.home && slid
              ? null
              : landingTarget(d.landing, "lane", r.spot)
            : r?.kind === "float"
              ? d.landing.drag.regions.float
              : null
          : (d.intent.release(d.pointer, now, [...d.targets, ...d.refusalTargets], d.keys) as DockDrop | null);
    drag = null;
    // The frames, the session mark and the press's own listeners go with the drag: a reset mid-drag leaves none behind.
    session.ended();
    d.el.remove();
    showSlot(null);
    drawGuides([]);
    sayCantGo(null, d.pointer);
    restingStrips();
    const id = d.id;
    let preview = d.preview;
    const go = commits(t);
    if (go) {
      const after = landedAfter ?? t!.after(d.pointer, d.grab);
      if (!preview) preview = after.layout.items[id]?.rect ?? null;
      commit(after.state);
    } else draw(state, layout);
    const landed = go ? (layout.items[id]?.rect ?? null) : null;
    // The calls this drop made, as the Code view writes them out: the drag's options, the lane and spot, the commit.
    const onSpot = r?.kind === "spot" ? r : null;
    const call: DropCall = {
      via: d.landing ? "lanes" : "targets",
      settings: dragSettings(),
      pointer: { ...d.pointer },
      grab: { ...d.grab },
      lane: onSpot?.lane ?? null,
      spot: onSpot?.spot ?? null,
      slides: slid,
      // On a sliding spot, where the committed landing starts along its lane.
      at: slid && landedAfter?.landing ? (d.landing!.drag.regions.lanes.find((l) => l.id === onSpot!.lane)?.axis === "y" ? landedAfter.landing.y : landedAfter.landing.x) : null,
      target: t?.id ?? null,
      placeOf: t?.place ?? null,
      refusal: refused?.id ?? null,
      home: !cancel && !refused && (d.homing || t?.place.kind === "home" || (!!onSpot && onSpot.home && slid)),
    };
    lastDrop = { id, target: t?.id ?? refused?.id ?? null, place: t?.place.kind ?? null, preview: go ? preview : t?.place.kind === "home" || d.homing ? d.preview : null, landed, committed: go, cancelled: cancel, call };
    if (go && preview && landed && !sameRect(preview, landed)) say(`${titleOf(id)} ${outcomeOf(t!)}, but not where it was shown.`);
    else if (go) say(`${titleOf(id)} ${outcomeOf(t!)}.`);
    else say(cancel ? "Cancelled: back where it was." : d.homing || t?.place.kind === "home" ? "Back in its place." : "Can't go here: back where it was.");
    if (d.focus instanceof HTMLElement && d.focus.isConnected) d.focus.focus({ preventScroll: true });
    // The release as the pre-render sees it: after the drop, the item where it landed (or home), the guides gone.
    if (probe && d.probed) probe({ ...d.probed, kind: "release", now, held: { id, rect: landed ?? layout.items[id]?.rect ?? d.probed.held.rect, placed: go ? (d.probed.spot ?? "float") : null }, guides: [] });
    o.onDrop?.();
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
    const dv = t.closest<HTMLElement>("[data-divider]");
    if (dv) return resizeDivider(e, dv);
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
          // A double-click on a grip folds it, or unfolds it, frozen or not: a fold is the person's own press, like
          // minimising, and frozen only stops things moving (it isn't a click either).
          swallowClick();
          // On a rail item the first click has unfolded it already (a click opens it): the double only makes sure.
          if (!t.closest("[data-open]") || (state.items[id]?.from ?? 0) >= 1) toggleFold(id);
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
    // A ladder group lists the buttons of each hidden control (a pair lists both); another group lists its hidden ids.
    const entries = isLadder(state, id) ? ladderMenu(id as LadderId, hidden, counts) : hidden.map((c) => ({ id: c, label: controlLabel(id, c), control: c, act: id === "zoom" ? `data-zoom="${esc(c)}"` : undefined }));
    menuList.innerHTML = entries
      .map((e) => `<button type="button" role="menuitem" tabindex="-1" data-hidden-control="${esc(e.id)}" data-control="${esc(e.control)}"${e.act ? ` ${e.act}` : ""}>${esc(e.label)}</button>`)
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
      commit(state);
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
    const now = railModeOf(state, side);
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
   * a drag reaches by its strips. Each is the DockState's own stop (`stops`), so its move is the drop's: the panel collapsed
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
    if (approved()) return false;
    const t = stopsOf(id).find((x) => x.place.kind === "rail" && x.place.side === side);
    if (!t) return false;
    commit(t.after({ x: 0, y: 0 }).state);
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

  /**
   * A divider, the canonical wiring (what a kit mirrors). A drag: each frame is the state at the press moved by the pointer's
   * distance from the press, `resizeBetween(pressState, before, after, delta, { layout: pressLayout })`, committed. Double-click:
   * `resetBetween` (Shift: `resetLengths` of its edge). Arrow keys: a step (Shift: more), Home and End: the divider's `range`
   * (`dividers(state, layout)`). A change that leaves the state as it is commits nothing, and a redraw updates the divider's
   * element in place (never replaces it), so a jitter between the clicks of a double-click keeps its target and the focus
   * stays. The drag holds the pointer (`setPointerCapture`) and ends on `pointerup`, `pointercancel` or
   * `lostpointercapture`, whichever comes first.
   */
  function resizeDivider(e: PointerEvent, el: HTMLElement): void {
    const { before, after } = el.dataset;
    if (frozen() || !before || !after) return;
    e.preventDefault();
    const along = (p: { clientX: number; clientY: number }): number => (el.dataset.across === "true" ? p.clientY : p.clientX);
    const press = { state, layout, at: along(e) };
    const mv = (ev: PointerEvent): void => change(resizeBetween(press.state, before, after, along(ev) - press.at, { layout: press.layout }));
    const ends = ["pointerup", "pointercancel", "lostpointercapture"] as const;
    const end = (): void => {
      el.removeEventListener("pointermove", mv);
      for (const t of ends) el.removeEventListener(t, end);
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointermove", mv);
    for (const t of ends) el.addEventListener(t, end);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that isn't active (a synthetic event): the events are dispatched at the divider all the same.
    }
  }
  /** Commit `next` unless it is the state as it is: nothing changed, nothing redrawn. */
  function change(next: DockState): void {
    if (next !== state) commit(next);
  }
  win.addEventListener("dblclick", (e) => {
    const dv = (e.target as HTMLElement).closest<HTMLElement>("[data-divider]");
    if (!dv || frozen()) return;
    change(e.shiftKey ? resetLengths(state, dv.dataset.edge!) : resetBetween(state, dv.dataset.before!, dv.dataset.after!, { layout }));
  });
  win.addEventListener("keydown", (e) => {
    const dv = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-divider]");
    if (!dv || frozen()) return;
    const { before, after } = dv.dataset;
    const d = dividers(state, layout).find((x) => x.before === before && x.after === after);
    const [less, more] = dv.dataset.across === "true" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    const step = e.shiftKey ? 48 : 16;
    const delta = !d ? null : e.key === less ? -step : e.key === more ? step : e.key === "Home" ? d.range.min : e.key === "End" ? d.range.max : null;
    if (delta === null) return;
    e.preventDefault();
    change(resizeBetween(state, before!, after!, delta, { layout }));
  });

  /** The column's resize edge: a plain pointer drag that sets the user's size across (`resizeEdge`). */
  function resizeEdge(e: PointerEvent, side: "left" | "right"): void {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = layout.edges[side]?.cross ?? 240;
    const mv = (ev: PointerEvent): void => {
      const dx = (ev.clientX - x0) * (side === "left" ? 1 : -1);
      commit(resizeEdgeOf(state, side, Math.round(Math.min(COL_WIDE, Math.max(COL_MIN, w0 + dx)))));
    };
    const up = (): void => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  /**
   * A floating panel's resize handle: a plain pointer drag that sets the float's rect (`resizeFloat` with the handle), so
   * the edges it doesn't drag stay put and the DockState clamps it to the panel's minimum and into the window. It runs
   * under the drag-session rules (`data-drag-session="resize"`): nothing else takes hover, and only the float changes
   * (each step is solved with the layout before). Escape puts the size back. Frozen without Alt, the handles are hidden
   * and a press does nothing.
   */
  function resizeFloat(e: PointerEvent, id: ItemId, handle: FloatHandle): void {
    const r0 = layout.items[id]?.rect;
    if (frozen() || !r0) return;
    e.preventDefault();
    const before = state;
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
      // The one clamp a pointer move takes (what stopped it, for the status line); `resizeFloat` commits that same rect.
      limits = fitResize(state, id, asked, moving)?.limits ?? [];
      commit(resizeFloatOf(state, id, asked, moving));
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
      const why: Record<string, string> = { min: "its smallest size", max: "its largest size", region: "the window", docked: "what is docked" };
      if (r) say(`${titleOf(id)} resized to ${Math.round(r.width)} × ${Math.round(r.height)}${limits.length ? ` (stopped by ${limits.map((k) => why[k] ?? k).join(", ")})` : ""}.`);
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
      commit(defaultState(state.stage), { fresh: true });
      return [];
    }
    let data: unknown = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    const r = readDocwin(data);
    // Under the window's own rules a side has one column: a stored second one merges into it, in order, here as it is
    // read, so what is stored next is what is shown and what a drag reads (`mergeSideColumns`).
    commit(approved() ? mergeSideColumns(r.state) : r.state, { fresh: true });
    return r.dropped;
  }

  // --- measuring -------------------------------------------------------------------------------------------------

  /**
   * Each group's sizes, from its buttons as the page renders them (hidden copies of its forms, each at its own content
   * size): the one-row width and its words' widths, a wrapped row's height, the vertical icons form's width and height,
   * the bar icons and fold widths. The state's items hug what is drawn.
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
  state = defaultState();
  layout = solve(state);
  /** The ladder groups' control lengths per tier (./ladder), from hidden copies of the row as `ladderInner` draws it. */
  setLadderSizes(
    Object.fromEntries(
      LADDER_IDS.map((id) => [
        id,
        measureLadder(id, (tiers, hidden) => {
          const el = document.createElement("section");
          el.className = "dw-item dw-group dw-k-row dw-ax-row";
          el.dataset.id = id;
          el.style.cssText = `left:0;top:0;width:max-content;height:${BAR}px;visibility:hidden`;
          el.innerHTML = ladderInner(id, "row", { tiers }, hidden);
          layer.append(el);
          return el;
        }),
      ]),
    ) as Record<LadderId, LadderSize>,
  );

  return {
    get state(): DockState {
      return state;
    },
    get layout(): DockLayout {
      return layout;
    },
    get counts(): Counts {
      return counts;
    },
    get dragging(): boolean {
      return drag !== null;
    },
    /** The drag in progress: the held item and its targets, or null. */
    get drag(): { readonly id: ItemId; readonly targets: readonly DockDrop[] } | null {
      return drag ? { id: drag.id, targets: drag.targets } : null;
    },
    get lastDrop(): LastDrop | null {
      return lastDrop;
    },
    /** The page's Reset: the window starts over, so there is no last move to show. */
    forgetDrop(): void {
      lastDrop = null;
      o.onDrop?.();
    },
    /** The state as a drag reads it: the stored state plus the window's drag rules (`ruled()`). */
    get dragState(): DockState {
      return ruled();
    },
    /** The settings a drag's `lanes()` / `targets()` calls run with now. */
    get dragSettings(): DragSettings {
      return dragSettings();
    },
    /** The layout drawn now (during a drag the room's, without the held item) and the held item left out of it. */
    get drawn(): { readonly layout: DockLayout; readonly hidden: ItemId | undefined } {
      return drawnNow;
    },
    /** The pre-render listens to every frame of a drag and its release; null stops it. */
    setProbe(fn: ((f: ProbeFrame) => void) | null): void {
      probe = fn;
    },
    /** The pre-render listens to the key frames a check marks with `keyFrame`; null stops it. */
    setKeyFrames(fn: ((note: string) => void) | null): void {
      keyFrames = fn;
    },
    /** A check that plays no drag (a window being resized) marks the window as drawn now as a key frame of its case. */
    keyFrame(note: string): void {
      keyFrames?.(note);
    },
    /** The landing model's own frame now (its guides naming lanes and states), and the drag it reads, or null. */
    get landingModel(): { readonly id: ItemId; readonly pointer: Point; readonly frame: LandingFrame; readonly drag: DockDrag; readonly previous: DockLayout } | null {
      const d = drag;
      const L = d?.landing;
      return d && L ? { id: d.id, pointer: d.pointer, frame: d.drawnFrame ?? L.model.frame, drag: L.drag, previous: layout } : null;
    },
    /** The landing model's frame now (under `"landing"`, during a drag), its guides drawn by the drag, or null. */
    get landingFrame(): DrawnLandingFrame | null {
      const L = drag?.landing;
      const f = drag?.drawnFrame ?? L?.model.frame;
      return L && f ? { ...f, guides: L.drag.guides(f) } : null;
    },
    get shown(): DockDrop | null {
      return drag?.shown ?? null;
    },
    /** The held copy during a drag (its form, the morph, its elements), or none. */
    get held(): HeldInfo | null {
      const d = drag;
      if (!d) return null;
      return { formKind: d.current.formKind, axis: d.current.axis, target: d.formOf, switches: d.switches, settled: d.morph.settled, progress: d.morph.progress, pointer: d.pointer, frame: d.el, el: d.current.el };
    },
    /** The refusal under the pointer during a drag ("Can't go here"), or none. */
    get refused(): DockRefusal | null {
      return drag?.refused ?? null;
    },
    refusals: refusalsOf,
    win,
    root,
    layer,
    scroll,
    slot,
    load,
    /** Replace the state (a preset): solved afresh. */
    setState(next: DockState): void {
      if (drag) release(performance.now(), true);
      // A click before the state was replaced doesn't pair with one after it.
      session.pause();
      commit(next, { fresh: true });
    },
    reset(size?: { width: number; height: number }): void {
      if (drag) release(performance.now(), true);
      counts = { ...DEFAULT_COUNTS };
      pageKey = "";
      commit(defaultState(size ?? { width: state.stage.width, height: state.stage.height }), { fresh: true });
    },
    setSize(width: number, height: number): void {
      commit(withStage(state, { width, height }));
    },
    setCount(k: keyof Counts, v: number): void {
      counts[k] = v;
      pageKey = "";
      // A count is part of its panel's rail title: measured again, the forms re-built.
      setTitleSizes(measureTitles());
      commit(reformPanels(state));
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
    // A drag's targets, held where a press on the item's grip holds it (as the cases drive a drag), unless `grab` says.
    targets: (id: ItemId, grab?: Point): DockDrop[] => {
      const g = pointOf(win.querySelector(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`));
      const r = layout.items[id]?.rect;
      return targetsOf(id, grab ?? (g && r ? { x: g.x - r.x, y: g.y - r.y } : undefined));
    },
    edge: (id: EdgeId) => edgeOf(state, id),
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
    stored: (): StoredDocwin => storeDocwin(state),
    say,
    preview,
    grip,
    stops: stopsOf,
    pointOf,
    /** The center of `id`'s grip, in window px, or null (no grip drawn). */
    gripOf: (id: ItemId): Point | null => pointOf(win.querySelector(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`)),
    /** The drop preview the next drag uses: how the landing is shown (item, the default; indicator; gap; snap). */
    get dropPreview(): ViewerPreview {
      return dropPreview;
    },
    setDropPreview(mode: ViewerPreview): void {
      dropPreview = mode;
    },
    /** The place guides a mode draws (`null`: its default), and the ones the current mode draws now. */
    setPlaceGuides(mode: PreviewMode, g: PlaceGuides | null): void {
      const { [mode]: _was, ...rest } = guidesByMode;
      guidesByMode = g ? { ...rest, [mode]: g } : rest;
    },
    get placeGuides(): PlaceGuides {
      return guidesOf(previewOf());
    },
    /** How the guides draw an empty lane: at its real size or as a thin striped edge (every mode alike). */
    get emptyLanes(): EmptyLanes {
      return emptyLanes;
    },
    setEmptyLanes(v: EmptyLanes): void {
      emptyLanes = v;
    },
    /** The pitch of the free-stretch spots, px (`SPOT_PITCH` by default). */
    get pitch(): number {
      return pitch;
    },
    setPitch(v: number): void {
      pitch = Number.isFinite(v) ? Math.min(200, Math.max(8, Math.round(v))) : SPOT_PITCH;
    },
    /** How free stretches take a toolbar: `"free"` (the lab's default) or `"pitched"`. */
    get stretchPositions(): "free" | "pitched" {
      return stretchPositions;
    },
    setStretchPositions(v: "free" | "pitched"): void {
      stretchPositions = v === "pitched" ? "pitched" : "free";
    },
    /** Under `"free"`, the snap distance, px, or undefined: docking's default. */
    get snapDistance(): number | undefined {
      return snapDistance;
    },
    setSnapDistance(v: number | undefined): void {
      snapDistance = v !== undefined && Number.isFinite(v) ? Math.min(40, Math.max(0, Math.round(v))) : undefined;
    },
    /** Where things land (`Behavior`): the window's own rules (the default) or, for a case, the published ones. */
    get behavior(): Behavior {
      return behavior;
    },
    setBehavior(b: Behavior): void {
      if (b === behavior) return;
      behavior = b;
      // A panel's header follows: its menu exists only under the published rules.
      closePanelMenu(false);
      if (!drag) draw(state, layout);
    },
    /** The last drag's trace: what the intent showed, the snaps, every frame. */
    get trace(): DragTrace | null {
      return lastTrace;
    },
    /** Commit a state as a change (solved with the layout before), drawn and stored. */
    commit: (next: DockState): void => void commit(next),
    /**
     * A state loaded from elsewhere (a conformance row): its own rail drop policies, `endReach` px of end reach and the
     * intent's default tuning, until switched off (null).
     */
    hostRules(rules: { readonly endReach: number } | null): void {
      rowRules = rules;
    },
  };
}
