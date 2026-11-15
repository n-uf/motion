/**
 * `runCaseAsync` / `runCasesAsync`: the same rows, the same order of host calls and the same results as `runCase`, on a
 * sync host, on a host whose every call resolves after a timer, and with a `perform` that rejects.
 */
import { describe, expect, it } from "vitest";
import { CASES, createSceneHost, runCase, runCaseAsync, runCases, runCasesAsync, type AsyncCaseHost, type CaseHost, type Gesture } from "../src/scene/cases";

/** The host's calls, each resolved after a 0 ms timer, and the order they came in. */
function later(host: CaseHost, log: string[]): AsyncCaseHost {
  const wait = <T>(name: string, f: () => T): Promise<T> =>
    new Promise((resolve, reject) =>
      setTimeout(() => {
        log.push(name);
        try {
          resolve(f());
        } catch (e) {
          reject(e);
        }
      }, 0),
    );
  return {
    load: (scene, settings) => wait("load", () => host.load(scene, settings)),
    perform: (gesture) => wait(`perform ${gesture.type}`, () => host.perform(gesture)),
    layout: () => wait("layout", () => host.layout()),
    ...(host.stops ? { stops: (item: string) => wait("stops", () => host.stops!(item)) } : {}),
    ...(host.stored ? { stored: () => wait("stored", () => host.stored!()) } : {}),
  };
}
/** The same host, logging its calls synchronously. */
function logged(host: CaseHost, log: string[]): CaseHost {
  return {
    load: (scene, settings) => (log.push("load"), host.load(scene, settings)),
    perform: (gesture) => (log.push(`perform ${gesture.type}`), host.perform(gesture)),
    layout: () => (log.push("layout"), host.layout()),
    ...(host.stops ? { stops: (item: string) => (log.push("stops"), host.stops!(item)) } : {}),
    ...(host.stored ? { stored: () => (log.push("stored"), host.stored!()) } : {}),
  };
}

describe("the async runner", () => {
  it("gives every row the result runCase gives, on the in-memory host (a sync CaseHost)", async () => {
    const sync = runCases(CASES, () => createSceneHost());
    const async = await runCasesAsync(CASES, () => createSceneHost());
    expect(async).toEqual(sync);
    for (const row of CASES.slice(0, 5)) expect(await runCaseAsync(row, createSceneHost())).toEqual(runCase(row, createSceneHost()));
  });

  it("gives the same results, and makes the same calls in the same order, when every call resolves after a timer", async () => {
    const heard: string[] = [];
    for (const row of CASES) {
      const a: string[] = [];
      const b: string[] = [];
      const want = runCase(row, logged(createSceneHost(), a));
      const got = await runCaseAsync(row, later(createSceneHost(), b));
      expect(got, row.id).toEqual(want);
      expect(b, row.id).toEqual(a);
    }
    // runCasesAsync: one row after another, each heard as it is known, with an async makeHost.
    const rows = CASES.slice(0, 3);
    const out = await runCasesAsync(rows, async () => later(createSceneHost(), []), { onResult: (id) => heard.push(id) });
    expect(heard).toEqual(rows.map((r) => r.id));
    expect(out.map((x) => x.result)).toEqual(rows.map((r) => runCase(r, createSceneHost())));
  });

  it("a rejected perform is a failed result with its error, as a thrown one is in runCase, never an unhandled rejection", async () => {
    const row = CASES.find((r) => r.gestures.length > 1)!;
    const failing = (g: Gesture): never => {
      throw new Error(`no ${g.type} here`);
    };
    const syncHost: CaseHost = { ...createSceneHost(), perform: failing };
    const base = createSceneHost();
    const asyncHost: AsyncCaseHost = {
      load: (s, o) => base.load(s, o),
      layout: () => base.layout(),
      perform: (g) => Promise.reject(new Error(`no ${g.type} here`)),
    };
    const want = runCase(row, syncHost);
    expect(want.ok).toBe(false);
    expect(want.failures.join("\n")).toContain(`no ${row.gestures[0]!.type} here`);
    const got = await runCaseAsync(row, asyncHost);
    expect(got).toEqual(want);
  });
});
