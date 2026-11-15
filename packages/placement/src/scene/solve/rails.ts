/**
 * Where folded columns go: the side's rail (each folded column's members as rail segments, in ring order) or, with
 * `handFold: "ride"`, title bars riding over the side's first open column.
 */
import { rect, type Rect } from "../../geometry";
import type { StackForm } from "../../stack";
import { formsOf, zoneOf } from "../helpers";
import type { Col, GiveWay } from "./columns";
import type { Draft } from "./draft";
import { finite, px, zoneSorted } from "./order";

/** A riding column's bars: each member's folded form, in zone order. */
function riderBars(d: Draft, c: Col): { id: string; form: number; f: StackForm | undefined; h: number }[] {
  const { scene } = d;
  return zoneSorted(scene, c.visible).map((id) => {
    const forms = formsOf(scene.items[id]!, "column");
    const form = forms.length === 0 ? 0 : Math.min(Math.max(0, Math.floor(finite(scene.items[id]!.from, 0))), forms.length - 1);
    return { id, form, f: forms[form], h: px(forms[form]?.main.natural) };
  });
}

/** How tall the riders' bars are together: the room the host column leaves them on top. */
export const ridersHeight = (d: Draft, riders: readonly Col[]): number => riders.reduce((s, c) => s + riderBars(d, c).reduce((t, b) => t + b.h, 0), 0);

/** Lays the riders' bars over the host column `host` (laid already), from `top` down. */
export function layRiders(d: Draft, host: Col, riders: readonly Col[], top: number): void {
  const { scene, items, edges } = d;
  const hr = edges[host.edge.id]!.rect;
  let y = top;
  for (const c of riders) {
    const bars = riderBars(d, c);
    const y0 = y;
    for (const b of bars) {
      const at = rect(hr.x, y, hr.width, b.h);
      const it = scene.items[b.id]!;
      items[b.id] = { rect: at, kind: it.kind, form: b.form, formKind: b.f?.kind ?? "header", edge: c.edge.id, zone: zoneOf(it), rides: host.edge.id, folded: "hand" };
      y += b.h;
    }
    edges[c.edge.id] = { side: c.edge.side, ring: finite(c.edge.ring, 0), rect: rect(hr.x, y0, hr.width, y - y0), cross: 0, menu: null, tabs: [], stack: c.solved.stack, free: c.solved.free, rides: host.edge.id, folded: "hand" };
  }
}

/** Lays the side's rail at `railRect`: each railed column's members as segments, in zone order, ring by ring. */
export function layRail(d: Draft, side: "left" | "right", railRect: Rect, railed: readonly Col[], g: GiveWay): void {
  const { scene, items } = d;
  const segments: { id: string; edge: string; rect: Rect }[] = [];
  let y = railRect.y;
  for (const c of railed) {
    // In zone order, as the column itself shows them: start, center, end.
    for (const id of zoneSorted(scene, c.visible)) {
      const it = scene.items[id]!;
      const forms = formsOf(it, "column");
      const ri = forms.findIndex((f) => f.kind === "rail");
      const form = ri >= 0 ? ri : Math.min(Math.max(0, Math.floor(finite(it.from, 0))), Math.max(0, forms.length - 1));
      const h = ri >= 0 ? px(forms[ri]!.main.natural) : railRect.width;
      const at = rect(railRect.x, y, railRect.width, h);
      items[id] = { rect: at, kind: it.kind, form, formKind: "rail", edge: c.edge.id, zone: zoneOf(it), rail: side, folded: g.auto.has(c) ? "auto" : "hand" };
      segments.push({ id, edge: c.edge.id, rect: at });
      y += h;
    }
  }
  d.rails[side] = { rect: railRect, segments };
}
