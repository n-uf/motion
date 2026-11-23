/**
 * `targets(state, dragged, { previous, endReach, floatSize })`: every drop target for one dragged item, in the shape
 * `@n-uf/motion/drag` takes (`id`, `priority`, `hit`, `slot?`, `free?`). Each target's `after(point, grab)` is the state
 * a release there commits and its layout, `solve(after.state, { previous })`: the host draws every item from that layout
 * during the preview (C22), so the preview is the result by construction.
 *
 * One model makes every docked target and refusal: **edge → zones → slots → tiles**, then one ordered
 * filter.
 *
 * - **Edges.** Every edge, empty or occupied, and two virtual edges per side: the column lines and the rail.
 * - **Zones.** Each edge's start, center and end zones have an extent along it. Where items keep their length and the
 *   zones only align them (bars, compact rails, side toolbar bars) the extents are the edge's thirds; where items fill
 *   the edge (panel columns) a zone's extent is the span the solver gives it: a plain column is one zone, a tray column
 *   its panels' span and its tray's (`EDGE_KINDS`, the only data keyed on the kind of edge). The outer extents reach
 *   `endReach` past the edge's ends.
 * - **The seen geometry.** Every tile is laid in one layout: the committed one, the item in place, as the user sees it
 *   (lines, zone extents, ownership, bands). A place counts in the state with the item lifted (a gap's `at`, a column's
 *   or rail's `ring`); its `after` is the solved drop. An edge the lift deletes offers nothing: the item's own column
 *   collapses into home. A zone where items keep their length reaches over the cards seen in it.
 * - **Slots.** A zone's insertion lines (`gap:<edge>:<zone>:<at>`; on an edge with no members at all a zone has one,
 *   `strip:<edge>:<zone>`). The item's own place is an interval, its own rect along the edge (its » entry in the menu):
 *   home. The home slot's line lies at both ends of it, so the gaps right beside it are home's (the same move).
 * - **Tiles.** A zone's extent split halfway between its slots' lines (lines that lie past the extent are spread into
 *   it); the own interval keeps exactly its length. Panel bodies don't split the tiling: clipping takes them out, and a
 *   slot whose tile is all body has no room. Across: the edge's thickness (the larger of seen and after the drop), an
 *   empty edge's strip depth (`DockEdge.strip`, default 24, inward), a compact rail's `RAIL_REACH` further inward.
 * - **Filter**, in order: (i) the edge and zone take the kind (`accepts`, `zoneAccepts`), and an empty side column opens
 *   only through its start zone; (ii) the drop fits (C29: no » entry, no new overflow or `too-wide`, every fixed item
 *   keeps its form, place and least length, a title bar's title its natural width with the toolbar in its first form;
 *   the slot covers no chrome or reserved rect). A slot (i) or (ii) removes is a refusal over its own tile, with that
 *   reason (`refusals()`). (iii) Space ownership and clipping (`EDGE_KINDS`): owned > virtual > overreach. A zone's
 *   room loses its reserved rects and what edges ranked before it own (in `solve`'s laying order); a zone with no room,
 *   or a slot with none in reach, isn't offered. Each tile's owned part is cut clear of the tiles before it, of what
 *   outranks its edge, of its panel bodies, of every fixed item that doesn't grow and of the chrome; clipping changes a
 *   slot's shape, never who owns it, so every piece left is the slot's (`hits`, `hit` the largest); then the virtual
 *   edges take what no edge owns; then each overreach takes what is left and joins its owned part where it meets it
 *   whole. Refused places own nothing: they take what the surviving tiles and the other edges' seen rects leave. A
 *   stretch is owned by what the user sees there; if the owner has no slot there, it refuses. Slots that are the same
 *   move are one (home's, where one of them is home). (iv) `blocked` rects are `none:<i>`.
 *
 * Ids: `gap:<edge>:<zone>:<at>` (priority 2), `strip:<edge>:<zone>` (2), `column:<side>:<ring>` (2), `rail:<side>:<ring>`
 * (1), `none:<i>` (1), `float:<id>` (3, free). A slot that would put the item back where it is keeps its id with place
 * `home` (no slot, nothing committed); `home:<id>` (1) is emitted too, over the same tile (its own rect when no slot is
 * its home), for hosts that read it. A floating item has no home: a move inside its own rect is a float move.
 *
 * - `column:<side>:<ring>`: a new column on each column line of a side whose `state.columns[side]` takes the kind
 *   (outside the outermost open column, between two, inside the innermost; on a side with none, at the content's
 *   edge), up to `COLUMN_REACH` px each way (two lines nearer than that meet halfway), only where the new column shows
 *   open (elsewhere refused).
 * - `rail:<side>:<ring>`: docking folded into a side's rail (its rail and its template take the kind), before each
 *   folded column's segments and after the last, or, with no rail shown, the outer `RAIL_EDGE` px from the side's
 *   outer edge (the window's, an inset's strip included; flush after the side's outside bars), landing where the rail
 *   lands (`DockLayout.railPlaces`). A tile of a column folded into the rail, held, also has that column's gaps (`gap:`),
 *   to move among its own tiles (over its column's own run of tiles only), and its rail stops are home's, with the rest
 *   of the rail. The outermost column line's zone
 *   starts where it ends. For a kind with a rail
 *   drop policy (`DockState.railDrop`), the side's rail is a drop strip instead, spring-loaded, owning its rect
 *   (`./targets/rail-strip`); on a side with no declared rail, its rail is its outermost column that takes the kind,
 *   drawn as a rail once the item docks in it folded.
 * - `float:<id>`: when `floatKinds` lists the kind, the whole plane: the landing is the float with the pointer holding
 *   it at `grab` (default its middle), in the stage and clear of the docked items, the bars and the chrome while the
 *   pointer is still on it there; where no clear place keeps it under the pointer, it lies at the hand over what it
 *   covers, marked `stays` (kept inside the stage only, on every later solve). Its orient:
 *   `options.floatOrient`, else its float's, else the item's (`floatOrientOf`). Its size: `options.floatSize`, else its
 *   float's size where it lands in the orient that float is in, else `floatSizeOf` for the orient it lands in.
 *
 * `stops(state, id)` orders the places (no home, no none) for "Move to ›" and the arrow keys: every place the item lands,
 * whether or not the pointer reaches it (the pointer takes the nearest landing, so a place may have no hit of its own).
 *
 * A dropped item counts as just used (`markUsed`). An unknown or closed item has no targets; a fixed item has none either,
 * but on an edge that `moves: "side"` (an anchor): `side:<other side>` (2), over the place its edge takes there
 * (`setSide`), and `home:<id>` over its own rect (`./targets/anchor`).
 *
 * The phases live in `./targets/`: `kinds` (`EDGE_KINDS`), `model` (the shapes), `filter` (the drag's context and
 * filter ii), `edges` and `virtual` (generation), `ownership` and `tiles` (filter iii and clipping).
 */
