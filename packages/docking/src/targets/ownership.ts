/**
 * Space ownership (filter iii), in the seen geometry: the committed layout, the item in place, the one the user sees.
 * A stretch is owned by what the user sees there; if the owner has no slot there, it refuses. A drawn edge owns its
 * seen rect (the item's own edge too: its own interval is home's); an edge not drawn (empty, or one that shows only
 * once the item lifts) owns a thin band of its place at its boundary, along its surviving slots' tiles only; the
 * rail likewise. Owned rects rank in the order `solve` lays edges out: one laid before another and pushing it when
 * filled wins (outer before inner, full bars before the sides they push, the rail before its side); between edges laid
 * independently a drawn rect wins over an empty edge's band, two drawn rects yield to each other, and of two bands the
 * one laid first wins. Home's tile is owned before all. A virtual edge owns nothing and yields to every owner.
 */
import { EPS, area, overlaps, rect, subtract, type Rect } from "@n-uf/placement";
import { formBody, type StackForm } from "@n-uf/placement/stack";
import { axisOf, formsOf, hitBandOf } from "../helpers";
import { DEFAULT_HIT_BAND, type DockEdge } from "../model";
import { pushes, type LayKey } from "../solve";
import { EDGE_KINDS } from "./kinds";
import { meet } from "./meet";
import { less, type Ctx, type EdgeSpec, type Room, type Span } from "./model";

/** Whether a drawn form shows its body (an open panel's). */
const isBody = (f: StackForm | undefined): boolean => !!f && formBody(f);

interface Owner {
  /** The edge it is, as the tiler reads it; null for an edge the tiler doesn't read (folded, riding, taking nothing). */
  readonly spec: EdgeSpec | null;
  readonly rect: Rect;
  readonly lay: LayKey;
  readonly place: boolean;
  /** An empty rail's or bar's depth past its thin band (`EdgeSpec.thinOwned`): it yields to a drawn edge that takes the item. */
  readonly deep?: true;
}

/** What clipping reads of ownership. */
export interface Ownership {
  readonly owners: readonly Owner[];
  /** Per spec: the rects it yields (the owners that win over it; for a virtual edge, every other owner too). */
  readonly taken: ReadonlyMap<EdgeSpec, readonly Rect[]>;
  /** A zone's room lost to the owners that win over its edge across its whole depth (`cuts`), and its panel bodies. */
  readonly cutsOf: (s: EdgeSpec) => Room;
  /** The panel bodies and reserved rects of an edge, each cut across its whole band (none for a virtual edge). */
  readonly bodies: (s: EdgeSpec) => Rect[];
  /** The fixed items that don't grow, where they are seen. */
  readonly solid: readonly Rect[];
  /**
   * Every edge's seen rect but `s`'s. A refusal owns nothing, so it yields to them: a stretch is owned by what the user
   * sees there.
   */
  readonly drawnBesides: (s: EdgeSpec) => readonly Rect[];
}

const bandOf = (s: EdgeSpec): Rect => {
  const a = Math.min(...s.zones.map((z) => z.a));
  const b = Math.max(...s.zones.map((z) => z.b));
  return s.vertical ? rect(s.owned[0], a, s.owned[1] - s.owned[0], b - a) : rect(a, s.owned[0], b - a, s.owned[1] - s.owned[0]);
};

/** What it owns: its band, limited along it where it owns less than its zones (a column line's place). */
const ownedRectOf = (s: EdgeSpec): Rect => {
  const b = bandOf(s);
  if (!s.ownedAlong) return b;
  const [a0, a1] = s.ownedAlong;
  return s.vertical ? rect(b.x, a0, b.width, a1 - a0) : rect(a0, b.y, a1 - a0, b.height);
};

/**
 * What an edge owns against the others: its owned rect along the stretches its surviving slots tile, `along` (from the
 * edge tiled on its own, before any other edge cuts it). A stretch with no slot of its own, a refused slot's, a zone
 * whose every slot the filter removes, and home's (owned on its own) own nothing; its drawn rect still counts, as
 * every drawn rect does.
 */
