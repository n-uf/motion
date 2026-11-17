/**
 * The column arrangers the desk constructions build on, internal to `./dock`: stacked columns at natural heights and
 * shares by minimum. The tiling they sit beside (master and stack, dwindle, the minimum-size give-way) is
 * `@n-uf/placement/tiling`'s.
 */

/**
 * Heights for a column of items stacked in `avail` with gaps: each at its minimum (its natural height), the last
 * taking the rest. When the minimums don't fit, an even share instead, so the ones that break their minimum show.
 */
export function columnHeights(avail: number, mins: readonly number[], gap: number): number[] {
  const room = avail - gap * (mins.length - 1);
  const need = mins.reduce((a, b) => a + b, 0);
  if (need > room) return mins.map(() => room / mins.length);
  return mins.map((m, i) => (i === mins.length - 1 ? room - need + m : m));
}

/**
 * Lengths for items sharing `avail`: each gets at least its minimum, the rest of the room is shared in proportion
 * to the minimums (when the minimums don't fit, each gets its minimum).
 */
export function share(avail: number, mins: readonly number[]): number[] {
  const need = mins.reduce((a, b) => a + b, 0);
  const spare = Math.max(0, avail - need);
  return mins.map((m) => m + (need > 0 ? (spare * m) / need : spare / mins.length));
}
