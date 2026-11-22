# @n-uf/docking: reference

The behavior of `@n-uf/docking`, entry by entry: rules, ids, options and longer examples. The reference covers behavior; the exported types are the contract. The [package README](../packages/docking/README.md) is the short tour; the [design page](./docking.md) has the concept, the parts and the rules a consumer relies on. The general layer it stands on (the edge fit, the form vocabulary, the edge cut and the float fit) is `@n-uf/placement` ([placement-reference.md](./placement-reference.md)).

State in, rects and drop targets out. Pure functions over plain data: no DOM, no framework, no motion; one dependency, `@n-uf/placement`. Rendering stays in the app: it draws the rects, measures its groups, and feeds pointer samples to a drag intent.

The sibling `@n-uf/motion` owns how things move. The two compose without importing each other: a target list from `@n-uf/docking` is the shape `@n-uf/motion/drag`'s drag intent takes, and a rect from any layout here is what `@n-uf/motion/layout` glides to.

## Contents

- [The dock state](#the-dock-state-n-ufdocking): one model of a whole window; solve, changes, targets, refusals, lanes, storage
- [Testing](#testing-n-ufdockingtesting): conformance rows and the landing rows, with their runners

## The dock state (`@n-uf/docking`)

`@n-uf/docking` holds a whole window in one model, so every rule that spans it (kinds, rects kept clear, fixed room,
preview equals result) has one owner. A `DockState` is the stage (the window's inner rect), its `edges`, the `items`
(each with a host `kind`, its forms along a column and along a row from `@n-uf/placement/stack`, its age, and its
flags), the `floats` and the `keepClear` rects they keep clear of. `solve(state)` gives every rect the host draws;
`targets(state, id)` gives every drop target for one item. Nothing is module-global, so two windows on a page are two
dock states.

A `keepClear` entry (`KeepClear`, the window's chrome) is a rect with a scope. By default (`for: "all"`) floats keep clear of it and no drop
target, slot or landing lies on it (a title the host draws itself). With `for: "floats"` only floats keep clear of it,
in every way they are placed (a drop, opening one, a window resize, a resize by hand), while the edges, give-way and
every docked target ignore it: a spine the host draws over a column keeps the column's gaps, lines and rail.

An entry can instead be anchored to a region of the layout (`AnchoredKeepClear`): `{ region: "content", side, size,
for, id? }` is `size` px deep at that side of `DockLayout.content` (what the cut leaves for the pages, not `lanes()`'
float content), along its whole length, clamped to it; an empty content gives no rect. Use it for what moves with the
content, such as a 24 px overlay strip at the content's right edge: a drop that opens or closes a column moves the
content, and the strip with it. A fixed rect stays right for what truly lies in stage px. The rule behind it: no input
of a solve comes from that solve's own output. So `solve` resolves every anchored entry once, after the edges and the
content are final and before the floats, and writes them to `DockLayout.keepClear` (`DockKeepClearLayout`: `rect`,
`for`, `id`), in the state's order; a host draws the strip from there. A layout has `keepClear` only when its state
declares an anchored entry, so a state with fixed rects only lays out exactly as before. Nothing that sizes the content
(the cut, the edges, give-way) reads keep-clear rects. Each reader takes them from the layout it names: the hits a drag
shows (targets, their least hits, an anchor's side target, the lanes' blocked regions) and a float resize by hand from
the layout on screen; a drop's fit (no landing on chrome) and its floats from the drop's own `after` layout, so a float
dropped as a column closes lands clear of the strip where the commit draws it, and its marker is that rect. A guide
predicted in another layout (an empty lane drawn in the layout that creates it, a Near lane the screen doesn't draw)
keeps the largest piece of each mark clear of the anchored rects of the layout on screen; `for: "floats"` rects never
cut a lane's guide. With `minRegion: { width?, height? }` the entry applies only while its region as solved is at
least that size: under either bound it is inactive, keeps nothing clear and is absent from `DockLayout.keepClear`
(absent, not flagged), so a host draws its overlay exactly when the entry is there; a drop that opens a column and
takes the content under the bound has no entry in its `after`. Like `pushable`, the entry is a declaration: `readDockState` takes it from `base`, `storeDockState`
never writes it.

```ts
import { readDockState, solve, storeDockState, targets, type DockItem, type DockState } from "@n-uf/docking";
import type { StackForm } from "@n-uf/placement/stack";

const f = (kind: StackForm["kind"], min: number, natural: number, cross: number, more: Partial<StackForm> = {}): StackForm => ({ kind, main: { min, natural }, cross: { natural: cross }, ...more });
const panel = (id: string, used: number): DockItem => ({
  id, kind: "panel", used,
  forms: { column: [f("open", 120, 240, 260, { main: { min: 120, natural: 240, grows: true }, cross: { natural: 260, min: 180 } }), f("header", 28, 28, 260, { cross: { natural: 260, min: 60 } }), f("rail", 28, 28, 30), f("menu", 0, 0, 0)] },
});
const group = (id: string, used: number, align?: "end"): DockItem => ({
  id, kind: "group", used, ...(align ? { align } : {}),
  forms: { row: [f("row", 180, 200, 28), f("icons", 84, 84, 28), f("menu", 0, 0, 0)], column: [f("stacked", 96, 96, 84), f("icons", 84, 84, 28), f("menu", 0, 0, 0)] },
});
const fixed = (id: string, kind: string, form: StackForm, align?: "center" | "end"): DockItem => ({ id, kind, used: 0, fixed: true, forms: { row: [form] }, ...(align ? { align } : {}) });
const bar = { accepts: ["group"], cross: { min: 36, max: 36, rail: 36 }, gap: 4, pad: { start: 8, end: 8 } };
const column = { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } };
const items = [
  fixed("title", "title", f("row", 80, 160, 32, { main: { min: 80, natural: 160, grows: true } })),
  fixed("controls", "controls", f("row", 84, 84, 32), "end"),
  fixed("readout", "readout", f("row", 72, 72, 28), "center"),
  panel("pages", 1), panel("findings", 2), panel("notes", 3),
  group("views", 4), group("tools", 5), group("zoom", 6, "end"), group("search", 7, "end"), group("marks", 8),
];
const state: DockState = {
  stage: { x: 0, y: 0, width: 1200, height: 800 },
  edges: [
    { id: "titlebar", side: "top", ring: 0, accepts: ["group"], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } },
    { id: "toolbar", side: "top", ring: 1, items: ["views", "tools", "zoom"], ...bar },
    { id: "status", side: "bottom", ring: 0, span: "between", items: ["readout", "search"], ...bar, cross: { min: 28, max: 28, rail: 28 } },
    { id: "left", side: "left", ring: 0, items: ["pages"], ...column },
    { id: "right", side: "right", ring: 0, items: ["findings", "marks"], ...column },
  ],
  items: Object.fromEntries(items.map((it) => [it.id, it])),
  floats: [{ id: "notes", rect: { x: 500, y: 200, width: 280, height: 320 } }],
  floatKinds: ["panel", "group"],
};
const layout = solve(state);
console.log(layout.content); // { x: 260, y: 68, width: 680, height: 704 }
console.log(layout.items.title!.rect.width, layout.items.controls!.rect.x, layout.items.marks!.rect.width); // 1116 1116 84
const drops = targets(state, "views", { previous: layout });
console.log(drops.filter((t) => t.id.startsWith("gap:status")).map((t) => t.id)); // [ 'gap:status:start:0' ]
const drop = drops.find((t) => t.id === "gap:right:start:2")!.after({ x: 0, y: 0 });
console.log(JSON.stringify(solve(drop.state, { previous: layout })) === JSON.stringify(drop.layout)); // true
console.log(readDockState(JSON.parse(JSON.stringify(storeDockState(drop.state))), state).dropped); // []
```

**The cut.** Reserved edges cut the stage from the outside in: the full bars first (top then bottom, each by `ring`,
0 outermost), across the whole width; then the columns (left then right, by ring), down the height the full bars
leave; then the `span: "between"` bars, across the width the columns leave. What remains is `layout.content`. Edges
with `mode: "overlay"` are cut the same way from a copy of the content: they lie over it and leave it as it is. An overlay
bar that sets `span: "full"` by name runs across the full bars' width instead (the window's whole width with
`outsideInset`), over the side columns too, at the
content's top or bottom; one with `span: "between"`, or with no `span`, lies over the content only. An edge
with nothing drawn in it takes no room.

**Hidden edges.** `DockEdge.hidden: true` keeps an edge and its items in the state but out of the window: a bar the host
doesn't draw, a rail it has turned off. It is view state: the host decides it each time it builds the state (from the
window's width, say). It takes no room, and everything else lays out exactly as if it and its items were not in the
state: `solve` leaves it and its items out of the layout (no `edges[id]`, no `items[id]`, as for an item placed
nowhere), and they take no part in give-way or folds. It has no targets and no refusals for any kind and no keyboard
stops; its items have none either. A drop elsewhere keeps the hidden edge as it was, and one that commits nothing (home,
a blocked rect) gives back the state itself. `moveTo` into it is refused, as into an edge that doesn't take the kind.
`storeDockState` keeps its items like any edge's but never writes `hidden`; `readDockState` takes `hidden` from `base` only
(a stored one is ignored and listed as `edge:<id>:hidden`). A column a drop makes never takes a hidden edge's id, and
where a drop makes or removes a column on its side, the side is numbered again from 0 with the hidden edge back where its
ring put it in the order. Side columns, rails and bars alike.

**Showing a hidden edge's items elsewhere.** A hidden edge with `DockEdge.showIn` (the id of another, static edge) lends
its items to that edge: a rail turned off on a narrow window whose panels show in the column beside it, say. Like `hidden`, it
comes from `base` and is never stored. The lent items lay out, target and stop as if they sat at the end of that edge,
after its own items: `solve` draws them there (the hidden edge itself stays out of the layout), and a drag of one gets
exactly the targets, refusals, stops and release layouts it would get there. The stored state keeps them in the hidden
edge: the home target, or one that commits nothing, gives back the state itself; a drop that moves one for real takes
it out of the hidden edge, to the drop's place; a drop of another item never moves them out. Shown again
(`hidden: false`), the hidden edge holds every item no drop moved. An item is lent only where that edge takes its kind
(`edgeTakes`), in its own zone where the edge takes it there, else in the first zone that does; fixed items are never
lent, and one that isn't stays as in a hidden edge (drawn nowhere, no targets). A moved item keeps its stored zone
(`align`), not the one it was shown in, unless the drop names a zone (a gap in an edge). `canFold`, `foldItem` and the
hand fold read a lent item along the edge it is drawn in. A `showIn` that names the edge itself, no edge, another
hidden edge or a dynamic column (`column: true`) is ignored, and `solve` lists it in `notes` as `show-in-ignored`:
drops make and delete dynamic columns, so they never hold lent items, and a lent item never vanishes because another
drop emptied the column it showed in.

**Each edge is a stack.** Left and right edges are columns (`forms.column`), top and bottom ones bars (`forms.row`),
each solved by `fitStack` along the length it gets, with `gap`, `pad` and `menu` passed through, its cross limits never
wider than the room the cut leaves. Group forms in a column take their own width (`ownCross`); open panels and headers
span it. Spare room goes to the forms that grow, so a column's open panels share its height through `grows` and equal
naturals. A column where nothing sets the width is a rail: its items that have a `rail` form take it and are listed in
`edges[id].tabs` (with `railShowsClosed`, closed items too, marked `closed`); the host draws tabs only from the layout.
`edges[id].items` lists the ids the layout draws for the edge in its stack order: the zones in order (start, center,
end), then the order within each zone. An item in the » menu keeps its place (`menu.items` names those), a rail tab is
listed, a closed item is left out, and a column folded into its rail or riding lists its members in zone order. A host
that needs the order reads it here instead of sorting rects (`stack.items` is the solver's own, in stack-local px).

**Why an item is folded.** `DockItemLayout.foldedBy` says whether the user folded an item or it gave way, from the dock
state and never from rects: `"hand"` when the item's `from` is over 0 (`foldItem` sets it), whatever else gave way after;
`"auto"` when it gave way, a form below the one it started in, by length or width (a header, an icons form, a » menu
entry, a rail segment of a column folded by give-way). It is absent for an item in its first form, a closed one, and
the form an icons-only edge gives its items; a float is only ever `"hand"`. A host shows "Expand" for `"hand"` only, since
unfolding an item that gave way is not the user's to do. `folded` still names the item's column.

**Rail titles.** A panel may declare two rail forms: its title (`{ kind: "rail", title: true }`, its `main` the length
of its name and count turned along the rail, measured by the host) and then its tile (a plain `rail` form). In a rail
they are two steps on its ladder: while the rail's length fits every title, each item shows its title; when it runs
short, titles step down to tiles by the usual rules (priority, then the least recently used item) and come back in exact
reverse as room returns (`StackFit.steps`). That holds for a column drawn as a rail and for a side's rail strip
(`layout.rails[side]`, whose fit is `rails[side].stack`). Each side has a mode, `state.railModes[side]`: `"titles"`
(the default) or `"icons"`, which passes title forms over so every item shows its tile; `setRailMode(state, side,
mode)` changes it, `railModeOf(state, side)` reads it (`RAIL_MODES` lists the modes), and `storeDockState` / `readDockState` keep it. A title form is offered nowhere else (a stack offers it only
with `StackInput.titles`), and an item with no title form shows its tile in either mode, so a host that hasn't measured
titles sees no change. An item drawn in its title reports `railTitle: "left" | "right"`; the host turns it to read
toward the content: on the left bottom to top (−90°), on the right top to bottom (+90°), the count at the title's end.
Hits, clicks, drags and `after()` work as for the tile, at the title's length.
`DockEdge.size` is the user's size across, clamped to the widest open setter's `cross.min` (and the edge's `cross.min`) at
least and `cross.max` at most; `resizeEdge` sets it.

**Zones.** An item's `align` (`start`, the default, `center` or `end`) is its zone, a fact of the item, not of the
edge it lies in. It lies in that zone where its edge takes its kind there (`DockEdge.zoneAccepts`), else in the first zone
that does (`zoneIn`, one rule for every edge and for the items a hidden edge lends through `showIn`); its stored
`align` stays as it was, so it is back in its own zone on an edge that takes it there. A move sets `align` only when the
drop names a zone: a gap in a zone, a zone's slot, `moveTo` with `zone`, on an edge that offers a choice (`namesZone`:
more than one of its zones takes the kind). On a one-zone edge, such as a rail that takes groups at its start only, the
zone a drop gives is no choice: the item docks there and keeps its own, so a group from a bar's end zone moved onto
that rail goes back to the bar's end zone when the rail is hidden and lends it back (`showIn`), or when it is moved
there with no zone. An edge with no `zoneAccepts` takes every kind in every zone, so it offers the choice; declaring
`zoneAccepts: { start: [kind] }` makes it a one-zone edge for that kind, which also removes its center and end gaps for
the kind and refuses those thirds (`not-accepted`). A move whose zone is implied keeps it: a rail,
a new column, home and `dockHome` (which takes the start state's `align` back), `moveTo` with no `zone`. Give-way is as
without zones (it sums the minimum sizes); when room is spare, start items pack from the start, end items from the end
(before the » entry) and center items sit on the edge's middle, moved only as far as they must to stay between the
other two.

**Bar alignment zones.** A horizontal bar picks the zone of a drop by thirds of its length: a pointer in the left third
is over the leading zone (`start`), in the middle third over the center zone, in the right third over the trailing zone
(`end`), and within the zone the nearest of its gaps wins, each zone's gaps splitting only that zone's third. A zone whose
toolbars run past its third spreads its gap lines inside the third, so its last gap keeps a slice of it. An empty bar's
strip is three targets, `strip:<bar>:start`, `strip:<bar>:center` and `strip:<bar>:end`, one
per third. Every empty edge does the same along its own axis: a side edge or a compact rail by thirds of its height
(`strip:<edge>:start|center|end`, top, middle, bottom). On an occupied edge the items' halves win over the thirds where
they disagree: a pointer over an item's half aims before or after that item, in its zone (see Aim order under
Targets); the thirds decide only between and beyond the items, and on empty zones and empty edges.

A **title bar**, a bar with a fixed item that grows and takes no steps (the window title): its growth is spare room, not
owned room. For target room the title counts at its natural width, not the width it grew to (filter (ii): its least is
its natural width), and nothing else is asked, so a drop there lands exactly where it would beside a fixed item of that
width that doesn't grow, its neighbors giving way as on any bar. The title yields its growth to the landing and never
shrinks under its natural width to make room. A zone where that can't hold has no target and no slot, so a bar too full
takes no drop in that zone. The zones are then laid with the title at its natural width, not at the width it grew to:

- a leading toolbar sits right after the title's natural rect;
- the trailing toolbars sit right before the end items (the window controls);
- a center toolbar sits at the bar's true center when that is clear of both, else it is centered in the free span between
  the leading and the trailing ones;
- the title takes the spare room only when nothing follows it in its zone, so a toolbar after the title is not
  separated from it by a stretch of title.

**Fixed items** (a title, window controls, a page readout) never change form, are never reordered, never dragged, and
no hit covers them. Their length shrinks toward `main.min` and grows with spare room when the form `grows` (a title
holds its natural length while the toolbars of its bar can still step to a compact variant or shrink, and shrinks before
any step that changes a form's kind); window
controls have `min` equal to `natural`. A stage too short for them overflows instead of folding them. A `kept` item with
no smaller form never folds either: it reports `overflow` or `too-wide`.

**Give-way priority.** `DockItem.priority` (number, default the edge's `DockEdge.priority`, else 0) says who steps down
first when an edge runs short. Items step down their forms in a fixed ladder, row, then wrap (in a column), then icons,
then the edge's » menu; the lowest priority steps first, and among equals the one used longest ago. Priority adds to every
one of the item's forms' `rank` (`@n-uf/placement/stack`), which is the mechanism, so a host may still rank single forms. Give the
controls that must stay out of the menu the highest priority, and a title bar's `DockEdge.priority` a lower one than the items
moved into it from other bars, so its own toolbars step down first. Room coming back brings items up in exactly the
reverse order, each to its remembered form, the » menu included. A host reads, and never decides: each item's layout has
`axis` (`"row"` or `"column"`: the axis it lies along, which `form` indexes the forms of), `form`, `formKind` and
`inMenu`, and `edges[id].menu.items` lists the ids in the » menu in order. Without priorities nothing changes.

**The axis an item lies along.** `DockItemLayout.axis` is reported for every item: a placed item's is its edge's (a
bar's items lie along a row, a column's, a rail's and a rail tab's along a column), whatever form it took; a float's is
its orient. A toolbar group in its icons form is a `row` in a bar and a `column` in a column, so a host reads `axis` and
never infers it from `formKind === "icons"`.

**Closed items** keep their place in their edge (or their float rect) but take no room and have no targets.

**Toolbar shapes.** A group in a column draws its words in rows that wrap to the column: give it the column forms
`[wrap, icons, menu]` (a `wrap` form from `@n-uf/placement/stack`; no one-word-per-line `stacked` form). The layout reports a wrapped
item's `rows` (the word indexes per row; the words wrap beside the grip, a hanging indent) and its `grip` (the lead cell at
the start of row one; for a form with `StackForm.grip` such as an icons strip, that strip at the form's start along the
axis). A `wrap` form applies only in a column edge. Vertical means icons: in a column drawn as a rail, and in a float
with `orient: "column"`, a group skips its `wrap` forms and shows its next form (its icons) at that form's natural size,
whatever its `from`. An item with only `wrap` forms left has no form there: it is left out with a `no-vertical-form` note,
so give a word group an `icons` form. A drop's `after()` gives the wrapped rect as the slot.

**Compact variants.** A toolbar that can drop controls before it wraps declares them as more row forms between its full
row and its next form, largest first, each at its own measured size with its "+N" cell counted, and each naming the
control ids it leaves out (`StackForm.hides`, against the item's first form; any form may set it). Variants are forms
like any other: taken in declared order, giving way by priority then age, coming back in the exact reverse. The layout
reports the chosen form's ids as `hidden` on every item (empty when it hides none or sits in a » menu), and `form`
names the variant; a host draws the kept controls and a "+N" control that lists exactly `hidden`. A drop's `after()`
previews the variant the drop lands in.

```ts
const zoom: DockItem = {
  id: "zoom", kind: "group", used: 3,
  forms: {
    row: [
      f("row", 150, 150, 28),                          // − 86% + FIT
      { ...f("row", 118, 118, 28), hides: ["fit"] },        // − 86% + "+1"
      { ...f("row", 70, 70, 28), hides: ["-", "+", "fit"] }, // 86% "+3"
      f("fold", 30, 30, 28),
      f("menu", 0, 0, 0),
    ],
  },
};
```

**Compact edges.** `DockEdge.compact: true` makes a thin rail of vertical toolbars along a window side: its items take only
their `icons` form (and the » menu after it), stacked, each item's grip the divider. An item with no `icons` form is left
out of it with a `no-icons-form` note.

**Edges with fewer zones.** `DockEdge.zones` lists the zones an edge has (default all three). `zones: ["start"]` makes it
one stack along its whole length, as a side rail drawn in order: the whole length offers the start zone's gaps, ordered
by position along it, so a drop anywhere inserts at the pointer's place; there are no center or end gaps, ids or
refusals, and nothing along it refuses a kind it takes. A drop on it names no zone (`namesZone` counts the zones it
has), so the item keeps its own `align`; an item whose `align` names a zone the edge lacks lies in its zone (`zoneIn`;
a fixed item, which the edge takes in no zone, in the edge's first zone), its stored `align` unchanged, and is back in its own zone when the edge is hidden and lends it to a bar (`showIn`).
Two zones (`["start", "end"]`) split the length between them, the boundary at the middle moved past the cards seen on
either side, as three split it in thirds; a drop there names its half's zone. Setting `zones`, even to all three,
always splits the length evenly among its zones (each boundary moved past the cards seen on either side); leaving it
out keeps the edge kind's own spans, on a column the spans the solver lays out. Entries that aren't zones and repeats are
ignored, and a list with no zone counts as all three. With `zoneAccepts` as well, a zone takes a kind only where both
say so (`zoneAccepts: { start: [...] }` alone keeps three zones and refuses the other two thirds). Like `zoneAccepts`,
`zones` is a declaration: `storeDockState` never writes it and `readDockState` takes it from `base`.

**A drop on collapsed titles.** With `DockState.foldedColumnDrop: "end"`, no drop changes an item's collapsed state. For an
item arriving from elsewhere, collapsed titles are one drop place over their whole length, their tiles included, after
the last member: a column drawn as a rail or, on a side with a declared `rails` entry, the rail itself (the end of its
last folded column). An open panel opens that column around it at full size, a collapsed one becomes the last title
tile. A tile dragged within its own rail still moves among that rail's places, staying collapsed. No rail drop strip is
offered, whatever `railDrop` says, and on a declared rail no stop folds an open panel; with no rail showing, an open
panel has no stop there. It is a declaration too, never stored.

**One column per side.** With `DockState.sideColumns: "one"`, a side has at most one column (`isSideColumn`: a left or right
edge that takes something and is neither a compact rail nor a toolbar bar). A drag offers a new-column line only on a side
with no column holding an item once the dragged item is lifted; where the side has a column, an item goes into it by its
gaps. A side with a declared column edge (not a dynamic `column: true` one, which an empty side loses), empty or not,
has that column as its column: empty already, or emptied by the lift of a lone panel, it keeps its box and a drop there
lands in it, so no `column:<side>:$` lane or target is offered for the same place, and no two lanes draw one rect.
`mergeSideColumns(state)` merges a side's columns into the outermost, its items first and the others' after in
ring order, keeping the outermost's id and size; a host calls it as it reads a stored layout, so what it stores next is
what it shows and what a drag reads. A declaration, never stored.

**Nearest bar zones.** With `DockState.barZones: "nearest"`, a bar's start, center and end zones meet halfway between the
landing rects either side of each boundary, not at thirds, so the pointer picks the zone whose landing is nearest it. A
declaration, never stored. It moves each zone's extent: it changes which zone a pointer picks among `targets()` (what a
drag intent reads) and, since a zone left with no room gets no drop, which of a bar's drops exist and where its refused
stretches lie. Under a landing model `lanes()` cuts between spots by their landings, not by zones, so there it changes
which spots and refused stretches (and so which place guides) a bar has, never the rule that cuts between spots (the
cuts follow whichever spots exist).

**Space kept on a zone's open side.** `DockItem.space` is free space an item keeps before it in a start zone or after it
in an end zone, out of the edge's spare length (shared out when items ask for more). A dock move sets it with
`DockPlace.space` (0: none). With none named, a dock on the open side of a neighbor that keeps space takes that space
(it lands where the neighbor was, and the neighbor moves by the item only), and else keeps none. The stored form keeps
it. `lanes()` offers both beside such a neighbor: the dock taking its space, and one keeping none at the stretch's
other end. A title that grows to fill its bar counts its length past its natural one as free stretch for pitched
spots.

**Lanes for a landing model.** `lanes(state, id, options)` gives what a landing model (`@n-uf/motion/drag`) reads for a
drag of `id`:
- `lanes`: every edge that takes it (and the virtual ones: a new column's line, a declared rail), each with its rect, its
  axis and its spots in order. A drawn edge's lane rect is the edge; an empty one's is the band its drop would draw.
  At a corner an empty edge's lane gives way to a drawn edge across it that takes the held item (has a lane for it):
  its rect is clipped along its axis to stop at that edge's side (an empty top bar beside a drawn side rail starts at
  the rail's inner side). Only a drawn edge standing across the band's middle line cuts. A drawn edge that refuses the
  item (a panel column, for a toolbar) leaves the corner to the empty lane, and between two edges not drawn the corner
  is as it was. The clip loses no landing: the spots' cuts are made over the band whole and then clipped, so the spot
  whose stretch the clip falls in starts at the clip, a spot whose stretch lies whole on the drawn edge is left out
  (the pointer there is in that edge's lane), and the corner clip makes no zero-length `along` stretch. A spot is a place a drop there lands: its `landing` rect, its `target` (the drop, its
  `after()`), and its `along` stretch of the lane, the part that picks it. In a panel column, between two spots that
  share a neighbor (the item `Y` in `X|Y` and `Y|Z`) the boundary is that item's middle as drawn, so a column takes a
  panel by halves; with a spot held, its lane's stretches are cut in that spot's own layout (its room open: a drag's
  `spotsOf(spot)`). On a bar
  or a toolbar rail, and between any two other spots, the boundary is halfway across the gap between their landings,
  each in its own layout: wherever the pointer is, it is at the landing it picks or no nearer the other, so a toolbar
  moved along an occupied bar stays at the hand (the hand rule: while a lane holds, the landing is the nearest landing
  in its lane to the pointer, within `max(48, g / 2 + 6)` px of it, and `max(56, g / 2 + 6)` on the single frame before a
  hop; `g` is the gap along the lane between the facing edges of the two adjacent landings the pointer lies between,
  a sliding spot's landing taken at the end of its range that faces the next spot, and 0 over a landing or over free
  room inside a sliding range. A spot changes 6 px past the cut, hence the 6. Over a docked item much longer than the
  held one no landing lies inside it: the nearest are flush before and after it, and `g` is about its length less the
  held item's, plus a gutter; [decision 0001](decisions/0001-the-hand-rule.md)). Pass `options.grab`, where the pointer holds the item (its offset from the item's top left, as a
  target's `after(point, grab)` takes it; the press's, constant for the drag):
  on a bar or a toolbar rail along the item's own length, two landings that overlap (spots a pitch apart) are then cut
  at the grab, halfway between the points the pointer would hold in each (with landings of one length, kept within half
  a pitch of their overlap), so a pointer brought back to its press point picks the item's own place however far from
  its middle it was pressed; landings with a gap between them (either side of a long neighbor) are cut halfway across
  it whatever the grab, so the pointer is at the landing it picks. Across the item, and in a lane across
  its length (a rail toolbar over a bar), the middle counts, as without a grab. Without it the item's middle is the
  grab, and a toolbar pressed near one end can come back to a free-stretch spot beside its own place. Panel columns cut
  by halves whatever the grab. One case it doesn't settle: where another lane's band overlaps the press point (an
  empty bar's band over the end of a rail that is not drawn), that lane can take the pointer first. Every cut lies inside its lane, in
  order. A spot's `others` keys where its drop draws every item but
  the held one: a change between two spots with the same key moves only the held item, so a model gates only changes
  between spots whose keys differ (that reflow the window).
- `marks` per lane, the place guides as seen (a drag's `after(held)` gives them in that held place's layout): a mark at every place a drop lands but the held one's.
  - A `box` over each free stretch the item fits in. Beside the held item, the room left of its stretch is a box from
    a pitch on a bar or a toolbar rail (`:before` or `:after` the item in its id, so it keeps it while the item glides).
    A growing item there (a title filling its bar) counts at its natural length, so its slack is free room.
  - A neighbor gives way when the item lands in the room beside it: it moves away from the room, leaves the lane (the
    menu, a float), or steps down to a shorter form than it has now. "Now" is the layout the marks are drawn in, one
    layout: as seen, or a held place's (where a neighbor already drawn stepped down gives way no further, and one the
    held item pushed gives way to a drop in another room). The same rule makes a stretch
    (below), against the layout as seen with the held item lifted. On a bar
    or a toolbar rail a room's `box` has a fixed striped end inside it (`hatch`, `HATCH_END`) at each side whose
    neighbor gives way (`:before` or `:after` in its id, the neighbor's id in its `givesWay`), whether or not the room
    as seen is shorter than the item; where no neighbor gives way the box is plain (an item that fits by taking
    another form itself, say). Room that partly fits (from a pitch, shorter than the item) is such a box; nothing is
    drawn on the neighbor. Room under a pitch, or none (touching items, a lane's end flush), is a `line`; a panel
    column keeps its lines. A hatch is a cue, never a measure of the landing.
  - An empty lane (`options.emptyLanes`): `"real"` (default) a box at its real size, the band it would open (an empty
    side rail's over a column's outer strip, which moves aside); `"edge"` a thin striped strip (`HATCH_EDGE`) on its
    window side. Either way cut around every item docked in a bar or a toolbar rail.
  - **One layout** (decision 0002, and `dockDrag`, below). A lane's marks lie in one layout: `lanes()` gives them as
    seen; a drag's `after(held)` gives every lane's in that held place's layout, a neighbor's giving way judged there too.
    Its hit `rect` stays as seen. A lane the screen doesn't draw (an empty edge, no band) is drawn by `guides(frame)` in
    the layout that creates it: an empty top bar's box lies over the panel columns that move down when it opens, not
    cut at them (the guide may lie over a column that hasn't moved yet); the Near one in its would-land held place's layout,
    the others in their one spot's, their room whole, giving up where they meet a lane drawn on screen (between two
    such, the bar keeps the corner). Under `emptyLanes: "edge"` nothing is created (the thin strips as seen), nor for
    a lane with more than one spot (pitched stretches).
  - Never a box or a line over an item drawn there, nothing over the held item, nothing in a refused stretch, and no
    two edge lanes' marks overlap: a lane's marks lie inside its rect in the layout they are drawn in (where the lane's
    edge is drawn there, its edge as drawn, unclipped; otherwise its band, clipped at the edges drawn across it there),
    a box clipped to the rect, a line kept only if it lies inside. At a corner a lane not drawn (an empty bar or rail)
    gives way to a drawn one, and between two not drawn the bar owns it, read in that same layout. A virtual lane (a new
    column's line, a declared rail) is drawn over what it would push, and may overlap another lane's marks there.
  - As seen the lifted item is drawn nowhere, so its own place is free room in its lane. In a spot's layout the held
    item is drawn where it lands, its room open, an edge moved by it; beside it on a sliding spot (where it lands
    anywhere) any room from 8 px is a box.
  - A virtual lane: a box at its landing, a line beside it where the held item is drawn over it. Only where a drop
    lands, so none beside fixed chrome nothing lands next to. Each mark has an `id` (`<lane>/line/<before>|<after>`,
    `<lane>/box/<before>|<after>`, `<lane>/hatch/<before>|<after>`, `^` and `$` at the ends, with the suffixes above)
    that stays while its neighbors stay, so a host keys its drawing by it.
- `refused` stretches per lane, each at least the item's length (a shorter one joins its spots), and refused places
  outside lanes, less where a lane lies (the lane takes the pointer there);
- the `content`, and what `blocked` takes out of it (drawn edges, docked items, the kept-clear rects, a drawn declared
  rail, the state's `blocked` spots, where a release cancels): the open space;
- the stage, the `floatRegion` (the stage less the inset at its left and right, as `heldRect` keeps a held item), the
  item's size, and the float target;
- the drag's `refusals`, from the same generation (what `refusals()` gives): with the spots' targets and the float, a
  host has every target and refusal of the lift from one call.

A bar's free stretches, and a toolbar rail's (a compact edge, along its length), get spots at `SPOT_PITCH` (40 px;
`options.pitch`), each a dock keeping `space`, so a toolbar lands close to the hand; an empty bar gets them over its whole length less its padding. `pitch` of 0 or less turns pitched spots off. The item's own place is one landing for half a pitch around it, so away and back to the press point is home.

A stretch is the room the drop makes, not only the room as seen: it runs from flush after the neighbor before it to
flush before the one after it in the forms a drop there leaves them in. Where the edge has no room for the item beside
a neighbor's form as seen, the drop steps that neighbor (or another item) down to a shorter form, and that room
counts; the forms don't depend on the space a dock keeps (space comes out of the spare length), so every start in the
stretch finds them alike. A dock's push of a neighbor that keeps no room for it is no room made: an end with no zone of
its own (after a start item, before an end item) stays where it is seen when its neighbor would move away. Where a stretch is too short for the
item, or is bounded on both sides by zones the held item cannot dock in (no start-zone item or edge start before it, no end-zone item or edge end after it), it has none, so coverage is not universal: a point next to a center item that
doesn't fit beside it can still be far from its landing (452 px at worst in the sweep windows).

**Stretch positions.** That is `options.stretchPositions: "free"`, the default (`"pitched"` gives the spots at a
pitch). A free stretch is one range of landings, from flush against the neighbor before it to
flush against the one after it; `"pitched"` samples it every `pitch` px, its ends included. `"free"` exposes it as one
sliding spot (`DockSpot.slide: { from, to, snaps, snapDistance, step }`, id `<lane>/<zone>/<before>|<after>@slide`): `from` and `to` are where the landing's start may lie along
the lane, and `snaps` the starts it snaps to within `options.snapDistance` (8 px): its ends, the item's own place, and
every other dock that lands inside the stretch beside the same neighbors (a center dock, say), each of which it takes
over and commits as it is. No snap point lies within twice the snap distance of the item's own place, so a release
within the snap distance of it is home; a taken-over dock (a center dock, say) that lies within twice the snap distance
of the item's own place therefore has no snap of its own there (as pitched spots do): intended, the
item's own place wins near it. Its `target.after(point, grab)` puts the item's start at the pointer less the
grab (along the item's own length; across it, the middle), clamped to the range and snapped, else on a whole pixel
(`slide.step`; a drag's `after` of the sliding spot is this one computation, so the frame and the commit agree), and commits a dock keeping the `space` that puts it there: a dock consumes its placed neighbor's room, and the neighbor
stays put while the room suffices. Its `landing` is the one at the stretch's point nearest the item's own place (that
place itself on its own stretch), else at its start; a host draws a landing model's frame (`@n-uf/motion/drag`, which
moves it with the pointer) and commits through `after(point, grab)`, as for a float. A spot's `target.place` is the dock
at the spot's listed landing (on the item's own sliding spot its own zone, index and `space`); a sliding spot commits
through `after(point, grab)` (a drag's `after(release)`), and the release's `home` (and `DockSpot.home`) and the committed landing say where, never the place kind.
A step comes only where the order
changes (passing a neighbor): the cut beside a sliding spot reads its landing flush against the neighbor between them.
Its guides are its stretch's one box, also while it is held. The range holds the landings that land where aimed with
every fixed item kept (checked at its ends and every `pitch` px between; under `"free"` `pitch` only sets that sampling
step, `SPOT_PITCH` (40 px) when it is 0 or less, and never makes a spot). A stretch (the room the drop makes, above:
over room as seen shorter than the item that a neighbor steps down to make, the range runs from flush after its short
form) with room for the item at a single start (a range under a pixel, `slide.step`), or shorter than the item, has no
sliding spot: that start (flush after the neighbor before it, as a pitched stretch's end gives it) is a plain dock
where it lands, never a point slide and never nothing. It is a spot of its own with the plain dock's id
(`<lane>/<zone>/<before>|<after>`, no `slide`; `…@<pitches kept>` where a dock between the same neighbors already has
that id), `home` where it is the item's own place, unless a spot already lands within 1 px of it (the item's own place,
say), which stays; its box and striped ends come from its landing. So every landing a room offers has a spot, and
every landing a pitched lane offers lies within 1 px of a free lane's spot or inside a slide's range. Nor has one a
stretch bounded on both sides by zones the held item cannot dock in (no start-zone item or edge start before
it, no end-zone item or edge end after it); its plain docks stay spots of their own. The item's own place wins its
landing: a dock landing a fraction of a pixel from it never takes its place. Next to a center item a stretch
still has one wherever a zone can take the item. A center dock's snap commits that dock as it is, so it moves its center
neighbor by design (the center zone re-centers its items), where a plain dock leaves its neighbors put.

Known caveat: on an over-subscribed edge (more items than the edge holds at their natural length) the solver gives
fractional positions, so a frame and its commit can differ by about a pixel there. The whole-pixel rule holds for the
start the spot asks for, not for what the solver then makes of an edge with no room to spare.

Spot ids are keyed by the lane, zone and neighboring items: `<lane>/<zone>/<before>|<after>`, an empty edge's
`<lane>/<zone>`, `@<n>` for a pitched spot (pitches from its neighbor), a virtual lane's `<lane>/line` or `<lane>/end`.
A new column's lane is `column:<side>:<the column it lies outside, or $>`, not its ring. Ids survive the window resizing;
an item opening or moving beside a spot can change it (61–82% kept in the sweeps), so a landing model maps a lost id to
its lane's nearest spot. The spots come from the same generation and filter as `targets()`, so a spot's landing is
exactly what its drop commits. `lanes()` is remembered per state and options (`previous` by identity): the first call
of a lift solves each spot once (2–18 ms at 1200–3200 px wide with full bars; 130–190 ms in the most crowded generated
windows), and a drag's held places reuse that work.

### `dockDrag(state, dragged, options)`: one layout per held place

`dockDrag` takes `lanes()`' options and gives a `DockDrag`: `regions` (`lanes()`', for hit-testing only), `home` (the
item's own place at the lift, `{ lane, spot }`: the first spot `lanes()` marks `home`; absent for a float), `after(held)`,
`landingOf(held)`, `spotsOf(spot)`, `shown(frame)` and `guides(frame)`. A held place, `DockHeld`, is `{ kind: "spot", spot, point }`,
`{ kind: "float", point }` or null (rest). `after(held)` is a `DockAfter`: `state` (the dock state a release commits; a host stores
it), `layout` (that dock state solved with `options.previous`, as the commit solves it), `landing` (the held item's rect
there, or null), `marks` (every lane's, `DockLaneMark` = a `DockMark` with its `lane`, in that one layout) and, for a
spot, `spots` (its lane's stretches cut in that layout). A fixed spot's `after` is solved once at the lift and
remembered by id; a sliding spot's per start (`LaneSlide`'s rule: the same computation as `target.after(point, grab)`);
a float's for the last pointer. Rest is the window as seen with `lanes()`' marks. **Which layout a held frame draws** is
the draw rule of docs/docking.md ("What a held frame draws"), which `shown(frame)` reads. `landingOf(held)` is
`after(held).landing`; `spotsOf(spot)` is a spot's lane's stretches in its own layout. `guides(frame)` takes a landing
frame (`DockGuideFrame`: its `held`, its `room` (the landing model's `LandingFrame.room`) and its `guides`,
`{ lane, held }` each) and gives its guides (`DockGuide`), cut in `shown(frame)`: each
lane's marks in the layout of the held place it names; a lane drawn on screen less the landing the pointer would take in
it (a box part 8 px or shorter that cut leaves is dropped); a lane the screen doesn't draw in the layout that creates
it (the Near lane's would-land held place's; any other's one spot's, its room whole, giving up where it meets a lane drawn
on screen, the bar keeping the corner between two such); the Near lane's marks winning where they meet another's. The
drag fits `@n-uf/motion/drag`'s `LandingGeometry` as it is (`AssertGeometry<DockDrag>` in `./testing` pins it), and its
`home` is the landing model's `home` option, so `createLandingModel({ ...drag, preview })` is the whole wiring (a host's own
`home` after the spread wins; `preview` is the `DragPreview` the host also gives `previewPlan`, which holds the guide
level). A landing frame and release fit `DockGuideFrame` and `DockHeld`.

A declared rail is one lane with one spot, its end (`rail:<side>/end`), for an item that is not a tile of it. A tile of a
column folded into it moves among that column's tiles through the column's own lane, drawn where the column's run of tiles
lies (the hull of its rail segments): the lane's `rect`, its spots' `along` stretches and its marks lie in the run, and
its spots are the column's gaps, as `targets()` offers them. The rest of the rail (other columns' tiles, and past the
last tile) is the rail's, home for the tile, as it is in `targets()`. The lanes and `targets()` decide the same at every
point of a rail, with no exceptions: a drawn rail owns its whole rect, less the held tile's own run (what its stops tile and what they leave), so a
new-column line's zone starts where the rail ends, and a new column's lane gives way to the rail as seen (its hit rect
stops at the rail's inner side, though its box lands where a lifted tile's rail was). With a tile of the rail held, the
new-column lines about its folded column are the same move as home, their pieces home's (the strip beside the rail), and
the lanes block that strip as well: a pointer there stays, it floats nowhere.

**Column footers.** `DockEdge.zoneAccepts` (and `ColumnTemplate.zoneAccepts`, for the columns a drop makes) narrows `accepts` per zone:
the kinds each zone takes, and a zone not listed takes nothing. A panel column with `{ start: ["panel"], end: ["group"] }`
has its panels at the top and a footer of toolbar groups at its foot (the end zone, one group per row): a group in the footer
takes only its `wrap` or `icons` form, never the menu, and the panels give way first. Gaps are offered only in the zones
that take the dragged kind, `moveTo` puts an item in the zone asked for, else in its own zone if that takes its kind, else in the first that does. An empty edge offers
each third of its strip only to the kinds that third's zone takes (the other thirds are refusals), and a group never
opens such a column on its own: an empty side column offers its strip only to the kinds its start zone takes, so a
group's drag gets the compact rail's strips but none for an empty panel column, and a panel's gets the column's top
third.

**Columns and rails.** A left or right edge with `column: true` is a dynamic column: drops make it (a `column` place, from
`state.columns[side]`: `accepts`, `cross`, `gap`, `pad`, `menu`), and it is deleted, its side's rings closed up, when it
holds no item. On a side with `state.rails[side]` (`{ width, accepts }`), folded columns show as segments of that side's
one rail (`layout.rails[side]`, each member at its `rail` form's length, in ring order), lying just outside the side's
first column. A column folds:

- by give-way: while the content is narrower than `state.contentMin.width` (after `inset`, and a `gutter` after each side
  edge and rail), dynamic columns shrink toward their minimum (the edge's `cross.min` and the widest open setter's
  `cross.min`: a stack costs its widest member's minimum), then fold whole, unkept before kept, the one whose newest use
  is oldest first, the outer first, the left first (`column-shrunk`, `column-folded`, `kept-folded`). Under `previous`,
  what gave way stays so while the content still fits, room that comes back unfolds in the reverse order, and ages alone
  change nothing. Still too narrow: `content-narrow`; under `contentMin.height` (overlay bars counted): `content-short`.
  With `contentMin.chromeWidth`, a lower floor for chrome, the content gives way first: compact rails and side toolbar
  bars may take it down to that floor while the columns keep their width and move aside, and only below it does a
  column shrink, then fold. A compact rail or a side toolbar bar is chrome only where its side has a column template or
  a declared rail to tell it from a panel column (`isSideBar`), so on a side with neither it gets no floor benefit. A
  floor of 0 or less lets chrome take all the content. The columns alone still leave `contentMin.width`, so a toolbar
  rail added at a window's edge narrows the content and leaves the panel column as it was. Chrome within that allowance is quiet: no `content-narrow`,
  and `columnRoom` stays true, so a toolbar rail never flips a host to its narrow layout. `content-narrow` fires when
  the columns' own need takes the content under `contentMin.width`, or once it is under the floor; its `min` is
  `contentMin.width` less what chrome takes within the allowance, so a host that says "needs at least …" reads
  `contentMin.width`, not the note's `min`. Bars keep giving way by `contentMin.height` (the
  floor is width only).
- by hand: when every member is folded by hand (`from` over 0) it goes to the rail; with `handFold: "ride"` a one-member
  column instead rides as a title bar over the side's first open column, at that column's width, taking no width
  (`rides`), while the side has an open column.

A member folded by hand in a column with others is a bar in place (its header form). The open members share the height
through `grows`. Anchors (a thumbnails column, a fixed drawer) are ring-0 edges with `accepts: []` and fixed items.

**Side parity options.** For a host with panel columns, anchors and a narrow fallback. All are opt-in; a state that sets
none has none of these effects.

- **`DockEdge.outsideInset`**: an anchor edge (a left or right edge that takes nothing, such as a thumbnail strip) lies
  outside `DockState.inset` and the gutter: at the window's side, with the inset after it toward the content, and inside its
  side's rail when one shows. It runs into the inset above and below only where no reserved bar lies on that side. On a
  full top or bottom bar it lies at the window's edge, full width, with the inset after it; the side edges then run
  between such bars, and an anchor runs through the inset beside them. Without it nothing changes.
- **`DockEdge.giveWay`**: a static left or right edge that gives way like a dynamic column. It shrinks toward its minimum,
  then folds whole into its side's rail, in give-way order with the columns (by its items' ages). It is never deleted.
  On a top or bottom bar, reserved or overlay, it gives way by height, the same way: while the content is shorter than
  `contentMin.height` (overlay bars counted), such bars shrink across toward their minimum (`cross.min` and each open
  item's form's `cross.min`), then fold one by one, their items stepping to the next form that fits across (a panel's
  title bar, `foldedBy: "auto"`), each fold letting the others take back what they can; unkept before kept, the oldest
  newest use first, the outer first (`bar-shrunk` `{ edge, from, to }`, `bar-folded` `{ edge }`, and the edge's
  `shrunk`). Room coming back undoes it in reverse. Still too short: `content-short`.
- **`DockEdge.moves: "side"`**: a static edge whose fixed item (an anchor, such as page thumbnails) the user may drag to the
  other side of the edge's axis. `targets` then gives that item one target, `side:<other side>`, over the place the edge
  takes there, landing as `setSide` puts it; its own place is home. Left out, a fixed item has no targets. `readDockState`
  moves an anchor's edge to the side and size of the stored entry that lists it.
- **`DockEdge.foldable: true`**: the user may fold this edge's fixed items (an anchor) by hand, like a panel:
  `foldItem(state, id, true)` shows the item in its rail form, `foldItem(state, id, false)` reopens it, and `storeDockState` /
  `readDockState` keep it folded. Left out, `foldItem` leaves a fixed item as it is and a stored fold is dropped.
- **`ColumnTemplate.hitBand`**: the `DockEdge.hitBand` (a number of px, or `"middle"`) that the columns a template makes
  inherit; see the gap targets below.
- **`DockState.insetWhen`** (`"always"`, the default, or `"docked"`): with `"docked"` the inset applies only while something is
  docked beside the content, that is an open panel column or a rail showing panels (an item whose first column form is
  `open`, `header` or `rail`, not closed). Only panels count: an anchor alone doesn't, and neither does a toolbar group
  in a side bar. With nothing docked, the content is the whole stage.
- **`layout.columnRoom`** and the note **`no-column-room`** (`{ width, need }`): with `contentMin` and a dynamic column,
  whether one column at its minimum fits beside the content's minimum. Anchors and rails don't count: every column, an
  anchor included, can fold into its rail. A side toolbar bar that lays out an item does count: it never folds (unless it gives way), so its
  width (and the gutter after it, when it lies inside the inset) comes off the room before the column's minimum is
  tested, and the note's `width` is the room left after it; an empty or all-closed bar counts for nothing. A docked column counts whether or not its side has a rail. Before any column
  holds an item, the `DockState.columns` template answers, with the larger of its `cross.min` and the least width the items
  it takes need, so docking a panel doesn't flip the answer. It answers as if the one column were open: under
  `insetWhen: "docked"` with nothing docked it counts the inset that column would bring, and a column folded whole by hand
  (and a template's floating items) counts at its open minimum, not as a rail. `false` comes with the
  note, where `width` is the room the stage leaves and `need` the content's minimum plus that column and its gutter. A
  host shows its narrow fallback (one panel over the content) while it is `false`. An exhaustive `switch` over
  `DockNote["code"]` needs the new code.
- **`handFold: "ride"`** rides every column folded by hand, not only a one-panel one: each member is a bar over the
  side's first open panel column (never over an anchor), stacked in zone order.
- **The order of a side's outer edges.** A side's rail is its outermost *panel* edge. With a side bar, from the window's
  edge inward a side lies: its toolbar bars with `outsideInset`, the rail, its static column edges with `outsideInset`
  (anchors), then the inset, then the columns. The kinds tell them apart, with no new option: a side bar takes something
  and nothing the side's columns or rail take (`DockState.columns[side].accepts`, `DockState.rails[side].accepts`), an anchor takes nothing; `isSideBar(state, edge)`
  says whether an edge is a side toolbar bar (only on a side that has a column template or a rail), and
  `isOutsideSideBar(state, edge)` whether it is one with `outsideInset`. On a side with no side
  bar the rail stays inside the inset. With no rail shown, the `rail:` strip lies past the side's bars too.
- **Static edges keep their place.** A new column (a `column:` or `rail:` target, `moveTo` with a column or rail place,
  `dockHome`) goes no further out than just inside the static edges that lie outer to the side's dynamic columns, so a
  bar or an anchor at the window's edge is never pushed inward. Column and rail places count rings as the side's edges
  lie (by ring, then by order, no ties), and `homeFor` gives a start column's ring that way.

**Holding an item.** `heldRect(state, id, size, pointer, grab)` is where a held item lies: its grip under the pointer
where it fits, else moved just enough to lie wholly inside the float region (the stage less the inset at its left and
right). Pass `floatFromHeld: true` to `targets` and the float target starts from the same rect, so a host that draws the
held item there sees what lands. Without it the float target starts from the pointer's rect, wherever that lies.

**"Does not fit" is decided by the hand.** The float target's drop (`after(point, grab)`, so `dockDrag(...).after({
kind: "float", point })`) fits the float as below, and that clear place counts only while the pointer is still on the
item there, measured on the hand rect as `heldRect` keeps it inside the stage (the stage clamp never counts against
it). Where no clear place keeps the item under the pointer (none exists, or the nearest one lies off the pointer), the
float lies at the hand: over the docked items it covers, never at a least-covered place elsewhere. Bars and the chrome
stay a wall, but they only clamp it, as the stage's edge does: it takes the least shift that clears them, along the
axis that needs it, and stays at the hand otherwise. So "the pointer is on the drawn item" holds on every open frame,
exempt at the stage edge, bars and chrome, where the float takes the least shift that clears them. Such a drop marks the float **`stays: true`** (`DockFloat.stays`): `solve` then only
keeps it inside the stage and pushes it the least it takes clear of the bars and the chrome, never beside the docked items (a `float-covers` note
lists that it covers), so it stays put when a column opens under it or the window shrinks, where an unmarked float
moves clear as before. So a narrow float pushed at a column still stops at the column's edge until the pointer enters
the column, and a float wider than the open room follows the hand and lands where it is shown. The next drop decides
the mark again; `floatAt` with a rect clears it; `resizeFloat`, `orientFloat`, `raiseFloat` and `markUsed` keep it;
`moveTo(state, id, { kind: "float", rect, stays: true })` sets it, and `homeFor` carries it. `fitResize` stops a
marked float's growing edge at the bars and the chrome only. The store keeps it on a float with no anchor (`stays:
true`; anything else is dropped as `float:<id>:stays`).

**Floats** lie above the content in stage px, last on top. Each is moved inside the stage and clear of every docked
item, every bar and every `keepClear` rect, anchored ones as this layout resolves them (`@n-uf/placement/stack`'s `fitFloat`), with `float-clamped`, `float-moved` or `float-covers` notes. With
`anchor` (such as `"content-top-right"`) it sits flush with that side or corner of the content and follows it until a
drop gives it a real rect. `orient` picks the forms it uses; folded by hand (`from` over 0) it is its
bar: that form's natural length along its orient, its other size kept.

A float that names no `orient` takes its item's: **`DockItem.floatOrient`** (`"row"` or `"column"`), else
**`floatOrientOf(item)`**, the axis of the first form the item declares, so a toolbar group declared row first floats as
a row. **`DockDropOptions.floatOrient`** overrides that for the drag's float target. A float's size is kept **per
orient**, **`DockItem.floatSizes`** (`{ row?, column? }`). **`floatSizeOf(item, orient?)`** gives `floatSizes[orient]`,
else the item's first form's natural size along `orient`, not 280 × 360; a form that grows (a panel's card) keeps `DEFAULT_FLOAT_SIZE` (280 × 360). `floatAt` with a rect and a hand `resizeFloat` write
the size for the orient the float is in; the drag's float target takes the size for the orient it lands in. Give a
float `orient: "column"` (or the item `floatOrient: "column"`) to keep a row-first group vertical. **Per-orient sizes
apply to items that declare `floatSizes`; others keep the stored rect** (`declaresFloatSizes(item)`): an item with no
`floatSizes` is framed at its stored rect (a float at its first form), and `orientFloat()` turns it keeping its rect. `floatAt` with a rect and a hand
`resizeFloat` write `floatSizes`, so an item becomes declared once its size is set by one of them; only then does a turn
(below) take the new orient's size.

**Turning a float.** `orientFloat(state, id, to)` gives the frame the size the new orient draws it at (`floatSizeOf` for
`to`, as `solve` draws it), at the place the float already has; an anchored float keeps its anchor, so the anchor puts
the new frame, and the float's first-form size is what `solve` draws: a form that grows (a panel's card) is the float's
rect, any other (a toolbar group) its `floatSizes` for the orient, else its natural size. A form that grows keeps the
rect it leaves under its old orient, so turning back restores it, and a hand size for each orient survives any number
of turns. Rotating a toolbar there and back gives the same rect, and an upright 36 × 107 strip turned to a row is the
row's 88 × 28, never the old frame around the new content. A state stored with the old single `floatSize` (before
sizes were kept per orient) reads it as `floatSizes` for the orient its float is in (`readDockState`; a docked item's
own orient), so a float stored at that size draws the same frame and a docked item keeps it for its next float-out. On
a float whose store declares no `floatSizes` it is dropped (`item:<id>:floatSize`): that float is framed at its stored
rect.

**Anchored floats keep clear of the floats floated before them; the float floated first wins.** An anchored float
(Float from a menu: `moveTo(state, id, { kind: "float" })` with no rect, or any float with `anchor`) is also kept clear
of the anchored floats floated before it and of the floats with a rect of their own floated strictly before it, by the
same nearest-clear-place search that keeps it clear of docked items, so a group sent to Float lies beside the floats
already there instead of on them. Which float was floated first is `since` (`DockFloat.since`: when it was last
floated or placed by the hand over an anchored float, since a drop at a rect or a hand `resizeFloat` whose new rect
lies over an anchored float as drawn renews it, and one that stays clear of every anchored float keeps it; a missing one counting
as 0, so floats with no `since` win; among anchored floats ties go by id, and a float with a rect of its own floated as
early wins nothing), never the stacking order, so `raiseFloat` reshapes nothing. A float already at a corner stays
there when another is sent to Float beside it. Where no place is clear of them all, it lies where it would with no
other float (it may cover a float, never a docked item it could stay clear of). A float with a rect of its own (a drop,
a resize) keeps that rect. What the hand does moves nothing else: a float dropped or grown by a corner resize over an
anchored float comes after it (its `since` renewed), so it covers it (or lies under it, by the stacking order), and the
anchored float keeps its place, whichever was floated first.

**An anchor with an offset.** `anchor` also takes `{ at, dx?, dy? }`: flush with `at`'s side or corner of the content,
then `dx` px to the right and `dy` px down (negative: left, up; default 0), still following the content as the window
changes. So a host stores "the content's top-right corner, 12 px down" instead of a pixel position that a smaller window
would clamp on reload. The string form is unchanged, and `FLOAT_ANCHORS` lists the names. A host that reads `anchor`
as a name narrows it first: `anchorName(a)` is `a` for a name and `a.at` for one with an offset.

```ts
const s = moveTo(state, "tools", { kind: "float", anchor: { at: "content-top-right", dy: 12 } });
storeDockState(s).floats; // [{ id: "tools", x, y, width, height, anchor: { at: "content-top-right", dy: 12 } }]
```

The **float region** is [pad, W − pad] × the full height: the stage less `DockState.inset`'s left and right (its top and
bottom don't cut it). A float is clamped into it, and one larger than it is shrunk to fit. **`DockItem.floatMin`**
(`Size`) is the floor of that shrink: a float of the item is laid out at `max(floatMin, min(its size, the region))` each
way. Without it a shrink stops at the form's own minimums (`cross.min` across, `main.min` along), and a float asked for
smaller than those keeps its size. A float wider than the region even at the floor keeps the floor and lies at the
region's left edge; a folded float keeps its height. **`DockItem.floatMax`** (`Size`, optional) is the ceiling: a
larger float is laid out at it, its top-left corner kept (never under `floatMin`).

**Resizing a float by hand.** Per pointer move a host calls **`fitResize(state, id, rect, moving)`**: `rect` is the
rect asked for (the float as drawn, the dragged edges where the pointer put them) and `moving`
(`{ left?, right?, top?, bottom? }`) names those edges; the others stay put, so a left-edge drag keeps the right edge.
In one pass, with no iteration, it keeps the size within `floatMin` (else the open form's minimums, which only stop a
shrink below the size drawn now, as `solve` lays it) and `floatMax`, the float in the float region, and stops every
growing edge at what floats are kept clear of (a bar, a docked item, a kept-clear rect; such a stop beats the minimum). It
then lays the rect through the one clamp `solve` lays floats with, so `solve` lays the result exactly there. A float
that already covers something (no clear place at its size) may move to a clear place once a resize opens one; the
preview is still the commit. Such a float never grows over what it covers: a dragged edge that lies inside an obstacle
stays where it is drawn (`"docked"`), so a resize never covers more than the float did, and a float clear of everything
stops at the obstacle. It gives `{ rect, limits }`, `limits` naming what bound it:
`"min"`, `"max"`, `"region"`, `"docked"`. It gives null for anything but a float drawn at a first form that grows (a
panel's card): a toolbar group's size and a folded float's bar come from their forms. On commit (each move, or the
release) `resizeFloat(state, id, rect, moving)` stores that same rect as the float's rect and the item's `floatSizes` for the
float's orient, so the preview is the commit and the size survives `storeDockState`. `fitFloat` is the other half: it moves a float to a clear
place and never resizes it.

**`previous`.** `solve(state, { previous })` hands each edge's fits (`edges[id].free` and `.stack`) to `fitStack`, so a
change of ages alone (a press, `markUsed`) or `raiseFloat` changes no rect, a form that was only re-measured keeps its place,
and one whose kind changed starts over. Whenever `content` isn't the rect `previous.content` was, the layout has a
`content-changed` note (`{ from, to }`): a host refits its zoom only on that note, so a press or a float move never
refits it. Columns that gave way stay folded, in the order they folded (the fold notes' order), while the content still
fits; room that comes back unfolds them in the reverse of that order, never by age, so a press unfolds nothing, and
solving again from a layout changes nothing. An item docked now that was closed or absent in `previous` has just
opened. Opened beside items that stayed open in its edge, it counts as the newest and takes its largest form that fits
its edge as laid out, and its column is weighed again. A closed item is not a removed one: opened into an edge whose
items were all closed, it comes back with its age, and the column's folds, kept while it was closed, apply again. The
columns' fold and shrink state otherwise follows `previous`, so to reweigh a column fully, pass `fresh: [columnId]`.
`fresh` (edge or item ids, on `solve` and `targets`) solves those edges without `previous`.

`markUsed` alone never reshapes anything: ages decide only who gives way anew. A user's explicit request to show an item
is passed as `fresh`:

| Action | What to pass |
|---|---|
| focus (a press on a header) | `markUsed` only |
| expand a folded or railed item | `markUsed` + `fresh: [id]` |
| Keep open | `keepItem` + `fresh: [id]` |
| open a closed item | `openItem`: it counts as fresh by itself beside items that stayed open in its edge. Into an edge whose items were all closed it comes back as it was (its column may stay folded by give-way); to show it regardless, `openItem` + `markUsed` + `fresh: [id]`, as for expanding |

**Targets.** `targets(state, id, { previous, endReach, floatSize, floatOrient })` gives `DockDrop`s: placement's `Target` shape plus `item`, `place` and `after`, and the fields a drag intent reads for
spring-loaded rails and rooms that open (`arm`, `armedHit`, `opensRoom`, `roomHold`, `roomHit`), which `DockDrop` carries
and placement's `Target` does not. A `DockDrop` is also the shape `@n-uf/motion/drag` takes:

Every hit lies where the user sees things: the layout as it is, the dragged item in place. The item's home is its own place, and so
are the gaps right beside it (a drop there is the same move). An edge the lift would delete (the item alone in its
column) is home as a whole. A zone of a bar reaches over every card seen in it. Each target's `after` is the solved
drop, so where the lift would reflow a neighbor the preview moves it under a fixed pointer, and the hit regions stay put.

**Aim order.** Along every occupied edge (a rail, a bar, a title bar, a column footer, a column), the dragged item is taken out
first and the pointer aims at the other items: over the leading half of one (its upper half on a side edge, its left
half on a bar) the drop goes right before it, over its trailing half right after it. The hit regions split at the midpoints of
the remaining items, whatever their order and zones. Where that aim gives the order the edge has now, the target is home
(no slot elsewhere): home covers the item's own rect and the facing halves of its two neighbors, even a neighbor in
another zone. That holds for **cards**, items whose bodies are drop places (toolbar groups, and panels under
`hitBand: "middle"`); an open panel's body is no drop place, so over a panel the pointer aims only in the bands at its
ends. Zones come in only where no item is aimed at: in the free stretch between two items, beyond the last one
and on an empty zone or edge, the zone extents (thirds, or the solved spans) say which zone's slot the pointer is over,
so a drop there can move the item to another zone with its order kept. A slot whose whole hit region lies over its neighbors'
facing halves is home's, and is no target of its own. The slot is where the item lands, at its size in that edge's form.

- `gap:<edge>:<zone>:<at>` (priority 2) for every edge whose `accepts` lists the item's kind (deny by default) and one of
  whose zones takes it (`edgeTakes`; an edge with `zoneAccepts: {}` takes it nowhere, as one that doesn't list it), in
  each zone that takes it, before each item of the zone and at its end, so an empty center or end zone can be opened; only where the item
  fits: not in the » menu, no `overflow`, nothing newly `too-wide`, every fixed item of the edge keeping its form, every
  protected one its place, and no chrome under its slot. Protected: the fixed items at a zone's anchor (from the start
  zone's first member, or the end zone's last, up to the first movable one), every fixed item of the center zone, and
  the fixed items of the other zones. A fixed item behind a movable one is placed by that movable's size, so a drop in
  its zone may push it; a gap between two fixed items has no place to aim at and is not offered. A fixed item with
  **`DockItem.pushable: true`** is not protected at the anchor: a movable item dropped after it may push it inward along
  its zone, so the gap at the end of a run of such items (a state cell and a page cell at a title bar's end) is a place
  and a stop, where a toolbar homed after them is put back ("state page zoom"). They keep their order: no gap between two
  `pushable` items is offered; a `pushable` item followed by an unflagged fixed one (window controls) is still a wedge, so
  no place between them. In the start zone the same rule is the mirror (a movable item dropped beside it, on its
  anchor's side, may push it inward): the gap **before** a run of `pushable` items at the edge's start (a title at a title
  bar's start, `gap:<edge>:start:0`) is a stop, and a drop there pushes them inward. Left out, a fixed item at the anchor keeps its place as before (window controls stay at the end).
  `pushable` is a declaration like `DockEdge.zoneAccepts`: `readDockState` takes it from `base`, `storeDockState` never writes it, and
  a stored one is dropped (`item:<id>:pushable`). A fixed item with **`DockItem.stepping: true`** (a page readout with a
  ladder of its own; also a declaration, never stored) steps through its forms, folds and goes into the edge's » like a
  movable item with the same forms (`StackItem.stepping`), and a drop may step it but never squeeze it under its form's
  least. It is still never dragged, and protected as any fixed item; while it is in the » (before or after the drop) it
  has no place along the edge, so "nothing lands between it and its zone's anchor" is read from the order of ids. It
  never holds for the title rule. Along the edge the gaps tile it: neighboring gaps meet at the midpoint of the
  item between them (see Aim order), else halfway between their lines, so an edge of a few short items (a bar, a rail,
  a column's footer) is covered from end to end. Only over an
  open item's body (a panel) the hit narrows to `DockEdge.hitBand` px around its line (default 24), so the middle of a
  panel is no gap and the pointer falls through to the float target (or to none). Gaps on one line are one target, the
  first in zone order: when a bar has no spare length, `center:0` and `end:0` lie on the start zone's last line and
  merge into that start gap (its id stays `gap:<edge>:start:<n>`). The first and last reach `endReach` px past the
  edge's ends, but only a hit that reaches the edge's end goes on past it (a column footer's gap at the foot never covers the
  top). Another edge's rect trims a gap's hit: one across from the edge (a bar above a column) at the hit's end along
  the edge, one beside it (a neighboring column) at its side. Across, the hit is the larger of the edge's thickness
  before and after the drop; a compact edge's hits reach 24 px further inward, except where another edge's gap is.
  Hits are cut clear of chrome and of every fixed item that doesn't grow (controls, a readout). A fixed item that grows
  (a title filling its bar) takes hits over its text, which land in the nearest gap; it reserves only its natural rect,
  placed by its zone (from its start, from its end in the end zone, centered in the center zone), and
  `reservedRect(state, layout, id)` gives that rect, for a host that marks where nothing may drop. The length it grew
  by is spare room: the drop shrinks it toward its natural size (to its `min` if the room needs it), so a group moved
  out of a title bar can always go back while the room allows. No slot lies over a fixed item's reserved rect. `slot`
  is the item's rect after the drop and `marker` the insertion line across the edge (data only; a page draws the slot
  as the landing's one mark).
- `endReach` only adds: it never shrinks or replaces a zone's own span along the edge, nor takes another edge's own
  span, nor what a column line or a rail stop tiles as its own (every target's pieces with `endReach` cover its pieces
  without it). An empty bar's band that cuts the strip off from its zone leaves the strip to the zone's outermost slot; past a
  bar holding items the strip stops at the bar.
- `strip:<edge>:<zone>` (2; three per empty edge, `:start`, `:center` and `:end`, one per third along the edge: a bar's
  width, a side edge's height, see Bar alignment zones): an accepting edge with no members at all (one that holds only
  closed members keeps its `gap:` ids), a strip `DockEdge.strip` px deep (default 24) along its side, inside the
  content and clear of the other edges (overlay ones included), so never over a docked edge or a panel's body: a
  full-width empty bar's strip covers only the content between the columns. A compact rail's strip alone stays at the
  window edge, its home. A gap hit that spans it across trims its start or end (a bar's strip along the top never
  covers the columns' first gaps); one across its middle is left to the smaller-hit tie-break. With nothing left (an
  empty outer bar on a non-empty inner one, a bar's strip all under an overlay column) it has no target. A third is
  offered only for a kind its zone takes (`DockEdge.zoneAccepts`); the others are refusals.
- `side:<side>` (2), only for a fixed item on an edge with `moves: "side"` (an anchor such as page thumbnails): the
  place its edge takes on the other side of its axis, landing as `setSide` puts it. A fixed item has no other target
  but home.
- `float:<id>` (3, free) when `floatKinds` lists the kind: the whole plane, landing with the pointer holding the float
  at `grab`, clamped and moved clear. It has no fixed `slot`: the slot to draw is
  `after(point, grab).layout.items[id].rect`, for the pointer at the time.
- `column:<side>:<ring>` (2): a new column on each column line of a side whose template's start zone takes the kind (outside the
  outermost open column, between two, inside the innermost, or at the content's edge), 22 px each way. Column lines
  about the item's own column when it is alone in it are the same move as home, so their pieces join home's hits
  (`home:<id>`), leaving no sliver beside it.
- `rail:<side>:<ring>` (1): docking folded into the side's rail, before each folded column's segments and after the
  last, or, while no rail shows, the outer 10 px from the side's outer edge (the window's, an inset's strip included;
  flush after the side's outside toolbar bars), landing where the rail lands. The outermost column line starts where
  it ends. A rail that shows offers its stops wherever the item ends up collapsed at that side (the same rule as the
  strip's below): its tile in the rail, or a rider bar over the side's open column when lifting the item lets a column
  that was folded by width reopen; the slot is that landing. The rail's tiles are also the places of a tile held from
  one of them: the gaps of its own column (`gap:<edge>:<zone>:<at>`), before each of the column's other tiles and after
  the last, wherever the tile would stay a tile in the rail, over the column's own run of tiles only; its stops are
  home's, and so is the rest of the rail. With no rail
  showing, the stop keeps its place only while
  one of its slots lands in the rail (home's counts): where every drop there is refused (a panel would ride over an
  open column), the outermost column line runs from the window's edge. A refused place is never drawn: no tint, outline
  or zone label over it; while the pointer is over one a host may say "Can't go here" at the pointer. A refusal matches
  what is drawn: an edge that takes the
  dragged kind in no zone is one refusal, `refuse:<edge>:start` (`n = 0`), over its drawn rect (the `DockEdgeLayout`
  rect, fixed items included) less what targets own, so the message shows over the whole bar as drawn
  (where a target splits it, every piece of 1 px and more is in `hits`, `hit` the largest: the pointer is in the
  refusal in any piece); a
  refused zone of an edge that takes the kind elsewhere keeps its slot's tile, inside the edge's ends. No refusal
  reaches past the stage. Hand them to the drag intent with the targets: `refusalTargets(refusals(state, id))` gives
  each one as a target marked `refuse: true` (its `refusal` the `DockRefusal`), which the intent never holds or
  shows, so a held target's band never covers a refusal; show "Can't go here" while the frame's `refused` is set.
  In the pick a refusal ranks at `REFUSAL_RANK` (2.5, exported with `pickRank` by `@n-uf/motion/drag` alone, which owns
  it; placement no longer exports either, and the reference host keeps a private copy of the value): an ordering
  rank, not a priority (priorities stay 1, 2 and 3; `refuse: true` is a refusal's tier), after every target of
  priority 1 and 2, before the float's 3. Where a refusal and a target meet or overlap (a gap's end on a refused bar's edge), the
  target wins however small the refusal is; over the refusal alone it wins over the float.
  The window's edge belongs only to the targets drawn against it: every refusal (`DockRefusal.bounds`, passed on by
  `refusalTargets`) and the float target carry the stage as `bounds` (`Target.bounds`), so they hold only points
  strictly inside the window. A pointer a host clamps exactly onto the window's edge (the host contract: `x + width`,
  `y + height`) picks a gap or slot whose hit reaches the edge, else nothing: a drop past the window over open space or
  past a refused bar commits nothing, and a held gap keeps its band. A host that clamps to `width - 0.5` still picks
  inside the window, the float or a refusal there included.
  A target's room opens with it where its indicator would otherwise cover what moves: a target whose slot overlaps an
  item that its drop moves (an empty rail pushing the column beside it, a new-column line, a bar's strip over the
  columns) carries `opensRoom`, and the drag intent shows it and reports `room` in the same frame. An item of the edge
  the dragged item leaves counts when the drop pushes it, not when it only closes up over that place; the items of the
  edge dropped on never do, so a gap between a column's cards is a plain gap. The wait depends on the target: `roomHold`
  = `EDGE_ROOM_HOLD` (0 ms: it shows on the frame an aiming pointer enters it) on a rail target or a new-column line
  against the window's left or right edge, so a toolbar held at the edge never jumps away across the column and back
  (grazing the edge opens the rail); the intent's `roomAfter` (160 ms) on any other; on a rail drop strip's target, also
  marked, none past the dwell that arms it. A release before it shows still lands on it. A host that draws only a marker
  opens the room on `frame.room && frame.shown?.opensRoom`, for every one of them. An empty rail or bar is entered over
  the depth a drop draws it at (a rail's or a bar's drawn depth), not a thin band; past the thin band that depth never takes
  the zones of a drawn edge that take the item, and an empty column keeps the thin band. A target whose drop changes an
  edge's thickness around the content (an empty rail beside a column, a new-column line, an empty bar's strip) also
  carries `roomHit`, the smallest rect holding its hit and its landing rect. While it shows with its room open, the drag
  intent holds it there: the drawn room is its zone, so a refusal or a place no more precise under it doesn't take
  over, and those places are reachable once the pointer leaves the room. A rail drop strip (`armedHit`) doesn't carry
  it.
  Every target keeps a reachable hit: its largest piece is at least 12 px across by 24 px along (`minHit`, data per
  edge kind), taken from the space beside it in its own zone (a column line's band, a gap's tile) where nothing else is
  aimed at, or from a neighbor that keeps its own minimum. Home, a drop strip, a refusal, the chrome and the stage's
  edge never give way, and a gap never grows over another drawn edge; where nothing can spare the space the target
  stays as it is, still a stop.
  For a kind with a rail drop policy, the rail is a spring-loaded drop strip instead (below).
- `none:<i>` (1) over each `state.blocked` rect, and `home:<id>` (1) over a docked item's own rect: a release there
  commits nothing. A floating item has no home, so a move inside its own rect is a float move (on the landing model, the lift zone of a float's lift, one with no spot marked `home`: no lane takes the pointer within `lift` of the press). A gap, column line or rail
  drop that would put the item back where it is (the gap beside it, its own column's line) keeps its id but is a home
  too: no slot, nothing committed. Every `rail:` target on the side whose rail already holds the item is a home: a
  segment dropped on a rail stop, even below the last segment, never splits the rail or opens a column. A tile of a
  column folded into a declared rail also has that column's gaps (`gap:<edge>:<zone>:<at>`, the places a column drawn as
  a rail offers), to move among its own column's tiles, staying a tile, and only over that column's own run of tiles in
  the rail: over the tiles of the rail's other columns the place is home. A host tells a home by `place.kind ===
  "home"`, never by the id: a home keeps the id of the first of its edge's places that puts the item back (`rail:<side>:<ring>`
  stays a rail stop's id, `gap:<edge>:<zone>:<at>` a gap's), and `home:<id>` covers the item's own rect.

**The target model.** `targets` and `refusals` come from one generation: edge, then zones, then slots, then tiles, then
one ordered filter (accepts and zones, fit, clipping, `blocked`). A target wins only where its own hit is, and every point
of an edge that takes the dragged kind is one target or one refusal of its own zone, never a hole, an overlap or another
zone's.

- **Zones.** A zone's extent is where its items lie: the thirds of a bar, of a compact rail or of a side toolbar bar;
  the solver's spans where items fill the edge (a plain panel column is one zone, its whole length; a tray column its
  panels' span and its tray's). An **empty zone is one slot**, a single place that takes the drop.
- **Slots and tiles.** A zone's slots are the places a drop can land (before each item, after the last); the zone's
  extent is cut into one tile per slot, each tile meeting its neighbor halfway. Slots that are the same move (one line
  and one landing, or both putting the item back) are one slot, the lowest `at` keeping its id. A place that would move a
  fixed item of its edge (before a title, after the window controls) is no slot.
- **Home.** Home's tile is the item's own interval, with no band around it: a stretch with no slot of its own is refused,
  never home's and never another zone's. Beside an item alone in its zone it is refused as `own-place`.
- **Space ownership** decides where tiles of different edges meet: owned, then virtual, then overreach.
  - A drawn edge owns its rect. An empty edge owns only a thin place band of 12 px (half the hit band) at the boundary
    where it would appear; so does the side's rail where none shows. The item's own place is owned before everything.
  - A column line is where a new column would appear, so it owns a 12 px place band too, centered on its line. Owned rects
    are ranked by the order the layout lays edges out: an edge laid first, whose filling pushes the other, wins (outer
    before inner on one side, full bars before the sides, the rail before its side's columns, a column line over the
    inner column it would push but not the outer one). Between edges laid independently a drawn rect wins over an empty
    edge's band. Two columns that touch keep the line at their seam.
  - A zone loses what an edge ranked before it owns, and its panel bodies and reserved rects before it is tiled; a zone
    left with no room offers no slot.
  - Overreach, the part of a tile past what its edge owns (the depth a column will have after the drop, an empty
    strip past its band, a compact rail's inward reach), comes last: it yields to the column lines and to every other
    edge's owned rect.
  - An overlay column is drawn on top, and what shows on top wins: an empty rail's place under it offers no `rail:` stop
    there, and a column line beside it yields to it.
  - A refused place owns nothing against other edges, zone by zone: an edge owns its band only along the zones with a
    slot the filter keeps (home's place aside), and a refusal of a zone with none takes only what every surviving target's
    tile and every other edge's owned rect leave (within its own edge a refusal keeps its tile). So a panel can always
    become its own column beside the others: an empty rail that would refuse the drop doesn't hide the new-column target
    just inside a side bar, and an empty top bar whose zone holds only the dragged item's place doesn't cover a column's
    top band.
  - An edge that only moves when the dragged item lifts (a side bar pushed inward by a rail that empties) owns where it
    lies after the lift, where its tiles are, never its old place.
  - Clipping changes a slot's shape, never who owns it: whatever is left of a slot's tile is the slot's. A target left in
    pieces has **`hits`**, every piece (optional on `Target`), and `hit` is the largest piece, for hosts that read one
    rect; the reference host's pick (`@n-uf/docking/testing`) tests every piece, as `@n-uf/motion/drag` does. Nothing of a slot's own room is
    refused.
- **The column lines and the rail are edges like the others**, tiled by the same rule. A column line or rail stop whose
  drop wouldn't land or fit, and any piece clipping cuts off its tile, is refused (`refuse:column:<side>:start`,
  `refuse:rail:<side>:start`, `no-room`) rather than left to the float.
- **Strips.** `strip:<edge>:<zone>` names a slot only on an edge with no members at all. On an edge that draws nothing
  but holds closed members (or the dragged item's own place), every slot keeps its `gap:<edge>:<zone>:<at>` id.
- **`DockLayout.railPlaces`:** where each side's rail lies, or would lie were one shown, for every side with a rail
  (`DockState.rails`): the shown rail's rect, else where a drop into the rail lands. With no rail shown, the `rail:` strip is
  10 px of it. Targets read it; a host draws `rails` (the shown rails), never `railPlaces`.

**Refusals.** `refusals(state, dragged, options?)` gives the places a drop is refused, as `{ id, edge, zone, hit,
reason }[]` (type `DockRefusal`): the stretches of a zone with no slot of their own, and the side edges that don't take
the kind (as a whole, zone `start`). `reason` is `"no-room"` when the zone takes the kind but no place of it fits along
the edge (a title bar at the title's natural width say: lack of length), **`"too-thick"`** when it takes the kind but no
form of the item fits across the edge (every form but the » menu's sets no cross size and asks, at its least, more
across than the bar is thick: a 30 px toolbar on a 28 px bar; no length would make room, so the host can say the item
is thicker than the bar; one test for every edge: a new column's line against its template's `cross.max`, a rail stop
against the rail's `width`, and a slot's refused pieces say what its zone says), `"not-accepted"` when the zone or the
edge doesn't take the kind, and **`"own-place"`** for the stretch beside an item alone in its zone (whichever the
zone's refusal for want of room): there is room, but the zone's only place is the item's own. An exhaustive
`switch` over `DockRefusal["reason"]` needs the `too-thick` and `own-place` cases. Ids are `refuse:<edge>:<zone>` and,
when a zone has more than one refusal, `refuse:<edge>:<zone>:<n>`, numbered by where they lie along the edge (then
across it), so an id holds from one frame to the next; no id is given twice by one call. A refused slot is refused over
its own tile. A host shows "no room here" at the pointer over one, with no slot anywhere; a release there commits
nothing, the item goes home. It takes the same `previous` and `fresh` as `targets`.

**Ids, read and built.** These formats exist in one place. A host reads an id with `parseTargetId(id)` and builds one
with `targetId(parts)`, so it never splits strings (an edge id may hold `:`):

| Helper | What it does |
|---|---|
| `targetId(parts)` | The id for `{ kind: "gap", edge, zone, at }`, `{ kind: "strip", edge, zone }`, `{ kind: "column" \| "rail", side, ring }`, `{ kind: "home" \| "float", item }`, `{ kind: "none", index }` or `{ kind: "refuse", edge, zone, n }` (`n` 0 for a zone's first refusal). |
| `parseTargetId(id)` | The same parts (`TargetIdParts`), or null for an id outside the scheme. |
| `placeTargetId(place, item)` | The id `targets` gives the target at a `DropPlace` (null for `none`). |
| `virtualEdgeId(kind, side)` | `column:<side>` or `rail:<side>`: the virtual edge a refusal names in `edge`. |

**Rail docking: a drop strip per kind (`DockState.railDrop`).** A side's rail is one concept: the strip where its collapsed
panels show. Where the state declares it (`DockState.rails[side]`) it is that rail; where it doesn't, it is the side's
outermost column that takes the kind in its start zone, drawn as a rail once nothing in it sets its width. A kind with
a `RailDropPolicy` reaches it through one drop strip per side, at the window's side, at the rail's real width, even
while the rail is empty: its targets are `rail:<side>:<ring>` with `arm: "dwell"`, `armedHit` and `strip`. The drop
means "collapse it at this side" and is offered on every side whose rail takes the kind, whether a rail is drawn now or
not: it is the same change as "Move to › Rail", `moveTo(state, id, { kind: "rail", side, ring })`, and lands wherever
the state shows a collapsed panel there. With a rail drawn that is a rail tile; under `handFold: "ride"`, with the
side's column open, a rider bar over it; on a side without a declared rail, `moveTo` puts the item at the end of the
side's outermost column's start zone as a collapsed header ("the column drawn as a rail"), a rail tile once nothing
in that column sets its width. The slot is that landing, so the preview is the drop. The strip
owns its rect: every other target and refusal of the drag gives it up, home's included (an item alone in its column
reaches its side's rail from its home), and an empty column's own drop strip moves just inside it, as does the line for a
new outermost column on an occupied side (flush, the strip owns the window's edge): it keeps the band it owns, as with
no strip (it beats the inner column it would push, card halves included), giving way only to home, a blocked rect and
the other column lines, and the inner columns' gaps and refusals on its side stop short of it; it is one of `stops`,
so a host's "Move to ›" reaches it. Before the
strip arms, a drop there is the float's. A kind with no policy gets the plain rail targets (immediate, no strip); tuning one kind
never changes another. The policy's fields, each default with its reason:

| Field | Default | Why |
|---|---|---|
| `railStripWidth` | the rail's drawn width, at least `RAIL_STRIP_MIN` (24) | A target at the window's edge is easy to hit when it is wide enough to aim at (Fitts's law); the rail's own width keeps the strip where the panel will land. `0` turns the kind's rail docking off. |
| `railVisibility` | `"whileDragging"` | A drop target shows while it can be used. `"always"` draws it at rest too; `"never"` turns rail docking off. |
| `magnet` | `DEFAULT_RAIL_MAGNET` (6 px) | Once armed, the strip grows inward so a hand that wobbles keeps it: that grown strip (`armedHit`) is the armed target's band. Moving out past its outer edge disarms it, and re-entering needs a new full dwell. A host draws the growth with no animation under `prefers-reduced-motion: reduce`. |
| `floatNearEdge` | `true` | Before the strip arms, a float may sit near the window's edge, as it may anywhere; `false` keeps a float's rect clear of every strip. |

The time and the keys are the drag intent's (`@n-uf/motion/drag`): `armAfter` (200 ms) arms a target marked
`arm: "dwell"` (spring-loading), and `modifiers` let Shift float anywhere and ⌘/Ctrl collapse into the nearest rail (Alt stays free: it unfreezes a frozen layout).

**Over an unarmed strip.** While the pointer is in a strip that hasn't armed yet, the intent shows no target there (a
drop is the float's), and its frame's `arming` names the strip being dwelt on. The host draws the strip's pre-arm
highlight from `arming` (and the armed growth from the shown target), so that stretch never looks dead. A refusal never
lies under an armable strip: the strip owns its rect, and every refusal gives it up (a property test holds it).

A gap, column or rail target exists only where the drop keeps the whole window sound: it adds no `overflow` or
`too-wide` note to any edge, changes no fixed item's form, squeezes none under its `main.min` anywhere (a between bar
under a new column included), and lands its slot on no kept-clear rect. The rule compares notes: in an edge that already
overflows (or holds an item already too wide), a drop that adds no new note is accepted, even when it shifts a fixed
item that was already squeezed.

`stops(state, id)` gives the same targets, home and none left out, in reading order (the left side outer to inner, the
top bars, the bottom bars, the right side inner to outer, floating last) for "Move to ›" and the arrow keys. A dock state is
an immutable value, so `stops` remembers its answer per state object: the stops of an item of one state object with the
same options (`previous` by identity) are solved once, and asking again (a menu redrawn, a host asking on every render)
costs a lookup. Each call still returns a new array over the same targets. Pass a changed state (a new object) to get
fresh stops; mutating a state in place is not supported.

Each target's `after(point, grab)` is a `DropResult`, `{ state, layout }`: the state to commit (the item moved and just used) and
`solve(state, { previous })`. The host draws every item from `after.layout` during the preview and commits
`after.state` on release, so the preview is the result by construction.

**Changes** are pure and return the state given when nothing applies: `moveTo(state, id, { edge, zone?, at })`,
`floatAt(state, id, rect?, orient?)` (with no rect: its `floatSizes` for the orient it floats in, else its form's natural
size, anchored to the content's top-right), `foldItem`,
`markUsed` (idempotent: on an item whose `used` is already strictly greater than every other item's it gives back the same
state object, so a press on the newest item stores nothing new; any other item, or one tied with another, is bumped to
the newest age plus one), `keepItem`, `raiseFloat` (a float on top: no use, no reshape), `openItem`, `closeItem`,
`orientFloat`, `resizeEdge`, `resizeFloat` and `setSide(state, edgeId, side)`. `resizeEdge(state, edgeId, size)` sets
the user's size across an edge; `resizeFloat(state, floatId, rect, moving?)` resizes a float by hand at `fitResize`'s
rect (see "Resizing a float by hand"; the state given back where `fitResize` gives null). `setSide` moves an edge to the other side of its axis (left ⇄ right, top ⇄ bottom) as
its side's outermost edge: ring 0, before that side's other edges, whose rings close up behind it (the side it left
closes up too). Its items, size and options go with it; the state is given back unchanged for an unknown edge, the side
it is already on, or a side across its axis. Like every change it ticks no use clock: a host that moves an edge by hand
calls `markUsed()` on its items afterwards, as a drop does. The stored form keeps the side, and `readDockState` moves a static edge stored
on the other side of `base`'s with `setSide`. `foldItem(state, id, on)` is a grip's double-click: folded by hand, an item
takes its first `folded` form on the axis it lies along (a panel's `header`, a group's `fold`, its grip and »; else its
`rail` tile), never the next variant (a group's `stacked` or `icons` are for give-way only), and give-way steps down from
there; unfolded, it takes the form the room allows again. `canFold(state, id)` says whether a hand fold means anything
where the item lies (false: no folded form on that axis, and `foldItem(…, on)` changes nothing), so a host can leave the
double-click off. **Dividers**: `DockItem.lengths` (`{ column?, row? }`, px along the edge, per axis) is the length a person
asked an item to have; `solve` hands it to the edge's stack, which reads it in place of the natural of a growing form
(`@n-uf/placement/stack`, "Dividers"). A length in `lengths` is in ask units, not drawn px; with room to spare a drawn size is the ask
times the shared scale, or its least when that is more (short of room an ask under the least reads as the least, and a 0
is no length). `resizeBetween` and `resetBetween` write it for the two items of the pair only; a bystander keeps what it had, none
when nobody sized it. `dividers(state, layout?)` lists one `DockDivider` (`{ edge, before, after, rect,
range }`, stage px) per pair of neighboring open growing items of each edge; `resizeBetween(state, before, after, delta,
{ layout? })` trades `delta` px between the two (a negative one the other way, clamped to `range`), `resetBetween(state,
before, after, { layout? })` gives them their natural split back (the double-click), and `resetLengths(state, edgeId)`
clears every length of the edge's axis. Each is a change in the sense above: the state given back when nothing applies
(not neighbors in one edge, an unknown item or edge, a float, a `delta` clamped to 0). `layout` is what `solve` returned
for this very `state` object; left out, made for another state (another stage size, an item moved) or stored and read
back, the state is solved first. The length travels with the item (moved,
closed and reopened, folded) and is per axis, so an item moved to a bar never reads a column length;
`storeDockState` keeps it (`items.<id>.lengths`) and `readDockState` reads it back, dropping a bad entry as
`item:<id>:lengths:<axis>`; a store without it reads with none. `moveTo` and
`floatAt` refuse fixed items and kinds the edge or `floatKinds` doesn't list. `moveTo` also takes `{ kind: "column",
side, ring }` (`ring: Infinity` is the side's inner end: "Move to › Dock left"), `{ kind: "rail", side, ring }` (docked
folded) and `{ kind: "float", rect?, anchor? }`. `homeFor(state, id, start)` is the place a start state gives the item
(the same edge before the same neighbor, a new column at its ring when its column is gone, or its float), for Dock,
Put back and Reset position: `moveTo(state, id, homeFor(state, id, start)!)`. `dockHome(state, id, start)` is that and the
start fold too: the item goes to `homeFor`'s place and takes `start`'s `from` (unfolded when `start` has none), so a "Move to ›
rail" (which folds it) followed by Dock brings it back open; the state is given back unchanged when `start` places it
nowhere. `liftItem(state, id)` is the state while an item is held: the item out of every edge and float, and a dynamic
column it leaves empty gone (its side's rings closed up). While an item is held, a host draws every item from the shown
target's `after(point, grab).layout`; with **no target under the pointer** it draws the committed layout with the held
item's place left empty and nothing else moved (a release there commits nothing). It does not reflow the others with
`solve(liftItem(state, id), { previous })`, which would show a result no drop gives.

**Stored form.** `storeDockState(state)` gives `{ v: 1, edges: [{ id, side, ring, items, size?, column? }], floats: [{ id, x, y,
width, height, orient?, anchor?, since?, stays? }], items: { [id]: { used, kept?, from?, closed?, align?, space?, floatSizes? } } }`; no float has a
pinned field. An item's `floatSizes` is `{ row?, column? }`, each a size; an entry that isn't one is dropped and listed
(`item:<id>:floatSizes:<orient>`), and a store with the old single `floatSize` reads as `floatSizes` for the orient its
float is in (the item's own orient where it floats nowhere), but on a float whose store declares no `floatSizes` it
is dropped (`item:<id>:floatSize`). A float's `since` (when it was floated) is kept as stored; one that isn't a number from 0 to
`Number.MAX_SAFE_INTEGER` is dropped and listed (`float:<id>:since`), and a new `since` never goes past that. A float's `anchor` is stored as given, a name or `{ at, dx?, dy? }`, and read back as stored: the clamp
on read moves only its rect, which an anchored float doesn't lie by (an unusable anchor or offset field is dropped and
listed, `float:<id>:anchor`, `float:<id>:anchor:dx`). A float's `stays` (the hand left it over content,
`DockFloat.stays`) is stored as `true` on a float with no anchor and read back so; one that isn't `true`, or one on an
anchored float, is dropped and listed (`float:<id>:stays`). `readDockState(data, base)` takes kinds, forms, limits and edges from `base` and order, sizes and states from
the store, never throws, and lists what it drops: unknown edges and items, kinds an edge doesn't accept, fixed items
stored in another edge than `base`'s, bad fields, a `pinned` field. A stored edge's order is kept exactly, fixed items
where the store put them, so a drop after a fixed item round-trips; a fixed item the store lacks goes back to its base
place (trailing ones last). An item the store places nowhere goes where `base` has it, and floats are clamped into the stage by what `solve` draws (a folded float by
its bar), never cut, so a reload lands where it was drawn. Dynamic columns are the store's: one
`base` lacks is made from `base.columns[side]` at its stored ring, and empty ones are deleted. Anything but version 1
gives `base` back with an `error`.

**Option, place and stored types.** The exported types are the contract; these are the ones a host names most.

| Type | What it is |
|---|---|
| `SolveOptions` | `solve`'s second argument: `previous` (the layout the state had before, so a press reshapes nothing; see `previous` above) and `fresh` (edge or item ids solved without it). |
| `Place` | Where `moveTo` puts an item: one of the four places below, told apart by `kind` (a `DockPlace` has none, or `"gap"`). |
| `DockPlace` | `{ kind?: "gap", edge, zone?, at, space? }`: before the `at`-th item of `zone` (default the item's own zone) in `edge`, counted without the moved item, keeping `space` px free on the zone's open side. Docked into the room a placed neighbor keeps, it consumes that room. |
| `ColumnPlace` | `{ kind: "column", side, ring }`: a new dynamic column on a left or right `side` at `ring` (`Infinity` is the side's inner end). |
| `RailPlace` | `{ kind: "rail", side, ring }`: a new column holding the item folded by hand, so it shows in the side's rail. |
| `FloatPlace` | `{ kind: "float", rect?, anchor? }`: floating at `rect`, or, with none, at its last size anchored to the content; `anchor` is a name or `{ at, dx?, dy? }`. |
| `DockLaneOptions` | The options of `lanes` and `dockDrag`: `DockDropOptions` (`previous`, `endReach` default 0, `floatSize`, `floatFromHeld`, `floatOrient`, `fresh`) and `pitch` (default `SPOT_PITCH`, 40 px), `stretchPositions` (`"free"`, the default, or `"pitched"`), `snapDistance` (8 px), `grab` (where the pointer holds the item, from its top left corner) and `emptyLanes`. |
| `EmptyLanes` | `"real"` (the default) or `"edge"`: how an empty lane's marks draw it, a box at the size it will take or a thin striped strip (`HATCH_EDGE`) on its window side. Where it lands is the same either way. |
| `StoredDockState` | The stored form: `{ v: 1, edges, floats, items, railModes? }`, plain JSON-safe data. `railModes` says per side how its rails show their items. |
| `StoredDockStateEdge` | `{ id, side, ring, items, size?, column? }`: an edge's order of items and its `size`; `column: true` marks a dynamic column, read back from the side's template even when `base` lacks it. |
| `StoredDockStateFloat` | `{ id, x, y, width, height, orient?, anchor?, since? }`: a float's rect, orient, anchor and when it was floated. |
| `StoredDockStateItem` | `{ used, kept?, from?, closed?, align?, space?, lengths?, floatSizes?, floatSize? }`: an item's state. `floatSize` is the old single size, which `readDockState` reads as `floatSizes` and `storeDockState` never writes. |
| `DockStateRead` | What `readDockState` returns: `{ state, dropped, error? }`: the state read over `base`, what was left out, and the reason when nothing could be read (`state` is `base`). |

## Testing (`@n-uf/docking/testing`)

`@n-uf/docking/testing` is the model's behavior as data, so an integrating app's test suite and the lab run the same rows. A row
is `{ id, title, expect, state, settings?, gestures, expectLayout, expectDom? }`: a dock state, the stage and freeze it runs
at, what a user does (`press`, `move`, `release`, `key`, `click`, `resize`, `scroll`, `hold`; a `move` may name a target
by its `place` instead of pixels), and what must be true after: a partial layout (per item: `rect`, `formKind`, `edge`,
`floating`, `inMenu`, `rail`…, within a tolerance, 0.5 px by default) and, for a host with a page, DOM checks on the
session's marks (`data-drag-session` on the root during a drag only, `[data-drag-slot][data-drag-target]` for the slot
(the attribute holds the target's id; a landing draws that one mark, so a page shows no `[data-drag-marker]` insertion line beside it), `[data-drag-held]` for the held item, `[data-drag-refusal]` for a refusal
shown at the pointer, "No room here", the attribute holding the refusal's id).
A drawn item's element is `[data-dock-item="<id>"]` by default, and a DOM check names it with `item` (not a literal
selector), optionally pinning its `rect` in stage px; a host that marks items another way gives `itemSelector(id)`. A row
may also carry `checkpoints`: the layout after an earlier gesture, for what the preview shows while the
pointer is still down; a checkpoint or DOM check is never read right after a `move`, a `hold` comes first so a host's drag
intent can settle. `expectStored` pins the stored form (ages, folds, no `pinned` flag) and `expectStops` the places "Move
to ›" offers, in order. A press's grab (`point`) is the row's: a float lands at the pointer minus the grab, so every press
that ends in a float gives one. A `move` with no target under the pointer draws the committed layout with the held item's
place left empty and nothing else moved. A row with `lacks` names a library rule the model doesn't have yet and is expected
to fail until it lands. A host reaches the end gaps 24 px (`END_REACH`) past an edge's ends.

A window row's stage (`CaseSettings.stage`, a `resize` of the window, the state's own `stage`) is the window's **body**: the
content area inside any canvas padding, so window A's 12 px padding lies inside its 808 px (808 = 12 + 220 + 12 + 320 + 12 +
220 + 12), and a host whose own stage leaves its padding out sets its body to the row's stage, with no table. A row's
pointer `point`s are body px. The runner clamps every `move` to a `point` into the stage before it reaches the host (the
host contract: a pointer past the window's edge means its nearest point of the window, so a drop target at the edge stays
under a hand that overshoots it), so every host plays the same point, and a row means what the clamped point
picks. A row may carry `requires`, what its state needs of the host's window (`hitBand: "default"`: an open panel's body
is no drop place, so a host whose columns use `hitBand: "middle"` skips or marks the row; `rails`: the sides whose rail
the state shows at the start); the runner reads none of it but `docks`.

**A host-declared docking width.** A host that docks panels only from some stage width gives `dockMinWidth` (px; absent:
it docks at every width). A row whose expected outcome depends on docked panels carries `requires: { docks: true }`, and
the runner skips it when its stage is narrower than that at any point (its start, or a window `resize`): the result is
`ok`, with one `skipped` entry, "the row: it needs docked panels at 540 px, and the host docks from 720 px".

A host that names things differently gives `ids`, a row id to its own id (`{ views: "panels", tools: "commands" }`, items and
edges, one to one; an id left out keeps its name). The runner hands the host its own ids (the state, the gestures, `stops`,
`itemSelector`) and reads the layout, the stored form and the stops back in the row's, so no expectation changes. One
function does both ways (`mapState`, `mapGesture`, `mapLayout`, `mapStored`, `mapPlace`, each taking a `Rename` that
`idRenames(ids)` gives as `to` and `from`), and a host may use them to translate for itself.

```ts
import { targetAt } from "@n-uf/motion/drag";
import { CASES, createReferenceHost, runCase } from "@n-uf/docking/testing";

const row = CASES.find((c) => c.title === "The drop preview is the rect it gets")!; // a row's title says what it holds
const result = runCase(row, createReferenceHost({ pick: targetAt })); // motion's pick rule
console.log(result.ok, result.failures, result.skipped.length); // true [] 6
```

`runCase(row, host)` loads the state, performs the gestures in order and compares; it returns `{ ok, failures, skipped }`.
A host is `{ load(state, settings), perform(gesture), layout(), root?(), itemSelector?(id), stored?(), stops?(item) }`:
`layout()` is what the page draws now (during a drag, the target's `after.layout`, the preview), `root()` is its root,
anything with `getAttribute` and `querySelectorAll` (and `getBoundingClientRect` for rect checks), `itemSelector(id)` the
selector under it of the element that draws an item (default `[data-dock-item="<id>"]`, also exported as
`defaultItemSelector`), `stored()` the stored form and `stops(item)` the "Move to ›" places; a check the host can't make is skipped and listed in `skipped`. A check pointing at
a gesture the row doesn't have fails the row. `createReferenceHost()` is the reference: no page, no pointer, no clock, a drag
session that lifts past 4 px, asks `targets` for every target, takes the one under the pointer by its pick rule,
draws the preview from its `after.layout` and commits `after.state` on release, every solve carrying the layout before
it as `previous`. An integrating app's host does the same with its own pointer; `resolvePlace(targets, place, item, { stage, content
}, pick)` turns a `place` into a point that reaches the target. It aims outside the dragged item's own rect whenever a
point there reaches the target, as a person aims, so a drag intent's home gate never holds the aim: `AimArea.own` is that
rect (a held float's too), and without it the list's `home` target's hit is used; the reference host passes it. Every row
passes on the in-memory host except its DOM checks, which it skips, and the rows with `lacks`, which fail on it until the
library rule lands. A row with `requires: { intent: true }` checks what a drag intent adds to the pick at a point (a
shown gap held a band's width past its hit): a host without one, the in-memory host among them, skips it. A row with
`requires: { railDrop: "state" }` aims at a pixel whose meaning depends on the state's own rail drop strips: a host that
lays its own skips it. A row that only means a place aims by place (`resolvePlace`), so it holds either way.
`CASE_GROUPS` lists the groups.

The rows run on any host, a page's included: the reference host and a page's host play one list of steps and agree on every
row. Two pure helpers keep a page's host equal to the
reference one:

- **`withRefusals(pick, refusals(state, dragged))`** is the pick rule with the state's refusals: where nothing more precise
  than the float is under the pointer and a refusal's hit holds it, nothing is picked, so a release there commits
  nothing and the item goes home ("No room here"; a page marks the refusal at the pointer with `[data-drag-refusal]`).
  The reference host aims and drops with it, and a page's host aims `resolvePlace` with it.
- **`resizeStep(state, start, layout, gesture)`** plays a `resize` gesture as a pure step, for any host: it gives the state
  after it and the loaded state (`start`, what `"dock"` puts items back to) after it. With `edge`, the user's size across
  that edge; with `item`, that item's largest form along its axis grown by `size` px (in both states: it was measured
  again); with neither, the window is now `point.x` by `point.y`. It throws when the gesture names nothing that exists.
  The reference host uses it.

**The pick rule** (which target the pointer is over: the lowest priority number, then the smallest zone, every piece of
`hits` counted, a rect holding its edges exactly) is `@n-uf/motion/drag`'s `targetAt`, the rule the drag intent runs.
Docking doesn't import motion, so the host takes it as an input: `createReferenceHost({ pick: targetAt })`, the last
argument of `resolvePlace`, and a host's optional `pick` (`PickRule`). Without one, the reference host uses its own copy
of the same rule, held equal to `targetAt` by a test.

**The gesture grammar.** A row's `gestures` are plain objects (`g.press(...)` and the other `g` constructors build them),
played in order:

| `type` | What a host does |
|---|---|
| `press` | Pointer down on `item`'s grip (or its header); `point` is the grab, relative to the item's top-left corner, and is the row's, not the host's. Nothing lifts yet. |
| `move` | The pointer moves to `point` (stage px) or to the target at `place` (`resolvePlace` finds a point that reaches it). With an item pressed, the first move past the lift threshold lifts it (a `place` always lifts), and the pointer is then over whichever target the host's pick rule finds. With no target under it, the host draws the committed layout with the held item's place left empty and nothing else moved. |
| `hold` | The pointer rests for `ms`, so a host with a drag intent settles on its target. A checkpoint or DOM check is never read right after a `move`. |
| `release` | Pointer up: after a lift, it drops on the target under the pointer (a `home` or `none` target, or none, drops nothing); without one it was a press and nothing changes. |
| `key` | `"Escape"` cancels the drag, `"Alt"` holds Alt down and `"Alt:up"` lets it go (a frozen window moves while it is down), `"Reload"` stores the state, drops the live one and reads it back. |
| `click` | The item's controls, not a drag. With neither `key` nor `place` it activates the item (a closed one opens, one folded by hand unfolds, a float rises). With `key`: `"use"`, `"open"`, `"close"`, `"fold"`, `"unfold"`, `"float"` or `"dock"` (`dockHome`: where the loaded state had it). With `place`, the "Move to ›" row for that place. |
| `resize` | With `edge`, the user's size across that edge (`size` px); with `item`, that item's measured length changed by `size` px; with neither, the window is now `point.x` by `point.y`. |
| `scroll` | The pages scroll by `size` px. Nothing in a dock state scrolls: only a host with a page can show it, with a DOM `rect` check. |

**Driving the rows from a browser runner.** An integrating app's page is driven from outside (Playwright, say) with real pointer
events and timers, so its host's calls are async. `runCaseAsync(row, host)` takes an `AsyncCaseHost`, the same members
as a `CaseHost` but each of `load`, `perform`, `layout`, `root`, `stored` and `stops` may return a promise
(`itemSelector` stays a plain function). It awaits every call, in the same order as `runCase` makes them, and checks the
same way: both play one list of steps. A rejected `load` or `perform` is a failed result with the error's message, as a
thrown one is in `runCase`. `runCasesAsync(rows, makeHost, { onResult })` runs the rows one after another (a page has one
pointer), each on a fresh host (`makeHost` may be async), and reports each result as it is known. A sync `CaseHost` works
with both.

```ts
import { CASES, runCasesAsync, type AsyncCaseHost } from "@n-uf/docking/testing";

// A host over a Playwright page: each call goes to the page and resolves when the page has done it.
declare function pageHost(): Promise<AsyncCaseHost>;
const results = await runCasesAsync(CASES, pageHost, { onResult: (id, r) => console.log(id, r.ok) });
```

**Landing rows.** `LANDING_CASES` are the landing model's properties as rows, for a host that drags with one
(`@n-uf/motion/drag`'s `createLandingModel` over `lanes()`): a dock state, the item dragged, a pointer path at a speed (its
first point the press), a rest, and what holds on every frame while the pointer moves (the lane held, lanes or regions
never shown, how far the landing may trail the pointer, or no further than the same path played slowly plus a
margin), on the last frame and in the layout after the release. They cover the rail repro, the window's edge (on it
and up to 48 px past it docks, beyond is nowhere), a fast pass over a bar, lane to lane at a corner, a fast hand along
a free stretch and across docked items, and a toolbar taken away by one end and brought back to its press point,
which lands home. A host implements `play(row)`: its frames (`LandingCaseFrame`), the layout after and, where its
geometry differs from the row's window (its own gaps or paddings), `before`, its layout at the press (taken before the
pointer moves, never after the release): a row's `home` (the item ends where it lay at the press: same edge, same order,
same rect) compares with it, so no pixel value of the row's window is asserted. `runLandingCases(rows, host)` says what
differs. Docking doesn't import motion, so the reference host takes
the model as an input, as the reference host of the rows takes the pick rule:

```ts
import { createLandingModel } from "@n-uf/motion/drag";
import { createLandingHost, LANDING_CASES, runLandingCases } from "@n-uf/docking/testing";

const results = await runLandingCases(LANDING_CASES, createLandingHost({ landing: createLandingModel }));
expect(results.filter((r) => !r.ok)).toEqual([]); // every row runs on every host
```

The rows that bring an item back to its press point pass only on a host that passes its grab to `lanes()`; the rows
that slide a toolbar held by its grip past or across neighbors, on a bar and up a rail (`landing-grip-*`), check the
hand rule (`moving.hand`: the landing is the nearest in its lane and within `handBound(g)` = `max(48, g / 2 + 6)` px of
the pointer, `max(56, g / 2 + 6)` on the single frame before a hop, where `g` is the gap between the facing edges of
the two adjacent landings the pointer lies between; `HAND_TRAIL`, `HAND_TRAIL_BEFORE_HOP`, `HAND_MARGIN`;
[decision 0001](decisions/0001-the-hand-rule.md)). The checker reads the spots from `lanes()` over the row's dock state,
in the held spot's layout and, for `play`'s `stretchPositions`, as the host asked; landings that overlap or touch the held one
(no more than half a pixel apart) count as its place and are not compared with it (overlapping ones, spots a pitch
apart, are cut at the grab, touching ones where they meet, so in either the pointer may lie up to the grab inside the
other), and a frame of a hand faster than `HAND_FAST` (0.375 px/ms, the landing model's `step`) isn't compared with the
nearest, since a hop that reflows the window may wait for it. A frame in a lane `lanes()` doesn't give for the row
(another host's ids) is held to the floor, `handBound(0)`, and its issue names that lane. The rows that
pass a neighbor keeping room (`landing-room-*`) check a dock consuming the room it lands in and an item over a neighbor
taking its place; the row that slides over room a neighbor steps down to make (`landing-step-down-room`) checks that a
stretch is the room the drop makes. The rows that check the Near guides (`landing-near-*`, `moving.nearGuides`: a
toolbar glided from a bar to an empty side rail beside a panel column, a release while the rail is pending, a corner
between two lanes with no flicker) check that a Near guide shows a lane only where the pointer can enter it
(`approach.reach` 12). The rule (`nearGuideIssues`): on every frame that shows a guide of lane L, (a) L holds the
pointer (also on its own refused stretch), (b) L is pending (the frame's `pending`, which a host reports), or (c) the
pointer is in open space within `NEAR_REACH` (12 px) of L's rect; so none shows over a refused place outside L.
`moving.guideSwitches` bounds how often the lane whose guides show changes; `end.pending` and `end.landing` read the
last frame. `createLandingHost({ landing, stretchPositions })` asks `lanes()` for the stretch
positions given (the library's default when left out), and wires the model as a host does:
`landing({ ...drag, preview: { mode: "placeholder", placeGuides: "near" } })` (`LandingRule`'s options are `regions`,
`landingOf`, `spotsOf`, `home?` and `preview?`; the drag's `home` comes with the spread).

**`AssertLanding`.** `AssertLanding<R>` is a type that compiles only when `R` is assignable to `@n-uf/motion/drag`'s
`LandingRegions`, so a host's suite (or this package's own, `test/landing-check.test.ts`) proves at compile time that
the lanes it hands the landing model fit it. It is a type only: the testing entry's JavaScript imports nothing from
motion.

```ts
import type { DockRegions } from "@n-uf/docking";
import type { AssertLanding } from "@n-uf/docking/testing";

type LanesFit = AssertLanding<DockRegions>; // a type error the day the two shapes part
```
