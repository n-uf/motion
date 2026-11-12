/**
 * Telemetry (island): the slow-motion control in the desk's status bar (components/LoopStrip.astro), shared by the desk
 * and the hero. The four steps themselves are lit by islands/home.ts as a drag goes; this only binds the control and shows
 * it once it works.
 */
import { getSpeed, onMotionChange, setSpeed } from "./motion";

export function startTelemetry(strip: HTMLElement): void {
  strip.classList.add("go"); // the slow-motion control (in the strip under the desk) shows now
  const speeds = [...strip.querySelectorAll<HTMLButtonElement>("[data-speed]")];
  const syncSpeed = (): void => speeds.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === getSpeed())));
  speeds.forEach((b) => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));
  onMotionChange(syncSpeed);
  syncSpeed();
}