function ownedRectsOf(s: EdgeSpec, along: readonly Span[]): Rect[] {
  if (along.length === 0) return [];
  const o = ownedRectOf(s);
  if (s.ownedAlong) return [o];
  return along.map(([a, b]) => (s.vertical ? rect(o.x, a, o.width, b - a) : rect(a, o.y, b - a, o.height)));
}

/**
 * Every edge's seen rect, with the spec the tiler reads it by (null for an edge it doesn't read), and each side's drawn
 * rail's rect: a drawn rail owns its seen rect as every drawn edge does, so what its stops tile and what they leave
 * (past its last stop, the whole rail for a tile of it, whose stops are all home's) is the rail's, never a column line's.
 * Less the run of the held tile's own column (`ownColumnRun`), which is that column's, tiled before the rail's stops.
 */
function drawnOf(c: Ctx, live: readonly EdgeSpec[]): { spec: EdgeSpec | null; rect: Rect; lay: LayKey }[] {
  const edges = Object.entries(c.now.edges)
    .filter(([id, e]) => area(e.rect) > EPS && c.lay.has(id))
    .map(([id, e]) => ({ spec: live.find((s) => s.edge?.id === id) ?? null, rect: e.rect, lay: c.lay.get(id)! }));
  const rails = (["left", "right"] as const).flatMap((side) => {
    const rail = c.now.rails[side];
    if (!rail || rail.segments.length === 0 || area(rail.rect) <= EPS) return [];
    const spec = live.find((s) => s.kind === "railStop" && s.lay.side === side) ?? null;
    const lay = spec?.lay ?? { phase: EDGE_KINDS.railStop.phase, side, at: -1 };
    const me = c.now.items[c.dragged];
    const run = me?.rail === side ? rail.segments.filter((g) => g.edge === me.edge).map((g) => g.rect) : [];
    if (run.length === 0) return [{ spec, rect: rail.rect, lay }];
    const top = Math.min(...run.map((r) => r.y));
    const own = rect(rail.rect.x, top, rail.rect.width, Math.max(...run.map((r) => r.y + r.height)) - top);
    return subtract(rail.rect, own).map((r) => ({ spec, rect: r, lay }));
  });
  return [...edges, ...rails];
}

/**
 * Home's tile: the item's own rect and, along it, its edge's band (the own interval across the band). Where the lift
 * deletes its edge (the item alone in its column), the edge collapses into home: its whole seen rect. Null for a
 * floating item.
 */
export function homeRectOf(c: Ctx, ownSpec: EdgeSpec | null): Rect | null {
  const own = c.now.items[c.dragged];
  if (!own || own.floating || !own.edge) return null;
  const o = own.rect;
  const hull = (a: Rect, b: Rect): Rect => rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y));
  if (own.inMenu) return o;
  if (!ownSpec) {
    const e = c.now.edges[own.edge];
    const vanishes = !c.rest.edges.some((x) => x.id === own.edge);
    return e && vanishes && !e.folded && !e.rides && area(e.rect) > EPS ? hull(o, e.rect) : o;
  }
  const [c0, c1] = ownSpec.across();
  return ownSpec.vertical ? hull(o, rect(c0, o.y, c1 - c0, o.height)) : hull(o, rect(o.x, c0, o.width, c1 - c0));
}

