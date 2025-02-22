import { CommandLineStringListParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import path from 'path';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConnect } from '../../utilities/RushLink';
import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction';
import { Async } from '@rushstack/node-core-library';

export abstract class BaseConnectPackageAction extends BaseRushAction {
  protected readonly _projectList: CommandLineStringListParameter;
  protected readonly _pathParameter: CommandLineStringParameter;
  protected readonly _rushConnect: RushConnect;

  protected constructor(options: IBaseRushActionOptions) {
    super(options);

    this._pathParameter = this.defineStringParameter({
      parameterLongName: '--path',
      argumentName: 'PATH',
      required: true,
      description: 'The filesystem path to the external package to be connected'
    });

    this._projectList = this.defineStringListParameter({
      parameterLongName: '--project',
      required: false,
      argumentName: 'PROJECT',
      description:
        'A list of Rush project names to connect to the external package. ' +
        'If not specified, uses the project in the current working directory.'
    });

    this._rushConnect = RushConnect.loadFromLinkStateFileAsync(this.rushConfiguration);
  }

  protected abstract connectPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string
  ): Promise<void>;

  protected async runAsync(): Promise<void> {
    const linkedPackagePath = path.resolve(this._pathParameter.value!);
    const consumerPackage = this._projectList.values;

    const projectsToLink: Set<RushConfigurationProject> = new Set();
    if (consumerPackage.length > 0) {
      for (const projectName of consumerPackage) {
        const sourceProject = this.rushConfiguration.getProjectByName(projectName);
        if (!sourceProject) {
          throw new Error(`The project "${projectName}" was not found in the "rush.json"`);
        }
        projectsToLink.add(sourceProject);
      }
    } else {
      const currentPackage = this.rushConfiguration.tryGetProjectForPath(process.cwd());
      if (!currentPackage) {
        throw new Error(`No Rush project was found in the current working directory`);
      }
      projectsToLink.add(currentPackage);
    }

    Async.forEachAsync(projectsToLink, async (consumerPackage) => {
      await this.connectPackageAsync(consumerPackage, linkedPackagePath);
    });
  }
}
