// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import * as hoistJestMockPatterns from './hoistJestMockPatterns';

type MessageIds = 'error-unhoisted-jest-mock';
type Options = [];

// Jest APIs that need to be hoisted
// Based on HOIST_METHODS from ts-jest
const HOIST_METHODS: string[] = ['mock', 'unmock', 'enableAutomock', 'disableAutomock', 'deepUnmock'];

const hoistJestMock: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    fixable: 'code',
    messages: {
      'error-unhoisted-jest-mock':
        "Jest's module mocking APIs must be called before regular imports. Move this call so that it precedes" +
        ' the import found on line {{importLine}}.'
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description:
        'Require Jest module mocking APIs to be called before other modules are imported.' +
        ' Jest module mocking APIs such as "jest.mock(\'./example\')" must be called before the associated module' +
        ' is imported, otherwise they will have no effect. Transpilers such as ts-jest and babel-jest automatically' +
        ' "hoist" these calls, however this can produce counterintuitive results. Instead, the hoist-jest-mocks' +
        ' lint rule requires developers to manually hoist these calls. For technical background, please read the' +
        ' Jest documentation here: https://jestjs.io/docs/en/es6-class-mocks',
      recommended: 'recommended',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    } as TSESLint.RuleMetaDataDocs
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    // Returns true for a statement such as "jest.mock()" that needs to precede
    // module imports (i.e. be "hoisted").
    function isHoistableJestCall(node: TSESTree.Node | undefined): boolean {
      if (node === undefined) {
        return false;
      }

      const captures: hoistJestMockPatterns.IJestCallExpression = {};

      if (hoistJestMockPatterns.jestCallExpression.match(node, captures)) {
        if (captures.methodName && HOIST_METHODS.indexOf(captures.methodName) >= 0) {
          return true;
        }
      }

      // Recurse into some common expression-combining syntaxes
      switch (node.type) {
        case AST_NODE_TYPES.CallExpression:
          return isHoistableJestCall(node.callee);
        case AST_NODE_TYPES.MemberExpression:
          return isHoistableJestCall(node.object);
        case AST_NODE_TYPES.LogicalExpression:
          return isHoistableJestCall(node.left) || isHoistableJestCall(node.right);
      }

      return false;
    }

    // Given part of an expression, walk upwards in the tree and find the containing statement
    function findOuterStatement(node: TSESTree.Node): TSESTree.Node {
      let current: TSESTree.Node | undefined = node;
      while (current.parent) {
        switch (current.parent.type) {
          // Statements are always found inside a block:
          case AST_NODE_TYPES.Program:
          case AST_NODE_TYPES.BlockStatement:
          case AST_NODE_TYPES.TSModuleBlock:
            return current;
        }
        current = current.parent;
      }
      return node;
    }

    // This tracks the first require() or import expression that we found in the file.
    let firstImportNode: TSESTree.Node | undefined = undefined;
    // track if import node has variable declaration
    let hasVariableDeclaration: boolean = false;

    // Avoid reporting more than one error for a given statement.
    // Example: jest.mock('a').mock('b');
    const reportedStatements: Set<TSESTree.Node> = new Set();

    return {
      CallExpression: (node: TSESTree.CallExpression): void => {
        if (firstImportNode === undefined) {
          // EXAMPLE:  const x = require('x')
          if (hoistJestMockPatterns.requireCallExpression.match(node)) {
            // Check if this require is inside a jest.mock factory function
            let currentNode: TSESTree.Node | undefined = node;
            let isInJestMockFactory = false;

            while (currentNode?.parent) {
              if (
                currentNode.parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
                currentNode.parent.parent?.type === AST_NODE_TYPES.CallExpression &&
                isHoistableJestCall(currentNode.parent.parent)
              ) {
                isInJestMockFactory = true;
                break;
              }
              currentNode = currentNode.parent;
            }

            // Only set firstImportNode if not in a factory function
            if (!isInJestMockFactory) {
              firstImportNode = node;
            }
          }
        }

        if (firstImportNode) {
          // EXAMPLE:  jest.mock()
          if (isHoistableJestCall(node)) {
            const outerStatement: TSESTree.Node = findOuterStatement(node);
            if (!reportedStatements.has(outerStatement)) {
              reportedStatements.add(outerStatement);
              context.report({
                node,
                messageId: 'error-unhoisted-jest-mock',
                data: { importLine: firstImportNode.loc.start.line },
                fix: (fixer: TSESLint.RuleFixer) => {
                  // Ensure firstImportNode is defined before attempting fix
                  if (!firstImportNode) {
                    return null;
                  }

                  const sourceCode: TSESLint.SourceCode = context.getSourceCode();
                  const statementText: string = sourceCode.getText(outerStatement);

                  // Check if this import is inside a jest.mock factory function
                  let currentNode: TSESTree.Node | undefined = firstImportNode;
                  let isInJestMockFactory = false;

                  while (currentNode?.parent) {
                    if (
                      currentNode.parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
                      currentNode.parent.parent?.type === AST_NODE_TYPES.CallExpression &&
                      isHoistableJestCall(currentNode.parent.parent)
                    ) {
                      isInJestMockFactory = true;
                      break;
                    }
                    currentNode = currentNode.parent;
                  }

                  // If the import is inside a jest.mock factory, don't consider it for hoisting
                  if (isInJestMockFactory) {
                    return null;
                  }

                  // Remove the statement from its current position
                  const removeOriginal: TSESLint.RuleFix = fixer.removeRange([
                    outerStatement.range[0] - 1, // Include the previous line's newline character
                    outerStatement.range[1]
                  ]);

                  const importExpr = firstImportNode;
                  let nodeToInsertBefore = importExpr;

                  // Check if the import is part of a variable declaration
                  if (
                    importExpr.parent &&
                    importExpr.parent.type === 'VariableDeclarator' &&
                    importExpr.parent.parent &&
                    importExpr.parent.parent.type === 'VariableDeclaration'
                  ) {
                    nodeToInsertBefore = importExpr.parent.parent;
                  }

                  // Insert it before the first import
                  const addBeforeImport: TSESLint.RuleFix = fixer.insertTextBefore(
                    nodeToInsertBefore,
                    statementText + '\n'
                  );

                  return [removeOriginal, addBeforeImport];
                }
              });
            }
          }
        }
      },

      ImportExpression: (node: TSESTree.ImportExpression): void => {
        if (firstImportNode === undefined) {
          // EXAMPLE:  const x = import('x');
          if (hoistJestMockPatterns.importExpression.match(node)) {
            firstImportNode = node;
          }
        }
      },

      ImportDeclaration: (node: TSESTree.ImportDeclaration): void => {
        if (firstImportNode === undefined) {
          // EXAMPLE:  import { X } from "Y";
          // IGNORE:   import type { X } from "Y";
          if (node.importKind !== 'type') {
            firstImportNode = node;
          }
        }
      },

      ExportDeclaration: (node: TSESTree.ExportDeclaration): void => {
        if (firstImportNode === undefined) {
          // EXAMPLE: export * from "Y";
          // IGNORE:  export type { Y } from "Y";
          if ((node as unknown as TSESTree.ExportNamedDeclaration).exportKind !== 'type') {
            firstImportNode = node;
          }
        }
      },

      TSImportEqualsDeclaration: (node: TSESTree.TSImportEqualsDeclaration): void => {
        if (firstImportNode === undefined) {
          // EXAMPLE:  import x = require("x");
          firstImportNode = node;
        }
      }
    };
  }
};

export { hoistJestMock };
