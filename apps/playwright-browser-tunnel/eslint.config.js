// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const nodeTrustedToolProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node-trusted-tool');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');

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
  {
    // The Playwright config and test files are not part of the project's TypeScript program (they are excluded
    // from tsconfig.json), so disable type-aware parsing and the profile's type-aware rules and lint them with
    // only the non-type-aware rules.
    // TODO: Replace this with the `@rushstack/eslint-config` `without-type-information` helper once that package
    // is published and consumed by the node rigs.
    files: ['playwright.config.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: false,
        projectService: false
      }
    },
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-for-in-array': 'off'
    }
  }
];
