/**
 * `aimOnce`, the one re-aim of a landing at the hand (a float, a sliding spot), at a fold threshold: an item that folds
 * from a long form `A` to a short one `B` past a position, each form's grab different, so a landing aimed with one form's
 * grab can land in the other. Swept across the threshold both ways in quarter pixels: the grab given back is always the
 * grab of the form the landing shows, never a third aim is made, and the form switches once (no flip-flop).
 */
import { describe, expect, it } from "vitest";
import type { Point, Size } from "@n-uf/placement";
import type { DockItemLayout } from "../src";
import { aimOnce, type Grab } from "../src/grab";

const entry = (form: number, x: number): DockItemLayout => ({ rect: { x, y: 0, width: form === 0 ? 120 : 40, height: 30 }, kind: "group", axis: "row", form, formKind: form === 0 ? "row" : "icons", edge: "bar", hidden: [] });

/** A grab with the grip `long` px in in the long form and `short` px in in the short one. */
const grabOf = (long: number, short: number): Grab => (laid) => ({ x: (laid?.form ?? 0) === 0 ? long : short, y: 15 });

describe("aimOnce at a fold threshold", () => {
  for (const [long, short] of [[30, 6], [6, 30]] as const)
  for (const threshold of [200, 200.5])
    for (const dir of [1, -1] as const)
      it(`grips ${long} and ${short}, threshold at ${threshold}, swept ${dir > 0 ? "forward" : "back"}: the grab is the shown form's, one switch, at most two aims`, () => {
        const grab = grabOf(long, short);
        // The item folds to the short form where its start lies past the threshold.
        const formAt = (x: number): number => (x > threshold ? 1 : 0);
        const points = Array.from({ length: 400 }, (_, i) => 150 + i / 4);
        if (dir < 0) points.reverse();
        const shown: number[] = [];
        for (const p of points) {
          let aims = 0;
          const aim = (g: Point): DockItemLayout => (aims++, entry(formAt(p - g.x), p - g.x));
          const { result, grab: g } = aimOnce(grab, "float", { laid: entry(0, 0), size: { width: 120, height: 30 } as Size }, aim, (r) => r, (l) => ({ width: l.rect.width, height: l.rect.height }));
          expect(aims).toBeLessThanOrEqual(2);
          expect(g, `p ${p}`).toEqual(grab(result, { width: result.rect.width, height: result.rect.height }, "float"));
          shown.push(result.form);
        }
        const switches = shown.filter((f, i) => i > 0 && f !== shown[i - 1]).length;
        expect(switches).toBe(1);
      });

  it("between the forms, the band where each form's grab lands it in the other keeps the form the item had", () => {
    // The item folds past a start of 200. Aimed with the long form's grab (6) at p in (206, 230] it lands folded; aimed
    // with the folded form's grab (30) it lands long again: neither holds, and the long form stays. Past 230 the folded
    // form holds under its own grab and the item switches; below 206 it never left the long form.
    const grab = grabOf(6, 30);
    const formAt = (x: number): number => (x > 200 ? 1 : 0);
    const run = (p: number): number => aimOnce(grab, "float", { laid: entry(0, 0), size: { width: 120, height: 30 } }, (g) => entry(formAt(p - g.x), p - g.x), (r) => r, (l) => ({ width: l.rect.width, height: l.rect.height })).result.form;
    expect(run(205)).toBe(0);
    expect(run(220)).toBe(0);
    expect(run(231)).toBe(1);
  });
});
