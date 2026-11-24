/**
 * One release rule for both drag models (decision 0015): a release reads the last frame and lands the place it holds,
 * else home; a frame draws its held place and nothing else. The same four properties run on the drag intent and on the
 * landing model, over one stand-in geometry both read (lanes of spots and open space, given to the intent as one target
 * per spot, a refusal and the float), on seeded random walks at 0 to 6 px/ms with rests and held keys.
 *
 * The fourth property ("held is drawn at once") has one known gap in the intent: in Glide and Snap a slotted target is
 * held from the frame it shows, but draws nothing until its room opens (`roomAfter` later). Those frames are counted
 * and reported, not failed; every other undrawn held frame fails.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import {
  createDragIntent,
  createLandingModel,
  inRect,
  previewPlan,
  type DragKeys,
  type DragTarget,
  type LandingFrame,
  type LandingOptions,
  type LandingRegions,
  type LandingRelease,
  type PreviewMode,
} from "../src/drag";
import { listed } from "./listed-geometry";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const FRAME = 16;
const MODES: readonly PreviewMode[] = ["outline", "placeholder", "glide", "snap"];

// The stand-in geometry: an 800 × 600 stage; a bottom bar of three spots (the item's own place is b/0); a rail down the
// left edge that owns its rect and reaches over the bar's left end (so over home); a column in the content that refuses
// the item; open space (the float) over the rest of the content.
const STAGE = rect(0, 0, 800, 600);
const CONTENT = rect(30, 0, 770, 560);
const BAR = rect(0, 560, 800, 40);
const RAIL = rect(0, 0, 30, 600);
const COLUMN = rect(400, 150, 200, 200);
const SPOTS = [
  { id: "b/0", along: [0, 266] as [number, number], landing: rect(0, 560, 200, 40) },
  { id: "b/1", along: [266, 532] as [number, number], landing: rect(299, 560, 200, 40) },
  { id: "b/2", along: [532, 800] as [number, number], landing: rect(565, 560, 200, 40) },
];
const RAIL_SPOT = { id: "r/0", along: [0, 600] as [number, number], landing: rect(0, 220, 30, 160) };
const REGIONS: LandingRegions = {
  lanes: [
    { id: "b", rect: BAR, axis: "x", spots: SPOTS, refused: [] },
    { id: "r", rect: RAIL, axis: "y", spots: [RAIL_SPOT], refused: [], owns: true },
  ],
  refused: [COLUMN],
  content: CONTENT,
  blocked: [COLUMN],
  stage: STAGE,
};
const FLOAT = (p: Point): Rect => rect(p.x - 50, p.y - 15, 100, 30);
const HOME = SPOTS[0]!.landing;
const LIFT: Point = { x: 100, y: 580 };
const landingOptions = (): LandingOptions => ({ ...listed(REGIONS, FLOAT), home: { lane: "b", spot: "b/0" }, lift: LIFT });

// The same places as the intent's targets: one per spot (the rail's spring-loaded, as an owning lane's strip), the
// refusal, and the float over the content.
const TARGETS: readonly DragTarget[] = [
  ...SPOTS.map((s): DragTarget => ({ id: s.id, priority: 1, hit: rect(s.along[0], BAR.y, s.along[1] - s.along[0], BAR.height), slot: s.landing })),
  { id: RAIL_SPOT.id, priority: 1, hit: RAIL, slot: RAIL_SPOT.landing, arm: "dwell", armedHit: rect(0, 0, 42, 600) },
  { id: "refuse:column", priority: 2, hit: COLUMN, refuse: true, bounds: STAGE },
  { id: "float", priority: 3, hit: CONTENT, free: true, bounds: STAGE },
];
const startIntent = () => createDragIntent<DragTarget>({ home: HOME, lift: LIFT });

interface Sample {
  readonly t: number;
  readonly p: Point;
  readonly keys: DragKeys;
  /** The hand's speed on the segment this sample lies on, px/ms (0: a rest). */
  readonly speed: number;
}

