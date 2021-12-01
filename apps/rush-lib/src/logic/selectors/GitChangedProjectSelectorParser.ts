import type { ITerminal } from '@rushstack/node-core-library';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { ISelectorParser } from './ISelectorParser';
import { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';

export class GitChangedProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync(
    unscopedSelector: string,
    terminal: ITerminal,
    parameterName: string,
    forIncrementalBuild: boolean
  ): Promise<Iterable<RushConfigurationProject>> {
    const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this._rushConfiguration);

    if (forIncrementalBuild) {
      return await projectChangeAnalyzer.getChangedProjectsForIncrementalBuildAsync({
        terminal,
        targetBranchName: unscopedSelector
      });
    } else {
      return await projectChangeAnalyzer.getChangedProjectsAsync({
        terminal,
        targetBranchName: unscopedSelector
      });
    }
  }

  public getCompletions(): Iterable<string> {
    return [this._rushConfiguration.repositoryDefaultBranch, 'HEAD~1', 'HEAD'];
  }
}
