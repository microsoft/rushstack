// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree, TSESLint } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

type MessageIds = 'error-usage-of-null';
type Options = [];

const noNullRule: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      'error-usage-of-null':
        'Usage of "null" is deprecated except when received from legacy APIs; use "undefined" instead'
    },
    schema: [],
    docs: {
      description: 'Prevent usage of JavaScript\'s "null" keyword',
      recommended: 'recommended',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    } as TSESLint.RuleMetaDataDocs
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    return {
      Literal: function (node: TSESTree.Literal) {
        // Is it a "null" literal?
        if (node.value === null) {
          // Does the "null" appear in a comparison such as "if (x === null)"?
          if (node.parent && node.parent.type === AST_NODE_TYPES.BinaryExpression) {
            const operator: string = node.parent.operator;
            if (operator === '!==' || operator === '===' || operator === '!=' || operator === '==') {
              return;
            }
          }

          // Is this "Object.create(null)"?  This is the correct pattern for creating
          // a dictionary object that does not inherit members from the Object prototype.
          if (
            node.parent &&
            node.parent.type === AST_NODE_TYPES.CallExpression &&
            node.parent.arguments[0] === node &&
            node.parent.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.parent.callee.object.type === AST_NODE_TYPES.Identifier &&
            node.parent.callee.object.name === 'Object' &&
            node.parent.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.parent.callee.property.name === 'create'
          ) {
            return;
          }

          context.report({ node, messageId: 'error-usage-of-null' });
        }
      }
    };
  }
};

export { noNullRule };
