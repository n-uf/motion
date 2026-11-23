/**
 * One layout for a tiling drag's held frame and its commit, the layout half: `tilingDrag(tree, subject, options)` gives
 * the drag's base (the tree with the subject released, laid out), its home (the gap the release leaves) and
 * `after(held)`, THE layout of each held place: what a release there commits, and what a frame holding it draws.
 *
 * The host keeps its own tree type and its own changes; it hands them over as a `TilingTree` adapter. The library owns
 * the rules: what is released and when, which tree each change takes, home, the refusals, and the one layout per held
 * place. Geometry has one source: the adapter gives the tree as a `Split` (`split`), and the library lays it out with
 * `layoutSplitTree` under the drag's options (`SplitOptions` plus `min`, as `canDropOnPane` takes them).
 *
 * The hit half (targets, a pane's parts, `placeOf`) is not here yet. See docs/placement.md, Entry: tiling.
 */
import { EPS, type Rect } from "../geometry";
import type { Side } from "../side";
import { canSplitPane, dropFits, type DropOptions } from "./drop";
import { layoutSplitTree, type SplitGeometry } from "./layout";
import { panesOf, type Split } from "./split";

/** A stack as the adapter reports it: its id, its members in order, and the member it is drawn as. */
export interface TilingStack<K> {
  readonly id: string;
  readonly members: readonly K[];
  readonly active: K;
}

/**
 * What a drag moves: one pane (a member of a stack is torn out of it), or a whole stack, every member as one. A stack
 * subject carries the stack as the adapter reported it at the lift (`stackOf`), so the changes that place it after its
 * release (`beside`, `join`) have its members.
 */
export type TilingSubject<K> = { readonly kind: "pane"; readonly pane: K } | { readonly kind: "stack"; readonly stack: TilingStack<K> };

/**
 * How a side drop sizes the split it makes. One kind today: the two panes take half each (the split `splitPane`
 * writes). A later rule may size the subject by its own length; it will be a new kind here, never an option.
 */
export type TilingSize = { readonly kind: "half" };

/**
 * The host's tree, as a drag reads and changes it. Every function is pure: it never changes the tree it is given, and
 * returns a new tree (or the same one when nothing changes).
 *
 * Which tree each change takes, and why:
 * - `beside` and `join` take the **released** tree (`release`'s result): the subject leaves its old place first, so the
 *   place it lands in is measured, and changed, without it. A pane beside its own old sibling then lands as if it were
 *   new there, and a stack never holds the subject twice.
 * - `swap` takes the tree **with the subject still in it**: a swap exchanges two places, and the subject's old place is
 *   exactly where the partner goes. With the subject released there would be no old place to give the partner.
 */
export interface TilingTree<T, K> {
  /** The tree as panes divide the area: a `Split` of the drawn panes (a stack stands in it as its active member's key). */
  split(tree: T): Split<K> | null;
  /** The stack `pane` is a member of, or null; leave it out when the tree has no stacks. */
  stackOf?(tree: T, pane: K): TilingStack<K> | null;
  /** `tree` without the subject: a pane leaves its place (or its stack), a stack leaves with every member. */
  release(tree: T, subject: TilingSubject<K>): T;
  /** The released tree with the subject placed on `side` of the drawn pane `at`, sized by `size`. */
  beside(released: T, subject: TilingSubject<K>, at: K, side: Side, size: TilingSize): T;
  /** `tree` (the subject still in it) with the subject and the drawn pane `at` in each other's place. */
  swap(tree: T, subject: TilingSubject<K>, at: K): T;
  /** The released tree with the subject joined to the drawn pane `at`'s stack (made one when `at` is alone), at `index` (default: last). Leave it out when the tree has no stacks: every join is refused `"join"`. */
  join?(released: T, subject: TilingSubject<K>, at: K, index?: number): T;
  /** Commit-time reconciliation: part of every `after` but home's, so what a frame draws is what a release stores. Default: none. */
  normalize?(tree: T): T;
}

/** What `tilingDrag` reads: the adapter, the stage, and the layout options (`SplitOptions` plus `min`, the least pane width and height a drop keeps). */
export interface TilingDragOptions<T, K> extends DropOptions<K> {
  readonly ops: TilingTree<T, K>;
  /** The stage the tree is laid out in, px. */
  readonly area: Rect;
  /** Panes that take no drop (a swap, a side or a join on one is refused `"still"`). Default: none. */
  readonly still?: (pane: K) => boolean;
}

/** A held place of a drag: where a release now lands. `at` is always a pane drawn in the base. */
export type TilingHeld<K> =
  | { readonly kind: "home" }
  | { readonly kind: "swap"; readonly at: K }
  | { readonly kind: "beside"; readonly at: K; readonly side: Side }
  | { readonly kind: "join"; readonly at: K; readonly index?: number };

