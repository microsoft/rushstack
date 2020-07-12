// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { AST_NODE_TYPES } from '@typescript-eslint/experimental-utils';

type MessageIds = 'error-new-usage-of-null';
type Options = [];

type Accessible = {
  accessibility?: TSESTree.Accessibility;
};

const noNewNullRule: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    messages: {
      'error-new-usage-of-null':
        'New usage of "null" in type definitions is deprecated; use "undefined" instead'
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description:
        'Prevent usage of JavaScript\'s "null" keyword in new type definitions. It ignores when that definition is not accessible, e.g. private or not exportable',
      category: 'Stylistic Issues',
      recommended: 'error',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    }
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    /**
     * Returns true if the accessibility is not explicitly set to private or protected, e.g. class properties, methods.
     */
    function isPubliclyAccessible(node?: Accessible): boolean {
      const accessibility = node?.accessibility;
      return !(accessibility === 'private' || accessibility === 'protected');
    }

    /**
     * Let's us check the accessibility field of certain types of nodes
     */
    function isAccessible(node?: unknown): node is Accessible {
      if (!node) {
        return false;
      }
      switch ((node as TSESTree.Node).type) {
        case AST_NODE_TYPES.MethodDefinition:
          return true;
        case AST_NODE_TYPES.ClassProperty:
          return true;
        case AST_NODE_TYPES.TSIndexSignature:
          return true;
        case AST_NODE_TYPES.TSParameterProperty:
          return true;
        default:
          return false;
      }
    }

    /**
     * Checks if the type declaration is lifted to be exportable to others
     */
    function isDefinitionExportable(node?: TSESTree.Node): boolean {
      switch (node?.type) {
        case undefined: // base case
          return false;
        case AST_NODE_TYPES.BlockStatement: // we are an inline function, scope is not exportable
          return false;
        case AST_NODE_TYPES.ExportNamedDeclaration: // our definition is being exported
          return true;
        case AST_NODE_TYPES.Program: // our definition can be exported
          return true;
        default:
          if (isAccessible(node)) {
            // only fail when class method/constructor is accessible publicly
            return isPubliclyAccessible(node);
          }
          return isDefinitionExportable(node?.parent);
      }
    }

    /**
     * Returns true if this type definition exposes a null type
     */
    function isNewNull(node?: TSESTree.Node): boolean {
      switch (node?.type) {
        case undefined:
          return false;
        case AST_NODE_TYPES.TSTypeAnnotation:
          return isDefinitionExportable(node.parent);
        case AST_NODE_TYPES.TSTypeAliasDeclaration:
          return isDefinitionExportable(node.parent);
        default:
          return isNewNull(node?.parent);
      }
    }

    return {
      TSNullKeyword(node): void {
        if (isNewNull(node.parent)) {
          context.report({ node, messageId: 'error-new-usage-of-null' });
        }
      }
    };
  }
};

export { noNewNullRule };
