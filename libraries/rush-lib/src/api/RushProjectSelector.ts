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
import { JsonFileSelectorParser } from '../logic/selectors/JsonFileSelectorParser';
import { SelectorError } from '../logic/selectors/SelectorError';
import {
  SelectorExpression,
  IExpressionDetailedSelector,
  ExpressionParameter,
  IExpressionOperatorAnd,
  IExpressionOperatorOr,
  IExpressionOperatorNot,
  isDetailedSelector,
  isParameter,
  isAnd,
  isOr,
  isNot
} from './SelectorExpressions';

/**
 * When preparing to select projects in a Rush monorepo, some selector scopes
 * require additional configuration in order to control their behavior. This
 * options interface allows the caller to provide these properties.
 */
export interface IProjectSelectionOptions {
  /**
   * Options required for configuring the git selector scope.
   */
  gitSelectorParserOptions: IGitSelectorParserOptions;
}

/**
 * A central interface for selecting a subset of Rush projects from a given monorepo,
 * using standardized selector expressions. Note that the types of selectors available
 * in a monorepo may be influenced in the future by plugins, so project selection
 * is always done in the context of a particular Rush configuration.
 */
export class RushProjectSelector {
  private _rushConfig: RushConfiguration;
  private _scopes: Map<string, ISelectorParser<RushConfigurationProject>> = new Map();
  private _options: IProjectSelectionOptions;

  public constructor(rushConfig: RushConfiguration, options: IProjectSelectionOptions) {
    this._rushConfig = rushConfig;
    this._options = options;

    this._scopes.set('name', new NamedProjectSelectorParser(this._rushConfig));
    this._scopes.set(
      'git',
      new GitChangedProjectSelectorParser(this._rushConfig, this._options.gitSelectorParserOptions)
    );
    this._scopes.set('tag', new TagProjectSelectorParser(this._rushConfig));
    this._scopes.set('version-policy', new VersionPolicyProjectSelectorParser(this._rushConfig));
    this._scopes.set('json', new JsonFileSelectorParser(this._rushConfig, this));
  }

  /**
   * Select a set of projects using the passed selector expression.
   *
   * The passed context string is used only when constructing error messages, in the event of
   * an error in user input. The default string "expression" is used if no context is provided.
   */
  public async selectExpression(
    expr: SelectorExpression,
    context: string = 'expression'
  ): Promise<RushConfigurationProject[]> {
    if (isAnd(expr)) {
      return this._evaluateAnd(expr, context);
    } else if (isOr(expr)) {
      return this._evaluateOr(expr, context);
    } else if (isNot(expr)) {
      return this._evaluateNot(expr, context);
    } else if (isParameter(expr)) {
      return this._evaluateParameter(expr, context);
    } else if (isDetailedSelector(expr)) {
      return this._evaluateDetailedSelector(expr, context);
    } else if (typeof expr === 'string') {
      return this._evaluateSimpleSelector(expr, context);
    } else {
      // Fail-safe... in general, this shouldn't be possible, as user script type checking
      // or JSON schema validation should catch it before this point.
      throw new SelectorError(`Invalid object encountered in selector expression in ${context}.`);
    }
  }

  private async _evaluateAnd(
    expr: IExpressionOperatorAnd,
    context: string
  ): Promise<RushConfigurationProject[]> {
    const result: Array<RushConfigurationProject>[] = [];
    for (const operand of expr.and) {
      result.push(await this.selectExpression(operand, context));
    }
    return [...Selection.intersection(new Set(result[0]), ...result.slice(1).map((x) => new Set(x)))];
  }

  private async _evaluateOr(
    expr: IExpressionOperatorOr,
    context: string
  ): Promise<RushConfigurationProject[]> {
    const result: Array<RushConfigurationProject>[] = [];
    for (const operand of expr.or) {
      result.push(await this.selectExpression(operand, context));
    }
    return [...Selection.union(new Set(result[0]), ...result.slice(1).map((x) => new Set(x)))];
  }

  private async _evaluateNot(
    expr: IExpressionOperatorNot,
    context: string
  ): Promise<RushConfigurationProject[]> {
    const result: RushConfigurationProject[] = await this.selectExpression(expr.not, context);
    return this._rushConfig.projects.filter((p) => !result.includes(p));
  }

  private async _evaluateParameter(
    expr: ExpressionParameter,
    context: string
  ): Promise<RushConfigurationProject[]> {
    const key: string = Object.keys(expr)[0];

    if (key === '--to') {
      const arg: RushConfigurationProject[] = await this.selectExpression(expr[key], context);
      return [...Selection.expandAllDependencies(arg)];
    } else if (key === '--from') {
      const arg: RushConfigurationProject[] = await this.selectExpression(expr[key], context);
      return [...Selection.expandAllDependencies(Selection.expandAllConsumers(arg))];
    } else if (key === '--only') {
      // "only" is a no-op in a generic selector expression
      const arg: RushConfigurationProject[] = await this.selectExpression(expr[key], context);
      return arg;
    } else {
      throw new SelectorError(`Unknown parameter '${key}' encountered in selector expression in ${context}.`);
    }
  }

  private async _evaluateDetailedSelector(
    expr: IExpressionDetailedSelector,
    context: string
  ): Promise<RushConfigurationProject[]> {
    const parser: ISelectorParser<RushConfigurationProject> | undefined = this._scopes.get(expr.scope);
    if (!parser) {
      throw new SelectorError(
        `Unknown selector scope '${expr.scope}' for value '${expr.value}' in ${context}.`
      );
    }
    return [
      ...(await parser.evaluateSelectorAsync({
        unscopedSelector: expr.value,
        terminal: undefined as unknown as ITerminal,
        context: context
      }))
    ];
  }

  private async _evaluateSimpleSelector(expr: string, context: string): Promise<RushConfigurationProject[]> {
    const index: number = expr.indexOf(':');

    if (index === -1) {
      return this._evaluateDetailedSelector({ scope: 'name', value: expr }, context);
    }

    return this._evaluateDetailedSelector(
      {
        scope: expr.slice(0, index),
        value: expr.slice(index + 1)
      },
      context
    );
  }
}
