// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { AST_NODE_TYPES } from '@typescript-eslint/experimental-utils';

import { matchTree } from './matchTree';
import * as hoistJestMockPatterns from './hoistJestMockPatterns';

type MessageIds = 'error-unhoisted-jest-mock';
type Options = [];

// Jest APIs that need to be hoisted
// Based on HOIST_METHODS from ts-jest
const HOIST_METHODS = ['mock', 'unmock', 'enableAutomock', 'disableAutomock', 'deepUnmock'];

const hoistJestMock: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    messages: {
      'error-unhoisted-jest-mock':
        "Jest's module mocking APIs must be called before their associated module is imported. " +
        ' Move this statement to the top of its code block.'
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description:
        'Require Jest module mocking APIs to be called before any other statements in their code block.' +
        ' Jest module mocking APIs such as "jest.mock(\'./example\')" must be called before the associated module' +
        ' is imported, otherwise they will have no effect. Transpilers such as ts-jest and babel-jest automatically' +
        ' "hoist" these calls, however this can produce counterintuitive results. Instead, the hoist-jest-mocks' +
        ' lint rule requires developers to manually hoist these calls. For technical background, please read the' +
        ' Jest documentation here: https://jestjs.io/docs/en/es6-class-mocks',
      category: 'Possible Errors',
      recommended: 'error',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    }
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    function isHoistableJestCall(node: TSESTree.Node | undefined): boolean {
      if (node === undefined) {
        return false;
      }

      const captures: hoistJestMockPatterns.IJestCallExpression = {};

      if (matchTree(node, hoistJestMockPatterns.jestCallExpression, captures)) {
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

    function isHoistableJestStatement(node: TSESTree.Node): boolean {
      switch (node.type) {
        case AST_NODE_TYPES.ExpressionStatement:
          return isHoistableJestCall(node.expression);
      }
      return false;
    }

    return {
      'TSModuleBlock, BlockStatement, Program': (
        node: TSESTree.TSModuleBlock | TSESTree.BlockStatement | TSESTree.Program
      ): void => {
        let encounteredRegularStatements: boolean = false;

        for (const statement of node.body) {
          if (isHoistableJestStatement(statement)) {
            // Are we still at the start of the block?
            if (encounteredRegularStatements) {
              context.report({ node: statement, messageId: 'error-unhoisted-jest-mock' });
            }
          } else {
            // We encountered a non-hoistable statement, so any further children that we visit
            // must also be non-hoistable
            encounteredRegularStatements = true;
          }
        }
      }
    };
  }
};

export { hoistJestMock };
