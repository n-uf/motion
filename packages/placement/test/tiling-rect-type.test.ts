/** ./tiling, `Rect` re-exported: the same type as the root's, so a host imports one or the other. */
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Rect as RootRect } from "../index";
import { layoutSplit, type Rect } from "../src/tiling";

describe("Rect from ./tiling", () => {
  it("is the root's Rect type, both ways", () => {
    expectTypeOf<Rect>().toEqualTypeOf<RootRect>();
    expectTypeOf<RootRect>().toEqualTypeOf<Rect>();
  });

  it("types what the layouts take and give", () => {
    const area: Rect = { x: 0, y: 0, width: 100, height: 50 };
    const placed: Rect | undefined = layoutSplit({ pane: "a" }, area).get("a");
    expect(placed).toEqual(area);
  });
});
