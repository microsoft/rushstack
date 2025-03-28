// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree } from '@typescript-eslint/types';

export function isArrayExpression(node: TSESTree.Node): node is TSESTree.ArrayExpression {
  return node.type === 'ArrayExpression';
}

export function isArrowFunctionExpression(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression {
  return node.type === 'ArrowFunctionExpression';
}

/** default parameters */
export function isAssignmentPattern(node: TSESTree.Node): node is TSESTree.AssignmentPattern {
  return node.type === 'AssignmentPattern';
}

export function isClassDeclaration(node: TSESTree.Node): node is TSESTree.ClassDeclaration {
  return node.type === 'ClassDeclaration';
}

export function isClassExpression(node: TSESTree.Node): node is TSESTree.ClassExpression {
  return node.type === 'ClassExpression';
}

export function isExportDefaultDeclaration(node: TSESTree.Node): node is TSESTree.ExportDefaultDeclaration {
  return node.type === 'ExportDefaultDeclaration';
}

export function isExpression(node: TSESTree.Node): node is TSESTree.Expression {
  return node.type.includes('Expression');
}

export function isFunctionDeclaration(node: TSESTree.Node): node is TSESTree.FunctionDeclaration {
  return node.type === 'FunctionDeclaration';
}

export function isFunctionExpression(node: TSESTree.Node): node is TSESTree.FunctionExpression {
  return node.type === 'FunctionExpression';
}

export function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
  return node.type === 'Identifier';
}

export function isLiteral(node: TSESTree.Node): node is TSESTree.Literal {
  return node.type === 'Literal';
}

export function isMethodDefinition(node: TSESTree.Node): node is TSESTree.MethodDefinition {
  return node.type === 'MethodDefinition';
}

export function isObjectExpression(node: TSESTree.Node): node is TSESTree.ObjectExpression {
  return node.type === 'ObjectExpression';
}

export function isPrivateIdentifier(node: TSESTree.Node): node is TSESTree.PrivateIdentifier {
  return node.type === 'PrivateIdentifier';
}

export function isProperty(node: TSESTree.Node): node is TSESTree.Property {
  return node.type === 'Property';
}

export function isPropertyDefinition(node: TSESTree.Node): node is TSESTree.PropertyDefinition {
  return node.type === 'PropertyDefinition';
}

export function isTSEnumDeclaration(node: TSESTree.Node): node is TSESTree.TSEnumDeclaration {
  return node.type === 'TSEnumDeclaration';
}

export function isTSInterfaceDeclaration(node: TSESTree.Node): node is TSESTree.TSInterfaceDeclaration {
  return node.type === 'TSInterfaceDeclaration';
}

export function isTSModuleDeclaration(node: TSESTree.Node): node is TSESTree.TSModuleDeclaration {
  return node.type === 'TSModuleDeclaration';
}

export function isTSQualifiedName(node: TSESTree.Node): node is TSESTree.TSQualifiedName {
  return node.type === 'TSQualifiedName';
}

export function isTSTypeAliasDeclaration(node: TSESTree.Node): node is TSESTree.TSTypeAliasDeclaration {
  return node.type === 'TSTypeAliasDeclaration';
}

export function isVariableDeclarator(node: TSESTree.Node): node is TSESTree.VariableDeclarator {
  return node.type === 'VariableDeclarator';
}

// Compound Type Guards for @typescript-eslint/types ast-spec compound types
export function isClassDeclarationWithName(node: TSESTree.Node): node is TSESTree.ClassDeclarationWithName {
  return isClassDeclaration(node) && node.id !== null;
}

export function isClassPropertyNameNonComputed(
  node: TSESTree.Node
): node is TSESTree.ClassPropertyNameNonComputed {
  return isPrivateIdentifier(node) || isPropertyNameNonComputed(node);
}

export function isFunctionDeclarationWithName(
  node: TSESTree.Node
): node is TSESTree.FunctionDeclarationWithName {
  return isFunctionDeclaration(node) && node.id !== null;
}

export function isNumberLiteral(node: TSESTree.Node): node is TSESTree.NumberLiteral {
  return isLiteral(node) && typeof node.value === 'number';
}

export function isPropertyNameNonComputed(node: TSESTree.Node): node is TSESTree.PropertyNameNonComputed {
  return isIdentifier(node) || isNumberLiteral(node) || isStringLiteral(node);
}

export function isStringLiteral(node: TSESTree.Node): node is TSESTree.StringLiteral {
  return isLiteral(node) && typeof node.value === 'string';
}

// Custom compound types
export interface IClassExpressionWithName extends TSESTree.ClassExpression {
  id: TSESTree.Identifier;
}

export function isClassExpressionWithName(node: TSESTree.Node): node is IClassExpressionWithName {
  return isClassExpression(node) && node.id !== null;
}
export interface IFunctionExpressionWithName extends TSESTree.FunctionExpression {
  id: TSESTree.Identifier;
}

export function isFunctionExpressionWithName(node: TSESTree.Node): node is IFunctionExpressionWithName {
  return isFunctionExpression(node) && node.id !== null;
}

export type NormalAnonymousExpression =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.ClassExpression
  | TSESTree.FunctionExpression
  | TSESTree.ObjectExpression;

