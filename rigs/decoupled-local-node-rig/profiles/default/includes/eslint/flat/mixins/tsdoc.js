// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

const jsdocEslintPlugin = require('eslint-plugin-jsdoc');
const tsdocMixin = require('@rushstack/eslint-config/flat/mixins/tsdoc');

module.exports = [
  ...tsdocMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      jsdoc: jsdocEslintPlugin
    },
    rules: {
      // Rationale: Ensures that parameter names in JSDoc match those in the function
      // declaration. Good to keep these in sync.
      'jsdoc/check-param-names': 'warn'
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
    rules: {}
  }
];
