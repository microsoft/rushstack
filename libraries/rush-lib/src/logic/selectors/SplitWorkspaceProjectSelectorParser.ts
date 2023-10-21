// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';

import type { IRushConfigurationProjectsFilter, RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';

export class SplitWorkspaceProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    parameterName
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    let selection: RushConfigurationProject[] | undefined;
    let projectsFilter: IRushConfigurationProjectsFilter | undefined;

    switch (unscopedSelector) {
      case 'true': {
        projectsFilter = {
          splitWorkspace: true
        };
        break;
      }
      case 'false': {
        projectsFilter = {
          splitWorkspace: false
        };
      }
    }
    if (projectsFilter) {
      selection = this._rushConfiguration.getFilteredProjects(projectsFilter);
    }
    if (!selection) {
      terminal.writeErrorLine(
        `The split "${unscopedSelector}" passed to "${parameterName}" is not specified for any projects in rush.json.`
      );
      throw new AlreadyReportedError();
    }
    return selection;
  }

  public getCompletions(): Iterable<string> {
    return ['true', 'false'];
  }
}
