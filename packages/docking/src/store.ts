/**
 * The state's stored form. `storeDockState(state)` gives plain JSON-safe data; `readDockState(data, base)` reads it back over
 * `base` (the host's state as it starts: its item definitions, edges, kinds and stage) and never throws.
 *
 * ```ts
 * interface StoredDockState {
 *   v: 1;
 *   edges: { id: string; side: Side; ring: number; items: string[]; size?: number; column?: true }[];
 *   floats: { id: string; x: number; y: number; width: number; height: number; orient?: "row" | "column"; anchor?: FloatAnchor | { at: FloatAnchor; dx?: number; dy?: number }; since?: number }[];
 *   items: Record<string, { used: number; kept?: true; from?: number; closed?: true; align?: "center" | "end"; space?: number; length?: { column?: number; row?: number }; floatSizes?: { row?: { width: number; height: number }; column?: { width: number; height: number } } }>;
 *   railModes?: { left?: "titles" | "icons"; right?: "titles" | "icons" };
 * }
 * ```
 *
 * Nothing about kinds, forms or limits is stored: those are the host's (`base`). An edge is matched by its id: its
 * side, ring and limits come from `base`, its order of items and its `size` from the store; a static edge stored on
 * the other side of its axis is moved there (`setSide`, as its side's outermost edge). Dynamic columns
 * (`column: true`) are the store's: one `base` lacks is made from `base.columns[side]`, its ring is the stored one, and
 * columns left empty are deleted, the rings closed up. `DockEdge.hidden` is view state, not stored: the host decides it
 * each time it builds the state (from the window's width, say). A hidden edge's items are stored like any edge's;
 * `hidden` itself is not written, and read back it comes from `base` only (a stored `hidden` is ignored and listed as
 * `edge:<id>:hidden`). `DockEdge.showIn` is the same: never written, from `base` only, a stored one listed as
 * `edge:<id>:showIn`; the items a hidden edge lends are stored in it, as they are. No float has a pinned field: one
 * an old store has is listed and ignored.
 *
 * Reading is lenient: anything but an object of version 1 gives `base` back with the reason in `error`. Inside one,
 * whatever can't be used is dropped and listed in `dropped` (an unknown edge `edge:<id>`, an unknown or repeated item,
 * an item an edge doesn't accept `edge:<edge>:<id>`, a fixed item in another edge than `base`'s `edge:<edge>:<id>`, a
 * float of a kind that doesn't float `float:<id>`, a bad field `item:<id>:<field>`, an unknown top-level field
 * `<field>`). A stored edge's order is kept exactly, fixed items where the store put them (in their own edge); a fixed
 * item the store lacks goes back to its base place (trailing ones last). An item the store places nowhere goes where
 * `base` has it, before a stored trailing run of fixed items.
 * A float's rect is clamped into the stage on read; its anchor, with any offset, is kept as stored (an anchored float
 * lies by its anchor, so the clamp never turns it into a pixel position). An unusable anchor is dropped
 * (`float:<id>:anchor`), and so is a bad offset field (`float:<id>:anchor:dx`, `float:<id>:anchor:<field>`). A float's
 * `since` is kept as stored; one that isn't a number from 0 to `Number.MAX_SAFE_INTEGER` is dropped (`float:<id>:since`).
 * An item's asked length (`DockItem.length`) is stored per axis; one entry that isn't a number over 0 (a 0 is no length, so it is not stored), or an axis that
 * isn't `row` or `column`, is dropped (`item:<id>:length:<axis>`), a `length` that isn't an object too
 * (`item:<id>:length`). A store from before has none, and an item then reads with none whatever `base` had: the store
 * is the state's own.
 * A float's size is stored per orient (`floatSizes`); one entry that isn't a size, or an orient that isn't `row` or
 * `column`, is dropped (`item:<id>:floatSizes:<orient>`). A store from before that, with one `floatSize` on an item,
 * reads as `floatSizes` for the orient its float is in (the item's own orient where it floats nowhere), so the size
 * never follows the float to the other orient; a docked item keeps it for its next float-out. On a float whose store
 * declares no `floatSizes` it is dropped (`item:<id>:floatSize`): such a float is framed at its stored rect, which the
 * size would replace.
 */
