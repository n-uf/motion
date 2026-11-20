/**
 * Tiles: each edge's zones split into its slots' tiles (`tileEdge`), then clipped in precedence order (`clipTiles`):
 * each clear of the tiles before it, of what outranks its edge, of the fixed items that don't grow and of the chrome.
 */
import { EPS, area, rect, subtract, type Point, type Rect } from "@n-uf/placement";
import { zoneOf } from "../helpers";
import { ZONES, type DockLayout, type Zone } from "../model";
import { distinctSlots, roomReason } from "./edges";
import { targetId } from "./ids";
import { EDGE_KINDS } from "./kinds";
import { less, type Ctx, type EdgeSpec, type Room, type DockRefusal, type Slot, type Span, type Tile } from "./model";
import type { Ownership } from "./ownership";

/** How one edge makes its tiles: its band, the point a tile keeps, and a tile's split into owned part and overreach. */
interface Tiler {
  readonly band: (a: number, b: number, after?: DockLayout) => Rect;
  readonly keepAt: (line: number, h: Rect) => Point;
  readonly tile: (zone: Zone, hit: Rect, more: Pick<Tile, "kind" | "id" | "order" | "priority" | "keep"> & Partial<Tile>) => Tile;
  readonly split: (t: Tile) => Tile[];
}

function tilerOf(spec: EdgeSpec): Tiler {
  const data = EDGE_KINDS[spec.kind];
  const v = spec.vertical;
  const band = (a: number, b: number, after?: DockLayout): Rect => {
    const [c0, c1] = spec.across(after);
    return v ? rect(c0, a, c1 - c0, b - a) : rect(a, c0, b - a, c1 - c0);
  };
  // The point a tile keeps through clipping: on its line, in the middle of its band across.
  const keepAt = (line: number, h: Rect): Point => (v ? { x: h.x + h.width / 2, y: line } : { x: line, y: h.y + h.height / 2 });
  const tile: Tiler["tile"] = (zone, hit, more) => ({ edge: spec.id, spec, edgeKind: spec.kind, vertical: v, zone, hit, ...more });
  // A tile's part across that its edge owns, and the rest, its overreach: clipped after the virtual edges, then joined
  // back where it still meets the owned part whole.
  const split = (t: Tile): Tile[] => {
    const h = t.hit;
    const [h0, h1] = v ? [h.x, h.x + h.width] : [h.y, h.y + h.height];
    const [c0, c1] = [Math.max(h0, spec.owned[0]), Math.min(h1, spec.owned[1])];
    const part = (a: number, b: number): Rect => (v ? rect(a, h.y, b - a, h.height) : rect(h.x, a, h.width, b - a));
    const beyond = less([[h0, h1]], [spec.owned]);
    if (beyond.length === 0) return [t];
    if (c1 - c0 <= EPS) return [{ ...t, order: data.overreach }];
    const core: Tile = { ...t, hit: part(c0, c1), keep: t.keep && keepAt(v ? t.keep.y : t.keep.x, part(c0, c1)) };
    return [core, ...beyond.map(([a, b]): Tile => ({ ...t, kind: "reach", of: core, order: data.overreach, hit: part(a, b), keep: null }))];
  };
  return { band, keepAt, tile, split };
}

/** The part two rects share, or null when it has no area. */
function meet(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.width, b.x + b.width) - x;
  const h = Math.min(a.y + a.height, b.y + b.height) - y;
  return w > EPS && h > EPS ? rect(x, y, w, h) : null;
}

/**
 * An edge that takes the dragged kind in no zone refuses it outright: one refusal (`refuse:<edge>:start`, `n = 0`) over
 * the edge's drawn rect (`DockLayout.edges[id].rect`, fixed items included), in the stage. Clipping cuts only what the
 * targets own from it, and a rail drop strip still takes its own rect. Null for any other edge (a zone that takes the
 * kind, an edge not drawn, the item's own edge).
 */