import { EPS, PLANE, area, clamp, contains, overlaps, rect, type Point, type Rect } from "@n-uf/placement";
import type { Target } from "@n-uf/placement";
import { floatAt, markUsed, prune } from "./changes";
import { axisOf, keepClearFor, floatOrientOf, floatSizeOf, growsOnBar, heldRect, inHiddenEdge, namesZone, viewOf, withHiddenOf, zoneOf, zoneTakes } from "./helpers";
import { EDGE_ROOM_HOLD, type DockEdge, type Orient, type DockState, type DockLayout, type Zone } from "./model";
import { solve } from "./solve";
import { anchorTargets } from "./targets/anchor";
import { cutsByHalves } from "./aim";
import { distinctSlots, edgeSpec, landedLayout, solveLanded } from "./targets/edges";
import { context } from "./targets/filter";
import { checkEdgeIds, parseTargetId, targetId } from "./targets/ids";
import { EDGE_KINDS, edgeKindOf, type EdgeKind } from "./targets/kinds";
import { meet } from "./targets/meet";
import type { Ctx, EdgeSpec, Generated, DropResult, DockRefusal, DockDrop, DockDropOptions, Span, Tile } from "./targets/model";
import { homeRectOf, ownership } from "./targets/ownership";
import { clipTiles, tileEdge } from "./targets/tiles";
import { withRailStrips } from "./targets/rail-strip";
import { withMinHit } from "./targets/min-hit";
import { columnLines, ownColumnRun, railStops } from "./targets/virtual";

export { reservedRect, zoneExtents } from "./targets/edges";
export { parseTargetId, placeTargetId, targetId, virtualEdgeId, type TargetIdParts } from "./targets/ids";
export { opensEmpty } from "./targets/kinds";
export type { DropResult, DropPlace, DockRefusal, DockDrop, DockDropOptions } from "./targets/model";

/**
 * The edges as the tiler reads them: every real edge, then each side's column lines and rail, only for kinds the side's
 * template opens with (its start zone).
 */
function specsOf(c: Ctx, kind: string): EdgeSpec[] {
  const { state } = c;
  const specs: (EdgeSpec | null)[] = state.edges.map((edge) => edgeSpec(c, edge));
  for (const side of ["left", "right"] as const) {
    const template = state.columns?.[side];
    if (!template || !zoneTakes(template, "start", kind)) continue;
    const rail = state.rails?.[side]?.accepts.includes(kind) ? railStops(c, side) : null;
    // The rail stop keeps its place at the side's boundary only when one of its slots lands (home's counts).
    specs.push(...columnLines(c, side, !!rail?.slots.some((s) => s.ok)));
    specs.push(rail);
    // A tile of the rail held keeps its place among its own column's tiles: that column's run, tiled before the stops.
    if (rail) specs.push(ownColumnRun(c, side, rail));
  }
  return specs.filter((s): s is EdgeSpec => s !== null);
}