import { EPS, rect, type Size } from "@n-uf/placement";
import { clampFloat, closeRings, drawnFloatSize, prune, setSide, withFloatSizes } from "./changes";
import { axisOf, columnFromTemplate, declaresFloatSizes, floatOrientOf, isSince } from "./helpers";
import { checkEdgeIds, isReservedEdgeId } from "./targets/ids";
import { FLOAT_ANCHORS, RAIL_MODES, SIDES, type DockEdge, type FloatAnchor, type FloatAnchorAt, type Orient, type RailMode, type DockState, type DockFloat, type DockItem, type Side } from "./model";

export interface StoredDockStateEdge {
  readonly id: string;
  readonly side: Side;
  readonly ring: number;
  readonly items: readonly string[];
  readonly size?: number;
  /** A dynamic column: read back from `base.columns[side]` even when `base` doesn't have it. */
  readonly column?: true;
}

export interface StoredDockStateFloat {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly orient?: Orient;
  /** An anchor's name, or `{ at, dx?, dy? }`: an anchor with an offset in px. */
  readonly anchor?: FloatAnchorAt;
  /** When it was floated (`DockFloat.since`). */
  readonly since?: number;
}

export interface StoredDockStateItem {
  readonly used: number;
  readonly kept?: true;
  readonly from?: number;
  readonly closed?: true;
  readonly align?: "center" | "end";
  /** `DockItem.space`, px. */
  readonly space?: number;
  /** `DockItem.length`: the length asked for, per axis. */
  readonly length?: { readonly column?: number; readonly row?: number };
  /** `DockItem.floatSizes`: its float size per orient. */
  readonly floatSizes?: { readonly row?: Size; readonly column?: Size };
  /**
   * The old single float size, from a state stored before sizes were kept per orient: `readDockState` reads it as
   * `floatSizes` for the orient its float is in (the item's own where it floats nowhere). `storeDockState` never writes
   * it.
   */
  readonly floatSize?: Size;
}

export interface StoredDockState {
  readonly v: 1;
  readonly edges: readonly StoredDockStateEdge[];
  readonly floats: readonly StoredDockStateFloat[];
  readonly items: Readonly<Record<string, StoredDockStateItem>>;
  /** Per side, how its rails show their items (`DockState.railModes`), when the state sets one. */
  readonly railModes?: Readonly<Partial<Record<"left" | "right", RailMode>>>;
}

