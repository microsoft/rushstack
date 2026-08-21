# Rushstack agent instructions

For Rush monorepo conventions (commands, subspaces, caching, project selection), see
[.github/copilot-instructions.md](.github/copilot-instructions.md).

## Lint policy

### Strict rules ("strict-codegen") live in the repo's universal lint config

The repo's universal ESLint rule set is the rig overlay at
[`rigs/decoupled-local-node-rig/profiles/default/includes/eslint/flat/profile/_common.js`](rigs/decoupled-local-node-rig/profiles/default/includes/eslint/flat/profile/_common.js)
(`localCommonConfig`). It is composed after the published `@rushstack/eslint-config` profile
and applies to every project in the repository (consumed directly via the rig or via
`local-eslint-config`, which copies it at build time).

The "strict-codegen" rules (small functions/files, named constants, nullish coalescing,
strict import hygiene, no `eval`) live there, marked with `// strict-codegen` comments.
Rollout status and remaining phases:

1. **warn phase — DONE.** Rules run at `'warn'` repo-wide; the bulk-suppressions patch is
   wired into every project's eslint config.
2. **onboarding — DONE.** Every package's pre-existing violations are recorded in its
   `.eslint-bulk-suppressions.json` via `@rushstack/eslint-bulk`.
3. **error phase — NEXT.** Flip the marked rules to `'error'` in `_common.js` (small diff);
   builds stay green because suppressions are severity-independent.
4. **noInlineConfig phase — LAST.** First strip remaining inline `eslint-disable` comments
   repo-wide (they cannot be bulk-suppressed once inert) and re-run
   `eslint-bulk suppress --all .` per package to capture the unmasked violations; then
   enable `linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' }`
   in the overlay.

### Suppressions are disallowed

- Do NOT add `eslint-disable` comments or any inline ESLint config to source files. Once
  the noInlineConfig phase lands this is also mechanically enforced: such comments become
  inert (they suppress nothing) and are flagged, while the violations they target remain
  build-breaking errors.
- Do NOT add `ignores` entries to ESLint configs to hide violations.
- The only sanctioned mechanism for pre-existing violations is the bulk suppressions file
  (`.eslint-bulk-suppressions.json`), managed exclusively with the
  [`@rushstack/eslint-bulk`](https://www.npmjs.com/package/@rushstack/eslint-bulk) CLI:

  ```sh
  # Record all current violations as bulk suppressions (run in the project folder)
  eslint-bulk suppress --all .

  # After fixing code, drop suppressions that are no longer needed
  eslint-bulk prune .
  ```

  Treat `.eslint-bulk-suppressions.json` as a ratchet: it may only shrink in a PR, never
  grow, unless the PR's sole purpose is onboarding the package to the strict rules.

- `@rushstack/no-new-null` stays at the repo-wide `'warn'`: packages that must express
  JSON's `null` in payload types (e.g. wire codecs with a recursive JSON-value union) record
  bulk suppressions for it instead of disabling the rule.

### Deferred strict rules

These zero-tolerance rules are intentionally **not** enabled yet, pending dedicated rollouts:

- **no-inline-type-import** (banning inline `type` specifiers in favor of top-level
  `import type` statements): conflicts with the repo's house style of inline type specifiers
  (`import { type X, Y }`), which the universal config enforces via
  `@typescript-eslint/consistent-type-imports` with `fixStyle: 'inline-type-imports'`.
