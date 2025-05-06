// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const webAppProfile = require('local-eslint-config/flat/profile/web-app');

module.exports = defineConfig([
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
]);
