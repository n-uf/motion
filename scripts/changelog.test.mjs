// The changelog fragments' own test, part of `pnpm check`: names and bodies are checked, a join keeps the existing
// Unreleased body first and the fragments in name order, refuses an existing version, and leaves no empty Unreleased.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { apply, checkAll, joinInto, plan, problem, validName } from "./changelog.mjs";

const HEAD = "# @n-uf/x\n\nVersions are calendar versions.\n\n";

test("a fragment's name is a real date, then a lower-case slug", () => {
  assert.equal(validName("2026-11-21-lengths.md"), true);
  assert.equal(validName("2026-11-21-a-b-2.md"), true);
  assert.equal(validName("2026-13-01-x.md"), false);
  assert.equal(validName("2026-02-30-x.md"), false);
  assert.equal(validName("lengths.md"), false);
  assert.equal(validName("2026-11-21-Lengths.md"), false);
  assert.equal(validName("2026-11-21-x.txt"), false);
  assert.equal(validName("2026-11-21-.md"), false);
});

test("a fragment starts with a bullet or a ### line, and is not empty", () => {
  assert.equal(problem("2026-11-21-a.md", "- one\n"), null);
  assert.equal(problem("2026-11-21-a.md", "\n### Group\n\n- one\n"), null);
  assert.match(problem("2026-11-21-a.md", "  \n\n") ?? "", /empty/);
  assert.match(problem("2026-11-21-a.md", "Some prose.\n- one") ?? "", /bullet/);
  assert.match(problem("2026-11-21-a.md", "- one\n## 1.0.0\n") ?? "", /## /);
  assert.match(problem("a.md", "- one") ?? "", /name/);
});

test("the join puts the old Unreleased body first, then the fragments in order, under the version", () => {
  const text = `${HEAD}## Unreleased\n\n- old one\n- old two\n\n## 26.11.1\n\n- history\n`;
  const next = joinInto(text, [{ text: "- a\n" }, { text: "### Group\n\n- b\n" }, { text: "- c\n" }], "26.11.2");
  assert.equal(next, `${HEAD}## 26.11.2\n\n- old one\n- old two\n- a\n- c\n\n### Group\n\n- b\n\n## 26.11.1\n\n- history\n`);
  assert.doesNotMatch(next, /Unreleased/);
});

test("a bullet fragment after a group lands in the ungrouped bullets, above the groups", () => {
  const text = `${HEAD}## Unreleased\n\n- loose\n\n### Docs only\n\n- doc\n\n## 26.11.1\n\n- history\n`;
  const next = joinInto(text, [{ text: "- later bullet\n" }], "26.11.2");
  assert.equal(next, `${HEAD}## 26.11.2\n\n- loose\n- later bullet\n\n### Docs only\n\n- doc\n\n## 26.11.1\n\n- history\n`);
});

test("a grouped fragment after a group is its own group, after it; groups keep their order", () => {
  const text = `${HEAD}## Unreleased\n\n### First\n\n- one\n\n## 26.11.1\n\n- history\n`;
  const next = joinInto(text, [{ text: "### Second\n\n- two\n" }, { text: "- bullet\n" }, { text: "### Third\n\n- three\n\n### Fourth\n\n- four\n" }], "26.11.2");
  assert.equal(next, `${HEAD}## 26.11.2\n\n- bullet\n\n### First\n\n- one\n\n### Second\n\n- two\n\n### Third\n\n- three\n\n### Fourth\n\n- four\n\n## 26.11.1\n\n- history\n`);
});

test("with no Unreleased heading the new section goes above the first release", () => {
  const next = joinInto(`${HEAD}## 26.11.1\n\n- history\n`, [{ text: "- a" }], "26.11.2");
  assert.equal(next, `${HEAD}## 26.11.2\n\n- a\n\n## 26.11.1\n\n- history\n`);
});

test("an Unreleased with a body and no fragments is renamed; an empty one with none gives nothing", () => {
  assert.equal(joinInto(`${HEAD}## Unreleased\n\n- old\n\n## 26.11.1\n\n- h\n`, [], "26.11.2"), `${HEAD}## 26.11.2\n\n- old\n\n## 26.11.1\n\n- h\n`);
  assert.equal(joinInto(`${HEAD}## Unreleased\n\n## 26.11.1\n\n- h\n`, [], "26.11.2"), null);
  assert.equal(joinInto(`${HEAD}## 26.11.1\n\n- h\n`, [], "26.11.2"), null);
});

test("an existing version is refused", () => {
  assert.throws(() => joinInto(`${HEAD}## Unreleased\n\n- a\n\n## 26.11.2\n\n- h\n`, [{ text: "- b" }], "26.11.2"), /already exists/);
});

function repo() {
  const root = mkdtempSync(join(tmpdir(), "changelog-"));
  for (const pkg of ["one", "two"]) {
    mkdirSync(join(root, "packages", pkg), { recursive: true });
    writeFileSync(join(root, "packages", pkg, "package.json"), `{ "name": "${pkg}", "version": "26.11.2" }\n`);
    writeFileSync(join(root, "packages", pkg, "CHANGELOG.md"), `${HEAD}## Unreleased\n\n- old ${pkg}\n\n## 26.11.1\n\n- history\n`);
  }
  mkdirSync(join(root, "packages", "one", "changes"));
  writeFileSync(join(root, "packages", "one", "changes", "2026-11-20-second.md"), "- second\n");
  writeFileSync(join(root, "packages", "one", "changes", "2026-11-19-first.md"), "- first\n");
  return root;
}

test("join on a checkout: per package, in name order, fragments deleted, nothing for a package without entries", () => {
  const root = repo();
  try {
    assert.deepEqual(checkAll(root), []);
    apply(root, "26.11.2");
    const one = readFileSync(join(root, "packages", "one", "CHANGELOG.md"), "utf8");
    assert.equal(one, `${HEAD}## 26.11.2\n\n- old one\n- first\n- second\n\n## 26.11.1\n\n- history\n`);
    assert.equal(existsSync(join(root, "packages", "one", "changes")), false);
    // The other package had only its Unreleased body: it is renamed.
    assert.match(readFileSync(join(root, "packages", "two", "CHANGELOG.md"), "utf8"), /## 26\.11\.2\n\n- old two/);
    // A second join of the same version is refused, and changes nothing.
    assert.throws(() => apply(root, "26.11.2"), /already exists/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a bad fragment or a refusing package stops the whole join before anything is written", () => {
  const root = repo();
  try {
    writeFileSync(join(root, "packages", "one", "changes", "2026-11-21-bad.md"), "prose\n");
    assert.deepEqual(checkAll(root), ["packages/one/changes/2026-11-21-bad.md: must start with a bullet (`- `) or a `### ` heading line"]);
    assert.throws(() => plan(root, "26.11.2"), /malformed/);
    rmSync(join(root, "packages", "one", "changes", "2026-11-21-bad.md"));
    writeFileSync(join(root, "packages", "two", "CHANGELOG.md"), `${HEAD}## 26.11.2\n\n- already\n`);
    assert.throws(() => apply(root, "26.11.2"), /packages\/two\/CHANGELOG.md: ## 26.11.2 already exists/);
    assert.equal(existsSync(join(root, "packages", "one", "changes", "2026-11-19-first.md")), true);
    assert.match(readFileSync(join(root, "packages", "one", "CHANGELOG.md"), "utf8"), /## Unreleased/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a join refuses a version that is not every package.json's, and writes nothing", () => {
  const root = repo();
  try {
    assert.throws(() => apply(root, "26.11.9"), /cannot join 26\.11\.9: packages\/one\/package\.json is 26\.11\.2, packages\/two\/package\.json is 26\.11\.2/);
    writeFileSync(join(root, "packages", "two", "package.json"), '{ "version": "26.11.3" }\n');
    assert.throws(() => apply(root, "26.11.2"), /packages\/two\/package\.json is 26\.11\.3/);
    assert.equal(existsSync(join(root, "packages", "one", "changes", "2026-11-19-first.md")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a version must be YY.M.R", () => {
  const root = repo();
  try {
    assert.throws(() => plan(root, "v1"), /YY\.M\.R/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
