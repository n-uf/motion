/**
 * `scripts/calendar-version-bump.mjs`: the `YY.M.R` computation behind
 * `pnpm release:next-version` / `pnpm version:bump`. `M` must be the
 * calendar month of the release date, `R` continues within a month and
 * resets in a new one. Ported from hypr-tiling's test of the same script;
 * vusyk has no burned versions, so its October 2026 starts at `.0`.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/calendar-version-bump.mjs", import.meta.url));

function nextVersion(today: string, current: string): string {
  return execFileSync(process.execPath, [script, "--dry-run"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CALENDAR_VERSION_TODAY: today,
      CALENDAR_VERSION_CURRENT: current,
    },
  }).trim();
}

describe("calendar-version-bump — YY.M.R from the release date", () => {
  it("continues R within the same calendar month", () => {
    expect(nextVersion("2026-09-30", "26.9.3")).toBe("26.9.4");
  });

  it("uses the calendar month, never last-release-month + 1", () => {
    expect(nextVersion("2026-09-22", "26.7.2")).toBe("26.9.0");
  });

  it("burns nothing: the first October 2026 release is 26.10.0", () => {
    expect(nextVersion("2026-10-05", "26.9.3")).toBe("26.10.0");
  });

  it("resets R to 0 in a new month", () => {
    expect(nextVersion("2026-11-02", "26.10.1")).toBe("26.11.0");
  });

  it("starts from 0.0.0: the first release is the month's .0", () => {
    expect(nextVersion("2026-11-07", "0.0.0")).toBe("26.11.0");
  });

  it("rolls the year over", () => {
    expect(nextVersion("2027-01-03", "26.12.4")).toBe("27.1.0");
  });
});
