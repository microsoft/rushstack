// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin enables linting of package.json files to ensure consistent property ordering
// and sorted dependency collections. It uses eslint-plugin-package-json under the hood.
// For more information please see the README.md for @rushstack/eslint-config.
module.exports = {
  overrides: [
    {
      files: ['package.json'],
      parser: 'jsonc-eslint-parser',
      plugins: ['package-json'],
      rules: {
        'package-json/order-properties': 'warn',
        'package-json/sort-collections': 'warn'
      }
    }
  ]
};
