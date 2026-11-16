/**
 * The filter a drop passes, and the context every generator shares: the scene now and with the item lifted, how a drop
 * settles, when a drop puts the item back (home), and filter (ii), whether a drop's layout fits the window.
 */
import { overlaps } from "../../geometry";
import { formMain } from "../../stack";
import { lift, prune } from "../changes";
import { axisOf, formsOf, zoneOf } from "../helpers";
import { ZONES, type Scene, type SceneItem, type SceneLayout, type SolveOptions } from "../model";
import { layKeys, solve } from "../solve";
import { reservedRect } from "./edges";
import type { Ctx, SceneAfter, SceneTargetOptions } from "./model";

/**
 * Where things are, without ages or the ids of dynamic columns: two scenes with one key place every item alike. An
 * edge's items count by zone (start, center, end), in their order within it: the list's order across zones places
 * nothing.
 */
function placeKey(s: Scene, id: string): string {
  const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
  const byZone = (items: readonly string[]): string[] => ZONES.flatMap((z) => items.filter((x) => zoneOf(s.items[x]) === z));
  return JSON.stringify({
    edges: s.edges.map((e) => JSON.stringify([e.side, e.ring, e.column === true ? "" : e.id, byZone(e.items), e.size ?? null])).sort(),
    floats: s.floats.map((f) => [f.id, f.rect, f.anchor ?? null, f.orient ?? null]),
    from: it?.from ?? 0,
    align: it?.align ?? "start",
  });
}

/**
 * Filter (ii), fit: a drop may not add an `overflow` or `too-wide` note anywhere, change a fixed item's form or least
 * length, nor lie over chrome or a fixed item's reserved rect (C29). Each edge adds where a drop on it lands (`lands`).
 */
function soundness(scene: Scene, base: SceneLayout, dragged: string): (after: SceneLayout) => boolean {
  const chrome = scene.chrome ?? [];
  const noteKey = (n: SceneLayout["notes"][number]): string | null => ("edge" in n && (n.code === "overflow" || n.code === "too-wide") ? `${n.edge}:${n.code}:${"id" in n ? n.id : ""}` : null);
  const hadNotes = new Set(base.notes.map(noteKey).filter((k): k is string => k !== null));
  return (after) => {
    if (after.notes.some((n) => { const k = noteKey(n); return k !== null && !hadNotes.has(k); })) return false;
    for (const [id, b] of Object.entries(base.items)) {
      if (!b.fixed) continue;
      const a = after.items[id];
      const e = a?.edge ? after.edges[a.edge] : undefined;
      if (!a || !e || a.form !== b.form || a.formKind !== b.formKind) return false;
      const f = formsOf(scene.items[id]!, axisOf(e.side))[a.form];
      const len = axisOf(e.side) === "column" ? a.rect.height : a.rect.width;
      if (f && len < formMain(f, "min", e.cross) - 0.5) return false;
    }
    const me = after.items[dragged];
    if (!me) return true;
    const fixedAfter = Object.entries(after.items).filter(([id, it]) => it.fixed && id !== dragged).map(([id]) => reservedRect(scene, after, id));
    return !chrome.some((c) => overlaps(me.rect, c)) && !fixedAfter.some((f) => overlaps(me.rect, f));
  };
}

/** A drag's context: null for an unknown, fixed or closed item (it has no targets). */
export function context(scene: Scene, dragged: string, options: SceneTargetOptions): { c: Ctx; item: SceneItem; prev: SolveOptions } | null {
  const item = Object.hasOwn(scene.items, dragged) ? scene.items[dragged] : undefined;
  if (!item || item.fixed || item.closed) return null;
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  const settle = (s: Scene): SceneAfter => ({ scene: s, layout: solve(s, prev) });
  const now = solve(scene, prev);
  const rest = lift(scene, dragged);
  const base = solve(rest, prev);
  // Every drop prunes the dynamic columns left empty: the place the item is in now counts without them too.
  const here = placeKey(prune(scene), dragged);
  const c: Ctx = {
    scene,
    rest,
    now,
    base,
    dragged,
    kind: item.kind,
    reach: Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0),
    settle,
    isHome: (r) => placeKey(r.scene, dragged) === here,
    sound: soundness(scene, base, dragged),
    lay: layKeys(scene),
  };
  return { c, item, prev };
}
