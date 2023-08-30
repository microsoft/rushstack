import {
  ArrayExpression,
  ArrowFunctionExpression,
  BaseNode,
  ClassDeclaration,
  ClassDeclarationWithName,
  ClassExpression,
  ClassPropertyNameNonComputed,
  ExportDefaultDeclaration,
  Expression,
  FunctionDeclaration,
  FunctionDeclarationWithName,
  FunctionExpression,
  Identifier,
  LetOrConstOrVarDeclaration,
  Literal,
  MethodDefinition,
  MethodDefinitionNonComputedName,
  NumberLiteral,
  ObjectExpression,
  PrivateIdentifier,
  Property,
  PropertyDefinition,
  PropertyDefinitionNonComputedName,
  PropertyNameNonComputed,
  PropertyNonComputedName,
  StringLiteral,
  TSEnumDeclaration,
  TSInterfaceDeclaration,
  TSModuleDeclaration,
  TSQualifiedName,
  TSTypeAliasDeclaration,
  VariableDeclarator
} from '@typescript-eslint/types/dist/generated/ast-spec';

export function isArrayExpression(node: BaseNode): node is ArrayExpression {
  return node.type === 'ArrayExpression';
}

export function isArrowFunctionExpression(node: BaseNode): node is ArrowFunctionExpression {
  return node.type === 'ArrowFunctionExpression';
}

export function isClassDeclaration(node: BaseNode): node is ClassDeclaration {
  return node.type === 'ClassDeclaration';
}

export function isClassExpression(node: BaseNode): node is ClassExpression {
  return node.type === 'ClassExpression';
}

export function isExportDefaultDeclaration(node: BaseNode): node is ExportDefaultDeclaration {
  return node.type === 'ExportDefaultDeclaration';
}

export function isFunctionDeclaration(node: BaseNode): node is FunctionDeclaration {
  return node.type === 'FunctionDeclaration';
}

export function isFunctionExpression(node: BaseNode): node is FunctionExpression {
  return node.type === 'FunctionExpression';
}

export function isIdentifier(node: BaseNode): node is Identifier {
  return node.type === 'Identifier';
}

export function isLiteral(node: BaseNode): node is Literal {
  return node.type === 'Literal';
}

export function isMethodDefinition(node: BaseNode): node is MethodDefinition {
  return node.type === 'MethodDefinition';
}

export function isObjectExpression(node: BaseNode): node is ObjectExpression {
  return node.type === 'ObjectExpression';
}

export function isPrivateIdentifier(node: BaseNode): node is PrivateIdentifier {
  return node.type === 'PrivateIdentifier';
}

export function isProperty(node: BaseNode): node is Property {
  return node.type === 'Property';
}

export function isPropertyDefinition(node: BaseNode): node is PropertyDefinition {
  return node.type === 'PropertyDefinition';
}

export function isTSEnumDeclaration(node: BaseNode): node is TSEnumDeclaration {
  return node.type === 'TSEnumDeclaration';
}

export function isTSInterfaceDeclaration(node: BaseNode): node is TSInterfaceDeclaration {
  return node.type === 'TSInterfaceDeclaration';
}

export function isTSModuleDeclaration(node: BaseNode): node is TSModuleDeclaration {
  return node.type === 'TSModuleDeclaration';
}

export function isTSQualifiedName(node: BaseNode): node is TSQualifiedName {
  return node.type === 'TSQualifiedName';
}

export function isTSTypeAliasDeclaration(node: BaseNode): node is TSTypeAliasDeclaration {
  return node.type === 'TSTypeAliasDeclaration';
}

export function isVariableDeclarator(node: BaseNode): node is VariableDeclarator {
  return node.type === 'VariableDeclarator';
}

// Compound Type Guards for @typescript-eslint/types ast-spec compound types
export function isClassDeclarationWithName(node: BaseNode): node is ClassDeclarationWithName {
  return isClassDeclaration(node) && node.id !== null;
}

export function isClassPropertyNameNonComputed(node: BaseNode): node is ClassPropertyNameNonComputed {
  return isPrivateIdentifier(node) || isPropertyNameNonComputed(node);
}

export function isFunctionDeclarationWithName(node: BaseNode): node is FunctionDeclarationWithName {
  return isFunctionDeclaration(node) && node.id !== null;
}

export function isNumberLiteral(node: BaseNode): node is NumberLiteral {
  return isLiteral(node) && typeof node.value === 'number';
}

export function isPropertyNameNonComputed(node: BaseNode): node is PropertyNameNonComputed {
  return isIdentifier(node) || isNumberLiteral(node) || isStringLiteral(node);
}

export function isStringLiteral(node: BaseNode): node is StringLiteral {
  return isLiteral(node) && typeof node.value === 'string';
}

// Custom compound types
export interface ClassExpressionWithName extends ClassExpression {
  id: Identifier;
}

export function isClassExpressionWithName(node: BaseNode): node is ClassExpressionWithName {
  return isClassExpression(node) && node.id !== null;
}
export interface FunctionExpressionWithName extends FunctionExpression {
  id: Identifier;
}

export function isFunctionExpressionWithName(node: BaseNode): node is FunctionExpressionWithName {
  return isFunctionExpression(node) && node.id !== null;
}

export type NormalAnonymousExpression =
  | ArrayExpression
  | ArrowFunctionExpression
  | ClassExpression
  | FunctionExpression
  | ObjectExpression;

export function isNormalAnonymousExpression(node: BaseNode): node is NormalAnonymousExpression {
  const ANONYMOUS_EXPRESSION_GUARDS = [
    isArrowFunctionExpression,
    isClassExpression,
    isFunctionExpression,
    isObjectExpression
  ];
  return ANONYMOUS_EXPRESSION_GUARDS.some((guard) => guard(node));
}

export interface NormalClassPropertyDefinition extends PropertyDefinitionNonComputedName {
  key: PrivateIdentifier | Identifier;
  value: Expression;
}

export function isNormalClassPropertyDefinition(node: BaseNode): node is NormalClassPropertyDefinition {
  return (
    isPropertyDefinition(node) &&
    (isIdentifier(node.key) || isPrivateIdentifier(node.key)) &&
    node.value !== null
  );
}

export interface NormalMethodDefinition extends MethodDefinitionNonComputedName {
  key: PrivateIdentifier | Identifier;
}

export function isNormalMethodDefinition(node: BaseNode): node is NormalMethodDefinition {
  return isMethodDefinition(node) && (isIdentifier(node.key) || isPrivateIdentifier(node.key));
}

export interface NormalObjectProperty extends PropertyNonComputedName {
  key: Identifier;
}

export function isNormalObjectProperty(node: BaseNode): node is NormalObjectProperty {
  return isProperty(node) && (isIdentifier(node.key) || isPrivateIdentifier(node.key));
}

export interface NormalVariableDeclarator extends LetOrConstOrVarDeclaration {
  id: Identifier;
  init: Expression;
}

export function isNormalVariableDeclarator(node: BaseNode): node is NormalVariableDeclarator {
  return isVariableDeclarator(node) && isIdentifier(node.id) && node.init !== null;
}
