// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

require('local-eslint-config/flat/patch/eslint-bulk-suppressions');

const webAppProfile = require('local-eslint-config/flat/profile/web-app');

module.exports = [
  ...webAppProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig-eslint.json'
      }
    }
  }
];