/** The placed tiles as targets and refusals; a zone's refusals numbered by where they lie along the edge. */
function emit(c: Ctx, placed: readonly Tile[]): { targets: DockDrop[]; refused: DockRefusal[]; ownHome: Rect | null } {
  const { state, now, base, dragged } = c;
  const homeId = targetId({ kind: "home", item: dragged });
  const targets: DockDrop[] = [];
  const refused: DockRefusal[] = [];
  const homeAfter = (): DropResult => ({ state, layout: landedLayout(state, now, dragged, c.prev) });
  // A zone's refusals are numbered by where they lie along the edge (then across it), not by clipping order, so a
  // refusal keeps its id from one frame to the next. A side's column lines are one edge (one spec per line).
  const pos = (t: Tile): [number, number] => (t.vertical ? [t.hit.y, t.hit.x] : [t.hit.x, t.hit.y]);
  const rank = new Map<Tile, number>();
  const edgeOf = (t: Tile): EdgeSpec | string => (t.spec?.edge ? t.spec : t.edge);
  const byZone = new Map<EdgeSpec | string, Map<Zone, Tile[]>>();
  for (const t of placed) {
    if (t.kind !== "refuse") continue;
    const zones = byZone.get(edgeOf(t)) ?? new Map<Zone, Tile[]>();
    byZone.set(edgeOf(t), zones.set(t.zone, [...(zones.get(t.zone) ?? []), t]));
  }
  for (const zones of byZone.values()) for (const group of zones.values()) group.sort((a, b) => pos(a)[0] - pos(b)[0] || pos(a)[1] - pos(b)[1]).forEach((t, n) => rank.set(t, n));
  let ownHome: Rect | null = null;
  let ownSlot: Rect | null = null;
  // Home's slot's tiles where no tile lies over its own place (the landing cuts of a bar handed it to other places).
  const homeTiles: Rect[] = [];
  for (const t of placed) {
    if (t.kind === "refuse") {
      const n = rank.get(t)!;
      refused.push({ id: targetId({ kind: "refuse", edge: t.edge, zone: t.zone, n }), edge: t.edge, zone: t.zone, hit: t.hit, ...(t.hits ? { hits: t.hits } : {}), reason: t.reason! });
      continue;
    }
    // Home's own tile when no slot names it: `home:<id>` covers it (below). Named by the home slot, it still bounds
    // `home:<id>` along the edge where an aim cut hands part of the own interval to a neighbor slot.
    if (t.kind === "home" && t.order === 0 && t.id !== homeId) ownSlot = t.hit;
    else if (t.kind === "home" && t.id !== homeId) homeTiles.push(t.hit);
    if (t.kind === "home" && t.id === homeId) {
      if (t.order === 0) ownHome = t.hit;
      continue;
    }
    // A slot whose tile came in more than one piece (a virtual edge's stretch cut off from its line; the two column
    // lines about the item's own column, one place) is one target: its pieces in `hits`, `hit` the largest.
    const first = targets.findIndex((x) => x.id === t.id);
    if (first >= 0) {
      const was = targets[first]!;
      const pieces = [...(was.hits ?? [was.hit]), ...(t.hits ?? [t.hit])];
      targets[first] = { ...was, hit: pieces.reduce((m, p) => (area(p) > area(m) ? p : m)), hits: pieces };
      continue;
    }
    if (t.kind === "home") {
      targets.push({ id: t.id, priority: t.priority, hit: t.hit, ...(t.hits ? { hits: t.hits } : {}), item: dragged, place: { kind: "home" }, after: homeAfter });
      continue;
    }
    const result = t.result!;
    // Its slot lies over an item its drop moves: until the room opens the indicator would cover it, so they open together.
    const atEdge = WINDOW_EDGE_KINDS.has(t.edgeKind) && touchesSide(state.stage, t.hits ?? [t.hit]);
    // One that changes an edge's thickness (a side's width, a bar's height) holds in its hit and landing rect (`roomHit`)
    // once its room is open: that is drawn there.
    const thickens = thicknessChanges(now, result.layout);
    const room = t.slot && slotOverMoved(now, base, result.layout, t.slot, dragged, t.edge) ? { opensRoom: true as const, ...(atEdge ? { roomHold: EDGE_ROOM_HOLD } : {}), ...(thickens ? { roomHit: hull(t.hit, t.slot) } : {}) } : {};
    targets.push({ id: t.id, priority: t.priority, hit: t.hit, ...(t.hits ? { hits: t.hits } : {}), ...(t.slot ? { slot: t.slot } : {}), ...(t.marker ? { marker: t.marker } : {}), ...room, item: dragged, place: t.place!, after: () => result });
  }
  // (Its own rect within the slot's tile: the own rect as it is wherever no aim cut lies inside it.)
  if (!ownHome && ownSlot) {
    // (Where the own rect as drawn lies outside it, a grower drawn over its slack: the tile itself.)
    const o = now.items[dragged]?.rect;
    ownHome = (o ? meet(o, ownSlot) : null) ?? ownSlot;
  } else if (!ownHome && homeTiles.length > 0) {
    // (Its own rect within them where it meets one, else the largest of them: never over another place's stretch.)
    const o = now.items[dragged]?.rect;
    const largest = (rs: readonly Rect[]): Rect => rs.reduce((m, r) => (area(r) > area(m) ? r : m));
    const met = o ? homeTiles.flatMap((h) => meet(o, h) ?? []) : [];
    ownHome = largest(met.length > 0 ? met : homeTiles);
  }
  return { targets, refused, ownHome };
}

