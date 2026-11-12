// The home page's code examples (src/snippets/*.ts) are typechecked with the site, so the page never shows code that
// no longer compiles. A snippet may stay out of the typecheck (tsconfig.json "exclude") only while the library lacks an
// entry it imports; the page hides that tab meanwhile (components/CodeTabs.astro). Once the entry exists, this test
// asks for the snippet back in the typecheck. (run: npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsconfig = JSON.parse(readFileSync(join(web, "tsconfig.json"), "utf8"));
const exportsOf = JSON.parse(readFileSync(join(web, "../../packages/motion/package.json"), "utf8")).exports;
const snippets = readdirSync(join(web, "src/snippets")).filter((f) => f.endsWith(".ts"));
const excluded = new Set(tsconfig.exclude ?? []);

/** The package entries a snippet imports: "." for the root, "./layout" for @n-uf/motion/layout. */
const entriesOf = (file) =>
  [...readFileSync(join(web, "src/snippets", file), "utf8").matchAll(/from "@n-uf\/motion(\/[\w-]+)?"/g)].map((m) => (m[1] ? `.${m[1]}` : "."));

test("there are snippets, and the typecheck includes their folder", () => {
  assert.ok(snippets.length >= 1);
  assert.ok(tsconfig.include.includes("src/snippets/*.ts"));
});

for (const file of snippets) {
  const entries = entriesOf(file);
  const missing = entries.filter((e) => !(e in exportsOf));
  test(`snippet ${file}: typechecked once the library exports ${entries.join(", ")}`, () => {
    assert.ok(entries.length >= 1, "a snippet imports the library");
    if (missing.length === 0) {
      assert.ok(!excluded.has(`src/snippets/${file}`), `remove "src/snippets/${file}" from tsconfig.json "exclude": the library exports ${entries.join(", ")} now`);
    } else {
      assert.ok(excluded.has(`src/snippets/${file}`), `${file} imports ${missing.join(", ")}, which the library doesn't export yet: exclude it`);
    }
  });
}
