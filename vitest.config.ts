import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts", "src/db/**/*.ts"],
      // client.ts is the postgres.js TCP-connection bootstrap — needs a live network
      // DB, so it is covered by deployment smoke tests, not in-process unit/integration.
      exclude: ["src/**/*.test.ts", "src/db/client.ts"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
  resolve: {
    alias: { "@": srcDir },
  },
});
