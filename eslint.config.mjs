import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config for the HyperShell monorepo.
 *
 * Type-aware linting covers every workspace's `src/` (the files each
 * workspace's tsconfig includes). Tooling scripts and Playwright specs get
 * syntax-level linting only, since they are outside those projects.
 *
 * Gating policy: ESLint core `recommended`, React hook correctness, JSX
 * accessibility, and the two promise-safety rules are errors and fail CI.
 * The rest of typescript-eslint's `recommendedTypeChecked` set (the `no-unsafe-*`
 * family, `require-await`, `unbound-method`, …) reports as warnings — those are
 * mostly `unknown`-narrowing noise at the IPC boundary and are a separate
 * cleanup, not a gate.
 */

/** Every rule `recommendedTypeChecked` turns on, demoted from error to warning. */
const typeCheckedAsWarnings = Object.fromEntries(
  Object.entries(
    Object.assign({}, ...tseslint.configs.recommendedTypeChecked.map((config) => config.rules ?? {}))
  ).map(([name, level]) => {
    if (Array.isArray(level)) {
      return [name, level[0] === "off" ? level : ["warn", ...level.slice(1)]];
    }
    return [name, level === "off" ? "off" : "warn"];
  })
);

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/release/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "apps/ui/src/vite-env.d.ts",
      ".claude/**",
      "redesign/**",
    ],
  },

  // Tooling and build scripts — plain JS, no type information available.
  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // All workspace sources, type-aware.
  {
    files: ["apps/*/src/**/*.ts", "apps/*/src/**/*.tsx", "packages/*/src/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      ...typeCheckedAsWarnings,

      // A dangling promise in the main process or a React handler silently
      // swallows rejections — this is the rule the review asked for.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // `catch {}` around best-effort cleanup is an established pattern here.
      "@typescript-eslint/no-empty-function": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Renderer: React hook correctness and JSX accessibility.
  //
  // react-hooks' own flat preset also enables the React Compiler rules
  // (static-components, use-memo, preserve-manual-memoization, …). Those are a
  // separate opt-in; enable the two correctness rules explicitly.
  {
    files: ["apps/ui/src/**/*.ts", "apps/ui/src/**/*.tsx"],
    extends: [jsxA11y.flatConfigs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // Checkbox rows here wrap their input and put the visible text one level
      // deeper than the rule's default search depth.
      "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }],

      // Splitters and column-resize grips are pointer-drag affordances with no
      // keyboard equivalent. Allow drag initiation on an element that carries a
      // role (separator/group), while still requiring keyboard support for
      // click-style interactions — and on anonymous `div`s, where
      // `no-static-element-interactions` keeps the default handler list.
      "jsx-a11y/no-noninteractive-element-interactions": [
        "error",
        { handlers: ["onClick", "onKeyPress", "onKeyDown", "onKeyUp"] },
      ],
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { tags: [], roles: ["tabpanel", "application"], allowExpressionValues: true },
      ],
    },
  },

  // Vitest specs: assertions and fixtures legitimately traffic in `any`.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  // Playwright specs live outside the workspace tsconfigs.
  {
    files: ["apps/ui/tests/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  }
);
