/**
 * A hand fold folds: after `fold(scene, id, true)`, every item folded by hand is drawn in a folded form (a panel's
 * header, a group's fold, else its rail tile), or a smaller form give-way chose after it (its rail tile, the menu).
 * Never a variant before the folded form (a group's stacked or icons). Swept over the model windows in every mode.
 */
import { describe, expect, it } from "vitest";
import { canFold, fold, solve, type Scene } from "../src/scene";
import type { StackForm } from "../src/stack";
import { axisOf, foldedIndex, formsOf } from "../src/scene/helpers";
import { modelScene } from "./model-scene";

describe("a hand fold is the folded form", () => {
  it("every folded item is in a folded form, or a smaller one give-way chose after it", () => {
    const failures: string[] = [];
    let folded = 0;
    let groups = 0;
    for (const [flush, middle, railDrop] of [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [true, false, true],
    ] as const)
      for (let seed = 1; seed <= 60; seed++)
        for (const s of [modelScene(seed, flush, middle, railDrop), withFoldForms(modelScene(seed, flush, middle, railDrop))]) {
        for (const id of Object.keys(s.items)) {
          const it = s.items[id]!;
          if (it.fixed || it.closed || !canFold(s, id)) continue;
          const l = solve(fold(s, id, true));
          const at = l.items[id];
          if (!at || at.inMenu) continue;
          const edge = s.edges.find((e) => e.id === at.edge);
          const forms = formsOf(it, edge ? axisOf(edge.side) : (s.floats.find((f) => f.id === id)?.orient ?? (it.kind === "group" ? "row" : "column")));
          const f = foldedIndex(forms);
          const ok = at.formKind === "header" || at.formKind === "fold" || (at.form >= f && (at.formKind === "rail" || at.formKind === "menu"));
          folded++;
          if (it.kind === "group") groups++;
          if (!ok) failures.push(`seed ${seed}${flush ? " flush" : ""}${middle ? " middle" : ""}${railDrop ? " strip" : ""}: ${id} folded is ${at.formKind} (form ${at.form}, folded form ${f})`);
          if (at.foldedBy !== "hand" && at.formKind !== "rail") failures.push(`seed ${seed}: ${id} folded by hand reads foldedBy ${at.foldedBy ?? "nothing"}`);
        }
      }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(folded).toBeGreaterThan(500);
    expect(groups).toBeGreaterThan(200);
  });
});

/** `s` with every group's row forms row, stacked, icons, fold and menu: variants before the fold a hand fold must skip. */
function withFoldForms(s: Scene): Scene {
  const items = Object.fromEntries(
    Object.entries(s.items).map(([id, it]) => {
      if (it.kind !== "group" || it.fixed || !it.forms.row?.length) return [id, it];
      const [row, ...rest] = it.forms.row;
      const stacked: StackForm = { ...row!, kind: "stacked", main: { min: Math.max(1, row!.main.min * 0.6), natural: Math.max(1, row!.main.natural * 0.6) } };
      const fold: StackForm = { kind: "fold", main: { min: 24, natural: 24 }, cross: { natural: 28 } };
      const menu = rest.filter((f) => f.kind === "menu");
      const icons = rest.filter((f) => f.kind === "icons");
      return [id, { ...it, forms: { ...it.forms, row: [row!, stacked, ...icons, fold, ...menu] } }];
    }),
  );
  return { ...s, items };
}
