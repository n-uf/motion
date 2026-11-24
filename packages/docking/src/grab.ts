/**
 * The grab: where the pointer holds the dragged item, as one function of the form the item is laid in and its size
 * there (`DockGrab`). A host passes a plain point (the press, from the item's top-left corner as it is at the lift) or a
 * function; at the lift a plain point becomes the library's own twin function, which gives back the point each kind of
 * landing used before functions existed, so every reader (the float, a sliding spot, the aim cuts, a held frame's
 * `DockAfter.grab`) reads one function.
 *
 * The twin, for a press point `p` (or none):
 * - at the lift (a drag at rest, the item in its own form and size): `p` itself;
 * - a float: `p` in px as pressed, except a movable grower pressed on its grown rect, whose float keeps the press's share
 *   of the grown rect; without a press, the float's middle;
 * - a spot or a rail, the item's own form included: along the item's own length (its longer side as a drop counts it)
 *   the press's share of that length, across it the middle (`grabShare`), as a plain point always landed.
 *
 * A host's function is asked with the laid item's layout entry and the place it lies in (`DockGrabForm`); what it gives
 * is kept inside the laid rect. Where it gives `undefined` (a form the host can't place yet), the twin answers. The
 * function must be pure for the drag: the same form and size give the same point, read neither the pointer, the time nor
 * the page. The library keeps no memo of its answers.
 */
import { EPS, clamp, type Point, type Rect, type Size } from "@n-uf/placement";
import { grabShare } from "./aim";
import { growsOnBar } from "./helpers";
import type { DockItemLayout, DockLayout, DockState, Orient } from "./model";

/**
 * The place an item lies in, as a grab function reads it: a float; a spot on an edge (a bar, a panel column, a toolbar
 * rail; an item in its edge's » menu lies there too, its rect the menu entry's and `inMenu` set); or a side's rail (a
 * folded column's tile or a rail stop), with the rail's side and the axis its items lie along.
 */
export type DockGrabPlace =
  | { readonly kind: "float" }
  | { readonly kind: "spot"; readonly edge: string }
  | { readonly kind: "rail"; readonly side: "left" | "right"; readonly orient: Orient };

/**
 * What a grab function reads of a landing: the laid item's layout entry (`DockItemLayout`, as `solve` gives it in the
 * landing's layout) and the place it lies in. A host may rely on `axis`, `form`, `formKind`, `rect`'s size, `place`,
 * and where they are set `grip`, `rows`, `hidden`, `tiers`, `railTitle` and `inMenu`: what the item looks like there.
 * Not on `rect`'s position (where the probe laid it, before the grab moves it), nor on `zone`, `foldedBy`, `folded`,
 * `rides` and the other fields about the window around it: the same form and size must give the same point wherever
 * the item lies.
 */
export interface DockGrabForm extends DockItemLayout {
  readonly place: DockGrabPlace;
}

/**
 * Where the pointer holds the dragged item: a point (px from the item's top-left corner as it lies at the lift, the
 * press's), or a function of the form the item is laid in and its size there giving that point in the laid rect's own
 * coordinates (`undefined`: the library's twin of the press for that form). At the item's own form and size the
 * function gives the press point.
 */
export type DockGrab = Point | ((form: DockGrabForm, size: Size) => Point | undefined);

/** Which rule of the twin a reader asks for: a float's, a lane's (a spot's or a rail's), or the lift's (a drag at rest). */
type GrabRule = "float" | "lane" | "lift";

/** The drag's grab as the one function every reader calls (internal): the host's where it answers, else the twin. */
export type Grab = (laid: DockItemLayout | undefined, size: Size, rule: GrabRule) => Point;

/** What the twin reads of the lift (internal). */
export interface Lift {
  /** The item as it lies at the lift (as seen). */
  readonly home?: DockItemLayout;
  /** Its rect as a drop counts it (a movable grower at its natural length): the share's base. */
  readonly own?: Rect;
  /** A movable grower's grown rect on its bar, which the press is taken on. */
  readonly grown?: Rect;
}

/**
 * The place `it` lies in: a rail where it is drawn on one, a spot on its edge where it is docked (in the edge's » menu
 * too: `solve` lays a menu entry out with its edge), a float otherwise.
 */
function grabPlaceOf(it: DockItemLayout): DockGrabPlace {
  const side = it.rail ?? it.railTitle;
  if (side) return { kind: "rail", side, orient: it.axis };
  if (!it.floating && it.edge !== undefined) return { kind: "spot", edge: it.edge };
  return { kind: "float" };
}

const samePlace = (a: DockGrabPlace, b: DockGrabPlace): boolean =>
  a.kind === b.kind && (a.kind !== "spot" || a.edge === (b as typeof a).edge) && (a.kind !== "rail" || (a.side === (b as typeof a).side && a.orient === (b as typeof a).orient));