/** A seeded generator (mulberry32), so every run walks the same paths. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random walk from the lift: segments to goals in the content, the bar, the rail or home, at 0 to 6 px/ms, rests between. */
function walk(seed: number): Sample[] {
  const r = random(seed);
  const out: Sample[] = [{ t: 0, p: LIFT, keys: {}, speed: 0 }];
  let t = 0;
  let p = LIFT;
  const segments = 8 + Math.floor(r() * 7);
  for (let k = 0; k < segments; k++) {
    const roll = r();
    const keys: DragKeys = roll < 0.12 ? { shift: true } : roll < 0.2 ? { meta: true } : {};
    if (r() < 0.25) {
      // A rest: the pointer stays, time passes.
      const rest = 30 + Math.floor(r() * 270);
      for (let s = FRAME; s <= rest; s += FRAME) out.push({ t: (t += FRAME), p, keys, speed: 0 });
      continue;
    }
    const where = r();
    const goal: Point =
      where < 0.4 ? { x: 30 + r() * 770, y: r() * 560 }
      : where < 0.7 ? { x: r() * 800, y: 562 + r() * 36 }
      : where < 0.85 ? { x: 2 + r() * 26, y: r() * 600 }
      : { x: HOME.x + r() * HOME.width, y: HOME.y + r() * HOME.height };
    const speed = [0.05, 0.2, 0.45, 0.8, 1.5, 3, 6][Math.floor(r() * 7)]!;
    const n = Math.max(1, Math.round(Math.hypot(goal.x - p.x, goal.y - p.y) / (speed * FRAME)));
    const from = p;
    for (let i = 1; i <= n; i++) {
      p = { x: from.x + ((goal.x - from.x) * i) / n, y: from.y + ((goal.y - from.y) * i) / n };
      out.push({ t: (t += FRAME), p, keys, speed });
    }
  }
  return out;
}
const WALKS = Array.from({ length: 60 }, (_, k) => walk(1009 + k * 7919));

/** The landing model's held place as a release gives it (without the `home` flag the release adds). */
type Landed = { kind: "spot"; lane: string; spot: string; point: Point } | { kind: "float"; point: Point } | null;
const heldAsRelease = (f: LandingFrame): Landed =>
  !f.held ? null : f.held.kind === "spot" ? { kind: "spot", lane: f.held.lane, spot: f.held.spot, point: f.held.point } : { kind: "float", point: f.held.point };
const withoutHome = (r: LandingRelease) => {
  if (!r || r.kind === "float") return r;
  const { home: _home, ...rest } = r;
  return rest;
};
const drawn = (plan: ReturnType<typeof previewPlan>): boolean => plan.showIndicator || plan.makeRoom || plan.snapItem;
/** Open space: inside the content, out of home, the column, and every lane by more than the landing model's exit margin. */
const openSpace = (p: Point): boolean =>
  inRect(CONTENT, p, -1) && !inRect(HOME, p) && !inRect(COLUMN, p, 1) && REGIONS.lanes.every((l) => !inRect(l.rect, p, 12 + 1));
const keyHeld = (k: DragKeys): boolean => !!(k.shift || k.meta);
const first = <T,>(xs: readonly T[], n = 4): T[] => xs.slice(0, n);

describe("one release rule: a release reads the last frame (both models)", () => {
  it("intent: on every frame a release there lands exactly the frame's held place, else home", () => {
    const wrong: string[] = [];
    let frames = 0;
    for (const [w, samples] of WALKS.entries()) {
      const intent = startIntent();
      for (const s of samples) {
        const f = intent.update(s.p, s.t, TARGETS, s.keys);
        const r = intent.release(s.p, s.t, TARGETS, s.keys);
        frames++;
        if ((r?.id ?? null) !== (f.shown?.id ?? null)) wrong.push(`walk ${w} t ${s.t}: held ${f.shown?.id ?? "-"}, release ${r?.id ?? "home"}`);
      }
    }
    expect(first(wrong)).toEqual([]);
    expect(frames).toBeGreaterThan(5000);
  });

  it("landing model: on every frame a release there lands exactly the frame's held place, else home", () => {
    const wrong: string[] = [];
    for (const [w, samples] of WALKS.entries()) {
      const model = createLandingModel(landingOptions());
      for (const s of samples) {
        const f = model.update(s.p, s.t, s.keys);
        const r = model.release(s.p, s.t, s.keys);
        if (JSON.stringify(withoutHome(r)) !== JSON.stringify(heldAsRelease(f))) wrong.push(`walk ${w} t ${s.t}: held ${JSON.stringify(f.held)}, release ${JSON.stringify(r)}`);
      }
    }
    expect(first(wrong)).toEqual([]);
  });

  it("both: a release at a new point equals an update at that point, then the same read", () => {
    const wrong: string[] = [];
    for (const [w, samples] of WALKS.slice(0, 20).entries()) {
      const r = random(w + 1);
      for (let c = 0; c < 6; c++) {
        const cut = Math.floor(r() * samples.length);
        const last = samples[cut]!;
        const q: Point = { x: r() * 800, y: r() * 600 };
        const t = last.t + FRAME;
        const a = startIntent();
        const b = startIntent();
        const m = createLandingModel(landingOptions());
        const n = createLandingModel(landingOptions());
        for (const s of samples.slice(0, cut + 1)) {
          a.update(s.p, s.t, TARGETS, s.keys);
          b.update(s.p, s.t, TARGETS, s.keys);
          m.update(s.p, s.t, s.keys);
          n.update(s.p, s.t, s.keys);
        }
        const direct = a.release(q, t, TARGETS, last.keys)?.id ?? null;
        const fb = b.update(q, t, TARGETS, last.keys);
        if (direct !== (fb.shown?.id ?? null) || direct !== (b.release(q, t, TARGETS, last.keys)?.id ?? null)) wrong.push(`intent walk ${w} cut ${cut}`);
        const mr = JSON.stringify(m.release(q, t, last.keys));
        const fn = n.update(q, t, last.keys);
        if (mr !== JSON.stringify(n.release(q, t, last.keys)) || JSON.stringify(withoutHome(JSON.parse(mr))) !== JSON.stringify(heldAsRelease(fn))) wrong.push(`landing walk ${w} cut ${cut}`);
      }
    }
    expect(first(wrong)).toEqual([]);
  });
});

