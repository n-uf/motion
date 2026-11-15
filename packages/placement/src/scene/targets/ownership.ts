/**
 * Space ownership (filter iii). A drawn edge owns its current rect, with the item lifted or as it is now (but for the
 * item's own edge as it is now: the item has left it); an empty edge owns a thin band of its place at its boundary; the
 * rail likewise. Owned rects rank in the order `solve` lays edges out: one laid before another and pushing it when
 * filled wins (outer before inner, full bars before the sides they push, the rail before its side); between edges laid
 * independently a drawn rect wins over an empty edge's band, two drawn rects yield to each other, and of two bands the
 * one laid first wins. Home's tile is owned before all. A virtual edge owns nothing and yields to every owner.
 */
import { EPS, area, overlaps, rect, subtract, type Rect } from "../../geometry";
import { axisOf, formsOf } from "../helpers";
import { DEFAULT_HIT_BAND, type SceneLayout } from "../model";
import { pushes, type LayKey } from "../solve";
import { distinctSlots } from "./edges";
import { EDGE_KINDS } from "./kinds";
import { less, type Ctx, type EdgeSpec, type Span } from "./model";

interface Owner {
  readonly id: string;
  readonly key: string;
  readonly rect: Rect;
  readonly lay: LayKey;
  readonly place: boolean;
}

/** What clipping reads of ownership. */
export interface Ownership {
  readonly owners: readonly Owner[];
  /** Per spec key: the rects it yields (the owners that win over it; for a virtual edge, every other owner too). */
  readonly taken: ReadonlyMap<string, readonly Rect[]>;
  /** A zone's room lost to its panel bodies and to the owners that win over its edge across its whole depth. */
  readonly cutsOf: (s: EdgeSpec) => Span[];
  /** The panel bodies and reserved rects of an edge, each cut across its whole band. */
  readonly bodies: (id: string) => Rect[];
  /** The fixed items that don't grow, with the item lifted and as it is now. */
  readonly solid: readonly Rect[];
  /** Whether a zone of the spec `key` has no slot the filter keeps: its refusals yield to every other owner. */
  readonly refusedZone: (key: string, zone: string) => boolean;
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
 * The zones of an edge with a slot the filter keeps, home's aside (home's tile is owned on its own, and a slot that is
 * the same move as home is home).
 */
const liveZones = (c: Ctx, s: EdgeSpec): Set<string> => new Set(distinctSlots(c, s.slots).filter((x) => x.ok && !x.home).map((x) => x.zone));

/**
 * What an edge owns against the others: its owned rect along each of its live zones only. A zone whose every slot the
 * filter removes owns nothing (its drawn rect still counts, as every drawn rect does).
 */
function ownedRectsOf(s: EdgeSpec, zones: ReadonlySet<string>): Rect[] {
  if (zones.size === 0) return [];
  const o = ownedRectOf(s);
  if (s.ownedAlong) return [o];
  return s.zones.filter((z) => zones.has(z.zone)).map((z) => (s.vertical ? rect(o.x, z.a, o.width, z.b - z.a) : rect(z.a, o.y, z.b - z.a, o.height)));
}

/** Every owner: home first, then each edge the tiler reads, then every drawn rect. */
function ownersOf(c: Ctx, live: readonly EdgeSpec[], zonesOf: (s: EdgeSpec) => ReadonlySet<string>): Owner[] {
  const { now, base, dragged } = c;
  const ownEdge = now.items[dragged]?.edge;
  const ownRect = now.items[dragged];
  // Home's tile: the item's own rect, and, along it, its edge's band (the own interval across the band).
  const homeRect = ((): Rect | null => {
    if (!ownRect || ownRect.floating || !ownEdge) return null;
    const o = ownRect.rect;
    const s = live.find((x) => x.id === ownEdge);
    if (!s || ownRect.inMenu) return o;
    const [c0, c1] = s.across();
    return s.vertical ? rect(Math.min(c0, o.x), o.y, Math.max(c1, o.x + o.width) - Math.min(c0, o.x), o.height) : rect(o.x, Math.min(c0, o.y), o.width, Math.max(c1, o.y + o.height) - Math.min(c0, o.y));
  })();
  /** The edges with a rect once the item lifts. */
  const lifted = new Set(Object.entries(base.edges).filter(([, e]) => area(e.rect) > EPS).map(([id]) => id));
  return [
    // Home first: its tile is its own, for every edge but its own (which tiles it as its own interval).
    ...(homeRect && ownEdge ? [{ id: ownEdge, key: ownEdge, rect: homeRect, lay: { phase: -1, side: "", at: -Infinity }, place: false }] : []),
    // Every edge the tiler reads, along each zone with a slot the filter keeps: what it owns, drawn or a band of its
    // place (a column line's band about its line). A zone whose every slot is refused owns nothing against the others
    // (its drawn rect still counts, below).
    ...live.flatMap((s) => ownedRectsOf(s, zonesOf(s)).map((r) => ({ id: s.id, key: s.key, rect: r, lay: s.lay, place: !s.drawn }))).filter((o) => area(o.rect) > EPS),
    // Every drawn rect with the item lifted, the layout the tiles lie in: the edges the tiler doesn't read (folded,
    // riding, taking nothing) among them. An edge's rect as it is now counts only where the lift leaves it no rect at
    // all (drawn now, gone once the item lifts; the item's own edge excepted). An edge that only moves when the item
    // lifts owns where it lies after the lift, where its tiles are, never where it lay before: that space is another
    // edge's once the item has lifted, or nobody's, and a stale owner there would leave it to no tile at all.
    ...[...Object.entries(base.edges), ...Object.entries(now.edges).filter(([id]) => id !== ownEdge && !lifted.has(id))]
      .filter(([id, e]) => area(e.rect) > EPS && c.lay.has(id))
      .map(([id, e]) => ({ id, key: id, rect: e.rect, lay: c.lay.get(id)!, place: false })),
  ];
}

