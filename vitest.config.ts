import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web", import.meta.url)),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/api/test/**/*.test.ts", "apps/api/src/**/*.test.ts", "apps/web/**/*.test.ts", "apps/web/**/*.test.tsx"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
