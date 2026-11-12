/**
 * The lab app's shell: a persistent sidebar (Overview, Motion, Placement, Kit cases, Checks), and for the page the
 * route names a header (eyebrow, title, one line, the packages it runs, Reset, previous and next), its markup and its
 * module. Routes live in the hash (`#/placement/desk`), so a deep link survives a reload. Page modules start when
 * they are imported and keep global state, so going to another page reloads.
 */
import motionPkg from "../../../../packages/motion/package.json?raw";
import placementPkg from "../../../../packages/placement/package.json?raw";
import type { LabRun } from "../shared/hooks";
import { parseRoute, registeredReset, routeHash } from "./api";
import { GROUPS, PAGES, pageById, type PageDef, type View } from "./pages";

const version = (raw: string): string => (JSON.parse(raw) as { version: string }).version;
export const VERSIONS = { motion: version(motionPkg), placement: version(placementPkg) };

/**
 * The public build (`vite build --mode public`, served at motion.n-uf.com/lab/): it names the versions of the source
 * it runs, and shows the Checks page only when the address has `?checks` (without it, the Checks route shows the
 * overview; every page's `runAll` hook stays).
 */
const PUBLIC = import.meta.env.MODE === "public";
const withChecks = !PUBLIC || new URLSearchParams(location.search).has("checks");
/** The pages in the sidebar and the previous/next order. */
const LISTED = PAGES.filter((p) => withChecks || p.group !== "checks");

const route = parseRoute();
const page: PageDef = PUBLIC && !withChecks && route.id === "checks" ? pageById("overview")! : (pageById(route.id) ?? pageById("overview")!);
const root = document.getElementById("lab") as HTMLDivElement;

// --- markup --------------------------------------------------------------------------------------------------------

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const groupTitle = (g: PageDef["group"]): string => GROUPS.find((x) => x.id === g)!.title;
const index = LISTED.indexOf(page);
const prev = index < 0 ? null : (LISTED[index - 1] ?? null);
const next = index < 0 ? null : (LISTED[index + 1] ?? null);

function sidebar(): string {
  const groups = GROUPS.filter((g) => LISTED.some((p) => p.group === g.id)).map((g) => {
    const items = LISTED.filter((p) => p.group === g.id)
      .map((p) => `<li><a href="${routeHash(p.id)}"${p === page ? ' aria-current="page"' : ""}><span>${esc(p.nav ?? p.title)}</span></a></li>`)
      .join("");
    return `<div class="lab-group"><p class="lab-group-k">${g.title}</p><ul>${items}</ul></div>`;
  }).join("");
  return `<aside class="lab-side" aria-label="Lab pages">
    <a class="lab-brand" href="${routeHash("overview")}">
      <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><circle class="brand-target" cx="12" cy="12" r="9"/><path class="brand-curve" d="M4 17 C 9 17, 10 7, 18 7"/><circle class="brand-dot" cx="18" cy="7" r="2.6"/></svg>
      <span class="wordmark"><span class="brand-ns">n-uf</span> motion <span class="brand-amp">&amp;</span> placement</span>
      <span class="lab-badge">lab</span>
    </a>
    <nav class="lab-nav">${groups}</nav>
    <p class="lab-side-foot"><a href="https://motion.n-uf.com" target="_blank" rel="noopener">motion.n-uf.com<span class="ext-arrow">↗</span></a></p>
  </aside>`;
}

