// /llms.txt: a plain-text summary of the site for AI tools, and every page with its address and a line about it.
import type { APIRoute } from "astro";
import { pages } from "../data/pages";
import { docsPages } from "../data/docs";
import { getUseCases, getPosts, pathOf } from "../data/content";
import { site, npmUrl, npmPlacementUrl, npmDockingUrl, repoUrl } from "../data/site";

export const GET: APIRoute = async () => {
  const useCases = await getUseCases();
  const posts = await getPosts();
  const line = (path: string, title: string, description: string) => `- [${title}](${site}${path}): ${description}`;

  const out = [
    "# n-uf motion",
    "",
    `> @n-uf/motion, @n-uf/placement and @n-uf/docking are three TypeScript libraries for windows, panels and toolbars, by the same author, with the same license and version. @n-uf/docking (${npmDockingUrl}) says where panels and toolbars dock: a dock state of bars, rails, columns, items and floats, solved into rects, with the drop targets and refusals of every drag, as plain state in and rects out, with no DOM and no motion; it draws nothing. @n-uf/placement (${npmPlacementUrl}) says where things fit: a popup placed beside its anchor, a stack that gives way as room runs out, the cut of an edge, the drop places along one edge and tiled panes, over plain rects. @n-uf/motion says how things move, and takes docking's targets for its drag intent, docking's lanes() for its landing model (createLandingModel) and the rects of placement or docking for its layout motion. @n-uf/motion has one frame loop with an injected clock (input, update, layout and write phases, a frame budget and stats), fine-grained signals, springs and tweens over numbers, points, rects and vectors, a DOM-free gesture recognizer (click or drag, double click, long press, pinch, scroll, zoom), the drag intent and the landing model with four drop previews (outline, placeholder, glide, snap), and layout motion that glides items to new rects. Its window motion rules are settle, a critically damped spring launched from where a value is drawn that never passes its target (90 % of the way in 92 ms at the default tempo); direct drag, where what a pointer owns sits exactly under it; and reveal, which glides a window without stretching its content. It has no DOM and no framework dependency; @n-uf/motion/browser adds the requestAnimationFrame clock, the reduced-motion query and the DOM writers (domDrawable, layOutBox, drawBox, and flip with rectOf for FLIP), and @n-uf/motion/testing has frame-sampled checks of the rules. It is young and still changing: versions are dates (YY.M.R), not semantic versions, so pin an exact one. It is made by n-uf (https://n-uf.com) under the PolyForm Perimeter 1.0.1 license. Source: ${repoUrl}. Package: ${npmUrl}.`,
    "",
    "## Pages",
    "",
    ...pages.map((p) => line(p.path, p.title, p.description)),
    "",
    "## Docs",
    "",
    ...docsPages.map((p) => line(p.path, p.title, p.description)),
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
