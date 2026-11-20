/**
 * `lanes()` pinned to `stretchPositions: "pitched"` unless a call names its own. The tests that import it check what the
 * pitched spots are (their ids, landings, marks and ends); the default is `"free"`, whose own checks are the
 * `lanes-stretch-*` files, the landing rows and the frame-is-commit sweep.
 */
import { lanes as published, type DockLaneOptions, type DockRegions, type DockState } from "../src";

export const lanes = (state: DockState, dragged: string, options: DockLaneOptions = {}): DockRegions => published(state, dragged, { stretchPositions: "pitched", ...options });
