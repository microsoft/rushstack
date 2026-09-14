// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ESLint } from 'eslint';
import type { TSESLint } from '@typescript-eslint/utils';

import { noUnsafeRegExp } from './no-unsafe-regexp';

interface IPlugin {
  rules: { [ruleName: string]: TSESLint.RuleModule<string, unknown[]> };
}

const plugin: IPlugin = {
  rules: {
    // Full name: "@rushstack/security/no-unsafe-regexp"
    'no-unsafe-regexp': noUnsafeRegExp
  }
};

// The rule modules are authored with typescript-eslint's types, whose `RuleModule` is intentionally not
// structurally assignable to ESLint's `RuleDefinition`. Widen through `object` (rather than `unknown`) to
// present the plugin as an `ESLint.Plugin` so that consumers (such as flat-config `plugins` maps) can
// reference it without a cast of their own.
export = plugin as object as ESLint.Plugin;
