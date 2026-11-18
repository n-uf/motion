/**
 * `targets(scene, dragged, { previous, endReach, floatSize })`: every drop target for one dragged item, in the shape
 * `@n-uf/motion/drag` takes (`id`, `priority`, `hit`, `slot?`, `free?`). Each target's `after(point, grab)` is the scene
 * a release there commits and its layout, `solve(after.scene, { previous })`: the host draws every item from that layout
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
 *   (lines, zone extents, ownership, bands). A place counts in the scene with the item lifted (a gap's `at`, a column's
 *   or rail's `ring`); its `after` is the solved drop. An edge the lift deletes offers nothing: the item's own column
 *   collapses into home. A zone where items keep their length reaches over the cards seen in it.
 * - **Slots.** A zone's insertion lines (`gap:<edge>:<zone>:<at>`; on an edge with no members at all a zone has one,
 *   `strip:<edge>:<zone>`). The item's own place is an interval, its own rect along the edge (its » entry in the menu):
 *   home. The home slot's line lies at both ends of it, so the gaps right beside it are home's (the same move).
 * - **Tiles.** A zone's extent split halfway between its slots' lines (lines that lie past the extent are spread into
 *   it); the own interval keeps exactly its length. Panel bodies don't split the tiling: clipping takes them out, and a
 *   slot whose tile is all body has no room. Across: the edge's thickness (the larger of seen and after the drop), an
 *   empty edge's strip depth (`Edge.strip`, default 24, inward), a compact rail's `RAIL_REACH` further inward.
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
 * - `column:<side>:<ring>`: a new column on each column line of a side whose `scene.columns[side]` takes the kind
 *   (outside the outermost open column, between two, inside the innermost; on a side with none, at the content's
 *   edge), up to `COLUMN_REACH` px each way (two lines nearer than that meet halfway), only where the new column shows
 *   open (elsewhere refused).
 * - `rail:<side>:<ring>`: docking folded into a side's rail (its rail and its template take the kind), before each
 *   folded column's segments and after the last, or, with no rail shown, the outer `RAIL_EDGE` px from the side's
 *   outer edge (the window's, an inset's strip included; flush after the side's outside bars), landing where the rail
 *   lands (`SceneLayout.railPlaces`). The outermost column line's zone starts where it ends. For a kind with a rail
 *   drop policy (`Scene.railDrop`), the side's rail is a drop strip instead, spring-loaded, owning its rect
 *   (`./targets/rail-strip`); on a side with no declared rail, its rail is its outermost column that takes the kind,
 *   drawn as a rail once the item docks in it folded.
 * - `float:<id>`: when `floatKinds` lists the kind, the whole plane: the landing is the float with the pointer holding
 *   it at `grab` (default its middle), in the stage and clear of the docked items, the bars and the chrome. Its orient:
 *   `options.floatOrient`, else its float's, else the item's (`floatOrientOf`). Its size: `options.floatSize`, else its
 *   float's size, else `floatSizeOf`.
 *
 * `stops(scene, id)` orders the same targets (no home, no none) for "Move to ›" and the arrow keys.
 *
 * A dropped item counts as just used (`use`). An unknown or closed item has no targets; a fixed item has none either,
 * but on an edge that `moves: "side"` (an anchor): `side:<other side>` (2), over the place its edge takes there
 * (`setSide`), and `home:<id>` over its own rect (`./targets/anchor`).
 *
 * The phases live in `./targets/`: `kinds` (`EDGE_KINDS`), `model` (the shapes), `filter` (the drag's context and
 * filter ii), `edges` and `virtual` (generation), `ownership` and `tiles` (filter iii and clipping).
 */
