/**
 * The in-memory reference host: a `CaseHost` with no page, no pointer and no clock, only the scene. It plays gestures
 * the way a page's drag session does: a press on a handle, the first move past the lift threshold lifting the item and
 * asking `targets` for every drop target, a pointer over the most precise of them (its `pick`: pass
 * `@n-uf/motion/drag`'s `targetAt`, the one pick rule), the preview drawn from that target's `after.layout`, and a
 * release committing `after.scene`. Every solve carries the layout before it as `previous`. An integrating app's host does the same
 * with their own pointer and DOM; the rows are the contract between them.
 *
 * Also exported: `resolvePlace` (a point that reaches the target at a place, under a pick rule), the pure step a host
 * needs to turn a gesture's `place` into a pointer, and the deprecated `pickTarget` (the default pick).
 */
import { centre, contains as inside, type Point, type Rect } from "../../geometry";
import { pickRank } from "../../target";
import { close, dockHome, fold, floatAt, homeFor, open, placeTargetId, raise, readScene, refusalTargets, refusals, resize, solve, stops, storeScene, targets, use, type Scene, type SceneLayout, type SceneRefusal, type SceneRefusalTarget, type SceneTarget, type ScenePlace, type StoredScene } from "../index";
import type { CaseHost, CaseSettings, Gesture, PickCandidate, PickRule } from "./types";

/** The lift threshold: the pointer moves this far (px) from the press before the item lifts. */
export const LIFT_THRESHOLD = 4;
/** How far past an edge's ends its first and last gaps reach (px); toolbars use 24. */
export const END_REACH = 24;


/**
 * The most precise target under `point`: the lowest rank (`pickRank`: the priority, a refusal's `REFUSAL_RANK`), then
 * the smallest zone; null when none is. A target with `hits` is under the point in any of them, and its zone's size is
 * theirs together.
 *
 * @deprecated The pick rule is `@n-uf/motion/drag`'s `targetAt`: pass it as `createSceneHost({ pick: targetAt })` and
 * to `resolvePlace`. This is only the reference host's default when none is given (placement doesn't import motion),
 * the same rule with the same tolerances: a rect holds its edges exactly, with no epsilon, and a zone's size is the sum
 * of width × height over its pieces. A test holds it equal to `targetAt`. Removed in the release that drops the legacy
 * entries.
 */
export function pickTarget<T extends { readonly priority: number; readonly hit: Rect; readonly hits?: readonly Rect[]; readonly refuse?: true; readonly outer?: Rect }>(list: readonly T[], point: Point): T | null {
  const holds = (r: Rect): boolean => point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height;
  // A zone with `outer` holds only points strictly inside it (the window's edge belongs to the targets drawn against it).
  const within = (o: Rect | undefined): boolean => !o || (point.x > o.x && point.x < o.x + o.width && point.y > o.y && point.y < o.y + o.height);
  const under = (t: T): boolean => within(t.outer) && (t.hits ? t.hits.some(holds) : holds(t.hit));
  const size = (t: T): number => (t.hits ? t.hits.reduce((s, r) => s + r.width * r.height, 0) : t.hit.width * t.hit.height);
  let best: T | null = null;
  for (const t of list) {
    if (!under(t)) continue;
    if (!best || pickRank(t) < pickRank(best) || (pickRank(t) === pickRank(best) && size(t) < size(best))) best = t;
  }
  return best;
}

/**
 * The pick rule with the scene's refusals (`refusals(scene, dragged)`), the drag intent's way: the refusals take part in
 * the pick as refusal targets (`refusalTargets`), and where one is what the rule picks nothing is picked, so a release
 * there commits nothing and the item goes home ("No room here"). Every host aims and drops with it: the reference host,
 * and a page's host for `resolvePlace`.
 */
export function withRefusals(pick: PickRule, refused: readonly SceneRefusal[]): PickRule {
  if (refused.length === 0) return pick;
  const inert = refusalTargets(refused);
  return <T extends PickCandidate>(list: readonly T[], point: Point): T | null => {
    // The rule reads ids, priorities and zones only: a refusal target is one more candidate, and a pick of one is none.
    const t = pick<T | SceneRefusalTarget>([...list, ...inert], point);
    return t !== null && isOneOf(list, t) ? t : null;
  };
}

/** Whether `x` is one of `list` (so of its type). */
const isOneOf = <T,>(list: readonly T[], x: unknown): x is T => (list as readonly unknown[]).includes(x);

/** The target for `place` among `list`: by its id (`placeTargetId`), else by the place's kind. */
function targetAt(list: readonly SceneTarget[], place: ScenePlace, item: string): SceneTarget | null {
  const id = placeTargetId(place, item);
  return (id ? list.find((t) => t.id === id) : undefined) ?? list.find((t) => t.place.kind === place.kind && (place.kind === "none" || id === null)) ?? null;
}

