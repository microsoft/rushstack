// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  TSESTree,
  TSESLint
} from '@typescript-eslint/experimental-utils';

type MessageIds = 'error-untyped-underscore';
type Options = [ ];

const noUntypedUnderscoreRule: TSESLint.RuleModule<MessageIds,Options> = {
  meta: {
    type: 'problem',
    messages: {
      'error-untyped-underscore':
        'This expression appears to access a private member "{{memberName}}"; '
        + 'either remove the underscore prefix or else declare a type for the containing object'
    },
    schema: [ ],
    docs: {
      description: 'Prevents usage of JavaScript\'s "null" keyword.',
      category: 'Stylistic Issues',
      recommended: "error",
      url: 'https://www.npmjs.com/package/@rushstack/eslint-config'
    }
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    return {
      MemberExpression: function(node: TSESTree.MemberExpression) {
        // Is it an expression like "x.y"?
        let match: boolean = true;

        // Ignore expressions such as "super.y", "this.y", and "that.y"
        const memberObject: TSESTree.LeftHandSideExpression = node.object;
        if (memberObject) {
          if (memberObject.type === 'Super' || memberObject.type === 'ThisExpression') {
            match = false;
          } else {
            if (memberObject.type === 'Identifier') {
              if (memberObject.name === 'this' || memberObject.name == 'that') {
                match = false;
              }
            }
          }
        }

        // Does the member name start with an underscore?  (e.g. "x._y")
        if (match && node.property && node.property.type === 'Identifier') {
          const memberName: string = node.property.name;
          if (memberName && memberName[0] === '_') {
            context.report({
              node,
              messageId: 'error-untyped-underscore',
              data: {
                memberName: memberName
              }
            });
          }
        }
      }
    };
  }
};

export { noUntypedUnderscoreRule };
