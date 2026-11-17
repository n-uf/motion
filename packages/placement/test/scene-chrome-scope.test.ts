/**
 * Chrome with a scope (`SceneChrome`): an entry for `"floats"` is kept clear by floats alone; every docked target, the
 * edges and give-way ignore it. A plain entry (`"all"`, the default) keeps both clear, as before.
 */
import { describe, expect, it } from "vitest";
import { overlaps, type Rect } from "../index";
import { fitResize, floatAt, refusals, solve, targets, type Scene, type SceneChrome, type SceneTarget } from "../src/scene";
import { modelScene } from "./model-scene";
import { windowScene } from "./scene-fixture";

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
    for (const [flush, middle, railDrop] of [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [true, false, true],
    ] as const)
      for (let seed = 1; seed <= 40; seed++) {
        const s = modelScene(seed, flush, middle, railDrop);
        const spine: SceneChrome = { x: s.stage.x + s.stage.width * 0.62, y: s.stage.y, width: 24, height: s.stage.height, for: "floats" };
        const spined = withChrome(s, spine);
        for (const id of movable(s)) if (docked(spined, id) !== docked(s, id)) failures.push(`seed ${seed} ${id}: docked targets changed`);
        const l = solve(spined);
        for (const f of s.floats) {
          const r = l.items[f.id]?.rect;
          if (!r) continue;
          floats++;
          if (overlaps(r, spine)) failures.push(`seed ${seed}: float ${f.id} ${JSON.stringify(r)} lies on the spine`);
        }
      }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(floats).toBeGreaterThan(50);
  });
});
