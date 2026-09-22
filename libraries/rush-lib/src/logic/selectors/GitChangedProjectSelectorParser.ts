// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';
import { type IGetChangedProjectsOptions, ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';

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
  readonly #rushConfiguration: RushConfiguration;
  readonly #options: IGitSelectorParserOptions;

  public constructor(rushConfiguration: RushConfiguration, options: IGitSelectorParserOptions) {
    this.#rushConfiguration = rushConfiguration;
    this.#options = options;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this.#rushConfiguration);

    const options: IGetChangedProjectsOptions = {
      terminal,
      targetBranchName: unscopedSelector,
      ...this.#options
    };

    return await projectChangeAnalyzer.getChangedProjectsAsync(options);
  }

  public getCompletions(): Iterable<string> {
    return [this.#rushConfiguration.repositoryDefaultBranch, 'HEAD~1', 'HEAD'];
  }
}