/** The smallest rect holding both: a hit and its landing rect, with no gap between them where they don't overlap. */
function hull(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x + a.width, b.x + b.width) - x, Math.max(a.y + a.height, b.y + b.height) - y);
}

/**
 * Whether a drop changes an edge's thickness around the content (a side's width, a bar's height): any edge of the
 * content moves.
 */
const thicknessChanges = (now: DockLayout, after: DockLayout): boolean => {
  const a = now.content;
  const b = after.content;
  return Math.abs(b.x - a.x) > EPS || Math.abs(b.y - a.y) > EPS || Math.abs(b.x + b.width - (a.x + a.width)) > EPS || Math.abs(b.y + b.height - (a.y + a.height)) > EPS;
};

/** The edge kinds that run along a side (rails, new-column lines): against the window's edge, their room waits less (`roomHold`). */
const WINDOW_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["rail", "railStop", "sideBar", "columnLine"]);

/** Whether any of `pieces` reaches the stage's left or right edge. */
const touchesSide = (stage: Rect, pieces: readonly Rect[]): boolean => pieces.some((r) => r.x <= stage.x + EPS || r.x + r.width >= stage.x + stage.width - EPS);

/**
 * Whether `slot` lies over a docked item that a drop on edge `onto` moves: not `dragged`, nor an item of `onto` (they make
 * its gap). An item of the edge `dragged` leaves is measured from `lifted`, the layout with it gone: closing up over its
 * place is no move, being pushed by the drop is. The overlap is tested first: the layouts are at hand, and most items
 * lie clear of the slot.
 */
function slotOverMoved(now: DockLayout, lifted: DockLayout, after: DockLayout, slot: Rect, dragged: string, onto: string): boolean {
  const from = now.items[dragged]?.edge;
  return Object.entries(now.items).some(([id, was]) => {
    if (!overlaps(slot, was.rect) || id === dragged || was.floating || was.edge === onto) return false;
    const r = after.items[id]?.rect;
    const start = (from !== undefined && was.edge === from ? lifted.items[id]?.rect : undefined) ?? was.rect;
    return !!r && (Math.abs(r.x - start.x) > EPS || Math.abs(r.y - start.y) > EPS || Math.abs(r.width - start.width) > EPS || Math.abs(r.height - start.height) > EPS);
  });
}

/** What an edge's tiles cover as it tiles on its own: every tile a slot or home has, its overreach included, no refusal's. */
function aloneRects(tiles: readonly Tile[]): Rect[] {
  return tiles.filter((t) => t.kind !== "refuse" && !(t.kind === "reach" && t.of!.kind === "refuse")).map((t) => t.hit);
}