export interface DockStateRead {
  readonly state: DockState;
  /** What was left out, as listed in the module's docs. */
  readonly dropped: readonly string[];
  /** Set when nothing could be read: `state` is `base`. */
  readonly error?: string;
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isSize = (x: unknown): x is number => isNum(x) && x > 0;
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isAnchor = (x: unknown): x is FloatAnchor => FLOAT_ANCHORS.includes(x as FloatAnchor);

/**
 * The float anchor in `v`, as plain data: a name, or `{ at, dx?, dy? }` with its finite offsets; undefined when there is
 * none or it can't be used. `drop` hears what is left out: `""` for the whole anchor (an unknown name, an offset with no
 * valid `at`), `":dx"` / `":dy"` for an offset that isn't a number, `":<field>"` for an unknown field.
 */
function anchorOf(v: unknown, drop?: (what: string) => void): FloatAnchorAt | undefined {
  if (v === undefined) return undefined;
  if (isAnchor(v)) return v;
  if (!isObject(v) || !isAnchor(v.at)) {
    drop?.("");
    return undefined;
  }
  for (const k of Object.keys(v)) if (k !== "at" && k !== "dx" && k !== "dy") drop?.(`:${k}`);
  for (const k of ["dx", "dy"] as const) if (v[k] !== undefined && !isNum(v[k])) drop?.(`:${k}`);
  return { at: v.at, ...(isNum(v.dx) ? { dx: v.dx } : {}), ...(isNum(v.dy) ? { dy: v.dy } : {}) };
}
/** Records with no prototype, so an id such as `constructor` is only a key; `__proto__` is refused. */
const record = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

/** The valid rail modes of `v` (left and right only), or null when it has none. */
function railModesOf(v: unknown, drop?: (what: string) => void): Partial<Record<"left" | "right", RailMode>> | null {
  if (v === undefined) return null;
  if (!isObject(v)) {
    drop?.("railModes");
    return null;
  }
  const out: Partial<Record<"left" | "right", RailMode>> = {};
  for (const k of Object.keys(v)) {
    const m = v[k];
    if ((k === "left" || k === "right") && RAIL_MODES.includes(m as RailMode)) out[k] = m as RailMode;
    else drop?.(`railModes:${k}`);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The usable `floatSizes` of `it`, as plain data; undefined when it has none. */
function floatSizesStored(it: DockItem): { row?: Size; column?: Size } | undefined {
  const out: { row?: Size; column?: Size } = {};
  for (const o of ["row", "column"] as const) {
    const s = it.floatSizes?.[o];
    if (s && isSize(s.width) && isSize(s.height)) out[o] = { width: s.width, height: s.height };
  }
  return out.row || out.column ? out : undefined;
}

/** The usable `length` of `it` (an axis that is a number over 0: a 0 is no length), as plain data; undefined when it has none. */
function lengthStored(it: DockItem): { column?: number; row?: number } | undefined {
  const out: { column?: number; row?: number } = {};
  for (const o of ["column", "row"] as const) {
    const v = it.length?.[o];
    if (isNum(v) && v > EPS) out[o] = v;
  }
  return out.column !== undefined || out.row !== undefined ? out : undefined;
}

export function storeDockState(state: DockState): StoredDockState {
  const items = record<StoredDockStateItem>();
  for (const [id, it] of Object.entries(state.items)) {
    if (id === "__proto__") continue;
    const sizes = floatSizesStored(it);
    const asked = lengthStored(it);
    items[id] = {
      used: isNum(it.used) ? it.used : 0,
      ...(it.kept ? { kept: true as const } : {}),
      ...(isNum(it.from) && it.from >= 1 ? { from: Math.floor(it.from) } : {}),
      ...(it.closed ? { closed: true as const } : {}),
      ...(it.align === "center" || it.align === "end" ? { align: it.align } : {}),
      ...(isNum(it.space) && it.space > 0 ? { space: it.space } : {}),
      ...(asked ? { length: asked } : {}),
      ...(sizes ? { floatSizes: sizes } : {}),
    };
  }
  const modes = railModesOf(state.railModes);
  return {
    v: 1,
    edges: state.edges.map((e) => ({ id: e.id, side: e.side, ring: e.ring, items: [...e.items], ...(isNum(e.size) ? { size: e.size } : {}), ...(e.column === true ? { column: true as const } : {}) })),
    floats: state.floats
      .filter((f) => isNum(f.rect.x) && isNum(f.rect.y) && isSize(f.rect.width) && isSize(f.rect.height))
      .map((f) => {
        const anchor = anchorOf(f.anchor);
        return { id: f.id, x: f.rect.x, y: f.rect.y, width: f.rect.width, height: f.rect.height, ...(f.orient ? { orient: f.orient } : {}), ...(anchor ? { anchor } : {}), ...(isSince(f.since) ? { since: f.since } : {}) };
      }),
    items,
    ...(modes ? { railModes: modes } : {}),
  };
}

export function readDockState(data: unknown, base: DockState): DockStateRead {
  checkEdgeIds(base);
  try {
    return read(data, base);
  } catch (e) {
    return { state: base, dropped: [], error: `unreadable: ${e instanceof Error ? e.message : typeof e}` };
  }
}

const words = (v: unknown): string => (typeof v === "number" ? String(v) : typeof v === "string" ? JSON.stringify(v.length > 24 ? `${v.slice(0, 24)}…` : v) : typeof v);

/**
 * The fixed items of `baseIds` that `stored` lacks, put back at their places: leading ones from the start, trailing ones
 * at the end. Fixed items the store has keep the place it gives them, so a stored order round-trips exactly.
 */
function withFixed(baseIds: readonly string[], stored: readonly string[], isFixed: (id: string) => boolean): string[] {
  const out = [...stored];
  const missing = (id: string): boolean => isFixed(id) && !stored.includes(id);
  let tail = baseIds.length;
  while (tail > 0 && isFixed(baseIds[tail - 1]!)) tail--;
  baseIds.forEach((id, i) => {
    if (missing(id) && i < tail) out.splice(Math.min(i, out.length), 0, id);
  });
  return [...out, ...baseIds.slice(tail).filter(missing)];
}

function read(data: unknown, base: DockState): DockStateRead {
  if (!isObject(data)) return { state: base, dropped: [], error: "not an object" };
  if (data.v !== 1) return { state: base, dropped: [], error: `unknown version ${words(data.v)} (this reads version 1)` };
  const dropped: string[] = [];
  const drop = (what: string): void => {
    if (!dropped.includes(what)) dropped.push(what);
  };
  for (const k of Object.keys(data)) if (!["v", "edges", "floats", "items", "railModes"].includes(k)) drop(k);
  // The rail modes: the store's per side, over `base`'s.
  const storedModes = railModesOf(data.railModes, drop);
  const railModes = storedModes ? { ...base.railModes, ...storedModes } : base.railModes;
  const known = (id: unknown): id is string => typeof id === "string" && id !== "__proto__" && Object.hasOwn(base.items, id);
  const isFixed = (id: string): boolean => known(id) && base.items[id]!.fixed === true;

  // The items' states.
  const items: Record<string, DockItem> = { ...base.items };
  // The items whose store has the old single `floatSize`, with it.
  const legacy = new Map<string, Size>();
  if (data.items !== undefined && !isObject(data.items)) drop("items");
  else if (isObject(data.items)) {
    for (const id of Object.keys(data.items)) {
      const s = data.items[id];
      if (!known(id) || !isObject(s)) {
        drop(`item:${id}`);
        continue;
      }
      const b = base.items[id]!;
      const { kept: _k, from: _f, closed: _c, align: _a, space: _sp, length: _len, floatSizes: _ss, ...plain } = b;
      let it: DockItem = { ...plain, used: b.used };
      for (const k of Object.keys(s)) if (!["used", "kept", "from", "closed", "align", "space", "length", "floatSize", "floatSizes"].includes(k)) drop(`item:${id}:${k}`);
      if (isNum(s.used)) it = { ...it, used: s.used };
      else if (s.used !== undefined) drop(`item:${id}:used`);
      if (s.kept === true) it = { ...it, kept: true };
      else if (s.kept !== undefined && s.kept !== false) drop(`item:${id}:kept`);
      // A fixed item keeps `base`'s fold, but on an edge that lets the user fold it (`DockEdge.foldable`).
      const byHand = !b.fixed || base.edges.some((e) => e.foldable === true && e.items.includes(id));
      if (isNum(s.from) && Number.isInteger(s.from) && s.from >= 1 && byHand) it = { ...it, from: s.from };
      else if (s.from !== undefined) drop(`item:${id}:from`);
      if (!byHand && b.from !== undefined) it = { ...it, from: b.from };
      if (s.closed === true && !b.fixed) it = { ...it, closed: true };
      else if (s.closed !== undefined && s.closed !== false) drop(`item:${id}:closed`);
      if (s.align === "center" || s.align === "end") it = { ...it, align: s.align };
      else if (s.align !== undefined && s.align !== "start") drop(`item:${id}:align`);
      if (b.fixed && b.align) it = { ...it, align: b.align };
      if (isNum(s.space) && s.space > 0 && !b.fixed) it = { ...it, space: s.space };
      else if (s.space !== undefined) drop(`item:${id}:space`);
      if (isObject(s.length)) {
        const asked: { column?: number; row?: number } = {};
        for (const k of Object.keys(s.length)) {
          const v = s.length[k];
          if ((k === "column" || k === "row") && isNum(v) && v > EPS) asked[k] = v;
          else drop(`item:${id}:length:${k}`);
        }
        if (asked.column !== undefined || asked.row !== undefined) it = { ...it, length: asked };
      } else if (s.length !== undefined) drop(`item:${id}:length`);
      const fs = s.floatSize;
      // The old single size moves into `floatSizes` once the floats are read (below): it belongs to the orient its float is
      // in.
      if (isObject(fs) && isSize(fs.width) && isSize(fs.height)) legacy.set(id, { width: fs.width, height: fs.height });
      else if (fs !== undefined) drop(`item:${id}:floatSize`);
      const sizes = s.floatSizes;
      if (isObject(sizes)) {
        const own: { row?: Size; column?: Size } = {};
        for (const k of Object.keys(sizes)) {
          const v = sizes[k];
          if ((k === "row" || k === "column") && isObject(v) && isSize(v.width) && isSize(v.height)) own[k] = { width: v.width, height: v.height };
          else drop(`item:${id}:floatSizes:${k}`);
        }
        if (own.row || own.column) it = { ...it, floatSizes: own };
      } else if (sizes !== undefined) drop(`item:${id}:floatSizes`);
      items[id] = it;
    }
  }

  // Where they are: stored edges by id, then stored floats.
  const placed = new Set<string>();
  const order = new Map<string, string[]>();
  const sizes = new Map<string, number | undefined>();
  const made: DockEdge[] = [];
  const rings = new Map<string, number>();
  const moves = new Map<string, Side>();
  const anchorMoves = new Map<string, Side>();
  const anchorSizes = new Map<string, number>();
  if (data.edges !== undefined && !Array.isArray(data.edges)) drop("edges");
  for (const e of Array.isArray(data.edges) ? (data.edges as unknown[]) : []) {
    if (!isObject(e) || typeof e.id !== "string") {
      drop("an edge with no id");
      continue;
    }
    let edge = base.edges.find((x) => x.id === e.id) ?? made.find((x) => x.id === e.id);
    // An anchor (a fixed item) listed in an entry other than its own edge's: the entry says where and how big the
    // anchor's edge is (a store that kept the anchor inside a side edge). Its own static edge goes to that side and
    // takes that size; the anchor stays in it. An anchor's edge takes nothing (`accepts: []`); a fixed item of an edge
    // that takes items (a title in its title bar) listed elsewhere is dropped, as before.
    const listed = Array.isArray(e.items) ? (e.items as unknown[]) : [];
    const anchorEdges = base.edges.filter((b) => b.column !== true && b.accepts.length === 0 && b.id !== edge?.id && b.items.some((id) => isFixed(id) && listed.includes(id)));
    for (const b of anchorEdges) {
      const side = SIDES.includes(e.side as Side) ? (e.side as Side) : edge?.side;
      if (side && side !== b.side && axisOf(side) === axisOf(b.side)) anchorMoves.set(b.id, side);
      if (isNum(e.size)) anchorSizes.set(b.id, e.size);
    }
    const describesAnchor = anchorEdges.length > 0;
    if (!edge && describesAnchor) continue;
    // A stored column under a virtual edge's id (`column:<side>`, `rail:<side>`) is dropped, never made.
    if (!edge && e.column === true && (e.side === "left" || e.side === "right") && base.columns?.[e.side] && !isReservedEdgeId(e.id)) {
      // A column the user made: from its side's template.
      edge = columnFromTemplate(base.columns[e.side]!, e.id, e.side, isNum(e.ring) ? e.ring : Infinity, []);
      made.push(edge);
    }
    if (!edge || order.has(edge.id)) {
      drop(`edge:${e.id}`);
      continue;
    }
    if (edge.column === true && isNum(e.ring)) rings.set(edge.id, e.ring);
    // `hidden` and `showIn` are the host's view state, from `base`: a stored one is ignored.
    if (e.hidden !== undefined) drop(`edge:${edge.id}:hidden`);
    if (e.showIn !== undefined) drop(`edge:${edge.id}:showIn`);
    if (e.side !== undefined && !SIDES.includes(e.side as Side)) drop(`edge:${e.id}:side`);
    else if (!describesAnchor && edge.column !== true && typeof e.side === "string" && e.side !== edge.side && axisOf(e.side as Side) === axisOf(edge.side)) moves.set(edge.id, e.side as Side);
    const ids: string[] = [];
    for (const id of Array.isArray(e.items) ? (e.items as unknown[]) : []) {
      if (!known(id) || placed.has(id)) drop(`edge:${edge.id}:${String(id)}`);
      // A fixed item stays in the edge `base` has it in, at the place the store gives it there; elsewhere it is dropped.
      else if (isFixed(id)) {
        if (edge.items.includes(id) && base.edges.some((x) => x.id === edge.id)) {
          ids.push(id);
          placed.add(id);
        } else if (!anchorEdges.some((b) => b.items.includes(id))) drop(`edge:${edge.id}:${id}`);
      }
      else if (!edge.accepts.includes(items[id]!.kind)) drop(`edge:${edge.id}:${id}`);
      else {
        ids.push(id);
        placed.add(id);
      }
    }
    order.set(edge.id, ids);
    // The size of an entry that describes an anchor is the anchor's edge's.
    if (describesAnchor) {
      if (!sizes.has(edge.id)) sizes.set(edge.id, edge.size);
    } else if (isNum(e.size)) sizes.set(edge.id, e.size);
    else if (e.size !== undefined) drop(`edge:${edge.id}:size`);
    else sizes.set(edge.id, undefined);
  }
  for (const [id, side] of anchorMoves) moves.set(id, side);
  for (const [id, size] of anchorSizes) sizes.set(id, size);
  const floats: DockFloat[] = [];
  if (data.floats !== undefined && !Array.isArray(data.floats)) drop("floats");
  for (const f of Array.isArray(data.floats) ? (data.floats as unknown[]) : []) {
    if (!isObject(f) || typeof f.id !== "string") {
      drop("a float with no id");
      continue;
    }
    const id = f.id;
    if (!known(id) || placed.has(id) || isFixed(id) || !base.floatKinds.includes(items[id]!.kind) || !isNum(f.x) || !isNum(f.y) || !isSize(f.width) || !isSize(f.height)) {
      drop(`float:${id}`);
      continue;
    }
    for (const k of Object.keys(f)) if (k === "pinned") drop(`pinned:${id}`);
    else if (!["id", "x", "y", "width", "height", "orient", "anchor", "since"].includes(k)) drop(`float:${id}:${k}`);
    const o = f.orient === "row" || f.orient === "column" ? f.orient : undefined;
    if (f.orient !== undefined && !o) drop(`float:${id}:orient`);
    const a = anchorOf(f.anchor, (what) => drop(`float:${id}:anchor${what}`));
    const since = isSince(f.since) ? f.since : undefined;
    if (f.since !== undefined && since === undefined) drop(`float:${id}:since`);
    placed.add(id);
    // Clamped by what solve draws (a folded float's bar), never cut: a reload lands where solve put it.
    const r = rect(f.x, f.y, f.width, f.height);
    const drawn = drawnFloatSize(items[id]!, { rect: r, ...(o ? { orient: o } : {}) });
    floats.push({ id, rect: clampFloat(r, base.stage, drawn), ...(o ? { orient: o } : {}), ...(a ? { anchor: a } : {}), ...(since !== undefined ? { since } : {}) });
  }

  // Each base edge: its stored order exactly (fixed items where the store put them), its base items the store placed
  // nowhere before a stored trailing run of fixed items, and fixed items the store lacks at their base places.
  const edges: DockEdge[] = [...base.edges, ...made].map((edge) => {
    const stored = order.get(edge.id) ?? [];
    const rest = edge.items.filter((id) => !isFixed(id) && !placed.has(id));
    for (const id of rest) placed.add(id);
    let tail = stored.length;
    while (tail > 0 && isFixed(stored[tail - 1]!)) tail--;
    const listed = [...stored.slice(0, tail), ...rest, ...stored.slice(tail)];
    const items1 = withFixed(edge.items, listed, isFixed);
    const size = sizes.has(edge.id) ? sizes.get(edge.id) : edge.size;
    const { size: _s, ...plain } = edge;
    return { ...plain, ring: rings.get(edge.id) ?? edge.ring, items: items1, ...(size !== undefined ? { size } : {}) };
  });
  // Base floats the store placed nowhere keep their base place.
  for (const f of base.floats) if (!placed.has(f.id)) floats.push(f);
  // A stored old single `floatSize` is the size for the orient its float is in (the item's own where it floats nowhere),
  // unless the store gives that orient a size of its own. On a float whose store declares no `floatSizes` it goes: such
  // a float is framed at its stored rect, which a size would replace. A docked item keeps it for its next float-out.
  for (const [id, size] of legacy) {
    const it = items[id]!;
    const float = floats.find((f) => f.id === id);
    if (float && !declaresFloatSizes(it)) {
      drop(`item:${id}:floatSize`);
      continue;
    }
    const orient = float?.orient ?? floatOrientOf(it);
    if (!it.floatSizes?.[orient]) items[id] = withFloatSizes(it, { orient, size });
  }
  // Empty columns go; the sides' rings close up.
  let state = prune({ ...base, ...(railModes ? { railModes } : {}), items, edges: closeRings(edges, new Set(made.length > 0 || rings.size > 0 ? ["left", "right"] : [])), floats });
  for (const [id, side] of moves) state = setSide(state, id, side);
  return { state, dropped };
}
