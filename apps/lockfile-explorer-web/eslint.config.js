// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const webAppProfile = require('local-web-rig/profiles/app/includes/eslint/flat/profile/web-app');
const reactMixin = require('local-web-rig/profiles/app/includes/eslint/flat/mixins/react');
const packletsMixin = require('local-web-rig/profiles/app/includes/eslint/flat/mixins/packlets');

module.exports = [
  ...webAppProfile,
  ...reactMixin,
  packletsMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