function wholeRefusal(c: Ctx, spec: EdgeSpec): Tile | null {
  if (!spec.edge || spec.own || spec.holds || ZONES.some((z) => spec.refuse(z) !== "not-accepted")) return null;
  const drawn = c.now.edges[spec.id]?.rect;
  const hit = drawn ? meet(drawn, c.state.stage) : null;
  if (!hit) return null;
  const data = EDGE_KINDS[spec.kind];
  return { edge: spec.id, spec, edgeKind: spec.kind, vertical: spec.vertical, zone: "start", hit, kind: "refuse", id: "", order: data.layer, priority: data.priority, keep: null, reason: "not-accepted", whole: true };
}

/** Whether `spans` keep any length past `away`. */
const hasRoom = (spans: readonly Span[], away: readonly Span[]): boolean => less(spans, away).some(([a, b]) => b - a > EPS);

/** Where each slot's line lies in one free piece of a zone: projected into it, or spread in order when lines collide. */
function linesIn(spec: EdgeSpec, z: { a: number; b: number }, mine: readonly Slot[], pieces: readonly Span[], [pa, pb]: Span, own: Span | null): { inPiece: Slot[]; at: number[] } {
  const reserved = spec.reserved;
  // Lines spread into the zone's extent less its reserved rects when they lie past it: their share of the span the lines
  // and the extent cover, laid along the extent's free pieces end to end.
  const lines = mine.map((s) => s.line);
  const lo = Math.min(z.a, ...lines);
  const hi = Math.max(z.b, ...lines);
  const free = less([[z.a, z.b]], reserved);
  const freeLen = free.reduce((n, [a, b]) => n + (b - a), 0);
  const spread = (x: number): number => {
    if (hi - lo <= EPS || freeLen <= EPS) return x;
    let d = ((x - lo) / (hi - lo)) * freeLen;
    for (const [a, b] of free) {
      if (d <= b - a + EPS) return a + Math.min(d, b - a);
      d -= b - a;
    }
    return free[free.length - 1]![1];
  };
  // A line inside the own interval (an empty zone's anchor under the item) goes to the interval's nearer end. Lines
  // inside the extent stay where they are, one inside a reserved rect going to its nearer end.
  const past = lines.some((x) => x < z.a - EPS || x > z.b + EPS);
  const nearer = (p: number, [a, b]: Span): number => (p > a && p < b ? (p - a < b - p ? a : b) : p);
  // A line left outside the zone's pieces (under what another edge owns) goes to the nearest point of one.
  const proj = (x: number): number => {
    const q = reserved.reduce((r, s) => nearer(r, s), past ? spread(x) : x);
    const p = own ? nearer(q, own) : q;
    if (pieces.some(([a, b]) => p >= a - EPS && p <= b + EPS)) return p;
    return pieces.map(([a, b]) => Math.min(Math.max(p, a), b)).reduce((m, y) => (Math.abs(y - p) < Math.abs(m - p) ? y : m));
  };
  // Home's lines are the own interval's ends: each is a line only in the piece it bounds, never projected into another
  // (where it would fall on the other end's point and spread the piece's lines evenly).
  const ownEnd = (s: Slot): boolean => !!own && s.home && (Math.abs(s.line - own[0]) < EPS || Math.abs(s.line - own[1]) < EPS);
  const inPiece = mine
    .filter((s) => (ownEnd(s) ? s.line >= pa - EPS && s.line <= pb + EPS : proj(s.line) >= pa - EPS && proj(s.line) <= pb + EPS))
    .sort((a, b) => proj(a.line) - proj(b.line) || a.line - b.line);
  // Where projection lays two different moves on one point (lines under the item's home or another edge's), the piece's
  // lines are laid out in their order along it instead, one share each.
  const projected = inPiece.map((s) => proj(s.line));
  const at = projected.some((p, i) => i > 0 && p - projected[i - 1]! <= EPS) ? inPiece.map((_, i) => pa + ((i + 0.5) * (pb - pa)) / inPiece.length) : projected;
  return { inPiece, at };
}

