// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A "Selector Expression" is a JSON description of a complex selection of
 * projects, using concepts familiar to users of the Rush CLI.
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

export type ExpressionOperator = IExpressionOperatorAnd | IExpressionOperatorOr | IExpressionOperatorNot;

export interface IExpressionOperatorAnd {
  and: SelectorExpression[];
}

export interface IExpressionOperatorOr {
  or: SelectorExpression[];
}

export interface IExpressionOperatorNot {
  not: SelectorExpression;
}

// A collection of type guards useful for interacting with selector expressions.

export function isDetailedSelector(expr: SelectorExpression): expr is IExpressionDetailedSelector {
  return !!(expr && (expr as IExpressionDetailedSelector).scope);
}

export function isParameter(expr: SelectorExpression): expr is ExpressionParameter {
  const keys: string[] = Object.keys(expr);
  return keys.length === 1 && keys[0].startsWith('--');
}

export function isAnd(expr: SelectorExpression): expr is IExpressionOperatorAnd {
  return !!(expr && (expr as IExpressionOperatorAnd).and);
}

export function isOr(expr: SelectorExpression): expr is IExpressionOperatorOr {
  return !!(expr && (expr as IExpressionOperatorOr).or);
}

export function isNot(expr: SelectorExpression): expr is IExpressionOperatorNot {
  return !!(expr && (expr as IExpressionOperatorNot).not);
}
