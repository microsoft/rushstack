// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

require('local-web-rig/profiles/app/includes/eslint/flat/patch/eslint-bulk-suppressions');

const webAppProfile = require('local-web-rig/profiles/app/includes/eslint/flat/profile/web-app');

module.exports = [
  ...webAppProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
