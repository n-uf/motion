- **Added: `DockItem.stepping`**, a fixed item that still takes steps (a page readout at a title bar's end with a
  `controlLadder` of its own). It is never dragged, no hit covers it and nothing lands between it and its zone's anchor
  (read from the order of ids while it is in the »), but it steps through its forms, folds and goes into its edge's »
  like a movable item with the same forms. A declaration like `pushable`: taken from `base`, never stored. Plain `fixed`
  is unchanged.
- Fixed: **a growing title no longer takes its zone's drop room.** Its growth is spare room, not owned room: for target
  room a growing fixed item counts at its natural length, not its grown length, so a drop beside it lands exactly where it
  would beside a fixed item of that length that doesn't grow (its neighbors giving way as on any bar), where it was
  refused before. The title yields its growth to the landing and never shrinks under its natural length for a drop. A
  title bar asks nothing else of a drop: the rules that the dropped item keep its first form's kind and that nothing
  else in the bar change form are gone.
- The model reads a form's » through `StackForm.menu` (or the fit's menu list), never its kind.
