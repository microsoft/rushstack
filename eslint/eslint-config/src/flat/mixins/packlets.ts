// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin implements the "packlet" formalism for organizing source files.
// For more information, see the documentation here:
// https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets
//
// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

import type { Linter } from 'eslint';

import rushstackPackletsEslintPlugin from '@rushstack/eslint-plugin-packlets';

const config: Linter.Config = {
  files: ['**/*.ts', '**/*.tsx'],
  plugins: {
    '@rushstack/packlets': rushstackPackletsEslintPlugin
  },
  rules: {
    '@rushstack/packlets/mechanics': 'warn',
    '@rushstack/packlets/circular-deps': 'warn'
  }
};

export = config;
