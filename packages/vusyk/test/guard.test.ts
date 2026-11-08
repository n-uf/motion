/**
 * The core entry touches no host: no DOM, no timers, no global clock. The
 * typecheck already fails on DOM and Node globals (lib ES2022, no types);
 * this catches what that misses (globalThis, Date.now, console) and keeps
 * framework imports out. Only src/browser/ may reach the host.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
}

/** Drop comments so prose about requestAnimationFrame doesn't count. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const FORBIDDEN =
  /\b(window|document|navigator|globalThis|self|requestAnimationFrame|cancelAnimationFrame|performance|setTimeout|clearTimeout|setInterval|clearInterval|queueMicrotask|matchMedia|console|process)\b|Date\.now|\bfrom\s+["'](react|react-dom|vue|svelte|solid-js)["']/;

describe("core stays host-free", () => {
  const core = files(src).filter((path) => {
    const rel = relative(src, path);
    return !rel.startsWith("browser") && !rel.includes("__tests__");
  });

  it("has source files to check", () => {
    expect(core.length).toBeGreaterThan(10);
  });

  for (const path of core) {
    it(relative(root, path), () => {
      const match = code(readFileSync(path, "utf8")).match(FORBIDDEN);
      expect(match?.[0] ?? null).toBeNull();
    });
  }

  it("index.ts doesn't export the browser adapter", () => {
    expect(code(readFileSync(join(root, "index.ts"), "utf8"))).not.toMatch(/from\s+["'][^"']*browser/);
  });
});
