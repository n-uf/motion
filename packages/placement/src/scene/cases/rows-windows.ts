/**
 * The width thresholds of two document windows as layout rows: at which stage width a column folds into its side's rail.
 * Every number is what a real window of that shape is pinned to (see `windows.ts` for the shapes). Each stage width is a
 * row; a few rows reach their width by shrinking a step at a time under `previous`, which must land on the same layout.
 *
 * The sheet fallback below the narrowest width (576 in A, 520 in B) is a host rule, not a scene rule: the layouts at
 * 576 and 575 are the same (everything in rails), and the host reads `layout.content` with `contentMin` to switch.
 */
import type { CaseGroup, CaseRow, Gesture, LayoutExpect } from "./types";
import { WINDOW_A, WINDOW_B, WINDOW_BARE, winScene, type WinOptions, type WinSpec } from "./windows";
import { g } from "./gestures";

type Cols = { left?: string[][]; right?: string[][] };
type Rails = { left?: string[]; right?: string[] };

const shape = (columns: Cols, rails: Rails, atLeast?: number): LayoutExpect => ({
  columns: { left: columns.left ?? [], right: columns.right ?? [] },
  rails: { left: rails.left ?? [], right: rails.right ?? [] },
  ...(atLeast !== undefined ? { contentAtLeast: { width: atLeast } } : {}),
});

/** One stage width of one window: the open columns and the rails expected there. */
function at(id: string, title: string, group: CaseGroup, spec: WinSpec, o: WinOptions, width: number, columns: Cols, rails: Rails, atLeast?: number, walk?: number): CaseRow {
  const gestures: Gesture[] = [];
  // Reach the width by shrinking a step at a time from 1400, `previous` carried: the thresholds are the same.
  if (walk) for (let w = 1400 - walk; w > width; w -= walk) gestures.push(g.resizeWindow(w, 800));
  if (walk) gestures.push(g.resizeWindow(width, 800));
  return {
    id,
    title,
    expect: `At a stage ${width} px wide: ${[...(columns.left ?? []).map((c) => `left column ${c.join("+")}`), ...(columns.right ?? []).map((c) => `right column ${c.join("+")}`), ...(rails.left?.length ? [`left rail ${rails.left.join("+")}`] : []), ...(rails.right?.length ? [`right rail ${rails.right.join("+")}`] : [])].join(", ") || "nothing open"}${walk ? " (reached by shrinking a step at a time)" : ""}.`,
    group,
    scene: winScene(spec, { ...o, width: walk ? 1400 : width }),
    ...(walk ? {} : { settings: { stage: { w: width, h: 800 } } }),
    gestures,
    expectLayout: shape(columns, rails, atLeast),
  };
}

const ALL_THREE = { left: ["pages", "annotations"], right: ["findings"] };
const PAIR: WinOptions = { columns: { left: [["annotations"]], right: [["findings"]] } };

