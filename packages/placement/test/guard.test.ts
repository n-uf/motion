/**
 * The library touches no host and stays apart from motion: no DOM, no timers, no global clock, no framework, and no
 * import of @n-uf/motion (the two compose through the shared target shape, not through each other).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
}

/** Drop comments so prose about the DOM doesn't count. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** And string literals, so a construction's description that says "document" doesn't either. */
const bare = (text: string): string => code(text).replace(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1/g, '""');

const HOST = /\b(window|document|globalThis|self|requestAnimationFrame|cancelAnimationFrame|performance|setTimeout|clearTimeout|setInterval|clearInterval|queueMicrotask|matchMedia|console|process)\b|Date\.now|Math\.random/;
const IMPORTS = /\bfrom\s+["'](react|react-dom|vue|svelte|solid-js|@n-uf\/motion[^"']*)["']/;

describe("the library stays pure", () => {
  const sources = [join(root, "index.ts"), ...files(join(root, "src"))];

  for (const path of sources) {
    it(relative(root, path), () => {
      const text = readFileSync(path, "utf8");
      expect(bare(text).match(HOST)?.[0] ?? null).toBeNull();
      expect(code(text).match(IMPORTS)?.[0] ?? null).toBeNull();
    });
  }

  it("scans every entry, ./panels included", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { exports: Record<string, { default: string }> };
    expect(Object.keys(pkg.exports)).toContain("./panels");
    for (const e of Object.values(pkg.exports)) expect(sources).toContain(join(root, e.default));
    // The entry's own files, each scanned above.
    expect(files(join(root, "src", "panels")).length).toBeGreaterThanOrEqual(4);
  });

  it("has no dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies?: object; peerDependencies?: object };
    expect([pkg.dependencies, pkg.peerDependencies]).toEqual([undefined, undefined]);
  });
});
