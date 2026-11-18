import type { Rect } from "./geometry";

/**
 * A drop target in the shape @n-uf/motion/drag takes: an id, a priority (1 most precise: a rail or a tab strip;
 * 2 a slot; 3 a broad area such as floating anywhere), the zone the pointer hits, and optionally where the item
 * lands, a label and whether it lands freely (no room is made for it). `hits`, when given, is the whole zone as several
 * rects (a zone that isn't one rect), `hit` the largest of them: the pointer is in the zone when it is in any of them.
 * `arm: "dwell"` marks a spring-loaded target (the drag intent arms it once the pointer dwells in it), `armedHit` its
 * zone once armed.
 */
export interface Target {
  readonly id: string;
  readonly priority: 1 | 2 | 3;
  readonly hit: Rect;
  readonly hits?: readonly Rect[];
  /** Spring-loaded: no target until the pointer dwells in it. */
  readonly arm?: "dwell";
  /** Its zone once armed (the strip grown by its magnet). */
  readonly armedHit?: Rect;
  readonly slot?: Rect;
  readonly label?: string;
  readonly free?: boolean;
  /**
   * A refusal, not a target: it takes part in the pick under the pointer, ranked after every target of priority 1 and 2
   * and before priority 3 (`REFUSAL_RANK`, whatever its `priority`), but nothing lands on it (`refusalTargets`).
   */
  readonly refuse?: true;
}

/**
 * Where a refusal ranks in the pick, on the scale of `priority` (the drag intent's `REFUSAL_RANK`): after every target
 * of priority 1 and 2, so a real target wins wherever the two meet or overlap, and before priority 3 (the float).
 */
export const REFUSAL_RANK = 2.5;

/** A target's rank in the pick: its `priority`, a refusal's {@link REFUSAL_RANK}. Lower wins. */
export const pickRank = (t: { readonly priority: number; readonly refuse?: true }): number => (t.refuse === true ? REFUSAL_RANK : t.priority);
