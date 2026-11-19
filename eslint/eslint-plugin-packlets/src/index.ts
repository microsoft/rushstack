// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ESLint } from 'eslint';
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

// The rule modules are authored with typescript-eslint's types, whose `RuleModule` is intentionally not
// structurally assignable to ESLint's `RuleDefinition`. Widen through `object` (rather than `unknown`) to
// present the plugin as an `ESLint.Plugin` so that consumers (such as flat-config `plugins` maps) can
// reference it without a cast of their own.
export = plugin as object as ESLint.Plugin;
