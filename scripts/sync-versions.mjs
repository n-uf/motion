// @n-uf/motion, @n-uf/placement and @n-uf/docking share one version: after motion's calendar bump, give the other two
// the same one. Run by the root `version:bump`; release.yml's `verify` fails when they differ.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("packages/motion/package.json", "utf8"));
for (const path of ["packages/placement/package.json", "packages/docking/package.json"]) {
  const raw = readFileSync(path, "utf8");
  const next = raw.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`);
  if (next === raw && JSON.parse(raw).version !== version) {
    console.error(`Could not set ${path} to ${version}.`);
    process.exit(1);
  }
  writeFileSync(path, next);
}
console.log(`@n-uf/motion, @n-uf/placement and @n-uf/docking: ${version}`);
