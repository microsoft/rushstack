// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TSESLint } from '@typescript-eslint/experimental-utils';
import { mechanics } from './mechanics';
import { circularDeps } from './circular-deps';

interface IPlugin {
  rules: { [ruleName: string]: TSESLint.RuleModule<string, unknown[]> };
}

const plugin: IPlugin = {
  rules: {
    // Full name: "@rushstack/packlets/mechanics"
    mechanics: mechanics,
    // Full name: "@rushstack/packlets/circular-deps"
    'circular-deps': circularDeps
  }
};

export = plugin;