/** Whether two layout entries lie in one form: one place, axis, form and form kind. */
function sameForm(a: DockItemLayout, b: DockItemLayout): boolean {
  return a.axis === b.axis && a.form === b.form && a.formKind === b.formKind && samePlace(grabPlaceOf(a), grabPlaceOf(b));
}

/** A rect's size. */
export const sizeOf = (r: Rect): Size => ({ width: r.width, height: r.height });

/** The twin's lift: the item as seen, its rect as a drop counts it (`own`), and a movable grower's grown rect. */
export function liftOf(state: DockState, seen: DockLayout, dragged: string, own: Rect | undefined): Lift {
  const home = seen.items[dragged];
  const edge = home?.edge ? state.edges.find((e) => e.id === home.edge) : undefined;
  const grown = home && edge && growsOnBar(state, edge, dragged, home.form) && home.rect.width > 0 && home.rect.height > 0 ? home.rect : undefined;
  return { ...(home ? { home } : {}), ...(own ? { own } : {}), ...(grown ? { grown } : {}) };
}

/**
 * A note on a host's grab function, given to `onGrabNote` (`DockLaneOptions`, `DockDropOptions`) once per function. The
 * library reaches no console: a host passes the callback where it wants to hear (in development, say) and says it.
 * `lift-drift`: asked again at the item's own form and size, the function gave `at`, more than 0.5 px from the press
 * it gave at the lift (`press`): it isn't pure for the drag (it reads the pointer, the time or the page), and a held
 * item seeded with its press jumps. Seed it from `dockDrag(...).after(null).grab` and keep the function pure.
 */
export interface DockGrabNote {
  readonly code: "lift-drift";
  readonly press: Point;
  readonly at: Point;
}

/** `grab` (a host's, or none) as the one function, over `lift`; `onNote` hears of a function's drift from its press. */
export function grabOf(lift: Lift, grab: DockGrab | undefined, onNote?: (note: DockGrabNote) => void): Grab {
  const host = typeof grab === "function" ? grab : undefined;
  const ask = (laid: DockItemLayout | undefined, size: Size): Point | undefined => {
    if (!host || !laid) return undefined;
    const p = host({ ...laid, place: grabPlaceOf(laid) }, { width: size.width, height: size.height });
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: clamp(p.x, 0, Math.max(0, size.width)), y: clamp(p.y, 0, Math.max(0, size.height)) } : undefined;
  };
  const home = lift.home;
  const homeSize = home ? sizeOf(home.rect) : undefined;
  // The press: a host's point at the item's own form and size (the lift rule), else the point given.
  const press: Point | undefined = host ? ask(home, homeSize ?? { width: 0, height: 0 }) : (grab as Point | undefined);
  const share = grabShare(lift.own, press);
  const grown = lift.grown;
  const atHome = (laid: DockItemLayout | undefined, size: Size): boolean =>
    !!home && !!homeSize && !!laid && sameForm(laid, home) && Math.abs(size.width - homeSize.width) < EPS && Math.abs(size.height - homeSize.height) < EPS;
  if (host) {
    // The lift rule, checked where it can be: asked again at the item's own form and size, the function must give the
    // press it gave at the lift (a function that reads the pointer or the time doesn't, and its held item jumps).
    const asked = (laid: DockItemLayout | undefined, size: Size): Point | undefined => {
      const p = ask(laid, size);
      if (onNote && p && press && !noted.has(host) && atHome(laid, size) && Math.max(Math.abs(p.x - press.x), Math.abs(p.y - press.y)) > LIFT_SLACK) {
        noted.add(host);
        onNote({ code: "lift-drift", press, at: p });
      }
      return p;
    };
    return (laid, size, rule) => asked(laid, size) ?? twin(laid, size, rule);
  }
  return twin;
  function twin(laid: DockItemLayout | undefined, size: Size, rule: GrabRule): Point {
    // The press itself where the plain point held it before: at the lift, and in a float of the item's own form and
    // size. A lane keeps its share rule at the item's own form too (across the item's length, the middle), so a plain
    // point lands as it did.
    if (press && rule !== "lane" && atHome(laid, size)) return press;
    if (rule === "lift") return laid?.floating ? twin(laid, size, "float") : twin(laid, size, "lane");
    if (rule === "float") {
      if (!press) return { x: size.width / 2, y: size.height / 2 };
      return grown ? { x: clamp(press.x / grown.width, 0, 1) * size.width, y: clamp(press.y / grown.height, 0, 1) * size.height } : press;
    }
    return { x: share.x * size.width, y: share.y * size.height };
  }
}

/** How far (px, either way) a grab function's answer at the item's own form may stray from its press at the lift. */
const LIFT_SLACK = 0.5;
/** The grab functions a note was given for: one note per function. */
const noted = new WeakSet<object>();