/** What `resolvePlace` may aim at when a target covers the whole plane (a float): the stage and the content. */
export interface AimArea {
  readonly stage: Rect;
  readonly content?: Rect;
  /**
   * The dragged item's own rect as drawn (a float's too): a point outside it is preferred, as a person aims, so a drag
   * intent's home gate never holds the aim. Default: the hit of the list's `home` target, if any.
   */
  readonly own?: Rect;
}

/**
 * A pointer position that reaches the target at `place`: inside its hit and not covered by a more precise target
 * (`pick` finds it there: the host's pick rule, `@n-uf/motion/drag`'s `targetAt`; default the same rule, `pickTarget`).
 * It tries the hit's center, then a grid across the hit; a target over the whole plane (the float) is aimed at the
 * content's center, then the stage's, then a grid across the stage. Of the points that reach it, the first outside the
 * dragged item's own rect (`AimArea.own`) wins whenever one exists. Null when no point reaches it (a gap that a home or
 * a blocked spot covers entirely).
 */
export function resolvePlace(list: readonly SceneTarget[], place: ScenePlace, item: string, area_: AimArea, pick: PickRule = pickTarget): Point | null {
  const t = targetAt(list, place, item);
  if (!t) return null;
  const big = t.hit.width > 1e6 || t.hit.height > 1e6;
  const candidates: Point[] = [];
  if (big) {
    if (area_.content) candidates.push(centre(area_.content));
    candidates.push(centre(area_.stage));
  } else {
    candidates.push(centre(t.hit));
  }
  const region = big ? area_.stage : t.hit;
  for (const fy of [0.5, 0.25, 0.75, 0.1, 0.9, 0.4, 0.6, 0, 1]) {
    for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9, 0.4, 0.6, 0, 1]) candidates.push({ x: region.x + region.width * fx, y: region.y + region.height * fy });
  }
  const reach = candidates.filter((p) => inside(t.hit, p) && pick(list, p) === t);
  const own = area_.own ?? list.find((x) => x.place.kind === "home" && x.id.startsWith("home:"))?.hit;
  return (own ? reach.find((p) => !inside(own, p)) : undefined) ?? reach[0] ?? null;
}

/**
 * A `resize` gesture as a pure step, for any host: the scene after it, and the loaded scene (`start`, what `"dock"` puts
 * items back to) after it too. With `edge`, the user's size across that edge; with `item`, that item's largest form along
 * the axis it lies along in `layout` grew by `size` px (in both scenes: it was measured again); with neither, the window
 * is now `point.x` by `point.y`. Throws when the gesture names nothing that exists.
 */
export function resizeStep(scene: Scene, start: Scene, layout: SceneLayout, g: Gesture): { readonly scene: Scene; readonly start: Scene } {
  if (g.edge !== undefined) {
    if (g.size === undefined) throw new Error("a resize of an edge needs a size");
    if (!scene.edges.some((e) => e.id === g.edge)) throw new Error(`no edge ${g.edge}`);
    return { scene: resize(scene, g.edge, g.size), start };
  }
  if (g.item !== undefined) {
    if (g.size === undefined) throw new Error("a resize of an item needs a size");
    const id = g.item;
    const d = g.size;
    if (!Object.hasOwn(scene.items, id)) throw new Error(`no item ${id}`);
    const edge = layout.items[id]?.edge;
    const side = edge ? layout.edges[edge]?.side : undefined;
    const axis = side === "top" || side === "bottom" ? "row" : "column";
    const grown = (s: Scene): Scene => {
      const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
      const forms = it?.forms[axis];
      if (!it || !forms || forms.length === 0) return s;
      const f0 = forms[0]!;
      const f = { ...f0, main: { ...f0.main, min: Math.max(0, f0.main.min + d), natural: Math.max(0, f0.main.natural + d) } };
      return { ...s, items: { ...s.items, [id]: { ...it, forms: { ...it.forms, [axis]: [f, ...forms.slice(1)] } } } };
    };
    return { scene: grown(scene), start: grown(start) };
  }
  if (g.point) {
    const stage = stageRect(g.point.x, g.point.y);
    return { scene: { ...scene, stage }, start: { ...start, stage } };
  }
  throw new Error("a resize needs an edge, an item or a point (the window's size)");
}

/** What the in-memory host knows about a drag in progress. */
interface HostDrag {
  readonly item: string;
  /** False between the press and the lift. */
  readonly lifted: boolean;
  /** The id of the target the pointer is over, or null. */
  readonly target: string | null;
  readonly point: Point;
  /** Where the pointer holds the item, relative to its top-left corner. */
  readonly grab: Point;
}

