// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This profile enables lint rules intended for a web application.  It enables security rules
// that are relevant to web browser APIs such as DOM.
//
// Also use this profile if you are creating a library that can be consumed by both Node.js
// and web applications.

const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const webAppProfile = require('@rushstack/eslint-config/flat/profile/web-app');

const { localCommonConfig } = require('./_common');

module.exports = [
  ...webAppProfile,
  ...localCommonConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin
    },
    rules: {
      // Rationale: Importing a module with `require` cannot be optimized by webpack as effectively as
      // `import` statements.
      '@typescript-eslint/no-require-imports': 'error'
    }
  }
];
