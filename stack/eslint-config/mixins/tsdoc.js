// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin validates code comments to ensure that they follow the TSDoc standard.  For more
// information please see the README.md for @rushstack/eslint-config.
module.exports = {
  // The plugin documentation is here: https://www.npmjs.com/package/eslint-plugin-tsdoc
  plugins: ['eslint-plugin-tsdoc'],

  overrides: [
    {
      // Declare an override that applies to TypeScript files only
      files: ['*.ts', '*.tsx'],

      rules: {
        'tsdoc/syntax': 'warn'
      }
    }
  ]
};
