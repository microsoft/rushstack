// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin enables linting of package.json files to ensure consistent property ordering
// and sorted dependency collections. It uses eslint-plugin-package-json under the hood.
// For more information please see the README.md for @rushstack/eslint-config.
//
// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

const packageJsonPlugin = require('eslint-plugin-package-json');
const jsoncParser = require('jsonc-eslint-parser');

module.exports = [
  {
    files: ['**/package.json'],
    languageOptions: {
      parser: jsoncParser
    },
    plugins: {
      'package-json': packageJsonPlugin
    },
    rules: {
      'package-json/order-properties': 'warn',
      'package-json/sort-collections': 'warn'
    }
  }
];
