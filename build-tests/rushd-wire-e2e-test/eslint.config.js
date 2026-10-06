// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

require('local-node-rig/profiles/default/includes/eslint/flat/patch/eslint-bulk-suppressions');

const nodeProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');
const tsdocMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/tsdoc');
const strictCodegenMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/strict-codegen');

module.exports = [
  ...nodeProfile,
  ...friendlyLocalsMixin,
  ...tsdocMixin,
  // IMPORTANT: The strict-codegen mixin must remain last so its rules win conflicts.
  ...strictCodegenMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
