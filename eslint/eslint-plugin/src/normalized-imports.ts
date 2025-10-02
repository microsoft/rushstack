// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { TSESTree, TSESLint } from '@typescript-eslint/utils';
import {
  getFilePathFromContext,
  parseImportSpecifierFromExpression,
  serializeImportSpecifier,
  type IParsedImportSpecifier
} from './LintUtilities';

export const MESSAGE_ID: 'error-normalized-imports' = 'error-normalized-imports';
type RuleModule = TSESLint.RuleModule<typeof MESSAGE_ID, []>;
type RuleContext = TSESLint.RuleContext<typeof MESSAGE_ID, []>;

export const normalizedImportsRule: RuleModule = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    messages: {
      [MESSAGE_ID]: 'The specified import target path was not provided in a normalized form.'
    },
    schema: [],
    docs: {
      description:
        'Prevents and normalizes references to relative imports using paths that make unnecessary ' +
        'traversals (ex. "../blah/module" in directory "blah" -> "./module")',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    },
    fixable: 'code'
  },
  create: (context: RuleContext) => {
    const checkImportExpression: (importExpression: TSESTree.Expression | null) => void = (
      importExpression: TSESTree.Expression | null
    ) => {
      if (!importExpression) {
        // Can't validate, return
        return;
      }

      // Determine the target file path and find the most direct relative path from the source file
      const importSpecifier: IParsedImportSpecifier | undefined =
        parseImportSpecifierFromExpression(importExpression);
      if (!importSpecifier || !importSpecifier.importTarget.startsWith('.')) {
        // Can't validate, return
        return;
      }
      const { importTarget } = importSpecifier;
      const parentDirectory: string = path.dirname(getFilePathFromContext(context));
      const absoluteImportPath: string = path.resolve(parentDirectory, importTarget);
      const relativeImportPath: string = path.relative(parentDirectory, absoluteImportPath);

      // Reconstruct the import target using posix separators and manually re-add the leading './' if needed
      let normalizedImportPath: string =
        path.sep !== '/' ? relativeImportPath.replace(/\\/g, '/') : relativeImportPath;
      if (!normalizedImportPath.startsWith('.')) {
        normalizedImportPath = `.${normalizedImportPath ? '/' : ''}${normalizedImportPath}`;
      }

      // If they don't match, suggest the normalized path as a fix
      if (importTarget !== normalizedImportPath) {
        context.report({
          node: importExpression,
          messageId: MESSAGE_ID,
          fix: (fixer: TSESLint.RuleFixer) => {
            // Re-include stripped loader and query strings, if provided
            const normalizedSpecifier: string = serializeImportSpecifier({
              ...importSpecifier,
              importTarget: normalizedImportPath
            });
            return fixer.replaceText(importExpression, `'${normalizedSpecifier}'`);
          }
        });
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
