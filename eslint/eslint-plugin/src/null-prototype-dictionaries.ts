// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree, TSESLint, ParserServices } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

type MessageIds = 'error-empty-object-literal-dictionary' | 'error-missing-null-prototype';
type Options = [];

const nullPrototypeDictionariesRule: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      'error-empty-object-literal-dictionary':
        'Dictionary objects typed as Record<string, T> should be created using Object.create(null)' +
        ' instead of an empty object literal. This avoids prototype pollution, collisions with' +
        ' Object.prototype members such as "toString", and enables higher performance since runtimes' +
        ' such as V8 process Object.create(null) as opting out of having a hidden class and going' +
        ' directly to dictionary mode.',
      'error-missing-null-prototype':
        'Dictionary object literals typed as Record<string, T> should include "__proto__: null"' +
        ' to avoid prototype pollution and collisions with Object.prototype members such as "toString".'
    },
    schema: [],
    docs: {
      description:
        'Enforce that objects typed as string-keyed dictionaries (Record<string, T>) are instantiated' +
        ' using Object.create(null) instead of object literals, to avoid prototype pollution issues,' +
        ' collisions with Object.prototype members such as "toString", and for higher performance' +
        ' since runtimes such as V8 process Object.create(null) as opting out of having a hidden' +
        ' class and going directly to dictionary mode',
      recommended: 'strict',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    } as TSESLint.RuleMetaDataDocs
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    const parserServices: Partial<ParserServices> | undefined =
      context.sourceCode?.parserServices ?? context.parserServices;
    if (!parserServices || !parserServices.program || !parserServices.esTreeNodeToTSNodeMap) {
      throw new Error(
        'This rule requires your ESLint configuration to define the "parserOptions.project"' +
          ' property for "@typescript-eslint/parser".'
      );
    }

    const typeChecker: ts.TypeChecker = parserServices.program.getTypeChecker();

    /**
     * Checks whether the given type represents a pure string-keyed dictionary type:
     * it has a string index signature and no named properties.
     */
    function isStringKeyedDictionaryType(type: ts.Type): boolean {
      // Check if the type has a string index signature
      if (!type.getStringIndexType()) {
        return false;
      }

      // A pure dictionary type has no named properties - only an index signature.
      // Types with named properties (like interfaces with extra index signatures)
      // are not considered pure dictionaries.
      if (type.getProperties().length > 0) {
        return false;
      }

      return true;
    }

    return {
      ObjectExpression(node: TSESTree.ObjectExpression): void {
        const tsNode: ts.Node = parserServices.esTreeNodeToTSNodeMap!.get(node);

        // Get the contextual type (the type expected by the surrounding context,
        // e.g. from a variable declaration's type annotation)
        const contextualType: ts.Type | undefined = typeChecker.getContextualType(
          tsNode as ts.Expression
        );
        if (!contextualType) {
          return;
        }

        if (!isStringKeyedDictionaryType(contextualType)) {
          return;
        }

        // For empty object literals, recommend Object.create(null) which is more performant
        if (node.properties.length === 0) {
          context.report({
            node,
            messageId: 'error-empty-object-literal-dictionary'
          });
          return;
        }

        // For non-empty object literals, check whether "__proto__: null" is present
        const hasNullProto: boolean = node.properties.some(
          (prop) =>
            prop.type === 'Property' &&
            !prop.computed &&
            ((prop.key.type === 'Identifier' && prop.key.name === '__proto__') ||
              (prop.key.type === 'Literal' && prop.key.value === '__proto__')) &&
            prop.value.type === 'Literal' &&
            prop.value.value === null
        );

        if (!hasNullProto) {
          context.report({
            node,
            messageId: 'error-missing-null-prototype'
          });
        }
      }
    };
  }
};

export { nullPrototypeDictionariesRule };
