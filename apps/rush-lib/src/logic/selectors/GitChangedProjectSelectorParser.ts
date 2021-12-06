import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { EvaluateSelectorMode, IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';
import { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';

export class GitChangedProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    mode
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this._rushConfiguration);

    switch (mode) {
      case EvaluateSelectorMode.RushChange: {
        return await projectChangeAnalyzer.getProjectsWithChangesAsync({
          terminal,
          targetBranchName: unscopedSelector
        });
      }

      case EvaluateSelectorMode.IncrementalBuild: {
        return await projectChangeAnalyzer.getProjectsImpactedByDiffAsync({
          terminal,
          targetBranchName: unscopedSelector
        });
      }

      default: {
        throw new Error(`Unsupported mode: ${mode}`);
      }
    }
  }

  public getCompletions(): Iterable<string> {
    return [this._rushConfiguration.repositoryDefaultBranch, 'HEAD~1', 'HEAD'];
  }
}
