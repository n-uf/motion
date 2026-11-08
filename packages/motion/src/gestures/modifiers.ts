/**
 * Modifier keys: event modifiers to one shape, and the drag modifier
 * resolved per platform (Cmd on macOS, Alt elsewhere; null turns it off).
 */

import { NO_MODIFIERS, type ModifierKey, type Modifiers, type Platform, type PointerKind } from "./types";

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

/**
 * The button a press stands for on this platform. On macOS a Ctrl+click is the secondary click (the system's own
 * rule; the browser's contextmenu follows it), so a primary mouse press with Ctrl held is button 2 there, as a
 * right-click is. Not when Ctrl is the drag modifier (Ctrl+drag then moves). A pen, a finger and the other platforms
 * keep their button.
 */
export function platformButton(press: { kind: PointerKind; button: number; modifiers: Modifiers }, platform: Platform, dragModifier: ModifierKey | null): number {
  return platform === "mac" && press.kind === "mouse" && press.button === 0 && press.modifiers.ctrl && dragModifier !== "ctrl" ? 2 : press.button;
}

/** Platform "Mod": Cmd on macOS, Ctrl elsewhere (Mod+wheel zooms, Mod+click is content's multi-select) */
export function modHeld(modifiers: Modifiers, platform: Platform): boolean {
  return platform === "mac" ? modifiers.meta : modifiers.ctrl;
}
