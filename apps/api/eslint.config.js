import base from "@epm/config/eslint";

// NestJS relies on emitDecoratorMetadata: injected classes must be VALUE imports
// (not `import type`), so consistent-type-imports is disabled for the API package.
export default [
  ...base,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