/** The stretches along an edge its slot tiles cover (home's and refusals' aside), merged where they meet. */
function alongOfSlots(s: EdgeSpec, tiles: readonly Tile[]): Span[] {
  const spans = tiles
    .filter((t) => t.kind === "slot")
    .map((t): Span => (s.vertical ? [t.hit.y, t.hit.y + t.hit.height] : [t.hit.x, t.hit.x + t.hit.width]))
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * The targets of the state the window shows: its hidden edges (`DockEdge.hidden`) left out, so they have no targets or
 * refusals and their items none either. A new column's id is chosen against the hidden edges too (`moveAmong`). Each
 * target's result keeps the hidden edges as they were; a target that commits nothing (home, `none`) gives back `state`
 * itself. Where a result renumbered a side's rings around them (a column made or removed beside a hidden one), its
 * layout is solved again, so it is still the result.
 *
 * Items a hidden edge lends (`DockEdge.showIn`) are dragged as items of the edge they show in. A drop that commits a move of
 * one takes it out of its hidden edge, to the drop's place; every other result gives the lent items back to their
 * hidden edges (and its layout is solved again, where they lent themselves to the result's edges in another order).
 *
 * The targets are made on the state as laid out, each item in the zone it lies in (`zoneIn`). Every result gives each
 * item its own zone back, the dragged one too unless the drop named a zone (a gap), and is solved again.
 */
function generate(state: DockState, dragged: string, options: DockDropOptions): Generated {
  checkEdgeIds(state);
  const { view: shown, lent, rezoned } = viewOf(state);
  if (shown === state) return generateShown(state, dragged, options, []);
  if (inHiddenEdge(state, dragged) && !lent.has(dragged)) return { targets: [], refusals: [], lost: [] };
  const hidden = state.edges.filter((e) => e.hidden === true);
  const g = generateShown(shown, dragged, options, hidden);
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  // With a `showIn`, each result is solved itself: its lent items given back, the edge they showed in maybe gone with
  // the drop, and `solve`'s notes on a `showIn` it ignores.
  const showsIn = hidden.some((e) => e.showIn !== undefined);
  const wrap = (t: DockDrop): DockDrop => ({
      ...t,
      after: (point, grab) => {
        const a = t.after(point, grab);
        // Nothing committed: the state as it was, the same object.
        if (a.state === shown) return { state, layout: showsIn ? solveLanded(state, dragged, prev) : a.layout };
        // Only a drop that names a zone (a gap in a zone of an edge offering a choice, `namesZone`) sets the item's zone;
        // every other move keeps its own.
        const on = t.place.kind === "gap" ? shown.edges.find((e) => t.place.kind === "gap" && e.id === t.place.edge) : undefined;
        const named = !!on && namesZone(on, state.items[dragged]!.kind);
        const back = withHiddenOf(state, a.state, lent, dragged, named, rezoned);
        // A safety net for the stored state: a dynamic column left empty (a hidden one whose last item a drop moved out)
        // goes, as in any change, its side's rings closed up. Lent items never sit in a dynamic column (`viewOf`).
        const restored = showsIn ? prune(back) : back;
        const ringOf = new Map(a.state.edges.map((e) => [e.id, e.ring]));
        const renumbered = restored.edges.some((e) => e.hidden !== true && ringOf.get(e.id) !== e.ring);
        // Where items lie in zones not their own, the result lays them out again from their own zones.
        const layout = renumbered || showsIn || rezoned.size > 0 ? solveLanded(restored, dragged, prev) : a.layout;
        return { state: restored, layout };
      },
    });
  return { ...g, targets: g.targets.map(wrap), ...(g.places ? { places: g.places.map(wrap) } : {}) };
}

function generateShown(state: DockState, dragged: string, options: DockDropOptions, hidden: readonly DockEdge[]): Generated {
  // A fixed item takes no gap: on an edge that `moves: "side"` it has its `side:` target and home.
  if (Object.hasOwn(state.items, dragged) && state.items[dragged]!.fixed) return anchorTargets(state, dragged, options);
  const ctx = context(state, dragged, options, hidden);
  if (!ctx) return { targets: [], refusals: [], lost: [] };
  const { c, item, prev } = ctx;
  const { now } = c;
  const live = specsOf(c, item.kind);
  // Ownership is ranked among what survives the filter: each edge tiled on its own first, an edge owning its band only
  // along its surviving slots' tiles (a refused stretch owns nothing).
  const alone = new Map(live.map((s) => [s, tileEdge(c, s, { cuts: [], bodies: [] }, [])]));
  const along = new Map(live.map((s) => [s, alongOfSlots(s, alone.get(s)!)]));
  const own = ownership(c, live, (s) => along.get(s)!, (s) => aloneRects(alone.get(s)!));
  const lost: string[] = [];
  const tiles: Tile[] = live.flatMap((spec) => tileEdge(c, spec, own.cutsOf(spec), lost));
  // The item's own place is home's even where no edge tiles it: its » entry, or its column, which the lift deletes
  // (the whole column collapses into home).
  const ownRect = now.items[dragged];
  const homeEdge = state.edges.find((e) => e.id === ownRect?.edge);
  const homeHit = homeRectOf(c, null);
  // (On a bar or a toolbar rail whose landing cuts hand the whole own interval to other places, home's tiles are its
  // slot's stretch: no tile over its own place.)
  if (ownRect && homeEdge && homeHit && !tiles.some((t) => t.order === 0 || (t.kind === "home" && t.edge === homeEdge.id)))
    tiles.push({ edge: homeEdge.id, spec: null, edgeKind: edgeKindOf(state, homeEdge), vertical: axisOf(homeEdge.side) === "column", zone: zoneOf(item), order: 0, kind: "home", id: targetId({ kind: "home", item: dragged }), priority: 1, place: { kind: "home" }, hit: homeHit, keep: null });
  // The hits lie on screen: clear of the keep-clear rects of the layout seen now.
  const placed = clipTiles(tiles, own, keepClearFor(state, now, "targets"), lost);
  const dbgR = (r: Rect): string => `${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`;
  if ((globalThis as any).process?.env?.DBG_CLIP) (globalThis as any).console.log("CLIP in", tiles.filter((t) => t.edge === "edge").map((t) => `${t.kind}:${t.id}@${t.order} ${dbgR(t.hit)}`).join(" ; "), "\nCLIP out", placed.filter((t) => t.edge === "edge").map((t) => `${t.kind}:${t.id} ${dbgR(t.hit)}`).join(" ; "));
  const { targets, refused, ownHome } = emit(c, placed);
  const homeAfter = (): DropResult => ({ state, layout: landedLayout(state, now, dragged, c.prev) });

  if (state.floatKinds.includes(item.kind)) {
    const was = state.floats.find((f) => f.id === dragged);
    const fo: Orient = options.floatOrient ?? was?.orient ?? floatOrientOf(item);
    // Its size: the one given, else its float's where it lands in the orient it floats in, else the size for the orient it lands in.
    const wasOrient = was?.orient ?? floatOrientOf(item);
    const size = options.floatSize ?? (was && wasOrient === fo ? { width: was.rect.width, height: was.rect.height } : floatSizeOf(item, fo));
    // A movable grower is pressed on its grown rect and floats at its natural size: the hand keeps its share of the item
    // (`grab` over the rect as seen), so the float lies under the pointer as it is held.
    const seenOwn = now.items[dragged];
    const seenEdge = seenOwn?.edge ? state.edges.find((e) => e.id === seenOwn.edge) : undefined;
    const grown = seenOwn && seenEdge && growsOnBar(state, seenEdge, dragged, seenOwn.form) && seenOwn.rect.width > 0 && seenOwn.rect.height > 0 ? seenOwn.rect : null;
    const handOf = (g: Point | undefined): Point | undefined => (g && grown ? { x: clamp(g.x / grown.width, 0, 1) * size.width, y: clamp(g.y / grown.height, 0, 1) * size.height } : g);
    targets.push({
      id: targetId({ kind: "float", item: dragged }),
      priority: 3,
      free: true,
      hit: PLANE,
      // Over the whole plane, but only strictly inside the stage: its edge belongs to the targets drawn against it.
      bounds: stageOf(state),
      item: dragged,
      place: { kind: "float" },
      after(point, grab) {
        const g = handOf(grab) ?? { x: size.width / 2, y: size.height / 2 };
        // Where the pointer puts it, or with `floatFromHeld` where the held item is drawn, before the float is fitted.
        const raw = options.floatFromHeld ? heldRect(state, dragged, size, point, g) : rect(point.x - g.x, point.y - g.y, size.width, size.height);
        const first = solve(markUsed(floatAt(state, dragged, raw, options.floatOrient), dragged), prev);
        const fitted = first.items[dragged]?.rect;
        const at = fitted ?? raw;
        const placed = (x: number, y: number, stays: boolean): DropResult => {
          const s = floatAt(state, dragged, rect(x, y, size.width, size.height), options.floatOrient);
          return c.settle(markUsed(stays ? { ...s, floats: s.floats.map((f) => (f.id === dragged ? { ...f, stays: true as const } : f)) } : s, dragged));
        };
        // "Doesn't fit" is decided by the hand: a clear place counts only while the pointer is on the item placed there
        // (on the hand rect as kept inside the stage, so the stage's clamp never counts against it).
        const hand = heldRect(state, dragged, fitted ?? size, point, g);
        const on = { x: clamp(point.x, hand.x, hand.x + hand.width), y: clamp(point.y, hand.y, hand.y + hand.height) };
        const clear = !first.notes.some((n) => n.code === "float-covers" && n.id === dragged);
        if (!fitted || (clear && contains(fitted, on))) return placed(at.x, at.y, false);
        // Otherwise it lies at the hand, over what it covers, marked so that no later solve moves it clear.
        const left = placed(hand.x, hand.y, true);
        // (Kept clear of the bars and the chrome there, it may cover nothing: then it is an ordinary float at that rect.)
        const covers = left.layout.notes.some((n) => n.code === "float-covers" && n.id === dragged);
        const kept = left.layout.items[dragged]?.rect ?? hand;
        return covers ? left : placed(kept.x, kept.y, false);
      },
    });
  }

  // Filter (iv): `blocked` rects take the pointer and commit nothing.
  (state.blocked ?? []).forEach((b, i) => {
    targets.push({ id: targetId({ kind: "none", index: i }), priority: 1, hit: rect(b.x, b.y, b.width, b.height), item: dragged, place: { kind: "none" }, after: homeAfter });
  });

  // `home:<id>`, for hosts that read it: over the item's own rect, inside home's tile (all of it when no slot names it).
  // A new column holding the item alone where its own column is (a column line beside it, as the lift counts rings) is
  // the same move as home: its pieces are home's, under home's id, never a target of their own (a sliver beside home).
  const sameAsHome = targets.filter((t) => t.place.kind === "home" && parseTargetId(t.id)?.kind === "column");
  const homePieces = sameAsHome.flatMap((t) => t.hits ?? [t.hit]);
  if (sameAsHome.length) targets.splice(0, targets.length, ...targets.filter((t) => !sameAsHome.includes(t)));
  // They join home's slot where one is home (a gap of its edge), else `home:<id>`.
  const homeSlot = targets.findIndex((t) => t.place.kind === "home");
  if (homeSlot >= 0 && homePieces.length) {
    const t = targets[homeSlot]!;
    targets[homeSlot] = { ...t, hits: [...(t.hits ?? [t.hit]), ...homePieces] };
  }
  if (ownRect && !ownRect.floating) {
    const hit = ownHome ?? ownRect.rect;
    const pieces = homeSlot < 0 && homePieces.length ? { hits: [hit, ...homePieces] } : {};
    targets.push({ id: targetId({ kind: "home", item: dragged }), priority: 1, hit, ...pieces, item: dragged, place: { kind: "home" }, after: homeAfter });
  }
  // A slot is lost only where no target carries its id (two lines of one move, about the item's own column, are one).
  const lostIds = [...new Set(lost)].filter((id) => !targets.some((t) => t.id === id));
  // The kind's rail drop strips (`DockState.railDrop`), laid over the rest: each owns its rect.
  const layered = withRailStrips(c, targets, refused);
  // Every target keeps a reachable minimum where the space beside it can be spared (`EDGE_KINDS[kind].minHit`).
  // A target's zone: its tiles with its edge tiled on its own (before any other edge owns a part), its overreach
  // included. It grows to its minimum only inside that.
  const zones = new Map<string, Rect[]>();
  for (const t of [...alone.values()].flat()) if (t.kind !== "refuse" && t.id) zones.set(t.id, [...(zones.get(t.id) ?? []), t.hit]);
  // A refusal holds only points strictly inside the stage: its edge belongs to the targets drawn against it.
  const bounds = stageOf(state);
  // A room's hold (`roomHit`) holds the target's hit as it ends up, its minimum included.
  const held = withMinHit(c, layered.targets, layered.refusals, zones).map((t) => (t.roomHit && t.slot ? { ...t, roomHit: hull(t.hit, t.slot) } : t));
  // The places a drop lands that the pointer never reaches (a slot the aim cuts leave no stretch: another landing is
  // nearer every pointer): no target, but a stop all the same (`stops`), at its landing. On a bar or a toolbar rail,
  // every place that fits in the room: one whose stretch clipping left under a pixel too.
  const lostSet = new Set(lostIds);
  const targetIds = new Set(held.map((t) => t.id));
  const places: DockDrop[] = live
    .flatMap((spec) =>
      (spec.edge && !cutsByHalves(spec.edge) ? distinctSlots(c, spec.slots).filter((s) => !targetIds.has(s.id)) : spec.slots.filter((s) => lostSet.has(s.id)))
        .filter((s) => s.ok && !s.home && s.place.kind === "gap" && !!s.result.layout.items[dragged])
        .map((s): DockDrop => {
          const landed = s.result.layout.items[dragged]!.rect;
          return { id: s.id, priority: EDGE_KINDS[spec.kind].priority, hit: landed, slot: landed, marker: spec.marker(s), item: dragged, place: s.place, after: () => s.result };
        }),
    )
    .filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i);
  return { targets: held, refusals: layered.refusals.map((r) => ({ ...r, bounds })), lost: lostIds, zones, ...(places.length ? { places } : {}) };
}

/** The stage as a plain rect (a target's or a refusal's `bounds`). */
const stageOf = (state: DockState): Rect => rect(state.stage.x, state.stage.y, state.stage.width, state.stage.height);

export function targets(state: DockState, dragged: string, options: DockDropOptions = {}): DockDrop[] {
  return generate(state, dragged, options).targets;
}

/** The targets and refusals of one generation (`lanes()` reads both; internal to the package). */
export function targetsAndRefusals(state: DockState, dragged: string, options: DockDropOptions = {}): { targets: DockDrop[]; refusals: DockRefusal[]; places: DockDrop[] } {
  const g = generate(state, dragged, options);
  return { targets: g.targets, refusals: g.refusals, places: g.places ?? [] };
}

/**
 * `refusals(state, dragged, options?)`: the places a drop of `dragged` is refused, so a host can say so at the pointer
 * ("Can't go here"; the place itself is never drawn) instead of showing a slot elsewhere: each slot the filter removed, over its own tile,
 * `not-accepted` where the edge or zone doesn't take the kind, `no-room` where the drop wouldn't fit along the edge, `too-thick` where no form of the item fits across it (the bar is thinner than every form but the » menu's). An edge that takes
 * the kind in no zone is one refusal over its drawn rect (fixed items included) less what targets own; every refusal
 * lies in the stage, a zone's inside its edge's ends. A release over a refusal commits nothing: the item goes home.
 */
export function refusals(state: DockState, dragged: string, options: DockDropOptions = {}): DockRefusal[] {
  return generate(state, dragged, options).refusals;
}

/**
 * A refusal in the pick's shape: `refuse: true`, which ranks it at `REFUSAL_RANK` (after every target of priority 1 and
 * 2, so a target wins wherever the two meet or overlap, before the float). Its `priority` is 2 for a pick rule that
 * doesn't know refusals.
 */
export interface DockRefusalTarget extends Target {
  readonly refuse: true;
  readonly refusal: DockRefusal;
}

/**
 * `refusalTargets(refusals)`: each refusal as a target for `@n-uf/motion/drag`'s drag intent (`refuse: true`, its
 * pieces as `hits`). Pass them with the targets: the intent never holds or shows one, a release over one lands nowhere,
 * and the frame's `refused` says which the pointer is over (`refused.refusal` is the `DockRefusal`).
 */
export function refusalTargets(list: readonly DockRefusal[]): DockRefusalTarget[] {
  return list.map((r) => ({ id: r.id, priority: 2, hit: r.hit, ...(r.hits ? { hits: r.hits } : {}), ...(r.bounds ? { bounds: r.bounds } : {}), refuse: true, refusal: r }));
}

/**
 * `targetZones(state, dragged, options?)`: each docked target's zone by id, the space it may grow to its minimum hit in
 * (its tiles with its edge tiled on its own). For the property check.
 */
export function targetZones(state: DockState, dragged: string, options: DockDropOptions = {}): ReadonlyMap<string, readonly Rect[]> {
  return generate(state, dragged, options).zones ?? new Map();
}

/**
 * `lostSlots(state, dragged, options?)`: the ids of slots the filter kept, with room in their zone, that clipping left
 * with no hit. None: the property check holds it at zero.
 */
export function lostSlots(state: DockState, dragged: string, options: DockDropOptions = {}): string[] {
  return generate(state, dragged, options).lost;
}

const SIDE_RANK: Record<string, number> = { left: 0, top: 1, bottom: 2, right: 3 };

/**
 * `stops(state, id, options?)`: the places for "Move to ›" and the arrow keys, in reading order (`home` and `none` left
 * out): the left side outer to inner, the top bars, the bottom bars, the right side inner to outer, floating last. Stops
 * are the places; the pointer takes the nearest. So a stop is every place the item lands, the targets and the gaps no
 * pointer reaches (a landing nearer every pointer than theirs: their `hit` is their landing, no part of `targets()`).
 * Its `after` is the move.
 *
 * Remembered per state: a state is an immutable value (every change returns a new one), so the stops of one item of one
 * state with the same options are solved once, and asking again (a menu redrawn, every group's list on each render) costs
 * nothing until the state is another object. The options count by value, `previous` by identity. The list is yours: a
 * new array each call, over the same targets.
 */
export function stops(state: DockState, dragged: string, options: DockDropOptions = {}): DockDrop[] {
  const key = stopsKey(dragged, options);
  let memo = stopsMemo.get(state);
  if (!memo) stopsMemo.set(state, (memo = new Map()));
  let list = memo.get(key);
  if (!list) {
    // A state asked about with many different options never holds more than this many lists.
    if (memo.size >= STOPS_PER_STATE) memo.clear();
    memo.set(key, (list = orderedStops(state, dragged, options)));
  }
  return [...list];
}

/** What `stops` has solved, by state object, then by item and options. */
const stopsMemo = new WeakMap<DockState, Map<string, readonly DockDrop[]>>();
const STOPS_PER_STATE = 512;
const layoutIds = new WeakMap<DockLayout, number>();
let nextLayoutId = 0;

/** The item and options as one string: the options by value, `previous` by the identity of its layout. */
function stopsKey(dragged: string, o: DockDropOptions): string {
  let prev: number | null = null;
  if (o.previous) {
    prev = layoutIds.get(o.previous) ?? nextLayoutId++;
    layoutIds.set(o.previous, prev);
  }
  return JSON.stringify([dragged, prev, o.endReach ?? null, o.floatOrient ?? null, o.floatSize ? [o.floatSize.width, o.floatSize.height] : null, o.fresh ?? null, o.grab ? [o.grab.x, o.grab.y] : null, o.pitch ?? null]);
}

function orderedStops(state: DockState, dragged: string, options: DockDropOptions): DockDrop[] {
  // Every place the item lands, whether or not a pointer reaches it: the targets and the lost gaps' places.
  const g = generate(state, dragged, options);
  const list = [...g.targets, ...(g.places ?? [])].filter((t) => t.place.kind !== "home" && t.place.kind !== "none");
  const sideOf = (t: DockDrop): string => {
    const p = t.place;
    if (p.kind === "float") return "float";
    if (p.kind === "column" || p.kind === "rail" || p.kind === "side") return p.side;
    if (p.kind === "gap") return state.edges.find((e) => e.id === p.edge)?.side ?? "float";
    return "float";
  };
  const key = (t: DockDrop): [number, number, number] => {
    const side = sideOf(t);
    const r = t.slot ?? t.hit;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const rank = side === "float" ? 4 : SIDE_RANK[side]!;
    return side === "left" ? [rank, cx, cy] : side === "right" ? [rank, -cx, cy] : [rank, cy * (side === "bottom" ? -1 : 1), cx];
  };
  // Two stops at one point of one edge: in the edge's order of places (zone, then index), a place no pointer reaches
  // among the others as if it were a target.
  const ZONE_RANK = { start: 0, center: 1, end: 2 } as const;
  const inEdge = (a: DockDrop, b: DockDrop): number => {
    const p = a.place;
    const q = b.place;
    return p.kind === "gap" && q.kind === "gap" && p.edge === q.edge ? ZONE_RANK[p.zone] - ZONE_RANK[q.zone] || p.at - q.at : 0;
  };
  return list
    .map((t, i) => ({ t, i, k: key(t) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || inEdge(a.t, b.t) || a.i - b.i)
    .map((x) => x.t);
}
