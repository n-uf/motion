/**
 * @n-uf/placement/stack: the items along one edge of a stage, a column or a row. Each item (a panel or a control
 * group) declares its forms, largest first; `fitStack` picks one per item and places them, giving way by age when the
 * length runs out (an open panel folds to a header, then a rail icon, then the » menu; a group's row of words to
 * stacked words, icons, the menu) and handing spare length to the panels that grow. A stack with nothing open in it
 * is a rail, and a form that is too wide for the stack steps down (never into the menu: that is the length's call).
 * `stackTargets` gives a drop target for every gap, each with the exact solve a drop makes; the store keeps order,
 * kept and closed items, the use order and chosen forms. Floats (`fitFloat`, `stackFloatTarget`, `storeFloats`) are items
 * above the pages in the stage's own px: clamped into the stage, clear of the docked content, never pinned. Pure:
 * items and a length in; forms, rects and coded notes out. Not tied to `./panels` columns.
 */
export { fitStack } from "./layout";
export {
  DEFAULT_MENU,
  DEFAULT_RAIL,
  formSetsCross,
  withItem,
  type CrossLimits,
  type GroupFormKind,
  type MainSize,
  type PanelFormKind,
  type PlacedStackItem,
  type StackAxis,
  type StackFit,
  type StackForm,
  type StackFormKind,
  type StackInput,
  type StackItem,
  type StackMenu,
  type StackNote,
  type StackNoteCode,
} from "./model";
export { stackTargets, type StackPlace, type StackTarget, type StackTargetOptions } from "./targets";
export { createStack, readStack, storeStack, type StackRead, type StackState, type StoredStack } from "./store";
export { fitFloat, readFloats, stackFloatTarget, storeFloats, type FloatDrop, type FloatFit, type FloatsRead, type FloatTarget, type StackFloat, type StackFloatTargetInput, type StoredFloats } from "./floats";
