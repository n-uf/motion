/**
 * `lanes()` pinned to `stretchPositions: "pitched"` unless a call names its own. The tests that import it check what the
 * pitched spots are (their ids, landings, marks and ends); the default is `"free"`, whose own checks are the
 * `scene-lanes-stretch-*` files, the landing rows and the frame-is-commit sweep.
 */
import { lanes as published, type LaneOptions, type Regions, type Scene } from "../src/scene";

export const lanes = (scene: Scene, dragged: string, options: LaneOptions = {}): Regions => published(scene, dragged, { stretchPositions: "pitched", ...options });
