/**
 * A kit case as a page of its own: it builds its text, controls and dossier windows into a host element, and says
 * how to put them back and which scenarios check it. The lab shell mounts each case as a page under "Kit cases".
 */
import type { FrameLoop } from "@n-uf/motion";
import type { Dossier } from "./dossier";

export type Expect = (ok: boolean, msg: string) => void;

export interface KitScenario {
  readonly name: string;
  readonly play: (expect: Expect) => Promise<void>;
}

export interface MountedCase {
  /** Every window back to its start (and the case's controls to their defaults). */
  readonly reset: () => void;
  /** Resolves once nothing in the case moves. */
  readonly idle: () => Promise<void>;
  readonly scenarios: readonly KitScenario[];
}

export interface KitCase {
  /** A short id for the page (its route). */
  readonly id: string;
  /** The page title, with the case number ("6 · Constraints"). */
  readonly title: string;
  readonly mount: (host: HTMLElement, loop: FrameLoop) => MountedCase;
}

/** A case's rule text and a Reset button, then a desk area per window; returns the desk hosts. */
export function caseFrame(host: HTMLElement, rule: string, desks: readonly { readonly id: string; readonly caption?: string }[], onReset: () => void): Record<string, HTMLElement> {
  const wrap = document.createElement("section");
  wrap.className = "kcase";
  const p = document.createElement("p");
  p.className = "rule";
  p.innerHTML = rule;
  const controls = document.createElement("div");
  controls.className = "controls";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset";
  reset.addEventListener("click", onReset);
  controls.append(reset);
  const row = document.createElement("div");
  row.className = "k-desks";
  const out: Record<string, HTMLElement> = {};
  for (const d of desks) {
    const fig = document.createElement("figure");
    fig.className = "k-desk";
    if (d.caption) {
      const cap = document.createElement("figcaption");
      cap.innerHTML = d.caption;
      fig.append(cap);
    }
    const slot = document.createElement("div");
    slot.className = "k-host";
    fig.append(slot);
    row.append(fig);
    out[d.id] = slot;
  }
  wrap.append(p, controls, row);
  host.append(wrap);
  return out;
}

/** Idle once every dossier is. */
export const allIdle = (ds: readonly Dossier[]) => async (): Promise<void> => {
  await Promise.all(ds.map((d) => d.idle()));
};