import { PLANE, area, rect, type Rect } from "../geometry";
import type { Target } from "../target";
import { floatAt, prune, use } from "./changes";
import { axisOf, chromeFor, floatOrientOf, floatSizeOf, inHiddenEdge, railColumnOf, viewOf, withHiddenOf, zoneOf, zoneTakes } from "./helpers";
import type { Edge, Orient, Scene, SceneLayout, Zone } from "./model";
import { solve } from "./solve";
import { anchorTargets } from "./targets/anchor";
import { edgeSpec } from "./targets/edges";
import { context } from "./targets/filter";
import { checkEdgeIds, parseTargetId, targetId } from "./targets/ids";
import { edgeKindOf } from "./targets/kinds";
import type { Ctx, EdgeSpec, Generated, SceneAfter, SceneRefusal, SceneTarget, SceneTargetOptions, Span, Tile } from "./targets/model";
import { homeRectOf, ownership } from "./targets/ownership";
import { clipTiles, tileEdge } from "./targets/tiles";
import { withRailStrips } from "./targets/rail-strip";
import { withMinHit } from "./targets/min-hit";
import { columnLines, railStops } from "./targets/virtual";

export { reservedRect, zoneExtents } from "./targets/edges";
export { parseTargetId, placeTargetId, targetId, virtualEdgeId, type TargetIdParts } from "./targets/ids";
export { opensEmpty } from "./targets/kinds";
export type { SceneAfter, ScenePlace, SceneRefusal, SceneTarget, SceneTargetOptions } from "./targets/model";

/**
 * The edges as the tiler reads them: every real edge, then each side's column lines and rail, only for kinds the side's
 * template opens with (its start zone).
 */
function specsOf(c: Ctx, kind: string): EdgeSpec[] {
  const { scene } = c;
  const specs: (EdgeSpec | null)[] = scene.edges.map((edge) => edgeSpec(c, edge));
  for (const side of ["left", "right"] as const) {
    const template = scene.columns?.[side];
    if (!template || !zoneTakes(template, "start", kind)) continue;
    const rail = scene.rails?.[side]?.accepts.includes(kind) ? railStops(c, side) : null;
    // The rail stop keeps its place at the side's boundary only when one of its slots lands (home's counts).
    specs.push(...columnLines(c, side, !!rail?.slots.some((s) => s.ok)));
    specs.push(rail);
  }
  return specs.filter((s): s is EdgeSpec => s !== null);
}