export interface SceneHost extends CaseHost {
  /** The committed scene (not the preview). */
  scene(): Scene;
  /** The scene as the host stores it, as a page reload would read it back. */
  stored(): StoredScene;
  /** The drag in progress, or null. */
  drag(): HostDrag | null;
  /** The pick rule it aims with: the one in its options, else the default. */
  readonly pick: PickRule;
}

export interface SceneHostOptions {
  /** How far past an edge's ends its end gaps reach, px (default {@link END_REACH}). */
  readonly endReach?: number;
  /** Px from the press before an item lifts (default {@link LIFT_THRESHOLD}). */
  readonly lift?: number;
  /** Where a press with no `point` holds the item, px from its top-left corner (default 8, 8). A test varies it to prove no row depends on it. */
  readonly grab?: Point;
  /**
   * The pick rule: which target the pointer is over. Pass `@n-uf/motion/drag`'s `targetAt`, the rule an app's drag intent
   * runs, so the reference host and the kit agree on every boundary pixel. Default: the same rule (`pickTarget`).
   */
  readonly pick?: PickRule;
}

interface Session {
  readonly item: string;
  readonly grab: Point;
  readonly down: Point;
  point: Point;
  lifted: boolean;
  list: SceneTarget[];
  /** The pick rule with this drag's refusals (`withRefusals`). */
  pickAt: PickRule;
  target: SceneTarget | null;
}

const stageRect = (w: number, h: number): Rect => ({ x: 0, y: 0, width: w, height: h });