function header(): string {
  const n = PAGES.filter((p) => p.group === page.group).indexOf(page) + 1;
  return `<header class="lab-head">
    <p class="eyebrow"><span>${groupTitle(page.group)}</span>${page.group === "overview" || page.group === "checks" ? "" : `<span class="n">${String(n).padStart(2, "0")}</span>`}</p>
    <h1>${esc(page.title)}</h1>
    <p class="lead">${esc(page.line)}</p>
    <div class="lab-meta">
      ${PUBLIC
        ? `<p class="built-with" title="The released versions this lab was built from"><span class="bw-k">Runs</span><code>@n-uf/motion ${VERSIONS.motion}</code> · <code>@n-uf/placement ${VERSIONS.placement}</code></p>`
        : `<p class="built-with" title="The packages' sources in this repository, not a published release"><span class="bw-k">Runs the workspace source</span><code>@n-uf/motion ${VERSIONS.motion}</code><code>@n-uf/placement ${VERSIONS.placement}</code></p>`}
      <div class="lab-actions">
        ${!page.load ? "" : '<button type="button" class="lab-btn" id="lab-reset">↺ Reset</button>'}
        ${prev ? `<a class="lab-btn" href="${routeHash(prev.id)}" title="${esc(prev.title)}">← Previous</a>` : ""}
        ${next ? `<a class="lab-btn" href="${routeHash(next.id)}" title="${esc(next.title)}">Next →</a>` : ""}
      </div>
    </div>
    ${page.about ? `<details class="lab-about"><summary>About this page</summary><p>${page.about}</p></details>` : ""}
  </header>`;
}

function pager(): string {
  return `<nav class="pager" aria-label="Previous and next page">
    ${prev ? `<a class="prev" href="${routeHash(prev.id)}"><span class="k">Previous</span><span class="t">${esc(prev.title)}</span></a>` : "<span></span>"}
    ${next ? `<a class="next" href="${routeHash(next.id)}"><span class="k">Next</span><span class="t">${esc(next.title)}</span></a>` : ""}
  </nav>`;
}

// --- runAll: a page runs its view of its module's scenarios ---------------------------------------------------------

const matches = (v: View, name: string): boolean => (typeof v === "string" ? name.includes(v) : v(name));
type Filter = string | ((name: string) => boolean);
/** The page's view and a caller's filter, as one filter (a plain string when it can be: some modules take only that). */
function compose(view: View, filter?: Filter): Filter {
  if (filter === undefined || filter === "") return view;
  return (name: string) => matches(view, name) && matches(filter, name);
}

function wrapRunAll(): void {
  const hooks = window.__motionLab;
  if (!hooks) {
    // A page with no scenarios still answers.
    window.__motionLab = { runAll: async () => [] as LabRun[], runs: [], lastRows: () => [] };
    return;
  }
  if (!page.view || route.all) return;
  const inner = hooks.runAll;
  const view = page.view;
  hooks.runAll = (filter?: Filter) => inner(compose(view, filter));
}

// --- boot ----------------------------------------------------------------------------------------------------------

async function boot(): Promise<void> {
  document.title = page.group === "overview" ? "Motion and placement lab" : `${page.title} · Motion and placement lab`;
  document.body.dataset.page = page.id;
  if (route.embed) document.body.classList.add("lab-embed");
  root.innerHTML = `${route.embed ? "" : sidebar()}<main class="lab-main${page.wide ? " wide" : ""}">${route.embed ? "" : header()}<div class="lab-page" id="lab-page"></div>${route.embed ? "" : pager()}</main>`;
  const body = document.getElementById("lab-page")!;
  if (page.markup) body.innerHTML = await page.markup();
  if (page.load) await page.load();
  if (page.first) {
    const f = body.querySelector(page.first);
    if (f) body.prepend(f);
  }
  wrapRunAll();
  document.getElementById("lab-reset")?.addEventListener("click", () => {
    const own = registeredReset();
    if (own) return own();
    const b = page.reset ? body.querySelector<HTMLElement>(page.reset) : null;
    if (b) b.click();
    else location.reload();
  });
  (window as Window & { __labReady?: boolean }).__labReady = true;
}

// Another page (or other flags): a fresh start, since page modules keep global state.
window.addEventListener("hashchange", () => {
  const r = parseRoute();
  if (r.id !== route.id || r.embed !== route.embed || r.all !== route.all) location.reload();
});

void boot();
