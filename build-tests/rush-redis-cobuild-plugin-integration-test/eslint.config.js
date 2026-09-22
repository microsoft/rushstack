// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

require('local-node-rig/profiles/default/includes/eslint/flat/patch/eslint-bulk-suppressions');

const nodeProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node');

module.exports = [
  ...nodeProfile,
  // The sandbox contains checked-in fixture repositories (including bootstrap scripts) that are not source
  // code for this project and should not be linted.
  {
    ignores: ['sandbox/**']
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
