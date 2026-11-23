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
- **A sliding spot's stretch starts past its neighbor as drawn.** Beside a growing neighbor (a title, a stretchable
  panel) a free stretch's range of landings may start inside it, at its natural length, where a dock takes its slack.
  The spot is now met past the neighbor as drawn (`metPastGrowing`: where it ends, or the latest the item still fits),
  in `lanes()` and in the tiles alike, so the place before the neighbor keeps the pointer over the neighbor.
- Changed (breaking for conformance): the row `R4-bar-gaps-split-at-the-middle` is renamed
  `R4-bar-items-take-the-nearest-landing` (a toolbar over a neighbor of its length stays before it on either side of
  its middle); `R7-end-zone-pushes-fixed-behind-a-movable-leading` now expects the drop after Zoom, as the trailing row
  does, since the nearest landing over Zoom is Zoom's place. A host that lists either row by id or by its old outcome
  updates it.
