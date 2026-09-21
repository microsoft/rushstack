// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree, ParserServices } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

type MessageIds = 'error-per-chunk-buffer-to-string';
interface IOptions {
  chunkVariableNames?: string[];
}

type Options = [IOptions?];

interface IESLintVariable {
  name: string;
}

interface IESLintScope {
  variables: IESLintVariable[];
  upper: IESLintScope | null;
}

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

const STREAM_DATA_METHOD_NAMES: Set<string> = new Set(['addListener', 'on', 'prependListener']);

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

function getIdentifierDeclaredByForOf(
  identifier: TSESTree.Identifier,
  forOfStatement: TSESTree.ForOfStatement
): TSESTree.Identifier | undefined {
  const { left } = forOfStatement;
  if (left.type === AST_NODE_TYPES.Identifier && left.name === identifier.name) {
    return left;
  }

  if (left.type === AST_NODE_TYPES.VariableDeclaration) {
    return left.declarations.find(
      (declaration: TSESTree.VariableDeclarator) =>
        declaration.id.type === AST_NODE_TYPES.Identifier && declaration.id.name === identifier.name
    )?.id as TSESTree.Identifier | undefined;
  }

  return undefined;
}

function getContainingForOfIdentifier(identifier: TSESTree.Identifier): TSESTree.Identifier | undefined {
  let current: TSESTree.Node | undefined = identifier.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return undefined;
    }

    if (current.type === AST_NODE_TYPES.ForOfStatement) {
      const declarationIdentifier: TSESTree.Identifier | undefined = getIdentifierDeclaredByForOf(
        identifier,
        current
      );
      if (declarationIdentifier) {
        return declarationIdentifier;
      }
    }

    current = current.parent;
  }

  return undefined;
}

function getCallbackParameterIdentifier(identifier: TSESTree.Identifier): TSESTree.Identifier | undefined {
  let current: TSESTree.Node | undefined = identifier.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      if (
        current.type === AST_NODE_TYPES.FunctionExpression ||
        current.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        if (isIterativeCallback(current)) {
          return current.params.find(
            (parameter: TSESTree.Parameter) =>
              parameter.type === AST_NODE_TYPES.Identifier && parameter.name === identifier.name
          ) as TSESTree.Identifier | undefined;
        }
      }

      return undefined;
    }

    current = current.parent;
  }

  return undefined;
}

function isConfiguredChunkName(identifier: TSESTree.Identifier, chunkVariableNames: Set<string>): boolean {
  return chunkVariableNames.has(identifier.name.toLowerCase());
}

function isBufferType(type: ts.Type, typeChecker: ts.TypeChecker): boolean {
  if (type.isUnion()) {
    return type.types.some((unionType: ts.Type) => isBufferType(unionType, typeChecker));
  }

  const symbol: ts.Symbol | undefined = type.aliasSymbol ?? type.getSymbol();
  switch (symbol?.getName()) {
    case 'Buffer':
      return isNodeBufferSymbol(symbol);

    case 'Uint8Array':
      return isTypeScriptLibSymbol(symbol);

    default:
      return false;
  }
}

function isNodeBufferSymbol(symbol: ts.Symbol): boolean {
  return (symbol.getDeclarations() ?? []).some((declaration: ts.Declaration) => {
    const sourceFileName: string = declaration.getSourceFile().fileName.replace(/\\/g, '/');
    return (
      sourceFileName.includes('/@types/node/') &&
      (sourceFileName.endsWith('/buffer.d.ts') || sourceFileName.endsWith('/buffer.buffer.d.ts'))
    );
  });
}

function isTypeScriptLibSymbol(symbol: ts.Symbol): boolean {
  return (symbol.getDeclarations() ?? []).some((declaration: ts.Declaration) =>
    declaration.getSourceFile().fileName.replace(/\\/g, '/').includes('/typescript/lib/lib.')
  );
}

const noPerChunkBufferToStringRule: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [{ chunkVariableNames: ['chunk'] }],
  meta: {
    type: 'problem',
    messages: {
      'error-per-chunk-buffer-to-string':
        'Do not call toString() on each Buffer chunk from a stream or iterable. Multi-byte characters ' +
        'split across chunks can be corrupted; use TextDecoder.decode(chunk, { stream: true }) instead.'
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          chunkVariableNames: {
            type: 'array',
            items: {
              type: 'string'
            },
            uniqueItems: true
          }
        }
      }
    ],
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
    const hasTypeInformation: boolean = !!typeChecker && !!parserServices?.esTreeNodeToTSNodeMap;
    const chunkVariableNames: Set<string> = new Set(
      (context.options[0]?.chunkVariableNames ?? ['chunk']).map((name: string) => name.toLowerCase())
    );

    function getVariable(identifier: TSESTree.Identifier): IESLintVariable | undefined {
      const getScope: ((node: TSESTree.Node) => unknown) | undefined = context.sourceCode.getScope?.bind(
        context.sourceCode
      );
      let scope: IESLintScope | null = (getScope ? getScope(identifier) : context.getScope()) as IESLintScope;
      while (scope) {
        const variable: IESLintVariable | undefined = scope.variables.find(
          (scopeVariable: IESLintVariable) => scopeVariable.name === identifier.name
        );
        if (variable) {
          return variable;
        }

        scope = scope.upper;
      }

      return undefined;
    }

    function isSameVariable(
      referenceIdentifier: TSESTree.Identifier,
      declarationIdentifier: TSESTree.Identifier | undefined
    ): boolean {
      return !!declarationIdentifier && getVariable(referenceIdentifier) === getVariable(declarationIdentifier);
    }

    function isTypedBuffer(node: TSESTree.Node): boolean {
      if (!hasTypeInformation) {
        return false;
      }

      const tsNode: ts.Node | undefined = parserServices!.esTreeNodeToTSNodeMap!.get(node);
      return !!tsNode && isBufferType(typeChecker!.getTypeAtLocation(tsNode), typeChecker!);
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
          (isTypedBuffer(object) ||
            // Fall back to configured conventional chunk names when parserOptions.project is not configured.
            (!hasTypeInformation && isConfiguredChunkName(object, chunkVariableNames))) &&
          (isSameVariable(object, getCallbackParameterIdentifier(object)) ||
            isSameVariable(object, getContainingForOfIdentifier(object)))
        ) {
          context.report({ node, messageId: 'error-per-chunk-buffer-to-string' });
        }
      }
    };
  }
};

export { noPerChunkBufferToStringRule };
