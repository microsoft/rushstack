// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin validates code comments to ensure that they follow the TSDoc standard.  For more
// information please see the README.md for @rushstack/eslint-config.
//
// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

import type { Linter } from 'eslint';
import tsdocEslintPlugin from 'eslint-plugin-tsdoc';

const config: Linter.Config[] = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      tsdoc: tsdocEslintPlugin
    },
    rules: {
      'tsdoc/syntax': 'warn'
    }
  }
];

export = config;
