import type { Rect } from "./geometry";

/**
 * A drop target in the shape @n-uf/motion/drag takes: an id, a priority (1 most precise: a rail or a tab strip;
 * 2 a slot; 3 a broad area such as floating anywhere), the zone the pointer hits, and optionally where the item
 * lands, a label and whether it lands freely (no room is made for it). `hits`, when given, is the whole zone as several
 * rects (a zone that isn't one rect), `hit` the largest of them: the pointer is in the zone when it is in any of them.
 * It is a shape of places only: it carries no time and no timing (what a drag intent does as the pointer dwells in a
 * target's zone is the intent's own, and `@n-uf/docking`'s `DockDrop` carries the fields it reads).
 */
export interface Target {
  readonly id: string;
  readonly priority: 1 | 2 | 3;
  readonly hit: Rect;
  readonly hits?: readonly Rect[];
  readonly slot?: Rect;
  readonly label?: string;
  readonly free?: boolean;
  /**
   * A refusal, not a target: it takes part in the pick under the pointer, ranked after every target of priority 1 and 2
   * and before priority 3 (`@n-uf/motion/drag`'s `REFUSAL_RANK`, whatever its `priority`: the one pick rule's), but
   * nothing lands on it (`refusalTargets`).
   */
  readonly refuse?: true;
  /**
   * The drawn space the zone belongs to (the window's stage): the zone, and a drag intent's band and gap grace about
   * it, hold only points strictly inside it. The window's boundary belongs only to the targets drawn against it: the
   * docking model gives `bounds` to every refusal and to the float (whole-plane), never to a gap or a slot, so a pointer clamped
   * onto the window's edge picks a gap that reaches it, else nothing. That relies on the host clamping exactly onto the
   * stage's edge (`x + width`, `y + height`): a host that clamps to `width - 0.5` still picks inside the window.
   */
  readonly bounds?: Rect;
}
