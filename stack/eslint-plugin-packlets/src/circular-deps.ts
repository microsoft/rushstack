// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

import type { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/experimental-utils';
import { Path } from './Path';

import { ILintError } from './PackletImportAnalyzer';

export type MessageIds = 'circular-import';
type Options = [];

const circularDeps: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    messages: { 'circular-import': '' },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description: '',
      category: 'Best Practices',
      recommended: 'warn',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets'
    }
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    return {};
  }
};

export { circularDeps };
