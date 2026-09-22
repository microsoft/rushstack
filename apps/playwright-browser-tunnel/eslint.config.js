// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

require('local-node-rig/profiles/default/includes/eslint/flat/patch/eslint-bulk-suppressions');

const nodeTrustedToolProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node-trusted-tool');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');
const {
  withoutTypeInformation
} = require('local-node-rig/profiles/default/includes/eslint/flat/without-type-information');

module.exports = [
  ...nodeTrustedToolProfile,
  ...friendlyLocalsMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  },
  // The Playwright config and test files are not part of the project's TypeScript program (they are excluded
  // from tsconfig.json), so lint them with only the non-type-aware rules.
  ...withoutTypeInformation({ files: ['playwright.config.ts', 'tests/**/*.ts'] })
];
