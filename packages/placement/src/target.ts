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
  /**
   * The drawn space the zone belongs to (the window's stage): the zone, and a drag intent's band and gap grace about
   * it, hold only points strictly inside it. The window's boundary belongs only to the targets drawn against it: the
   * scene gives `bounds` to every refusal and to the float (whole-plane), never to a gap or a slot, so a pointer clamped
   * onto the window's edge picks a gap that reaches it, else nothing. That relies on the host clamping exactly onto the
   * stage's edge (`x + width`, `y + height`): a host that clamps to `width - 0.5` still picks inside the window.
   */
  readonly bounds?: Rect;
  /**
   * Its room opens as it shows: the scene sets it on a target whose slot overlaps an item its drop moves (a rail pushing
   * a column, a new-column line, a bar's strip over the columns), and on a rail drop strip's targets, whose room opens
   * once armed. The drag intent then shows it and makes its room in one frame. Until it shows, a release still lands on
   * it.
   */
  readonly opensRoom?: true;
  /**
   * With `opensRoom`, how long it holds before it shows with its room, ms, in place of the drag intent's `roomAfter`. The
   * scene sets it to `EDGE_ROOM_HOLD` on a rail target or a new-column line against the window's left or right edge.
   */
  readonly roomHold?: number;
  /**
   * With `opensRoom`, the room as drawn once it is open, containing `hit`: while the target shows with its room open, a
   * drag intent holds it wherever the pointer is in this rect. The scene sets it on an empty edge's strip (a rail or a
   * bar not drawn yet): the strip's stretch along the edge, the edge's full depth after the drop across it. Not on a
   * new-column line, whose room is a whole column beside the other column's places, nor on a drawn edge's gap.
   */
  readonly roomHit?: Rect;
}

/**
 * Where a refusal ranks in the pick (the drag intent's `REFUSAL_RANK`, the same value): an ordering rank, not a
 * priority. Priorities stay the integers 1, 2 and 3; a refusal's tier is `refuse: true`, ordered by this rank on the
 * same scale: after every target of priority 1 and 2, so a real target wins wherever the two meet or overlap, and
 * before priority 3 (the float).
 */
export const REFUSAL_RANK = 2.5;

/** A target's rank in the pick: its `priority`, a refusal's {@link REFUSAL_RANK}. Lower wins. */
export const pickRank = (t: { readonly priority: number; readonly refuse?: true }): number => (t.refuse === true ? REFUSAL_RANK : t.priority);
