// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TSESTree, type TSESLint } from '@typescript-eslint/utils';

export const MESSAGE_ID: 'error-pair-react-dom-render-unmount' = 'error-pair-react-dom-render-unmount';
type RuleModule = TSESLint.RuleModule<typeof MESSAGE_ID, []>;
type RuleContext = TSESLint.RuleContext<typeof MESSAGE_ID, []>;

const pairReactDomRenderUnmountRule: RuleModule = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      [MESSAGE_ID]: 'Pair the render and unmount calls to avoid memory leaks.'
    },
    schema: [],
    docs: {
      description:
        'Pair ReactDOM "render" and "unmount" calls in one file.' +
        ' If a ReactDOM render tree is not unmounted when disposed, it will cause a memory leak.',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    }
  },
  create: (context: RuleContext) => {
    const renderCallExpressions: TSESTree.CallExpression[] = [];
    const unmountCallExpressions: TSESTree.CallExpression[] = [];

    let reactDomImportNamespaceName: string | undefined;
    let reactDomRenderFunctionName: string | undefined;
    let reactDomUnmountFunctionName: string | undefined;

    const isFunctionCallExpression: (
      node: TSESTree.CallExpression,
      methodName: string | undefined
    ) => boolean = (node: TSESTree.CallExpression, methodName: string | undefined) => {
      return node.callee.type === TSESTree.AST_NODE_TYPES.Identifier && node.callee.name === methodName;
    };

    const isNamespaceCallExpression: (
      node: TSESTree.CallExpression,
      namespaceName: string | undefined,
      methodName: string | undefined
    ) => boolean = (
      node: TSESTree.CallExpression,
      namespaceName: string | undefined,
      methodName: string | undefined
    ) => {
      if (node.callee.type === TSESTree.AST_NODE_TYPES.MemberExpression) {
        const { object, property } = node.callee;
        if (object.type === TSESTree.AST_NODE_TYPES.Identifier && object.name === namespaceName) {
          return (
            (property.type === TSESTree.AST_NODE_TYPES.Identifier && property.name === methodName) ||
            (property.type === TSESTree.AST_NODE_TYPES.Literal && property.value === methodName)
          );
        }
      }
      return false;
    };

    return {
      ImportDeclaration: (node: TSESTree.ImportDeclaration) => {
        // Extract the name for the 'react-dom' namespace import
        if (node.source.value === 'react-dom') {
          if (!reactDomImportNamespaceName) {
            const namespaceSpecifier: TSESTree.ImportClause | undefined = node.specifiers.find(
              (s) => s.type === TSESTree.AST_NODE_TYPES.ImportNamespaceSpecifier
            );
            if (namespaceSpecifier) {
              reactDomImportNamespaceName = namespaceSpecifier.local.name;
            } else {
              const defaultSpecifier: TSESTree.ImportClause | undefined = node.specifiers.find(
                (s) => s.type === TSESTree.AST_NODE_TYPES.ImportDefaultSpecifier
              );
              if (defaultSpecifier) {
                reactDomImportNamespaceName = defaultSpecifier.local.name;
              }
            }
          }

          if (!reactDomRenderFunctionName || !reactDomUnmountFunctionName) {
            const importSpecifiers: TSESTree.ImportSpecifier[] = node.specifiers.filter(
              (s) => s.type === TSESTree.AST_NODE_TYPES.ImportSpecifier
            ) as TSESTree.ImportSpecifier[];
            for (const importSpecifier of importSpecifiers) {
              const name: string | undefined =
                'name' in importSpecifier.imported ? importSpecifier.imported.name : undefined;
              if (name === 'render') {
                reactDomRenderFunctionName = importSpecifier.local.name;
              } else if (name === 'unmountComponentAtNode') {
                reactDomUnmountFunctionName = importSpecifier.local.name;
              }
            }
          }
        }
      },
      CallExpression: (node: TSESTree.CallExpression) => {
        if (
          isNamespaceCallExpression(node, reactDomImportNamespaceName, 'render') ||
          isFunctionCallExpression(node, reactDomRenderFunctionName)
        ) {
          renderCallExpressions.push(node);
        } else if (
          isNamespaceCallExpression(node, reactDomImportNamespaceName, 'unmountComponentAtNode') ||
          isFunctionCallExpression(node, reactDomUnmountFunctionName)
        ) {
          unmountCallExpressions.push(node);
        }
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Program:exit': (node: TSESTree.Program) => {
        if (renderCallExpressions.length !== unmountCallExpressions.length) {
          renderCallExpressions.concat(unmountCallExpressions).forEach((callExpression) => {
            context.report({ node: callExpression, messageId: MESSAGE_ID });
          });
        }
      }
    };
  }
};

export { pairReactDomRenderUnmountRule };
