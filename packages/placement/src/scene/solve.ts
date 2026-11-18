/**
 * `solve(scene, { previous })`: the whole window's layout from one scene.
 *
 * 1. **The cut.** Reserved edges cut the stage from the outside in: first the full-span bars (top, then bottom, each
 *    by ring), across the stage's whole width; then the columns (left, then right, by ring), down the height the full
 *    bars left; then the `between` bars, across the width the columns left. What remains is `content`. Overlay edges
 *    are cut the same way from a copy of the content, so they lie over it without shortening it; an overlay bar
 *    with `span: "full"` set by name runs across the full bars' width, over the columns too, at the content's top or
 *    bottom.
 * 2. **Each edge is a stack** (`fitStack`): a column along the height it gets, a bar along the width, with each item's
 *    `forms.column` or `forms.row`. Items are taken in zone order (start, center, end); `fixed` items keep their form;
 *    closed items take no room. In a column, group forms take their own width (`ownCross`). The edge's thickness is
 *    the stack's cross size; an edge with nothing in it takes none.
 * 3. **Rail and size.** A column in which nothing sets the width is a rail: its items with a `rail` form are re-solved
 *    in it and listed as `tabs` (closed ones too with `railShowsClosed`). Otherwise, with `Edge.size`, the column is
 *    re-solved at the user's size, clamped to `[max(cross.min, the widest open setter's cross.min), cross.max]`.
 * 4. **Zones.** When the items leave spare length (nothing grows), start items pack from the start, end items from the
 *    end (before the » entry) and center items sit centered on the edge's middle, moved only as far as they must to
 *    stay between the other two zones.
 * 5. **Floats** are fitted inside the stage, clear of every docked item (fixed ones and » entries included), every bar
 *    and the chrome rects (`fitFloat`). An anchored float sits flush with that side or corner of `content` first, and
 *    keeps clear of every float with a rect of its own and of the anchored floats floated before it (`since`, then id)
 *    too, where room exists; the stacking order plays no part, so `raise` reshapes nothing. A
 *    float with `from` over 0 is its bar: its form's natural length along its `orient`, its other size kept.
 *
 * 6. **Dynamic columns** (`Edge.column`, on a side with `Scene.rails[side]`): while the content is narrower than
 *    `contentMin.width` (after `inset` and a `gutter` after each side edge and rail), they shrink toward their minimum
 *    (the edge's `cross.min` and the widest open setter's), then fold whole into their side's one rail, unkept before
 *    kept, the oldest newest use first, the outer first, the left first. A column whose members are all folded by hand
 *    goes to the rail too, or with `handFold: "ride"` and one member it rides as a title bar over the side's first open
 *    column, at its width, taking none. The rail lies just outside the side's first column, its segments (each member's
 *    `rail` form) in ring order.
 * 7. **Bars by height** (`Edge.giveWay` on a top or bottom bar): while the content is shorter than `contentMin.height`
 *    (overlay bars counted), those bars shrink across toward their minimum, then fold one by one to their items' next
 *    form that fits across; the scene is laid out again under the caps this gives each bar (`barGiveWay`).
 *
 * `previous` (the layout before) gives each edge's fits to `fitStack` as `previous`, so a change of ages alone (a press)
 * changes no rect; columns folded or shrunk by give-way stay so while the content still fits, and room coming back
 * unfolds them in the reverse of give-way order. Pure: the same scene always lays out the same.
 *
 * The phases live in `./solve/`: `order` (the laying order), `edge` (one edge's stack), `draft` (drawing an edge),
 * `bars`, `bar-giveway` (bars by height), `insets`, `sides`, `columns` (give-way), `rails` (folded columns), `floats`
 * and `notes`.
 */
import { rect, type Rect } from "../geometry";
import { viewOf } from "./helpers";
import { checkEdgeIds } from "./targets/ids";
import type { Scene, SceneLayout, SceneNote, SolveOptions } from "./model";
import { barGiveWay } from "./solve/bar-giveway";
import { cutEdge } from "./solve/bars";
import { createDraft } from "./solve/draft";
import { layFloats } from "./solve/floats";
import { insetOf, insideInset } from "./solve/insets";
import { contentNotes } from "./solve/notes";
import { finite, isSide, px } from "./solve/order";
import { laySides } from "./solve/sides";

export { layKeys, pushes, type LayKey } from "./solve/order";

export function solve(given: Scene, options: SolveOptions = {}): SceneLayout {
  checkEdgeIds(given);
  // A hidden edge is not part of the window: the layout is the shown scene's, its items placed nowhere, or in the edge
  // its `showIn` names.
  const { view: shown, ignored } = viewOf(given);
  const lay = (caps: ReadonlyMap<string, number>, gave: readonly SceneNote[] = []): SceneLayout => layOut(shown, options, caps, gave);
  const first = lay(new Map());
  const way = barGiveWay(shown, first, lay);
  const l = way ? lay(way.caps, way.notes) : first;
  return ignored.length === 0 ? l : { ...l, notes: [...l.notes, ...ignored.map((edge): SceneNote => ({ code: "show-in-ignored", edge }))] };
}

/** `area`'s top and height on `over`'s left and width. */
const withHeightOf = (area: Rect, over: Rect): Rect => rect(over.x, area.y, over.width, area.height);

/** One pass of the layout under height give-way's `caps`, its notes (`gave`) before the content's. */
function layOut(given: Scene, options: SolveOptions, caps: ReadonlyMap<string, number>, gave: readonly SceneNote[]): SceneLayout {
  const d = createDraft(given, options, caps);
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
  // The width the full bars run across, before the columns: an overlay bar with `span: "full"` lies over the columns too.
  const wide = area;
  area = laySides(d, reserved.filter(isSide), area, { inset, gutter: px(scene.gutter), docked, outer });
  for (const e of reserved) if (!isSide(e) && e.span === "between") area = cutEdge(d, e, area, true);
  const content = area;
  let over = content;
  for (const e of order) {
    if (e.mode !== "overlay") continue;
    // An overlay bar lies over the content unless it asks for the full width by name: one with no `span` keeps the
    // content's width, as it always has.
    if (isSide(e) || e.span !== "full") over = cutEdge(d, e, over, true);
    // `span: "full"`: across the full bars' width (the window's, with `outsideInset`), over the content's height left so
    // far.
    else {
      const across = e.outsideInset === true ? outer : wide;
      over = withHeightOf(cutEdge(d, e, rect(across.x, over.y, across.width, over.height), true), over);
    }
  }
  for (const n of gave) {
    d.notes.push(n);
    if (n.code === "bar-shrunk" && d.edges[n.edge]) d.edges[n.edge] = { ...d.edges[n.edge]!, shrunk: true };
  }
  contentNotes(d, content);
  const floats = layFloats(d, stage, content, inset);
  const { items, edges, rails, railPlaces, columnRoom, notes } = d;
  return { items, edges, content, floats, rails, railPlaces, ...(columnRoom !== undefined ? { columnRoom } : {}), notes };
}
