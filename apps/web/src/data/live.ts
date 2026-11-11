// Links into a future page, at build time: {{live:/path/}}…{{/live}} in a markdown body shows its sentence only when
// /path/ is built (live, or a draft in dev and previews) and removes it otherwise. The rules and the errors are in
// live-blocks.mjs; this adds the lookup. Applied next to withImages (images.ts) wherever a body is rendered.
// @ts-ignore: plain JS module, so the tests can run it without Astro
import { applyLiveBlocks } from "./live-blocks.mjs";
import { pageStatus } from "./content";

/** The rendered HTML with its live blocks resolved; `file` (the entry's file) names the page in a build error. */
export async function withLiveBlocks(html: string, file: string): Promise<string> {
  if (!html.includes("{{")) return html;
  const paths = new Set<string>();
  for (const m of html.matchAll(/\{\{live:([^{}]*)\}\}/g)) {
    const p = m[1].trim();
    paths.add(p.endsWith("/") ? p : `${p}/`);
  }
  const known = new Map<string, "built" | "unbuilt" | "none">();
  for (const p of paths) known.set(p, await pageStatus(p));
  return applyLiveBlocks(html, (p: string) => known.get(p) ?? "none", file);
}
