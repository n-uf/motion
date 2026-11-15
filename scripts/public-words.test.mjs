// The public-words check's own test, part of `pnpm check`: a line holding a listed word fails, a clean one passes.
// The listed words here are made up for the test; the real list is hashes only.
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "./public-words.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const lower = new Set([sha("quokkapress"), sha("tin-owl-co")]);
const exact = new Set([sha("Marten")]);

test("a line holding a listed word fails", () => {
  assert.equal(scan("// See the QuokkaPress notes.", lower, exact), "QuokkaPress");
});

test("a hyphen- or space-joined name of up to three words matches", () => {
  assert.equal(scan("const host = 'tin-owl-co';", lower, exact), "tin-owl-co");
  assert.notEqual(scan("made at Tin Owl Co", lower, exact), null);
});

test("a name listed as written matches only in that case", () => {
  assert.equal(scan("the Marten view", lower, exact), "Marten");
  assert.equal(scan("a marten in the hedge", lower, exact), null);
});

test("process words fail as plain patterns", () => {
  assert.equal(scan("as Revision 3 says", lower, exact), "Revision 3");
});

test("a clean line passes, and so do the allowed phrases", () => {
  assert.equal(scan("the dock lays its edges out, outer first", lower, exact), null);
  assert.equal(scan('scope: "keyword.operator"', lower, exact), null);
});
