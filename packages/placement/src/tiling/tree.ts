/**
 * The shapes a tiling drag's two halves share: the host's tree as an adapter (`TilingTree`) with its stacks, parts and
 * subjects, a held place (`TilingHeld`) and the layout it gives (`TilingAfter`). The layout half (./drag) and the hit
 * half (./hit) both read them, so they live apart from either. Types only.
 * See docs/placement.md, Entry: tiling.
 */
import type { Rect } from "../geometry";
import type { Side } from "../side";
import type { SplitGeometry } from "./layout";
import type { Split } from "./split";

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
 * A part of a pane that takes a join, as the adapter declares it on the pane's rect (`TilingTree.parts`): a title bar,
 * a tab strip. `slots`, when given, are rects within it; the slot under the pointer gives the join's index: slot `i`
 * stands before the `i`-th member of the pane's stack in the tree the part was declared on (the pane itself when it
 * is alone). Over the part but no slot, the join has no index (the adapter's default: last).
 */
export interface TilingPart {
  readonly key: string;
  readonly rect: Rect;
  readonly slots?: readonly Rect[];
}

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
  /**
   * `tree` (the subject still in it) with the subject and the drawn pane `at` in each other's place.
   * - A pane subject and `at` each take the other's slot, in the split or in a stack. The swap moves `at` alone, never
   *   the stack it stands for: when `at` is a stack's drawn member, the subject takes its place in that stack (drawn,
   *   as `at` was) and the stack's other members stay; `at` goes to the subject's old slot (alone, or in the subject's
   *   stack, at its index, when the subject is a member torn out of one).
   * - A whole stack subject trades its drawn slot in the split with `at`'s; when `at` is a stack's drawn member, the
   *   two stacks trade places, each whole.
   */
  swap(tree: T, subject: TilingSubject<K>, at: K): T;
  /** The released tree with the subject joined to the drawn pane `at`'s stack (made one when `at` is alone), at `index` (default: last). Leave it out when the tree has no stacks: every join is refused `"join"`. */
  join?(released: T, subject: TilingSubject<K>, at: K, index?: number): T;
  /** Commit-time reconciliation: part of every `after` but home's, so what a frame draws is what a release stores. Default: none. */
  normalize?(tree: T): T;
  /**
   * The parts of the drawn pane `pane` that take a join (a title bar, a tab strip), laid on `rect`, its rect in `tree`
   * laid out: declared geometry, with any size the host measured once at the lift (a tab's width, by member). Read once
   * per drag by `TilingDrag.hit`. Leave it out when no pane has one: a join is then never under the pointer.
   */
  parts?(tree: T, pane: K, rect: Rect): readonly TilingPart[];
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
 * - `fit`: in the layout the release makes (a side, a swap or a join), `pane` (the subject's drawn key or `at`'s) is
 *   below `min` wide or high, the fit rule of `dropFits`. A swap hands each pane the other's rect, so either may fall
 *   below it; a join is judged on the stack's rect.
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
