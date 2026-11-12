/**
 * Keyboard stops: every place a toolbar group can go, in one list in reading order, for the arrow keys and a
 * "Move to" menu alike. A consumer steps through the list; it never parses target ids.
 */
import { centre, type Point } from "../geometry";
import { HOST_LABEL, ZONES, zoneLabel, type Arrangement, type HostId, type Place } from "../toolbar";
import type { ToolbarFloatTarget, ToolbarTarget } from "./toolbar";

/** The hosts in reading order: the title bar, the top bar, the left edge, the right edge, the bottom bar. */
export const HOST_READING_ORDER: readonly HostId[] = ["title", "top", "left", "right", "bottom"];

export interface KeyboardStop<G extends string = string> {
  /** The target's id ("home" for the group's own place). */
  readonly id: string;
  readonly label: string;
  /** Where in a host it is; null for floating. */
  readonly place: Place | null;
  /** The arrangement a move here makes (the current one for home). */
  readonly arrangement: Arrangement<G>;
  /** The group's own place: where the keyboard starts, and a move there changes nothing. */
  readonly home: boolean;
}

export interface KeyboardStopsOptions<G extends string> {
  /** The group's own place, as a stop of its own in its reading-order position (the targets leave it out). */
  readonly home?: { readonly place: Place; readonly arrangement: Arrangement<G>; readonly label?: string };
  /**
   * Floating targets as stops at the end (default: left out). `at` is where the pointer would drop it and `grab`
   * where it holds the group (default: the float target's middle, the group's top-left corner).
   */
  readonly floats?: boolean | { readonly at: Point; readonly grab?: Point };
}

const isFloat = <G extends string>(t: ToolbarTarget<G> | ToolbarFloatTarget<G>): t is ToolbarFloatTarget<G> => t.kind === "float";

/** Reading order of a place: host, then zone, then index. */
const rank = (p: Place): number => HOST_READING_ORDER.indexOf(p.host) * 3000 + ZONES.indexOf(p.zone) * 1000 + p.index;

/**
 * The places a group can go, in reading order: hosts title → top → left → right → bottom, zones start → centre →
 * end, then each insertion point in order; the group's own place among them when `home` is given; floating targets
 * at the end only when `floats` asks for them. One list serves the arrow keys and a "Move to" menu.
 */
export function keyboardStops<G extends string>(targets: readonly (ToolbarTarget<G> | ToolbarFloatTarget<G>)[], options: KeyboardStopsOptions<G> = {}): KeyboardStop<G>[] {
  const placed: KeyboardStop<G>[] = [];
  const floating: KeyboardStop<G>[] = [];
  for (const t of targets) {
    if (!isFloat(t)) {
      placed.push({ id: t.id, label: t.label, place: t.place, arrangement: t.arrangement, home: false });
      continue;
    }
    if (!options.floats) continue;
    const at = options.floats === true ? centre(t.hit) : options.floats.at;
    const grab = options.floats === true ? { x: 0, y: 0 } : (options.floats.grab ?? { x: 0, y: 0 });
    floating.push({ id: t.id, label: t.label, place: null, arrangement: t.make(at, grab), home: false });
  }
  const h = options.home;
  if (h) placed.push({ id: "home", label: h.label ?? `${HOST_LABEL[h.place.host]} · ${zoneLabel(h.place.host, h.place.zone)} · current place`, place: h.place, arrangement: h.arrangement, home: true });
  placed.sort((a, b) => rank(a.place!) - rank(b.place!));
  return [...placed, ...floating];
}