/** Every owner: home first, then each edge the tiler reads, then every drawn rect. */
function ownersOf(c: Ctx, live: readonly EdgeSpec[], drawn: ReturnType<typeof drawnOf>, alongOf: (s: EdgeSpec) => readonly Span[]): Owner[] {
  const ownEdge = c.now.items[c.dragged]?.edge;
  const ownSpec = (ownEdge && live.find((s) => s.edge?.id === ownEdge)) || null;
  const homeRect = homeRectOf(c, ownSpec);
  return [
    // Home first: its tile is its own, for every edge but its own (which tiles it as its own interval).
    ...(homeRect ? [{ spec: ownSpec, rect: homeRect, lay: { phase: -1, side: "", at: -Infinity }, place: false }] : []),
    // Every edge the tiler reads, along each zone with a slot the filter keeps: what it owns, drawn or a band of its
    // place (a column line's band about its line). A zone whose every slot is refused owns nothing against the others
    // (its drawn rect still counts, below).
    ...live
      .flatMap((s): Owner[] => {
        const rects = ownedRectsOf(s, alongOf(s));
        if (!s.thinOwned) return rects.map((r) => ({ spec: s, rect: r, lay: s.lay, place: !s.drawn }));
        // An empty rail or bar: its thin band as any band, the depth past it as a band that yields to a drawn edge taking the item.
        const thin = (r: Rect): Rect => (s.vertical ? rect(Math.max(r.x, s.thinOwned![0]), r.y, Math.min(r.x + r.width, s.thinOwned![1]) - Math.max(r.x, s.thinOwned![0]), r.height) : rect(r.x, Math.max(r.y, s.thinOwned![0]), r.width, Math.min(r.y + r.height, s.thinOwned![1]) - Math.max(r.y, s.thinOwned![0])));
        return rects.flatMap((r) => [{ spec: s, rect: thin(r), lay: s.lay, place: true }, ...subtract(r, thin(r)).map((d) => ({ spec: s, rect: d, lay: s.lay, place: true, deep: true as const }))]);
      })
      .filter((o) => area(o.rect) > EPS),
    // Every seen rect: the edges the tiler doesn't read (folded, riding, taking nothing) among them.
    ...drawn.map((d) => ({ ...d, place: false })),
  ];
}

/**
 * `alongOf(spec)`: the stretches along each edge its surviving slots tile, from the edge tiled on its own (see
 * `ownedRectsOf`).
 */
