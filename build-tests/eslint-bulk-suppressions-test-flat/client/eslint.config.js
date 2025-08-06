// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

require('local-node-rig/profiles/default/includes/eslint/flat/patch/eslint-bulk-suppressions');

const typescriptEslintParser = require('@typescript-eslint/parser');
const nodeTrustedToolProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node-trusted-tool');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');

module.exports = [
  {
    ignores: ['.eslintrc.js']
  },
  ...nodeTrustedToolProfile,
  ...friendlyLocalsMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        project: '../tsconfig.json',
        tsconfigRootDir: __dirname
      }
    }
  }
];
