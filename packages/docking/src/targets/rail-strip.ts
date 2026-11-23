/**
 * The rail drop strips (`DockState.railDrop`): for a kind with a policy, each side whose rail can take it gets one drop
 * strip at the window's side, at the rail's width (`railStripWidth`), even while the rail is empty. Its targets,
 * `rail:<side>:<ring>`, are spring-loaded (`arm: "dwell"`), grow by `magnet` once armed (`armedHit`) and carry the
 * strip to draw (`strip`). The strip owns its rect: every other target and refusal of the drag gives it up (home's
 * too: an item alone in its column reaches its side's rail through the strip), so a drop there is the rail's once armed
 * and the float's before. A target the strip covers whole isn't offered: over the rail, the kind collapses into it.
 *
 * The side's rail is one concept: `DockState.rails[side]` where the state declares one (the strip split along it at its
 * stops, `railStops`), else the side's outermost column that takes the kind in its start zone (`railColumnOf`). The
 * strip means "collapse it at this side": its drop is `moveTo` that side's rail, landing wherever the state's hand fold
 * shows a collapsed panel there (a rail tile, a rider bar over the side's open column, a header in its column).
 */
import { EPS, overlaps, rect, subtract, type Point, type Rect } from "@n-uf/placement";
import { markUsed, moveAmong, type RailPlace } from "../changes";
import type { DockGrab } from "../grab";
import { isHandFolded, railColumnOf, railPolicyOf, zoneTakes } from "../helpers";
import { RAIL_STRIP_MIN } from "../model";
import { targetId, virtualEdgeId } from "./ids";
import type { Ctx, DropResult, DockRefusal, DockDrop } from "./model";
import { collapsesAt, railOuter, railStops } from "./virtual";

type Policy = NonNullable<ReturnType<typeof railPolicyOf>>;

/** One side's strip and its slots along it, each with its stretch and its drop. */
interface Strip {
  readonly side: "left" | "right";
  readonly rect: Rect;
  readonly slots: readonly { readonly id: string; readonly place: RailPlace; readonly along: readonly [number, number]; readonly result: DropResult }[];
}

/** The strip's x and width: `width` px from the side's outer boundary `outer`, inward. */
const across = (side: "left" | "right", outer: number, width: number): [number, number] => (side === "left" ? [outer, width] : [outer - width, width]);


/** A side with no declared rail: its rail column, the item docked in it collapsed (`moveTo` its rail). */
function columnStrip(c: Ctx, side: "left" | "right", policy: Policy): Strip | null {
  const edge = railColumnOf(c.state, side, c.kind);
  if (!edge) return null;
  const own = c.now.items[c.dragged];
  // Already collapsed in this column: every drop into it is home.
  if (own?.edge === edge.id && isHandFolded(c.state, c.dragged)) return null;
  const place: RailPlace = { kind: "rail", side, ring: edge.ring };
  const moved = moveAmong(c.state, c.dragged, place, c.others);
  if (moved === c.state) return null;
  const result = c.settle(markUsed(moved, c.dragged));
  const el = result.layout.edges[edge.id];
  if (!el || el.rect.width <= EPS || !collapsesAt(c, result, side)) return null;
  const r = el.rect;
  // The rail's width: the column's drawn as a rail (a tile there), else the width it takes as one.
  const railWidth = result.layout.items[c.dragged]!.tab ? r.width : (edge.cross.rail ?? 30);
  const [x, w] = across(side, side === "left" ? r.x : r.x + r.width, policy.railStripWidth ?? Math.max(RAIL_STRIP_MIN, railWidth));
  return { side, rect: rect(x, r.y, w, r.height), slots: [{ id: targetId({ kind: "rail", side, ring: edge.ring }), place, along: [r.y, r.y + r.height], result }] };
}

/** A side with a declared rail (`DockState.rails`): its stops (`railStops`), the strip split halfway between them. */
function declaredStrip(c: Ctx, side: "left" | "right", policy: Policy): Strip | null {
  const template = c.state.columns?.[side];
  const spec = c.state.rails?.[side];
  if (!template || !spec || !zoneTakes(template, "start", c.kind) || !spec.accepts.includes(c.kind)) return null;
  const stops = railStops(c, side);
  // A stop's drop collapses the item at this side wherever the state's `handFold` shows it (in the rail, or riding over
  // the side's open column): the strip means "collapse it here", whether a rail is drawn now or not.
  const slots = (stops?.slots ?? []).filter((s) => !s.home && s.place.kind === "rail" && collapsesAt(c, s.result, side)).sort((a, b) => a.line - b.line);
  if (!stops || slots.length === 0) return null;
  const a = Math.min(...stops.zones.map((z) => z.a));
  const b = Math.max(...stops.zones.map((z) => z.b));
  const drawn = c.now.rails[side];
  const outer = drawn && drawn.segments.length > 0 ? (side === "left" ? drawn.rect.x : drawn.rect.x + drawn.rect.width) : railOuter(c, side);
  const [x, w] = across(side, outer, policy.railStripWidth ?? Math.max(RAIL_STRIP_MIN, spec.width));
  const cuts = [a, ...slots.slice(1).map((s, i) => (slots[i]!.line + s.line) / 2), b];
  return {
    side,
    rect: rect(x, a, w, b - a),
    slots: slots.map((s, i) => ({ id: s.id, place: s.place as RailPlace, along: [cuts[i]!, cuts[i + 1]!] as const, result: s.result })),
  };
}

