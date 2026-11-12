import { defineConfig } from "vite";

// The lab imports @n-uf/motion from the workspace sources (its package.json
// exports point at the .ts files), so a change in packages/motion shows here
// at once.
export default defineConfig({
  server: { port: 3060, strictPort: false },
  // One app (index.html): the shell routes to every page in the hash (src/shell/pages.ts).
});
