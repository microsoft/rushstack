import { Scope, ScopeType } from '@typescript-eslint/scope-manager';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as guards from './ast-type-guards';

export type BulkSuppression = {
  file: string;
  scopeId: string;
  rule: string;
};

export type BulkSuppressionsJson = {
  suppressions: BulkSuppression[];
};

function getNodeName(node: TSESTree.Node): string | null {
  if (!guards.isNodeWithName(node)) return null;

  if (guards.isClassDeclarationWithName(node)) return node.id.name;

  if (guards.isFunctionDeclarationWithName(node)) return node.id.name;

  if (guards.isClassExpressionWithName(node)) return node.id.name;

  if (guards.isFunctionExpressionWithName(node)) return node.id.name;

  if (guards.isNormalVariableDeclaratorWithAnonymousExpressionAssigned(node)) return node.id.name;

  if (guards.isNormalObjectPropertyWithAnonymousExpressionAssigned(node)) return node.key.name;

  if (guards.isNormalClassPropertyDefinitionWithAnonymousExpressionAssigned(node)) return node.key.name;

  if (guards.isNormalAssignmentPatternWithAnonymousExpressionAssigned(node)) return node.left.name;

  if (guards.isNormalMethodDefinition(node)) return node.key.name;

  if (guards.isTSEnumDeclaration(node)) return node.id.name;

  if (guards.isTSInterfaceDeclaration(node)) return node.id.name;

  if (guards.isTSTypeAliasDeclaration(node)) return node.id.name;

  return null;
}

function getScopeAncestry(scope: Scope | null): Scope[] {
  if (scope === null || scope.block.type === 'Program') return [];

  return [...getScopeAncestry(scope.upper), scope];
}

export function serializeNodeScope<TMessageIds extends string, TOptions extends readonly unknown[]>(
  context: Readonly<TSESLint.RuleContext<TMessageIds, TOptions>>,
  node: TSESTree.Node
): string {
  const scopeManager = context.getSourceCode().scopeManager;
  if (!scopeManager) throw new Error('scopeManager is null');

  const scopeAncestry = getScopeAncestry(scopeManager.acquire(node, true));

  // const scopeAncestryTypes: ScopeType[] = scopeAncestry.map((scope) => scope.type);
  const scopeAncestryNames = scopeAncestry.map((scope) => getNodeName(scope.block)).filter(Boolean);

  // console.log('scopeAncestryNames', scopeAncestryNames);

  return '.' + scopeAncestryNames.join('.');
}
