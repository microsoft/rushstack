// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint } from '@typescript-eslint/utils';

import { mechanics } from './mechanics';
import { circularDeps } from './circular-deps';
import { readme } from './readme';

interface IPlugin {
  rules: { [ruleName: string]: TSESLint.RuleModule<string, unknown[]> };
  configs: { [ruleName: string]: unknown };
}

const plugin: IPlugin = {
  rules: {
    // Full name: "@rushstack/packlets/mechanics"
    mechanics: mechanics,
    // Full name: "@rushstack/packlets/circular-deps"
    'circular-deps': circularDeps,
    readme: readme
  },
  configs: {
    recommended: {
      plugins: ['@rushstack/eslint-plugin-packlets'],
      rules: {
        '@rushstack/packlets/mechanics': 'warn',
        '@rushstack/packlets/circular-deps': 'warn',
        '@rushstack/packlets/readme': 'off'
      }
    }
  }
};

export = plugin;
