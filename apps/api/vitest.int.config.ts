import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // NestJS DI reads constructor param types from `design:paramtypes` metadata.
  // Vitest's default esbuild transform does not emit decorator metadata, so we
  // transform the integration suites with SWC (legacy decorators + metadata) to
  // match the tsc build (experimentalDecorators + emitDecoratorMetadata).
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        keepClassNames: true,
      },
    }),
  ],
  test: {
    include: ["src/**/*.int.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
