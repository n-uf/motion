/**
 * What a page module may use from the shell: the route it runs under, and the header's Reset.
 *
 * Routes are `#/<page id>` with optional flags: `#/placement/desk?embed=1&all=1`. `embed` hides the sidebar and the
 * header (the Checks page runs pages in frames); `all` runs (and shows) all of the page module's scenarios, not only
 * the page's view.
 */

export interface Route {
  readonly id: string;
  readonly embed: boolean;
  readonly all: boolean;
}

/** The route in a location hash (default: the overview). */
export function parseRoute(hash: string = location.hash): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const q = new URLSearchParams(query);
  return { id: path.replace(/\/+$/, "") || "overview", embed: q.has("embed"), all: q.has("all") };
}

/** The hash for a route. */
export function routeHash(id: string, flags: { embed?: boolean; all?: boolean } = {}): string {
  const q = [flags.embed ? "embed=1" : "", flags.all ? "all=1" : ""].filter(Boolean).join("&");
  return `#/${id}${q ? `?${q}` : ""}`;
}

let resetHandler: (() => void) | null = null;

/** The header's Reset calls `fn` (instead of the page's reset button, or a reload). */
export function onReset(fn: () => void): void {
  resetHandler = fn;
}

/** The handler a page registered, if any (the shell's Reset). */
export const registeredReset = (): (() => void) | null => resetHandler;