export function ownership(c: Ctx, live: readonly EdgeSpec[], alongOf: (s: EdgeSpec) => readonly Span[]): Ownership {
  const { state, now, dragged } = c;
  const drawn = drawnOf(c, live);
  const owners = ownersOf(c, live, drawn, alongOf);
  const wins = (o: Owner, s: EdgeSpec): boolean => {
    if (o.spec === s) return false;
    if (pushes(o.lay, s.lay)) return true;
    if (pushes(s.lay, o.lay)) return false;
    const place = !s.drawn;
    return o.place === place ? !place || o.lay.at < s.lay.at : !o.place;
  };
  // A drawn edge's zones that take the item (a slot the filter keeps), across its band: an empty rail's or bar's depth
  // past its thin band never takes them.
  const takingRects = (s: EdgeSpec): Rect[] =>
    s.drawn
      ? s.zones.filter((z) => s.slots.some((sl) => sl.ok && sl.zone === z.zone)).map((z) => (s.vertical ? rect(s.owned[0], z.a, s.owned[1] - s.owned[0], z.b - z.a) : rect(z.a, s.owned[0], z.b - z.a, s.owned[1] - s.owned[0])))
      : [];
  const thinRectOf = (s: EdgeSpec): Rect => {
    const b = bandOf(s);
    const [t0, t1] = s.thinOwned!;
    return s.vertical ? rect(t0, b.y, t1 - t0, b.height) : rect(b.x, t0, b.width, t1 - t0);
  };
  // Reach only adds: the part of an edge's band past its own ends (its `endReach` strips) never takes another real
  // edge's own span (that edge's owned band along its length). There it neither wins over that edge nor keeps its tile.
  const endsOf = (s: EdgeSpec): Span | null => {
    const e = s.edge ? now.edges[s.id] : undefined;
    if (!e || EDGE_KINDS[s.kind].virtual) return null;
    const span: Span = s.vertical ? [e.rect.y, e.rect.y + e.rect.height] : [e.rect.x, e.rect.x + e.rect.width];
    return span[1] - span[0] > EPS ? span : null;
  };
  const pastEnds = (s: EdgeSpec, r: Rect): Rect[] => {
    const ends = endsOf(s);
    if (!ends) return [];
    const [lo, hi] = s.vertical ? [r.y, r.y + r.height] : [r.x, r.x + r.width];
    return less([[lo, hi]], [ends]).map(([u, w]) => (s.vertical ? rect(r.x, u, r.width, w - u) : rect(u, r.y, w - u, r.height)));
  };
  const ownSpanOf = (s: EdgeSpec): Rect | null => {
    const ends = endsOf(s);
    if (!ends) return null;
    const [o0, o1] = s.owned;
    return s.vertical ? rect(o0, ends[0], o1 - o0, ends[1] - ends[0]) : rect(ends[0], o0, ends[1] - ends[0], o1 - o0);
  };
  // `o`'s rect `r` less where its reach crosses `s`'s own span.
  const reachLess = (o: Owner, r: Rect, s: EdgeSpec): Rect[] => {
    const span = ownSpanOf(s);
    if (!o.spec || !span) return [r];
    return pastEnds(o.spec, r).flatMap((p) => meet(p, span) ?? []).reduce<Rect[]>((acc, cut) => acc.flatMap((q) => subtract(q, cut)), [r]);
  };
  // Where `s`'s reach crosses another edge's own span, along that edge's surviving slots.
  const reachYields = (s: EdgeSpec): Rect[] => {
    const past = pastEnds(s, bandOf(s));
    if (past.length === 0) return [];
    return live
      .filter((d) => d !== s)
      .flatMap((d) => {
        const span = ownSpanOf(d);
        return span ? ownedRectsOf(d, alongOf(d)).flatMap((r) => meet(r, span) ?? []) : [];
      })
      .flatMap((q) => past.flatMap((p) => meet(p, q) ?? []));
  };
  // What each edge yields: the owners that win over it (an empty rail's or bar's depth less the zones it takes nothing
  // from), less their reach over its own span; a virtual edge (a column line) also every other owner's rect outside its
  // own band, where its tile is overreach; an empty rail or bar also, past its thin band, the drawn edges' zones that
  // take the item; and its own reach over another edge's own span.
  const taken = new Map<EdgeSpec, readonly Rect[]>(
    live.map((s) => [
      s,
      [
        ...owners.filter((o) => wins(o, s)).flatMap((o) => (o.deep ? takingRects(s).reduce<Rect[]>((acc, t) => acc.flatMap((r) => subtract(r, t)), [o.rect]) : [o.rect]).flatMap((r) => reachLess(o, r, s))),
        ...(EDGE_KINDS[s.kind].virtual ? owners.filter((o) => o.spec !== s && !wins(o, s)).flatMap((o) => subtract(o.rect, ownedRectOf(s))) : []),
        ...(s.thinOwned ? live.filter((d) => d !== s).flatMap((d) => takingRects(d).flatMap((t) => subtract(t, thinRectOf(s)))) : []),
        ...reachYields(s),
      ],
    ]),
  );
  // Half the hit band of an edge's panels, or null where they are split in halves (`hitBand: "middle"`, no body).
  const halfBandOf = (e: DockEdge): number | null => {
    const bandOpt = hitBandOf(state, e);
    return bandOpt === "middle" ? null : Math.max(0, Number.isFinite(bandOpt) ? bandOpt : DEFAULT_HIT_BAND) / 2;
  };
  // Panel bodies (an open item's), but for `hitBand / 2` at each end: no drop place of their edge.
  const bodySpans = (e: DockEdge | null): Span[] => {
    const half = e ? halfBandOf(e) : null;
    if (!e || half === null) return [];
    const column = axisOf(e.side) === "column";
    return Object.entries(now.items)
      .filter(([iid, p]) => p.edge === e.id && iid !== dragged && isBody(formsOf(state.items[iid]!, axisOf(e.side))[p.form]))
      .map(([, p]): Span => (column ? [p.rect.y + half, p.rect.y + p.rect.height - half] : [p.rect.x + half, p.rect.x + p.rect.width - half]))
      .filter(([a, b]) => b - a > EPS);
  };
  // A zone's room: less the stretches where the owners that win over its edge together hold the edge's whole depth (a
  // thinner owner, an empty rail's band over a column, clips its tiles instead). Under 1 px of depth left is none: a
  // sub-pixel strip between two owners (an empty bar's zones, split where the bar's thirds fall) is no room, so no slot
  // lands its tile there. Panel bodies are no drop place, but they don't split the room: the tiles run across them and
  // clipping takes them out (`bodies`), so a card's band beside the item's own place meets the nearest slot past it.
  // A body cuts only beyond half a band of each slot's line, the line where the room puts it: a line under another
  // edge's owned band (the first gap of a column under an empty bar's place band) lies at that band's far side, and its
  // half band reaches into the body from there.
  const rooms = new Map<EdgeSpec, Room>();
  const cutsOf = (s: EdgeSpec): Room => {
    let room = rooms.get(s);
    if (!room) rooms.set(s, (room = roomOf(s)));
    return room;
  };
  const roomOf = (s: EdgeSpec): Room => {
    const b = bandOf(s);
    const along = (r: Rect): Span => (s.vertical ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
    const across = (r: Rect): Span => (s.vertical ? [r.x, r.x + r.width] : [r.y, r.y + r.height]);
    const rs = taken.get(s)!.filter((r) => overlaps(r, b));
    const ends = [...new Set([...along(b), ...rs.flatMap(along)])].filter((x) => x >= along(b)[0] && x <= along(b)[1]).sort((p, q) => p - q);
    const owned: Span[] = [];
    for (let k = 1; k < ends.length; k++) {
      const [u, w] = [ends[k - 1]!, ends[k]!];
      const over = rs.filter((r) => along(r)[0] <= u + EPS && along(r)[1] >= w - EPS).map(across);
      if (w - u > EPS && less([across(b)], over).reduce((n, [p, q]) => n + q - p, 0) < 1) owned.push([u, w]);
    }
    const half = s.edge ? halfBandOf(s.edge) : null;
    const raw = bodySpans(s.edge);
    if (half === null || raw.length === 0) return { cuts: owned, bodies: raw };
    const merged = owned.reduce<[number, number][]>((m, [u, w]) => {
      const last = m[m.length - 1];
      if (last && u <= last[1] + EPS) last[1] = Math.max(last[1], w);
      else m.push([u, w]);
      return m;
    }, []);
    // A line under a cut goes to the cut's side within the edge's drawn ends, as the tiler puts it (a reach strip past
    // an end takes no line), so a body's half band about it lies where the slot's tile does.
    const [lo, hi] = endsOf(s) ?? along(b);
    const placed = (p: number): number => {
      const cut = merged.find(([u, w]) => p >= u - EPS && p <= w + EPS);
      if (!cut) return p;
      const sides = [...(cut[0] > lo + EPS ? [cut[0]] : []), ...(cut[1] < hi - EPS ? [cut[1]] : [])];
      return sides.length === 0 ? p : sides.reduce((m, x) => (Math.abs(x - p) < Math.abs(m - p) ? x : m));
    };
    const bands = s.slots.map((sl): Span => [placed(sl.line) - half, placed(sl.line) + half]);
    return { cuts: owned, bodies: less(raw, bands) };
  };
  const grows = (id: string): boolean => {
    const it = now.items[id]!;
    const e = it.edge ? now.edges[it.edge] : undefined;
    return !!e && !!formsOf(state.items[id]!, axisOf(e.side))[it.form]?.main.grows;
  };
  const solid = Object.entries(now.items).filter(([id, it]) => it.fixed && !grows(id)).map(([, it]) => it.rect);
  // Panel bodies (an open item's), but for `hitBand / 2` at each end, aren't drop places of their edge.
  // Nor are its fixed items' reserved rects (a growing title's natural rect): each cut across the edge's whole band.
  const bodies = (s: EdgeSpec): Rect[] => {
    const e = s.edge;
    if (!e) return [];
    const column = axisOf(e.side) === "column";
    const across = (a: number, b: number): Rect => (column ? rect(-1e9, a, 2e9, b - a) : rect(a, -1e9, b - a, 2e9));
    const reserved = Object.entries(now.items)
      .filter(([iid, p]) => p.edge === e.id && p.fixed && !p.inMenu && !grows(iid))
      .map(([, p]) => (column ? across(p.rect.y, p.rect.y + p.rect.height) : across(p.rect.x, p.rect.x + p.rect.width)));
    return [...reserved, ...cutsOf(s).bodies.map(([a, b]) => across(a, b))].filter((b) => area(b) > EPS);
  };
  const drawnBySpec = new Map<EdgeSpec, Rect[]>();
  const drawnBesides = (s: EdgeSpec): Rect[] => {
    let rs = drawnBySpec.get(s);
    if (!rs) drawnBySpec.set(s, (rs = drawn.filter((d) => d.spec !== s).map((d) => d.rect)));
    return rs;
  };
  return { owners, taken, cutsOf, bodies, solid, drawnBesides };
}
