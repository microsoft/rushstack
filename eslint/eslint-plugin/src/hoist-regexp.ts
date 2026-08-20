// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

type MessageIds = 'hoist-regexp';
type Options = [];

const FUNCTION_NODE_TYPES: ReadonlySet<AST_NODE_TYPES> = new Set([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression
]);

const LOOP_NODE_TYPES: ReadonlySet<AST_NODE_TYPES> = new Set([
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.WhileStatement
]);

function isRepeatedScope(node: TSESTree.Node): boolean {
  for (let current: TSESTree.Node | undefined = node.parent; current; current = current.parent) {
    if (FUNCTION_NODE_TYPES.has(current.type) || LOOP_NODE_TYPES.has(current.type)) {
      return true;
    }
  }

  return false;
}

function isRegExpConstructor(node: TSESTree.CallExpression | TSESTree.NewExpression): boolean {
  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'RegExp';
}

function isStaticArgument(node: TSESTree.CallExpressionArgument): boolean {
  return (
    node.type === AST_NODE_TYPES.Literal ||
    (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0)
  );
}

function isStaticRegExpConstructor(node: TSESTree.CallExpression | TSESTree.NewExpression): boolean {
  return (
    isRegExpConstructor(node) &&
    node.arguments.length <= 2 &&
    node.arguments.every(
      (argument: TSESTree.CallExpressionArgument): boolean =>
        argument.type !== AST_NODE_TYPES.SpreadElement && isStaticArgument(argument)
    )
  );
}

function isPartOfStaticRegExpConstructor(node: TSESTree.Literal): boolean {
  const parent: TSESTree.Node | undefined = node.parent;
  return (
    parent !== undefined &&
    (parent.type === AST_NODE_TYPES.CallExpression || parent.type === AST_NODE_TYPES.NewExpression) &&
    isStaticRegExpConstructor(parent)
  );
}

const hoistRegExpRule: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    messages: {
      'hoist-regexp':
        'Hoist this static regular expression to module scope so it is not recreated in a loop or function.'
    },
    schema: [],
    docs: {
      description:
        'Require static regular expressions in loops and functions to be hoisted to module scope.',
      recommended: 'recommended',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    } as TSESLint.RuleMetaDataDocs
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => ({
    Literal: (node: TSESTree.Literal): void => {
      if (node.regex && isRepeatedScope(node) && !isPartOfStaticRegExpConstructor(node)) {
        context.report({ node, messageId: 'hoist-regexp' });
      }
    },
    CallExpression: (node: TSESTree.CallExpression): void => {
      if (isRepeatedScope(node) && isStaticRegExpConstructor(node)) {
        context.report({ node, messageId: 'hoist-regexp' });
      }
    },
    NewExpression: (node: TSESTree.NewExpression): void => {
      if (isRepeatedScope(node) && isStaticRegExpConstructor(node)) {
        context.report({ node, messageId: 'hoist-regexp' });
      }
    }
  })
};

export { hoistRegExpRule };
