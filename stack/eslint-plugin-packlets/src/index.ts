// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TSESLint } from '@typescript-eslint/experimental-utils';

interface IPlugin {
  rules: { [ruleName: string]: TSESLint.RuleModule<string, unknown[]> };
}

const plugin: IPlugin = {
  rules: {}
};

export = plugin;
