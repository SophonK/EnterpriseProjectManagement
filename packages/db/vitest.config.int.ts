import { defineConfig } from "vitest/config";

// Integration tests need Docker (Testcontainers). Long timeouts for image pull + container boot.
export default defineConfig({
  test: {
    include: ["prisma/**/*.int.test.ts", "src/**/*.int.test.ts"],
    environment: "node",
    hookTimeout: 180_000,
    testTimeout: 120_000,
  },
});
