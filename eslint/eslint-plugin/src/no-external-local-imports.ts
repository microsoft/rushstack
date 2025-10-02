// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { TSESTree, TSESLint } from '@typescript-eslint/utils';
import { getRootDirectoryFromContext, getImportAbsolutePathFromExpression } from './LintUtilities';

export const MESSAGE_ID: 'error-external-local-imports' = 'error-external-local-imports';
type RuleModule = TSESLint.RuleModule<typeof MESSAGE_ID, []>;
type RuleContext = TSESLint.RuleContext<typeof MESSAGE_ID, []>;

const _relativePathRegex: RegExp = /^[.\/\\]+$/;

export const noExternalLocalImportsRule: RuleModule = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      [MESSAGE_ID]:
        'The specified import target is not under the root directory. Ensure that ' +
        'all local import targets are either under the "rootDir" specified in your tsconfig.json (if one ' +
        'exists) or under the package directory.'
    },
    schema: [],
    docs: {
      description:
        'Prevents referencing relative imports that are either not under the "rootDir" specified in ' +
        'the tsconfig.json (if one exists) or not under the package directory.',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    }
  },
  create: (context: RuleContext) => {
    const rootDirectory: string | undefined = getRootDirectoryFromContext(context);
    const checkImportExpression: (importExpression: TSESTree.Expression | null) => void = (
      importExpression: TSESTree.Expression | null
    ) => {
      if (!importExpression || !rootDirectory) {
        // Can't validate, return
        return;
      }

      // Get the relative path between the target and the root. If the target is under the root, then the resulting
      // relative path should be a series of "../" segments.
      const importAbsolutePath: string | undefined = getImportAbsolutePathFromExpression(
        context,
        importExpression
      );
      if (!importAbsolutePath) {
        // Can't validate, return
        return;
      }

      const relativePathToRoot: string = path.relative(importAbsolutePath, rootDirectory);
      if (!_relativePathRegex.test(relativePathToRoot)) {
        context.report({ node: importExpression, messageId: MESSAGE_ID });
      }
    };

    return {
      ImportDeclaration: (node: TSESTree.ImportDeclaration) => checkImportExpression(node.source),
      ImportExpression: (node: TSESTree.ImportExpression) => checkImportExpression(node.source),
      ExportAllDeclaration: (node: TSESTree.ExportAllDeclaration) => checkImportExpression(node.source),
      ExportNamedDeclaration: (node: TSESTree.ExportNamedDeclaration) => checkImportExpression(node.source)
    };
  }
};
