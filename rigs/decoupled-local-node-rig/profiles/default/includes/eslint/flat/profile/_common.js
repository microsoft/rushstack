// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { expandNamingConventionSelectors } = require('@rushstack/eslint-config/flat/profile/_macros');
const { commonNamingConventionSelectors } = require('@rushstack/eslint-config/flat/profile/_common');
const rushstackEslintPlugin = require('@rushstack/eslint-plugin');
// TODO: Put back when when the decoupled local dependency update goes in
// const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const importEslintPlugin = require('eslint-plugin-import');
const headersEslintPlugin = require('eslint-plugin-headers');

const nodeImportResolverPath = require.resolve('eslint-import-resolver-node');

module.exports = {
  localCommonConfig: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      plugins: {
        '@rushstack': rushstackEslintPlugin,
        // '@typescript-eslint': typescriptEslintPlugin,
        import: importEslintPlugin,
        headers: headersEslintPlugin
      },
      settings: {
        'import/resolver': nodeImportResolverPath
      },
      rules: {
        // Rationale: Backslashes are platform-specific and will cause breaks on non-Windows
        // platforms.
        '@rushstack/no-backslash-imports': 'error',

        // Rationale: Avoid consuming dependencies which would not otherwise be present when
        // the package is published.
        '@rushstack/no-external-local-imports': 'error',

        // Rationale: Consumption of transitive dependencies can be problematic when the dependency
        // is updated or removed from the parent package. Enforcing consumption of only direct dependencies
        // ensures that the package is exactly what we expect it to be.
        '@rushstack/no-transitive-dependency-imports': 'warn',

        // Rationale: Using the simplest possible import syntax is preferred and makes it easier to
        // understand where the dependency is coming from.
        '@rushstack/normalized-imports': 'warn',

        // Rationale: Use of `void` to explicitly indicate that a floating promise is expected
        // and allowed.
        '@typescript-eslint/no-floating-promises': [
          'error',
          {
            ignoreVoid: true,
            checkThenables: true
          }
        ],

        // Rationale: Redeclaring a variable likely indicates a mistake in the code.
        'no-redeclare': 'off',
        '@typescript-eslint/no-redeclare': 'error',

        // Rationale: Can easily cause developer confusion.
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': 'warn',

        // Rationale: Catches a common coding mistake where a dependency is taken on a package or
        // module that is not available once the package is published.
        'import/no-extraneous-dependencies': ['error', { devDependencies: true, peerDependencies: true }],

        // Rationale: Use of `== null` comparisons is common-place
        eqeqeq: ['error', 'always', { null: 'ignore' }],

        // Rationale: Consistent use of function declarations that allow for arrow functions.
        'func-style': ['warn', 'declaration', { allowArrowFunctions: true }],

        // Rationale: Use of `console` logging is generally discouraged. If it's absolutely needed
        // or added for debugging purposes, there are more specific log levels to write to than the
        // default `console.log`.
        'no-console': ['warn', { allow: ['debug', 'info', 'time', 'timeEnd', 'trace'] }],

        // Rationale: Loosen the rules for unused expressions to allow for ternary operators and
        // short circuits, which are widely used
        'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],

        // Rationale: Use of `void` to explicitly indicate that a floating promise is expected
        // and allowed.
        'no-void': ['error', { allowAsStatement: true }],

        // Rationale: Different implementations of `parseInt` may have different behavior when the
        // radix is not specified. We should always specify the radix.
        radix: 'error',

        // Rationale: Including the `type` annotation in the import statement for imports
        // only used as types prevents the import from being emitted in the compiled output.
        // strict-codegen: house style is inline type specifiers (`import { type X, Y }`),
        // which also keeps import/no-duplicates satisfied; ratchet to 'error' once
        // onboarding completes.
        '@typescript-eslint/consistent-type-imports': [
          'warn',
          { prefer: 'type-imports', disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' }
        ],

        // Rationale: If all imports in an import statement are only used as types,
        // then the import statement should be omitted in the compiled JS output.
        '@typescript-eslint/no-import-type-side-effects': 'warn',

        'headers/header-format': [
          'warn',
          {
            source: 'string',
            style: 'line',
            trailingNewlines: 2,
            content:
              'Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.\n' +
              'See LICENSE in the project root for license information.'
          }
        ],

        // Docs: https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/naming-convention.md
        '@typescript-eslint/naming-convention': [
          'warn',
          ...expandNamingConventionSelectors([
            ...commonNamingConventionSelectors,
            {
              selectors: ['method'],
              modifiers: ['async'],
              enforceLeadingUnderscoreWhenPrivate: true,

              format: null,
              custom: {
                regex: '^_?[a-zA-Z]\\w*Async$',
                match: true
              },
              leadingUnderscore: 'allow',

              filter: {
                regex: [
                  // Specifically allow ts-command-line's "onExecute" function.
                  '^onExecute$'
                ]
                  .map((x) => `(${x})`)
                  .join('|'),
                match: false
              }
            }
          ])
        ],

        // Require `node:` protocol for imports of Node.js built-in modules
        // strict-codegen: ratchet to 'error' once onboarding completes.
        'import/enforce-node-protocol-usage': ['warn', 'always'],

        // Group imports in the following way:
        // 1. Built-in modules (fs, path, etc.)
        // 2. External modules (lodash, react, etc.)
        //    a. `@rushstack` and `@microsoft` scoped packages
        // 3. Internal modules
        // 4. Parent, sibling, and index imports
        // strict-codegen: alphabetize within groups and give internal/parent/sibling/index
        // their own groups; ratchet to 'error' once onboarding completes.
        'import/order': [
          'warn',
          {
            alphabetize: { order: 'asc', caseInsensitive: true },
            // This option ensures that the @rushstack and @microsoft packages end up in their own group
            distinctGroup: true,
            pathGroups: [
              {
                pattern: '@{rushstack,microsoft}/**',
                group: 'external',
                position: 'after'
              }
            ],
            // Ensure the @rushstack and @microsoft packages are grouped with other external packages. By default this
            // option includes 'external'
            pathGroupsExcludedImportTypes: ['builtin', 'object'],
            groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
            'newlines-between': 'always'
          }
        ],

        'import/no-duplicates': 'warn',

        'no-restricted-syntax': [
          'error',
          {
            // Forbid only bare `export * from '...'`
            selector: 'ExportAllDeclaration[exported=null]',
            message: "Use explicit named exports instead of `export * from '...'`."
          },
          {
            selector: 'MethodDefinition[accessibility="private"][static=true]',
            message: 'Use a module-scoped function instead of a `private static` method.'
          },
          {
            selector: 'PropertyDefinition[accessibility="private"][static=true]',
            message: 'Use a module-scoped variable instead of a `private static` property.'
          }
        ],

        // ====================================================================
        // STRICT CODEGEN RULES
        // ====================================================================
        // An ultra-strict rule set, originally designed for newly generated packages
        // (for example the rushd wire-layer packages), being rolled out to every package
        // in the repository.  These rules currently run at 'warn' while packages onboard
        // via bulk suppressions (`eslint-bulk suppress`); they will ratchet to 'error'
        // once onboarding completes.  Only rules that already ship with this repository's
        // ESLint toolchain (@typescript-eslint, eslint-plugin-import, and ESLint core)
        // are used.  See AGENTS.md for the lint policy and rollout plan.

        // Rationale: Complexity budget -- tiny functions, tiny files, shallow nesting,
        //            few parameters.
        // strict-codegen: ratchet to 'error'
        complexity: ['warn', 3],
        // strict-codegen: ratchet to 'error'
        'max-depth': ['warn', 3],
        // strict-codegen: ratchet to 'error'
        'max-lines-per-function': ['warn', 30],
        // strict-codegen: overrides the published profile's more lenient warn at 2000
        // lines; ratchet to 'error'
        'max-lines': ['warn', 100],
        // strict-codegen: ratchet to 'error'
        'max-params': ['warn', 4],

        // Rationale: Every numeric literal earns a name.  (TS-aware successor of the core
        // no-magic-numbers rule.)  Enum members and readonly class property initializers
        // are already named declarations, so they satisfy the rule's intent.  Variable
        // declaration initializers (`const x = 42`) are not flagged -- the declared name
        // is the name.
        // strict-codegen: ratchet to 'error'
        '@typescript-eslint/no-magic-numbers': [
          'warn',
          { ignoreEnums: true, ignoreReadonlyClassProperties: true }
        ],

        // Rationale: `??` instead of `||`/ternary nullish guards.  All exemptions are
        // disabled explicitly -- the library default `ignoreConditionalTests: true` would
        // otherwise exempt exactly the `if`/ternary guards this rule exists to catch.
        // strict-codegen: ratchet to 'error'
        '@typescript-eslint/prefer-nullish-coalescing': [
          'warn',
          {
            ignoreConditionalTests: false,
            ignoreTernaryTests: false,
            ignorePrimitives: { bigint: false, boolean: false, number: false, string: false }
          }
        ],

        // Rationale: Sort named members within a single import declaration.  Declaration
        // sorting is left to import/order (ignoreDeclarationSort) to avoid conflicts.
        // strict-codegen: ratchet to 'error'
        'sort-imports': ['warn', { ignoreDeclarationSort: true, ignoreMemberSort: false }],

        // Rationale: Production source must never reach outside its own directory via
        // "..".  Unit tests import implementation modules relatively (repo convention),
        // so test files are exempted in the test-files config entry below.
        // strict-codegen: ratchet to 'error'
        'import/no-relative-parent-imports': 'warn',

        // strict-codegen: claimed from the published profile (which sets 'warn');
        // ratchet to 'error'
        'no-eval': 'warn',

        // Rationale: The @typescript-eslint extension rule subsumes the core rule
        // (catches `setTimeout("code")` and friends via type information); extension
        // rules must replace their base rule to avoid double-reporting.
        // strict-codegen: kept at 'error' immediately, matching the published profile's
        // severity for the core rule it replaces.
        'no-implied-eval': 'off',
        '@typescript-eslint/no-implied-eval': 'error'
      }
    },
    {
      files: [
        // Test files
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',

        // Facebook convention
        '**/__mocks__/**/*.ts',
        '**/__mocks__/**/*.tsx',
        '**/__tests__/**/*.ts',
        '**/__tests__/**/*.tsx',

        // Microsoft convention
        '**/test/**/*.ts',
        '**/test/**/*.tsx'
      ],
      rules: {
        'import/order': 'off',
        'import/no-duplicates': 'off',
        // strict-codegen: unit tests import implementation modules relatively (repo
        // convention), so they are exempt from the production-source rule above.
        'import/no-relative-parent-imports': 'off'
      }
    }
  ]
};
