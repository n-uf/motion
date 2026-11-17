/**
 * The layout as `solve` builds it, phase by phase: who owns which item, the notes, and every item and edge drawn so
 * far. `emit` draws one solved edge into it: its items placed by zone, their shapes, its notes and its edge layout.
 */
import { EPS, rect, type Rect } from "../../geometry";
import { formMain, wrapLines, type StackFit, type StackForm, type StackInput } from "../../stack";
import { axisOf, foldedByOf, formsOf, zoneOf } from "../helpers";
import type { Edge, Scene, SceneEdgeLayout, SceneItemLayout, SceneLayout, SceneNote, SceneRailLayout, SolveOptions, Zone } from "../model";
import type { EdgeSolve } from "./edge";
import { cutOrder, finite, px } from "./order";

export interface Draft {
  /** The scene as solved: an item that has just opened counts as the newest. */
  readonly scene: Scene;
  readonly previous: SceneLayout | undefined;
  /** Items docked now that were closed or absent in `previous`. */
  readonly opened: ReadonlySet<string>;
  /** `SolveOptions.fresh`. */
  readonly fresh: ReadonlySet<string>;
  /** The edges in cut order. */
  readonly order: readonly Edge[];
  /** Each edge's items, the first place in cut order winning. */
  readonly owned: ReadonlyMap<Edge, string[]>;
  /** Claims an item for one place: false (with a note) when it is unknown or placed already. */
  readonly claim: (id: string) => boolean;
  /** The edge's layout before, or none when it (or an item in it) is `fresh`. */
  readonly prevEdge: (edge: Edge) => SceneEdgeLayout | undefined;
  readonly notes: SceneNote[];
  readonly items: Record<string, SceneItemLayout>;
  readonly edges: Record<string, SceneEdgeLayout>;
  readonly rails: Partial<Record<"left" | "right", SceneRailLayout>>;
  readonly railPlaces: Partial<Record<"left" | "right", Rect>>;
  columnRoom?: boolean;
}

/** A new draft of `given`: an item docked now that was closed or absent in `previous` counts as the newest. */
export function createDraft(given: Scene, options: SolveOptions): Draft {
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
  // A closed item is not a removed one. One that opens into an edge where items stayed open is a request to show it: it
  // counts as the newest there. One that opens into an edge whose items were all closed comes back as it was, with its
  // age (its edge's give-way, kept while it was closed, applies again). Opened together, the newest keep their order
  // among themselves, the one used longer ago still the older.
  const stayedOpen = (e: Scene["edges"][number]): boolean => e.items.some((id) => !opened.has(id) && Object.hasOwn(given.items, id) && !given.items[id]!.closed && !given.items[id]!.fixed);
  const newest = Object.values(given.items).reduce((m, it) => Math.max(m, finite(it.used, 0)), 0) + 1;
  const byAge = [...opened]
    .filter((id) => given.edges.some((e) => e.items.includes(id) && stayedOpen(e)))
    .sort((a, b) => finite(given.items[a]!.used, 0) - finite(given.items[b]!.used, 0) || (a < b ? -1 : 1));
  const scene: Scene = byAge.length === 0 ? given : { ...given, items: { ...given.items, ...Object.fromEntries(byAge.map((id, k) => [id, { ...given.items[id]!, used: newest + k }])) } };
  // `fresh` edges, and edges holding a `fresh` item, are solved without `previous`.
  const fresh = new Set(options.fresh ?? []);
  const prevEdge = (edge: Edge): SceneEdgeLayout | undefined => (!previous || fresh.has(edge.id) || edge.items.some((id) => fresh.has(id)) ? undefined : previous.edges[edge.id]);
  const notes: SceneNote[] = [];
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
  return { scene, previous, opened, fresh, order, owned, claim, prevEdge, notes, items: {}, edges: {}, rails: {}, railPlaces: {} };
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

/**
 * The fit with zones packed: when the drawn items leave spare length, start items pack from the start, end items from
 * the end (before the » entry), center items centered between. Returns the main-axis start per id.
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
  // Centered on the edge's middle (so a centered readout stays put while the other zones change), kept between them; in
  // a title bar, where the middle isn't clear of the title and the trailing items, centered in the free span instead.
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

/** Draws an edge's stack at `r` (its stage rect): its items, notes and edge layout. */
export function emit(d: Draft, edge: Edge, r: Rect, solved: EdgeSolve, extra: Partial<SceneEdgeLayout> = {}): void {
  const { scene, notes, items, edges } = d;
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
    const f = formsOf(it, column ? "column" : "row")[p.form];
    const shape = inMenu ? {} : shapeOf(f, drawnRect, column ? "column" : "row", stack.cross);
    const foldedBy = foldedByOf(it, formsOf(it, column ? "column" : "row"), p.form, solved.starts.get(p.id), edge);
    items[p.id] = {
      ...shape,
      hidden: inMenu ? [] : (f?.hides ?? []),
      rect: drawnRect,
      kind: it.kind,
      form: p.form,
      formKind: p.kind,
      edge: edge.id,
      zone: zoneOf(it),
      ...(inMenu ? { inMenu: true } : {}),
      ...(tabs.has(p.id) ? { tab: true } : {}),
      ...(tabs.has(p.id) && f?.title === true && (edge.side === "left" || edge.side === "right") ? { railTitle: edge.side } : {}),
      ...(solved.closedTabs.has(p.id) ? { closed: true } : {}),
      ...(foldedBy ? { foldedBy } : {}),
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
    // The stack's items are in zone order, the order `emit` drew them in.
    items: stack.items.map((p) => p.id),
    tabs: solved.tabs,
    stack,
    free: solved.free,
    ...extra,
  };
}
