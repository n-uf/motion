/**
 * `solve(scene, { previous })`: the whole window's layout from one scene.
 *
 * 1. **The cut.** Reserved edges cut the stage from the outside in: first the full-span bars (top, then bottom, each
 *    by ring), across the stage's whole width; then the columns (left, then right, by ring), down the height the full
 *    bars left; then the `between` bars, across the width the columns left. What remains is `content`. Overlay edges
 *    are cut the same way from a copy of the content, so they lie over it without shortening it.
 * 2. **Each edge is a stack** (`fitStack`): a column along the height it gets, a bar along the width, with each item's
 *    `forms.column` or `forms.row`. Items are taken in zone order (start, center, end); `fixed` items keep their form;
 *    closed items take no room. In a column, group forms take their own width (`ownCross`). The edge's thickness is
 *    the stack's cross size; an edge with nothing in it takes none.
 * 3. **Rail and size.** A column in which nothing sets the width is a rail: its items with a `rail` form are re-solved
 *    in it and listed as `tabs` (closed ones too with `railShowsClosed`). Otherwise, with `Edge.size`, the column is
 *    re-solved at the user's size, clamped to `[max(cross.min, the widest open setter's cross.min), cross.max]`.
 * 4. **Zones.** When the items leave spare length (nothing grows), start items pack from the start, end items from the
 *    end (before the » entry) and center items sit centred on the edge's middle, moved only as far as they must to
 *    stay between the other two zones.
 * 5. **Floats** are fitted inside the stage, clear of every docked item (fixed ones and » entries included), every bar
 *    and the chrome rects (`fitFloat`). An anchored float sits flush with that side or corner of `content` first. A
 *    float with `from` over 0 is its bar: its form's natural length along its `orient`, its other size kept.
 *
 * 6. **Dynamic columns** (`Edge.column`, on a side with `Scene.rails[side]`): while the content is narrower than
 *    `contentMin.width` (after `inset` and a `gutter` after each side edge and rail), they shrink toward their minimum
 *    (the edge's `cross.min` and the widest open setter's), then fold whole into their side's one rail, unkept before
 *    kept, the oldest newest use first, the outer first, the left first. A column whose members are all folded by hand
 *    goes to the rail too, or with `handFold: "ride"` and one member it rides as a title bar over the side's first open
 *    column, at its width, taking none. The rail lies just outside the side's first column, its segments (each member's
 *    `rail` form) in ring order.
 *
 * `previous` (the layout before) gives each edge's fits to `fitStack` as `previous`, so a change of ages alone (a press)
 * changes no rect; columns folded or shrunk by give-way stay so while the content still fits, and room coming back
 * unfolds them in the reverse of give-way order. Pure: the same scene always lays out the same.
 *
 * The phases live in `./solve/`: `order` (the laying order), `edge` (one edge's stack), `draft` (drawing an edge),
 * `bars`, `insets`, `sides`, `columns` (give-way), `rails` (folded columns), `floats` and `notes`.
 */
import { rect } from "../geometry";
import type { Scene, SceneLayout, SolveOptions } from "./model";
import { cutEdge } from "./solve/bars";
import { createDraft } from "./solve/draft";
import { layFloats } from "./solve/floats";
import { insetOf, insideInset } from "./solve/insets";
import { contentNotes } from "./solve/notes";
import { finite, isSide, px } from "./solve/order";
import { laySides } from "./solve/sides";

export { layKeys, pushes, type LayKey } from "./solve/order";

export function solve(given: Scene, options: SolveOptions = {}): SceneLayout {
  const d = createDraft(given, options);
  const { scene, order } = d;
  const stage = rect(finite(scene.stage.x, 0), finite(scene.stage.y, 0), px(scene.stage.width), px(scene.stage.height));
  const { inset, docked } = insetOf(d);
  const reserved = order.filter((e) => e.mode !== "overlay");
  // A full top or bottom bar outside the inset lies at the window's edge, full width; the inset follows it.
  const outsideBar = (e: (typeof order)[number]): boolean => !isSide(e) && e.span !== "between" && e.outsideInset === true;
  let outer = stage;
  for (const e of reserved) if (outsideBar(e)) outer = cutEdge(d, e, outer, true);
  let area = insideInset(outer, inset);
  for (const e of reserved) if (!isSide(e) && e.span !== "between" && !outsideBar(e)) area = cutEdge(d, e, area, true);
  area = laySides(d, reserved.filter(isSide), area, { inset, gutter: px(scene.gutter), docked, outer });
  for (const e of reserved) if (!isSide(e) && e.span === "between") area = cutEdge(d, e, area, true);
  const content = area;
  let over = content;
  for (const e of order) if (e.mode === "overlay") over = cutEdge(d, e, over, true);
  contentNotes(d, content);
  const floats = layFloats(d, stage, content, inset);
  const { items, edges, rails, railPlaces, columnRoom, notes } = d;
  return { items, edges, content, floats, rails, railPlaces, ...(columnRoom !== undefined ? { columnRoom } : {}), notes };
}
