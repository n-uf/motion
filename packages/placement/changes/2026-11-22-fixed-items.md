- `./stack`, **added: `StackItem.stepping`**, a fixed item that still takes steps (a page readout with a ladder of its
  own): it keeps its reserved place (`stackGaps` still refuses every gap for it) but steps through its forms and into
  the » menu, gives way and grows back like a movable item with the same forms, `used` and `kept`, and never holds for
  the title rule. `itemSteps(item)` is the one reading (not `fixed`, or `stepping`). A drop beside it may step it, never
  squeeze it under its form's `main.min`. Plain `fixed` is unchanged.
- `./stack`, **added: the form flags `menu`, `ownCross` and `stepGroup`** (`formMenu`, `formOwnCross`, `formStepGroup`):
  the solver reads a form's kind only through them. `menu` is a form with no room of its own (default the kind `menu`),
  `ownCross` a form drawn at its own size across under the stack's `ownCross` (default the group kinds), `stepGroup` the
  variants a growing title's hold lets come first (default the kind). Each defaults from the kind, so a host that sets
  none sees no change.
