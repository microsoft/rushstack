// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

require('local-node-rig/profiles/default/includes/eslint/flat/patch/eslint-bulk-suppressions');
const typescriptEslintParser = require('@typescript-eslint/parser');
const nodeTrustedToolProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node-trusted-tool');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');

module.exports = [
  ...nodeTrustedToolProfile,
  ...friendlyLocalsMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      /**
       * Override the parser from @rushstack/eslint-config. Since the config is coming
       * from the workspace instead of the external NPM package, the versions of ESLint
       * and TypeScript that the config consumes will be resolved from the devDependencies
       * of the config instead of from the eslint-8-test package. Overriding the parser
       * ensures that the these dependencies come from the eslint-8-test package. See:
       * https://github.com/microsoft/rushstack/issues/3021
       */
      parser: typescriptEslintParser,
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
