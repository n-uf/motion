// Calendar version bump for `@n-uf/vusyk` (`YY.M.R`, the same policy as
// `@n-uf/hypr-tiling`; see the README's "Versions" section). `YY.M` is derived from TODAY's date — `M` is
// the calendar month of the release, never "the last month + 1". `R` continues
// within the same year/month and resets to `0` when the month changes, then
// skips any BURNED value.
//
// Burned versions: npm permanently reserves an unpublished version number, so
// a mis-numbered publish that was `npm unpublish`ed can never be reused. The
// unpublished version also vanishes from `npm view … versions`, so nothing
// upstream would stop this script from proposing it again. Record every burned
// number here; the month's `R` counter starts after it.
//
// Usage: `--dry-run` prints the next version; `--apply` writes it to
// package.json via `npm version … --no-git-tag-version`. Test overrides:
// `CALENDAR_VERSION_TODAY=YYYY-MM-DD`, `CALENDAR_VERSION_CURRENT=YY.M.R`.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Version numbers that exist on a registry's reservation list but not in its
 * published list — never propose them again. None for vusyk yet. (It starts
 * at 0.0.0, which sorts below every `YY.M.R`; the first `--apply` gives the
 * month's `.0`.)
 */
const BURNED_VERSIONS = new Set([]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(scriptDir, "..", "package.json");
const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonRaw);

const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const currentVersion = String(
  process.env.CALENDAR_VERSION_CURRENT ?? packageJson.version ?? "",
);
const versionMatch = currentVersion.match(versionPattern);

if (!versionMatch) {
  console.error(
    `Current version \"${currentVersion}\" is not a valid three-segment numeric semver.`
  );
  process.exit(1);
}

const currentYear = Number(versionMatch[1]);
const currentMonth = Number(versionMatch[2]);
const currentPatch = Number(versionMatch[3]);

const todayOverride = process.env.CALENDAR_VERSION_TODAY;
const now = todayOverride ? new Date(`${todayOverride}T12:00:00Z`) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`CALENDAR_VERSION_TODAY \"${todayOverride}\" is not a YYYY-MM-DD date.`);
  process.exit(1);
}
const targetYear = (todayOverride ? now.getUTCFullYear() : now.getFullYear()) % 100;
const targetMonth = (todayOverride ? now.getUTCMonth() : now.getMonth()) + 1;

let nextPatch =
  currentYear === targetYear && currentMonth === targetMonth
    ? currentPatch + 1
    : 0;
while (BURNED_VERSIONS.has(`${targetYear}.${targetMonth}.${nextPatch}`)) {
  nextPatch += 1;
}
const nextVersion = `${targetYear}.${targetMonth}.${nextPatch}`;

if (process.argv.includes("--dry-run")) {
  console.log(nextVersion);
  process.exit(0);
}

if (!process.argv.includes("--apply")) {
  console.error("Expected --apply or --dry-run");
  process.exit(1);
}

execSync(`npm version ${nextVersion} --no-git-tag-version`, {
  stdio: "inherit",
});
