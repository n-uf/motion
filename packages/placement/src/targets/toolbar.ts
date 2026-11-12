/**
 * Toolbar group targets: a host's insertion points (lines between groups, priority 2) and empty zones (priority 1),
 * and floating over the content (priority 3). A group's own place is home, never a target: its stretch comes back
 * in `own`, for the consumer to join to the drag's home.
 */
import { rect, type Point, type Rect } from "../geometry";
import { ZONES, floatGroup, insertGroup, insertions, isOwnPlace, layoutHost, vertical, withoutGroup, type Arrangement, type GroupSize, type HostId, type HostSpec, type Place } from "../toolbar";
import type { Target } from "./target";

/** How far a line's hit reaches beyond the host's thickness on each side; an empty zone's. */
export const LINE_REACH = 12;
export const ZONE_REACH = 4;

export interface ToolbarTarget<G extends string = string> extends Target {
  readonly label: string;
  readonly kind: "line" | "zone";
  readonly place: Place;
  /** It lands in a side edge's column. */
  readonly vertical: boolean;
  /** The insertion line (3 px, inset 4 px from the host's sides) in stage coordinates; for an empty zone, at its middle. */
  readonly line: Rect;
  /** The arrangement a drop here makes. */
  readonly arrangement: Arrangement<G>;
}

export interface HostTargetsInput<G extends string> {
  readonly group: G;
  /** The arrangement as it is, the group still in its place. */
  readonly arrangement: Arrangement<G>;
  readonly host: HostId;
  /** The host's top-left corner in stage coordinates. */
  readonly origin: Point;
  readonly spec: HostSpec;
  readonly size: GroupSize<G>;
  /** A group's name in the labels (default: its id). */
  readonly label?: (g: G) => string;
}

/** The targets a host offers a dragged group, zone by zone in order, and the stretches that are its own place. */
export function hostTargets<G extends string>(input: HostTargetsInput<G>): { targets: ToolbarTarget<G>[]; own: Rect[] } {
  const { group, arrangement: a, host: h, origin: o, spec } = input;
  const a0 = withoutGroup(a, group);
  const l = layoutHost(a0[h], h, spec, input.size, a0.collapsed);
  const v = vertical(h);
  const T = spec.thickness;
  const across = (s0: number, s1: number, reach: number): Rect => (v ? rect(o.x - reach, o.y + s0, T + 2 * reach, s1 - s0) : rect(o.x + s0, o.y - reach, s1 - s0, T + 2 * reach));
  const targets: ToolbarTarget<G>[] = [];
  const own: Rect[] = [];
  const pts = insertions(a0[h], h, spec, l, input.label).sort((p, q) => ZONES.indexOf(p.zone) - ZONES.indexOf(q.zone) || p.index - q.index);
  for (const p of pts) {
    const [s0, s1] = p.span;
    const place: Place = { host: h, zone: p.zone, index: p.index };
    if (isOwnPlace(a, group, place)) {
      own.push(across(s0, s1, LINE_REACH));
      continue;
    }
    targets.push({
      id: `g:${h}:${p.zone}:${p.index}`,
      priority: p.empty ? 1 : 2,
      hit: p.empty ? across(s0, s1, ZONE_REACH) : across(s0, s1, LINE_REACH),
      label: p.label,
      kind: p.empty ? "zone" : "line",
      place,
      vertical: v,
      line: v ? rect(o.x + 4, o.y + p.at - 1.5, T - 8, 3) : rect(o.x + p.at - 1.5, o.y + 4, 3, T - 8),
      arrangement: insertGroup(a, group, h, p.zone, p.index),
    });
  }
  return { targets, own };
}

export interface ToolbarFloatTarget<G extends string = string> extends Target {
  readonly label: string;
  readonly kind: "float";
  /** The group's top-left corner relative to the stage, and the arrangement, for a drop with the pointer at `p`. */
  readonly make: (p: Point, grab: Point) => Arrangement<G>;
}

/** Floating over the content (`stage`, in stage coordinates): the group's top-left corner kept on the stage. */
export function floatTarget<G extends string>(input: { readonly group: G; readonly arrangement: Arrangement<G>; readonly stage: Rect; readonly width: number; readonly height: number }): ToolbarFloatTarget<G> {
  const { group, arrangement, stage } = input;
  return {
    id: "g:float",
    priority: 3,
    free: true,
    hit: stage,
    label: "Float here",
    kind: "float",
    // Kept on the stage; a group larger than the stage keeps its top-left corner on the stage's.
    make: (p, grab) => {
      const x = Math.max(0, Math.min(p.x - grab.x - stage.x, stage.width - input.width));
      const y = Math.max(0, Math.min(p.y - grab.y - stage.y, stage.height - input.height));
      return floatGroup(arrangement, group, x, y);
    },
  };
}