/** `grabOf` over one lift, remembering the last grab it resolved (by identity): a drag passes one grab every frame. */
export function grabResolver(lift: Lift): (grab: DockGrab | undefined) => Grab {
  let last: { grab: DockGrab | undefined; fn: Grab } | null = null;
  return (grab) => {
    if (last && last.grab === grab) return last.fn;
    last = { grab, fn: grabOf(lift, grab) };
    return last.fn;
  };
}

const fnIds = new WeakMap<object, number>();
let nextFnId = 0;

/** A grab as a memo key part: a point by value, a function by its identity (one closure per drag), none as null. */
export function grabKey(grab: DockGrab | undefined): readonly [number, number] | string | null {
  if (!grab) return null;
  if (typeof grab !== "function") return [grab.x, grab.y];
  let id = fnIds.get(grab);
  if (id === undefined) fnIds.set(grab, (id = nextFnId++));
  return `fn${id}`;
}

const ORIGIN: Point = { x: 0, y: 0 };

/**
 * The grab in the form `layout` lays `dragged` in: the one reading every landing's grab comes from (`DropResult.grab` of
 * each drop that doesn't aim by the hand, `DockAfter.grab` of each held place). The drag's grab function `grab` is read
 * at the laid rect's size by the float rule where the item floats, else the lane rule; `lift` reads the lift rule (the
 * item at rest, in its own form). Where the layout lays the item nowhere: the press where it is a plain point, else the
 * corner.
 */
export function grabIn(grab: Grab, layout: DockLayout, dragged: string, press: DockGrab | undefined, lift = false): Point {
  const laid = layout.items[dragged];
  if (laid) return grab(laid, sizeOf(laid.rect), lift ? "lift" : laid.floating ? "float" : "lane");
  return press && typeof press !== "function" ? { x: press.x, y: press.y } : ORIGIN;
}

/**
 * `grabIn` as a drop reads it (internal): the grab in the form a drop's layout lays the item in, from the grab passed to
 * its `after(point, grab)` where one is, else the drag's own (`options.grab`, whose function is `base`). A grab passed is
 * read over the same lift as a float reads it, a function by identity (one closure per drag).
 */
export function readerOf(lift: Lift, base: Grab, dragged: string, options: { readonly grab?: DockGrab }): (layout: DockLayout, grab?: DockGrab) => Point {
  const resolve = grabResolver(lift);
  return (layout, grab) => grabIn(grab === undefined || grab === options.grab ? base : resolve(grab), layout, dragged, grab ?? options.grab);
}

/** Whether two points are one, within `EPS` each way. */
const samePoint = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/**
 * A landing at the hand aimed with the grab, re-aimed at most once (internal; a float's and a sliding spot's rule).
 * `aim(g)` lands the item with the pointer holding it at `g`; `laidOf` reads the item's entry in a landing; `first` is
 * the form the grab is read in first (the probe's) with the size it is read at, `sizeIn` the size of another form.
 *
 * - Aimed with the grab in the first form. Landed in that form (or with nothing to compare): that landing.
 * - Landed in another form: the grab in that form. The same grab, or a landing aimed with it that keeps that form (the
 *   new form holds under its own grab): that landing, the item switching form.
 * - Aimed with it, the item falls back to the first form (a fold threshold: each form's grab lands it in the other):
 *   the form stays, the landing aimed with the new form's grab and lying in the first form; otherwise the first landing.
 *
 * Never a third aim. The grab given back is always the one of the form the landing shows, so the held copy (at the
 * pointer less it) shows that form's grip under the pointer. Along a pointer sweep across a threshold the form switches
 * once, where the new form holds: in the band where neither holds, the form the item had (no flip-flop), and nothing is
 * remembered from frame to frame, so a release commits what the frame shows.
 */
export function aimOnce<R>(
  fn: Grab,
  rule: GrabRule,
  first: { readonly laid: DockItemLayout | undefined; readonly size: Size },
  aim: (g: Point) => R,
  laidOf: (r: R) => DockItemLayout | undefined,
  sizeIn: (laid: DockItemLayout) => Size,
): { readonly result: R; readonly grab: Point } {
  const g0 = fn(first.laid, first.size, rule);
  const r1 = aim(g0);
  const l1 = laidOf(r1);
  if (!first.laid || !l1 || sameForm(l1, first.laid)) return { result: r1, grab: g0 };
  const g1 = fn(l1, sizeIn(l1), rule);
  if (samePoint(g1, g0)) return { result: r1, grab: g1 };
  const r2 = aim(g1);
  const l2 = laidOf(r2);
  if (l2 && sameForm(l2, l1)) return { result: r2, grab: g1 };
  if (l2 && sameForm(l2, first.laid)) return { result: r2, grab: g0 };
  return { result: r1, grab: g1 };
}
