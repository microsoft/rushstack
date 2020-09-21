// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

module.exports = {
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
