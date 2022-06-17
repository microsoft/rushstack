// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin implements the "packlet" formalism for organizing source files.
// For more information, see the documentation here:
// https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets
module.exports = {
  plugins: ['@rushstack/eslint-plugin-packlets'],

  overrides: [
    {
      // Declare an override that applies to TypeScript files only
      files: ['*.ts', '*.tsx'],

      rules: {
        '@rushstack/packlets/mechanics': 'warn',
        '@rushstack/packlets/circular-deps': 'warn'
      }
    }
  ]
};
