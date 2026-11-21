/**
 * @n-uf/placement/stack: the general layer under a window model. Four pure functions, no window model in them:
 *
 * - `cutEdges(stage, bands)`: the stage cut into bands along its sides, in list order (the order decides the corners);
 *   each band's rect and the leftover.
 * - `fitStack(input)`: the items along one edge, a column or a row. Each item declares its forms, largest first;
 *   `fitStack` picks one per item and places them, giving way by age when the length runs out (an open panel folds to a
 *   header, then a rail icon, then the » menu; a group's row of words to stacked words, icons, the menu) and handing
 *   spare length to the forms that grow. A form's kind is the host's label; what the solver reads is said by fields
 *   (`setsCross`, `body`, `folded`, `compact`, `title`, `wrap`).
 * - `stackGaps(input, item)`: one edge's drop places for an item, fit only: each gap with the layout after the drop,
 *   or a refusal with its reason.
 * - `fitFloat(rect, stage, avoid)`: a float moved inside the stage and clear of the docked content.
 *
 * `StackItem.length` is the length a person asked an item to have (per axis), read by `fitStack` in place of a growing
 * form's natural; `dividers`, `resizeBetween`, `resetBetween` and `resetLengths` trade it between the nearest open growing
 * items. A stack that declares none is laid out exactly as before.
 *
 * `controlLadder(spec)` generates a control group's forms from its controls (lengths per tier, a gap, a grip, its own »
 * cell): tier steps one control at a time, partial folds, then `fold` and `menu`, with `rank` and `hides` set, so a bar
 * runs short control by control with no new solver rule. Hosts that hand-write forms are unchanged.
 *
 * It never imports a window model. See docs/placement.md, Entry: stack.
 */
export { cutEdges, type BandSide, type EdgeBand, type EdgeCut } from "./cut";
export { fitStack } from "./layout";
export { controlLadder, type ControlLadder, type ControlLadderSpec, type LadderControl } from "./ladder";
export {
  DEFAULT_MENU,
  DEFAULT_RAIL,
  formBody,
  formCompact,
  formCrossMin,
  formFitsCross,
  formFolded,
  formMain,
  formSetsCross,
  withItem,
  wrapCross,
  wrapLines,
  wrapRows,
  type WrapSpec,
  type CrossLimits,
  type FitOptions,
  type GroupFormKind,
  type MainSize,
  type PanelFormKind,
  type PlacedStackItem,
  type StackAxis,
  type StackFit,
  type StackStep,
  type StackForm,
  type StackFormKind,
  type StackInput,
  type StackItem,
  type StackLengths,
  type StackMenu,
  type StackNote,
  type StackNoteCode,
} from "./model";
export { dividers, resetBetween, resetLengths, resizeBetween, type StackDivider } from "./divide";
export { stackGaps, type StackGap, type StackGapOptions, type StackGapRefusal } from "./gaps";
export { fitFloat, type FloatFit } from "./float-fit";
