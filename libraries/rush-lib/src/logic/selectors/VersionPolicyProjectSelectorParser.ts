// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';
import { SelectorError } from './SelectorError';

export class VersionPolicyProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    context
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    const selection: Set<RushConfigurationProject> = new Set();

    if (!this._rushConfiguration.versionPolicyConfiguration.versionPolicies.has(unscopedSelector)) {
      throw new SelectorError(
        `The version policy "${unscopedSelector}" in ${context} does not exist in version-policies.json.`
      );
    }

    for (const project of this._rushConfiguration.projects) {
      if (project.versionPolicyName === unscopedSelector) {
        selection.add(project);
      }
    }

    return selection;
  }

  public getCompletions(): Iterable<string> {
    return this._rushConfiguration.versionPolicyConfiguration.versionPolicies.keys();
  }
}
