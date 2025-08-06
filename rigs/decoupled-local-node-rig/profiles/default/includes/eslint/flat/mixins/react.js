// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Adds support for a handful of React specific rules. These rules are sourced from two different
// react rulesets:
// - eslint-plugin-react (through @rushstack/eslint-config/flat/mixins/react)
// - eslint-plugin-react-hooks
//
// Additional information on how this mixin should be consumed can be found here:
// https://github.com/microsoft/rushstack/tree/master/eslint/eslint-config#rushstackeslint-configmixinsreact
//
// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

const reactHooksEslintPlugin = require('eslint-plugin-react-hooks');
const reactMixin = require('@rushstack/eslint-config/flat/mixins/react');

module.exports = [
  ...reactMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react-hooks': reactHooksEslintPlugin
    },
    rules: {
      // =====================================================================
      // eslint-plugin-react-hooks
      // =====================================================================
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    // For unit tests, we can be a little bit less strict.  The settings below revise the
    // defaults specified above.
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

    // New rules and changes to existing rules
    rules: {}
  }
];