/** Pieces of `pieces` left once every strip is taken out; under 1 px either way is no piece. */
const outside = (pieces: readonly Rect[], strips: readonly Rect[]): Rect[] =>
  strips.reduce<Rect[]>((acc, s) => acc.flatMap((p) => (overlaps(p, s) ? subtract(p, s) : [p])), [...pieces]).filter((p) => p.width >= 1 && p.height >= 1);
const largest = (rs: readonly Rect[]): Rect => rs.reduce((m, r) => (r.width * r.height > m.width * m.height ? r : m));
const sameRects = (a: readonly Rect[], b: readonly Rect[]): boolean => a.length === b.length && a.every((r, i) => r.x === b[i]!.x && r.y === b[i]!.y && r.width === b[i]!.width && r.height === b[i]!.height);

/**
 * The drag's targets and refusals with the kind's rail drop strips laid over them (unchanged for a kind with no policy),
 * and the strips.
 */
export function withRailStrips(c: Ctx, targets: readonly DockDrop[], refusals: readonly DockRefusal[]): { targets: DockDrop[]; refusals: DockRefusal[]; strips: Rect[] } {
  // A strip means "collapse it at this side": under `foldedColumnDrop` no drop changes an item's state.
  const policy = c.state.foldedColumnDrop === "end" ? null : railPolicyOf(c.state, c.kind);
  const strips = policy ? (["left", "right"] as const).map((side) => (c.state.rails?.[side] ? declaredStrip(c, side, policy) : columnStrip(c, side, policy))).filter((s): s is Strip => s !== null) : [];
  if (!policy || strips.length === 0) return { targets: [...targets], refusals: [...refusals], strips: [] };
  const sides = new Set(strips.map((s) => s.side));
  const rects = strips.map((s) => s.rect);
  const out: DockDrop[] = [];
  /** The new-outermost-column lines moved inside a strip, by side: the inner columns' gaps there give them up. */
  const lines: { side: "left" | "right"; pieces: Rect[] }[] = [];
  for (const t of targets) {
    // The rail's own tiled stops give way to its strip.
    if (t.place.kind === "rail" && sides.has(t.place.side)) continue;
    if (t.free || t.place.kind === "none") {
      out.push(t.free && !policy.floatNearEdge ? clearOfStrips(t, c.dragged, rects) : t);
      continue;
    }
    const was = t.hits ?? [t.hit];
    const pieces = outside(was, rects);
    if (pieces.length === 0) {
      // An empty edge's drop strip under the rail's (an empty column, where the side's rail would be too), or the line for
      // a new outermost column on an occupied side (flush, the strip owns the window's edge), moves just inside it: the
      // rail lies outermost, the column opens from beside it, and the column's own gaps lie after.
      let moved = t.id.startsWith("strip:") || t.place.kind === "column" ? insideStrips(t.hit, strips) : null;
      let movedPieces: Rect[] = moved ? [moved] : [];
      if (moved && t.place.kind === "column") {
        // It keeps the band it owns: a column line beats the inner column it would push, card halves included (ranked
        // by the laying order of the new column it stands for). Moved inside the strip, it gives way only to home, a
        // blocked rect and the other column lines; the inner columns' gaps and refusals on its side give it up below
        // (`lines`), so it is never cut away.
        const others = targets.filter((x) => x !== t && (x.place.kind === "home" || x.place.kind === "column" || (x.place.kind === "none" && !x.free))).flatMap((x) => x.hits ?? [x.hit]);
        movedPieces = outside([moved], others);
        moved = movedPieces.length ? largest(movedPieces) : null;
        if (moved) lines.push({ side: t.place.side, pieces: movedPieces });
      }
      if (moved) out.push({ ...withoutHits(t), hit: moved, ...(movedPieces.length > 1 ? { hits: movedPieces } : {}) });
      continue;
    }
    if (sameRects(pieces, was)) {
      out.push(t);
      continue;
    }
    out.push({ ...withoutHits(t), hit: largest(pieces), ...(pieces.length > 1 ? { hits: pieces } : {}) });
  }
  // The inner columns' gaps (and refusals) on a moved line's side stop short of it: the line owns its band.
  const columnSide = (edge: string): "left" | "right" | null => {
    const e = c.state.edges.find((x) => x.id === edge);
    return e?.column && (e.side === "left" || e.side === "right") ? e.side : null;
  };
  const lineCut = (edge: string): Rect[] => lines.filter((l) => l.side === columnSide(edge)).flatMap((l) => l.pieces);
  for (let i = 0; i < out.length; i++) {
    const t = out[i]!;
    if (t.place.kind !== "gap") continue;
    const cut = lineCut(t.place.edge);
    if (!cut.length) continue;
    const was = t.hits ?? [t.hit];
    const pieces = outside(was, cut);
    if (sameRects(pieces, was)) continue;
    if (pieces.length === 0) out.splice(i--, 1);
    else out[i] = { ...withoutHits(t), hit: largest(pieces), ...(pieces.length > 1 ? { hits: pieces } : {}) };
  }
  const refused: DockRefusal[] = [];
  // The rail's own refusals go with its stops: the strip offers only the stops that take the drop.
  const railEdges = new Set([...sides].map((side) => virtualEdgeId("rail", side)));
  for (const r of refusals) {
    if (railEdges.has(r.edge)) continue;
    const was = r.hits ?? [r.hit];
    const pieces = outside(was, [...rects, ...lineCut(r.edge)]);
    if (!pieces.length || sameRects(pieces, was)) {
      if (pieces.length) refused.push(r);
      continue;
    }
    // A refusal in pieces (a wholly refused edge) keeps every piece of 1 px and more; any other keeps its largest.
    const kept = r.hits ? pieces.filter((p) => p.width >= 1 && p.height >= 1) : [largest(pieces)];
    const { hits: _h, ...one } = r;
    if (kept.length) refused.push({ ...one, hit: largest(kept), ...(kept.length > 1 ? { hits: kept } : {}) });
  }
  // A zone's refusals stay numbered by where they lie along the edge (then across it), as cut.
  const vertical = (r: DockRefusal): boolean => {
    const side = c.state.edges.find((e) => e.id === r.edge)?.side;
    // A virtual edge: the rail runs down, the column lines across.
    return side ? side === "left" || side === "right" : r.edge === virtualEdgeId("rail", "left") || r.edge === virtualEdgeId("rail", "right");
  };
  const pos = (r: DockRefusal): [number, number] => (vertical(r) ? [r.hit.y, r.hit.x] : [r.hit.x, r.hit.y]);
  const groups = new Map<string, DockRefusal[]>();
  for (const r of refused) groups.set(`${r.edge}\n${r.zone}`, [...(groups.get(`${r.edge}\n${r.zone}`) ?? []), r]);
  const numbered = new Map<DockRefusal, string>();
  for (const group of groups.values())
    group
      .sort((a, b) => pos(a)[0] - pos(b)[0] || pos(a)[1] - pos(b)[1])
      .forEach((r, n) => numbered.set(r, targetId({ kind: "refuse", edge: r.edge, zone: r.zone, n })));
  const renumbered = refused.map((r) => (numbered.get(r) === r.id ? r : { ...r, id: numbered.get(r)! }));
  for (const s of strips) {
    const grown = s.side === "left" ? rect(s.rect.x, s.rect.y, s.rect.width + policy.magnet, s.rect.height) : rect(s.rect.x - policy.magnet, s.rect.y, s.rect.width + policy.magnet, s.rect.height);
    for (const sl of s.slots) {
      const [a, b] = sl.along;
      const slot = sl.result.layout.items[c.dragged]!.rect;
      const result = sl.result;
      out.push({
        id: sl.id,
        priority: 1,
        hit: rect(s.rect.x, a, s.rect.width, b - a),
        armedHit: rect(grown.x, a, grown.width, b - a),
        arm: "dwell",
        // Armed, its room opens at once: a host that draws only a marker reads that from this one flag, as for any target.
        opensRoom: true,
        strip: s.rect,
        slot,
        item: c.dragged,
        place: sl.place,
        after: () => result,
      });
    }
  }
  return { targets: out, refusals: renumbered, strips: rects };
}

