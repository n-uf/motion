- **`Side` is placement's, and `Axis` joins it; both re-exported from the root.** `Side` (`"top" | "right" | "bottom" |
  "left"`) is declared once, in `@n-uf/placement`, and `@n-uf/docking` re-exports it with the new `Axis` (`"x" | "y"`):
  a host's `import { type Side } from "@n-uf/docking"` still works. `DockLane.axis` and `LaneMarks.axis` are typed
  `Axis`, the same two strings. No runtime change.
- **Removed (breaking): `DockGuide`.** It was the deprecated alias of `DockLaneMark` (what `DockDrag.guides(frame)`
  returns). A host that wrote `DockGuide` writes `DockLaneMark`: a one-line rename, the type is the same.
