// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const webAppProfile = require('local-eslint-config/flat/profile/web-app');
const reactMixin = require('local-eslint-config/flat/mixins/react');

module.exports = [
  ...webAppProfile,
  ...reactMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
