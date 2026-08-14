// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

require('local-node-rig/profiles/default/includes/eslint/flat/patch/eslint-bulk-suppressions');

const nodeProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node');

module.exports = [
  ...nodeProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