/**
 * One edge's tiles, every kind alike: each zone's extent less the item's own interval, split halfway between its slots'
 * lines (projected into it), a slot's tile reaching at most its kind's `reach` from its line. A stretch with no slot is
 * refused (`spec.refuse`), a slot the filter removed is refused over its own tile, and the own interval is home's
 * (across, the edge's band and the own rect), named after the home slot when there is one. Where the item has no rect
 * on the edge, home's tile is its slot's.
 */
export function tileEdge(c: Ctx, spec: EdgeSpec, { cuts, bodies }: Room, lost: string[]): Tile[] {
  const whole = wholeRefusal(c, spec);
  if (whole) return [whole];
  const data = EDGE_KINDS[spec.kind];
  const v = spec.vertical;
  const own: Span | null = spec.own ? (v ? [spec.own.y, spec.own.y + spec.own.height] : [spec.own.x, spec.own.x + spec.own.width]) : null;
  const { band, keepAt, tile, split } = tilerOf(spec);
  // A zone's refusal keeps its slot's geometry, but never past the edge's ends (no `endReach`) nor past the stage.
  const drawn = spec.edge ? c.now.edges[spec.id]?.rect : undefined;
  const alongLimit = drawn && (v ? drawn.height : drawn.width) > EPS ? (v ? rect(-1e9, drawn.y, 2e9, drawn.height) : rect(drawn.x, -1e9, drawn.width, 2e9)) : null;
  const refused = (zone: Zone, hit: Rect, reason: DockRefusal["reason"]): Tile[] => {
    const inEdge = alongLimit ? meet(hit, alongLimit) : hit;
    const shown = inEdge && meet(inEdge, c.state.stage);
    return shown ? split(tile(zone, shown, { kind: "refuse", id: "", order: data.layer, priority: data.priority, keep: null, reason })) : [];
  };
  const slots = distinctSlots(c, spec.slots);
  // The edge's reserved spans merged where they touch: a line strictly inside one is wedged between fixed items.
  const runs = [...spec.reserved].sort((p, q) => p[0] - q[0]).reduce<Span[]>((acc, [a, b]) => {
    const last = acc[acc.length - 1];
    if (last && a <= last[1] + EPS) acc[acc.length - 1] = [last[0], Math.max(last[1], b)];
    else acc.push([a, b]);
    return acc;
  }, []);
  const wedged = (line: number): boolean => runs.some(([a, b]) => line > a + EPS && line < b - EPS);
  // Home's slot where the item lies on this edge: its order is the aim that puts the item back.
  const homeSlot = spec.holds && own ? slots.find((s) => s.home && s.order !== undefined) : undefined;
  const out: Tile[] = [];
  for (const z of spec.zones) {
    // The zone's extent less its reserved rects and what other edges own: a zone left with nothing has no slot.
    const room = less([[z.a, z.b]], [...cuts, ...spec.reserved]).filter(([a, b]) => b - a > EPS);
    // Less the own interval, which home owns: a zone wholly under the item's own place has no room left either.
    const pieces = own ? less(room, [own]) : room;
    // Panel bodies don't split the pieces (the tiles run across them, clipping takes them out), but a zone whose room
    // is all bodies has no drop place.
    if (!hasRoom(pieces, bodies)) continue;
    // A slot with no room within its kind's reach of its line isn't offered.
    // On the item's own edge the home slot's line is the own interval itself: it lies at both of its ends, so the gaps
    // right beside the item (the same move as home) are home's. In its » menu the item has no interval: home is only
    // its entry.
    const lined = slots.flatMap((s) => (spec.holds && s.home ? (own ? [{ ...s, line: own[0] }, { ...s, line: own[1] }] : []) : [s]));
    // A slot whose line lies between two fixed items (inside a run of reserved spans, not at its ends) has no place a
    // pointer can aim at: a drop there would push fixed items the pointer never sees apart. It gets no tile, so its
    // order's stretch beside the run stays with the slot at the run's end (the card's leading half is "before it").
    const mine = lined.filter((s) => s.zone === z.zone && !wedged(s.line) && pieces.some(([a, b]) => b > s.line - data.reach + EPS && a < s.line + data.reach - EPS));
    const reason = spec.refuse(z.zone);
    for (const [pa, pb] of pieces) {
      const { inPiece, at } = linesIn(spec, z, mine, pieces, [pa, pb], own);
      if (inPiece.length === 0) {
        // A stretch of a zone with no slot of its own is refused: home is only over the item's own place, and no stretch
        // is handed to another zone's slot. Beside a lone item (the zone's only slot is home) there is room, but no
        // place other than its own: `own-place`.
        // A stretch out of every slot's reach is no part of this edge.
        // (The zone takes the kind: its refusal is for want of room, `no-room` or `too-thick`.)
        const lone = (reason === "no-room" || reason === "too-thick") && mine.length === 0 && slots.some((s) => s.zone === z.zone && s.home);
        // (A virtual edge's zone is its slot's reach already: all of it is near.)
        const near = mine.length === 0 || data.virtual || mine.some((s) => pb > s.line - data.reach + EPS && pa < s.line + data.reach - EPS);
        // A virtual edge's stretch cut off from its line by another edge's owned band (the rail stop between a column
        // line and the window's inset) is still that line's: there is room and a slot, so it is no refusal. It joins the
        // nearest fitting slot of the zone as one more piece of its tile (the zone's extent already bounds it).
        const joins = data.virtual ? mine.filter((s) => s.ok && !s.home) : [];
        if (joins.length > 0) {
          const s = joins.reduce((m, x) => (Math.abs(x.line - (pa + pb) / 2) < Math.abs(m.line - (pa + pb) / 2) ? x : m));
          const hit = band(pa, pb, s.result.layout);
          out.push(...split(tile(z.zone, hit, { kind: "slot", id: s.id, order: data.layer, priority: data.priority, keep: keepAt(Math.min(Math.max(s.line, pa), pb), hit), place: s.place, result: s.result, marker: spec.marker(s), slot: s.result.layout.items[c.dragged]!.rect })));
          continue;
        }
        if (reason && near) out.push(...refused(z.zone, band(pa, pb), lone ? "own-place" : reason));
        continue;
      }
      // Where two neighboring slots meet: at the midpoint of the item between their lines (the one item a pointer
      // aims at there: its leading half is the place before it, its trailing half the place after it), else halfway
      // between the lines.
      // (The item lies between the lines as seen, before projection: a line past the piece, under another edge's band,
      // still bounds it.)
      const meet = (i: number): number => {
        const [lo, hi] = [at[i - 1]!, at[i]!];
        const between = spec.cards.filter(([u, w]) => u >= inPiece[i - 1]!.line - EPS && w <= inPiece[i]!.line + EPS);
        const mid = between.length === 1 ? (between[0]![0] + between[0]![1]) / 2 : NaN;
        return mid > lo + EPS && mid < hi - EPS ? mid : (lo + hi) / 2;
      };
      inPiece.forEach((s, i) => {
        // The meeting points with the neighboring slots, the piece's ends at its ends (the own interval's ends are one),
        // and no further from its line than the kind's reach (a virtual edge's zone is that reach already: an outermost
        // column line's zone runs from the window's edge, past where the line's reach would end).
        const p = at[i]!;
        const lim = data.virtual ? Infinity : data.reach;
        const a = Math.max(i === 0 ? pa : meet(i), p - lim);
        const b = Math.min(i === inPiece.length - 1 ? pb : meet(i + 1), p + lim);
        if (b - a <= EPS) {
          if (s.ok && !s.home) lost.push(s.id);
          return;
        }
        // A tile wholly over panel bodies has no drop place: the slot has no room here, so it isn't offered.
        if (!hasRoom([[a, b]], bodies)) return;
        const homeTile = (id: string, u: number, w: number, line: number): Tile => {
          const hit = band(u, w, s.home ? s.result.layout : undefined);
          return tile(z.zone, hit, { kind: "home", id, order: data.layer, priority: data.priority, keep: keepAt(Math.min(Math.max(line, u), w), hit), place: { kind: "home" } });
        };
        if (s.home) {
          out.push(...split(homeTile(s.id, a, b, p)));
          return;
        }
        // A slot of home's order in another zone is the same aim as home over the items it faces: their halves are
        // home's; the rest of its tile, the free stretch beside them, is its own (the item re-aligned, its order kept).
        const faced = homeSlot && s.order === homeSlot.order ? spec.cards.filter(([u, w]) => w > a + EPS && u < b - EPS) : [];
        for (const [u, w] of faced) out.push(...split(homeTile(homeSlot!.id, Math.max(u, a), Math.min(w, b), p)));
        for (const [u, w] of less([[a, b]], faced)) {
          const line = Math.min(Math.max(p, u), w);
          const hit = band(u, w, s.result.layout);
          if (!s.ok) out.push(...refused(z.zone, hit, roomReason(spec, z.zone)));
          else out.push(...split(tile(z.zone, hit, { kind: "slot", id: s.id, order: data.layer, priority: data.priority, keep: keepAt(line, hit), place: s.place, result: s.result, marker: spec.marker(s), slot: s.result.layout.items[c.dragged]!.rect })));
        }
      });
    }
  }
  if (own && spec.own) {
    const home = spec.slots.find((s) => s.home);
    // Across the edge's band and the own rect where it lies now: home's wherever the lift moves things (nothing clips
    // it). A slot's id and priority; `home:<id>` (1) when no slot is home.
    const [a, b] = own;
    const h = band(a, b);
    const o = spec.own;
    const hit = v ? rect(Math.min(h.x, o.x), a, Math.max(h.x + h.width, o.x + o.width) - Math.min(h.x, o.x), b - a) : rect(a, Math.min(h.y, o.y), b - a, Math.max(h.y + h.height, o.y + o.height) - Math.min(h.y, o.y));
    out.push(tile(home?.zone ?? zoneOf(c.state.items[c.dragged]), hit, { kind: "home", id: home ? home.id : targetId({ kind: "home", item: c.dragged }), order: 0, priority: home ? data.priority : 1, keep: null, place: { kind: "home" } }));
  }
  return out;
}