export function createSceneHost(options: SceneHostOptions = {}): SceneHost {
  const endReach = options.endReach ?? END_REACH;
  const lifted0 = options.lift ?? LIFT_THRESHOLD;
  const defaultGrab = options.grab ?? { x: 8, y: 8 };
  const pick: PickRule = options.pick ?? pickTarget;
  let start: Scene | null = null;
  let scene: Scene | null = null;
  let committed: SceneLayout | null = null;
  let frozen = false;
  let alt = false;
  let session: Session | null = null;

  const now = (): Scene => {
    if (!scene) throw new Error("nothing is loaded");
    return scene;
  };
  const prev = (): SceneLayout => {
    if (!committed) throw new Error("nothing is loaded");
    return committed;
  };
  /** The scene is now `s`: solved with the layout before it as `previous`. */
  const settle = (s: Scene): void => {
    committed = solve(s, { previous: prev() });
    scene = s;
  };

  const preview = (): SceneLayout => {
    if (!session?.lifted) return prev();
    const t = session.target;
    if (t) return t.after(session.point, session.grab).layout;
    // No target under the pointer: a release here commits nothing, so the preview is the committed layout with the held
    // item's place left empty, and nothing else moves.
    const l = prev();
    const { [session.item]: _held, ...items } = l.items;
    return { ...l, items, floats: l.floats.filter((f) => f !== session!.item) };
  };

  const aim = (): AimArea => ({ stage: now().stage, content: prev().content });

  function liftNow(s: Session): void {
    s.lifted = true;
    s.list = targets(now(), s.item, { previous: prev(), endReach });
    s.pickAt = withRefusals(pick, refusals(now(), s.item, { previous: prev(), endReach }));
    s.target = s.pickAt(s.list, s.point);
  }

  function move(g: Gesture): void {
    const s = session;
    if (!s) return;
    if (g.place) {
      if (!s.lifted) liftNow(s);
      const p = resolvePlace(s.list, g.place, s.item, { ...aim(), ...(prev().items[s.item] ? { own: prev().items[s.item]!.rect } : {}) }, s.pickAt);
      if (!p) throw new Error(`no point reaches the target at ${JSON.stringify(g.place)} (targets: ${s.list.map((t) => t.id).join(", ") || "none"})`);
      s.point = p;
      s.target = s.pickAt(s.list, p);
      return;
    }
    if (!g.point) throw new Error("a move needs a point or a place");
    s.point = { x: g.point.x, y: g.point.y };
    if (!s.lifted && Math.hypot(s.point.x - s.down.x, s.point.y - s.down.y) > lifted0) liftNow(s);
    else if (s.lifted) s.target = s.pickAt(s.list, s.point);
  }

  function press(g: Gesture): void {
    session = null;
    const id = g.item;
    if (!id) throw new Error("a press needs an item");
    const s = now();
    const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
    if (!it) throw new Error(`no item ${id}`);
    const l = prev().items[id];
    // No handle: fixed items and closed ones never lift, nor does one in the » menu; a frozen window lifts nothing without Alt.
    if (it.fixed || it.closed || !l || l.inMenu || (frozen && !alt)) return;
    // Where the pointer holds the item is the row's (`point`). Without one the host picks a spot a few px in; a row whose
    // result depends on the grab (a float's landing is the pointer minus it) always gives its own.
    const grab = g.point ? { x: g.point.x, y: g.point.y } : { x: Math.min(defaultGrab.x, l.rect.width / 2), y: Math.min(defaultGrab.y, l.rect.height / 2) };
    const down = { x: l.rect.x + grab.x, y: l.rect.y + grab.y };
    // A press on a float raises it: stacking only, no use and no reshape.
    if (l.floating) settle(raise(s, id));
    session = { item: id, grab, down, point: down, lifted: false, list: [], pickAt: pick, target: null };
  }

  function release(): void {
    const s = session;
    session = null;
    if (!s || !s.lifted) return;
    const t = s.target;
    if (!t || t.place.kind === "home" || t.place.kind === "none") return;
    const after = t.after(s.point, s.grab);
    scene = after.scene;
    committed = after.layout;
  }

  function matchStop(g: Gesture): SceneTarget {
    const id = g.item!;
    const list = stops(now(), id, { previous: prev(), endReach });
    const t = targetAt(list, g.place!, id);
    if (!t) throw new Error(`${JSON.stringify(g.place)} is not one of ${id}'s stops (${list.map((x) => x.id).join(", ") || "none"})`);
    return t;
  }

  function click(g: Gesture): void {
    const id = g.item;
    if (!id) throw new Error("a click needs an item");
    const s = now();
    const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
    if (!it) throw new Error(`no item ${id}`);
    // A frozen window refuses every move of an item: the menu's Float, Dock and Move to › too, unless Alt is down.
    const moves = g.place !== undefined || g.key === "float" || g.key === "dock";
    if (moves && frozen && !alt) return;
    if (g.place) {
      const stop = matchStop(g);
      // The menu's Float is `floatAt` with no rect (its last size, anchored to the content), as a click on "Float" gives.
      const after = stop.place.kind === "float" ? ((): { scene: Scene; layout: SceneLayout } => {
        const s2 = use(floatAt(s, id), id);
        return { scene: s2, layout: solve(s2, { previous: prev() }) };
      })() : stop.after(centre(s.stage));
      scene = after.scene;
      committed = after.layout;
      return;
    }
    switch (g.key) {
      case undefined: {
        if (it.closed) settle(use(open(s, id), id));
        else if ((it.from ?? 0) > 0) settle(use(fold(s, id, false), id));
        else if (prev().items[id]?.floating) settle(raise(s, id));
        return;
      }
      case "use":
        return settle(use(s, id));
      case "open":
        return settle(use(open(s, id), id));
      case "close":
        return settle(close(s, id));
      case "fold":
        return settle(use(fold(s, id, true), id));
      case "unfold":
        return settle(use(fold(s, id, false), id));
      case "float":
        return settle(use(floatAt(s, id), id));
      case "dock": {
        const place = homeFor(s, id, start!);
        if (!place) throw new Error(`the loaded scene puts ${id} nowhere`);
        // `dockHome`: the start place and the start fold, so a "Move to › rail" then Dock brings the item back open.
        return settle(use(dockHome(s, id, start!), id));
      }
      default:
        throw new Error(`no control ${g.key}`);
    }
  }

  function resizeNow(g: Gesture): void {
    const next = resizeStep(now(), start!, prev(), g);
    start = next.start;
    settle(next.scene);
  }

  function reload(): void {
    session = null;
    const data: unknown = JSON.parse(JSON.stringify(storeScene(now())));
    const read = readScene(data, { ...start!, stage: now().stage });
    scene = read.scene;
    committed = solve(read.scene);
  }

  return {
    load(s, settings: CaseSettings = {}) {
      const stage = settings.stage ? stageRect(settings.stage.w, settings.stage.h) : s.stage;
      const loaded = settings.stage ? { ...s, stage } : s;
      start = loaded;
      scene = loaded;
      committed = solve(loaded);
      frozen = settings.frozen === true;
      alt = false;
      session = null;
    },
    perform(g) {
      switch (g.type) {
        case "press":
          return press(g);
        case "move":
          return move(g);
        case "release":
          return release();
        case "key":
          if (g.key === "Escape") session = null;
          else if (g.key === "Alt") alt = true;
          else if (g.key === "Alt:up") alt = false;
          else if (g.key === "Reload") reload();
          else throw new Error(`no key ${g.key}`);
          return;
        case "click":
          return click(g);
        case "resize":
          return resizeNow(g);
        case "scroll":
        case "hold":
          // Nothing in a scene scrolls (floats are in stage px), and the in-memory host has no clock.
          return;
        default:
          throw new Error(`no gesture ${String((g as Gesture).type)}`);
      }
    },
    layout: preview,
    scene: now,
    stored: () => storeScene(now()),
    stops: (item) => stops(now(), item, { previous: prev(), endReach }).map((t) => t.place),
    pick,
    drag: () => (session ? { item: session.item, lifted: session.lifted, target: session.target?.id ?? null, point: session.point, grab: session.grab } : null),
  };
}
