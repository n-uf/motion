/**
 * The landing model's properties, over generated pointer paths on plain lane fixtures (the shapes placement's `lanes()`
 * gives). The first check is the zoom-up-the-rail repro: an item dragged along its rail never leaves it.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, type LandingFrame, type LandingLane, type LandingOptions, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const STAGE = rect(0, 0, 1080, 640);

/**
 * The window of the rail repro, in window px: a 30 px toolbar rail at the left (y 32–608), Tools at its top (32–190),
 * Zoom below (265–367); Zoom held. Its spots: above Tools, and below Tools (Zoom's own place). A top bar (y 0–32) to the
 * right, a column at the right (x 840–1080).
 */
function railWindow(): LandingRegions {
  const rail: LandingLane = {
    id: "rail-left",
    rect: rect(0, 32, 30, 576),
    axis: "y",
    // The boundary at Tools' middle (111).
    spots: [
      { id: "rail-left/start/^|tools", along: [32, 111], landing: rect(0, 32, 30, 102) },
      { id: "rail-left/start/tools|$", along: [111, 608], landing: rect(0, 196, 30, 102) },
    ],
    refused: [],
  };
  const bar: LandingLane = {
    id: "top",
    rect: rect(30, 0, 810, 32),
    axis: "x",
    // Pitched spots on an empty bar: a change between them moves nothing else.
    spots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ id: `top/start/^|$@${k}`, along: [30 + k * 81, 30 + (k + 1) * 81] as const, landing: rect(38 + k * 81, 0, 75, 32), others: "rail as seen" })),
    refused: [],
  };
  return {
    lanes: [rail, bar],
    refused: [rect(840, 32, 240, 576)],
    content: rect(30, 32, 810, 576),
    blocked: [rect(0, 32, 30, 576), rect(30, 0, 810, 32), rect(840, 32, 240, 576)],
    stage: STAGE,
    item: { width: 30, height: 102 },
  };
}
const FLOAT = (p: Point): Rect => rect(p.x - 15, p.y - 15, 102, 30);

/** Drive `points` (keys [ms, x, y], linear between) every 8 ms: every frame with its point. */
function run(o: LandingOptions, keys: readonly (readonly [number, number, number])[], shiftFrom = Infinity) {
  const m = createLandingModel(o);
  const out: { t: number; p: Point; f: LandingFrame; release: ReturnType<typeof m.release> }[] = [];
  const end = keys.at(-1)![0];
  for (let t = 0; t <= end + 1e-6; t += 8) {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1]![0] < t) i++;
    const a = keys[i]!;
    const b = keys[Math.min(i + 1, keys.length - 1)]!;
    const u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 1;
    const p = { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u };
    const f = m.update(p, t, { shift: t >= shiftFrom });
    out.push({ t, p, f, release: m.release() });
  }
  return { frames: out, model: m };
}
/** Keys through `points` at `speed` px/ms. */
const path = (points: readonly Point[], speed: number): [number, number, number][] => {
  const out: [number, number, number][] = [[0, points[0]!.x, points[0]!.y]];
  let t = 0;
  for (let i = 1; i < points.length; i++) {
    t += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y) / speed;
    out.push([t, points[i]!.x, points[i]!.y]);
  }
  return out;
};
const home = { lane: "rail-left", spot: "rail-left/start/tools|$" };
const base = (more: Partial<LandingOptions> = {}): LandingOptions => ({ regions: railWindow(), floatLanding: FLOAT, home, ...more });

