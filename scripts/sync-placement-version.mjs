// @n-uf/motion and @n-uf/placement share one version: after motion's calendar bump, give placement the same one.
// Run by the root `version:bump`; release.yml's `verify` fails when the two differ.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("packages/motion/package.json", "utf8"));
const path = "packages/placement/package.json";
const raw = readFileSync(path, "utf8");
const next = raw.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`);
if (next === raw && JSON.parse(raw).version !== version) {
  console.error(`Could not set ${path} to ${version}.`);
  process.exit(1);
}
writeFileSync(path, next);
console.log(`@n-uf/motion and @n-uf/placement: ${version}`);
