// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const nodeTrustedToolProfile = require('@rushstack/eslint-config/flat/profile/node');

module.exports = defineConfig([
  ...nodeTrustedToolProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
]);