/**
 * Why a held place takes no release, as a code:
 * - `self`: the place is the subject's own (a swap or side of the subject itself, a swap with its own stack, a whole
 *   stack joined to itself);
 * - `still`: `at` is a still pane;
 * - `missing`: `at` is not a pane drawn in the base;
 * - `join`: the adapter has no `join`;
 * - `room-along`, `room-across`: `at` is too short for two panes along the split, or too narrow across it, in the base
 *   (`canSplitPane`): `need` and `have` px;
 * - `fit`: in the layout the release makes, `pane` (the subject or `at`) is below `min` (`dropFits`).
 */
export type TilingRefusal<K> =
  | { readonly code: "self" | "still" | "missing" | "join" }
  | { readonly code: "room-along" | "room-across"; readonly need: number; readonly have: number }
  | { readonly code: "fit"; readonly pane: K };

/** A tree laid out: every drawn pane's rect, and the geometry of each split that has an id. */
export interface TilingLaidOut<T, K> {
  readonly tree: T;
  readonly layout: ReadonlyMap<K, Rect>;
  readonly splits: ReadonlyMap<string, SplitGeometry>;
}

/** A pane a commit moves, from where it was drawn at the lift to where the commit puts it. */
export interface TilingMove<K> {
  readonly pane: K;
  readonly from: Rect;
  readonly to: Rect;
}

/** THE layout of a held place: what a release commits, and what a frame holding it draws. */
export interface TilingAfter<T, K> extends TilingLaidOut<T, K> {
  readonly held: TilingHeld<K>;
  /**
   * Why a release here commits nothing, or null. A refused place's tree and layout are the lift's (what its release
   * keeps), its landing null and nothing moved; a frame holding it draws rest (the base).
   */
  readonly refusal: TilingRefusal<K> | null;
  /** The subject's rect in `layout`: its own when it is drawn, else its stack's. Null when refused. */
  readonly landing: Rect | null;
  /** Every other drawn pane whose rect differs from the lift's (the swap partner, the panes that give room), in `layout`'s order. */
  readonly moved: readonly TilingMove<K>[];
}

/** A drag of one subject: its base, its home, and the one layout of each held place. */
export interface TilingDrag<T, K> {
  readonly subject: TilingSubject<K>;
  /** The tree at the lift, laid out: what is drawn before the drag, and what a release on home commits. */
  readonly lift: TilingLaidOut<T, K>;
  /** The hit basis, fixed for the drag: the tree with the subject released, laid out. What a frame draws at rest (nothing held, or a refused place). */
  readonly base: TilingLaidOut<T, K>;
  /**
   * The gap the release leaves: the subject's lift rect when releasing it takes a drawn pane away (a pane alone, a
   * whole stack), null when it takes none (a member torn out of a stack that stays drawn).
   */
  readonly home: Rect | null;
  /** THE layout of `held`. Remembered per held place: the same place gives the same object. */
  after(held: TilingHeld<K>): TilingAfter<T, K>;
}

const sameRect = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS && Math.abs(a.width - b.width) <= EPS && Math.abs(a.height - b.height) <= EPS;

/** A px option as the drop rules read it: finite and above 0, else 0. */
const px = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * The drag of `subject` in `tree`: its lift and base layouts, its home, and `after(held)`, the one layout of each held
 * place. `tree` is never changed; `after({ kind: "home" }).tree` is `tree` itself.
 *
 * - **`after(held).tree`** is what a release commits: `normalize(change)`, where the change is `beside` or `join` on
 *   the released tree, or `swap` on the lift tree (see `TilingTree` for why). Home's is the lift tree, never normalized.
 * - **`layout`** is that tree laid out, so a frame that draws it draws exactly what the release stores.
 * - **Refusals** are judged on the base (room) and on the change's own layout (fit), never on another tree.
 */
