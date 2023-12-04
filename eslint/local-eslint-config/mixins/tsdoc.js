// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

module.exports = {
  extends: ['@rushstack/eslint-config/mixins/tsdoc'],
  plugins: ['eslint-plugin-jsdoc'],

  overrides: [
    {
      // Declare an override that applies to TypeScript files only
      files: ['*.ts', '*.tsx'],

      // New rules and changes to existing rules
      rules: {
        // Rationale: Ensures that parameter names in JSDoc match those in the function
        // declaration. Good to keep these in sync.
        'jsdoc/check-param-names': 'warn'
      }
    },
    {
      // For unit tests, we can be a little bit less strict.  The settings below revise the
      // defaults specified above.
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

      // New rules and changes to existing rules
      rules: {}
    }
  ]
};
