/**
 * Chrome with a scope (`SceneChrome`): an entry for `"floats"` is kept clear by floats alone; every docked target, the
 * edges and give-way ignore it. A plain entry (`"all"`, the default) keeps both clear, as before.
 */
import { describe, expect, it } from "vitest";
import { overlaps, type Rect } from "../index";
import { fitResize, floatAt, refusals, solve, targets, type Scene, type SceneChrome, type SceneTarget } from "../src/scene";
import { modelScene } from "./model-scene";
import { windowScene } from "./scene-fixture";

/**
 * Whether a `w` × `h` rect fits somewhere in `stage` clear of every rect in `avoid`. A clear place, if any, can be slid
 * left and up until it touches the stage or an obstacle, so only those corners need trying.
 */
function clearPlaceExists(stage: Rect, avoid: readonly Rect[], w: number, h: number): boolean {
  const xs = [stage.x, ...avoid.map((a) => a.x + a.width)];
  const ys = [stage.y, ...avoid.map((a) => a.y + a.height)];
  for (const x of xs)
    for (const y of ys) {
      const r = { x, y, width: w, height: h };
      if (x + w > stage.x + stage.width + 1e-6 || y + h > stage.y + stage.height + 1e-6) continue;
      if (!avoid.some((a) => overlaps(r, a))) return true;
    }
  return false;
}

/** A 24 px spine at the window's right edge, over the right column (940–1200) and its gaps. */
const SPINE: Rect = { x: 1176, y: 0, width: 24, height: 800 };
/** The same spine just left of the right column, over the content, where floats could otherwise go. */
const OVER_CONTENT: Rect = { x: 916, y: 0, width: 24, height: 800 };
const withChrome = (s: Scene, ...chrome: SceneChrome[]): Scene => ({ ...s, chrome: [...(s.chrome ?? []), ...chrome] });
const docked = (s: Scene, id: string): string => JSON.stringify(targets(s, id).filter((t) => !t.free).map((t: SceneTarget) => [t.id, t.hit, t.hits ?? null, t.slot ?? null]));
const movable = (s: Scene): string[] => Object.keys(s.items).filter((id) => !s.items[id]!.fixed && !s.items[id]!.closed);

describe("chrome for floats only", () => {
  const s = windowScene();
  const spined = withChrome(s, { ...SPINE, for: "floats" });

  it("every docked target, refusal and the layout of the edges are those of the scene without it", () => {
    for (const id of movable(s)) {
      expect(docked(spined, id), id).toBe(docked(s, id));
      expect(refusals(spined, id), id).toEqual(refusals(s, id));
    }
    expect(solve(spined).edges).toEqual(solve(s).edges);
    // The right column's gaps are there, over the spine.
    expect(targets(spined, "notes").some((t) => t.id.startsWith("gap:right:") && overlaps(t.hit, SPINE))).toBe(true);
  });

  const content = withChrome(s, { ...OVER_CONTENT, for: "floats" });

  it("a float dropped, opened or kept keeps clear of it", () => {
    const float = targets(content, "notes").find((t) => t.free)!;
    const after = float.after({ x: OVER_CONTENT.x + 8, y: 400 });
    const dropped = after.layout.items.notes!.rect;
    expect(overlaps(dropped, OVER_CONTENT)).toBe(false);
    // Its drop marker is its landing: the slot drawn is where it lands.
    expect(solve(after.scene).items.notes!.rect).toEqual(dropped);
    const opened = solve(floatAt(content, "pages", { x: 850, y: 300, width: 200, height: 200 })).items.pages!.rect;
    expect(overlaps(opened, OVER_CONTENT)).toBe(false);
    // A narrower window: still clear.
    const narrow = solve({ ...content, stage: { ...content.stage, width: 1000 } }).items.notes!.rect;
    expect(overlaps(narrow, OVER_CONTENT)).toBe(false);
  });

  it("a resize by hand stops at it", () => {
    const at = content.floats.find((f) => f.id === "notes")!.rect;
    const r = fitResize(content, "notes", { ...at, width: 700 }, { right: true })!;
    expect(r.rect.x + r.rect.width).toBeLessThanOrEqual(OVER_CONTENT.x + 0.5);
    expect(r.limits.length).toBeGreaterThan(0);
  });
});

