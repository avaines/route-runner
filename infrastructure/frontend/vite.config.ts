import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Rollup 4.64.0 stalls during tree-shaking this graph (also reproduced on Node 22.22/24).
  // Keep bundling/minification; remove this workaround after verifying an upstream fix.
  build: { rollupOptions: { treeshake: false } },
  server: {
    proxy: {
      "/api":
        loadEnv(mode, ".", "VITE_").VITE_API_PROXY_TARGET ||
        "http://localhost:3001",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    restoreMocks: true,
  },
}));
