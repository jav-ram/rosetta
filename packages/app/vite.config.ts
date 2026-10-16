import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// PAGES_BASE is set when building for GitHub Pages, where the site lives under /<repo>/.
export default defineConfig({
  base: process.env.PAGES_BASE ?? "/",
  plugins: [react()],
  worker: { format: "es" },
  test: { globalSetup: ["test/global-setup.ts"] },
});