const withoutHits = (t: DockDrop): DockDrop => {
  const { hits: _pieces, ...rest } = t;
  return rest;
};

/** `r` moved inward just past the strip of its side that covers it, or null when none does. */
function insideStrips(r: Rect, strips: readonly Strip[]): Rect | null {
  const s = strips.find((x) => overlaps(x.rect, r));
  if (!s) return null;
  return s.side === "left" ? rect(s.rect.x + s.rect.width, r.y, r.width, r.height) : rect(s.rect.x - r.width, r.y, r.width, r.height);
}

/** The float target with its landing kept clear of every strip (`floatNearEdge: false`): pushed inward past it. */
function clearOfStrips(t: DockDrop, dragged: string, strips: readonly Rect[]): DockDrop {
  return {
    ...t,
    after(point: Point, grab?: DockGrab): DropResult {
      const first = t.after(point, grab);
      const at = first.layout.items[dragged]?.rect;
      if (!at) return first;
      let dx = 0;
      for (const s of strips) {
        const r = rect(at.x + dx, at.y, at.width, at.height);
        if (!overlaps(r, s)) continue;
        // A strip at the left pushes it right, one at the right pushes it left.
        dx += s.x + s.width / 2 < r.x + r.width / 2 ? s.x + s.width - r.x : s.x - (r.x + r.width);
      }
      // The pointer that puts the float's left edge where it lands, moved past the strips (the landing may be clamped):
      // the grab it landed with, in its own form.
      return dx === 0 ? first : t.after({ x: at.x + dx + (first.grab?.x ?? at.width / 2), y: point.y }, grab);
    },
  };
}
