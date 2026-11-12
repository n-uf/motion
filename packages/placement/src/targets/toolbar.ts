/**
 * Toolbar group targets: a host's insertion points (lines between groups, priority 2) and empty zones (priority 1),
 * and floating over the content (priority 3). A group's own place is home, never a target: its stretch comes back
 * in `own`, for the consumer to join to the drag's home. A place `allows` forbids is no target either.
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
  /** Where the group lands, in stage coordinates: its rect in the host once the drop is made. */
  readonly slot: Rect;
  /** The arrangement a drop here makes. */
  readonly arrangement: Arrangement<G>;
}

/** Where a group may go: a host's place, or floating. A place it may not go is no target. */
export type Allows<G extends string> = (group: G, place: Place | "float") => boolean;

export interface HostTargetsInput<G extends string> {
  readonly group: G;
  /** The arrangement as it is, the group still in its place. */
  readonly arrangement: Arrangement<G>;
  readonly host: HostId;
  /** The host's top-left corner in stage coordinates. */
  readonly origin: Point;
  readonly spec: HostSpec<G>;
  readonly size: GroupSize<G>;
  /** A group's name in the labels (default: its id). */
  readonly label?: (g: G) => string;
  /** Where the group may go (default: anywhere). A place it may not go is left out. */
  readonly allows?: Allows<G>;
  /**
   * Where this host is, and how long, once a drop has made `arrangement` (a host may grow or appear when it gets a
   * group); default: where it is now. The targets' `slot`s are laid out there.
   */
  readonly hostAfter?: (arrangement: Arrangement<G>) => { readonly origin: Point; readonly spec: HostSpec<G> };
}

/** The targets a host offers a dragged group, zone by zone in order, and the stretches that are its own place. */
export function hostTargets<G extends string>(input: HostTargetsInput<G>): { targets: ToolbarTarget<G>[]; own: Rect[] } {
  const { group, arrangement: a, host: h, origin: o, spec } = input;
  const slotIn = (after: Arrangement<G>): Rect => {
    const at = input.hostAfter?.(after) ?? { origin: o, spec };
    const r = layoutHost(after[h], h, at.spec, input.size, after.collapsed).slots.get(group)!;
    return rect(at.origin.x + r.x, at.origin.y + r.y, r.width, r.height);
  };
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
    if (input.allows && !input.allows(group, place)) continue;
    const after = insertGroup(a, group, h, p.zone, p.index);
    targets.push({
      id: `g:${h}:${p.zone}:${p.index}`,
      priority: p.empty ? 1 : 2,
      hit: p.empty ? across(s0, s1, ZONE_REACH) : across(s0, s1, LINE_REACH),
      label: p.label,
      kind: p.empty ? "zone" : "line",
      place,
      vertical: v,
      line: v ? rect(o.x + 4, o.y + p.at - 1.5, T - 8, 3) : rect(o.x + p.at - 1.5, o.y + 4, 3, T - 8),
      slot: slotIn(after),
      arrangement: after,
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

export interface FloatTargetInput<G extends string> {
  readonly group: G;
  readonly arrangement: Arrangement<G>;
  /** The content the group floats over, in stage coordinates. */
  readonly stage: Rect;
  /** The group's size as it floats. */
  readonly width: number;
  readonly height: number;
  /** Where the group may go (default: anywhere); asked with "float". */
  readonly allows?: Allows<G>;
}

/**
 * Floating over the content (`stage`, in stage coordinates): the group's top-left corner kept on the stage. Null
 * when `allows` says the group may not float.
 *
 * The input with an `allows` key comes first (it may give null); the one without it last, so a call without `allows`
 * is never null, and `ReturnType<typeof floatTarget>` is the non-null target as before `allows` existed. An input
 * typed `FloatTargetInput` (its `allows` optional) states it: `{ ...input, allows: input.allows }`.
 */
export function floatTarget<G extends string>(input: FloatTargetInput<G> & { readonly allows: Allows<G> | undefined }): ToolbarFloatTarget<G> | null;
export function floatTarget<G extends string>(input: Omit<FloatTargetInput<G>, "allows"> & { readonly allows?: undefined }): ToolbarFloatTarget<G>;
export function floatTarget<G extends string>(input: FloatTargetInput<G>): ToolbarFloatTarget<G> | null {
  const { group, arrangement, stage } = input;
  if (input.allows && !input.allows(group, "float")) return null;
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
