/**
 * @n-uf/placement/dock: a desk of documents and tool panels. Side docks and a bottom dock (between the side docks
 * or across the full width), rails, natural-height sections whose last one takes the rest, fold and unfold, the
 * give-way rules (sections fold, docks fold to rails), floating palettes with corner stacks, tear-off and dock-back;
 * and the nine desk constructions as presets built from these parts (`createDesk`).
 *
 * The public surface: `createDesk` and its types, the options, the stacking layers, the item keys, and the state
 * changes. `G` is the gap every construction keeps between items; `stripGeometry` gives the scrolling strip's extent
 * and scroll, for a consumer that scrolls it by hand (it sets `stripScroll`).
 */
export {
  DEFAULT_OPTIONS,
  G,
  LAYER,
  docKey,
  idOf,
  isDocKey,
  isPanelKey,
  liftOut,
  panelKey,
  toggleClosed,
  toggleFold,
  touch,
  withActive,
  withDocs,
  type Catalog,
  type DeskSpec,
  type DeskStart,
  type DeskState,
  type Free,
  type Layout,
  type Look,
  type Note,
  type NoteCode,
  type Options,
  type PanelSpec,
  type Placed,
  type Side,
} from "./model";
export { stripGeometry, type StripGeometry } from "./parts";
export { createDesk, draggable, type Construction, type ConstructionId, type Desk } from "./constructions";
