/**
 * Modifier keys, the package's one shape for them: the gesture stream's pointers carry `Modifiers`, a drag's samples a
 * partial set of them, and both name a key by `ModifierKey`. Here at the root of `src`, so `./drag` reads them without
 * loading `./gestures`.
 */

/** Pointer modifiers, ctrl included (the drag modifier may be "ctrl") */
export interface Modifiers {
  shift: boolean;
  alt: boolean;
  meta: boolean;
  ctrl: boolean;
}

/**
 * A modifier key, the package's one name for it (the recognizer's drag modifier, a drag's float and arm keys): a field
 * of {@link Modifiers}, or `"mod"`: ⌘ (meta) or Ctrl, either one held counts, so no platform is needed.
 */
export type ModifierKey = keyof Modifiers | "mod";

/**
 * Whether `key` is held in `modifiers` (a pointer's, or the keys a drag sample carries; absent fields are not held).
 * `"mod"`: ⌘ (meta) or Ctrl, either one. Null: never.
 */
export function isHeld(modifiers: Partial<Modifiers> | undefined, key: ModifierKey | null): boolean {
  if (key === null || !modifiers) return false;
  return key === "mod" ? !!(modifiers.meta || modifiers.ctrl) : !!modifiers[key];
}