describe("landing model: an item dragged along its lane never leaves it (P1, the rail repro first)", () => {
  it("Zoom pulled straight up its rail, 6 px every 40 ms, to 10 px above the rail: always in the rail, docked above Tools", () => {
    const keys: [number, number, number][] = [];
    for (let k = 0, y = 280; y >= 22; k++, y -= 6) keys.push([k * 40, 15, y]);
    const { frames } = run(base(), keys);
    const grown = rect(-12, 20, 54, 600);
    for (const { t, p, f } of frames) if (p.y >= grown.y) expect([t, f.region, f.lane]).toEqual([t, "lane", "rail-left"]);
    const last = frames.at(-1)!;
    expect(last.release).toEqual({ kind: "spot", lane: "rail-left", spot: "rail-left/start/^|tools", home: false });
    // Never a float on the way, never two spots at once.
    expect(frames.every((x) => x.f.region === "lane")).toBe(true);
  });

  it("a toolbar dragged along the bar steps spot to spot, never through the document", () => {
    const o = base({ home: { lane: "top", spot: "top/start/^|$@0" } });
    const { frames } = run(o, path([{ x: 60, y: 16 }, { x: 820, y: 16 }, { x: 60, y: 16 }], 0.3));
    expect(frames.every((x) => x.f.region === "lane" && x.f.lane === "top")).toBe(true);
  });

  it("it leaves only past the exit margin", () => {
    const { frames } = run(base(), path([{ x: 15, y: 300 }, { x: 41, y: 300 }, { x: 60, y: 300 }], 0.1));
    for (const { p, f } of frames) expect([Math.round(p.x), f.region === "lane"]).toEqual([Math.round(p.x), p.x <= 30 + 12]);
  });
});

