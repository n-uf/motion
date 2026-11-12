// The home page's code examples (src/snippets/*.ts) are typechecked with the site, so the page never shows code that
// no longer compiles. A snippet may stay out of the typecheck (tsconfig.json "exclude") only while the library lacks an
// entry it imports; the page hides that tab meanwhile (components/CodeTabs.astro). Once the entry exists, this test
// asks for the snippet back in the typecheck. (run: npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsconfig = JSON.parse(readFileSync(join(web, "tsconfig.json"), "utf8"));
/** Each package of the pair's exports, from the workspace ({} while a package isn't in it yet). */
const pkgExports = (name) => {
  const f = join(web, `../../packages/${name}/package.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).exports : {};
};
const exportsOf = { motion: pkgExports("motion"), placement: pkgExports("placement") };
const snippets = readdirSync(join(web, "src/snippets")).filter((f) => f.endsWith(".ts"));
const excluded = new Set(tsconfig.exclude ?? []);

/** The package entries a snippet imports: "motion ." for the root, "placement ./toolbar" for @n-uf/placement/toolbar. */
const entriesOf = (file) =>
  [...readFileSync(join(web, "src/snippets", file), "utf8").matchAll(/from "@n-uf\/(motion|placement)(\/[\w-]+)?"/g)].map((m) => `${m[1]} ${m[2] ? `.${m[2]}` : "."}`);
const has = (entry) => { const [pkg, e] = entry.split(" "); return e in exportsOf[pkg]; };

test("there are snippets, and the typecheck includes their folder", () => {
  assert.ok(snippets.length >= 1);
  assert.ok(tsconfig.include.includes("src/snippets/*.ts"));
});

for (const file of snippets) {
  const entries = entriesOf(file);
  const missing = entries.filter((e) => !has(e));
  test(`snippet ${file}: typechecked once the packages export ${entries.join(", ")}`, () => {
    assert.ok(entries.length >= 1, "a snippet imports the library");
    if (missing.length === 0) {
      assert.ok(!excluded.has(`src/snippets/${file}`), `remove "src/snippets/${file}" from tsconfig.json "exclude": the library exports ${entries.join(", ")} now`);
    } else {
      assert.ok(excluded.has(`src/snippets/${file}`), `${file} imports ${missing.join(", ")}, which the library doesn't export yet: exclude it`);
    }
  });
}
