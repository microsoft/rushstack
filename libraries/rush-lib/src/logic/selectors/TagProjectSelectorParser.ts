// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';
import { SelectorError } from './SelectorError';

export class TagProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    context
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    const selection: ReadonlySet<RushConfigurationProject> | undefined =
      this._rushConfiguration.projectsByTag.get(unscopedSelector);
    if (!selection) {
      throw new SelectorError(
        `The tag "${unscopedSelector}" in ${context} is not specified for any projects in rush.json.`
      );
    }
    return selection;
  }

  public getCompletions(): Iterable<string> {
    return this._rushConfiguration.projectsByTag.keys();
  }
}
