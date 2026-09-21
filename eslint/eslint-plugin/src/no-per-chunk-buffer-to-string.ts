// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree, ParserServices } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

type MessageIds = 'error-per-chunk-buffer-to-string';
type Options = [];

const ITERATIVE_CALLBACK_METHOD_NAMES: Set<string> = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'forEach',
  'map',
  'reduce',
  'reduceRight',
  'some'
]);

const STREAM_DATA_METHOD_NAMES: Set<string> = new Set(['addListener', 'on', 'once', 'prependListener']);

function getStaticPropertyName(node: TSESTree.MemberExpression): string | undefined {
  if (node.property.type === AST_NODE_TYPES.Identifier && !node.computed) {
    return node.property.name;
  }

  if (node.property.type === AST_NODE_TYPES.Literal && typeof node.property.value === 'string') {
    return node.property.value;
  }

  return undefined;
}

function isDataEventArgument(node: TSESTree.CallExpressionArgument | undefined): boolean {
  return node?.type === AST_NODE_TYPES.Literal && node.value === 'data';
}

function isIterativeCallback(functionNode: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): boolean {
  const callExpression: TSESTree.Node | undefined = functionNode.parent;
  if (callExpression?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  if (!callExpression.arguments.some((argument: TSESTree.CallExpressionArgument) => argument === functionNode)) {
    return false;
  }

  const { callee } = callExpression;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }

  const methodName: string | undefined = getStaticPropertyName(callee);
  if (!methodName) {
    return false;
  }

  if (ITERATIVE_CALLBACK_METHOD_NAMES.has(methodName)) {
    return true;
  }

  return STREAM_DATA_METHOD_NAMES.has(methodName) && isDataEventArgument(callExpression.arguments[0]);
}

function isIdentifierDeclaredByForOf(identifier: TSESTree.Identifier, forOfStatement: TSESTree.ForOfStatement): boolean {
  const { left } = forOfStatement;
  if (left.type === AST_NODE_TYPES.Identifier) {
    return left.name === identifier.name;
  }

  return (
    left.type === AST_NODE_TYPES.VariableDeclaration &&
    left.declarations.some(
      (declaration: TSESTree.VariableDeclarator) =>
        declaration.id.type === AST_NODE_TYPES.Identifier && declaration.id.name === identifier.name
    )
  );
}

function isDeclaredByContainingForOf(identifier: TSESTree.Identifier): boolean {
  let current: TSESTree.Node | undefined = identifier.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return false;
    }

    if (current.type === AST_NODE_TYPES.ForOfStatement) {
      return isIdentifierDeclaredByForOf(identifier, current);
    }

    current = current.parent;
  }

  return false;
}

function isCallbackParameter(identifier: TSESTree.Identifier): boolean {
  let current: TSESTree.Node | undefined = identifier.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return (
        (current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
        isIterativeCallback(current) &&
        current.params.some(
          (parameter: TSESTree.Parameter) =>
            parameter.type === AST_NODE_TYPES.Identifier && parameter.name === identifier.name
        )
      );
    }

    current = current.parent;
  }

  return false;
}

function isProbablyChunk(identifier: TSESTree.Identifier): boolean {
  return identifier.name.toLowerCase().includes('chunk');
}

function isBufferType(type: ts.Type, typeChecker: ts.TypeChecker): boolean {
  if (type.isUnion()) {
    return type.types.some((unionType: ts.Type) => isBufferType(unionType, typeChecker));
  }

  const symbolName: string | undefined = (type.aliasSymbol ?? type.getSymbol())?.getName();
  return symbolName === 'Buffer' || typeChecker.typeToString(type).startsWith('Buffer<');
}

const noPerChunkBufferToStringRule: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      'error-per-chunk-buffer-to-string':
        'Do not call toString() on each Buffer chunk from a stream or iterable; use TextDecoder instead.'
    },
    schema: [],
    docs: {
      description:
        'Prevent decoding Buffer chunks one at a time with toString(), which can corrupt multi-byte ' +
        'characters split across chunk boundaries.',
      recommended: 'strict',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    } as TSESLint.RuleMetaDataDocs
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    const parserServices: Partial<ParserServices> | undefined =
      context.sourceCode?.parserServices ?? context.parserServices;
    const typeChecker: ts.TypeChecker | undefined = parserServices?.program?.getTypeChecker();

    function isTypedBuffer(node: TSESTree.Node): boolean {
      if (!typeChecker || !parserServices?.esTreeNodeToTSNodeMap) {
        return false;
      }

      const tsNode: ts.Node | undefined = parserServices.esTreeNodeToTSNodeMap.get(node);
      return !!tsNode && isBufferType(typeChecker.getTypeAtLocation(tsNode), typeChecker);
    }

    return {
      CallExpression(node: TSESTree.CallExpression): void {
        const { callee } = node;
        if (callee.type !== AST_NODE_TYPES.MemberExpression || getStaticPropertyName(callee) !== 'toString') {
          return;
        }

        const { object } = callee;
        if (object.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        if (
          (isProbablyChunk(object) || isTypedBuffer(object)) &&
          (isCallbackParameter(object) || isDeclaredByContainingForOf(object))
        ) {
          context.report({ node, messageId: 'error-per-chunk-buffer-to-string' });
        }
      }
    };
  }
};

export { noPerChunkBufferToStringRule };