describe("chrome for floats only, the kit's case: a spine over a right column with its lines, rail and drop strip", () => {
  // The document window with column templates on both sides, a right rail and a rail drop strip for panels.
  const kit = (): Scene => {
    const s = windowScene();
    const tpl = { accepts: ["panel" as const, "group" as const], cross: { min: 160, max: 480, rail: 32 } };
    return {
      ...s,
      edges: s.edges.map((e) => (e.side === "left" || e.side === "right" ? { ...e, column: true } : e)),
      columns: { left: tpl, right: tpl },
      rails: { right: { width: 32, accepts: ["panel"] } },
      railDrop: { panel: { railStripWidth: 28 } },
    };
  };
  const s = kit();
  const right = solve(s).edges.right!.rect;
  // The spine: the window's right 24 px, over the right column and where its rail lies.
  const spine: SceneChrome = { x: s.stage.x + s.stage.width - 24, y: s.stage.y, width: 24, height: s.stage.height, for: "floats" };
  const spined = withChrome(s, spine);
  const all = (sc: Scene, id: string): string => JSON.stringify(targets(sc, id).map((t) => [t.id, t.hit, t.hits ?? null, t.slot ?? null, t.strip ?? null]));

  it("targets and refusals, ids and hits, are those of the window without it", () => {
    expect(overlaps(spine, right)).toBe(true);
    for (const id of movable(s)) {
      expect(all(spined, id), id).toBe(all(s, id));
      expect(refusals(spined, id), id).toEqual(refusals(s, id));
    }
    const ids = targets(spined, "notes").map((t) => t.id);
    expect(ids.some((x) => x.startsWith("gap:right:"))).toBe(true);
    expect(ids.some((x) => x.startsWith("column:right:"))).toBe(true);
    expect(targets(spined, "notes").some((t) => t.id.startsWith("rail:right:") && !!t.strip)).toBe(true);
  });

  it("a float dropped at the spine lands clear of it", () => {
    const float = targets(spined, "notes").find((t) => t.free)!;
    const at = float.after({ x: spine.x + 12, y: 400 });
    expect(overlaps(at.layout.items.notes!.rect, spine)).toBe(false);
    expect(solve(at.scene).items.notes!.rect).toEqual(at.layout.items.notes!.rect);
  });
});

describe("plain chrome", () => {
  it("behaves as before: `for: \"all\"` is the default, and its docked targets keep clear of it", () => {
    const s = windowScene();
    const plain = withChrome(s, SPINE);
    expect(docked(withChrome(s, { ...SPINE, for: "all" }), "notes")).toBe(docked(plain, "notes"));
    expect(docked(plain, "notes")).not.toBe(docked(s, "notes"));
    for (const t of targets(plain, "notes")) if (!t.free) for (const h of t.hits ?? [t.hit]) expect(overlaps(h, SPINE), t.id).toBe(false);
  });
});

describe("property: floats-only chrome changes nothing but the floats", () => {
  it("over the model windows: every docked target is unchanged, and no float lies on it", () => {
    const failures: string[] = [];
    let floats = 0;
    // Every mode: plain, flush, card halves (either), and rail drop strips (either).
    for (const [flush, middle, railDrop] of [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [true, true, false],
      [false, false, true],
      [true, false, true],
    ] as const)
      for (let seed = 1; seed <= 40; seed++) {
        const s = modelScene(seed, flush, middle, railDrop);
        // Two spines: one over the content, one at the window's right edge over the right column and rail.
        const spines: SceneChrome[] = [
          { x: s.stage.x + s.stage.width * 0.62, y: s.stage.y, width: 24, height: s.stage.height, for: "floats" },
          { x: s.stage.x + s.stage.width - 24, y: s.stage.y, width: 24, height: s.stage.height, for: "floats" },
        ];
        const spined = withChrome(s, ...spines);
        for (const id of movable(s)) {
          if (docked(spined, id) !== docked(s, id)) failures.push(`seed ${seed} ${id}: docked targets changed`);
          if (JSON.stringify(refusals(spined, id)) !== JSON.stringify(refusals(s, id))) failures.push(`seed ${seed} ${id}: refusals changed`);
        }
        const l = solve(spined);
        for (const f of s.floats) {
          const r = l.items[f.id]?.rect;
          if (!r) continue;
          floats++;
          // Exempt only a float for which no clear place of its size exists anywhere in the stage (as over plain chrome).
          const avoid = [
            ...Object.values(l.items).filter((x) => !x.floating).map((x) => x.rect),
            ...Object.values(l.edges).flatMap((e) => [...((e.side === "top" || e.side === "bottom") && e.cross > 0 ? [e.rect] : []), ...(e.menu ? [e.menu.rect] : [])]),
            ...(spined.chrome ?? []),
          ].filter((x) => x.width > 0 && x.height > 0);
          if (spines.some((sp) => overlaps(r, sp)) && clearPlaceExists(spined.stage, avoid, r.width, r.height)) failures.push(`seed ${seed}: float ${f.id} ${JSON.stringify(r)} lies on a spine though a clear place exists`);
        }
      }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(floats).toBeGreaterThan(50);
  });
});
