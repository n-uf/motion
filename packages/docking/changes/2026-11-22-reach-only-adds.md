- Fixed: **reach only adds, for a new column's line and a rail stop too.** A bar's `endReach` strip past its end (over an
  inset's strip beside the content) used to take the corner of the virtual `column:<side>:<n>` line's own hit there, so
  the line lost its corner points once `endReach` was set; a line whose drop is the same move as home or a rail stop lost
  its pieces the same way. A reach strip now never takes what another target holds as its own: a drawn edge's owned
  band, or the tiles an edge with no drawn ends (a column line, a rail stop) has as it tiles on its own. Every target's
  pieces with `endReach` cover its pieces without it.
