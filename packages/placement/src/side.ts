/**
 * The two words every entry (and `@n-uf/docking`) shares for direction: a side of a stage or a pane, and an axis of a
 * split or a lane. Plain string unions; the values are what hosts already write.
 */

/** A side of a stage or a pane. */
export type Side = "top" | "right" | "bottom" | "left";

/** An axis: `"x"` runs left to right, `"y"` top to bottom. */
export type Axis = "x" | "y";
