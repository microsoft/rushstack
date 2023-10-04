// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('local-node-rig/profiles/default/includes/eslint/patch/modern-module-resolution');
// This is a workaround for https://github.com/microsoft/rushstack/issues/3021
require('local-node-rig/profiles/default/includes/eslint/patch/custom-config-package-names');

module.exports = {
  extends: [
    'local-node-rig/profiles/default/includes/eslint/profile/node-trusted-tool',
    'local-node-rig/profiles/default/includes/eslint/mixins/friendly-locals'
  ],
  parserOptions: { tsconfigRootDir: __dirname },

  overrides: [
    /**
     * Override the parser from local-eslint-config. Since the config is coming
     * from the workspace instead of the external NPM package, the versions of ESLint
     * and TypeScript that the config consumes will be resolved from the devDependencies
     * of the config instead of from the eslint-7-test package. Overriding the parser
     * ensures that the these dependencies come from the eslint-7-test package. See:
     * https://github.com/microsoft/rushstack/issues/3021
     */
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser'
    }
  ]
};
