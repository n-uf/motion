// node --test scripts/old-vs-new.test.mjs: the comparison and the expect matching behind `pnpm old-vs-new`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diffRecordings, diffValues, globToRegExp, matchExpectations } from "./old-vs-new-diff.mjs";

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
      { kind: "resize", reason: "r2" },
      { kind: "never", reason: "r3" },
    ],
    changes,
  );
  assert.deepEqual(m.uncovered.map((c) => c.id), ["one move"]);
  assert.deepEqual(m.unmatched.map((e) => e.reason), ["r3"]);
  assert.deepEqual(m.covered.map((e) => [e.reason, e.count]), [["r1", 1], ["r2", 1]]);
});
