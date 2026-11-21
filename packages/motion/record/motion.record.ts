/**
 * The motion recorder (docs/old-vs-new.md): the public outputs of `@n-uf/motion` over a fixed corpus, written as
 * canonical JSON to `OVN_OUT`. Run through `pnpm old-vs-new <base>`, or alone:
 * `OVN_OUT=/tmp/motion.json pnpm --filter @n-uf/motion exec vitest run --config record/vitest.config.ts`.
 *
 * The corpus:
 * - the landing model's frames over every landing-case row (`@n-uf/docking/testing`'s `LANDING_CASES`, played by its
 *   `createLandingHost` over `createLandingModel`), at the default and at pitched stretches;
 * - `createLayoutMotion`'s frames over scripted runs on the fake clock (a move, a retarget mid-flight, a resize, a
 *   show and a hide, several items, a held item), every frame's draw and every lay-out;
 * - the animators' samples: settle, spring and tween over a few starts and targets.
 *
 * Old commits: every call goes through `attempt` and every module through `load`, so a builder or export the old code
 * lacks records `{ absent }` and a call that throws records `{ threw }`; nothing stops the run.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { load, need, outFile, recorder } from "../../../record/canon";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const src = (f: string): string => join(pkg, "src", f);

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- the code under record has whatever API its commit has

const rect = (x: number, y: number, width: number, height: number): Any => ({ x, y, width, height });

describe("record motion", () => {
  it("writes the outputs", async () => {
    const out = recorder("motion");
    const drag: Any = await load(src("drag/index.ts"));
    const clock: Any = await load(src("clock/index.ts"));
    const layout: Any = await load(src("layout/index.ts"));
    const values: Any = await load(src("values/index.ts"));
    const testing: Any = await load(join(pkg, "..", "docking", "src", "testing", "index.ts"));

    // --- the landing model over the landing-case rows -------------------------------------------------------------
    out.attempt("corpus", "landing rows", () => ({ rows: need(testing?.LANDING_CASES, "docking/testing LANDING_CASES").length }));
    for (const stretchPositions of [undefined, "pitched"] as const)
      for (const row of testing?.LANDING_CASES ?? []) {
        const id = `${row.id}${stretchPositions ? ` [${stretchPositions}]` : ""}`;
        out.attempt("landing-frames", id, () => {
          const host = need(testing.createLandingHost, "docking/testing createLandingHost")({ landing: need(drag?.createLandingModel, "createLandingModel"), ...(stretchPositions ? { stretchPositions } : {}) });
          const played = host.play(row);
          return { frames: played.frames, lengthOfRun: played.frames.length };
        });
      }

    // --- the layout motion over scripted runs ---------------------------------------------------------------------
    type Step = { readonly frames: number; readonly do?: (m: Any, items: Record<string, Any>) => void };
    const runs: { id: string; add: [string, Any, { shown?: boolean }?][]; steps: Step[] }[] = [
      { id: "one move", add: [["a", rect(0, 0, 100, 50)]], steps: [{ frames: 0, do: (_m, i) => i.a.moveTo(rect(300, 0, 100, 50)) }, { frames: 40 }] },
      {
        id: "retarget mid-flight",
        add: [["a", rect(0, 0, 100, 100)]],
        steps: [
          { frames: 0, do: (_m, i) => i.a.moveTo(rect(400, 0, 100, 100)) },
          { frames: 5, do: (_m, i) => i.a.moveTo(rect(380, 300, 220, 60)) },
          { frames: 6, do: (_m, i) => i.a.moveTo(rect(-50, 120, 90, 300)) },
          { frames: 6, do: (_m, i) => i.a.moveTo(rect(10, 10, 100, 100)) },
          { frames: 40 },
        ],
      },
      { id: "resize", add: [["a", rect(0, 0, 100, 100)]], steps: [{ frames: 0, do: (_m, i) => i.a.moveTo(rect(0, 0, 300, 40)) }, { frames: 8, do: (_m, i) => i.a.moveTo(rect(20, 30, 60, 220)) }, { frames: 40 }] },
      { id: "show and hide", add: [["a", rect(50, 50, 120, 80), { shown: false }]], steps: [{ frames: 0, do: (_m, i) => i.a.show(true) }, { frames: 12, do: (_m, i) => i.a.show(false) }, { frames: 30 }] },
      {
        id: "show now",
        add: [["a", rect(50, 50, 120, 80), { shown: false }]],
        steps: [{ frames: 0, do: (_m, i) => i.a.show(true, { now: true }) }, { frames: 3, do: (_m, i) => i.a.moveTo(rect(90, 90, 120, 80)) }, { frames: 30 }],
      },
      {
        id: "three items",
        add: [["a", rect(0, 0, 100, 100)], ["b", rect(110, 0, 100, 100)], ["c", rect(220, 0, 100, 100)]],
        steps: [{ frames: 0, do: (_m, i) => (i.a.moveTo(rect(110, 0, 100, 100)), i.b.moveTo(rect(220, 0, 100, 100)), i.c.moveTo(rect(0, 0, 100, 100))) }, { frames: 4, do: (_m, i) => i.b.moveTo(rect(0, 120, 320, 60)) }, { frames: 40 }],
      },
      {
        id: "held item",
        add: [["a", rect(0, 0, 200, 100)]],
        steps: [
          {
            frames: 0,
            do: (m, i) => {
              const held = need(layout?.holdItem, "holdItem")(i.a, { x: 20, y: 10 });
              void m;
              for (const k of [0, 1, 2, 3, 4]) held.move?.({ x: 100 + k * 40, y: 60 + k * 10 });
            },
          },
          { frames: 30 },
        ],
      },
    ];
    for (const omega of [undefined, 37]) {
      for (const run of runs) {
        const id = `${run.id}${omega ? ` omega ${omega}` : ""}`;
        out.attempt("layout-frames", id, () => {
          const fake = need(clock?.createFakeClock, "createFakeClock")();
          const loop = need(clock?.createFrameLoop, "createFrameLoop")({ clock: fake });
          const motion = need(layout?.createLayoutMotion, "createLayoutMotion")({ loop, ...(omega ? { omega } : {}) });
          const log: Any[] = [];
          const items: Record<string, Any> = {};
          for (const [name, at, options] of run.add) {
            const drawable = { layOut: (box: Any) => log.push({ t: fake.now(), layOut: name, box: { ...box } }), draw: (frame: Any) => log.push({ t: fake.now(), draw: name, frame }) };
            items[name] = motion.add(name, drawable, at, options);
          }
          for (const step of run.steps) {
            step.do?.(motion, items);
            for (let f = 0; f < step.frames; f++) fake.frame();
          }
          return { log, drawn: Object.fromEntries(Object.entries(items).map(([k, it]) => [k, { drawn: it.drawn, target: it.target, settled: it.settled, shown: it.shown }])) };
        });
      }
    }

    // --- the animators --------------------------------------------------------------------------------------------
    for (const [kind, make] of [
      ["settle", (a: Any, to: Any) => need(values?.createSettle, "createSettle")(a, { omega: 25 })],
      ["spring", (a: Any, to: Any) => need(values?.createSpring, "createSpring")(a, {})],
      ["tween", (a: Any, to: Any) => need(values?.createTween, "createTween")(a, { duration: 300 })],
    ] as const)
      for (const [from, to] of [[0, 100], [200, -50], [rect(0, 0, 100, 50), rect(300, 80, 160, 90)]] as const)
        out.attempt("animator", `${kind} ${JSON.stringify(from)} -> ${JSON.stringify(to)}`, () => {
          const a = make(from, to);
          a.setTarget(to);
          const samples: Any[] = [];
          for (let i = 0; i < 60; i++) {
            a.step(1 / 60);
            if (i % 3 === 0) samples.push({ value: a.value, velocity: a.velocity, settled: a.settled });
          }
          return samples;
        });

    const written = out.write(outFile("motion"));
    console.log(`motion: ${written} outputs`);
  });
});
