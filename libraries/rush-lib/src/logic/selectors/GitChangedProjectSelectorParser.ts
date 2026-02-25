// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser.ts';
import { type IGetChangedProjectsOptions, ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer.ts';

export interface IGitSelectorParserOptions {
  /**
   * If set to `true`, consider a project's external dependency installation layout as defined in the
   * package manager lockfile when determining if it has changed.
   */
  includeExternalDependencies: boolean;

  /**
   * If set to `true` apply the `incrementalBuildIgnoredGlobs` property in a project's `rush-project.json`
   * and exclude matched files from change detection.
   */
  enableFiltering: boolean;
}

export class GitChangedProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _options: IGitSelectorParserOptions;

  public constructor(rushConfiguration: RushConfiguration, options: IGitSelectorParserOptions) {
    this._rushConfiguration = rushConfiguration;
    this._options = options;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this._rushConfiguration);

    const options: IGetChangedProjectsOptions = {
      terminal,
      targetBranchName: unscopedSelector,
      ...this._options
    };

    return await projectChangeAnalyzer.getChangedProjectsAsync(options);
  }

  public getCompletions(): Iterable<string> {
    return [this._rushConfiguration.repositoryDefaultBranch, 'HEAD~1', 'HEAD'];
  }
}
