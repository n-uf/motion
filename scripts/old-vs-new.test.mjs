// node --test scripts/old-vs-new.test.mjs: the comparison and the expect matching behind `pnpm old-vs-new`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diffRecordings, diffValues, expectationProblems, failedCases, globToRegExp, matchExpectations } from "./old-vs-new-diff.mjs";

test("numbers within the rounding of the recorder are the same", () => {
  assert.deepEqual(diffValues({ x: 1 }, { x: 1.000001 }), []);
  assert.deepEqual(diffValues({ x: 1 }, { x: 1.01 }), [{ path: ".x", old: 1, new: 1.01 }]);
});

test("arrays of {id} match by id; a reorder shows once", () => {
  const a = [{ id: "a", v: 1 }, { id: "b", v: 2 }];
  assert.deepEqual(diffValues(a, [{ id: "b", v: 2 }, { id: "a", v: 1 }]), [{ path: "", old: "order", new: "order changed" }]);
  assert.deepEqual(diffValues(a, [{ id: "a", v: 1 }, { id: "b", v: 3 }]), [{ path: "[b].v", old: 2, new: 3 }]);
  assert.deepEqual(diffValues(a, [{ id: "a", v: 1 }]).map((d) => d.path), ["[b]"]);
});

test("other arrays match by position and report a length change", () => {
  assert.deepEqual(diffValues([1, 2], [1, 2, 3]), [{ path: ".length", old: 2, new: 3 }]);
});

test("a case on one side only is changed", () => {
  const r = (ids) => ({ package: "p", kinds: { k: ids.map((id) => ({ id, value: 1 })) } });
  const { kinds } = diffRecordings(r(["a", "b"]), r(["b", "c"]));
  assert.equal(kinds.k.same, 1);
  assert.deepEqual(kinds.k.changed.map((c) => c.id).sort(), ["a", "c"]);
});

test("globs, with alternatives for package and kind", () => {
  assert.ok(globToRegExp("a*c?").test("abbbcd"));
  assert.ok(!globToRegExp("a*c?").test("abbbc"));
  const changes = [
    { package: "docking", kind: "solve", id: "random 1 +asks" },
    { package: "docking", kind: "resize", id: "w | x" },
    { package: "motion", kind: "layout-frames", id: "one move" },
  ];
  const m = matchExpectations(
    [
      { package: "docking", kind: "solve|fit", case: "*+asks*", reason: "r1" },
      { package: "docking", kind: "resize", case: "*", all: true, reason: "r2" },
      { package: "docking", kind: "never", case: "x*", reason: "r3" },
    ],
    changes,
    [{ package: "docking", kind: "resize", cases: 165 }, { package: "placement", kind: "resize", cases: 168 }, { package: "docking", kind: "solve", cases: 9 }],
  );
  assert.deepEqual(m.uncovered.map((c) => c.id), ["one move"]);
  assert.deepEqual(m.unmatched.map((e) => e.reason), ["r3"]);
  assert.deepEqual(m.covered.map((e) => [e.reason, e.count, e.of, e.inKind]), [["r1", 1, 1, [9]], ["r2", 1, 1, [165]]]);
});

const entry = (more) => ({ package: "p", kind: "k", case: "a*", reason: "why", ...more });
const problems = (...entries) => expectationProblems(entries).length;

test("an expect entry needs a reason, a package, a kind and a case", () => {
  assert.equal(problems(entry({})), 0);
  assert.equal(problems(entry({ reason: undefined })), 1);
  assert.equal(problems(entry({ reason: "  " })), 1);
  assert.equal(problems(entry({ package: undefined })), 1);
  assert.equal(problems(entry({ kind: undefined })), 1);
  assert.equal(problems(entry({ case: undefined })), 1);
});

test("a case glob of only * and ? covers everything: refused unless all: true", () => {
  for (const glob of ["*", "**", "?*", "*?", "??", "?"]) assert.equal(problems(entry({ case: glob })), 1, glob);
  assert.equal(problems(entry({ case: "*", all: true })), 0);
  assert.equal(problems(entry({ case: "?*", all: true })), 0);
  assert.equal(problems(entry({ case: "a*" })), 0);
  assert.throws(() => matchExpectations([entry({ case: "?*" })], []), /not usable/);
});

test("all: true needs one named package and kind, so it can't excuse more than one kind", () => {
  for (const more of [{ package: "*" }, { kind: "*" }, { package: "a|b" }, { kind: "fit|gaps" }, { package: "d?cking" }, { kind: "res*" }]) assert.equal(problems(entry({ case: "*", all: true, ...more })), 1, JSON.stringify(more));
  assert.equal(problems(entry({ case: "*", all: true, package: "docking", kind: "resize" })), 0);
  // (Without all, wildcards in package and kind are fine; the case glob is what is guarded.)
  assert.equal(problems(entry({ package: "*", kind: "fit|gaps" })), 0);
});

test("absent and throwing cases are counted per kind", () => {
  const r = { package: "p", kinds: { a: [{ id: "1", value: { absent: "x" } }, { id: "2", value: { threw: "y" } }, { id: "3", value: { threw: "z", other: 1 } }], b: [{ id: "1", value: 1 }] } };
  assert.deepEqual(failedCases(r), { a: { absent: 1, threw: 1 } });
});
