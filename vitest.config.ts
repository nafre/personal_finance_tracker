import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // lib/sync.test.ts opts into jsdom via a `// @vitest-environment jsdom` docblock
    // (lib/idb.ts's getDB() requires a `window` global).
    include: ["lib/**/*.test.ts"],
  },
});
