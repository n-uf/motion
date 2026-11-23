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
 * The hit half, which place the pointer is over, is `hit(basis)`: built once per drag on one fixed layout (./hit).
 * See docs/placement.md, Entry: tiling.
 */
import { EPS, type Rect } from "../geometry";
import type { Side } from "../side";
import { canSplitPane, dropFits, type DropOptions } from "./drop";
import { createTilingHit, type TilingBasis, type TilingHit, type TilingHitOptions } from "./hit";
import { layoutSplitTree } from "./layout";
import { panesOf } from "./split";
import type { TilingAfter, TilingHeld, TilingLaidOut, TilingMove, TilingRefusal, TilingStack, TilingSubject, TilingTree } from "./tree";

export type { TilingAfter, TilingHeld, TilingLaidOut, TilingMove, TilingRefusal, TilingSize, TilingStack, TilingSubject, TilingTree } from "./tree";

/** What `tilingDrag` reads: the adapter, the stage, and the layout options (`SplitOptions` plus `min`, the least pane width and height a drop keeps). */
export interface TilingDragOptions<T, K> extends DropOptions<K> {
  readonly ops: TilingTree<T, K>;
  /** The stage the tree is laid out in, px. */
  readonly area: Rect;
  /** Panes that take no drop (a swap, a side or a join on one is refused `"still"`). Default: none. */
  readonly still?: (pane: K) => boolean;
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
  /**
   * The drag's hit half on `basis`, built now from that one layout and fixed for the drag: `"lift"` for a host that
   * draws marks over the lift, `"base"` for one that draws the held place's landed layout. Call it once, at the lift;
   * each call is a hit of its own, with its own hold.
   */
  hit(basis: TilingBasis, options?: TilingHitOptions<K>): TilingHit<T, K>;
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
 *
 * Throws when the subject is not in `tree` (neither drawn nor a member of a drawn stack): a drag has nothing to lift.
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
  const liftRect = lift.layout.get(drawnAs(tree, subjectKey));
  if (!liftRect) {
    const what = subject.kind === "pane" ? `pane ${String(subject.pane)}` : `stack ${subject.stack.id}`;
    throw new Error(`tilingDrag: the subject (${what}) is not in the tree: it is neither drawn nor a member of a drawn stack`);
  }
  const base = lay(ops.release(tree, subject));
  const takesPane = panesOf(ops.split(base.tree)).length < panesOf(ops.split(tree)).length;
  const home = takesPane ? { ...liftRect } : null;

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
    // The fit rule, on every change: in the layout it makes, the subject and `at` (each as it is drawn there) keep `min`.
    // `side` only words `dropFits`' reason, which is not read here.
    const partner = drawnAs(laid.tree, held.at);
    if (!dropFits(laid.layout, own, partner, area, { min: options.min, side: held.kind === "beside" ? held.side : "left" }).ok) {
      const small = (r: Rect | undefined): boolean => !r || r.width < px(options.min) || r.height < px(options.min);
      return refused(held, { code: "fit", pane: small(laid.layout.get(own)) ? own : partner });
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

  /** The tree a change makes, whatever room it has: `normalize(swap(tree))`, or `normalize(beside(release(tree)))`. */
  const changeOf = (held: { kind: "swap"; at: K } | { kind: "beside"; at: K; side: Side }): T =>
    normalize(held.kind === "swap" ? ops.swap(tree, subject, held.at) : ops.beside(base.tree, subject, held.at, held.side, { kind: "half" }));
  const hit = (basis: TilingBasis, hitOptions?: TilingHitOptions<K>): TilingHit<T, K> =>
    createTilingHit({ ops, lift, base, home, subjectKey, inSubject, ...(options.still ? { still: options.still } : {}), after, lay, changeOf }, basis, hitOptions);

  return { subject, lift, base, home, after, hit };
}