const clip = (r: Rect, cuts: readonly Rect[]): Rect[] => cuts.reduce<Rect[]>((ps, cut) => ps.flatMap((p) => subtract(p, cut)), [r]);
/** Every rect a placed tile covers: its pieces, else its hit. */
const coverOf = (t: Tile): readonly Rect[] => t.hits ?? [t.hit];
const largest = (ps: readonly Rect[]): Rect => ps.reduce((a, p) => (area(p) > area(a) ? p : a));
/** `t` with these pieces: `hit` the largest, `hits` all of them when there is more than one. */
const withPieces = (t: Tile, ps: readonly Rect[]): Tile => {
  const { hits: _h, ...rest } = t;
  return { ...rest, hit: largest(ps), ...(ps.length > 1 ? { hits: ps } : {}) };
};

/** An overreach tile `t` placed: joined to its owned part where it meets that part whole, or standing in for it. */
function placeReach(t: Tile, pieces: readonly Rect[], placed: Tile[], landed: ReadonlyMap<Tile, number[]>, gone: Set<Tile>): void {
  const of = t.of!;
  const at = landed.get(of) ?? [];
  if (at.length === 0 && gone.has(of)) {
    // Its owned part went whole: the overreach stands in for it, the piece on its line (else its largest).
    const line = t.vertical ? of.keep!.y : of.keep!.x;
    const whole = pieces.filter((p) => p.width >= 1 && p.height >= 1);
    const on = whole.filter((p) => (t.vertical ? p.y <= line + EPS && line <= p.y + p.height + EPS : p.x <= line + EPS && line <= p.x + p.width + EPS));
    const kept = (on.length > 0 ? on : whole).reduce<Rect | null>((a, p) => (!a || area(p) > area(a) ? p : a), null);
    if (kept) {
      placed.push({ ...of, hit: kept });
      gone.delete(of);
    }
    return;
  }
  for (const i of at) {
    // Joined to the first piece of the owned part it meets along that piece's whole length.
    const cover = coverOf(placed[i]!);
    for (let k = 0; k < cover.length; k++) {
      const h = cover[k]!;
      const joint = pieces.find((p) =>
        t.vertical
          ? p.y <= h.y + EPS && p.y + p.height >= h.y + h.height - EPS && (Math.abs(p.x - h.x - h.width) < EPS || Math.abs(p.x + p.width - h.x) < EPS)
          : p.x <= h.x + EPS && p.x + p.width >= h.x + h.width - EPS && (Math.abs(p.y - h.y - h.height) < EPS || Math.abs(p.y + p.height - h.y) < EPS),
      );
      if (!joint) continue;
      const merged = t.vertical
        ? rect(Math.min(h.x, joint.x), h.y, Math.max(h.x + h.width, joint.x + joint.width) - Math.min(h.x, joint.x), h.height)
        : rect(h.x, Math.min(h.y, joint.y), h.width, Math.max(h.y + h.height, joint.y + joint.height) - Math.min(h.y, joint.y));
      placed[i] = cover.length > 1 ? withPieces(placed[i]!, cover.map((r, j) => (j === k ? merged : r))) : { ...placed[i]!, hit: merged };
      return;
    }
  }
}

