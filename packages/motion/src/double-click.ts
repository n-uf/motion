/**
 * A double click: two presses within `ms` of each other (press to press) and `px` of the first. One value for the whole
 * package: the gesture recognizer's `clickCount` (`RECOGNIZER_DEFAULTS.multiClick`) and a grip's double-activate
 * (`createGripPress`) both default to it.
 */
export interface DoubleClick {
  readonly ms: number;
  readonly px: number;
}

/**
 * 500 ms and 5 px: the desktop systems' own default interval (browsers don't expose the user's setting). A host that has
 * the platform's count (a `mousedown`'s `detail`) can pass it to `createGripPress`'s `down` instead.
 */
export const DOUBLE_CLICK: DoubleClick = Object.freeze({ ms: 500, px: 5 });
