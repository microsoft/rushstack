// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin enables linting of package.json files to ensure consistent property ordering.
// For more information please see the README.md for @rushstack/eslint-config.
//
// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

const rushstackEslintPlugin = require('@rushstack/eslint-plugin');

module.exports = [
  {
    files: ['**/package.json'],
    plugins: {
      '@rushstack': rushstackEslintPlugin
    },
    processor: '@rushstack/sort-package-json'
  }
];
