/**
 * The filter a drop passes, and the context every generator shares: the state now and with the item lifted, how a drop
 * settles, when a drop puts the item back (home), and filter (ii), whether a drop's layout fits the window.
 */
import { overlaps } from "@n-uf/placement";
import { formMain, itemSteps } from "@n-uf/placement/stack";
import { aimSlack } from "../aim";
import { grabOf, liftOf } from "../grab";
import { liftItem, prune } from "../changes";
import { axisOf, keepClearFor, formsOf, isHandFolded, withoutBarGrowth, zoneOf } from "../helpers";
import { ZONES, type DockEdge, type DockState, type DockItem, type DockLayout, type SolveOptions } from "../model";
import { layKeys, solve } from "../solve";
import { landedLayout, reservedRect, solveLanded } from "./edges";
import type { Ctx, DropResult, DockDropOptions } from "./model";

/**
 * Where things are, without ages or the ids of dynamic columns: two states with one key place every item alike. An
 * edge's items count by zone (start, center, end), in their order within it: the list's order across zones places
 * nothing.
 */
function placeKey(s: DockState, id: string): string {
  const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
  const byZone = (items: readonly string[]): string[] => ZONES.flatMap((z) => items.filter((x) => zoneOf(s.items[x]) === z));
  return JSON.stringify({
    edges: s.edges.map((e) => JSON.stringify([e.side, e.ring, e.column === true ? "" : e.id, byZone(e.items), e.size ?? null])).sort(),
    floats: s.floats.map((f) => [f.id, f.rect, f.anchor ?? null, f.orient ?? null]),
    folded: isHandFolded(s, id),
    align: it?.align ?? "start",
  });
}

/**
 * Filter (ii), fit: a drop may not add an `overflow` or `too-wide` note anywhere, change a fixed item's form (unless it
 * is `stepping`) or squeeze it under its least length (a growing one that takes no steps: its natural length; for target
 * room its `grows` caps there, so a drop beside it lands as beside a fixed item of that length), nor lie over chrome or a drawn fixed item's reserved rect. Each edge adds where a drop on it lands (`lands`).
 */
function soundness(state: DockState, base: DockLayout, dragged: string): (after: DockLayout) => boolean {
  const noteKey = (n: DockLayout["notes"][number]): string | null => ("edge" in n && (n.code === "overflow" || n.code === "too-wide") ? `${n.edge}:${n.code}:${"id" in n ? n.id : ""}` : null);
  const hadNotes = new Set(base.notes.map(noteKey).filter((k): k is string => k !== null));
  // The state's fixed keep-clear rects (no layout's anchored ones): once per drag.
  const chrome = keepClearFor(state, {}, "targets");
  return (after) => {
    if (after.notes.some((n) => { const k = noteKey(n); return k !== null && !hadNotes.has(k); })) return false;
    for (const [id, b] of Object.entries(base.items)) {
      if (!b.fixed) continue;
      const a = after.items[id];
      const e = a?.edge ? after.edges[a.edge] : undefined;
      if (!a || !e) return false;
      // A fixed item that takes steps (`stepping`) may step for a drop, into the » too; in a drawn form it keeps its least.
      const steps = itemSteps(state.items[id]!);
      if (!steps && (a.form !== b.form || a.formKind !== b.formKind)) return false;
      if (a.inMenu) continue;
      const f = formsOf(state.items[id]!, axisOf(e.side))[a.form];
      const len = axisOf(e.side) === "column" ? a.rect.height : a.rect.width;
      // The target room a fixed item takes: its least, or for one that grows and takes no steps (a title) its natural
      // length. Its growth is spare room, not owned room: it yields that to a landing, never its natural length.
      const holds = !steps && f?.main.grows === true;
      if (f && len < formMain(f, holds ? "natural" : "min", e.cross) - 0.5) return false;
    }
    const me = after.items[dragged];
    if (!me) return true;
    const fixedAfter = Object.entries(after.items).filter(([id, it]) => it.fixed && !(it.inMenu && itemSteps(state.items[id]!)) && id !== dragged).map(([id]) => reservedRect(state, after, id));
    // A drop's fit reads the keep-clear rects of its own layout (`after`): an anchored one lies where the drop puts it.
    // The fixed ones are the same in every layout: taken once, above.
    const onChrome = chrome.some((c) => overlaps(me.rect, c)) || (after.keepClear ?? []).some((c) => c.for !== "floats" && overlaps(me.rect, c.rect));
    return !onChrome && !fixedAfter.some((f) => overlaps(me.rect, f));
  };
}

/** The window as it lies with every movable grower on a bar at its natural length (`withoutBarGrowth`); `now` where none grows so. */
function roomOf(state: DockState, now: DockLayout, prev: SolveOptions): DockLayout {
  const plain = withoutBarGrowth(state);
  return plain === state ? now : solve(plain, prev);
}

/**
 * A drag's context: null for an unknown, fixed or closed item (it has no targets). `others`: edges kept out of `state`
 * (its hidden ones) that a drop's new column must not repeat the ids of.
 */
export function context(state: DockState, dragged: string, options: DockDropOptions, others: readonly DockEdge[] = []): { c: Ctx; item: DockItem; prev: SolveOptions } | null {
  const item = Object.hasOwn(state.items, dragged) ? state.items[dragged] : undefined;
  if (!item || item.fixed || item.closed) return null;
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  // A movable grower is drawn at its natural length in a drop's layout (`landedLayout`): it grows once placed.
  const settle = (s: DockState): DropResult => ({ state: s, layout: solveLanded(s, dragged, prev) });
  const now = solve(state, prev);
  const rest = liftItem(state, dragged);
  const base = solve(rest, prev);
  // Every drop prunes the dynamic columns left empty: the place the item is in now counts without them too.
  const here = placeKey(prune(state), dragged);
  // (Held, a movable grower is its natural length, as `lanes()` reads the grab: `landedLayout`.)
  const own = landedLayout(state, now, dragged, prev).items[dragged];
  const lift = liftOf(state, now, dragged, own?.rect);
  const c: Ctx = {
    state,
    others,
    rest,
    now,
    room: roomOf(state, now, prev),
    prev,
    base,
    dragged,
    kind: item.kind,
    reach: Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0),
    settle,
    isHome: (r) => placeKey(r.state, dragged) === here,
    sound: soundness(state, base, dragged),
    lay: layKeys(state),
    lift,
    grab: grabOf(lift, options.grab, options.onGrabNote),
    ...(own ? { own } : {}),
    slack: aimSlack(options.pitch),
    slideRanges: new Map(),
  };
  return { c, item, prev };
}
