/**
 * The inset: the space kept clear inside the stage's edges, or none with `insetWhen: "docked"` while no panel is docked
 * beside the content. `Frame` carries it, with the gutter and the area the outside bars leave, to the side phase.
 */
import { EPS, rect, type Rect } from "@n-uf/placement";
import { isDockingPanel } from "../helpers";
import type { DockState } from "../model";
import type { Draft } from "./draft";
import { isSide, px } from "./order";

export type Inset = NonNullable<DockState["inset"]>;

/** What the side phase reads of the window around it. */
export interface Frame {
  /** The inset in force. */
  readonly inset: Inset;
  /** The space after each side edge and rail that takes room. */
  readonly gutter: number;
  /** Whether a panel is docked beside the content (`insetWhen: "docked"`). */
  readonly docked: boolean;
  /** The stage less the full bars outside the inset. */
  readonly outer: Rect;
}

/**
 * The inset, or none with `insetWhen: "docked"` while nothing is docked beside the content: only a panel counts, in a
 * column or a rail (an item there, not closed, whose first column form is a panel's: open, header or rail). Bars,
 * toolbar groups and an anchor (it takes nothing) never do, wherever they sit.
 */
export function insetOf(d: Draft): { inset: Inset; docked: boolean } {
  const { state } = d;
  const docked = d.order.some((e) => isSide(e) && e.accepts.length > 0 && d.owned.get(e)!.some((id) => isDockingPanel(state.items[id]!)));
  const inset = state.insetWhen === "docked" && !docked ? {} : (state.inset ?? {});
  return { inset, docked };
}

/** `outer` less the inset on every side. */
export const insideInset = (outer: Rect, inset: Inset): Rect =>
  rect(outer.x + px(inset.left), outer.y + px(inset.top), Math.max(0, outer.width - px(inset.left) - px(inset.right)), Math.max(0, outer.height - px(inset.top) - px(inset.bottom)));

/**
 * How far an edge outside the inset (an anchor) runs into the inset above and below `area`, where no reserved bar lies
 * on that side (a bar there keeps it below or above the bar). Outside bars lie beyond the inset already: measured from
 * what they leave.
 */
export function insetReach(area: Rect, f: Frame): { up: number; down: number } {
  const up = area.y <= f.outer.y + px(f.inset.top) + EPS ? px(f.inset.top) : 0;
  const down = area.y + area.height >= f.outer.y + f.outer.height - px(f.inset.bottom) - EPS ? px(f.inset.bottom) : 0;
  return { up, down };
}