export function isNormalAnonymousExpression(node: TSESTree.Node): node is NormalAnonymousExpression {
  const ANONYMOUS_EXPRESSION_GUARDS: ((node: TSESTree.Node) => boolean)[] = [
    isArrowFunctionExpression,
    isClassExpression,
    isFunctionExpression,
    isObjectExpression
  ];
  return ANONYMOUS_EXPRESSION_GUARDS.some((guard) => guard(node));
}

export interface INormalAssignmentPattern extends TSESTree.AssignmentPattern {
  left: TSESTree.Identifier;
}

export function isNormalAssignmentPattern(node: TSESTree.Node): node is INormalAssignmentPattern {
  return isAssignmentPattern(node) && isIdentifier(node.left);
}

export interface INormalClassPropertyDefinition extends TSESTree.PropertyDefinitionNonComputedName {
  key: TSESTree.PrivateIdentifier | TSESTree.Identifier;
  value: TSESTree.Expression;
}

export function isNormalClassPropertyDefinition(node: TSESTree.Node): node is INormalClassPropertyDefinition {
  return (
    isPropertyDefinition(node) &&
    (isIdentifier(node.key) || isPrivateIdentifier(node.key)) &&
    node.value !== null
  );
}

export interface INormalMethodDefinition extends TSESTree.MethodDefinitionNonComputedName {
  key: TSESTree.PrivateIdentifier | TSESTree.Identifier;
}

export function isNormalMethodDefinition(node: TSESTree.Node): node is INormalMethodDefinition {
  return isMethodDefinition(node) && (isIdentifier(node.key) || isPrivateIdentifier(node.key));
}

export interface INormalObjectProperty extends TSESTree.PropertyNonComputedName {
  key: TSESTree.Identifier;
}

export function isNormalObjectProperty(node: TSESTree.Node): node is INormalObjectProperty {
  return isProperty(node) && (isIdentifier(node.key) || isPrivateIdentifier(node.key));
}

export type INormalVariableDeclarator = TSESTree.LetOrConstOrVarDeclaration & {
  id: TSESTree.Identifier;
  init: TSESTree.Expression;
};

export function isNormalVariableDeclarator(node: TSESTree.Node): node is INormalVariableDeclarator {
  return isVariableDeclarator(node) && isIdentifier(node.id) && node.init !== null;
}

export interface INormalAssignmentPatternWithAnonymousExpressionAssigned extends INormalAssignmentPattern {
  right: NormalAnonymousExpression;
}

export function isNormalAssignmentPatternWithAnonymousExpressionAssigned(
  node: TSESTree.Node
): node is INormalAssignmentPatternWithAnonymousExpressionAssigned {
  return isNormalAssignmentPattern(node) && isNormalAnonymousExpression(node.right);
}

export type INormalVariableDeclaratorWithAnonymousExpressionAssigned = INormalVariableDeclarator & {
  init: NormalAnonymousExpression;
};

export function isNormalVariableDeclaratorWithAnonymousExpressionAssigned(
  node: TSESTree.Node
): node is INormalVariableDeclaratorWithAnonymousExpressionAssigned {
  return isNormalVariableDeclarator(node) && isNormalAnonymousExpression(node.init);
}

export interface INormalObjectPropertyWithAnonymousExpressionAssigned extends INormalObjectProperty {
  value: NormalAnonymousExpression;
}

export function isNormalObjectPropertyWithAnonymousExpressionAssigned(
  node: TSESTree.Node
): node is INormalObjectPropertyWithAnonymousExpressionAssigned {
  return isNormalObjectProperty(node) && isNormalAnonymousExpression(node.value);
}

export interface INormalClassPropertyDefinitionWithAnonymousExpressionAssigned
  extends INormalClassPropertyDefinition {
  value: NormalAnonymousExpression;
}

export function isNormalClassPropertyDefinitionWithAnonymousExpressionAssigned(
  node: TSESTree.Node
): node is INormalClassPropertyDefinitionWithAnonymousExpressionAssigned {
  return isNormalClassPropertyDefinition(node) && isNormalAnonymousExpression(node.value);
}

export type NodeWithName =
  | TSESTree.ClassDeclarationWithName
  | TSESTree.FunctionDeclarationWithName
  | IClassExpressionWithName
  | IFunctionExpressionWithName
  | INormalVariableDeclaratorWithAnonymousExpressionAssigned
  | INormalObjectPropertyWithAnonymousExpressionAssigned
  | INormalClassPropertyDefinitionWithAnonymousExpressionAssigned
  | INormalAssignmentPatternWithAnonymousExpressionAssigned
  | INormalMethodDefinition
  | TSESTree.TSEnumDeclaration
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration;

export function isNodeWithName(node: TSESTree.Node): node is NodeWithName {
  return (
    isClassDeclarationWithName(node) ||
    isFunctionDeclarationWithName(node) ||
    isClassExpressionWithName(node) ||
    isFunctionExpressionWithName(node) ||
    isNormalVariableDeclaratorWithAnonymousExpressionAssigned(node) ||
    isNormalObjectPropertyWithAnonymousExpressionAssigned(node) ||
    isNormalClassPropertyDefinitionWithAnonymousExpressionAssigned(node) ||
    isNormalAssignmentPatternWithAnonymousExpressionAssigned(node) ||
    isNormalMethodDefinition(node) ||
    isTSEnumDeclaration(node) ||
    isTSInterfaceDeclaration(node) ||
    isTSTypeAliasDeclaration(node)
  );
}
