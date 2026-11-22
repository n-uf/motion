/**
 * Timing of `layoutSplitTree` (`pnpm --filter @n-uf/placement bench`): a balanced tree of 10, 100 and 1000 panes, the
 * same tree with every split named (`id`, so its geometry is reported) and with none, against a hand-written layout
 * that only fills a Map of pane rects. The three cases share one tree and area, and the outputs are checked equal
 * before timing, so a case that measures nothing fails loudly.
 */
import { bench, describe } from "vitest";
import type { Rect } from "../index";
import { layoutSplit, layoutSplitTree, type Split, type SplitOptions } from "../src/tiling";

const AREA: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const OPTIONS = { gap: 8, handle: 2 } as const;
/** What a host that reads minimums and fixed lengths passes: a callback per child of every split. */
const HOSTED: SplitOptions<number> = {
  ...OPTIONS,
  floor: (_child, _axis, _split) => ({ min: 120 }),
  fixed: (child) => ("pane" in child && child.pane % 17 === 0 ? { length: 200 } : undefined),
  fixedAcross: () => undefined,
};

function balanced(lo: number, hi: number, named: boolean, next: { n: number }): Split<number> {
  if (hi - lo === 1) return { pane: lo };
  const mid = (lo + hi) >> 1;
  const id = named ? `s${next.n++}` : undefined;
  return {
    a: balanced(lo, mid, named, next),
    b: balanced(mid, hi, named, next),
    axis: (hi - lo) % 3 === 0 ? "y" : "x",
    ratio: 0.4 + ((lo * 7) % 5) / 20,
    ...(id === undefined ? {} : { id }),
  };
}

/** A dwindle: every split divides the longer side in halves, the new pane second (a chain as deep as it is wide). */
function dwindle(n: number, named: boolean): Split<number> {
  let tree: Split<number> = { pane: 0 };
  for (let i = 1; i < n; i++) tree = { a: tree, b: { pane: i }, ...(named ? { id: `d${i}` } : {}) };
  return tree;
}

/** A host's own layout: what a host writes when it needs only the pane rects. */
function own(tree: Split<number>, area: Rect, out: Map<number, Rect>, gutter: number): void {
  if ("pane" in tree) {
    out.set(tree.pane, { x: area.x, y: area.y, width: area.width, height: area.height });
    return;
  }
  const ratio = tree.ratio ?? 0.5;
  if (tree.axis === "x") {
    const a = Math.max(0, area.width * ratio - gutter / 2);
    const b = Math.max(0, area.width * (1 - ratio) - gutter / 2);
    own(tree.a, { x: area.x, y: area.y, width: a, height: area.height }, out, gutter);
    own(tree.b, { x: area.x + area.width * ratio + gutter / 2, y: area.y, width: b, height: area.height }, out, gutter);
  } else {
    const a = Math.max(0, area.height * ratio - gutter / 2);
    const b = Math.max(0, area.height * (1 - ratio) - gutter / 2);
    own(tree.a, { x: area.x, y: area.y, width: area.width, height: a }, out, gutter);
    own(tree.b, { x: area.x, y: area.y + area.height * ratio + gutter / 2, width: area.width, height: b }, out, gutter);
  }
}

for (const n of [10, 100, 1000]) {
  const plain = balanced(0, n, false, { n: 0 });
  const named = balanced(0, n, true, { n: 0 });
  const mine = new Map<number, Rect>();
  own(plain, AREA, mine, 10);
  const got = layoutSplit(plain, AREA, OPTIONS);
  if (got.size !== n || mine.size !== n) throw new Error(`bench tree of ${n} panes laid out ${got.size} / ${mine.size}`);
  if (layoutSplitTree(named, AREA, OPTIONS).splits.size !== n - 1) throw new Error("bench: a named split is missing");

  const chain = dwindle(n, true);
  if (layoutSplitTree(chain, AREA, OPTIONS).splits.size !== n - 1) throw new Error("bench: a named dwindle split is missing");

  describe(`${n} panes`, () => {
    bench("hand-written (rects only)", () => {
      own(plain, AREA, new Map(), 10);
    });
    bench("layoutSplit (rects only)", () => {
      layoutSplit(plain, AREA, OPTIONS);
    });
    bench("layoutSplit, every split named", () => {
      layoutSplit(named, AREA, OPTIONS);
    });
    bench("layoutSplitTree, no ids", () => {
      layoutSplitTree(plain, AREA, OPTIONS);
    });
    bench("layoutSplitTree, every split named", () => {
      layoutSplitTree(named, AREA, OPTIONS);
    });
    bench("layoutSplitTree, named, floor + fixed callbacks", () => {
      layoutSplitTree(named, AREA, HOSTED);
    });
    bench("layoutSplitTree, named dwindle chain", () => {
      layoutSplitTree(chain, AREA, OPTIONS);
    });
  });
}
