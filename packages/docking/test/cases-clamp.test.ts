/**
 * The host contract the runner enforces: a `move` to a `point` is clamped into the stage before the host is asked to
 * aim there, so a pointer past the window's edge means its nearest point of the window, on every host.
 */
import { describe, expect, it } from "vitest";
import { CASES, createReferenceHost, g, runCase, runCaseAsync, type CaseHost, type CaseRow, type Gesture } from "../src/testing";

/** The reference host, recording the gestures it is handed. */
function recording(): { host: CaseHost; got: Gesture[] } {
  const inner = createReferenceHost();
  const got: Gesture[] = [];
  return {
    got,
    host: {
      pick: inner.pick,
      load: (s, st) => inner.load(s, st),
      perform: (x) => (got.push(x), inner.perform(x)),
      layout: () => inner.layout(),
    },
  };
}

describe("the pointer is clamped into the stage", () => {
  const base = CASES.find((c) => c.id === "C17")!;
  const stage = base.state.stage;
  const row = (gestures: readonly Gesture[], extra: Partial<CaseRow> = {}): CaseRow => ({ ...base, gestures, checkpoints: [], expectLayout: {}, ...extra });

  it("a move past the stage's edge reaches the host as the edge's nearest point; a point inside, and a press's grab, are untouched", () => {
    const r = recording();
    runCase(row([g.press("findings", { x: 40, y: 10 }), g.at(stage.x + stage.width + 80, -30), g.hold(), g.at(100, 200), g.release()]), r.host);
    const moves = r.got.filter((x) => x.type === "move").map((x) => x.point);
    expect(moves).toEqual([{ x: stage.x + stage.width, y: 0 }, { x: 100, y: 200 }]);
    expect(r.got.find((x) => x.type === "press")!.point).toEqual({ x: 40, y: 10 });
  });

  it("the stage is the row's setting, and a resize of the window changes it", () => {
    const r = recording();
    runCase(row([g.press("findings", { x: 40, y: 10 }), g.at(900, 900), g.hold(), g.release()], { settings: { stage: { w: 500, h: 300 } } }), r.host);
    expect(r.got.find((x) => x.type === "move")!.point).toEqual({ x: 500, y: 300 });
    const r2 = recording();
    runCase(row([g.resizeWindow(400, 250), g.press("findings", { x: 40, y: 10 }), g.at(900, 900), g.hold(), g.release()]), r2.host);
    expect(r2.got.find((x) => x.type === "move")!.point).toEqual({ x: 400, y: 250 });
  });

  it("the async runner clamps the same", async () => {
    const r = recording();
    await runCaseAsync(row([g.press("findings", { x: 40, y: 10 }), g.at(2000, 2000), g.hold(), g.release()]), r.host);
    expect(r.got.find((x) => x.type === "move")!.point).toEqual({ x: stage.x + stage.width, y: stage.y + stage.height });
  });
});