function windowRows(): CaseRow[] {
  const rows: CaseRow[] = [];
  const A = (name: string, o: WinOptions, w: number, c: Cols, r: Rails, min?: number, walk?: number): void => {
    rows.push(at(`window-a-${name}-${w}${walk ? "-walk" : ""}`, `Window A, ${name}, ${w} px`, "window-a", WINDOW_A, o, w, c, r, min, walk));
  };
  const B = (name: string, o: WinOptions, w: number, c: Cols, r: Rails, min?: number, walk?: number): void => {
    rows.push(at(`window-b-${name}-${w}${walk ? "-walk" : ""}`, `Window B, ${name}, ${w} px`, "window-b", WINDOW_B, o, w, c, r, min, walk));
  };
  const open3: Cols = { left: [ALL_THREE.left], right: [ALL_THREE.right] };
  const leftFolded3: Cols = { right: [ALL_THREE.right] };
  const railsLeft3: Rails = { left: ALL_THREE.left };
  const railsAll3: Rails = { left: ALL_THREE.left, right: ALL_THREE.right };

  // Window A, three panels: 24 + 220 + 12 + 220 + 12 + 320 = 808 (a stack costs its widest member's minimum).
  A("three", {}, 808, open3, {}, 320);
  A("three", {}, 807, leftFolded3, railsLeft3);
  A("three", {}, 620, leftFolded3, railsLeft3, 320);
  A("three", {}, 619, {}, railsAll3);
  A("three", {}, 576, {}, railsAll3);
  A("three", {}, 575, {}, railsAll3);
  A("three", {}, 807, leftFolded3, railsLeft3, undefined, 7);
  A("three", {}, 619, {}, railsAll3, undefined, 7);
  // Window A, a pair: the older column folds first.
  A("pair", PAIR, 808, { left: [["annotations"]], right: [["findings"]] }, {});
  A("pair", PAIR, 807, { right: [["findings"]] }, { left: ["annotations"] });
  A("pair", PAIR, 620, { right: [["findings"]] }, { left: ["annotations"] });
  A("pair", PAIR, 619, {}, { left: ["annotations"], right: ["findings"] });
  // The bare arithmetic: 220 + 220 + 320 = 760; one open beside a 36 px rail: 320 + 220 + 36 = 576.
  const bare = (w: number, c: Cols, r: Rails): void => {
    rows.push(at(`window-a-bare-${w}`, `Window A without gap, padding or a 36 px rail, ${w} px`, "window-a", WINDOW_BARE, {}, w, c, r));
  };
  bare(760, open3, {});
  bare(759, leftFolded3, railsLeft3);
  bare(576, leftFolded3, railsLeft3);
  bare(575, {}, railsAll3);

  // Window B, three panels: 200 + 200 + 320 = 720; one open beside a rail: 320 + 200 + 32 = 552.
  B("three", {}, 720, open3, {}, 320);
  B("three", {}, 719, leftFolded3, railsLeft3);
  B("three", {}, 552, leftFolded3, railsLeft3, 320);
  B("three", {}, 551, {}, railsAll3);
  B("three", {}, 520, {}, railsAll3);
  B("three", {}, 519, {}, railsAll3);
  B("three", {}, 552, leftFolded3, railsLeft3, undefined, 7);
  B("three", {}, 551, {}, railsAll3, undefined, 7);
  B("pair", PAIR, 720, { left: [["annotations"]], right: [["findings"]] }, {});
  B("pair", PAIR, 719, { right: [["findings"]] }, { left: ["annotations"] });
  B("pair", PAIR, 590, { right: [["findings"]] }, { left: ["annotations"] });
  B("pair", PAIR, 552, { right: [["findings"]] }, { left: ["annotations"] });
  B("pair", PAIR, 551, {}, { left: ["annotations"], right: ["findings"] });
  return rows;
}

/** Hand folds in window A: a bar in place, a rider over the first open column, a whole column to the rail. */
const HAND: CaseRow[] = [
  {
    id: "window-a-hand-bar",
    title: "A panel folded by hand is a bar in place",
    expect: "Annotations folded by hand inside the stack is a 30 px bar as wide as the column; Pages takes the height the bar leaves.",
    group: "window-a",
    scene: winScene(WINDOW_A, { from: { annotations: 1 } }),
    gestures: [],
    expectLayout: {
      items: { annotations: { formKind: "header", rect: { height: 30 } }, pages: { formKind: "open", rect: { height: 800 - 30 - 12 } } },
      columns: { left: [["pages", "annotations"]] },
    },
  },
  {
    id: "window-a-hand-ride",
    title: "A one-panel column folded by hand rides",
    expect: "With handFold ride, a one-panel column folded by hand is a title bar over the first open column of its side, at that column's width, taking no width of its own.",
    group: "window-a",
    scene: winScene(WINDOW_A, { handFold: "ride", from: { annotations: 1 }, columns: { left: [["pages"], ["annotations"]], right: [["findings"]] } }),
    gestures: [],
    // The rider is as wide as the column it rides (220), 30 tall, above Pages; the content is exactly what it is without the
    // rider's column at all (x 244, 632 wide), so it takes no width of its own.
    expectLayout: {
      items: { annotations: { rides: "left-0", folded: "hand", formKind: "header", rect: { x: 12, y: 0, width: 220, height: 30 } }, pages: { edge: "left-0", rect: { x: 12, y: 30, width: 220, height: 770 } } },
      content: { x: 244, y: 0, width: 632, height: 800 },
      edges: { "left-0": { rect: { x: 12, y: 30, width: 220 } } },
    },
  },
  {
    id: "window-a-hand-all",
    title: "A column folded all by hand goes to the rail",
    expect: "A column whose members are all folded by hand goes to its side's rail.",
    group: "window-a",
    scene: winScene(WINDOW_A, { from: { pages: 1, annotations: 1 } }),
    gestures: [],
    expectLayout: { columns: { left: [] }, rails: { left: ["pages", "annotations"] } },
  },
];

export const WINDOW_ROWS: readonly CaseRow[] = [...windowRows(), ...HAND];
