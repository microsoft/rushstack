// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint } from '@typescript-eslint/utils';

import { noUnsafeRegExp } from './no-unsafe-regexp.ts';

interface IPlugin {
  rules: { [ruleName: string]: TSESLint.RuleModule<string, unknown[]> };
}

const plugin: IPlugin = {
  rules: {
    // Full name: "@rushstack/security/no-unsafe-regexp"
    'no-unsafe-regexp': noUnsafeRegExp
  }
};

export = plugin;
