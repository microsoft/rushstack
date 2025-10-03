// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree, TSESLint } from '@typescript-eslint/utils';

import {
  parseImportSpecifierFromExpression,
  serializeImportSpecifier,
  type IParsedImportSpecifier
} from './LintUtilities';

export const MESSAGE_ID: 'no-backslash-imports' = 'no-backslash-imports';
type RuleModule = TSESLint.RuleModule<typeof MESSAGE_ID, []>;
type RuleContext = TSESLint.RuleContext<typeof MESSAGE_ID, []>;

export const noBackslashImportsRule: RuleModule = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      [MESSAGE_ID]: 'The specified import target path contains backslashes.'
    },
    schema: [],
    docs: {
      description: 'Prevents imports using paths that use backslashes',
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
      if (importSpecifier === undefined) {
        // Can't validate, return
        return;
      }

      // Check if the import path contains backslashes. If it does, suggest a fix to replace them with forward
      // slashes.
      const { importTarget } = importSpecifier;
      if (importTarget.includes('\\')) {
        context.report({
          node: importExpression,
          messageId: MESSAGE_ID,
          fix: (fixer: TSESLint.RuleFixer) => {
            const normalizedSpecifier: IParsedImportSpecifier = {
              ...importSpecifier,
              importTarget: importTarget.replace(/\\/g, '/')
            };
            return fixer.replaceText(importExpression, `'${serializeImportSpecifier(normalizedSpecifier)}'`);
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
