// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree, TSESLint } from '@typescript-eslint/utils';

import { parseImportSpecifierFromExpression, type IParsedImportSpecifier } from './LintUtilities';

export const MESSAGE_ID: 'error-transitive-dependency-imports' = 'error-transitive-dependency-imports';
type RuleModule = TSESLint.RuleModule<typeof MESSAGE_ID, []>;
type RuleContext = TSESLint.RuleContext<typeof MESSAGE_ID, []>;

const NODE_MODULES_PATH_SEGMENT: '/node_modules/' = '/node_modules/';

export const noTransitiveDependencyImportsRule: RuleModule = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      [MESSAGE_ID]: 'The specified import targets a transitive dependency.'
    },
    schema: [],
    docs: {
      description:
        'Prevents referencing imports that are transitive dependencies, ie. imports that are not ' +
        'direct dependencies of the package.',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    }
  },
  create: (context: RuleContext) => {
    const checkImportExpression: (importExpression: TSESTree.Expression | null) => void = (
      importExpression: TSESTree.Expression | null
    ) => {
      if (!importExpression) {
        // Can't validate, return
        return;
      }

      const importSpecifier: IParsedImportSpecifier | undefined =
        parseImportSpecifierFromExpression(importExpression);
      if (importSpecifier === undefined) {
        // Can't validate, return
        return;
      }

      // Check to see if node_modules is mentioned in the normalized import path more than once if
      // the path is relative, or if it is mentioned at all if the path is to a package.
      const { importTarget } = importSpecifier;
      const isRelative: boolean = importTarget.startsWith('.');
      let nodeModulesIndex: number = importTarget.indexOf(NODE_MODULES_PATH_SEGMENT);
      if (nodeModulesIndex >= 0 && isRelative) {
        // We allow relative paths to node_modules one layer deep to deal with bypassing exports
        nodeModulesIndex = importTarget.indexOf(
          NODE_MODULES_PATH_SEGMENT,
          nodeModulesIndex + NODE_MODULES_PATH_SEGMENT.length - 1
        );
      }
      if (nodeModulesIndex >= 0) {
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
