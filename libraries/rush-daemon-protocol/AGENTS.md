# Agent coding contract — `@rushstack/rush-daemon-protocol`

This package is governed by an **ultra-strict lint policy** for generated code. All of the
rules below are enabled to `error` in `eslint.config.js` via the shared
`local-node-rig/profiles/default/includes/eslint/flat/mixins/strict-codegen.js` mixin.
They apply to **all** TypeScript in this package, **including tests** (`src/**/*.test.ts`).

## Enforced rules (do not attempt to bypass)

| Rule | Setting |
| ---- | ------- |
| `complexity` | `['error', 3]` |
| `max-depth` | `['error', 3]` |
| `max-lines-per-function` | `['error', 30]` |
| `max-lines` | `['error', 100]` — every file, including this means: keep files small; split modules |
| `max-params` | `['error', 4]` — use options objects |
| `@typescript-eslint/no-magic-numbers` | `'error'` — every numeric literal must be a named constant |
| `@typescript-eslint/prefer-nullish-coalescing` | `'error'` — use `??`, not `\|\|` or nullish-guard ternaries |
| `import/enforce-node-protocol-usage` | `['error', 'always']` — write `node:crypto`, never `crypto` |
| `import/order` | `['error', { alphabetize: asc, grouped, newlines-between: always }]` |
| `sort-imports` | `['error', { ignoreDeclarationSort: true }]` — sort named members |
| `@typescript-eslint/consistent-type-imports` | `['error', { fixStyle: 'separate-type-imports' }]` — `import type { X }`, never inline `type` specifiers |
| `import/no-relative-parent-imports` | `'error'` for non-test source — no `../` imports outside tests |
| `no-eval`, `@typescript-eslint/no-implied-eval` | `'error'` |

## Suppression is forbidden — mechanically enforced

- `linterOptions.noInlineConfig: true` makes **every** `eslint-disable*` comment a lint error.
- `reportUnusedDisableDirectives: 'error'` flags stale suppressions.
- Therefore, as an agent working in this package you MUST NOT:
  - add `eslint-disable`, `eslint-disable-next-line`, `eslint-env`, or inline `/* eslint ... */` config comments;
  - add entries to any `.eslint-bulk-suppressions.json`;
  - add `eslintIgnore` keys to `package.json`;
  - add `@ts-nocheck` or `@ts-ignore` comments;
  - weaken, reorder, or remove the `strict-codegen` mixin in `eslint.config.js`.
- If a rule fires, **fix the code** (extract a constant, split the function/module, restructure) — never silence it.

## Deferred rules (do not emulate with hacks)

The following intended rules have no existing implementation in this repository's ESLint
toolchain and are **not yet enabled** (the user will wire them up later):
`no-magic-strings`, `no-object-mutation`, `no-array-mutation`,
`no-placeholder-implementation`, and the custom zero-tolerance import rules
(`no-re-export`, `require-clean-barrel`, `require-barrel-relative-exports`,
`no-export-alias`, `no-dynamic-import`, `no-hardcoded-secrets`,
`no-parent-internal-access`). Write code that would already satisfy them: prefer immutable
update patterns and named string constants, and never land stubs or `TODO` implementations.

## Design notes for this package

- `src/events/` contains **placeholder** event-contract types that mirror
  `@rushstack/reporter`'s `IReporterEventEnvelope` field-for-field. When the reporter
  package merges into `main`, these types are replaced by imports from
  `@rushstack/reporter` — do not fork the shapes.
- This package must remain dependency-light: Node.js builtins only; no `rush-lib`.
