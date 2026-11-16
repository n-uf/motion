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
import { EPS, area, overlaps, rect, subtract, type Rect } from "../../geometry";
import { axisOf, formsOf, hitBandOf } from "../helpers";
import { DEFAULT_HIT_BAND, type Edge } from "../model";
import { pushes, type LayKey } from "../solve";
import { EDGE_KINDS } from "./kinds";
import { less, type Ctx, type EdgeSpec, type Room, type Span } from "./model";

interface Owner {
  /** The edge it is, as the tiler reads it; null for an edge the tiler doesn't read (folded, riding, taking nothing). */
  readonly spec: EdgeSpec | null;
  readonly rect: Rect;
  readonly lay: LayKey;
  readonly place: boolean;
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

/** Every edge's seen rect, with the spec the tiler reads it by (null for an edge it doesn't read). */
function drawnOf(c: Ctx, live: readonly EdgeSpec[]): { spec: EdgeSpec | null; rect: Rect; lay: LayKey }[] {
  return Object.entries(c.now.edges)
    .filter(([id, e]) => area(e.rect) > EPS && c.lay.has(id))
    .map(([id, e]) => ({ spec: live.find((s) => s.edge?.id === id) ?? null, rect: e.rect, lay: c.lay.get(id)! }));
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
    ...live.flatMap((s) => ownedRectsOf(s, alongOf(s)).map((r) => ({ spec: s, rect: r, lay: s.lay, place: !s.drawn }))).filter((o) => area(o.rect) > EPS),
    // Every seen rect: the edges the tiler doesn't read (folded, riding, taking nothing) among them.
    ...drawn.map((d) => ({ ...d, place: false })),
  ];
}

/**
 * `alongOf(spec)`: the stretches along each edge its surviving slots tile, from the edge tiled on its own (see
 * `ownedRectsOf`).
 */
export function ownership(c: Ctx, live: readonly EdgeSpec[], alongOf: (s: EdgeSpec) => readonly Span[]): Ownership {
  const { scene, now, dragged } = c;
  const drawn = drawnOf(c, live);
  const owners = ownersOf(c, live, drawn, alongOf);
  const wins = (o: Owner, s: EdgeSpec): boolean => {
    if (o.spec === s) return false;
    if (pushes(o.lay, s.lay)) return true;
    if (pushes(s.lay, o.lay)) return false;
    const place = !s.drawn;
    return o.place === place ? !place || o.lay.at < s.lay.at : !o.place;
  };
  // What each edge yields: the owners that win over it; a virtual edge (a column line) also every other owner's rect
  // outside its own band, where its tile is overreach.
  const taken = new Map<EdgeSpec, readonly Rect[]>(
    live.map((s) => [
      s,
      [
        ...owners.filter((o) => wins(o, s)).map((o) => o.rect),
        ...(EDGE_KINDS[s.kind].virtual ? owners.filter((o) => o.spec !== s && !wins(o, s)).flatMap((o) => subtract(o.rect, ownedRectOf(s))) : []),
      ],
    ]),
  );
  // Panel bodies (an open item's), but for `hitBand / 2` at each end: no drop place of their edge, so no part of its
  // zones' room.
  const bodySpans = (e: Edge | null): Span[] => {
    if (!e) return [];
    const bandOpt = hitBandOf(scene, e);
    if (bandOpt === "middle") return [];
    const column = axisOf(e.side) === "column";
    const half = Math.max(0, Number.isFinite(bandOpt) ? bandOpt : DEFAULT_HIT_BAND) / 2;
    return Object.entries(now.items)
      .filter(([iid, p]) => p.edge === e.id && p.formKind === "open" && iid !== dragged)
      .map(([, p]): Span => (column ? [p.rect.y + half, p.rect.y + p.rect.height - half] : [p.rect.x + half, p.rect.x + p.rect.width - half]))
      .filter(([a, b]) => b - a > EPS);
  };
  // A zone's room: less the stretches where the owners that win over its edge together hold the edge's whole depth (a
  // thinner owner, an empty rail's band over a column, clips its tiles instead). Under 1 px of depth left is none: a
  // sub-pixel strip between two owners (an empty bar's zones, split where the bar's thirds fall) is no room, so no slot
  // lands its tile there. Panel bodies are no drop place, but they don't split the room: the tiles run across them and
  // clipping takes them out (`bodies`), so a card's band beside the item's own place meets the nearest slot past it.
  const cutsOf = (s: EdgeSpec): Room => {
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
    return { cuts: owned, bodies: bodySpans(s.edge) };
  };
  const grows = (id: string): boolean => {
    const it = now.items[id]!;
    const e = it.edge ? now.edges[it.edge] : undefined;
    return !!e && !!formsOf(scene.items[id]!, axisOf(e.side))[it.form]?.main.grows;
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
    return [...reserved, ...bodySpans(e).map(([a, b]) => across(a, b))].filter((b) => area(b) > EPS);
  };
  const drawnBySpec = new Map<EdgeSpec, Rect[]>();
  const drawnBesides = (s: EdgeSpec): Rect[] => {
    let rs = drawnBySpec.get(s);
    if (!rs) drawnBySpec.set(s, (rs = drawn.filter((d) => d.spec !== s).map((d) => d.rect)));
    return rs;
  };
  return { owners, taken, cutsOf, bodies, solid, drawnBesides };
}