export function ownership(c: Ctx, live: readonly EdgeSpec[]): Ownership {
  const { scene, rest, now, base, dragged } = c;
  const zonesByKey = new Map(live.map((s) => [s.key, liveZones(c, s)]));
  const owners = ownersOf(c, live, (s) => zonesByKey.get(s.key)!);
  const wins = (o: Owner, s: EdgeSpec): boolean => {
    if (o.key === s.key) return false;
    if (pushes(o.lay, s.lay)) return true;
    if (pushes(s.lay, o.lay)) return false;
    const place = !s.drawn;
    return o.place === place ? !place || o.lay.at < s.lay.at : !o.place;
  };
  // What each edge yields: the owners that win over it; a virtual edge (a column line) also every other owner's rect
  // outside its own band, where its tile is overreach.
  const taken = new Map(
    live.map((s) => [
      s.key,
      [
        ...owners.filter((o) => wins(o, s)).map((o) => o.rect),
        ...(EDGE_KINDS[s.kind].virtual ? owners.filter((o) => o.key !== s.key && !wins(o, s)).flatMap((o) => subtract(o.rect, ownedRectOf(s))) : []),
      ],
    ]),
  );
  // Panel bodies (an open item's), but for `hitBand / 2` at each end: no drop place of their edge, so no part of its
  // zones' room.
  const bodySpans = (id: string): Span[] => {
    const e = rest.edges.find((x) => x.id === id);
    const bandOpt = e?.hitBand ?? DEFAULT_HIT_BAND;
    if (!e || bandOpt === "middle") return [];
    const column = axisOf(e.side) === "column";
    const half = Math.max(0, Number.isFinite(bandOpt) ? bandOpt : DEFAULT_HIT_BAND) / 2;
    return Object.entries(base.items)
      .filter(([iid, p]) => p.edge === id && p.formKind === "open" && iid !== dragged)
      .map(([, p]): Span => (column ? [p.rect.y + half, p.rect.y + p.rect.height - half] : [p.rect.x + half, p.rect.x + p.rect.width - half]))
      .filter(([a, b]) => b - a > EPS);
  };
  // A zone's room: less its panel bodies, and less the stretches where the owners that win over its edge together hold
  // the edge's whole depth (a thinner owner, an empty rail's band over a column, clips its tiles instead). Under 1 px of
  // depth left is none: a sub-pixel strip between two owners (an empty bar's zones, split where the bar's thirds fall)
  // is no room, so no slot lands its tile there.
  const cutsOf = (s: EdgeSpec): Span[] => {
    const b = bandOf(s);
    const along = (r: Rect): Span => (s.vertical ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
    const across = (r: Rect): Span => (s.vertical ? [r.x, r.x + r.width] : [r.y, r.y + r.height]);
    const rs = taken.get(s.key)!.filter((r) => overlaps(r, b));
    const ends = [...new Set([...along(b), ...rs.flatMap(along)])].filter((x) => x >= along(b)[0] && x <= along(b)[1]).sort((p, q) => p - q);
    const owned: Span[] = [];
    for (let k = 1; k < ends.length; k++) {
      const [u, w] = [ends[k - 1]!, ends[k]!];
      const over = rs.filter((r) => along(r)[0] <= u + EPS && along(r)[1] >= w - EPS).map(across);
      if (w - u > EPS && less([across(b)], over).reduce((n, [p, q]) => n + q - p, 0) < 1) owned.push([u, w]);
    }
    return [...owned, ...bodySpans(s.id)];
  };
  const grows = (l: SceneLayout, id: string): boolean => {
    const it = l.items[id]!;
    const e = it.edge ? l.edges[it.edge] : undefined;
    return !!e && !!formsOf(scene.items[id]!, axisOf(e.side))[it.form]?.main.grows;
  };
  const solid = [...new Set([now, base])].flatMap((l) => Object.entries(l.items).filter(([id, it]) => it.fixed && !grows(l, id)).map(([, it]) => it.rect));
  // Panel bodies (an open item's), but for `hitBand / 2` at each end, aren't drop places of their edge.
  // Nor are its fixed items' reserved rects (a growing title's natural rect): each cut across the edge's whole band.
  const bodies = (id: string): Rect[] => {
    const e = rest.edges.find((x) => x.id === id);
    if (!e) return [];
    const column = axisOf(e.side) === "column";
    const across = (a: number, b: number): Rect => (column ? rect(-1e9, a, 2e9, b - a) : rect(a, -1e9, b - a, 2e9));
    const reserved = Object.entries(base.items)
      .filter(([iid, p]) => p.edge === id && p.fixed && !p.inMenu && !grows(base, iid))
      .map(([, p]) => (column ? across(p.rect.y, p.rect.y + p.rect.height) : across(p.rect.x, p.rect.x + p.rect.width)));
    return [...reserved, ...bodySpans(id).map(([a, b]) => across(a, b))].filter((b) => area(b) > EPS);
  };
  const refusedZone = (key: string, zone: string): boolean => !(zonesByKey.get(key)?.has(zone) ?? false);
  return { owners, taken, cutsOf, bodies, solid, refusedZone };
}
