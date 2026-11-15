/**
 * `solve(scene, { previous })`: the whole window's layout from one scene.
 *
 * 1. **The cut.** Reserved edges cut the stage from the outside in: first the full-span bars (top, then bottom, each
 *    by ring), across the stage's whole width; then the columns (left, then right, by ring), down the height the full
 *    bars left; then the `between` bars, across the width the columns left. What remains is `content`. Overlay edges
 *    are cut the same way from a copy of the content, so they lie over it without shortening it.
 * 2. **Each edge is a stack** (`fitStack`): a column along the height it gets, a bar along the width, with each item's
 *    `forms.column` or `forms.row`. Items are taken in zone order (start, center, end); `fixed` items keep their form;
 *    closed items take no room. In a column, group forms take their own width (`ownCross`). The edge's thickness is
 *    the stack's cross size; an edge with nothing in it takes none.
 * 3. **Rail and size.** A column in which nothing sets the width is a rail: its items with a `rail` form are re-solved
 *    in it and listed as `tabs` (closed ones too with `railShowsClosed`). Otherwise, with `Edge.size`, the column is
 *    re-solved at the user's size, clamped to `[max(cross.min, the widest open setter's cross.min), cross.max]`.
 * 4. **Zones.** When the items leave spare length (nothing grows), start items pack from the start, end items from the
 *    end (before the » entry) and center items sit centred on the edge's middle, moved only as far as they must to
 *    stay between the other two zones.
 * 5. **Floats** are fitted inside the stage, clear of every docked item (fixed ones and » entries included), every bar
 *    and the chrome rects (`fitFloat`). An anchored float sits flush with that side or corner of `content` first. A
 *    float with `from` over 0 is its bar: its form's natural length along its `orient`, its other size kept.
 *
 * 6. **Dynamic columns** (`Edge.column`, on a side with `Scene.rails[side]`): while the content is narrower than
 *    `contentMin.width` (after `inset` and a `gutter` after each side edge and rail), they shrink toward their minimum
 *    (the edge's `cross.min` and the widest open setter's), then fold whole into their side's one rail, unkept before
 *    kept, the oldest newest use first, the outer first, the left first. A column whose members are all folded by hand
 *    goes to the rail too, or with `handFold: "ride"` and one member it rides as a title bar over the side's first open
 *    column, at its width, taking none. The rail lies just outside the side's first column, its segments (each member's
 *    `rail` form) in ring order.
 *
 * `previous` (the layout before) gives each edge's fits to `fitStack` as `previous`, so a change of ages alone (a press)
 * changes no rect; columns folded or shrunk by give-way stay so while the content still fits, and room coming back
 * unfolds them in the reverse of give-way order. Pure: the same scene always lays out the same.
 */
import { rect, type Rect } from "../geometry";
import { fitFloat } from "../stack/floats";
import { fitStack } from "../stack/layout";
import { formCrossMin, formMain, formSetsCross, wrapLines, type StackFit, type StackForm, type StackInput, type StackItem } from "../stack/model";
import { axisOf, floatShape, formsOf, pastWrap, zoneOf, type Edge, type FloatAnchor, type Scene, type SceneEdgeLayout, type SceneItem, type SceneItemLayout, type SceneLayout, type SceneNote, type SceneRailLayout, type SolveOptions, type Zone } from "./model";

const EPS = 1e-6;
const finite = (x: number | undefined, fallback: number): number => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
const px = (x: number | undefined): number => Math.max(0, finite(x, 0));

/** The order edges are cut in: full bars (top, bottom), columns (left, right), between bars (top, bottom); each by ring. */
export function cutOrder(edges: readonly Edge[]): Edge[] {
  const phase = (e: Edge): number => (e.side === "left" || e.side === "right" ? 1 : e.span === "between" ? 2 : 0);
  const sideRank = (e: Edge): number => (e.side === "top" || e.side === "left" ? 0 : 1);
  return edges
    .map((e, i) => ({ e, i }))
    .sort((a, b) => phase(a.e) - phase(b.e) || sideRank(a.e) - sideRank(b.e) || finite(a.e.ring, 0) - finite(b.e.ring, 0) || a.i - b.i)
    .map((x) => x.e);
}

const ZONE_RANK: Record<Zone, number> = { start: 0, center: 1, end: 2 };

