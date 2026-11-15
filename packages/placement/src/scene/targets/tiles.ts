/**
 * Tiles: each edge's zones split into its slots' tiles (`tileEdge`), then clipped in precedence order (`clipTiles`):
 * each clear of the tiles before it, of what outranks its edge, of the fixed items that don't grow and of the chrome.
 */
import { EPS, area, contains, rect, subtract, type Point, type Rect } from "../../geometry";
import { zoneOf, type SceneLayout, type Zone } from "../model";
import { EDGE_KINDS } from "./kinds";
import { less, type Ctx, type EdgeSpec, type SceneRefusal, type Slot, type Span, type Tile } from "./model";
import type { Ownership } from "./ownership";

/** How one edge makes its tiles: its band, the point a tile keeps, and a tile's split into owned part and overreach. */
interface Tiler {
  readonly band: (a: number, b: number, after?: SceneLayout) => Rect;
  readonly keepAt: (line: number, h: Rect) => Point;
  readonly tile: (zone: Zone, hit: Rect, more: Pick<Tile, "kind" | "id" | "order" | "priority" | "keep"> & Partial<Tile>) => Tile;
  readonly split: (t: Tile) => Tile[];
}

function tilerOf(spec: EdgeSpec): Tiler {
  const data = EDGE_KINDS[spec.kind];
  const v = spec.vertical;
  const band = (a: number, b: number, after?: SceneLayout): Rect => {
    const [c0, c1] = spec.across(after);
    return v ? rect(c0, a, c1 - c0, b - a) : rect(a, c0, b - a, c1 - c0);
  };
  // The point a tile keeps through clipping: on its line, in the middle of its band across.
  const keepAt = (line: number, h: Rect): Point => (v ? { x: h.x + h.width / 2, y: line } : { x: line, y: h.y + h.height / 2 });
  const tile: Tiler["tile"] = (zone, hit, more) => ({ edge: spec.id, key: spec.key, edgeKind: spec.kind, vertical: v, zone, hit, ...more });
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

/**
 * Slots that are the same move are one slot, the first (the lowest `at`) keeping it: one line and one landing, or both
 * home (both put the item back, wherever their lines lie).
 */
function distinctSlots(c: Ctx, slots: readonly Slot[]): Slot[] {
  const landing = (s: Slot): Rect | undefined => s.result.layout.items[c.dragged]?.rect;
  const sameMove = (a: Slot, b: Slot): boolean => {
    if (a.zone !== b.zone) return false;
    if (a.home && b.home) return true;
    const [p, q] = [landing(a), landing(b)];
    return Math.abs(a.line - b.line) < EPS && (!p || !q ? p === q : Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.width - q.width) + Math.abs(p.height - q.height) < 0.01);
  };
  return slots.filter((s, i) => !slots.slice(0, i).some((o) => sameMove(o, s)));
}

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
  const inPiece = mine.filter((s) => proj(s.line) >= pa - EPS && proj(s.line) <= pb + EPS).sort((a, b) => proj(a.line) - proj(b.line) || a.line - b.line);
  // Where projection lays two different moves on one point (lines under the own place or another edge's), the piece's
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
export function tileEdge(c: Ctx, spec: EdgeSpec, cuts: readonly Span[], lost: string[]): Tile[] {
  const data = EDGE_KINDS[spec.kind];
  const v = spec.vertical;
  const own: Span | null = spec.own ? (v ? [spec.own.y, spec.own.y + spec.own.height] : [spec.own.x, spec.own.x + spec.own.width]) : null;
  const { band, keepAt, tile, split } = tilerOf(spec);
  const refused = (zone: Zone, hit: Rect, reason: SceneRefusal["reason"]): Tile => tile(zone, hit, { kind: "refuse", id: "", order: data.layer, priority: data.priority, keep: null, reason });
  const slots = distinctSlots(c, spec.slots);
  const out: Tile[] = [];
  for (const z of spec.zones) {
    // The zone's extent less its reserved rects and what other edges own: a zone left with nothing has no slot.
    const room = less([[z.a, z.b]], [...cuts, ...spec.reserved]).filter(([a, b]) => b - a > EPS);
    if (room.length === 0) continue;
    // Less the own interval, which home owns: a zone wholly under the item's own place has no room left either.
    const pieces = own ? less(room, [own]) : room;
    // A slot with no room within its kind's reach of its line isn't offered.
    const mine = slots.filter((s) => s.zone === z.zone && !(spec.holds && s.home) && pieces.some(([a, b]) => b > s.line - data.reach + EPS && a < s.line + data.reach - EPS));
    const reason = spec.refuse(z.zone);
    for (const [pa, pb] of pieces) {
      const { inPiece, at } = linesIn(spec, z, mine, pieces, [pa, pb], own);
      if (inPiece.length === 0) {
        // A stretch of a zone with no slot of its own is refused: home is only over the item's own place, and no stretch
        // is handed to another zone's slot. Beside a lone item (the zone's only slot is home) there is room, but no
        // place other than its own: `own-place`.
        // A stretch out of every slot's reach is no part of this edge.
        const lone = reason === "no-room" && mine.length === 0 && slots.some((s) => s.zone === z.zone && s.home);
        const near = mine.length === 0 || mine.some((s) => pb > s.line - data.reach + EPS && pa < s.line + data.reach - EPS);
        if (reason && near) out.push(...split(refused(z.zone, band(pa, pb), lone ? "own-place" : reason)));
        continue;
      }
      inPiece.forEach((s, i) => {
        // Halfway between neighbouring lines, the piece's ends at its ends (the own interval's ends are one), and no
        // further from its line than the kind's reach.
        const p = at[i]!;
        const a = Math.max(i === 0 ? pa : (at[i - 1]! + p) / 2, p - data.reach);
        const b = Math.min(i === inPiece.length - 1 ? pb : (p + at[i + 1]!) / 2, p + data.reach);
        if (b - a <= EPS) {
          if (s.ok) lost.push(s.id);
          return;
        }
        const line = Math.min(Math.max(p, a), b);
        const hit = band(a, b, s.result.layout);
        if (!s.ok) out.push(...split(refused(z.zone, hit, "no-room")));
        else if (s.home) out.push(...split(tile(z.zone, hit, { kind: "home", id: s.id, order: data.layer, priority: data.priority, keep: keepAt(line, hit), place: { kind: "home" } })));
        else out.push(...split(tile(z.zone, hit, { kind: "slot", id: s.id, order: data.layer, priority: data.priority, keep: keepAt(line, hit), place: s.place, result: s.result, marker: spec.marker(s), slot: s.result.layout.items[c.dragged]!.rect })));
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
    out.push(tile(home?.zone ?? zoneOf(c.scene.items[c.dragged]), hit, { kind: "home", id: home ? home.id : `home:${c.dragged}`, order: 0, priority: home ? data.priority : 1, keep: null, place: { kind: "home" } }));
  }
  return out;
}

const clip = (r: Rect, cuts: readonly Rect[]): Rect[] => cuts.reduce<Rect[]>((ps, cut) => ps.flatMap((p) => subtract(p, cut)), [r]);
/** A rect with x and y swapped. */
const flip = (r: Rect): Rect => rect(r.y, r.x, r.height, r.width);
/** `clip` cut the other way: what each cut leaves split into its top and bottom strips first, then the sides between. */
const clipAcross = (r: Rect, cuts: readonly Rect[]): Rect[] => clip(flip(r), cuts.map(flip)).map(flip);

/** An overreach tile `t` placed: joined to its owned part where it meets that part whole, or standing in for it. */
function placeReach(t: Tile, pieces: readonly Rect[], placed: Tile[], landed: ReadonlyMap<Tile, number[]>, gone: Set<Tile>): void {
  const of = t.of!;
  const at = landed.get(of) ?? [];
  if (at.length === 0 && gone.has(of)) {
    // Its owned part went whole: the overreach stands in for it, the piece on its line (else its largest).
    const line = t.vertical ? of.keep!.y : of.keep!.x;
    const on = pieces.filter((p) => (t.vertical ? p.y <= line + EPS && line <= p.y + p.height + EPS : p.x <= line + EPS && line <= p.x + p.width + EPS));
    const kept = (on.length > 0 ? on : pieces).reduce<Rect | null>((a, p) => (!a || area(p) > area(a) ? p : a), null);
    if (kept) {
      placed.push({ ...of, hit: kept });
      gone.delete(of);
    }
    return;
  }
  for (const i of at) {
    const h = placed[i]!.hit;
    const joint = pieces.find((p) =>
      t.vertical
        ? p.y <= h.y + EPS && p.y + p.height >= h.y + h.height - EPS && (Math.abs(p.x - h.x - h.width) < EPS || Math.abs(p.x + p.width - h.x) < EPS)
        : p.x <= h.x + EPS && p.x + p.width >= h.x + h.width - EPS && (Math.abs(p.y - h.y - h.height) < EPS || Math.abs(p.y + p.height - h.y) < EPS),
    );
    if (!joint) continue;
    const merged = t.vertical
      ? rect(Math.min(h.x, joint.x), h.y, Math.max(h.x + h.width, joint.x + joint.width) - Math.min(h.x, joint.x), h.height)
      : rect(h.x, Math.min(h.y, joint.y), h.width, Math.max(h.y + h.height, joint.y + joint.height) - Math.min(h.y, joint.y));
    placed[i] = { ...placed[i]!, hit: merged };
    break;
  }
}

/** A refused tile, or the overreach of one. */
const isRefused = (t: Tile): boolean => t.kind === "refuse" || (t.kind === "reach" && t.of!.kind === "refuse");

/**
 * Filter (iii), clipping in precedence order: each tile clear of the ones before it, of the other edges' rects (with the
 * item lifted, and as they are now), of the fixed items that don't grow and of the chrome. Returns the tiles placed;
 * slots whose every part went are added to `lost`.
 *
 * A slot the filter removed owns nothing against other edges: every surviving tile is placed first, in precedence
 * order, and the refused tiles (with their overreach and the clipped-off pieces of slots) then take what is left, in
 * the same order. Within its own edge a refusal keeps its tile: an edge's tiles never overlap each other.
 */
export function clipTiles(tiles: readonly Tile[], own: Ownership, chrome: readonly Rect[], lost: string[]): Tile[] {
  const { owners, taken, bodies, solid } = own;
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
    const data = EDGE_KINDS[t.edgeKind];
    if (data.virtual && t.kind === "refuse") {
      later.push(t);
      return;
    }
    if (t.kind === "reach") {
      // Overreach: what the virtual edges and every other edge's owned rect leave, joined to its owned part where it
      // meets that part along the part's whole length. The rest is nobody's (the float's).
      placeReach(t, clip(t.hit, [...placed.map((p) => p.hit), ...owners.filter((o) => o.key !== t.key).map((o) => o.rect), ...bodies(t.edge), ...solid, ...chrome]), placed, landed, gone);
      return;
    }
    // An owned part: clear of the tiles before it, of the owners that win over its edge, its panel bodies, solid items
    // and chrome. A virtual edge's tile: clear of the tiles before it and of every owner.
    const cuts = [...placed.map((p) => p.hit), ...(taken.get(t.key) ?? []), ...(data.virtual ? [] : bodies(t.edge)), ...solid, ...chrome];
    let pieces = clip(t.hit, cuts);
    if (pieces.length === 0) {
      if (t.kind !== "refuse") gone.add(t);
      return;
    }
    if (t.kind === "refuse") {
      landed.set(t, pieces.map((_, k) => placed.length + k));
      for (const p of pieces) placed.push({ ...t, hit: p });
      return;
    }
    // A slot keeps the piece that holds its line (else its largest); its other pieces are refused for its zone, a virtual
    // edge's as a real one's, so clipping never leaves a hole the float fills. What is left of a tile can be one
    // connected region that isn't a rect (an L where a cut takes a corner): it is cut into rects both ways, side strips
    // first and top and bottom strips first, and the slot keeps the larger piece on its line, so no part of its own
    // region next to that piece is refused only for the way it was cut.
    const keptOf = (ps: readonly Rect[]): Rect => {
      const held = t.keep ? ps.filter((p) => contains(p, t.keep!)) : [];
      return (held.length > 0 ? held : ps).reduce((a, p) => (area(p) > area(a) ? p : a));
    };
    if (pieces.length > 1) {
      const other = clipAcross(t.hit, cuts);
      if (other.length > 0 && area(keptOf(other)) > area(keptOf(pieces)) + EPS) pieces = other;
    }
    const kept = keptOf(pieces);
    // No sliver: a slot left under 1 px along its edge is no target (its piece is refused).
    const sliver = (t.vertical ? kept.height : kept.width) < 1;
    if (!sliver) {
      landed.set(t, [placed.length]);
      placed.push({ ...t, hit: kept });
    }
    for (const p of pieces) if (sliver || p !== kept) (data.virtual ? later : refused).push({ ...t, kind: "refuse", reason: "no-room", hit: p, keep: null });
  };
  const byOrder = (a: Tile, b: Tile): number => a.order - b.order;
  for (const t of tiles.filter((x) => !isRefused(x)).sort(byOrder)) place(t);
  for (const t of refused.sort(byOrder)) place(t);
  for (const t of gone) lost.push(t.id);
  for (const t of later) for (const p of clip(t.hit, [...placed.map((q) => q.hit), ...solid, ...chrome])) placed.push({ ...t, hit: p });
  return placed;
}
