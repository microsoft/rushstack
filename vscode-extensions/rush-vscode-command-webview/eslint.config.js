// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const webAppProfile = require('local-web-rig/profiles/app/includes/eslint/flat/profile/web-app');
const friendlyLocalsMixin = require('local-web-rig/profiles/app/includes/eslint/flat/mixins/friendly-locals');

module.exports = [
  ...webAppProfile,
  ...friendlyLocalsMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
