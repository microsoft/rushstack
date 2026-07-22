// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const nodeProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');
const tsdocMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/tsdoc');

module.exports = [
  ...nodeProfile,
  ...friendlyLocalsMixin,
  ...tsdocMixin,
  {
    files: ['src/dashboard/**/*.ts'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        URL: 'readonly',
        URLSearchParams: 'readonly',
        WebSocket: 'readonly',
        document: 'readonly',
        history: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        requestAnimationFrame: 'readonly',
        self: 'readonly',
        window: 'readonly'
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
