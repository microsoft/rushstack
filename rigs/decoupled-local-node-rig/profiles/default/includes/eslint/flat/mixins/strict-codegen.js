// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// "strict-codegen" mixin
//
// An ultra-strict rule set for newly generated packages (for example the rushd wire-layer
// packages).  It intentionally only uses rules that already ship with this repository's
// ESLint toolchain (@typescript-eslint, eslint-plugin-import, and ESLint core); no
// additional plugins are installed.
//
// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile.
//
// Suppression is mechanically forbidden: `noInlineConfig` makes every `eslint-disable`
// comment an error, and unused disable directives are reported as errors.

const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const importPlugin = require('eslint-plugin-import');

const strictCodegenMixin = [
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error'
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      import: importPlugin
    },
    rules: {
      // Complexity budget: tiny functions, tiny files, shallow nesting, few parameters.
      complexity: ['error', 3],
      'max-depth': ['error', 3],
      'max-lines-per-function': ['error', 30],
      'max-lines': ['error', 100],
      'max-params': ['error', 4],

      // Every numeric literal earns a name. (TS-aware successor of core no-magic-numbers.)
      // Enum members and readonly class property initializers are already named
      // declarations, so they satisfy the rule's intent.
      '@typescript-eslint/no-magic-numbers': [
        'error',
        { ignoreEnums: true, ignoreReadonlyClassProperties: true }
      ],

      // `??` instead of `||`/ternary nullish guards.
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // Import hygiene (existing-rule equivalents of the zero-tolerance "imports" family).
      'import/enforce-node-protocol-usage': ['error', 'always'],
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always'
        }
      ],
      'sort-imports': ['error', { ignoreDeclarationSort: true, ignoreMemberSort: false }],
      // Repo house style: inline type specifiers (`import { type X, Y }`), which also
      // keeps import/no-duplicates satisfied. (The zero-tolerance no-inline-type-import
      // rule is deferred; see AGENTS.md.)
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // No unsafe code generation.
      'no-eval': 'error',
      '@typescript-eslint/no-implied-eval': 'error',

      // Wire codecs must be able to express JSON's `null` in payload types
      // (e.g. the recursive JSON-value union), which this warn-level repo rule forbids.
      // Disabled here so wire-fidelity types do not require inline suppressions
      // (which this mixin forbids via noInlineConfig).
      '@rushstack/no-new-null': 'off'
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.spec.ts', '**/test/**'],
    rules: {
      // Unit tests import implementation modules relatively (repo convention);
      // production source must never reach outside its own directory via "..".
      'import/no-relative-parent-imports': 'error'
    }
  }
];

module.exports = [...strictCodegenMixin];