/** A refused tile, or the overreach of one. */
const isRefused = (t: Tile): boolean => t.kind === "refuse" || (t.kind === "reach" && t.of!.kind === "refuse");

/**
 * Filter (iii), clipping in precedence order: each tile clear of the ones before it, of the other edges' seen rects, of
 * the fixed items that don't grow and of the chrome. Returns the tiles placed;
 * slots whose every part went are added to `lost`.
 *
 * A slot the filter removed owns nothing against other edges: every surviving tile is placed first, in precedence
 * order, and the refused tiles (with their overreach and the clipped-off pieces of slots) then take what is left, in
 * the same order. Within its own edge a refusal keeps its tile: an edge's tiles never overlap each other.
 */
export function clipTiles(tiles: readonly Tile[], own: Ownership, chrome: readonly Rect[], lost: string[]): Tile[] {
  const { owners, taken, bodies, solid } = own;
  /** Every other edge's owned rects: what a refusal (which owns nothing) and an overreach yield to. */
  const bySpec = new Map<EdgeSpec | null, Rect[]>();
  const others = (t: Tile): Rect[] => {
    let rs = bySpec.get(t.spec);
    if (!rs) bySpec.set(t.spec, (rs = owners.filter((o) => o.spec !== t.spec).map((o) => o.rect)));
    return rs;
  };
  const besides = (t: Tile): readonly Rect[] => (t.spec ? own.drawnBesides(t.spec) : []);
  const bodiesOf = (t: Tile): Rect[] => (t.spec ? bodies(t.spec) : []);
  const placed: Tile[] = [];
  // A virtual edge's refused stretches (its refused slots, its slots' clipped-off pieces) come after every other tile:
  // they take only what no tile takes, never a real edge's room.
  const later: Tile[] = [];
  // A real edge's refused stretches, placed once every surviving tile is.
  const refused: Tile[] = tiles.filter(isRefused);
  // Where each owned part landed in `placed` (its overreach joins it there), and the slots whose owned part went whole.
  const landed = new Map<Tile, number[]>();
  const gone = new Set<Tile>();
  const place = (t: Tile): void => {
    // Home's tile is the item's own place: nothing clips it.
    if (t.order === 0) {
      placed.push(t);
      return;
    }
    // A wholly refused edge: its drawn rect less only what is placed (the targets, and refusals placed before it), one
    // refusal with every piece of 1 px and more each way (`hits`, `hit` the largest): a target in the middle of a bar
    // leaves the refusal on both sides of it.
    if (t.whole) {
      const pieces = clip(t.hit, placed.flatMap(coverOf)).filter((p) => p.width >= 1 && p.height >= 1);
      if (pieces.length > 0) placed.push(withPieces(t, pieces));
      return;
    }
    const data = EDGE_KINDS[t.edgeKind];
    if (data.virtual && t.kind === "refuse") {
      later.push(t);
      return;
    }
    if (t.kind === "reach") {
      // Overreach: what the virtual edges and every other edge's owned rect leave, joined to its owned part where it
      // meets that part along the part's whole length. The rest is nobody's (the float's).
      placeReach(t, clip(t.hit, [...placed.flatMap(coverOf), ...others(t), ...bodiesOf(t), ...solid, ...chrome]), placed, landed, gone);
      return;
    }
    // An owned part: clear of the tiles before it, of the owners that win over its edge, its panel bodies, solid items
    // and chrome. A virtual edge's tile: clear of the tiles before it and of every owner. A refusal owns nothing: it
    // yields to every other edge's owned rect too.
    const yields = t.kind === "refuse" ? besides(t) : [];
    // Panel bodies are no drop places: they cut slots' tiles, never refusals (an edge that takes nothing, a thumbnail
    // strip, refuses its whole seen rect).
    const cuts = [...placed.flatMap(coverOf), ...((t.spec && taken.get(t.spec)) ?? []), ...yields, ...(data.virtual || t.kind === "refuse" ? [] : bodiesOf(t)), ...solid, ...chrome];
    const pieces = clip(t.hit, cuts);
    if (pieces.length === 0) {
      if (t.kind !== "refuse") gone.add(t);
      return;
    }
    if (t.kind === "refuse") {
      landed.set(t, pieces.map((_, k) => placed.length + k));
      for (const p of pieces) placed.push({ ...t, hit: p });
      return;
    }
    // Clipping changes a slot's shape, never who owns the stretch: whatever is left of its tile stays the slot's, every
    // piece (`hits`, `hit` the largest), so clipping never leaves a hole the float fills nor a refusal in the slot's room.
    // No sliver, after ownership: a piece under 1 px either way is no part of a target (it is refused), and a slot left
    // with no other piece is no target. Under 1 px is no room (as in a zone's room), so the slot isn't lost: its line
    // lay where its neighbors left it no place.
    const solidPieces = pieces.filter((p) => p.width >= 1 && p.height >= 1);
    for (const p of pieces) if (!solidPieces.includes(p)) (data.virtual ? later : refused).push({ ...t, kind: "refuse", reason: t.spec ? roomReason(t.spec, t.zone) : "no-room", hit: p, keep: null });
    if (solidPieces.length === 0) return;
    landed.set(t, [placed.length]);
    placed.push(withPieces(t, solidPieces));
  };
  const byOrder = (a: Tile, b: Tile): number => a.order - b.order;
  for (const t of tiles.filter((x) => !isRefused(x)).sort(byOrder)) place(t);
  for (const t of refused.sort(byOrder)) place(t);
  // Home is never lost: its own rect carries it.
  for (const t of gone) if (t.kind !== "home") lost.push(t.id);
  for (const t of later) for (const p of clip(t.hit, [...placed.flatMap(coverOf), ...besides(t), ...solid, ...chrome])) placed.push({ ...t, hit: p });
  return placed;
}
