// /llms.txt: a plain-text summary of the site for AI tools, and every page with its address and a line about it.
import type { APIRoute } from "astro";
import { pages } from "../data/pages";
import { getUseCases, getPosts, pathOf } from "../data/content";
import { site, npmUrl, repoUrl } from "../data/site";

export const GET: APIRoute = async () => {
  const useCases = await getUseCases();
  const posts = await getPosts();
  const line = (path: string, title: string, description: string) => `- [${title}](${site}${path}): ${description}`;

  const out = [
    "# n-uf motion",
    "",
    `> n-uf motion (@n-uf/motion on npm) is a TypeScript library for motion in windows, panels and toolbars. It has one frame loop with an injected clock (input, update, layout and write phases, a frame budget and stats), fine-grained signals, springs and tweens over numbers, points, rects and vectors, and a DOM-free gesture recogniser (click or drag, double click, long press, pinch, scroll, zoom). Its window motion rules are settle, a critically damped spring launched from where a value is drawn that never passes its target (90 % of the way in 92 ms at the default tempo); hold, where what a pointer owns sits exactly under it; and reveal, which glides a window without stretching its content. It has no DOM and no framework dependency; @n-uf/motion/browser adds the requestAnimationFrame clock and the reduced-motion query, and @n-uf/motion/testing has frame-sampled checks of the rules. It is young and still changing: versions are dates (YY.M.R), not semantic versions, so pin an exact one. It is made by n-uf (https://n-uf.com) under the PolyForm Perimeter 1.0.1 licence. Source: ${repoUrl}. Package: ${npmUrl}.`,
    "",
    "## Pages",
    "",
    ...pages.map((p) => line(p.path, p.title, p.description)),
  ];
  if (useCases.length > 0) {
    out.push("", "## Use cases", "", line("/use-cases/", "All use cases", "What n-uf motion is good for, one job at a time."),
      ...useCases.map((e) => line(pathOf("usecases", e.id), e.data.h1, e.data.description)));
  }
  if (posts.length > 0) {
    out.push("", "## Blog", "", line("/blog/", "All articles", "Short articles on window motion with n-uf motion."),
      ...posts.map((e) => line(pathOf("blog", e.id), e.data.h1, e.data.description)));
  }
  return new Response(out.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
