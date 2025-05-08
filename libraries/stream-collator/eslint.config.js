// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const nodeProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');

module.exports = [
  ...nodeProfile,
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
