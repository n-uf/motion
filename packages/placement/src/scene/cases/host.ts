/**
 * The in-memory reference host: a `CaseHost` with no page, no pointer and no clock, only the scene. It plays gestures
 * the way a page's drag session does: a press on a handle, the first move past the lift threshold lifting the item and
 * asking `targets` for every drop target, a pointer over the most precise of them (`pickTarget`), the preview drawn from
 * that target's `after.layout`, and a release committing `after.scene`. Every solve carries the layout before it as
 * `previous`. The kits' hosts do the same with their own pointer and DOM; the rows are the contract between them.
 *
 * Also exported: `pickTarget` (which target a point is over) and `resolvePlace` (a point that reaches the target at a
 * place), the two pure steps a host needs to turn a gesture's `place` into a pointer.
 */
import { area, centre, contains as inside, type Point, type Rect } from "../../geometry";
import { close, dockHome, fold, floatAt, homeFor, open, raise, readScene, resize, solve, stops, storeScene, targets, use, type Scene, type SceneLayout, type SceneTarget, type ScenePlace, type StoredScene } from "../index";
import type { CaseHost, CaseSettings, Gesture } from "./types";

/** The lift threshold: the pointer moves this far (px) from the press before the item lifts. */
export const LIFT_THRESHOLD = 4;
/** How far past an edge's ends its first and last gaps reach (px); the kits' toolbars use 24. */
export const END_REACH = 24;


/** The most precise target under `point`: the lowest priority number, then the smallest hit; null when none is. */
export function pickTarget<T extends { readonly priority: number; readonly hit: Rect }>(list: readonly T[], point: Point): T | null {
  let best: T | null = null;
  for (const t of list) {
    if (!inside(t.hit, point)) continue;
    if (!best || t.priority < best.priority || (t.priority === best.priority && area(t.hit) < area(best.hit))) best = t;
  }
  return best;
}

/** The id `targets` gives the target for `place`, or null for a place with no fixed id (`none`). */
function targetIdOf(place: ScenePlace, item: string): string | null {
  switch (place.kind) {
    case "gap":
      return `gap:${place.edge}:${place.zone}:${place.at}`;
    case "column":
      return `column:${place.side}:${place.ring}`;
    case "rail":
      return `rail:${place.side}:${place.ring}`;
    case "float":
      return `float:${item}`;
    case "home":
      return `home:${item}`;
    default:
      return null;
  }
}

/** The target for `place` among `list`: by id, else by the place's kind. */
function targetAt(list: readonly SceneTarget[], place: ScenePlace, item: string): SceneTarget | null {
  const id = targetIdOf(place, item);
  return (id ? list.find((t) => t.id === id) : undefined) ?? list.find((t) => t.place.kind === place.kind && (place.kind === "none" || id === null)) ?? null;
}

/** What `resolvePlace` may aim at when a target covers the whole plane (a float): the stage and the content. */
export interface AimArea {
  readonly stage: Rect;
  readonly content?: Rect;
}

/**
 * A pointer position that reaches the target at `place`: inside its hit and not covered by a more precise target
 * (`pickTarget` finds it there). It tries the hit's centre, then a grid across the hit; a target over the whole plane
 * (the float) is aimed at the content's centre, then the stage's, then a grid across the stage. Null when no point
 * reaches it (a gap that a home or a blocked spot covers entirely).
 */
export function resolvePlace(list: readonly SceneTarget[], place: ScenePlace, item: string, area_: AimArea): Point | null {
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
  return candidates.find((p) => inside(t.hit, p) && pickTarget(list, p) === t) ?? null;
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
}

export interface SceneHostOptions {
  /** How far past an edge's ends its end gaps reach, px (default {@link END_REACH}). */
  readonly endReach?: number;
  /** Px from the press before an item lifts (default {@link LIFT_THRESHOLD}). */
  readonly lift?: number;
  /** Where a press with no `point` holds the item, px from its top-left corner (default 8, 8). A test varies it to prove no row depends on it. */
  readonly grab?: Point;
}

interface Session {
  readonly item: string;
  readonly grab: Point;
  readonly down: Point;
  point: Point;
  lifted: boolean;
  list: SceneTarget[];
  target: SceneTarget | null;
}

const stageRect = (w: number, h: number): Rect => ({ x: 0, y: 0, width: w, height: h });

export function createSceneHost(options: SceneHostOptions = {}): SceneHost {
  const endReach = options.endReach ?? END_REACH;
  const lifted0 = options.lift ?? LIFT_THRESHOLD;
  const defaultGrab = options.grab ?? { x: 8, y: 8 };
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
    s.target = pickTarget(s.list, s.point);
  }

  function move(g: Gesture): void {
    const s = session;
    if (!s) return;
    if (g.place) {
      if (!s.lifted) liftNow(s);
      const p = resolvePlace(s.list, g.place, s.item, aim());
      if (!p) throw new Error(`no point reaches the target at ${JSON.stringify(g.place)} (targets: ${s.list.map((t) => t.id).join(", ") || "none"})`);
      s.point = p;
      s.target = pickTarget(s.list, p);
      return;
    }
    if (!g.point) throw new Error("a move needs a point or a place");
    s.point = { x: g.point.x, y: g.point.y };
    if (!s.lifted && Math.hypot(s.point.x - s.down.x, s.point.y - s.down.y) > lifted0) liftNow(s);
    else if (s.lifted) s.target = pickTarget(s.list, s.point);
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
    session = { item: id, grab, down, point: down, lifted: false, list: [], target: null };
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

  /** `id`'s largest form along the axis it lies along grew by `d` px (measured again), in the scene and in the start scene. */
  function measure(id: string, d: number): void {
    const edge = prev().items[id]?.edge;
    const side = edge ? prev().edges[edge]?.side : undefined;
    const axis = side === "top" || side === "bottom" ? "row" : "column";
    const grown = (s: Scene): Scene => {
      const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
      const forms = it?.forms[axis];
      if (!it || !forms || forms.length === 0) return s;
      const f0 = forms[0]!;
      const f = { ...f0, main: { ...f0.main, min: Math.max(0, f0.main.min + d), natural: Math.max(0, f0.main.natural + d) } };
      return { ...s, items: { ...s.items, [id]: { ...it, forms: { ...it.forms, [axis]: [f, ...forms.slice(1)] } } } };
    };
    if (!Object.hasOwn(now().items, id)) throw new Error(`no item ${id}`);
    start = grown(start!);
    settle(grown(now()));
  }

  function resizeNow(g: Gesture): void {
    if (g.edge !== undefined) {
      if (g.size === undefined) throw new Error("a resize of an edge needs a size");
      if (!now().edges.some((e) => e.id === g.edge)) throw new Error(`no edge ${g.edge}`);
      settle(resize(now(), g.edge, g.size));
    } else if (g.item !== undefined) {
      if (g.size === undefined) throw new Error("a resize of an item needs a size");
      measure(g.item, g.size);
    } else if (g.point) {
      const stage = stageRect(g.point.x, g.point.y);
      start = { ...start!, stage };
      settle({ ...now(), stage });
    } else throw new Error("a resize needs an edge, an item or a point (the window's size)");
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
    drag: () => (session ? { item: session.item, lifted: session.lifted, target: session.target?.id ?? null, point: session.point, grab: session.grab } : null),
  };
}
