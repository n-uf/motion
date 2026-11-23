- **One aim order for `targets()` and `lanes()`.** Both now cut where one place along an edge meets the next by one
  rule (`aimCut`): a panel column takes a panel by halves of what is drawn, as before; a bar or a toolbar rail takes the
  nearest landing, halfway across the gap between the two landings either side of a neighbor, at the grab where they
  overlap. `lanes()` cut this way already; `targets()` cut a toolbar's neighbor at its middle, so a host reading the
  tiles and one reading the lanes could put a toolbar on opposite sides of the same neighbor for the same pointer. The
  tiles now follow the lanes, across zones and past fixed items too (one place in the edge's order is one stretch, as a
  sliding spot is): dragged over a neighbor of its own length, a toolbar takes that neighbor's place, and
  home holds its own place only up to the cut beside it. A slot that lands within half a pitch of the item's own place
  (pushing a neighbor) is home's, as in the lanes. A toolbar tray at a column's foot cuts by halves, like its column, as
  before.
- **Two docks at one landing: the zone beside the stretch.** Where a sliding spot's start (or another of its snap points)
  is also a center dock's landing, the dock in the zone of the neighbor before the stretch wins, so a drop flush after
  the last start-zone toolbar stays in the start zone.
- New: `DockDropOptions.grab` (where the pointer holds the item, as `DockLaneOptions.grab`): the tiles cut overlapping
  landings there, as the lanes do; without it, the item's middle. `DockDropOptions.pitch` (as `DockLaneOptions.pitch`,
  which `lanes()` passes on): half of it is how far past an overlap the cut may move, in both paths.
- **Stops are the places; the pointer takes the nearest.** A place whose landing is never the nearest to any pointer
  (behind a fixed run, say) has no hit in `targets()` and a spot with no stretch in `lanes()` (its guide still drawn);
  `stops()` still lists it, at its landing, so "Move to ›" and the arrow keys keep every place they had.
- **A sliding spot's target holds its stretch.** Its `hit` now runs over the spot's stretch of the lane, not over its
  whole range of landings, which ran into the neighbors' stretches.
- **Three layouts, one job each.** On a bar or a toolbar rail which places exist and fit is read in the room, growth
  off (the gap beside a grown row stays a place); where the aim cut between two places lies is halfway between their
  landings, each in the layout its own drop commits (a grower as that commit draws it), in the tiles and the lanes
  alike, never from insertion lines; what is drawn is `shown(frame)`. A place over free room cuts from its range's
  ends, the room its drop makes, so beside a growing neighbor (a title, a stretchable panel) whose slack a dock takes,
  the slack is reachable: the place after it starts halfway from the landing before the neighbor. The tiles order
  places by their landings, not by their zone pieces, so where a grower moves a landing past another place's (a center
  dock beside stretchable panels), both paths agree. A place is unreachable only where its landing is another's.
- **A place whose cuts cross moves no other cut.** Where a place's cut after it would lie before its cut before it (a
  sliding spot where the item lands in a shorter form, between two docks that overlap), it is nearer no pointer: both
  paths leave it out of the cutting, its neighbors cut between themselves, and it keeps a spot with no stretch (a stop).
  Before, the lanes kept their cuts in order by pushing the next cut on, so the place after the crossed one started late.
- Changed (behavior): **a sliding or pitched dock counts the dropped item as just used**, as every target's drop
  already did ("a dropped item counts as just used"): one model on both paths. So on a full bar, after a slide, the
  neighbor that gives way is the one the solver gives up first for the freshly used item: the least used goes to the »
  where a neighbor used to step down to a shorter form to make a single start (a toolbar dropped beside two others on a
  bar with room for only two keeps the bar, and the least used of the two moves to the »). A slide's commit and the
  tile's for the same place now agree on which neighbor that is.
- **The grab's share reads the held item.** `targets()` reads `DockDropOptions.grab` as a share of the item's length as
  held (a movable grower at its natural length), as `lanes()` does.
- **Stops list every place that fits on a bar.** A slot of a bar or a toolbar rail whose stretch clipping left under a
  pixel is a stop too, as one the aim cuts leave none.
- Changed (breaking for conformance): the row `R4-bar-gaps-split-at-the-middle` is renamed
  `R4-bar-items-take-the-nearest-landing` (a toolbar over a neighbor of its length stays before it on either side of
  its middle); `R7-end-zone-pushes-fixed-behind-a-movable-leading` now expects the drop after Zoom, as the trailing row
  does, since the nearest landing over Zoom is Zoom's place. A host that lists either row by id or by its old outcome
  updates it.