export function tilingDrag<T, K>(tree: T, subject: TilingSubject<K>, options: TilingDragOptions<T, K>): TilingDrag<T, K> {
  const { ops, area } = options;
  const normalize = (t: T): T => (ops.normalize ? ops.normalize(t) : t);
  const lay = (t: T): TilingLaidOut<T, K> => {
    const { panes, splits } = layoutSplitTree(ops.split(t), area, options);
    return { tree: t, layout: panes, splits };
  };
  const stackOf = (t: T, pane: K): TilingStack<K> | null => ops.stackOf?.(t, pane) ?? null;
  /** The key `pane` is drawn as in `t`: its stack's active member, or itself. */
  const drawnAs = (t: T, pane: K): K => stackOf(t, pane)?.active ?? pane;
  const subjectKey = subject.kind === "pane" ? subject.pane : subject.stack.active;

  const lift = lay(tree);
  const base = lay(ops.release(tree, subject));
  const liftRect = lift.layout.get(drawnAs(tree, subjectKey)) ?? null;
  const takesPane = panesOf(ops.split(base.tree)).length < panesOf(ops.split(tree)).length;
  const home = takesPane && liftRect ? { ...liftRect } : null;

  /** Every drawn pane of `laid` but the subject's whose rect differs from where it was drawn at the lift. */
  const movedIn = (laid: TilingLaidOut<T, K>): TilingMove<K>[] => {
    const own = drawnAs(laid.tree, subjectKey);
    const out: TilingMove<K>[] = [];
    for (const [pane, to] of laid.layout) {
      if (pane === own) continue;
      const from = lift.layout.get(lift.layout.has(pane) ? pane : drawnAs(tree, pane));
      if (from && !sameRect(from, to)) out.push({ pane, from, to });
    }
    return out;
  };

  const inSubject = (pane: K): boolean => (subject.kind === "pane" ? pane === subject.pane : subject.stack.members.includes(pane));

  /** The refusal a held place has before any change is made: whose `at` it names, and whether the adapter can make it. */
  const refusalBefore = (held: Exclude<TilingHeld<K>, { kind: "home" }>): TilingRefusal<K> | null => {
    const at = held.at;
    if (inSubject(at)) return { code: "self" };
    if (held.kind === "swap") {
      // A swap with the stack the subject is torn from: the subject's own place.
      const own = stackOf(tree, subjectKey);
      if (own && stackOf(tree, at)?.id === own.id) return { code: "self" };
    }
    if (!base.layout.has(at)) return { code: "missing" };
    if (options.still?.(at)) return { code: "still" };
    if (held.kind === "join" && !ops.join) return { code: "join" };
    return null;
  };

  /** A refused place: the release commits nothing, so its layout is the lift's. */
  const refused = (held: TilingHeld<K>, refusal: TilingRefusal<K>): TilingAfter<T, K> => ({ ...lift, held, refusal, landing: null, moved: [] });

  /** The room rule on `at`'s base rect (`canSplitPane`), as a code with the numbers. */
  const roomFor = (at: K, side: Side): TilingRefusal<K> | null => {
    const r = base.layout.get(at)!;
    if (canSplitPane(r, side, options).ok) return null;
    const along = side === "left" || side === "right";
    const gutter = px(options.gap) + px(options.handle);
    const min = px(options.min);
    const span = along ? r.width : r.height;
    return span < min * 2 + gutter ? { code: "room-along", need: min * 2 + gutter, have: span } : { code: "room-across", need: min, have: along ? r.height : r.width };
  };

  const make = (held: TilingHeld<K>): TilingAfter<T, K> => {
    if (held.kind === "home") return { ...lift, held, refusal: null, landing: liftRect, moved: [] };
    const before = refusalBefore(held) ?? (held.kind === "beside" ? roomFor(held.at, held.side) : null);
    if (before) return refused(held, before);
    const changed =
      held.kind === "swap"
        ? ops.swap(tree, subject, held.at)
        : held.kind === "beside"
          ? ops.beside(base.tree, subject, held.at, held.side, { kind: "half" })
          : ops.join!(base.tree, subject, held.at, held.index);
    const laid = lay(normalize(changed));
    const own = drawnAs(laid.tree, subjectKey);
    if (held.kind === "beside") {
      const partner = drawnAs(laid.tree, held.at);
      if (!dropFits(laid.layout, own, partner, area, { min: options.min, side: held.side }).ok) {
        const small = (r: Rect | undefined): boolean => !r || r.width < px(options.min) || r.height < px(options.min);
        return refused(held, { code: "fit", pane: small(laid.layout.get(own)) ? own : partner });
      }
    }
    return { ...laid, held, refusal: null, landing: laid.layout.get(own) ?? null, moved: movedIn(laid) };
  };

  // Remembered per held place: by kind (and side or index), then by `at`, so keys need no string form.
  const homeAfter = make({ kind: "home" });
  const memo = new Map<string, Map<K, TilingAfter<T, K>>>();
  const after = (held: TilingHeld<K>): TilingAfter<T, K> => {
    if (held.kind === "home") return homeAfter;
    const k = held.kind === "beside" ? `beside:${held.side}` : held.kind === "join" ? `join:${held.index ?? ""}` : "swap";
    let byAt = memo.get(k);
    if (!byAt) memo.set(k, (byAt = new Map()));
    let a = byAt.get(held.at);
    if (!a) byAt.set(held.at, (a = make(held)));
    return a;
  };

  return { subject, lift, base, home, after };
}