describe("landing model: drawn = landed, hysteresis, guides, float, room (P2–P12)", () => {
  const sweeps = (): [number, number, number][][] => {
    const out: [number, number, number][][] = [];
    for (const speed of [0.05, 0.2, 0.6, 1.5, 3, 5]) {
      out.push(path([{ x: 400, y: 300 }, { x: 15, y: 300 }, { x: 15, y: 60 }, { x: 400, y: 16 }, { x: 820, y: 16 }, { x: 400, y: 300 }], speed));
      out.push(path([{ x: 400, y: 300 }, { x: 900, y: 300 }, { x: 400, y: 500 }], speed));
    }
    return out;
  };

  it("P2: every frame, the landing is what a release lands", () => {
    for (const keys of sweeps()) {
      const { frames } = run(base(), keys);
      for (const { f, release } of frames) {
        if (f.region === "lane") expect(release && release.kind === "spot" ? release.spot : null).toBe(f.spot);
        else if (f.region === "open") expect(release && release.kind === "float" ? release.rect : null).toEqual(f.landing);
        else expect(release).toBeNull();
      }
    }
  });

  it("P3: a wobble across a spot boundary inside the margin changes nothing; a sweep changes at most once per boundary", () => {
    const keys: [number, number, number][] = [];
    for (let k = 0; k < 40; k++) keys.push([k * 24, 15, 111 + (k % 2 ? 4 : -4)]);
    const { frames } = run(base(), [[0, 15, 300], [400, 15, 140], ...keys.map(([t, x, y]): [number, number, number] => [t + 600, x, y])]);
    const after = frames.filter((x) => x.t >= 600).map((x) => x.f.spot);
    expect(after.filter((s, i) => i > 0 && s !== after[i - 1]).length).toBe(0);
    for (const keys2 of sweeps()) {
      const { frames: fs } = run(base({ home: { lane: "top", spot: "top/start/^|$@0" } }), keys2);
      const top = fs.filter((x) => x.f.lane === "top").map((x) => x.f.spot);
      expect(top.filter((s, i) => i > 0 && s !== top[i - 1]).length).toBeLessThanOrEqual(10);
    }
  });

  it("P5: the guides are the held lane's spots, the same set on every frame the lane is held, and none with Shift", () => {
    const { frames } = run(base({ placeGuides: "near" }), path([{ x: 15, y: 300 }, { x: 15, y: 40 }], 0.1));
    const sets = new Set(frames.filter((x) => x.f.lane === "rail-left").map((x) => x.f.guides.map((g) => g.id).join()));
    expect(sets.size).toBe(1);
    const { frames: shifted } = run(base({ placeGuides: "near" }), path([{ x: 15, y: 300 }, { x: 15, y: 200 }], 0.1), 0);
    expect(shifted.every((x) => x.f.guides.length === 0)).toBe(true);
  });

  it("P5: the approached lane's guides don't flip at a corner", () => {
    const o = base({ placeGuides: "near", home: undefined });
    const keys: [number, number, number][] = [];
    for (let k = 0; k < 40; k++) keys.push([k * 20, 70 + (k % 2 ? 6 : -6), 70 + (k % 2 ? -6 : 6)]);
    const { frames } = run(o, keys);
    const lanes = frames.map((x) => x.f.guides[0]?.lane ?? null);
    expect(lanes.filter((l, i) => i > 0 && l !== lanes[i - 1]).length).toBeLessThanOrEqual(1);
  });

  it("P6: the float shows only over the document, except with Shift", () => {
    for (const keys of sweeps()) {
      const { frames } = run(base(), keys);
      // The document region, or a lane the gate hasn't let in yet (on the way in it is still the document).
      const lanesHere = railWindow().lanes.map((l) => l.rect);
      const inLane = (p: Point): boolean => lanesHere.some((q) => p.x >= q.x && p.x <= q.x + q.width && p.y >= q.y && p.y <= q.y + q.height);
      for (const { p, f } of frames) if (f.region === "open") expect(strictlyContent(p) || inLane(p)).toBe(true);
    }
    const { frames } = run(base(), path([{ x: 15, y: 300 }, { x: 15, y: 290 }], 0.1), 0);
    expect(frames.every((x) => x.f.region === "open" && !x.f.room)).toBe(true);
  });

  it("P10: a fly-through of the 32 px bar or the 30 px rail at 1.5–5 px/ms opens no room; a slow hand inside does at once", () => {
    for (const speed of [1.5, 3, 5]) {
      const across = run(base({ home: undefined }), path([{ x: 400, y: 300 }, { x: 400, y: -30 }], speed));
      expect(across.frames.some((x) => x.f.lane === "top")).toBe(false);
      const rail = run(base({ home: undefined }), path([{ x: 400, y: 300 }, { x: -30, y: 300 }], speed));
      expect(rail.frames.some((x) => x.f.lane === "rail-left" && x.p.x >= 0)).toBe(false);
    }
    const slow = run(base({ home: undefined }), [[0, 400, 300], [600, 400, 20], [800, 400, 20]]);
    expect(slow.frames.at(-1)!.f.lane).toBe("top");
  });

  it("P11 under P1: on the window's edge or up to 48 px past it is in the lane drawn there; beyond is nowhere", () => {
    const { frames } = run(base(), [[0, 15, 300], [96, 0, 300], [200, 0, 300], [296, -20, 300], [400, -40, 300], [500, -60, 300], [600, -60, 300]]);
    expect(frames.find((x) => x.p.x === 0)!.f.region).toBe("lane");
    expect(frames.find((x) => x.p.x === -20)!.f.region).toBe("lane");
    expect(frames.find((x) => x.p.x === -40)!.f.region).toBe("lane");
    expect(frames.at(-1)!.f.region).toBe("nowhere");
    expect(frames.at(-1)!.release).toBeNull();
  });

  it("P1: a pointer flung past the window's edge and held there docks in the lane against it", () => {
    for (const speed of [1.5, 3, 5])
      for (const end of [{ x: -10, y: 300 }, { x: 0, y: 300 }, { x: 400, y: -10 }]) {
        const keys = path([{ x: 400, y: 300 }, end], speed);
        const t = keys.at(-1)![0];
        const { frames } = run(base({ home: undefined }), [...keys, [t + 40, end.x, end.y]]);
        expect([speed, end, frames.at(-1)!.f.region], `${speed}`).toEqual([speed, end, "lane"]);
      }
  });

  it("a refused stretch of a lane says Can't go here, the lane held (lanes() joins shorter ones to their spots)", () => {
    const r = railWindow();
    const long: LandingRegions = { ...r, lanes: [{ ...r.lanes[0]!, refused: [{ along: [300, 500] }] }, r.lanes[1]!] };
    const f = run(base({ regions: long }), [[0, 15, 280], [400, 15, 400], [600, 15, 400]]).frames.at(-1)!;
    expect([f.f.region, f.f.lane, f.release]).toEqual(["refused", "rail-left", null]);
  });

  it("a fast move along the bar keeps the item at the hand: changes that move nothing else aren't gated", () => {
    for (const speed of [0.45, 0.8, 1.2]) {
      const { frames } = run(base({ home: { lane: "top", spot: "top/start/^|$@0" } }), path([{ x: 60, y: 16 }, { x: 820, y: 16 }], speed));
      for (const { p, f } of frames) expect(Math.abs(f.landing!.x + f.landing!.width / 2 - p.x), `${speed} ${p.x}`).toBeLessThanOrEqual(81);
    }
  });

  it("lane to lane at the corner never passes through the float; the new lane takes it once its gate passes", () => {
    for (const speed of [0.6, 1.5]) {
      const keys = path([{ x: 140, y: 16 }, { x: 25, y: 25 }, { x: 15, y: 260 }], speed);
      const t = keys.at(-1)![0];
      const { frames } = run(base({ home: { lane: "top", spot: "top/start/^|$@1" } }), [...keys, [t + 40, 15, 260]]);
      expect(frames.some((x) => x.f.region === "open"), `${speed}`).toBe(false);
      expect(frames.at(-1)!.f.lane).toBe("rail-left");
    }
  });

  it("a fast crossing from a held lane through a touching one opens no room in it; a fast slide along it takes it", () => {
    for (const speed of [0.6, 1.5, 3]) {
      const across = run(base({ home: { lane: "top", spot: "top/start/^|$@0" } }), path([{ x: 60, y: 16 }, { x: 15, y: 50 }, { x: 200, y: 300 }], speed));
      expect(across.frames.some((x) => x.f.lane === "rail-left"), `${speed}`).toBe(false);
      const along = run(base({ home: { lane: "top", spot: "top/start/^|$@0" } }), path([{ x: 60, y: 16 }, { x: 15, y: 50 }, { x: 15, y: 300 }], speed));
      expect(along.frames.at(-1)!.f.lane, `${speed}`).toBe("rail-left");
    }
  });

  it("a host updating every frame: repeated points aren't still until the pointer has stayed put", () => {
    for (const [frameHz, sampleHz] of [[120, 60], [144, 60], [60, 125], [240, 125]] as const)
      for (const speed of [0.6, 1.2, 2.5]) {
        const m = createLandingModel(base({ home: undefined }));
        const T = 330 / speed;
        let sampleT = -1e9;
        let sample = { x: 400, y: 300 };
        let inBar = 0;
        for (let t = 0; t <= T; t += 1000 / frameHz) {
          if (t - sampleT >= 1000 / sampleHz - 1e-6) {
            sampleT = t;
            sample = { x: 400, y: 300 - 330 * Math.min(1, t / T) };
          }
          if (m.update(sample, t).lane === "top") inBar++;
        }
        expect([frameHz, sampleHz, speed, inBar]).toEqual([frameHz, sampleHz, speed, 0]);
      }
    // Sparse and irregular samples (30 Hz, 20 Hz, gaps of 24–44 ms) under 120 Hz frames: a fast crossing is never still
    // between samples.
    let seed = 7;
    const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (const gap of [() => 1000 / 30, () => 1000 / 20, () => 24 + rnd() * 20])
      for (const speed of [0.6, 1.2, 2.5])
        for (let run = 0; run < 10; run++) {
          const m = createLandingModel(base({ home: undefined }));
          const T = 330 / speed;
          let next = 0;
          let sample = { x: 400 + run, y: 300 };
          let inBar = 0;
          for (let t = 0; t <= T; t += 1000 / 120) {
            if (t >= next) {
              next = t + gap();
              sample = { x: 400 + run, y: 300 - 330 * Math.min(1, t / T) };
            }
            if (m.update(sample, t).lane === "top" && sample.y > 0) inBar++;
          }
          expect([speed, run, inBar]).toEqual([speed, run, 0]);
        }
    // Brought to the bar and kept there, per-frame updates make the pointer still after `pause`.
    const m = createLandingModel(base({ home: undefined }));
    for (let t = 0; t <= 400; t += 1000 / 120) m.update({ x: 400, y: Math.max(16, 300 - t) }, t);
    expect(m.frame.lane).toBe("top");
  });

  it("guides: a lane's marks when it has them; over a refused place, the nearest lane's at any distance", () => {
    const r = railWindow();
    const marks = [{ id: "rail-left/line/tools|zoom", kind: "line" as const, rect: rect(0, 190, 30, 0) }, { id: "rail-left/box/zoom|$", kind: "box" as const, rect: rect(0, 367, 30, 241) }];
    const withMarks: LandingRegions = { ...r, lanes: [{ ...r.lanes[0]!, marks }, r.lanes[1]!] };
    const held = run(base({ regions: withMarks, placeGuides: "near" }), [[0, 15, 300], [40, 15, 300]]).frames.at(-1)!;
    expect(held.f.guides.map((g) => [g.id, g.kind, g.rect])).toEqual(marks.map((m) => [m.id, m.kind, m.rect]));
    const over = run(base({ placeGuides: "near", home: undefined }), [[0, 1000, 300], [40, 1000, 300]]).frames.at(-1)!;
    expect(over.f.region).toBe("refused");
    expect(over.f.guides.length).toBeGreaterThan(0);
  });

  it("the fixed point: a spot whose room moves its boundary away from the pointer isn't taken; regionsFor is called once per spot", () => {
    const r = railWindow();
    // With the spot above Tools held, the room pushes Tools down 62 px: its middle (the boundary) at 173.
    const above: LandingRegions = { ...r, lanes: [{ ...r.lanes[0]!, spots: [{ ...r.lanes[0]!.spots[0]!, along: [32, 173] }, { ...r.lanes[0]!.spots[1]!, along: [173, 608] }] }, r.lanes[1]!] };
    let calls = 0;
    const regionsFor = (id: string): LandingRegions => {
      calls++;
      return id === "rail-left/start/^|tools" ? above : r;
    };
    const keys: [number, number, number][] = [[0, 15, 280], [300, 15, 104]];
    for (let k = 0; k < 30; k++) keys.push([320 + k * 24, 15, 104 + (k % 2 ? 8 : 0)]);
    const { frames } = run(base({ regionsFor }), keys);
    const spots = frames.map((x) => x.f.spot);
    expect(spots.filter((s, i) => i > 0 && s !== spots[i - 1]).length).toBeLessThanOrEqual(1);
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("setRegions: a spot whose id is gone maps to its lane's spot under the pointer; a lane that is gone is let go", () => {
    const m = createLandingModel(base());
    m.update({ x: 15, y: 300 }, 0);
    expect(m.frame.spot).toBe("rail-left/start/tools|$");
    const r = railWindow();
    const renamed: LandingRegions = { ...r, lanes: [{ ...r.lanes[0]!, spots: r.lanes[0]!.spots.map((s) => ({ ...s, id: `${s.id}#2` })) }, r.lanes[1]!] };
    m.setRegions(renamed);
    expect(m.update({ x: 15, y: 300 }, 8).spot).toBe("rail-left/start/tools|$#2");
    m.setRegions({ ...r, lanes: [r.lanes[1]!] });
    expect(m.update({ x: 15, y: 300 }, 16).lane).toBeNull();
  });

  it("setRegions with a new regionsFor: the held lane's stretches come from it, not the old one", () => {
    const r = railWindow();
    const old: string[] = [];
    const m = createLandingModel(base({ regionsFor: (id) => (old.push(id), r) }));
    m.update({ x: 15, y: 300 }, 0);
    const renamed: LandingRegions = { ...r, lanes: [{ ...r.lanes[0]!, spots: r.lanes[0]!.spots.map((s) => ({ ...s, id: `${s.id}#2` })) }, r.lanes[1]!] };
    const asked: string[] = [];
    m.setRegions(renamed, (id) => (asked.push(id), renamed));
    const before = old.length;
    expect(m.update({ x: 15, y: 300 }, 40).spot).toBe("rail-left/start/tools|$#2");
    expect(asked).toContain("rail-left/start/tools|$#2");
    expect(old.length).toBe(before);
  });

  it("P12: Alt and Ctrl/Meta change nothing", () => {
    const keys = path([{ x: 15, y: 300 }, { x: 15, y: 60 }, { x: 400, y: 300 }], 0.3);
    const plain = run(base(), keys).frames.map((x) => [x.f.region, x.f.spot]);
    const m = createLandingModel(base());
    let i = 0;
    for (let t = 0; t <= keys.at(-1)![0] + 1e-6; t += 8, i++) {
      let j = 0;
      while (j < keys.length - 1 && keys[j + 1]![0] < t) j++;
      const a = keys[j]!;
      const b = keys[Math.min(j + 1, keys.length - 1)]!;
      const u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 1;
      const f = m.update({ x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u }, t, { alt: true, ctrl: true, meta: true });
      expect([f.region, f.spot]).toEqual(plain[i]);
    }
  });
});

/** Inside the fixture's document region (content less what blocks it). */
function strictlyContent(p: Point): boolean {
  const r = railWindow();
  const inR = (q: Rect): boolean => p.x >= q.x && p.x <= q.x + q.width && p.y >= q.y && p.y <= q.y + q.height;
  return inR(r.content) && !r.blocked.some((b) => p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height);
}
