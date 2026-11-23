/**
 * Tiles: each edge's zones split into its slots' tiles (`tileEdge`), then clipped in precedence order (`clipTiles`):
 * each clear of the tiles before it, of what outranks its edge, of the fixed items that don't grow and of the chrome.
 */
import { EPS, area, overlaps, rect, subtract, type Point, type Rect } from "@n-uf/placement";
import { itemSteps } from "@n-uf/placement/stack";
import { SPOT_PITCH, aimCut, cutsByHalves } from "../aim";
import { moveTo } from "../changes";
import { axisOf, zoneOf } from "../helpers";
import { ZONES, type DockLayout, type Zone } from "../model";
import { distinctSlots, roomReason, solveLanded } from "./edges";
import { targetId } from "./ids";
import { EDGE_KINDS } from "./kinds";
import { meet } from "./meet";
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
 * Reach only adds: a zone's room split into its own pieces (along the edge's length, `ends`) and the reach strips past
 * the edge's ends that another edge's band cuts off from them (`before` the edge's start, `after` its end). A strip takes
 * no slot's line, so reach never moves a zone's slot out of the zone's own span; the slot at that end of the zone takes
 * it as one more piece of its tile. Past an edge not drawn (an empty bar's band) the strip reaches on; past a drawn edge
 * (a bar holding items) it stops at that edge's side, so there is none. A zone with no room of its own keeps its room
 * as it is, strips and all (a virtual edge, with no `ends`, too).
 */
function reachStrips(c: Ctx, spec: EdgeSpec, room: readonly Span[], ends: Span | null): { pieces: Span[]; before: Span[]; after: Span[] } {
  const inEdge = (s: Span): boolean => !!ends && s[0] < ends[1] - EPS && s[1] > ends[0] + EPS;
  const pieces = room.filter(inEdge);
  if (!ends || pieces.length === 0) return { pieces: [...room], before: [], after: [] };
  const [c0, c1] = spec.across();
  const bandOf = (a: number, b: number): Rect => (spec.vertical ? rect(c0, a, c1 - c0, b - a) : rect(a, c0, b - a, c1 - c0));
  // Whether a drawn edge across this one (a bar across a rail's end, not a column along it) lies over the band between `a` and `b`.
  const across = c.state.edges.filter((e) => (axisOf(e.side) === "column") !== spec.vertical).map((e) => c.now.edges[e.id]);
  const drawnBetween = (a: number, b: number): boolean => b - a > EPS && across.some((e) => !!e && e.cross > EPS && area(e.rect) > EPS && overlaps(e.rect, bandOf(a, b)));
  const first = pieces[0]![0];
  const last = pieces[pieces.length - 1]![1];
  return {
    pieces,
    before: room.filter((s) => s[1] <= ends[0] + EPS && !drawnBetween(s[1], first)),
    after: room.filter((s) => s[0] >= ends[1] - EPS && !drawnBetween(last, s[0])),
  };
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
  // A panel column takes a panel by halves; a bar or a toolbar rail by its landings (`aimCut`).
  const halves = !spec.edge || cutsByHalves(spec.edge);
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
  const ends: Span | null = alongLimit && drawn ? (v ? [drawn.y, drawn.y + drawn.height] : [drawn.x, drawn.x + drawn.width]) : null;
  const out: Tile[] = [];
  // The stretches the slots' own tiles take: what the aim cuts hand a neighbor slot of the own interval (`meets` below).
  const slotSpans: Span[] = [];
  // On a bar or a toolbar rail with a home slot, what of the own interval home's stretch keeps (set by the landing cuts).
  let ownKept: Span[] | null = null;
  // Where a slot's drop lands the item (its own rect for home, as home's drop lays it: a movable grower at its natural
  // length): what the aim cuts read.
  const ownRect = (homeSlot ?? slots.find((s) => s.home))?.result.layout.items[c.dragged]?.rect ?? c.now.items[c.dragged]?.rect ?? spec.own ?? undefined;
  /** Whether a slot's drop moves another item of the edge from where the lift leaves it (no drop into free room). */
  const movesOthers = (s: Slot): boolean =>
    Object.entries(c.base.items).some(([id, it]) => {
      if (id === c.dragged || it.edge !== spec.id || it.inMenu) return false;
      const now = s.result.layout.items[id];
      return !now || Math.abs(now.rect.x - it.rect.x) > 0.5 || Math.abs(now.rect.y - it.rect.y) > 0.5;
    });
  const axis = v ? ("y" as const) : ("x" as const);
  const span = (r: Rect): Span => (v ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
  // The order a layout leaves the edge's shown items in (fixed ones too).
  const orderIn = (l: DockLayout): string =>
    Object.entries(l.items)
      .filter(([, it]) => it.edge === spec.id && !it.inMenu && !it.floating && area(it.rect) > EPS)
      .sort(([, p], [, q]) => span(p.rect)[0] - span(q.rect)[0])
      .map(([id]) => id)
      .join(" ");
  const homeOrder = orderIn(c.now);
  // On a bar or a toolbar rail the item's own place is one landing for half a pitch around it (`aimSlack`), as in
  // `lanes()`: a slot landing that near is home's, so away and back to the press point is home. (Not a drop into free
  // room, which moves no other item: that is a sliding spot's there, never home's. Nor one that leaves home's order,
  // the item docked in another zone: it is home's place already, its zone's piece its own.)
  const nearHome = (s: Slot): boolean => {
    if (halves || s.home || !spec.own || !ownRect || c.now.items[c.dragged]?.inMenu) return false;
    const l = s.result.layout.items[c.dragged]?.rect;
    return !!l && Math.abs((v ? l.y : l.x) - (v ? ownRect.y : ownRect.x)) < c.slack && movesOthers(s) && orderIn(s.result.layout) !== homeOrder;
  };
  const landingOf = (s: Slot): Rect | undefined => (s.home || nearHome(s) ? ownRect : s.result.layout.items[c.dragged]?.rect);
  // A growing item's length past its natural one: spare room, which a landing beside it may take (it gives way).
  const slackOf = (id: string, s: Span): number => {
    const main = c.state.items[id]?.forms[v ? "column" : "row"]?.[0]?.main;
    return main?.grows ? Math.max(0, s[1] - s[0] - main.natural) : 0;
  };
  // The order a slot's drop leaves the edge's shown items in: home's is the order seen.
  const orders = new Map<Slot, string>();
  const orderOf = (s: Slot): string => {
    let k = orders.get(s);
    if (k === undefined) orders.set(s, (k = s.home || nearHome(s) ? homeOrder : orderIn(s.result.layout)));
    return k;
  };
  const gapPx = Math.max(0, spec.edge?.gap ?? 0) || 0;
  // Each slot's stretch of its zone's piece, in the order the zones and pieces are tiled, made into tiles once the aim
  // cuts across zones are known (below).
  const stretchesOf: { s: Slot; a: number; b: number; make: (a: number, b: number) => void }[] = [];
  for (const z of spec.zones) {
    // The zone's extent less its reserved rects and what other edges own: a zone left with nothing has no slot.
    const room = less([[z.a, z.b]], [...cuts, ...spec.reserved]).filter(([a, b]) => b - a > EPS);
    // Less the own interval, which home owns: a zone wholly under the item's own place has no room left either.
    // Reach only adds: a stretch past the edge's ends cut off from the zone's own room is a reach strip, which takes no
    // line, so the zone's slots lie in its own span; it joins the outermost slot's tile on its side (`reachStrips`).
    const { pieces, before, after } = reachStrips(c, spec, own ? less(room, [own]) : room, ends);
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
    for (const [k, [pa, pb]] of pieces.entries()) {
      const { inPiece, at } = linesIn(spec, z, mine, pieces, [pa, pb], own);
      // The reach strips the slot at each end of this piece takes: those before the zone's first piece, after its last.
      const stripsOf = (i: number): Span[] => [...(k === 0 && i === 0 ? before : []), ...(k === pieces.length - 1 && i === inPiece.length - 1 ? after : [])];
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
      // Where two neighboring slots meet across the one item between their lines (the item a pointer aims at there):
      // in a panel column that item's middle (`aimCut` by halves: its leading half the place before it, its trailing
      // half the place after it), kept between the lines; with no one item between them, halfway between the lines.
      // (The item lies between the lines as seen, before projection: a line past the piece, under another edge's band,
      // still bounds it.) On a bar or a toolbar rail this split stands only between slots of one place (one order:
      // which zone a drop over free room docks in); between places the landing cuts below decide, across zones and
      // pieces alike, so every slot keeps its stretch of the room until they do.
      const meets: number[] = [];
      for (let i = 1; i < inPiece.length; i++) {
        const [lo, hi] = [at[i - 1]!, at[i]!];
        const between = spec.cards.filter(([u, w]) => u >= inPiece[i - 1]!.line - EPS && w <= inPiece[i]!.line + EPS);
        const la = landingOf(inPiece[i - 1]!);
        const lb = landingOf(inPiece[i]!);
        const [u, w] = between[0] ?? [NaN, NaN];
        const mid = between.length === 1 ? aimCut(la ?? rect(0, 0, 0, 0), lb ?? rect(0, 0, 0, 0), v ? "y" : "x", 0.5, 0, v ? rect(0, u, 0, w - u) : rect(u, 0, w - u, 0)) : NaN;
        meets[i] = mid > lo + EPS && mid < hi - EPS ? mid : (lo + hi) / 2;
      }
      const meet = (i: number): number => meets[i]!;
      inPiece.forEach((s, i) => {
        // The meeting points with the neighboring slots, the piece's ends at its ends (the own interval's ends are one),
        // and no further from its line than the kind's reach (a virtual edge's zone is that reach already: an outermost
        // column line's zone runs from the window's edge, past where the line's reach would end).
        const p = at[i]!;
        const lim = data.virtual ? Infinity : data.reach;
        const a0 = Math.max(i === 0 ? pa : meet(i), p - lim);
        const b0 = Math.min(i === inPiece.length - 1 ? pb : meet(i + 1), p + lim);
        stretchesOf.push({ s, a: a0, b: b0, make: (a, b) => makeTiles(a, b) });
        const makeTiles = (a: number, b: number): void => {
        if (b - a <= EPS) {
          if (s.ok && !s.home) lost.push(s.id);
          return;
        }
        // A tile wholly over panel bodies has no drop place: the slot has no room here, so it isn't offered.
        if (!hasRoom([[a, b]], bodies)) return;
        const homeTile = (id: string, u: number, w: number, line: number): Tile => {
          const hit = band(u, w, s.home ? s.result.layout : undefined);
          return tile(z.zone, hit, { kind: "home", id, order: data.layer, priority: spec.homePriority ?? data.priority, keep: keepAt(Math.min(Math.max(line, u), w), hit), place: { kind: "home" } });
        };
        if (s.home || nearHome(s)) {
          for (const [u, w] of [[a, b], ...stripsOf(i)] as Span[]) out.push(...split(homeTile(s.home ? s.id : (homeSlot?.id ?? s.id), u, w, p)));
          return;
        }
        // A slot of home's order in another zone is the same aim as home over the items it faces: their halves are
        // home's; the rest of its tile, the free stretch beside them, is its own (the item re-aligned, its order kept).
        // (In a panel column only: a bar or a toolbar rail takes the nearest landing, by zones below.)
        const faced = halves && homeSlot && s.order === homeSlot.order ? spec.cards.filter(([u, w]) => w > a + EPS && u < b - EPS) : [];
        for (const [u, w] of faced) out.push(...split(homeTile(homeSlot!.id, Math.max(u, a), Math.min(w, b), p)));
        for (const [u, w] of [...less([[a, b]], faced), ...stripsOf(i)]) {
          const line = Math.min(Math.max(p, u), w);
          const hit = band(u, w, s.result.layout);
          if (!s.ok) {
            out.push(...refused(z.zone, hit, roomReason(spec, z.zone)));
            continue;
          }
          slotSpans.push([u, w]);
          out.push(...split(tile(z.zone, hit, { kind: "slot", id: s.id, order: data.layer, priority: data.priority, keep: keepAt(line, hit), place: s.place, result: s.result, marker: spec.marker(s), slot: s.result.layout.items[c.dragged]!.rect })));
        }
        };
      });
    }
  }
  // On a bar or a toolbar rail the places are cut by their landings, whatever their zones and pieces (the zone pieces
  // only say which places exist and fit: the room, growth off). Every slot's landing lies in the layout its own drop
  // commits; a place over free room is a sliding spot's (`rangeOf`), whose landings are at the hand over its range.
  // In order of their landings, the places follow one another along the edge, and between two the cut lies halfway
  // between their facing landings (`cutBetween`, as `lanes()` cuts its spots). A place's stretch runs from the cut
  // before it to the cut after it; slots of one place (one order, several zones: which zone a drop over free room
  // docks in) share it by their zone pieces. A place whose landing an earlier place has already is that place's (one
  // landing, one place): it has no stretch, though it stays a stop.
  if (!halves) {
    // (The item's own interval is home's stretch too: a cut beside it may hand part of it to the next place.)
    const ownStretch: typeof stretchesOf = own && homeSlot ? [{ s: homeSlot, a: own[0], b: own[1], make: (): void => undefined }] : [];
    const all = [...stretchesOf, ...ownStretch];
    type Stretch = (typeof all)[number];
    const padStart = Math.max(0, spec.edge?.pad?.start ?? 0) || 0;
    const padEnd = Math.max(0, spec.edge?.pad?.end ?? 0) || 0;
    const zoneIn = (id: string): Zone => (c.base.items[id]?.zone ?? "start") as Zone;
    const neighborsIn = (order: string): { before?: string; after?: string } | null => {
      const ids = order.split(" ");
      const k = ids.indexOf(c.dragged);
      return k < 0 ? null : { ...(k > 0 ? { before: ids[k - 1] } : {}), ...(k + 1 < ids.length ? { after: ids[k + 1] } : {}) };
    };
    /**
     * A place's range over free room, as `lanes()` slides a spot over a free stretch: the room its drop makes, from flush
     * after the neighbor before it (a growing one at its natural length: its slack is spare room, it gives way) to
     * flush before the neighbor after it, read in the layout of the dock with no space in the zone a dock there takes
     * first (start after a start item or the edge's start, else end); where that dock pushes a neighbor on a side with
     * no zone of its own, that end as the lift leaves it. Its first and last landings, the item at either end. Null
     * where no zone takes a dock there.
     */
    const ranges = new Map<string, { from: number; to: number; w: number; first: Rect; last: Rect } | null>();
    const rangeOf = (order: string): { from: number; to: number; w: number; first: Rect; last: Rect } | null => {
      if (ranges.has(order)) return ranges.get(order)!;
      const n = neighborsIn(order);
      const zones: Zone[] = n ? [...(!n.before || zoneIn(n.before) === "start" ? ["start" as const] : []), ...(!n.after || zoneIn(n.after) === "end" ? ["end" as const] : [])] : [];
      const ends = (l: DockLayout): { a: number; b: number } | null => {
        const at = (id: string): Rect | null => {
          const it = l.items[id];
          return it && it.edge === spec.id && !it.inMenu && !it.floating ? it.rect : null;
        };
        const rb = n?.before ? at(n.before) : undefined;
        const ra = n?.after ? at(n.after) : undefined;
        const el = l.edges[spec.id]?.rect ?? drawn;
        if (rb === null || ra === null || !el) return null;
        return { a: rb ? span(rb)[1] - slackOf(n!.before!, span(rb)) + gapPx : span(el)[0] + padStart, b: ra ? span(ra)[0] - gapPx : span(el)[1] - padEnd };
      };
      const probe = zones.length ? spec.slots.find((s) => s.place.kind === "gap" && s.place.zone === zones[0] && !!s.result.layout.items[c.dragged] && orderOf(s) === order) : undefined;
      const pl = probe?.result.layout;
      const pe = pl ? ends(pl) : null;
      const se = ends(c.base);
      // Whether the dock pushes `id` on `side` from where the lift leaves it (`givesWay`'s "moves"), slack aside.
      const pushed = (id: string | undefined, side: "before" | "after"): boolean => {
        const p = id ? c.base.items[id] : undefined;
        const q = id && pl ? pl.items[id] : undefined;
        if (!p || !q || q.inMenu || q.floating || q.edge !== spec.id) return false;
        const [p0, p1] = span(p.rect);
        const [q0, q1] = span(q.rect);
        if (q.form !== p.form && q1 - q0 < p1 - p0 - 0.5) return false;
        return side === "before" ? p1 - slackOf(id!, [p0, p1]) - (q1 - slackOf(id!, [q0, q1])) > 0.5 : q0 - p0 > 0.5;
      };
      const shape = pl?.items[c.dragged]?.rect;
      let r: { from: number; to: number; w: number; first: Rect; last: Rect } | null = null;
      if (n && zones.length && shape && (pe || se)) {
        const a = pe && (zones.includes("start") || !pushed(n.before, "before")) ? pe.a : (se ?? pe)!.a;
        const b = pe && (zones.includes("end") || !pushed(n.after, "after")) ? pe.b : (se ?? pe)!.b;
        const w = span(shape)[1] - span(shape)[0];
        // The landings that land where aimed (within 1 px, every fixed item kept): at the range's ends and every pitch
        // between, as `lanes()` samples them. A dock keeps the space that puts the item there, in the zone nearer the
        // edge's middle first.
        const ids = order.split(" ");
        const atOf = (zone: Zone): number => ids.slice(0, ids.indexOf(c.dragged)).filter((id) => zoneIn(id) === zone).length;
        const middle = ((e) => (e ? (span(e)[0] + span(e)[1]) / 2 : 0))(c.base.edges[spec.id]?.rect ?? drawn);
        const fixed = Object.entries(c.base.items).filter(([id, it]) => id !== c.dragged && it.edge === spec.id && !it.inMenu && !it.floating && c.state.items[id]?.fixed);
        const lands = (x0: number): boolean => {
          const near: Zone = x0 + w / 2 < middle ? "start" : "end";
          for (const zone of [near, near === "start" ? ("end" as const) : ("start" as const)]) {
            if (!zones.includes(zone)) continue;
            const space = zone === "start" ? x0 - a : b - (x0 + w);
            if (space < -EPS) continue;
            const next = moveTo(c.state, c.dragged, { edge: spec.id, zone, at: atOf(zone), space: Math.max(0, space) });
            if (next === c.state) continue;
            const l = solveLanded(next, c.dragged, c.prev);
            const it = l.items[c.dragged];
            if (!it || it.inMenu || it.edge !== spec.id || Math.abs(span(it.rect)[0] - x0) > 1) continue;
            const kept = fixed.every(([id, f]) => {
              const now = l.items[id];
              return (now?.inMenu && itemSteps(c.state.items[id]!)) || (!!now && Math.abs(span(now.rect)[0] - span(f.rect)[0]) <= 1);
            });
            if (kept) return true;
          }
          return false;
        };
        const sample = c.slack > 0 ? 2 * c.slack : SPOT_PITCH;
        const tries = [a];
        for (let x0 = a + sample; x0 < b - w - EPS; x0 += sample) tries.push(x0);
        if (b - w > a + EPS) tries.push(b - w);
        const from = tries.find(lands);
        const to = from === undefined ? undefined : [...tries].reverse().find((x0) => x0 <= from || lands(x0));
        const placed = (x0: number): Rect => (v ? { ...shape, y: x0 } : { ...shape, x: x0 });
        // (Room for a single start is a point, no range: the dock there is a slot's landing as it is.)
        if (from !== undefined && to !== undefined && to - from >= 1) r = { from, to, w, first: placed(from), last: placed(to) };
      }
      ranges.set(order, r);
      return r;
    };
    // The range a slot's landing lies in (its place's, the item at the same length), if any: its landings are then the
    // range's, at the hand.
    const rangeFor = (s: Slot): ReturnType<typeof rangeOf> => {
      const l = landingOf(s);
      const r = l ? rangeOf(orderOf(s)) : null;
      const [l0, l1] = l ? span(l) : [NaN, NaN];
      return r && Math.abs(l1 - l0 - r.w) <= 1 && l0 >= r.from - 1 && l0 <= r.to + 1 ? r : null;
    };
    const firstOf = (s: Slot): Rect => rangeFor(s)?.first ?? landingOf(s)!;
    const lastOf = (s: Slot): Rect => rangeFor(s)?.last ?? landingOf(s)!;
    const mid = (r: Rect): number => (span(r)[0] + span(r)[1]) / 2;
    // At one landing the item's own place first, then the dock in the zone of the neighbor before it (a drop flush after
    // the last start-zone item stays in the start zone).
    const besideZone = (s: Slot): number => {
      const before = neighborsIn(orderOf(s))?.before;
      return s.place.kind === "gap" && s.place.zone === (before ? zoneIn(before) : "start") ? 0 : 1;
    };
    // (The item in its » menu has no landing along the edge: home is its » entry, which keeps what no place takes.)
    const inMenu = !!c.now.items[c.dragged]?.inMenu;
    const lands = all.filter((r) => (r.s.ok || r.s.home) && !!landingOf(r.s) && !(inMenu && r.s.home));
    const sorted = [...lands].sort((p, q) => mid(firstOf(p.s)) - mid(firstOf(q.s)) || (p.s.home ? -1 : q.s.home ? 1 : 0) || besideZone(p.s) - besideZone(q.s) || p.a - q.a);
    // Whether two slots land the item at one rect along the edge.
    const sameAt = (p: Slot, q: Slot): boolean => span(landingOf(p)!).every((x, n) => Math.abs(x - span(landingOf(q)!)[n]!) < 0.5);
    const runs: Stretch[][] = [];
    const dropped: Stretch[] = [];
    for (const r of sorted) {
      const last = runs.at(-1);
      if (last && orderOf(last[0]!.s) === orderOf(r.s)) {
        last.push(r);
        continue;
      }
      if (runs.some((run) => run.some((x) => !rangeFor(x.s) && !rangeFor(r.s) && sameAt(x.s, r.s)))) dropped.push(r);
      else runs.push([r]);
    }
    // A place's facing landings: of its slots, the last landing faces the place after it, the first the place before.
    const facing = (run: readonly Stretch[], end: boolean): Rect =>
      run.map((r) => (end ? lastOf(r.s) : firstOf(r.s))).reduce((m, x) => (end ? (span(x)[1] > span(m)[1] ? x : m) : span(x)[0] < span(m)[0] ? x : m));
    const cuts: number[] = [];
    for (let i = 0; i + 1 < runs.length; i++) {
      const raw = aimCut(facing(runs[i]!, true), facing(runs[i + 1]!, false), axis, c.share[axis], c.slack);
      // In order, as `lanes()` keeps its cuts: never before the cut before it.
      cuts.push(Math.max(raw, cuts[i - 1] ?? -Infinity));
    }
    const spans: Span[] = [];
    runs.forEach((run, i) => {
      // The place's stretch: from the cut before it to the cut after it (its slots' pieces at the edge's ends).
      const cp = i > 0 ? cuts[i - 1]! : Math.min(...run.map((r) => r.a));
      const cn = i + 1 < runs.length ? cuts[i]! : Math.max(...run.map((r) => r.b));
      for (const r of run) [r.a, r.b] = [Math.min(Math.max(r.a, cp), cn), Math.max(Math.min(r.b, cn), cp)];
      // (The own interval is laid as home's own tile below, over what its stretch keeps here.)
      const held = run.filter((r) => r.b - r.a > EPS).sort((p, q) => p.a - q.a);
      if (held.length === 0) {
        const one = run.find((r) => !ownStretch.includes(r)) ?? run[0]!;
        [one.a, one.b] = [cp, Math.max(cp, cn)];
      } else {
        held[0]!.a = cp;
        held.at(-1)!.b = Math.max(cp, cn);
      }
      if (cn - cp > EPS) spans.push([cp, cn]);
    });
    for (const r of dropped) r.a = r.b;
    // Every place that fits takes part in the cuts: one that ends with no hit (here, or under a pixel once clipped) is
    // lost, a stop all the same (`stops`). (Lost ids that a target carries are dropped later.)
    for (const r of lands) if (r.s.ok && !r.s.home) lost.push(r.s.id);
    if (ownStretch[0]) ownKept = ownStretch[0].b - ownStretch[0].a > EPS ? [[ownStretch[0].a, ownStretch[0].b]] : [];
    // A refused slot's stretch keeps only what no place's stretch takes.
    for (const r of all.filter((x) => !lands.includes(x))) {
      const left = less([[r.a, r.b]], spans).filter(([u, w]) => w - u > EPS);
      [r.a, r.b] = left.length ? left.reduce((m, x) => (x[1] - x[0] > m[1] - m[0] ? x : m)) : [r.a, r.a];
    }
  }
  for (const r of stretchesOf) r.make(r.a, r.b);
  // (On a bar or a toolbar rail the landing cuts may hand the whole own interval, as the room lays it, to other places:
  // home then has only the stretch its landing gives it.)
  if (own && spec.own && (ownKept === null || ownKept.length > 0)) {
    const home = spec.slots.find((s) => s.home);
    // Across the edge's band and the own rect where it lies now: home's wherever the lift moves things (nothing clips
    // it), less what the landing cuts beside it hand other places. A slot's id and priority; `home:<id>` (1) when no
    // slot is home.
    const kept = ownKept ?? (halves ? [] : less([own], slotSpans).filter(([u, w]) => w - u > EPS));
    const [a, b] = kept.length > 0 ? kept.reduce((m, x) => (x[1] - x[0] > m[1] - m[0] ? x : m)) : own;
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