/** The placed tiles as targets and refusals; a zone's refusals numbered by where they lie along the edge. */
function emit(c: Ctx, placed: readonly Tile[]): { targets: SceneTarget[]; refused: SceneRefusal[]; ownHome: Rect | null } {
  const { scene, now, dragged } = c;
  const homeId = targetId({ kind: "home", item: dragged });
  const targets: SceneTarget[] = [];
  const refused: SceneRefusal[] = [];
  const homeAfter = (): SceneAfter => ({ scene, layout: now });
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
  for (const t of placed) {
    if (t.kind === "refuse") {
      const n = rank.get(t)!;
      refused.push({ id: targetId({ kind: "refuse", edge: t.edge, zone: t.zone, n }), edge: t.edge, zone: t.zone, hit: t.hit, ...(t.hits ? { hits: t.hits } : {}), reason: t.reason! });
      continue;
    }
    // Home's own tile when no slot names it: `home:<id>` covers it (below).
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
    targets.push({ id: t.id, priority: t.priority, hit: t.hit, ...(t.hits ? { hits: t.hits } : {}), ...(t.slot ? { slot: t.slot } : {}), ...(t.marker ? { marker: t.marker } : {}), item: dragged, place: t.place!, after: () => result });
  }
  return { targets, refused, ownHome };
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
 * The targets of the scene the window shows: its hidden edges (`Edge.hidden`) left out, so they have no targets or
 * refusals and their items none either. A new column's id is chosen against the hidden edges too (`moveAmong`). Each
 * target's result keeps the hidden edges as they were; a target that commits nothing (home, `none`) gives back `scene`
 * itself. Where a result renumbered a side's rings around them (a column made or removed beside a hidden one), its
 * layout is solved again, so it is still the result.
 *
 * Items a hidden edge lends (`Edge.showIn`) are dragged as items of the edge they show in. A drop that commits a move of
 * one takes it out of its hidden edge, to the drop's place; every other result gives the lent items back to their
 * hidden edges (and its layout is solved again, where they lent themselves to the result's edges in another order).
 */
function generate(scene: Scene, dragged: string, options: SceneTargetOptions): Generated {
  checkEdgeIds(scene);
  const { view: shown, lent } = viewOf(scene);
  if (shown === scene) return generateShown(scene, dragged, options, []);
  if (inHiddenEdge(scene, dragged) && !lent.has(dragged)) return { targets: [], refusals: [], lost: [] };
  const hidden = scene.edges.filter((e) => e.hidden === true);
  const g = generateShown(shown, dragged, options, hidden);
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  // With a `showIn`, each result is solved itself: its lent items given back, the edge they showed in maybe gone with
  // the drop, and `solve`'s notes on a `showIn` it ignores.
  const showsIn = hidden.some((e) => e.showIn !== undefined);
  return {
    ...g,
    targets: g.targets.map((t) => ({
      ...t,
      after: (point, grab) => {
        const a = t.after(point, grab);
        // Nothing committed: the scene as it was, the same object.
        if (a.scene === shown) return { scene, layout: showsIn ? solve(scene, prev) : a.layout };
        const moved = lent.has(dragged) ? dragged : undefined;
        // A drop that names its zone: a gap in an edge, or a side's rail column (its start zone).
        const zoned = t.place.kind === "gap" || (t.place.kind === "rail" && !!railColumnOf(shown, t.place.side, scene.items[dragged]!.kind));
        const back = withHiddenOf(scene, a.scene, lent, moved, zoned);
        // A safety net for the stored scene: a dynamic column left empty (a hidden one whose last item a drop moved out)
        // goes, as in any change, its side's rings closed up. Lent items never sit in a dynamic column (`viewOf`).
        const restored = showsIn ? prune(back) : back;
        const ringOf = new Map(a.scene.edges.map((e) => [e.id, e.ring]));
        const renumbered = restored.edges.some((e) => e.hidden !== true && ringOf.get(e.id) !== e.ring);
        const layout = renumbered || showsIn ? solve(restored, prev) : a.layout;
        return { scene: restored, layout };
      },
    })),
  };
}

function generateShown(scene: Scene, dragged: string, options: SceneTargetOptions, hidden: readonly Edge[]): Generated {
  // A fixed item takes no gap: on an edge that `moves: "side"` it has its `side:` target and home.
  if (Object.hasOwn(scene.items, dragged) && scene.items[dragged]!.fixed) return anchorTargets(scene, dragged, options);
  const ctx = context(scene, dragged, options, hidden);
  if (!ctx) return { targets: [], refusals: [], lost: [] };
  const { c, item, prev } = ctx;
  const { now } = c;
  const live = specsOf(c, item.kind);
  // Ownership is ranked among what survives the filter: each edge tiled on its own first, an edge owning its band only
  // along its surviving slots' tiles (a refused stretch owns nothing).
  const alone = new Map(live.map((s) => [s, tileEdge(c, s, { cuts: [], bodies: [] }, [])]));
  const along = new Map(live.map((s) => [s, alongOfSlots(s, alone.get(s)!)]));
  const own = ownership(c, live, (s) => along.get(s)!);
  const lost: string[] = [];
  const tiles: Tile[] = live.flatMap((spec) => tileEdge(c, spec, own.cutsOf(spec), lost));
  // The item's own place is home's even where no edge tiles it: its » entry, or its column, which the lift deletes
  // (the whole column collapses into home).
  const ownRect = now.items[dragged];
  const homeEdge = scene.edges.find((e) => e.id === ownRect?.edge);
  const homeHit = homeRectOf(c, null);
  if (ownRect && homeEdge && homeHit && !tiles.some((t) => t.order === 0))
    tiles.push({ edge: homeEdge.id, spec: null, edgeKind: edgeKindOf(scene, homeEdge), vertical: axisOf(homeEdge.side) === "column", zone: zoneOf(item), order: 0, kind: "home", id: targetId({ kind: "home", item: dragged }), priority: 1, place: { kind: "home" }, hit: homeHit, keep: null });
  const placed = clipTiles(tiles, own, chromeFor(scene, "targets"), lost);
  const { targets, refused, ownHome } = emit(c, placed);
  const homeAfter = (): SceneAfter => ({ scene, layout: now });

  if (scene.floatKinds.includes(item.kind)) {
    const was = scene.floats.find((f) => f.id === dragged);
    const fo: Orient = options.floatOrient ?? was?.orient ?? floatOrientOf(item);
    const size = options.floatSize ?? (was ? { width: was.rect.width, height: was.rect.height } : floatSizeOf(item, fo));
    targets.push({
      id: targetId({ kind: "float", item: dragged }),
      priority: 3,
      free: true,
      hit: PLANE,
      // Over the whole plane, but only inside the window: its edge and past it belong to the targets drawn against it.
      outer: stageOf(scene),
      item: dragged,
      place: { kind: "float" },
      after(point, grab) {
        const g = grab ?? { x: size.width / 2, y: size.height / 2 };
        const raw = rect(point.x - g.x, point.y - g.y, size.width, size.height);
        const first = solve(use(floatAt(scene, dragged, raw, options.floatOrient), dragged), prev);
        const at = first.items[dragged]?.rect ?? raw;
        return c.settle(use(floatAt(scene, dragged, rect(at.x, at.y, size.width, size.height), options.floatOrient), dragged));
      },
    });
  }

  // Filter (iv): `blocked` rects take the pointer and commit nothing.
  (scene.blocked ?? []).forEach((b, i) => {
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
  // The kind's rail drop strips (`Scene.railDrop`), laid over the rest: each owns its rect.
  const layered = withRailStrips(c, targets, refused);
  // Every target keeps a reachable minimum where the space beside it can be spared (`EDGE_KINDS[kind].minHit`).
  // A target's zone: its tiles with its edge tiled on its own (before any other edge owns a part), its overreach
  // included. It grows to its minimum only inside that.
  const zones = new Map<string, Rect[]>();
  for (const t of [...alone.values()].flat()) if (t.kind !== "refuse" && t.id) zones.set(t.id, [...(zones.get(t.id) ?? []), t.hit]);
  // A refusal holds only points strictly inside the window: its edge belongs to the targets drawn against it.
  const outer = stageOf(scene);
  return { targets: withMinHit(c, layered.targets, layered.refusals, zones), refusals: layered.refusals.map((r) => ({ ...r, outer })), lost: lostIds, zones };
}

/** The stage as a plain rect (a target's or a refusal's `outer`). */
const stageOf = (scene: Scene): Rect => rect(scene.stage.x, scene.stage.y, scene.stage.width, scene.stage.height);

export function targets(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneTarget[] {
  return generate(scene, dragged, options).targets;
}

/**
 * `refusals(scene, dragged, options?)`: the places a drop of `dragged` is refused, so a host can say so at the pointer
 * (a tint and "No room here") instead of showing a slot elsewhere: each slot the filter removed, over its own tile,
 * `not-accepted` where the edge or zone doesn't take the kind, `no-room` where the drop wouldn't fit. An edge that takes
 * the kind in no zone is one refusal over its drawn rect (fixed items included) less what targets own; every refusal
 * lies in the stage, a zone's inside its edge's ends. A release over a refusal commits nothing: the item goes home.
 */
export function refusals(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneRefusal[] {
  return generate(scene, dragged, options).refusals;
}

/**
 * A refusal in the pick's shape: `refuse: true`, which ranks it at `REFUSAL_RANK` (after every target of priority 1 and
 * 2, so a target wins wherever the two meet or overlap, before the float). Its `priority` is 2 for a pick rule that
 * doesn't know refusals.
 */
export interface SceneRefusalTarget extends Target {
  readonly refuse: true;
  readonly refusal: SceneRefusal;
}

/**
 * `refusalTargets(refusals)`: each refusal as a target for `@n-uf/motion/drag`'s drag intent (`refuse: true`, its
 * pieces as `hits`). Pass them with the targets: the intent never holds or shows one, a release over one lands nowhere,
 * and the frame's `refused` says which the pointer is over (`refused.refusal` is the `SceneRefusal`).
 */
export function refusalTargets(list: readonly SceneRefusal[]): SceneRefusalTarget[] {
  return list.map((r) => ({ id: r.id, priority: 2, hit: r.hit, ...(r.hits ? { hits: r.hits } : {}), ...(r.outer ? { outer: r.outer } : {}), refuse: true, refusal: r }));
}

/**
 * `targetZones(scene, dragged, options?)`: each docked target's zone by id, the space it may grow to its minimum hit in
 * (its tiles with its edge tiled on its own). For the property check.
 */
export function targetZones(scene: Scene, dragged: string, options: SceneTargetOptions = {}): ReadonlyMap<string, readonly Rect[]> {
  return generate(scene, dragged, options).zones ?? new Map();
}

/**
 * `lostSlots(scene, dragged, options?)`: the ids of slots the filter kept, with room in their zone, that clipping left
 * with no hit. None: the property check holds it at zero.
 */
export function lostSlots(scene: Scene, dragged: string, options: SceneTargetOptions = {}): string[] {
  return generate(scene, dragged, options).lost;
}

const SIDE_RANK: Record<string, number> = { left: 0, top: 1, bottom: 2, right: 3 };

/**
 * `stops(scene, id, options?)`: the places for "Move to ›" and the arrow keys, in reading order, from the same targets
 * (`home` and `none` left out): the left side outer to inner, the top bars, the bottom bars, the right side inner to
 * outer, floating last. Each stop is a target, so its `after` is the move.
 *
 * Remembered per scene: a scene is an immutable value (every change returns a new one), so the stops of one item of one
 * scene with the same options are solved once, and asking again (a menu redrawn, every group's list on each render) costs
 * nothing until the scene is another object. The options count by value, `previous` by identity. The list is yours: a
 * new array each call, over the same targets.
 */
export function stops(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneTarget[] {
  const key = stopsKey(dragged, options);
  let memo = stopsMemo.get(scene);
  if (!memo) stopsMemo.set(scene, (memo = new Map()));
  let list = memo.get(key);
  if (!list) {
    // A scene asked about with many different options never holds more than this many lists.
    if (memo.size >= STOPS_PER_SCENE) memo.clear();
    memo.set(key, (list = orderedStops(scene, dragged, options)));
  }
  return [...list];
}

/** What `stops` has solved, by scene object, then by item and options. */
const stopsMemo = new WeakMap<Scene, Map<string, readonly SceneTarget[]>>();
const STOPS_PER_SCENE = 512;
const layoutIds = new WeakMap<SceneLayout, number>();
let nextLayoutId = 0;

/** The item and options as one string: the options by value, `previous` by the identity of its layout. */
function stopsKey(dragged: string, o: SceneTargetOptions): string {
  let prev: number | null = null;
  if (o.previous) {
    prev = layoutIds.get(o.previous) ?? nextLayoutId++;
    layoutIds.set(o.previous, prev);
  }
  return JSON.stringify([dragged, prev, o.endReach ?? null, o.floatOrient ?? null, o.floatSize ? [o.floatSize.width, o.floatSize.height] : null, o.fresh ?? null]);
}

function orderedStops(scene: Scene, dragged: string, options: SceneTargetOptions): SceneTarget[] {
  const list = targets(scene, dragged, options).filter((t) => t.place.kind !== "home" && t.place.kind !== "none");
  const sideOf = (t: SceneTarget): string => {
    const p = t.place;
    if (p.kind === "float") return "float";
    if (p.kind === "column" || p.kind === "rail" || p.kind === "side") return p.side;
    if (p.kind === "gap") return scene.edges.find((e) => e.id === p.edge)?.side ?? "float";
    return "float";
  };
  const key = (t: SceneTarget): [number, number, number] => {
    const side = sideOf(t);
    const r = t.slot ?? t.hit;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const rank = side === "float" ? 4 : SIDE_RANK[side]!;
    return side === "left" ? [rank, cx, cy] : side === "right" ? [rank, -cx, cy] : [rank, cy * (side === "bottom" ? -1 : 1), cx];
  };
  return list
    .map((t, i) => ({ t, i, k: key(t) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i)
    .map((x) => x.t);
}
