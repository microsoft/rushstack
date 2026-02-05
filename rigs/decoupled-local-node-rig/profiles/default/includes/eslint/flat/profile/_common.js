// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { expandNamingConventionSelectors } = require('@rushstack/eslint-config/flat/profile/_macros');
const { commonNamingConventionSelectors } = require('@rushstack/eslint-config/flat/profile/_common');
const rushstackEslintPlugin = require('@rushstack/eslint-plugin');
const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const importEslintPlugin = require('eslint-plugin-import');
const headersEslintPlugin = require('eslint-plugin-headers');

const nodeImportResolverPath = require.resolve('eslint-import-resolver-node');

module.exports = {
  localCommonConfig: [
    {
      files: ['**/package.json'],
      plugins: {
        '@rushstack': rushstackEslintPlugin
      },
      processor: '@rushstack/sort-package-json'
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      plugins: {
        '@rushstack': rushstackEslintPlugin,
        '@typescript-eslint': typescriptEslintPlugin,
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
        'import/enforce-node-protocol-usage': ['warn', 'always'],

        // Group imports in the following way:
        // 1. Built-in modules (fs, path, etc.)
        // 2. External modules (lodash, react, etc.)
        //    a. `@rushstack` and `@microsoft` scoped packages
        // 3. Internal modules (and other types: parent, sibling, index)
        'import/order': [
          'warn',
          {
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
            groups: [
              'builtin',
              'external'
              // And then everything else (internal, parent, sibling, index)
            ],
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
          }
        ]
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
        'import/no-duplicates': 'off'
      }
    }
  ]
};
