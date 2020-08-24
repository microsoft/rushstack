// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TSESLint } from '@typescript-eslint/experimental-utils';

import { hoistJestMock } from './hoist-jest-mock';
import { noNewNullRule } from './no-new-null';
import { noNullRule } from './no-null';
import { noUntypedUnderscoreRule } from './no-untyped-underscore';

interface IPlugin {
  rules: { [ruleName: string]: TSESLint.RuleModule<string, unknown[]> };
}

const plugin: IPlugin = {
  rules: {
    // Full name: "@rushstack/hoist-jest-mock"
    'hoist-jest-mock': hoistJestMock,

    // Full name: "@rushstack/no-new-null"
    'no-new-null': noNewNullRule,

    // Full name: "@rushstack/no-null"
    'no-null': noNullRule,

    // Full name: "@rushstack/no-untyped-underscore"
    'no-untyped-underscore': noUntypedUnderscoreRule
  }
};

export = plugin;
