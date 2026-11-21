/**
 * Where a landing frame's pointer is: in a lane, in open space (where a float lands), over a refused place, or nowhere
 * (past the stage). One type, read by the landing model's frame and by the preview's frame, so the two never drift.
 */
export type LandingRegion = "lane" | "open" | "refused" | "nowhere";
