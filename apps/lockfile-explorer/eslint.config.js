// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const nodeProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node');

module.exports = defineConfig([
  ...nodeProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
]);
