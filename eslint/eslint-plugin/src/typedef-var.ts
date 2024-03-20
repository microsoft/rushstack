// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

type MessageIds = 'expected-typedef' | 'expected-typedef-named';
type Options = [];

const typedefVar: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      'expected-typedef-named': 'Expected a type annotation.',
      'expected-typedef': 'Expected {{name}} to have a type annotation.'
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description:
        'Supplements the "@typescript-eslint/typedef" rule by relaxing the requirements for local variables',
      recommended: 'recommended',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    } as TSESLint.RuleMetaDataDocs
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    // This rule implements the variableDeclarationIgnoreFunction=true behavior from
    // @typescript-eslint/typedef
    function isVariableDeclarationIgnoreFunction(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression
      );
    }

    function getNodeName(node: TSESTree.Parameter | TSESTree.PropertyName): string | undefined {
      return node.type === AST_NODE_TYPES.Identifier ? node.name : undefined;
    }

    return {
      VariableDeclarator(node: TSESTree.VariableDeclarator): void {
        if (node.id.typeAnnotation) {
          // An explicit type declaration was provided
          return;
        }

        if (
          node.init?.type === AST_NODE_TYPES.TSAsExpression &&
          node.init.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
          node.init.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
          node.init.typeAnnotation.typeName.name === 'const'
        ) {
          // An `as const` type declaration was provided
          return;
        }

        // These are @typescript-eslint/typedef exemptions
        if (
          node.id.type === AST_NODE_TYPES.ArrayPattern /* ArrayDestructuring */ ||
          node.id.type === AST_NODE_TYPES.ObjectPattern /* ObjectDestructuring */ ||
          (node.init && isVariableDeclarationIgnoreFunction(node.init))
        ) {
          return;
        }

        // Ignore this case:
        //
        //   for (const NODE of thing) { }
        let current: TSESTree.Node | undefined = node.parent;
        while (current) {
          switch (current.type) {
            case AST_NODE_TYPES.VariableDeclaration:
              // Keep looking upwards
              current = current.parent;
              break;
            case AST_NODE_TYPES.ForOfStatement:
            case AST_NODE_TYPES.ForInStatement:
              // Stop traversing and don't report an error
              return;
            default:
              // Stop traversing
              current = undefined;
              break;
          }
        }

        // Is it a local variable?
        current = node.parent;
        while (current) {
          switch (current.type) {
            // function f() {
            //   const NODE = 123;
            // }
            case AST_NODE_TYPES.FunctionDeclaration:

            // class C {
            //   public m(): void {
            //     const NODE = 123;
            //   }
            // }
            // eslint-disable-next-line no-fallthrough
            case AST_NODE_TYPES.MethodDefinition:

            // let f = function() {
            //   const NODE = 123;
            // }
            // eslint-disable-next-line no-fallthrough
            case AST_NODE_TYPES.FunctionExpression:

            // let f = () => {
            //   const NODE = 123;
            // }
            // eslint-disable-next-line no-fallthrough
            case AST_NODE_TYPES.ArrowFunctionExpression:
              // Stop traversing and don't report an error
              return;
          }

          current = current.parent;
        }

        const nodeName: string | undefined = getNodeName(node.id);
        if (nodeName) {
          context.report({
            node,
            messageId: 'expected-typedef-named',
            data: { name: nodeName }
          });
        } else {
          context.report({
            node,
            messageId: 'expected-typedef'
          });
        }
      }
    };
  }
};

export { typedefVar };
