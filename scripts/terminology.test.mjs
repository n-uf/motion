// The terminology check's own test, part of `pnpm check`: a banned synonym fails, a glossary word passes, the allow
// list is narrow, and only a changelog's Unreleased section is read.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BANNED, isCopy, linesOf, scan, unreleased } from "./terminology.mjs";

test("a banned synonym fails and says what to write", () => {
  assert.equal(scan("Drag the drag handle.")?.use, "grip");
  assert.match(scan("centred in the centre zone")?.use ?? "", /center/);
  assert.match(scan("the colour of the dots")?.use ?? "", /color/);
  assert.match(scan("a neighbouring column")?.use ?? "", /neighbor/);
  assert.match(scan("the gesture recogniser")?.use ?? "", /recognizer/);
  assert.match(scan("Lock layout")?.use ?? "", /freeze/);
});

test('"own place" is fine as "its own place" and banned bare', () => {
  assert.equal(scan("Its own place is home."), null);
  assert.equal(scan("back in its own place"), null);
  assert.equal(scan("a group's own place is home"), null);
  assert.match(scan("the own place of a group")?.use ?? "", /home/);
  assert.match(scan("Back to own place")?.use ?? "", /home/);
});

test("glossary words and US spelling pass", () => {
  assert.equal(scan("A grip moves the group; frozen, the grips hide. Center zone, neighbor, behavior, color."), null);
  assert.equal(scan("least recently used first"), null);
});

test("the allow list covers the exported `centre` function only, not prose", () => {
  assert.equal(scan("const c = centre(r);", "packages/placement/src/geometry.ts"), null);
  assert.equal(scan("import { centre, clamp } from './geometry';"), null);
  assert.notEqual(scan("A toolbar sits at the bar's true centre."), null);
});

test("only a changelog's Unreleased section is read", () => {
  const text = ["# x", "## Unreleased", "- the colour", "## 26.11.1", "- the colour"].join("\n");
  assert.deepEqual(unreleased(text), [[2, "## Unreleased"], [3, "- the colour"]]);
  assert.equal(linesOf("packages/motion/CHANGELOG.md", text).length, 2);
  assert.equal(linesOf("packages/motion/README.md", text).length, 5);
});

test("copy files: READMEs and source, not tests, styles or other READMEs", () => {
  assert.equal(isCopy("packages/motion/README.md"), true);
  assert.equal(isCopy("apps/web/src/pages/index.astro"), true);
  assert.equal(isCopy("apps/lab/src/pages/overview.html"), true);
  assert.equal(isCopy("packages/placement/src/toolbar/index.ts"), true);
  assert.equal(isCopy("packages/placement/test/toolbar.test.ts"), false);
  assert.equal(isCopy("packages/motion/src/gestures/__tests__/recognizer.test.ts"), false);
  assert.equal(isCopy("apps/web/src/styles/chrome.css"), false);
  assert.equal(isCopy("apps/web/src/content/blog/x.md"), true);
  assert.ok(BANNED.length >= 9);
});
