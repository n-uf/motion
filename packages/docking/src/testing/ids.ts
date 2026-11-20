/**
 * The host's id map (`CaseHost.ids`): a row names its items and edges one way (`views`, `tools`, `left-0`) and a host
 * may name the same things another (`panels`, `commands`). `ids` maps a row's id to the host's. The runner passes
 * every id to the host in the host's words (the state, the gestures, the `stops` and `itemSelector` calls) and reads
 * everything back in the row's words (the layout, the stored form, the stops), so a row's expectations never change.
 *
 * One mapping function does both ways: `mapState`, `mapGesture`, `mapLayout`, `mapStored` and `mapPlace` take the
 * function that renames one id, `to` the host's or `from` the host's, and rebuild their value with every id position
 * renamed (and nothing else: a layout's `notes` list, a kind or a zone is never an id, whatever it is called). An id
 * the map doesn't name passes through. The map must be one to one: two row ids on one host id are an error.
 *
 * What it covers: the DockState (item and edge ids, each edge's `items`, the floats), a gesture (`item`, `edge`, and the
 * edge of a `gap` or `side` place), the layout (item and edge keys, an item's `edge` and `rides`, an edge's menu, tabs
 * and `rides`, the rail segments, the floats, a note's `id` and `edge`, and the ids inside an edge's `stack` and `free`
 * fits) and the stored form.
 */
import type { StackFit } from "@n-uf/placement/stack";
import type { DockState, DockEdgeLayout, DockLayout, DockNote, DropPlace, StoredDockState } from "../index";
import type { Gesture } from "./types";

/** A row id to the host's id. */
export type IdMap = Readonly<Record<string, string>>;

/** One rename of one id. */
export type Rename = (id: string) => string;

/** The renames of a map: `to` (a row's id to the host's) and `from` (back); the identity with no map. */
export function idRenames(ids: IdMap | undefined): { readonly to: Rename; readonly from: Rename; readonly active: boolean } {
  const entries = Object.entries(ids ?? {});
  if (entries.length === 0) return { to: (id) => id, from: (id) => id, active: false };
  const back = new Map<string, string>();
  const fwd = new Map<string, string>(entries);
  for (const [row, host] of entries) {
    if (back.has(host)) throw new Error(`the id map names the host id "${host}" for both "${back.get(host)}" and "${row}"`);
    back.set(host, row);
  }
  return { to: (id) => fwd.get(id) ?? id, from: (id) => back.get(id) ?? id, active: true };
}

const rekey = <T>(r: Readonly<Record<string, T>>, f: Rename, v: (x: T, k: string) => T = (x) => x): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const [k, x] of Object.entries(r)) out[f(k)] = v(x, k);
  return out;
};

/** A state with every item and edge id renamed. */
export function mapState(s: DockState, f: Rename): DockState {
  return {
    ...s,
    edges: s.edges.map((e) => ({ ...e, id: f(e.id), items: e.items.map(f) })),
    items: rekey(s.items, f, (it) => ({ ...it, id: f(it.id) })),
    floats: s.floats.map((x) => ({ ...x, id: f(x.id) })),
  };
}

/** A place with its edge (a `gap` or `side` place) renamed. */
export function mapPlace(p: DropPlace, f: Rename): DropPlace {
  return p.kind === "gap" || p.kind === "side" ? { ...p, edge: f(p.edge) } : p;
}

/** A gesture with its `item`, `edge` and place renamed. */
export function mapGesture(g: Gesture, f: Rename): Gesture {
  return { ...g, ...(g.item !== undefined ? { item: f(g.item) } : {}), ...(g.edge !== undefined ? { edge: f(g.edge) } : {}), ...(g.place ? { place: mapPlace(g.place, f) } : {}) };
}

const mapNote = (n: DockNote, f: Rename): DockNote => {
  const out: Record<string, unknown> = { ...n };
  if ("id" in n && typeof n.id === "string") out.id = f(n.id);
  if ("edge" in n && typeof n.edge === "string") out.edge = f(n.edge);
  return out as unknown as DockNote;
};

/** A stack fit (an edge's `stack` or `free`) with the ids of its items, menu, notes and steps renamed. */
const mapFit = (fit: StackFit, f: Rename): StackFit => ({
  ...fit,
  items: fit.items.map((it) => ({ ...it, id: f(it.id) })),
  menu: fit.menu ? { ...fit.menu, items: fit.menu.items.map(f) } : null,
  notes: fit.notes.map((n) => ("id" in n ? { ...n, id: f(n.id) } : n)),
  ...(fit.steps ? { steps: fit.steps.map((s) => ({ ...s, id: f(s.id) })) } : {}),
});

/** A layout with every id renamed (see the module's docs for which). */
export function mapLayout(l: DockLayout, f: Rename): DockLayout {
  const edge = (e: DockEdgeLayout): DockEdgeLayout => ({
    ...e,
    stack: mapFit(e.stack, f),
    free: mapFit(e.free, f),
    menu: e.menu ? { ...e.menu, items: e.menu.items.map(f) } : null,
    items: (e.items ?? []).map(f),
    tabs: e.tabs.map(f),
    ...(e.rides !== undefined ? { rides: f(e.rides) } : {}),
  });
  const rails: Partial<Record<"left" | "right", NonNullable<DockLayout["rails"]["left"]>>> = {};
  for (const side of ["left", "right"] as const) {
    const r = l.rails[side];
    if (r) rails[side] = { ...r, segments: r.segments.map((s) => ({ ...s, id: f(s.id), edge: f(s.edge) })) };
  }
  return {
    ...l,
    items: rekey(l.items, f, (it) => ({ ...it, ...(it.edge !== undefined ? { edge: f(it.edge) } : {}), ...(it.rides !== undefined ? { rides: f(it.rides) } : {}) })),
    edges: rekey(l.edges, f, edge),
    floats: l.floats.map(f),
    rails,
    notes: l.notes.map((n) => mapNote(n, f)),
  };
}

/** A stored form with every id renamed. */
export function mapStored(s: StoredDockState, f: Rename): StoredDockState {
  return {
    ...s,
    edges: s.edges.map((e) => ({ ...e, id: f(e.id), items: e.items.map(f) })),
    floats: s.floats.map((x) => ({ ...x, id: f(x.id) })),
    items: rekey(s.items, f),
  };
}
