// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A "Selector Expression" is a JSON description of a complex selection of
 * projects, using concepts familiar to users of the Rush CLI. This type represents
 * the type-safe version of these JSON objects.
 */
export type SelectorExpression = ExpressionSelector | ExpressionParameter | ExpressionOperator;

export type ExpressionSelector = string | IExpressionDetailedSelector;

export interface IExpressionDetailedSelector {
  scope: string;
  value: string;

  // Reserved for future use
  filters?: Record<string, string>;
}

export type ExpressionParameter = Record<`--${string}`, string>;

export type ExpressionOperator =
  | IExpressionOperatorUnion
  | IExpressionOperatorIntersect
  | IExpressionOperatorSubtract;

export interface IExpressionOperatorUnion {
  union: SelectorExpression[];
}

export interface IExpressionOperatorIntersect {
  intersect: SelectorExpression[];
}

export interface IExpressionOperatorSubtract {
  subtract: SelectorExpression[];
}

// A collection of type guards useful for interacting with selector expressions.

export function isDetailedSelector(expr: SelectorExpression): expr is IExpressionDetailedSelector {
  return !!(expr && (expr as IExpressionDetailedSelector).scope);
}

export function isParameter(expr: SelectorExpression): expr is ExpressionParameter {
  const keys: string[] = Object.keys(expr);
  return keys.length === 1 && keys[0].startsWith('--');
}

export function isUnion(expr: SelectorExpression): expr is IExpressionOperatorUnion {
  return !!(expr && (expr as IExpressionOperatorUnion).union);
}

export function isIntersect(expr: SelectorExpression): expr is IExpressionOperatorIntersect {
  return !!(expr && (expr as IExpressionOperatorIntersect).intersect);
}

export function isSubtract(expr: SelectorExpression): expr is IExpressionOperatorSubtract {
  return !!(expr && (expr as IExpressionOperatorSubtract).subtract);
}