/** The ids of an edge in drawing order: its items stably sorted by zone. */
export function zoneSorted(scene: Scene, ids: readonly string[]): string[] {
  return ids
    .map((id, i) => ({ id, i, z: ZONE_RANK[zoneOf(scene.items[id])] }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((x) => x.id);
}


const stackItemOf = (item: SceneItem, forms: readonly StackForm[], from?: number): StackItem => ({
  id: item.id,
  forms,
  used: finite(item.used, 0),
  ...(item.kept ? { kept: true } : {}),
  ...(from !== undefined ? { from } : item.from !== undefined ? { from: item.from } : {}),
  ...(item.fixed ? { fixed: true } : {}),
});

/** Whether anything drawn in the fit sets its cross size. */
function hasSetter(fit: StackFit, forms: (id: string) => readonly StackForm[]): boolean {
  return fit.items.some((p) => p.kind !== "menu" && formSetsCross(forms(p.id)[p.form]!));
}

interface EdgeSolve {
  readonly stack: StackFit;
  readonly free: StackFit;
  readonly tabs: readonly string[];
  readonly closedTabs: ReadonlySet<string>;
  readonly input: StackInput;
  /** Items left out of a rail: they have only `wrap` forms left (`no-vertical-form`). */
  readonly leftOut?: readonly string[];
  /** Items left out of a compact edge: they have no `icons` form (`no-icons-form`). */
  readonly leftOutIcons?: readonly string[];
}

/**
 * What a drawn item reports of its shape: a `wrap` form's rows (word indexes per row, at the edge's cross size `cross`)
 * and its grip (the lead cell at the start of row one); a form with `grip` (an icons strip) its grip at its start along
 * the axis (a horizontal strip on top in a column).
 */
export function shapeOf(f: StackForm | undefined, r: Rect, axis: "column" | "row", cross: number): { rows?: number[][]; grip?: Rect } {
  if (!f) return {};
  if (f.wrap) {
    const lead = Math.max(0, finite(f.wrap.lead ?? 0, 0));
    const row = Math.max(0, finite(f.wrap.row, 0));
    return { rows: wrapLines(f.wrap, cross).lines, grip: rect(r.x, r.y, lead, Math.min(row, r.height)) };
  }
  const g = typeof f.grip === "number" && Number.isFinite(f.grip) && f.grip > 0 ? f.grip : 0;
  if (!g) return {};
  return { grip: axis === "column" ? rect(r.x, r.y, r.width, Math.min(g, r.height)) : rect(r.x, r.y, Math.min(g, r.width), r.height) };
}

/** How far a tray toolbar's steps rank after the panels' (its forms' `rank` plus this). */
const TRAY_RANK = 100;

/** One edge's stack along `length`: the free fit, then the rail or the user's size. */
function solveEdge(scene: Scene, edge: Edge, ids: readonly string[], length: number, room: number, previous: SceneEdgeLayout | undefined): EdgeSolve {
  const axis = axisOf(edge.side);
  const column = axis === "column";
  const ordered = zoneSorted(scene, ids);
  const formsById = (id: string): readonly StackForm[] => formsOf(scene.items[id]!, axis);
  // Never wider across than the room the cut leaves it.
  const maxOf = Number.isNaN(edge.cross.max) ? Infinity : edge.cross.max;
  const cross = { min: Math.min(px(edge.cross.min), room), max: Math.min(maxOf, room), rail: Math.min(px(edge.cross.rail ?? 30), room) };
  const base: Omit<StackInput, "items"> = {
    axis,
    length,
    cross,
    ...(edge.menu ? { menu: edge.menu } : {}),
    ...(edge.gap !== undefined ? { gap: edge.gap } : {}),
    ...(edge.pad ? { pad: edge.pad } : {}),
    ...(column ? { ownCross: true } : {}),
  };
  if (edge.compact) {
    // An icons-only edge: each item starts at its icons form (the » menu may follow); one without is left out.
    const iconsAt = (id: string): number => {
      const forms = formsById(id);
      for (let j = Math.max(0, Math.floor(finite(scene.items[id]!.from, 0))); j < forms.length; j++) if (forms[j]!.kind === "icons") return j;
      return forms.findIndex((f) => f.kind === "icons");
    };
    const shown = ordered.filter((id) => !scene.items[id]!.closed && iconsAt(id) >= 0);
    const leftOutIcons = ordered.filter((id) => !scene.items[id]!.closed && iconsAt(id) < 0);
    const compactInput: StackInput = { ...base, ownCross: false, items: shown.map((id) => stackItemOf(scene.items[id]!, formsById(id), iconsAt(id))) };
    const stack = fitStack(compactInput, previous ? { previous: previous.free } : {});
    return { stack, free: stack, tabs: [], closedTabs: new Set(), input: compactInput, leftOutIcons };
  }
  const open = ordered.filter((id) => !scene.items[id]!.closed);
  /**
   * A toolbar in a column's tray (the end zone, when `zoneAccepts` lists it) takes only its `wrap` or `icons` form, never
   * the menu, and its steps rank after every other item's, so the panels above give way first.
   */
  const asStackItem = (id: string): StackItem => {
    const it = scene.items[id]!;
    const forms = formsById(id);
    if (!column || !edge.zoneAccepts?.end || zoneOf(it) !== "end") return stackItemOf(it, forms);
    const tray = (f: StackForm): boolean => f.kind === "wrap" || f.kind === "icons" || !!f.wrap;
    let first = -1;
    for (let j = Math.max(0, Math.floor(finite(it.from, 0))); j < forms.length && first < 0; j++) if (tray(forms[j]!)) first = j;
    let last = -1;
    forms.forEach((f, j) => {
      if (tray(f)) last = j;
    });
    if (first < 0) return stackItemOf(it, forms);
    return stackItemOf(it, forms.slice(0, last + 1).map((f) => ({ ...f, rank: finite(f.rank ?? 0, 0) + TRAY_RANK })), first);
  };
  const input: StackInput = { ...base, items: open.map(asStackItem) };
  const free = fitStack(input, previous ? { previous: previous.free } : {});
  const none = new Set<string>();
  if (column && !hasSetter(free, formsById)) {
    // A rail: the items with a rail form take it (closed ones too, with `railShowsClosed`).
    const railIndex = (item: SceneItem, forms: readonly StackForm[]): number => {
      if (item.fixed) return -1;
      for (let j = Math.max(0, Math.floor(finite(item.from, 0))); j < forms.length; j++) if (forms[j]!.kind === "rail") return j;
      return -1;
    };
    // Vertical means icons: an item with only `wrap` forms left has no form for a rail, and is left out (noted).
    const wrapOnly = (id: string): boolean => railIndex(scene.items[id]!, formsById(id)) < 0 && pastWrap(formsById(id), finite(scene.items[id]!.from, 0)) === undefined;
    const shown = ordered.filter((id) => {
      const it = scene.items[id]!;
      if (!it.closed && wrapOnly(id)) return false;
      return !it.closed || (edge.railShowsClosed === true && railIndex(it, formsById(id)) >= 0);
    });
    const leftOut = ordered.filter((id) => !scene.items[id]!.closed && wrapOnly(id));
    const anyRail = shown.some((id) => railIndex(scene.items[id]!, formsById(id)) >= 0);
    if (anyRail) {
      const railInput: StackInput = {
        ...base,
        items: shown.map((id) => {
          const it = scene.items[id]!;
          const j = railIndex(it, formsById(id));
          // Vertical means icons: in a rail a group skips its `wrap` forms (a tray toolbar keeps its tray forms, no menu).
          const forms = asStackItem(id).forms;
          return stackItemOf(it, forms, j >= 0 ? j : pastWrap(forms, finite(it.from, 0)));
        }),
      };
      const stack = fitStack(railInput, previous ? { previous: previous.stack } : {});
      const tabs = stack.items.filter((p) => p.kind === "rail").map((p) => p.id);
      const closedTabs = new Set(shown.filter((id) => scene.items[id]!.closed));
      return { stack, free, tabs, closedTabs, input: railInput, leftOut };
    }
  }
  const size = edge.size;
  if (typeof size === "number" && Number.isFinite(size) && hasSetter(free, formsById)) {
    const setters = free.items.filter((p) => p.kind !== "menu" && formSetsCross(formsById(p.id)[p.form]!));
    const lo = Math.max(px(edge.cross.min), ...setters.map((p) => formCrossMin(formsById(p.id)[p.form]!)));
    const s = Math.min(Math.max(size, lo), Math.max(lo, maxOf), room);
    if (Math.abs(s - free.cross) > EPS) {
      const sized: StackInput = { ...input, cross: { ...cross, min: s, max: s } };
      const stack = fitStack(sized, previous ? { previous: previous.stack } : {});
      return { stack, free, tabs: [], closedTabs: none, input: sized };
    }
  }
  return { stack: free, free, tabs: [], closedTabs: none, input };
}

/**
 * The fit with zones packed: when the drawn items leave spare length, start items pack from the start, end items from
 * the end (before the » entry), center items centred between. Returns the main-axis start per id.
 */
function zoneStarts(scene: Scene, fit: StackFit, input: StackInput): { starts: Map<string, number>; lengths: Map<string, number> } {
  const column = fit.axis === "column";
  const at = (r: Rect): number => (column ? r.y : r.x);
  const out = new Map<string, number>();
  const lengths = new Map<string, number>();
  const drawn = fit.items.filter((p) => p.kind !== "menu");
  for (const p of drawn) {
    out.set(p.id, at(p.rect));
    lengths.set(p.id, column ? p.rect.height : p.rect.width);
  }
  const len = (p: { id: string }): number => lengths.get(p.id)!;
  const gap = px(input.gap);
  const start = px(input.pad?.start);
  const end = px(input.pad?.end);
  const menu = fit.menu ? (column ? fit.menu.rect.height : fit.menu.rect.width) + (drawn.length > 0 ? gap : 0) : 0;
  const zone = (z: Zone) => drawn.filter((p) => zoneOf(scene.items[p.id]) === z);
  const s = zone("start");
  const c = zone("center");
  const e = zone("end");
  /**
   * A bar's title (a fixed item that grows, in the start zone): the zones are laid with it at its natural length, so
   * a toolbar right after it sits right after its natural rect (leading), and the title then takes the room up to the
   * next item only when nothing follows it in its zone.
   */
  const title = column
    ? undefined
    : s.find((p) => {
        const it = scene.items[p.id]!;
        const f = formsOf(it, "row")[p.form];
        return it.fixed && f?.main.grows && len(p) > formMain(f, "natural", fit.cross) + EPS;
      });
  if (title) lengths.set(title.id, formMain(formsOf(scene.items[title.id]!, "row")[title.form]!, "natural", fit.cross));
  const used = drawn.reduce((sum, p) => sum + len(p), 0) + Math.max(0, drawn.length - 1) * gap;
  const spare = fit.length - start - end - menu - used;
  if (spare <= EPS) return { starts: out, lengths };
  const total = (ps: readonly { id: string }[]): number => ps.reduce((sum, p) => sum + len(p), 0) + Math.max(0, ps.length - 1) * gap;
  const lay = (ps: readonly { id: string }[], from: number): void => {
    let x = from;
    for (const p of ps) {
      out.set(p.id, x);
      x += len(p) + gap;
    }
  };
  lay(s, start);
  const endStart = fit.length - end - menu - total(e);
  lay(e, endStart);
  const lo = start + total(s) + (s.length > 0 ? gap : 0);
  const hi = endStart - (e.length > 0 ? gap : 0);
  // Centred on the edge's middle (so a centred readout stays put while the other zones change), kept between them; in
  // a title bar, where the middle isn't clear of the title and the trailing items, centred in the free span instead.
  const mid = (fit.length - total(c)) / 2;
  const clear = mid >= lo - EPS && mid + total(c) <= hi + EPS;
  lay(c, title && !clear ? Math.max(lo, (lo + hi - total(c)) / 2) : Math.max(lo, Math.min(mid, hi - total(c))));
  if (title && s[s.length - 1] === title) {
    // Nothing after the title in its zone: it grows into the room up to the next item.
    const next = [...c, ...e].map((p) => out.get(p.id)!);
    const until = next.length ? Math.min(...next) - gap : fit.length - end - menu;
    lengths.set(title.id, Math.max(len(title), until - out.get(title.id)!));
  }
  return { starts: out, lengths };
}

/** A float's rect flush with `content`'s side or corner. */
export function anchored(content: Rect, w: number, h: number, anchor: FloatAnchor): Rect {
  const left = content.x;
  const right = content.x + content.width - w;
  const midX = content.x + (content.width - w) / 2;
  const top = content.y;
  const bottom = content.y + content.height - h;
  const midY = content.y + (content.height - h) / 2;
  const at: Record<FloatAnchor, [number, number]> = {
    "content-top-left": [left, top],
    "content-top": [midX, top],
    "content-top-right": [right, top],
    "content-right": [right, midY],
    "content-bottom-right": [right, bottom],
    "content-bottom": [midX, bottom],
    "content-bottom-left": [left, bottom],
    "content-left": [left, midY],
  };
  const [x, y] = at[anchor] ?? at["content-top-right"];
  return rect(x, y, w, h);
}

export function solve(given: Scene, options: SolveOptions = {}): SceneLayout {
  const previous = options.previous;
  // Under `previous`, an item docked now that was closed or absent then has just opened: it counts as the newest, so it
  // keeps its largest form while it fits and the others give way by the usual rules.
  const opened = new Set<string>();
  if (previous) {
    for (const e of given.edges) {
      for (const id of e.items) {
        const it = Object.hasOwn(given.items, id) ? given.items[id] : undefined;
        const was = previous.items[id];
        if (it && !it.closed && !it.fixed && (!was || was.closed)) opened.add(id);
      }
    }
  }
  const newest = Object.values(given.items).reduce((m, it) => Math.max(m, finite(it.used, 0)), 0) + 1;
  const scene: Scene = opened.size === 0 ? given : { ...given, items: { ...given.items, ...Object.fromEntries([...opened].map((id) => [id, { ...given.items[id]!, used: newest }])) } };
  // `fresh` edges, and edges holding a `fresh` item, are solved without `previous`.
  const fresh = new Set(options.fresh ?? []);
  const prevEdge = (edge: Edge): SceneEdgeLayout | undefined => (!previous || fresh.has(edge.id) || edge.items.some((id) => fresh.has(id)) ? undefined : previous.edges[edge.id]);
  const notes: SceneNote[] = [];
  const items: Record<string, SceneItemLayout> = {};
  const edges: Record<string, SceneEdgeLayout> = {};
  const stage = rect(finite(scene.stage.x, 0), finite(scene.stage.y, 0), px(scene.stage.width), px(scene.stage.height));
  const order = cutOrder(scene.edges);

  // Who is where: the first place in cut order wins (edges before floats).
  const claimed = new Set<string>();
  const claim = (id: string): boolean => {
    if (!Object.hasOwn(scene.items, id)) {
      notes.push({ code: "unknown-item", id });
      return false;
    }
    if (claimed.has(id)) {
      notes.push({ code: "twice", id });
      return false;
    }
    claimed.add(id);
    return true;
  };
  const owned = new Map<Edge, string[]>();
  for (const e of order) owned.set(e, e.items.filter(claim));

  /** Draws an edge's stack at `r` (its stage rect): its items, notes and edge layout. */
  const emit = (edge: Edge, r: Rect, solved: EdgeSolve, extra: Partial<SceneEdgeLayout> = {}): void => {
    const column = axisOf(edge.side) === "column";
    const { stack } = solved;
    const thick = column ? r.width : r.height;
    const { starts, lengths } = zoneStarts(scene, stack, solved.input);
    const toStage = (l: Rect, id?: string): Rect => {
      const s = id !== undefined ? starts.get(id) : undefined;
      const n = id !== undefined ? lengths.get(id) : undefined;
      const x = column ? l.x : (s ?? l.x);
      const y = column ? (s ?? l.y) : l.y;
      return rect(r.x + x, r.y + y, column ? l.width : (n ?? l.width), column ? (n ?? l.height) : l.height);
    };
    const tabs = new Set(solved.tabs);
    for (const id of solved.leftOut ?? []) notes.push({ code: "no-vertical-form", edge: edge.id, id });
    for (const id of solved.leftOutIcons ?? []) notes.push({ code: "no-icons-form", edge: edge.id, id });
    for (const p of stack.items) {
      const it = scene.items[p.id]!;
      const inMenu = p.kind === "menu";
      const drawnRect = toStage(p.rect, inMenu ? undefined : p.id);
      const shape = inMenu ? {} : shapeOf(formsOf(it, column ? "column" : "row")[p.form], drawnRect, column ? "column" : "row", stack.cross);
      items[p.id] = {
        ...shape,
        rect: drawnRect,
        kind: it.kind,
        form: p.form,
        formKind: p.kind,
        edge: edge.id,
        zone: zoneOf(it),
        ...(inMenu ? { inMenu: true } : {}),
        ...(tabs.has(p.id) ? { tab: true } : {}),
        ...(solved.closedTabs.has(p.id) ? { closed: true } : {}),
        ...(it.fixed ? { fixed: true } : {}),
      };
    }
    for (const n of stack.notes) notes.push({ edge: edge.id, ...n });
    edges[edge.id] = {
      side: edge.side,
      ring: finite(edge.ring, 0),
      rect: r,
      cross: thick,
      menu: stack.menu ? { rect: toStage(stack.menu.rect), items: stack.menu.items } : null,
      tabs: solved.tabs,
      stack,
      free: solved.free,
      ...extra,
    };
  };

  const lay = (edge: Edge, area: Rect, cut: boolean): Rect => {
    const column = axisOf(edge.side) === "column";
    const length = column ? area.height : area.width;
    const room = Math.max(0, column ? area.width : area.height);
    const solved = solveEdge(scene, edge, owned.get(edge)!, length, room, prevEdge(edge));
    const thick = solved.stack.items.length === 0 ? 0 : Math.min(solved.stack.cross, room);
    const r =
      edge.side === "top"
        ? rect(area.x, area.y, area.width, thick)
        : edge.side === "bottom"
          ? rect(area.x, area.y + area.height - thick, area.width, thick)
          : edge.side === "left"
            ? rect(area.x, area.y, thick, area.height)
            : rect(area.x + area.width - thick, area.y, thick, area.height);
    emit(edge, r, solved);
    if (!cut) return area;
    return edge.side === "top"
      ? rect(area.x, area.y + thick, area.width, area.height - thick)
      : edge.side === "bottom"
        ? rect(area.x, area.y, area.width, area.height - thick)
        : edge.side === "left"
          ? rect(area.x + thick, area.y, area.width - thick, area.height)
          : rect(area.x, area.y, area.width - thick, area.height);
  };

  const rails: Partial<Record<"left" | "right", SceneRailLayout>> = {};
  const gutter = px(scene.gutter);
  let columnRoom: boolean | undefined;
  const isSide = (e: Edge): boolean => e.side === "left" || e.side === "right";
  // The inset, or none with `insetWhen: "docked"` while nothing is docked beside the content: an open column or a rail
  // (a side edge that takes something, with an item that isn't closed). An anchor alone (it takes nothing) doesn't count.
  const docked = order.some((e) => isSide(e) && e.accepts.length > 0 && owned.get(e)!.some((id) => !scene.items[id]!.closed));
  const inset = scene.insetWhen === "docked" && !docked ? {} : (scene.inset ?? {});

  /**
   * The reserved left and right edges, ring by ring, with column give-way: dynamic columns shrink toward their minimum,
   * then fold whole into their side's rail while the content is narrower than `contentMin.width`.
   */
  const laySides = (sideEdges: readonly Edge[], area: Rect): Rect => {
    const H = area.height;
    const ride = scene.handFold === "ride";
    interface Col {
      readonly edge: Edge;
      readonly side: "left" | "right";
      readonly solved: EdgeSolve;
      readonly width: number;
      readonly min: number;
      readonly visible: readonly string[];
      readonly dyn: boolean;
      readonly hand: boolean;
      readonly kept: boolean;
      readonly age: number;
    }
    // An edge outside the inset (an anchor) runs into the inset above and below too, where no reserved bar lies on that
    // side (a bar there keeps it below or above the bar).
    const upInset = area.y <= stage.y + px(inset.top) + EPS ? px(inset.top) : 0;
    const downInset = area.y + area.height >= stage.y + stage.height - px(inset.bottom) - EPS ? px(inset.bottom) : 0;
    const tall = (edge: Edge): number => H + (edge.outsideInset === true ? upInset + downInset : 0);
    const cols: Col[] = sideEdges.map((edge) => {
      const side = edge.side as "left" | "right";
      const solved = solveEdge(scene, edge, owned.get(edge)!, tall(edge), Math.max(0, area.width), prevEdge(edge));
      const width = solved.stack.items.length === 0 ? 0 : Math.min(solved.stack.cross, area.width);
      const visible = owned.get(edge)!.filter((id) => !scene.items[id]!.closed);
      // A dynamic column, or a static edge that gives way like one (`giveWay`).
      const dyn = (edge.column === true || edge.giveWay === true) && scene.rails?.[side] !== undefined && visible.length > 0;
      const forms = (id: string): readonly StackForm[] => formsOf(scene.items[id]!, "column");
      const setters = solved.free.items.filter((p) => p.kind !== "menu" && formSetsCross(forms(p.id)[p.form]!));
      const min = setters.length > 0 ? Math.min(width, Math.max(px(edge.cross.min), ...setters.map((p) => formCrossMin(forms(p.id)[p.form]!)))) : width;
      return {
        edge,
        side,
        solved,
        width,
        min,
        visible,
        dyn,
        hand: dyn && edge.column === true && visible.every((id) => finite(scene.items[id]!.from, 0) >= 1),
        kept: visible.some((id) => scene.items[id]!.kept === true),
        age: Math.max(-Infinity, ...visible.map((id) => finite(scene.items[id]!.used, 0))),
      };
    });
    const cmin = scene.contentMin ? px(scene.contentMin.width) : undefined;
    const order = cols
      .filter((c) => c.dyn && !c.hand && c.width > 0)
      .sort((a, b) => Number(a.kept) - Number(b.kept) || a.age - b.age || finite(a.edge.ring, 0) - finite(b.edge.ring, 0) || (a.side === b.side ? 0 : a.side === "left" ? -1 : 1));
    // Under `previous`, the columns that were shrunk shrink first, in the order they did, so ages alone move nothing.
    const shrunkBefore = (previous?.notes ?? []).flatMap((n) => (n.code === "column-shrunk" ? [n.edge] : []));
    const rankOf = (c: Col): number => (shrunkBefore.includes(c.edge.id) ? shrunkBefore.indexOf(c.edge.id) : Infinity);
    const shrinkOrder = order.map((c, i) => ({ c, i })).sort((a, b) => (rankOf(a.c) === rankOf(b.c) ? a.i - b.i : rankOf(a.c) < rankOf(b.c) ? -1 : 1)).map((x) => x.c);
    const railW = (side: "left" | "right"): number => px(scene.rails?.[side]?.width);
    const evaluate = (auto: ReadonlySet<Col>) => {
      // Riders ride over an open panel column (never an anchor), every member of a hand-folded column a bar.
      const openOn = (side: "left" | "right"): boolean => cols.some((c) => c.side === side && c.dyn && c.edge.column === true && !c.hand && !auto.has(c) && c.width > 0);
      const riding = (c: Col): boolean => ride && c.hand && openOn(c.side);
      const railed = (c: Col): boolean => c.dyn && (auto.has(c) || (c.hand && !riding(c)));
      const widths = new Map(cols.filter((c) => !railed(c) && !riding(c)).map((c) => [c, c.width]));
      const railSides = (["left", "right"] as const).filter((s) => cols.some((c) => c.side === s && railed(c)));
      let used = 0;
      // An edge outside the inset has no gutter after it (the inset is there).
      for (const [c, w] of widths) used += w > 0 ? w + (c.edge.outsideInset === true ? 0 : gutter) : 0;
      for (const s of railSides) used += railW(s) + gutter;
      let excess = cmin === undefined ? -Infinity : used + cmin - area.width;
      for (const c of shrinkOrder) {
        if (excess <= EPS) break;
        const w = widths.get(c);
        if (w === undefined) continue;
        const take = Math.min(excess, w - c.min);
        if (take > 0) {
          widths.set(c, w - take);
          excess -= take;
        }
      }
      return { auto, widths, excess, railed, riding, railSides };
    };
    let auto = new Set<Col>();
    if (cmin !== undefined) {
      // Room that came back unfolds in the reverse of the order the columns folded in (the fold notes' order), one at a
      // time, stopping at the first that can't come back: never by age, so a press can't unfold anything.
      const unfold = (): void => {
        for (const c of [...auto].reverse()) {
          const fewer = new Set([...auto].filter((x) => x !== c));
          if (evaluate(fewer).excess <= EPS) auto = fewer;
          else break;
        }
      };
      if (previous) {
        // What gave way before stays folded, in the order it folded, while the content still fits without it coming back.
        const byId = new Map(order.map((c) => [c.edge.id, c]));
        // A column with a just-opened or `fresh` item is weighed anew.
        const anew = (c: Col): boolean => fresh.has(c.edge.id) || c.visible.some((id) => opened.has(id) || fresh.has(id));
        const was = previous.notes.flatMap((n) => ((n.code === "column-folded" || n.code === "kept-folded") && byId.has(n.edge) && !anew(byId.get(n.edge)!) ? [byId.get(n.edge)!] : []));
        auto = new Set(was);
        if (evaluate(auto).excess <= EPS) unfold();
      }
      // A need for more folds the next in give-way order.
      for (const c of order) {
        if (evaluate(auto).excess <= EPS) break;
        if (!auto.has(c)) auto = new Set([...auto, c]);
      }
      // A fold can make an earlier one needless (a second column into a rail the first already paid for): unfold to a
      // fixpoint, so solving again from this layout changes nothing.
      for (let size = -1; size !== auto.size; ) {
        size = auto.size;
        unfold();
      }
    }
    const g = evaluate(auto);
    // Whether one panel column at its minimum fits beside the content's minimum: a host's narrow fallback (the sheet)
    // reads it. Anchors and rails don't count: every column, an anchor included, can fold into its rail.
    // With no column edge yet (every panel floating), a side's column template says how narrow its column could be.
    const open = cols.filter((c) => c.dyn && c.edge.column === true).map((c) => c.min);
    const templates = (["left", "right"] as const).flatMap((s) => (scene.columns?.[s] ? [px(scene.columns[s]!.cross.min)] : []));
    const colMins = open.length > 0 ? open : templates;
    if (cmin !== undefined && colMins.length > 0) {
      const need = cmin + Math.min(...colMins) + gutter;
      columnRoom = area.width >= need - EPS;
      if (!columnRoom) notes.push({ code: "no-column-room", width: area.width, need });
    }
    for (const c of shrinkOrder) {
      const w = g.widths.get(c);
      if (w !== undefined && w < c.width - EPS) notes.push({ code: "column-shrunk", edge: c.edge.id, from: c.width, to: w });
    }
    // In the order they folded: `previous` reads it to unfold in reverse.
    for (const c of g.auto) notes.push({ code: c.kept ? "kept-folded" : "column-folded", edge: c.edge.id });

    let x0 = area.x;
    let x1 = area.x + area.width;
    for (const side of ["left", "right"] as const) {
      const mine = cols.filter((c) => c.side === side);
      const railed = mine.filter((c) => g.railed(c));
      const riders = mine.filter((c) => g.riding(c));
      const host = mine.find((c) => c.dyn && c.edge.column === true && !c.hand && !g.auto.has(c) && c.width > 0);
      /** A riding column's bars: each member's folded form, in zone order. */
      const riderBars = (c: Col): { id: string; form: number; f: StackForm | undefined; h: number }[] =>
        zoneSorted(scene, c.visible).map((id) => {
          const forms = formsOf(scene.items[id]!, "column");
          const form = forms.length === 0 ? 0 : Math.min(Math.max(0, Math.floor(finite(scene.items[id]!.from, 0))), forms.length - 1);
          return { id, form, f: forms[form], h: px(forms[form]?.main.natural) };
        });
      const ridersTop = riders.reduce((s, c) => s + riderBars(c).reduce((t, b) => t + b.h, 0), 0);
      let railRect: Rect | null = null;
      // The gap just outside the next edge: the inset at the window's side, then a gutter. An edge outside the inset
      // (an anchor) lies before that gap, which then follows it.
      let gap = px(side === "left" ? inset.left : inset.right);
      for (const c of mine) {
        // The side's rail is its outermost edge, at the window's side (inside the inset): an anchor lies inside it.
        if (!railRect && railed.length > 0) {
          const w = railW(side);
          if (side === "left") {
            railRect = rect(x0, area.y, w, H);
            x0 += w + gutter;
          } else {
            x1 -= w;
            railRect = rect(x1, area.y, w, H);
            x1 -= gutter;
          }
          gap = gutter;
        }
        const base = { side: c.edge.side, ring: finite(c.edge.ring, 0), cross: 0, menu: null, tabs: [], stack: c.solved.stack, free: c.solved.free };
        if (g.railed(c)) {
          edges[c.edge.id] = { ...base, rect: rect(railRect!.x, area.y, 0, H), folded: g.auto.has(c) ? "auto" : "hand" };
          continue;
        }
        if (g.riding(c)) continue;
        // Never wider than the room the edges outside it leave.
        const w = Math.min(g.widths.get(c)!, Math.max(0, x1 - x0));
        const top = c === host ? ridersTop : 0;
        let solved = c.solved;
        if (top > 0 || Math.abs(w - c.width) > EPS) {
          const forced: Edge = { ...c.edge, cross: { ...c.edge.cross, min: w, max: w } };
          const { size: _s, ...plain } = forced;
          solved = solveEdge(scene, plain, owned.get(c.edge)!, H - top, w, prevEdge(c.edge));
        }
        let r: Rect;
        if (c.edge.outsideInset === true) {
          // Outside the inset: at the stage's side, full height; the inset (not a gutter) follows it.
          const y0 = area.y - upInset;
          const h = tall(c.edge);
          if (side === "left") {
            r = rect(x0 - gap, y0, w, h);
            x0 += w;
          } else {
            r = rect(x1 + gap - w, y0, w, h);
            x1 -= w;
          }
          if (Math.abs(h - H) > EPS || Math.abs(w - c.width) > EPS) {
            const forced: Edge = { ...c.edge, cross: { ...c.edge.cross, min: w, max: w } };
            const { size: _s, ...plain } = forced;
            solved = solveEdge(scene, plain, owned.get(c.edge)!, h, w, prevEdge(c.edge));
          }
        } else if (side === "left") {
          r = rect(x0, area.y + top, w, H - top);
          x0 += w > 0 ? w + gutter : 0;
          if (w > 0) gap = gutter;
        } else {
          x1 -= w;
          r = rect(x1, area.y + top, w, H - top);
          x1 -= w > 0 ? gutter : 0;
          if (w > 0) gap = gutter;
        }
        emit(c.edge, r, solved, w < c.width - EPS ? { shrunk: true } : {});
      }
      if (host && riders.length > 0) {
        const hr = edges[host.edge.id]!.rect;
        let y = area.y;
        for (const c of riders) {
          const bars = riderBars(c);
          const y0 = y;
          for (const b of bars) {
            const at = rect(hr.x, y, hr.width, b.h);
            const it = scene.items[b.id]!;
            items[b.id] = { rect: at, kind: it.kind, form: b.form, formKind: b.f?.kind ?? "header", edge: c.edge.id, zone: zoneOf(it), rides: host.edge.id, folded: "hand" };
            y += b.h;
          }
          edges[c.edge.id] = { side: c.edge.side, ring: finite(c.edge.ring, 0), rect: rect(hr.x, y0, hr.width, y - y0), cross: 0, menu: null, tabs: [], stack: c.solved.stack, free: c.solved.free, rides: host.edge.id, folded: "hand" };
        }
      }
      if (railRect) {
        const segments: { id: string; edge: string; rect: Rect }[] = [];
        let y = railRect.y;
        for (const c of railed) {
          // In zone order, as the column itself shows them: start, center, end.
          for (const id of zoneSorted(scene, c.visible)) {
            const it = scene.items[id]!;
            const forms = formsOf(it, "column");
            const ri = forms.findIndex((f) => f.kind === "rail");
            const form = ri >= 0 ? ri : Math.min(Math.max(0, Math.floor(finite(it.from, 0))), Math.max(0, forms.length - 1));
            const h = ri >= 0 ? px(forms[ri]!.main.natural) : railRect.width;
            const at = rect(railRect.x, y, railRect.width, h);
            items[id] = { rect: at, kind: it.kind, form, formKind: "rail", edge: c.edge.id, zone: zoneOf(it), rail: side, folded: g.auto.has(c) ? "auto" : "hand" };
            segments.push({ id, edge: c.edge.id, rect: at });
            y += h;
          }
        }
        rails[side] = { rect: railRect, segments };
      }
    }
    return rect(x0, area.y, Math.max(0, x1 - x0), H);
  };

  let area = rect(stage.x + px(inset.left), stage.y + px(inset.top), Math.max(0, stage.width - px(inset.left) - px(inset.right)), Math.max(0, stage.height - px(inset.top) - px(inset.bottom)));
  const reserved = order.filter((e) => e.mode !== "overlay");
  for (const e of reserved) if (!isSide(e) && e.span !== "between") area = lay(e, area, true);
  area = laySides(reserved.filter(isSide), area);
  for (const e of reserved) if (!isSide(e) && e.span === "between") area = lay(e, area, true);
  const content = area;
  let over = content;
  for (const e of order) if (e.mode === "overlay") over = lay(e, over, true);
  if (scene.contentMin) {
    const minW = px(scene.contentMin.width);
    const minH = px(scene.contentMin.height);
    if (content.width < minW - EPS) notes.push({ code: "content-narrow", width: content.width, min: minW });
    const bars = order.filter((e) => e.mode === "overlay" && !isSide(e)).reduce((s, e) => s + (edges[e.id]?.cross ?? 0), 0);
    if (content.height - bars < minH - EPS) notes.push({ code: "content-short", height: content.height - bars, min: minH });
  }
  if (previous) {
    const was = previous.content;
    const moved = Math.abs(was.x - content.x) > EPS || Math.abs(was.y - content.y) > EPS || Math.abs(was.width - content.width) > EPS || Math.abs(was.height - content.height) > EPS;
    if (moved) notes.push({ code: "content-changed", from: was, to: content });
  }

  // Floats: clear of every docked item, every bar and the chrome.
  const avoid: Rect[] = [];
  for (const l of Object.values(items)) avoid.push(l.rect);
  for (const e of Object.values(edges)) {
    if (axisOf(e.side) === "row" && e.cross > 0) avoid.push(e.rect);
    if (e.menu) avoid.push(e.menu.rect);
  }
  for (const c of scene.chrome ?? []) avoid.push(c);
  // Floats lie within the stage less the inset at its left and right (the sides the columns pad), the stage's full height.
  const floatRegion = rect(stage.x + px(inset.left), stage.y, Math.max(0, stage.width - px(inset.left) - px(inset.right)), stage.height);
  const floats: string[] = [];
  for (const f of scene.floats) {
    if (!claim(f.id)) continue;
    const it = scene.items[f.id]!;
    if (it.closed) continue;
    const shape = floatShape(it, f);
    if (shape.none) {
      // Vertical means icons: an item with only `wrap` forms left has no form for a vertical float.
      notes.push({ code: "no-vertical-form", id: f.id });
      continue;
    }
    const from = shape.form;
    const form = formsOf(it, f.orient === "row" ? "row" : "column")[from];
    // Into that region; a float larger than it is shrunk to fit it, never under its floor: the item's `floatMin`, else
    // its form's own minimums. A folded float (its bar) keeps its height. Wider than the region at its floor, it keeps
    // the floor and lies at the region's left edge.
    const row = f.orient === "row";
    // The form's own minimums only stop a shrink (a float asked smaller keeps its size); `floatMin` is laid out as given.
    const floor = {
      width: it.floatMin ? px(it.floatMin.width) : Math.min(shape.width, px(row ? form?.main.min : form?.cross.min)),
      height: it.floatMin ? px(it.floatMin.height) : Math.min(shape.height, px(row ? form?.cross.min : form?.main.min)),
    };
    const w = Math.max(floor.width, Math.min(shape.width, floatRegion.width));
    // Folded means its bar (a `header` form), not any form past the first (a row float, a second open form).
    const folded = form?.kind === "header";
    const h = folded ? shape.height : Math.max(floor.height, Math.min(shape.height, floatRegion.height));
    const want = f.anchor ? anchored(content, w, h, f.anchor) : rect(finite(f.rect.x, stage.x), finite(f.rect.y, stage.y), w, h);
    const fit0 = fitFloat(want, floatRegion, avoid);
    const fit = w > floatRegion.width + EPS ? { ...fit0, rect: rect(floatRegion.x, fit0.rect.y, w, fit0.rect.height) } : fit0;
    if (fit.clamped) notes.push({ code: "float-clamped", id: f.id });
    if (fit.snapped) notes.push({ code: "float-moved", id: f.id });
    if (fit.covers.length > 0) notes.push({ code: "float-covers", id: f.id });
    items[f.id] = { ...shapeOf(form, fit.rect, f.orient === "row" ? "row" : "column", fit.rect.width), rect: fit.rect, kind: it.kind, form: from, formKind: form?.kind ?? "open", floating: true };
    floats.push(f.id);
  }
  return { items, edges, content, floats, rails, ...(columnRoom !== undefined ? { columnRoom } : {}), notes };
}
