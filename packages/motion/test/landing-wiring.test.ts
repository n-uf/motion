/**
 * The landing model's two options that are shared with the drag intent: `modifiers` (the same shape as the intent's
 * tuning, the float key only) and `preview` (the one home of the guide level, which `previewPlan` reads too).
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, DRAG_DEFAULTS, guidesOf, LANDING_MODIFIERS, PLACE_GUIDES_DEFAULT, previewPlan, type DragKeys, type DragPreview, type LandingFrame, type LandingOptions, type LandingRegions, type PreviewMode } from "../src/drag";
import { listed } from "./listed-geometry";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/** A 1000 × 640 window: a bottom bar (y 604–640) with one spot along it; open space above. */
const regions = (): LandingRegions => ({
  lanes: [{ id: "bottom", rect: rect(0, 604, 1000, 36), axis: "x", spots: [{ id: "bottom/start", along: [0, 1000], landing: rect(8, 604, 100, 36) }], refused: [] }],
  refused: [],
  content: rect(0, 0, 1000, 604),
  blocked: [],
  stage: rect(0, 0, 1000, 640),
});
const FLOAT = (p: Point): Rect => rect(p.x - 50, p.y - 15, 100, 30);

/** Down onto the bar, slowly, and rest on it, holding `keys` throughout. */
function settle(more: Partial<LandingOptions>, keys?: DragKeys): LandingFrame {
  const m = createLandingModel({ ...listed(regions(), FLOAT), ...more });
  let f!: LandingFrame;
  for (let t = 0; t <= 800; t += 8) f = m.update({ x: 500, y: 300 + Math.min(1, t / 600) * 320 }, t, keys);
  return f;
}

describe("landing model: modifiers (the intent's shape, the float key only)", () => {
  it("the default is the intent's float key: Shift", () => {
    expect(LANDING_MODIFIERS).toEqual({ on: DRAG_DEFAULTS.modifiers.on, floatKey: DRAG_DEFAULTS.modifiers.floatKey });
    expect(LANDING_MODIFIERS.floatKey).toBe("shift");
    const held = settle({ preview: { mode: "placeholder", placeGuides: "near" } });
    expect([held.region, held.lane, held.shift, held.guides.length]).toEqual(["lane", "bottom", false, 1]);
    const shifted = settle({ preview: { mode: "placeholder", placeGuides: "near" } }, { shift: true });
    expect([shifted.region, shifted.shift, shifted.room, shifted.guides.length]).toEqual(["open", true, false, 0]);
    // Another key is none of its business.
    expect(settle({}, { alt: true, ctrl: true, meta: true }).region).toBe("lane");
  });

  it("a float key of its own replaces Shift; `mod` is ⌘ or Ctrl; `on: false` turns the key off", () => {
    expect(settle({ modifiers: { floatKey: "alt" } }, { alt: true }).region).toBe("open");
    expect(settle({ modifiers: { floatKey: "alt" } }, { shift: true }).region).toBe("lane");
    expect(settle({ modifiers: { floatKey: "mod" } }, { meta: true }).region).toBe("open");
    expect(settle({ modifiers: { floatKey: "mod" } }, { ctrl: true }).region).toBe("open");
    expect(settle({ modifiers: { floatKey: "mod" } }, { shift: true }).region).toBe("lane");
    expect(settle({ modifiers: { on: false } }, { shift: true }).region).toBe("lane");
  });

  it("the drag intent's own modifiers are accepted as they are (its arm key is not read)", () => {
    expect(settle({ modifiers: { ...DRAG_DEFAULTS.modifiers, floatKey: "ctrl" } }, { ctrl: true }).region).toBe("open");
    const tuned = { on: true, floatKey: "alt", armKey: "mod" } as const;
    expect(settle({ modifiers: tuned }, { alt: true }).region).toBe("open");
  });

  it("a release at a new point samples with the last keys, or its own", () => {
    const m = createLandingModel({ ...listed(regions(), FLOAT), modifiers: { floatKey: "alt" } });
    for (let t = 0; t <= 800; t += 8) m.update({ x: 500, y: 300 + Math.min(1, t / 600) * 320 }, t, { alt: true });
    expect(m.release({ x: 500, y: 621 }, 808)?.kind).toBe("float");
    expect(m.release({ x: 500, y: 622 }, 816, {})?.kind).toBe("spot");
  });
});

describe("landing model: the guide level has one home, the preview", () => {
  const MODES: PreviewMode[] = ["outline", "placeholder", "glide", "snap"];

  it("a mode alone asks for its default level; `placeGuides` overrides it; the model and `previewPlan` read the same level", () => {
    for (const mode of MODES) {
      for (const placeGuides of [undefined, "off", "near", "all"] as const) {
        const preview: DragPreview = placeGuides ? { mode, placeGuides } : { mode };
        const level = placeGuides ?? PLACE_GUIDES_DEFAULT[mode];
        expect(guidesOf(preview)).toBe(level);
        expect(guidesOf(mode)).toBe(PLACE_GUIDES_DEFAULT[mode]);
        // The model names a lane while the level shows one (`"off"`: none), the plan draws the same level while nothing else shows.
        const f = settle({ preview });
        expect([mode, placeGuides, f.guides.length > 0]).toEqual([mode, placeGuides, level !== "off"]);
        expect(previewPlan({ region: "refused", landing: null, room: false }, preview).guides).toBe(level);
      }
    }
  });

  it("no preview is the default preview (Glide: no guides); a mode alone is `{ mode }`", () => {
    expect(settle({}).guides).toEqual([]);
    expect(settle({ preview: "snap" }).guides.length).toBe(1);
    expect(settle({ preview: "outline" }).guides).toEqual([]);
  });
});
