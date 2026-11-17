/**
 * A fixed item's targets. A fixed item never takes a gap; on an edge that `moves: "side"` (an anchor: page thumbnails)
 * it has one target, `side:<other side>`, over the place its edge takes on the other side of its axis, and its own
 * place is home.
 */
import { EPS, area, rect, subtract, type Rect } from "../../geometry";
import { setSide, use } from "../changes";
import { chromeFor } from "../helpers";
import type { Scene, Side } from "../model";
import { solve } from "../solve";
import { targetId } from "./ids";
import type { Generated, SceneAfter, SceneTarget, SceneTargetOptions } from "./model";

const OTHER: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };

/**
 * The anchor's targets. The `side:` target's hit is where its edge lies once moved (`setSide`, then `use`, solved): on
 * the other side the edge is the outermost, so it owns that place over the side's columns (the bars laid before the
 * sides already bound it), clear of the chrome. Its `after` is that drop, so the preview is the landing.
 */
export function anchorTargets(scene: Scene, dragged: string, options: SceneTargetOptions): Generated {
  const none: Generated = { targets: [], refusals: [], lost: [] };
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  const now = solve(scene, prev);
  const me = now.items[dragged];
  const edge = me?.edge ? scene.edges.find((e) => e.id === me.edge) : undefined;
  if (!me || !edge || edge.moves !== "side" || me.floating) return none;
  const homeAfter = (): SceneAfter => ({ scene, layout: now });
  const targets: SceneTarget[] = [];
  const side = OTHER[edge.side];
  const moved = use(setSide(scene, edge.id, side), dragged);
  const layout = solve(moved, prev);
  const placed = layout.edges[edge.id]?.rect;
  const slot = layout.items[dragged]?.rect;
  if (placed && slot && area(placed) > EPS) {
    const pieces = chromeFor(scene, "targets").reduce<Rect[]>((ps, c) => ps.flatMap((p) => subtract(p, rect(c.x, c.y, c.width, c.height))), [placed]).filter((p) => p.width >= 1 && p.height >= 1);
    if (pieces.length > 0) {
      const hit = pieces.reduce((a, p) => (area(p) > area(a) ? p : a));
      const result: SceneAfter = { scene: moved, layout };
      targets.push({ id: targetId({ kind: "side", side }), priority: 2, hit, ...(pieces.length > 1 ? { hits: pieces } : {}), slot, item: dragged, place: { kind: "side", edge: edge.id, side }, after: () => result });
    }
  }
  targets.push({ id: targetId({ kind: "home", item: dragged }), priority: 1, hit: me.rect, item: dragged, place: { kind: "home" }, after: homeAfter });
  return { targets, refusals: [], lost: [] };
}
