// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin enables linting of package.json files to ensure consistent property ordering.
// For more information please see the README.md for @rushstack/eslint-config.
module.exports = {
  plugins: ['@rushstack/eslint-plugin'],

  overrides: [
    {
      files: ['package.json'],
      processor: '@rushstack/sort-package-json'
    }
  ]
};
