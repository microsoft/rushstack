import npmCheck from 'npm-check';
import colors from 'colors/safe';
import inquirer from 'inquirer';

import { RushConfiguration } from '../api/RushConfiguration';
import { upgradeInteractive } from '../utilities/InteractiveUpgradeUI';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

interface IDepsToUpgradeAnswers {
  packages: NpmCheck.INpmCheckPackage[];
}

interface IUpgradeInteractiveDeps {
  projects: RushConfigurationProject[];
  depsToUpgrade: IDepsToUpgradeAnswers;
}

export class InteractiveUpgrader {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async upgrade(): Promise<IUpgradeInteractiveDeps> {
    const { selectProject: rushProject } = await this._getUserSelectedProjectForUpgrade();

    const dependenciesState: NpmCheck.INpmCheckPackage[] = await this._getPackageDependenciesStatus(
      rushProject
    );

    // cast inquirer.Answer type for more type strictness
    const depsToUpgrade: IDepsToUpgradeAnswers = await this._getUserSelectedDependenciesToUpgrade(
      dependenciesState
    );
    return { projects: [rushProject], depsToUpgrade };
  }

  private async _getUserSelectedDependenciesToUpgrade(
    packages: NpmCheck.INpmCheckPackage[]
  ): Promise<IDepsToUpgradeAnswers> {
    return upgradeInteractive(packages) as unknown as IDepsToUpgradeAnswers;
  }

  private async _getUserSelectedProjectForUpgrade(): Promise<{ selectProject: RushConfigurationProject }> {
    const projects: RushConfigurationProject[] | undefined = this._rushConfiguration.projects;

    return inquirer.prompt({
      name: 'selectProject',
      message: 'Select a project you would like to upgrade',
      type: 'list',
      choices: projects.map((project) => {
        return {
          name: colors.green(project.packageName),
          value: project
        };
      })
    });
  }

  private async _getPackageDependenciesStatus(
    rushProject: RushConfigurationProject
  ): Promise<NpmCheck.INpmCheckPackage[]> {
    const { projectFolder } = rushProject;

    const currentState: NpmCheck.INpmCheckCurrentState = await npmCheck({ cwd: projectFolder });

    return currentState.get('packages');
  }
}
