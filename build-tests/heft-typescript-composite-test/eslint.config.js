// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const webAppProfile = require('local-eslint-config/flat/profile/web-app');

module.exports = [
  ...webAppProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig-eslint.json'
      }
    },
    rules: {
      // This project uses TypeScript composite mode with moduleResolution: "node",
      // which doesn't support rewriteRelativeImportExtensions or allowImportingTsExtensions
      'import/extensions': 'off'
    }
  }
];