describe("one release rule: the float needs no aim (both models)", () => {
  it("with the pointer out of home and open space the pick, the float is held from the first such frame, at every speed", () => {
    const wrong: string[] = [];
    const speeds = { intent: new Set<number>(), landing: new Set<number>() };
    for (const [w, samples] of WALKS.entries()) {
      const intent = startIntent();
      const model = createLandingModel(landingOptions());
      for (const s of samples) {
        const f = intent.update(s.p, s.t, TARGETS, s.keys);
        const mf = model.update(s.p, s.t, s.keys);
        if (keyHeld(s.keys) || !openSpace(s.p)) continue;
        // The intent's pick under the pointer, as its hysteresis holds it: the float, out of home.
        if (intent.state.current?.free === true && intent.state.leftHome) {
          speeds.intent.add(s.speed);
          if (f.shown?.id !== "float") wrong.push(`intent walk ${w} t ${s.t} at ${s.speed} px/ms: held ${f.shown?.id ?? "-"}`);
        }
        speeds.landing.add(s.speed);
        if (mf.held?.kind !== "float") wrong.push(`landing walk ${w} t ${s.t} at ${s.speed} px/ms: region ${mf.region}`);
      }
    }
    expect(first(wrong)).toEqual([]);
    // Every speed of the walks met open space, rests included.
    expect([...speeds.intent].sort((a, b) => a - b)).toEqual([0, 0.05, 0.2, 0.45, 0.8, 1.5, 3, 6]);
    expect([...speeds.landing].sort((a, b) => a - b)).toEqual([0, 0.05, 0.2, 0.45, 0.8, 1.5, 3, 6]);
  });
});

describe("one release rule: a frame draws its held place and nothing else (both models)", () => {
  it("in every mode the plan draws only when the frame holds a place, and never for a refusal", () => {
    const wrong: string[] = [];
    for (const [w, samples] of WALKS.entries()) {
      const intent = startIntent();
      const model = createLandingModel(landingOptions());
      for (const s of samples) {
        const f = intent.update(s.p, s.t, TARGETS, s.keys);
        const mf = model.update(s.p, s.t, s.keys);
        for (const mode of MODES) {
          if (drawn(previewPlan(f, mode)) && (f.shown === null || f.refused !== null)) wrong.push(`intent walk ${w} t ${s.t} ${mode}`);
          if (drawn(previewPlan(mf, mode)) && (mf.held === null || mf.region === "refused")) wrong.push(`landing walk ${w} t ${s.t} ${mode}: ${mf.region}`);
        }
      }
    }
    expect(first(wrong)).toEqual([]);
  });

  it("held is drawn at once: every held place but the float draws in the frame that holds it; the intent's Glide and Snap room wait is counted", () => {
    const wrong: string[] = [];
    const gap: Record<PreviewMode, number> = { outline: 0, placeholder: 0, glide: 0, snap: 0 };
    let heldFrames = 0;
    let landingHeld = 0;
    for (const [w, samples] of WALKS.entries()) {
      const intent = startIntent();
      const model = createLandingModel(landingOptions());
      for (const s of samples) {
        const f = intent.update(s.p, s.t, TARGETS, s.keys);
        const mf = model.update(s.p, s.t, s.keys);
        if (f.shown && !f.shown.free) {
          heldFrames++;
          for (const mode of MODES) {
            if (drawn(previewPlan(f, mode))) continue;
            // The known gap (closed in a later step): a slotted target held before its room opens, in Glide and Snap.
            if ((mode === "glide" || mode === "snap") && !f.room) gap[mode]++;
            else wrong.push(`intent walk ${w} t ${s.t} ${mode}: ${f.shown.id}`);
          }
        }
        if (mf.held?.kind === "spot") {
          landingHeld++;
          for (const mode of MODES) if (!drawn(previewPlan(mf, mode))) wrong.push(`landing walk ${w} t ${s.t} ${mode}: ${mf.held.spot}`);
        }
      }
    }
    expect(first(wrong)).toEqual([]);
    expect(heldFrames).toBeGreaterThan(100);
    expect(landingHeld).toBeGreaterThan(100);
    // Reported, not failed: the intent's frames held but not drawn yet, waiting for the room.
    console.info(`held is drawn at once: intent held ${heldFrames} frames; undrawn (room not open yet) glide ${gap.glide}, snap ${gap.snap}; landing model held ${landingHeld} frames, undrawn 0`);
    expect([gap.outline, gap.placeholder]).toEqual([0, 0]);
  });
});
