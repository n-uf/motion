/**
 * Where folded columns go: the side's rail (each folded column's members as rail segments, in ring order) or, with
 * `handFold: "ride"`, title bars riding over the side's first open column.
 */
import { rect, type Rect } from "../../geometry";
import { fitStack, type StackFit, type StackForm, type StackInput } from "../../stack";
import { formsOf, railModeOf, zoneOf } from "../helpers";
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
      items[b.id] = { rect: at, hidden: b.f?.hides ?? [], kind: it.kind, form: b.form, formKind: b.f?.kind ?? "header", edge: c.edge.id, zone: zoneOf(it), rides: host.edge.id, folded: "hand" };
      y += b.h;
    }
    edges[c.edge.id] = { side: c.edge.side, ring: finite(c.edge.ring, 0), rect: rect(hr.x, y0, hr.width, y - y0), cross: 0, menu: null, tabs: [], stack: c.solved.stack, free: c.solved.free, rides: host.edge.id, folded: "hand" };
  }
}

/** Lays the side's rail at `railRect`: each railed column's members as segments, in zone order, ring by ring. */
export function layRail(d: Draft, side: "left" | "right", railRect: Rect, railed: readonly Col[], g: GiveWay): void {
  const { scene, items } = d;
  const segments: { id: string; edge: string; rect: Rect }[] = [];
  // In zone order, as each column itself shows them (start, center, end), ring by ring.
  const members = railed.flatMap((c) => zoneSorted(scene, c.visible).map((id) => ({ id, c })));
  const formsById = (id: string): readonly StackForm[] => formsOf(scene.items[id]!, "column");
  // An item's tile: its rail form that isn't a title (`StackForm.title`); its title, the rail form just before it.
  const tileOf = (id: string): number => formsById(id).findIndex((f) => f.kind === "rail" && f.title !== true);
  const titleOf = (id: string): number => {
    const t = tileOf(id);
    return t > 0 && formsById(id)[t - 1]!.kind === "rail" && formsById(id)[t - 1]!.title === true ? t - 1 : -1;
  };
  // With titles shown and offered, the segments are a stack along the rail: title then tile, by the ladder, and back in
  // exact reverse (`stack` carries the history). Every member needs a tile for that; otherwise each takes its tile.
  const titles = railModeOf(scene, side) === "titles" && members.some((m) => titleOf(m.id) >= 0) && members.every((m) => tileOf(m.id) >= 0);
  let fit: StackFit | undefined;
  if (titles) {
    const input: StackInput = {
      axis: "column",
      length: railRect.height,
      cross: { min: railRect.width, max: railRect.width, rail: railRect.width },
      titles: true,
      items: members.map(({ id }) => {
        const it = scene.items[id]!;
        const p = finite(it.priority ?? 0, 0);
        // Its rail forms only (no » menu in a rail strip); its priority adds to their ranks.
        const forms = formsById(id).slice(0, tileOf(id) + 1).map((f) => (p === 0 ? f : { ...f, rank: finite(f.rank ?? 0, 0) + p }));
        return { id, forms, used: finite(it.used, 0), ...(it.kept ? { kept: true } : {}), from: titleOf(id) >= 0 ? titleOf(id) : tileOf(id) };
      }),
    };
    // Solved afresh when a member or its column is `fresh`.
    const fresh = members.some((m) => d.fresh.has(m.id) || d.fresh.has(m.c.edge.id));
    const previous = d.previous && !fresh ? d.previous.rails[side]?.stack : undefined;
    fit = fitStack(input, previous ? { previous } : {});
  }
  const placed = new Map(fit?.items.map((p) => [p.id, p]) ?? []);
  let y = railRect.y;
  for (const { id, c } of members) {
    const it = scene.items[id]!;
    const forms = formsById(id);
    const ri = tileOf(id);
    const p = placed.get(id);
    const form = p ? p.form : ri >= 0 ? ri : Math.min(Math.max(0, Math.floor(finite(it.from, 0))), Math.max(0, forms.length - 1));
    const at = p ? rect(railRect.x, railRect.y + p.rect.y, railRect.width, p.rect.height) : rect(railRect.x, y, railRect.width, ri >= 0 ? px(forms[ri]!.main.natural) : railRect.width);
    const title = forms[form]?.title === true;
    items[id] = { rect: at, hidden: forms[form]?.hides ?? [], kind: it.kind, form, formKind: "rail", edge: c.edge.id, zone: zoneOf(it), rail: side, ...(title ? { railTitle: side } : {}), folded: g.auto.has(c) ? "auto" : "hand" };
    segments.push({ id, edge: c.edge.id, rect: at });
    y += at.height;
  }
  d.rails[side] = { rect: railRect, segments, ...(fit ? { stack: fit } : {}) };
}
