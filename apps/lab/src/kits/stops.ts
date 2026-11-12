/**
 * The keyboard stops of a toolbar group, in one order shared by the arrow keys and "Move to ›": hosts title → top →
 * left → right → bottom, zones start → centre → end, each insertion point in order.
 *
 * Interim: placement's `keyboardStops(targets)` replaces this once it is on live, and this file goes.
 */
import type { HostId, Place, ZoneId } from "@n-uf/placement/toolbar";

const HOST_ORDER: readonly HostId[] = ["title", "top", "left", "right", "bottom"];
const ZONE_ORDER: readonly ZoneId[] = ["start", "center", "end"];

/** A place's rank in the keyboard order. */
export const placeKey = (p: Place): number => (HOST_ORDER.indexOf(p.host) * ZONE_ORDER.length + ZONE_ORDER.indexOf(p.zone)) * 1000 + p.index;

/** Docked targets in keyboard order. */
export function keyboardOrder<T extends { readonly place: Place }>(targets: readonly T[]): T[] {
  return [...targets].sort((a, b) => placeKey(a.place) - placeKey(b.place));
}
