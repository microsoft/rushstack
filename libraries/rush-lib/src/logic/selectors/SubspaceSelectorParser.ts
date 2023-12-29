import { RushConfiguration } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';

export class SubspaceSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    parameterName
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    this._rushConfiguration.validateSubspaceName(unscopedSelector);

    return this._rushConfiguration.getSubspaceProjects(unscopedSelector);
  }

  public getCompletions(): Iterable<string> {
    return this._rushConfiguration.subspaceNames;
  }
}
