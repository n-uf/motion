/**
 * Modifier keys: event modifiers to one shape, and the drag modifier
 * resolved per platform (Cmd on macOS, Alt elsewhere; null turns it off).
 */

import { NO_MODIFIERS, type ModifierKey, type Modifiers, type Platform } from "./types";

export function toModifiers(m: Partial<Modifiers> | undefined): Modifiers {
  if (!m) return { ...NO_MODIFIERS };
  return { shift: !!m.shift, alt: !!m.alt, meta: !!m.meta, ctrl: !!m.ctrl };
}

/** The default drag modifier: "meta" (Cmd) on macOS, "alt" elsewhere */
export function defaultDragModifier(platform: Platform): ModifierKey {
  return platform === "mac" ? "meta" : "alt";
}

/**
 * A configured drag modifier as used: undefined → the platform default, null → off.
 */
export function resolveDragModifier(config: ModifierKey | null | undefined, platform: Platform): ModifierKey | null {
  if (config === null) return null;
  return config ?? defaultDragModifier(platform);
}

export function isHeld(modifiers: Modifiers, key: ModifierKey | null): boolean {
  return key !== null && modifiers[key];
}

/** Platform "Mod": Cmd on macOS, Ctrl elsewhere (Mod+wheel zooms, Mod+click is content's multi-select) */
export function modHeld(modifiers: Modifiers, platform: Platform): boolean {
  return platform === "mac" ? modifiers.meta : modifiers.ctrl;
}
