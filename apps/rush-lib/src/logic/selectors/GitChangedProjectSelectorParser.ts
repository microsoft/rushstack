import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';
import { IGetChangedProjectsOptions, ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';

export interface IGitSelectorParserOptions {
  includeLockfile: boolean;
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
