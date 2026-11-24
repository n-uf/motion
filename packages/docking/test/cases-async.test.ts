/**
 * `runCaseAsync` / `runCasesAsync`: the same rows, the same order of host calls and the same results as `runCase`, on a
 * sync host, on a host whose every call resolves after a timer, and with a `perform` that rejects.
 */
import { describe, expect, it } from "vitest";
import { CASES, createReferenceHost, runCase, runCaseAsync, runCases, runCasesAsync, type AsyncCaseHost, type CaseHost, type Gesture } from "../src/testing";

/** The host's calls, each resolved after a 0 ms timer, and the order they came in. */
function later(host: CaseHost, log: string[]): AsyncCaseHost {
  const wait = <T>(name: string, f: () => T): Promise<T> =>
    new Promise((resolve, reject) =>
      setTimeout(() => {
        log.push(name);
        try {
          resolve(f());
        } catch (e) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- passes on whatever the host call threw, unchanged
          reject(e);
        }
      }, 0),
    );
  return {
    load: (state, settings) => wait("load", () => host.load(state, settings)),
    perform: (gesture) => wait(`perform ${gesture.type}`, () => host.perform(gesture)),
    layout: () => wait("layout", () => host.layout()),
    ...(host.stops ? { stops: (item: string) => wait("stops", () => host.stops!(item)) } : {}),
    ...(host.stored ? { stored: () => wait("stored", () => host.stored!()) } : {}),
  };
}
/** The same host, logging its calls synchronously. */
function logged(host: CaseHost, log: string[]): CaseHost {
  return {
    load: (state, settings) => (log.push("load"), host.load(state, settings)),
    perform: (gesture) => (log.push(`perform ${gesture.type}`), host.perform(gesture)),
    layout: () => (log.push("layout"), host.layout()),
    ...(host.stops ? { stops: (item: string) => (log.push("stops"), host.stops!(item)) } : {}),
    ...(host.stored ? { stored: () => (log.push("stored"), host.stored!()) } : {}),
  };
}

describe("the async runner", () => {
  it("gives every row the result runCase gives, on the in-memory host (a sync CaseHost)", async () => {
    const sync = runCases(CASES, () => createReferenceHost());
    const async = await runCasesAsync(CASES, () => createReferenceHost());
    expect(async).toEqual(sync);
    for (const row of CASES.slice(0, 5)) expect(await runCaseAsync(row, createReferenceHost())).toEqual(runCase(row, createReferenceHost()));
  });

  it("gives the same results, and makes the same calls in the same order, when every call resolves after a timer", async () => {
    const heard: string[] = [];
    for (const row of CASES) {
      const a: string[] = [];
      const b: string[] = [];
      const want = runCase(row, logged(createReferenceHost(), a));
      const got = await runCaseAsync(row, later(createReferenceHost(), b));
      expect(got, row.id).toEqual(want);
      expect(b, row.id).toEqual(a);
    }
    // runCasesAsync: one row after another, each heard as it is known, with an async makeHost.
    const rows = CASES.slice(0, 3);
    // eslint-disable-next-line @typescript-eslint/require-await -- the async makeHost is what this line tests; it has nothing to await
    const out = await runCasesAsync(rows, async () => later(createReferenceHost(), []), { onResult: (id) => heard.push(id) });
    expect(heard).toEqual(rows.map((r) => r.id));
    expect(out.map((x) => x.result)).toEqual(rows.map((r) => runCase(r, createReferenceHost())));
  });

  it("a rejected perform is a failed result with its error, as a thrown one is in runCase, never an unhandled rejection", async () => {
    const row = CASES.find((r) => r.gestures.length > 1)!;
    const failing = (g: Gesture): never => {
      throw new Error(`no ${g.type} here`);
    };
    const syncHost: CaseHost = { ...createReferenceHost(), perform: failing };
    const base = createReferenceHost();
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

  it("a failing root or stops rejects runCaseAsync, as it throws from runCase; layout and stored failures are results", async () => {
    const domRow = CASES.find((r) => (r.expectDom ?? []).length > 0)!;
    const base = createReferenceHost();
    const badRoot: CaseHost = { ...base, root: () => { throw new Error("no page"); } };
    expect(() => runCase(domRow, badRoot)).toThrow("no page");
    await expect(runCaseAsync(domRow, { load: (s, o) => base.load(s, o), perform: (g) => base.perform(g), layout: () => base.layout(), root: () => Promise.reject(new Error("no page")) })).rejects.toThrow("no page");
    const stopsRow = CASES.find((r) => r.expectStops)!;
    const s2 = createReferenceHost();
    await expect(runCaseAsync(stopsRow, { load: (s, o) => s2.load(s, o), perform: (g) => s2.perform(g), layout: () => s2.layout(), stops: () => Promise.reject(new Error("no stops")) })).rejects.toThrow("no stops");
    // A failing layout is a failed result, not a rejection.
    const s3 = createReferenceHost();
    const r = await runCaseAsync(CASES[0]!, { load: (s, o) => s3.load(s, o), perform: (g) => s3.perform(g), layout: () => Promise.reject(new Error("no layout")) });
    expect(r.ok).toBe(false);
    expect(r.failures.join("\n")).toContain("no layout");
  });
});
