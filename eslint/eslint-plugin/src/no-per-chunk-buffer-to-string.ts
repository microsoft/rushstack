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

const DEFAULT_CHUNK_VARIABLE_NAMES: string[] = ['chunk'];

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

function isBinaryChunkType(type: ts.Type, program: ts.Program): boolean {
  if (type.isUnion()) {
    return type.types.some((unionType: ts.Type) => isBinaryChunkType(unionType, program));
  }

  const symbol: ts.Symbol | undefined = type.aliasSymbol ?? type.getSymbol();
  if (symbol?.getName() === 'Uint8Array' && isTypeScriptLibSymbol(symbol, program)) {
    return true;
  }

  return ((type as ts.InterfaceType).getBaseTypes?.() ?? []).some((baseType: ts.BaseType) =>
    isBinaryChunkType(baseType, program)
  );
}

function isTypeScriptLibSymbol(symbol: ts.Symbol, program: ts.Program): boolean {
  return (symbol.getDeclarations() ?? []).some((declaration: ts.Declaration) =>
    program.isSourceFileDefaultLibrary(declaration.getSourceFile())
  );
}

const noPerChunkBufferToStringRule: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [{ chunkVariableNames: DEFAULT_CHUNK_VARIABLE_NAMES }],
  meta: {
    type: 'problem',
    messages: {
      'error-per-chunk-buffer-to-string':
        'Do not call toString() on each Buffer or Uint8Array chunk from a stream or iterable. Multi-byte characters ' +
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
    const program: ts.Program | undefined = parserServices?.program ?? undefined;
    const typeChecker: ts.TypeChecker | undefined = program?.getTypeChecker();
    const hasTypeInformation: boolean = !!program && !!typeChecker && !!parserServices?.esTreeNodeToTSNodeMap;
    const chunkVariableNames: Set<string> = new Set(
      (context.options[0]?.chunkVariableNames ?? DEFAULT_CHUNK_VARIABLE_NAMES).map((name: string) =>
        name.toLowerCase()
      )
    );
    const getScope: ((node: TSESTree.Node) => unknown) | undefined = context.sourceCode.getScope?.bind(
      context.sourceCode
    );

    function getVariable(identifier: TSESTree.Identifier): IESLintVariable | undefined {
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
      referenceVariable: IESLintVariable | undefined,
      declarationIdentifier: TSESTree.Identifier | undefined
    ): boolean {
      return !!referenceVariable && !!declarationIdentifier && referenceVariable === getVariable(declarationIdentifier);
    }

    function isTypedBuffer(node: TSESTree.Node): boolean {
      if (!hasTypeInformation) {
        return false;
      }

      const tsNode: ts.Node | undefined = parserServices!.esTreeNodeToTSNodeMap!.get(node);
      return !!tsNode && isBinaryChunkType(typeChecker!.getTypeAtLocation(tsNode), program!);
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

        const objectVariable: IESLintVariable | undefined = getVariable(object);
        if (
          (isTypedBuffer(object) ||
            // Fall back to configured conventional chunk names when parserOptions.project is not configured.
            (!hasTypeInformation && isConfiguredChunkName(object, chunkVariableNames))) &&
          (isSameVariable(objectVariable, getCallbackParameterIdentifier(object)) ||
            isSameVariable(objectVariable, getContainingForOfIdentifier(object)))
        ) {
          context.report({ node, messageId: 'error-per-chunk-buffer-to-string' });
        }
      }
    };
  }
};

export { noPerChunkBufferToStringRule };
