// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TSESLint } from '@typescript-eslint/experimental-utils';

import { noNullRule } from './no-null';

interface IPlugin {
  rules: { [ruleName: string]: TSESLint.RuleModule<string, unknown[]> };
}

const plugin: IPlugin = {
  rules: {
    // NOTE: The actual ESLint rule name will be "@rushstack/no-null".
    'no-null': noNullRule
  }
};

export = plugin;
