// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const macros = require('@rushstack/eslint-config/profile/_macros');
const { namingConventionRuleOptions } = require('@rushstack/eslint-config/profile/_common');

function buildRules(profile) {
  let profileMixins;
  switch (profile) {
    case 'web-app': {
      profileMixins = {
        // Rationale: Importing a module with `require` cannot be optimized by webpack as effectively as
        // `import` statements.
        '@typescript-eslint/no-require-imports': 'error'
      };
      break;
    }

    default: {
      profileMixins = {};
      break;
    }
  }

  const eslintPluginImport = require.resolve('eslint-plugin-import', {
    paths: [__dirname]
  });

  // Look for eslint-import-resolver-node inside of eslint-plugin-import
  const eslintImportResolverNode = require.resolve('eslint-import-resolver-node', {
    paths: [eslintPluginImport]
  });

  return {
    // Since we base our profiles off of the Rushstack profiles, we will extend these by default
    // while providing an option to override and specify your own
    extends: [`@rushstack/eslint-config/profile/${profile}`],
    plugins: ['eslint-plugin-import', 'eslint-plugin-header'],
    settings: {
      // Tell eslint-plugin-import where to find eslint-import-resolver-node
      'import/resolver': eslintImportResolverNode
    },
    overrides: [
      {
        // The settings below revise the defaults specified in the extended configurations.
        files: ['*.ts', '*.tsx'],
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
          '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],

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

          'header/header': [
            'warn',
            'line',
            [
              ' Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.',
              ' See LICENSE in the project root for license information.'
            ]
          ],

          // Docs: https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/naming-convention.md
          '@typescript-eslint/naming-convention': [
            'warn',
            ...macros.expandNamingConventionSelectors([
              ...namingConventionRuleOptions,
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

          ...profileMixins
        }
      },
      {
        // For unit tests, we can be a little bit less strict.  The settings below revise the
        // defaults specified in the extended configurations, as well as above.
        files: [
          // Test files
          '*.test.ts',
          '*.test.tsx',
          '*.spec.ts',
          '*.spec.tsx',

          // Facebook convention
          '**/__mocks__/*.ts',
          '**/__mocks__/*.tsx',
          '**/__tests__/*.ts',
          '**/__tests__/*.tsx',

          // Microsoft convention
          '**/test/*.ts',
          '**/test/*.tsx'
        ],
        rules: {}
      }
    ]
  };
}

exports.buildRules = buildRules;
