// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';

export class SubspaceSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    this._rushConfiguration.validateSubspaceName(unscopedSelector);

    return this._rushConfiguration.getSubspaceProjects(unscopedSelector);
  }

  public getCompletions(): Iterable<string> {
    return this._rushConfiguration.subspaceNames;
  }
}
