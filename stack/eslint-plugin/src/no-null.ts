// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  TSESTree,
  TSESLint
} from '@typescript-eslint/experimental-utils';

type MessageIds = 'error-usage-of-null';
type Options = [ ];

const noNullRule: TSESLint.RuleModule<MessageIds,Options> = {
  meta: {
    type: 'problem',
    messages: {
      'error-usage-of-null':
        'Usage of "null" is deprecated except when received from legacy APIs; use "undefined" instead'
    },
    schema: [ ],
    docs: {
      description: 'Prevent usage of JavaScript\'s "null" keyword',
      category: 'Stylistic Issues',
      recommended: "error",
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    }
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    return {
      Literal: function(node: TSESTree.Literal) {
        // Is it a "null" literal?
        if (node.value === null) {

          // Does the "null" appear in a comparison such as "if (x === null)"?
          let isComparison: boolean = false;
          if (node.parent && node.parent.type === 'BinaryExpression') {
            const operator: string = node.parent.operator;
            isComparison = operator === '!==' || operator === '===';
          }

          if (!isComparison) {
            context.report({ node, messageId: 'error-usage-of-null' });
          }
        }
      }
    };
  }
};

export { noNullRule };
