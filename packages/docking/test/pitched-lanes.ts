/**
 * `lanes()` pinned to `stretchPositions: "pitched"` unless a call names its own. The tests that import it check what the
 * pitched spots are (their ids, landings, marks and ends); the default is `"free"`, whose own checks are the
 * `lanes-stretch-*` files, the landing rows and the frame-is-commit sweep.
 */
import { dockDrag as publishedDrag, lanes as published, type DockDrag, type DockLaneOptions, type DockRegions, type DockState } from "../src";
import { heldLanes as publishedHeld } from "./held-lanes";

export const lanes = (state: DockState, dragged: string, options: DockLaneOptions = {}): DockRegions => published(state, dragged, { stretchPositions: "pitched", ...options });
/** `dockDrag()` pinned the same way. */
export const dockDrag = (state: DockState, dragged: string, options: DockLaneOptions = {}): DockDrag => publishedDrag(state, dragged, { stretchPositions: "pitched", ...options });
/** A held frame's lanes (`./held-lanes`) pinned the same way. */
export const heldLanes = (state: DockState, dragged: string, options: DockLaneOptions, spot: string): DockRegions => publishedHeld(state, dragged, { stretchPositions: "pitched", ...options }, spot);
