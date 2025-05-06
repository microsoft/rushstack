// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const nodeTrustedToolProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node-trusted-tool');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');

module.exports = defineConfig([
  ...nodeTrustedToolProfile,
  ...friendlyLocalsMixin,
  {
    ignores: ['out', 'dist', '**/*.d.ts']
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
]);
