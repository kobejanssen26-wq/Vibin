// Minimal ESLint flat config. All TypeScript type-checking and dead-code
// detection is delegated to `tsc` (`npm run typecheck`), which is far more
// accurate. ESLint here only sanity-checks the plain-JS tooling files
// (integration test, scripts, config) so `npm run lint` stays fast and
// dependency-light.
export default [
  {
    ignores: [
      "dist/**",
      ".wrangler/**",
      "migrations/**",
      "node_modules/**",
      "coverage/**",
      "**/*.ts",
      "**/*.tsx",
      "worker-configuration.d.ts",
    ],
  },
  {
    files: ["**/*.{mjs,js}"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module" },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "prefer-const": "warn",
      "no-var": "error",
      "no-debugger": "error",
    },
  },
];
