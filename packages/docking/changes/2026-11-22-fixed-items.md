- **Added: `DockItem.stepping`**, a fixed item that still takes steps (a page readout at a title bar's end with a
  `controlLadder` of its own). It is never dragged, no hit covers it and nothing lands between it and its zone's anchor
  (read from the order of ids while it is in the »), but it steps through its forms, folds and goes into its edge's »
  like a movable item with the same forms. A declaration like `pushable`: taken from `base`, never stored. Plain `fixed`
  is unchanged.
- Fixed: **a growing title no longer takes its zone's drop room.** Its growth is spare room: a drop on a title bar that
  only makes a neighbor step to a compact variant (a form of the same `stepGroup`) while the title keeps its natural
  width now lands, where it was refused before. The title still never shrinks under its natural width for a drop, and no
  neighbor goes to its icons, its fold or the » for one.
- The model reads a form's » through `StackForm.menu` (or the fit's menu list), never its kind.
