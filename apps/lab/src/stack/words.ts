/** The Stack pages' words for the package's coded notes and kinds (the package carries none). */
import type { StackFit, StackNote } from "@n-uf/placement/stack";
import { titleOf } from "./sample";

export const KIND_WORDS: Record<string, string> = { open: "open", header: "its header", rail: "a rail icon", menu: "the » menu", row: "a row of words", stacked: "stacked words", icons: "icons" };

export function noteWords(fit: StackFit, n: StackNote): string {
  switch (n.code) {
    case "form-down": {
      const p = fit.items.find((x) => x.id === n.id)!;
      return `${titleOf(n.id)} → ${KIND_WORDS[p.kind] ?? p.kind}`;
    }
    case "to-menu":
      return `${titleOf(n.id)} is in the » menu`;
    case "overflow":
      return `${Math.round(n.over)} px too long`;
  }
}

export const sayFit = (name: string, fit: StackFit): string =>
  `${name}: ${fit.cross} px ${fit.axis === "column" ? "wide" : "tall"}${fit.notes.length ? ` · ${fit.notes.map((n) => noteWords(fit, n)).join(" · ")}` : " · every item in its largest form"}.`;
