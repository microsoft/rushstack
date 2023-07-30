// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from './RushConfiguration';
import { RushConfigurationProject } from './RushConfigurationProject';
import { Selection } from '../logic/Selection';
import type { ISelectorParser } from '../logic/selectors/ISelectorParser';
import type { ITerminal } from '@rushstack/node-core-library';
import {
  GitChangedProjectSelectorParser,
  IGitSelectorParserOptions
} from '../logic/selectors/GitChangedProjectSelectorParser';
import { NamedProjectSelectorParser } from '../logic/selectors/NamedProjectSelectorParser';
import { TagProjectSelectorParser } from '../logic/selectors/TagProjectSelectorParser';
import { VersionPolicyProjectSelectorParser } from '../logic/selectors/VersionPolicyProjectSelectorParser';

import { ExpressionJson, ISelectorJson, IFilterJson, IOperatorJson } from './SelectorExpressionJson';
import { SelectorExpressionParser } from './SelectorExpressionParser';

/**
 * A central interface for selecting a subset of Rush projects from a given monorepo,
 * using standardized selector expressions. Note that the types of selectors available
 * in a monorepo may be influenced in the future by plugins, so project selection
 * is always done in the context of a particular Rush configuration.
 */
export class RushProjectSelector {
  private _rushConfig: RushConfiguration;
  private _scopes: Map<string, ISelectorParser<RushConfigurationProject>> = new Map();

  public constructor(rushConfig: RushConfiguration) {
    this._rushConfig = rushConfig;

    this._scopes.set('name', new NamedProjectSelectorParser(this._rushConfig));
    //this._scopes.set('git', new GitChangedProjectSelectorParser(this._rushConfig, gitOptions));
    this._scopes.set('tag', new TagProjectSelectorParser(this._rushConfig));
    this._scopes.set('version-policy', new VersionPolicyProjectSelectorParser(this._rushConfig));
  }

  public async selectExpression(expr: ExpressionJson): Promise<RushConfigurationProject[]> {
    if (RushProjectSelector.isSelector(expr)) {
      return this._evaluateSelector(expr);
    } else if (RushProjectSelector.isFilter(expr)) {
      return this._evaluateFilter(expr);
    } else if (RushProjectSelector.isOperator(expr)) {
      return this._evaluateOperator(expr);
    } else {
      throw new Error(`Unexpected object in selector expression.`);
    }
  }

  public async selectExpressionString(exprString: string): Promise<RushConfigurationProject[]> {
    // Allowed filters can be influenced by Rush plugins in the future.
    const allowedFilters: string[] = ['to', 'from', 'impacted-by', 'only'];

    const expr: ExpressionJson = SelectorExpressionParser.parse(exprString, allowedFilters);
    return this.selectExpression(expr);
  }

  private async _evaluateSelector(selector: ISelectorJson): Promise<RushConfigurationProject[]> {
    const parser: ISelectorParser<RushConfigurationProject> | undefined = this._scopes.get(selector.scope);
    if (!parser) {
      throw new Error(`Unknown selector scope '${selector.scope}' for value '${selector.value}'.`);
    }
    return [
      ...(await parser.evaluateSelectorAsync({
        unscopedSelector: selector.value,
        terminal: undefined as unknown as ITerminal,
        parameterName: 'blah'
      }))
    ];
  }

  private async _evaluateFilter(expr: IFilterJson): Promise<RushConfigurationProject[]> {
    if (expr.filter === 'to') {
      const arg: RushConfigurationProject[] = await this.selectExpression(expr.arg);
      return [...Selection.expandAllDependencies(arg)];
    } else if (expr.filter === 'from') {
      const arg: RushConfigurationProject[] = await this.selectExpression(expr.arg);
      return [...Selection.expandAllDependencies(Selection.expandAllConsumers(arg))];
    } else if (expr.filter === 'only') {
      // "only" is sort of a no-op in a generic selector expression
      const arg: RushConfigurationProject[] = await this.selectExpression(expr.arg);
      return arg;
    } else {
      throw new Error(`Unknown filter '${expr.filter}' encountered in selector expression.`);
    }
  }

  private async _evaluateOperator(expr: IOperatorJson): Promise<RushConfigurationProject[]> {
    if (expr.op === 'not') {
      // Built-in operator
      const result: RushConfigurationProject[] = await this.selectExpression(expr.args[0]);
      return this._rushConfig.projects.filter((p) => !result.includes(p));
    } else if (expr.op === 'and') {
      // Built-in operator
      return [
        ...Selection.intersection(
          new Set(await this.selectExpression(expr.args[0])),
          new Set(await this.selectExpression(expr.args[1]))
        )
      ];
    } else if (expr.op === 'or') {
      // Built-in operator
      return [
        ...Selection.union(
          new Set(await this.selectExpression(expr.args[0])),
          new Set(await this.selectExpression(expr.args[1]))
        )
      ];
    } else {
      throw new Error(`Unknown operator '${expr.op}' in selector expression.`);
    }
  }

  public static isSelector(expr: ExpressionJson): expr is ISelectorJson {
    return !!(expr as ISelectorJson).scope;
  }

  public static isFilter(expr: ExpressionJson): expr is IFilterJson {
    return !!(expr as IFilterJson).filter;
  }

  public static isOperator(expr: ExpressionJson): expr is IOperatorJson {
    return !!(expr as IOperatorJson).op;
  }
}
