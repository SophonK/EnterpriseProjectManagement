// @epm/config — shared flat ESLint config for all workspace packages.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Base config: applied by every package via `import base from "@epm/config/eslint"`. */
export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "**/*.generated.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
