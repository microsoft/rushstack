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
  IExpressionOperatorUnion,
  IExpressionOperatorIntersect,
  IExpressionOperatorSubtract,
  isDetailedSelector,
  isParameter,
  isUnion,
  isIntersect,
  isSubtract
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
  private readonly _rushConfig: RushConfiguration;
  private readonly _scopes: Map<string, ISelectorParser<RushConfigurationProject>>;
  private readonly _options: IProjectSelectionOptions;

  public constructor(rushConfig: RushConfiguration, options: IProjectSelectionOptions) {
    this._rushConfig = rushConfig;
    this._options = options;

    const scopes: Map<string, ISelectorParser<RushConfigurationProject>> = new Map();
    scopes.set('name', new NamedProjectSelectorParser(this._rushConfig));
    scopes.set(
      'git',
      new GitChangedProjectSelectorParser(this._rushConfig, this._options.gitSelectorParserOptions)
    );
    scopes.set('tag', new TagProjectSelectorParser(this._rushConfig));
    scopes.set('version-policy', new VersionPolicyProjectSelectorParser(this._rushConfig));
    scopes.set('json', new JsonFileSelectorParser(this._rushConfig, this));
    this._scopes = scopes;
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
  ): Promise<ReadonlySet<RushConfigurationProject>> {
    if (isUnion(expr)) {
      return this._evaluateUnion(expr, context);
    } else if (isIntersect(expr)) {
      return this._evaluateIntersect(expr, context);
    } else if (isSubtract(expr)) {
      return this._evaluateSubtract(expr, context);
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

  private async _evaluateUnion(
    expr: IExpressionOperatorUnion,
    context: string
  ): Promise<Set<RushConfigurationProject>> {
    const results: ReadonlySet<RushConfigurationProject>[] = [];
    for (const operand of expr.union) {
      results.push(await this.selectExpression(operand, context));
    }

    return Selection.union(results[0], ...results.slice(1));
  }

  private async _evaluateIntersect(
    expr: IExpressionOperatorIntersect,
    context: string
  ): Promise<Set<RushConfigurationProject>> {
    const results: ReadonlySet<RushConfigurationProject>[] = [];
    for (const operand of expr.intersect) {
      results.push(await this.selectExpression(operand, context));
    }

    return Selection.intersection(results[0], ...results.slice(1));
  }

  private async _evaluateSubtract(
    expr: IExpressionOperatorSubtract,
    context: string
  ): Promise<Set<RushConfigurationProject>> {
    const results: ReadonlySet<RushConfigurationProject>[] = [];
    for (const operand of expr.subtract) {
      results.push(await this.selectExpression(operand, context));
    }

    return Selection.subtraction(results[0], ...results.slice(1));
  }

  private async _evaluateParameter(
    expr: ExpressionParameter,
    context: string
  ): Promise<ReadonlySet<RushConfigurationProject>> {
    const key: keyof ExpressionParameter = Object.keys(expr)[0] as keyof ExpressionParameter;
    const value: SelectorExpression = expr[key];

    // Existing parameters "--to-version-policy" and "--from-version-policy" are not supported
    // in expressions (prefer `{ "--to": "version-policy:xyz" }`).
    //
    // Existing parameter "--changed-projects-only" is also not supported.

    if (key === '--to') {
      const projects: ReadonlySet<RushConfigurationProject> = await this.selectExpression(value, context);
      return Selection.expandAllDependencies(projects);
    } else if (key === '--from') {
      const projects: ReadonlySet<RushConfigurationProject> = await this.selectExpression(value, context);
      return Selection.expandAllDependencies(Selection.expandAllConsumers(projects));
    } else if (key === '--impacted-by') {
      const projects: ReadonlySet<RushConfigurationProject> = await this.selectExpression(value, context);
      return Selection.expandAllConsumers(projects);
    } else if (key === '--to-except') {
      const projects: ReadonlySet<RushConfigurationProject> = await this.selectExpression(value, context);
      return Selection.subtraction(Selection.expandAllDependencies(projects), projects);
    } else if (key === '--impacted-by-except') {
      const projects: ReadonlySet<RushConfigurationProject> = await this.selectExpression(value, context);
      return Selection.subtraction(Selection.expandAllConsumers(projects), projects);
    } else if (key === '--only') {
      // "only" is a no-op in a generic selector expression
      const projects: ReadonlySet<RushConfigurationProject> = await this.selectExpression(value, context);
      return projects;
    } else {
      throw new SelectorError(`Unknown parameter '${key}' encountered in selector expression in ${context}.`);
    }
  }

  private async _evaluateDetailedSelector(
    expr: IExpressionDetailedSelector,
    context: string
  ): Promise<Set<RushConfigurationProject>> {
    const parser: ISelectorParser<RushConfigurationProject> | undefined = this._scopes.get(expr.scope);
    if (!parser) {
      throw new SelectorError(
        `Unknown selector scope '${expr.scope}' for value '${expr.value}' in ${context}.`
      );
    }

    const result: Set<RushConfigurationProject> = new Set();
    for (const project of await parser.evaluateSelectorAsync({
      unscopedSelector: expr.value,
      terminal: undefined as unknown as ITerminal,
      context: context
    })) {
      result.add(project);
    }

    return result;
  }

  private async _evaluateSimpleSelector(
    expr: string,
    context: string
  ): Promise<Set<RushConfigurationProject>> {
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
