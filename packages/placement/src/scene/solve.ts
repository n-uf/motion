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
 * `previous` (the layout before) gives each edge's fits to `fitStack` as `previous`, so a change of ages alone (a press)
 * changes no rect. Pure: the same scene always lays out the same.
 */
import { rect, type Rect } from "../geometry";
import { fitFloat } from "../stack/floats";
import { fitStack } from "../stack/layout";
import { formSetsCross, type StackFit, type StackForm, type StackInput, type StackItem } from "../stack/model";
import { axisOf, formsOf, zoneOf, type Edge, type FloatAnchor, type Scene, type SceneEdgeLayout, type SceneItem, type SceneItemLayout, type SceneLayout, type SceneNote, type SolveOptions, type Zone } from "./model";

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

const crossMinOf = (f: StackForm): number => finite(f.cross.min ?? f.cross.natural, 0);

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
}

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
  const open = ordered.filter((id) => !scene.items[id]!.closed);
  const input: StackInput = { ...base, items: open.map((id) => stackItemOf(scene.items[id]!, formsById(id))) };
  const free = fitStack(input, previous ? { previous: previous.free } : {});
  const none = new Set<string>();
  if (column && !hasSetter(free, formsById)) {
    // A rail: the items with a rail form take it (closed ones too, with `railShowsClosed`).
    const railIndex = (item: SceneItem, forms: readonly StackForm[]): number => {
      if (item.fixed) return -1;
      for (let j = Math.max(0, Math.floor(finite(item.from, 0))); j < forms.length; j++) if (forms[j]!.kind === "rail") return j;
      return -1;
    };
    const shown = ordered.filter((id) => {
      const it = scene.items[id]!;
      return !it.closed || (edge.railShowsClosed === true && railIndex(it, formsById(id)) >= 0);
    });
    const anyRail = shown.some((id) => railIndex(scene.items[id]!, formsById(id)) >= 0);
    if (anyRail) {
      const railInput: StackInput = {
        ...base,
        items: shown.map((id) => {
          const it = scene.items[id]!;
          const j = railIndex(it, formsById(id));
          return stackItemOf(it, formsById(id), j >= 0 ? j : undefined);
        }),
      };
      const stack = fitStack(railInput, previous ? { previous: previous.stack } : {});
      const tabs = stack.items.filter((p) => p.kind === "rail").map((p) => p.id);
      const closedTabs = new Set(shown.filter((id) => scene.items[id]!.closed));
      return { stack, free, tabs, closedTabs, input: railInput };
    }
  }
  const size = edge.size;
  if (typeof size === "number" && Number.isFinite(size) && hasSetter(free, formsById)) {
    const setters = free.items.filter((p) => p.kind !== "menu" && formSetsCross(formsById(p.id)[p.form]!));
    const lo = Math.max(px(edge.cross.min), ...setters.map((p) => crossMinOf(formsById(p.id)[p.form]!)));
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
function zoneStarts(scene: Scene, fit: StackFit, input: StackInput): Map<string, number> {
  const column = fit.axis === "column";
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const out = new Map<string, number>();
  const drawn = fit.items.filter((p) => p.kind !== "menu");
  for (const p of drawn) out.set(p.id, at(p.rect));
  const gap = px(input.gap);
  const start = px(input.pad?.start);
  const end = px(input.pad?.end);
  const menu = fit.menu ? len(fit.menu.rect) + (drawn.length > 0 ? gap : 0) : 0;
  const used = drawn.reduce((s, p) => s + len(p.rect), 0) + Math.max(0, drawn.length - 1) * gap;
  const spare = fit.length - start - end - menu - used;
  if (spare <= EPS) return out;
  const zone = (z: Zone) => drawn.filter((p) => zoneOf(scene.items[p.id]) === z);
  const total = (ps: readonly { rect: Rect }[]): number => ps.reduce((s, p) => s + len(p.rect), 0) + Math.max(0, ps.length - 1) * gap;
  const lay = (ps: readonly { id: string; rect: Rect }[], from: number): void => {
    let c = from;
    for (const p of ps) {
      out.set(p.id, c);
      c += len(p.rect) + gap;
    }
  };
  const s = zone("start");
  const c = zone("center");
  const e = zone("end");
  lay(s, start);
  const endStart = fit.length - end - menu - total(e);
  lay(e, endStart);
  const lo = start + total(s) + (s.length > 0 ? gap : 0);
  const hi = endStart - (e.length > 0 ? gap : 0);
  // Centred on the edge's middle (so a centred readout stays put while the other zones change), kept between them.
  const mid = (fit.length - total(c)) / 2;
  lay(c, Math.max(lo, Math.min(mid, hi - total(c))));
  return out;
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

export function solve(scene: Scene, options: SolveOptions = {}): SceneLayout {
  const previous = options.previous;
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

  const lay = (edge: Edge, area: Rect, cut: boolean): Rect => {
    const column = axisOf(edge.side) === "column";
    const length = column ? area.height : area.width;
    const room = Math.max(0, column ? area.width : area.height);
    const solved = solveEdge(scene, edge, owned.get(edge)!, length, room, previous?.edges[edge.id]);
    const { stack } = solved;
    const thick = stack.items.length === 0 ? 0 : Math.min(stack.cross, room);
    const r =
      edge.side === "top"
        ? rect(area.x, area.y, area.width, thick)
        : edge.side === "bottom"
          ? rect(area.x, area.y + area.height - thick, area.width, thick)
          : edge.side === "left"
            ? rect(area.x, area.y, thick, area.height)
            : rect(area.x + area.width - thick, area.y, thick, area.height);
    const starts = zoneStarts(scene, stack, solved.input);
    const toStage = (l: Rect, id?: string): Rect => {
      const s = id !== undefined ? starts.get(id) : undefined;
      const x = column ? l.x : (s ?? l.x);
      const y = column ? (s ?? l.y) : l.y;
      return rect(r.x + x, r.y + y, l.width, l.height);
    };
    const tabs = new Set(solved.tabs);
    for (const p of stack.items) {
      const it = scene.items[p.id]!;
      const inMenu = p.kind === "menu";
      items[p.id] = {
        rect: toStage(p.rect, inMenu ? undefined : p.id),
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
    };
    if (!cut) return area;
    return edge.side === "top"
      ? rect(area.x, area.y + thick, area.width, area.height - thick)
      : edge.side === "bottom"
        ? rect(area.x, area.y, area.width, area.height - thick)
        : edge.side === "left"
          ? rect(area.x + thick, area.y, area.width - thick, area.height)
          : rect(area.x, area.y, area.width - thick, area.height);
  };

  let area = stage;
  for (const e of order) if (e.mode !== "overlay") area = lay(e, area, true);
  const content = area;
  let over = content;
  for (const e of order) if (e.mode === "overlay") over = lay(e, over, true);

  // Floats: clear of every docked item, every bar and the chrome.
  const avoid: Rect[] = [];
  for (const l of Object.values(items)) avoid.push(l.rect);
  for (const e of Object.values(edges)) {
    if (axisOf(e.side) === "row" && e.cross > 0) avoid.push(e.rect);
    if (e.menu) avoid.push(e.menu.rect);
  }
  for (const c of scene.chrome ?? []) avoid.push(c);
  const floats: string[] = [];
  for (const f of scene.floats) {
    if (!claim(f.id)) continue;
    const it = scene.items[f.id]!;
    if (it.closed) continue;
    const orient = f.orient === "row" ? "row" : "column";
    const forms = formsOf(it, orient);
    const from = forms.length === 0 ? 0 : Math.min(Math.max(0, Math.floor(finite(it.from, 0))), forms.length - 1);
    const form = forms[from];
    let w = px(f.rect.width);
    let h = px(f.rect.height);
    if (from > 0 && form) {
      // Its bar: the form's natural length along its orient, the other size kept.
      if (orient === "column") h = px(form.main.natural);
      else w = px(form.main.natural);
    }
    const want = f.anchor ? anchored(content, w, h, f.anchor) : rect(finite(f.rect.x, stage.x), finite(f.rect.y, stage.y), w, h);
    const fit = fitFloat(want, stage, avoid);
    if (fit.clamped) notes.push({ code: "float-clamped", id: f.id });
    if (fit.snapped) notes.push({ code: "float-moved", id: f.id });
    if (fit.covers.length > 0) notes.push({ code: "float-covers", id: f.id });
    items[f.id] = { rect: fit.rect, kind: it.kind, form: from, formKind: form?.kind ?? "open", floating: true };
    floats.push(f.id);
  }
  return { items, edges, content, floats, notes };
}
