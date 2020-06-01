import * as path from 'path';
import * as colors from 'colors';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineStringParameter } from '@rushstack/ts-command-line';
import { DeployManager } from '../../logic/deploy/DeployManager';
import { FileSystem, NewlineKind } from '@rushstack/node-core-library';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';

export class InitDeployAction extends BaseRushAction {
  private static _CONFIG_TEMPLATE_PATH: string = path.join(__dirname, '../../../assets/rush-deploy-init/scenario-template.json');
  private _scenario: CommandLineStringParameter;
  private _project: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init-deploy',
      summary: 'Create the config file for a new deployment scenario.',
      documentation: 'The deployment config files are stored under "common/config/deploy" and are used'
        + ' to configure behavior of the "rush deploy" command.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._scenario = this.defineStringParameter({
      parameterLongName: '--scenario',
      parameterShortName: '-s',
      argumentName: 'SCENARIO',
      required: true,
      description:
        'Specifies the name of the config file describing the deployment. ' +
        'The name must be lower case and separated by dashes.  Example: "production-web"'
    });
    this._project = this.defineStringParameter({
      parameterLongName: '--project',
      parameterShortName: '-p',
      argumentName: 'PROJECT_NAME',
      required: true,
      description: 'Specifies the name of the main Rush project to be deployed in this scenario.'
    });
  }

  protected async run(): Promise<void> {
    const scenarioName: string = this._scenario.value!;
    DeployManager.validateScenarioName(scenarioName);

    const scenarioFilePath: string = path.join(
      this.rushConfiguration.commonFolder,
      'config/deploy-scenarios',
      `${scenarioName}.json
    );

    if (FileSystem.exists(scenarioFilePath)) {
      throw new Error('The target file already exists:\n' + scenarioFilePath +
        '\nIf you intend to replace it, please delete the old file first.');
    }

    console.log(colors.green('Creating scenario file: ') + scenarioFilePath);

    const shortProjectName: string = this._project.value!;
    const rushProject: RushConfigurationProject | undefined
      = this.rushConfiguration.findProjectByShorthandName(shortProjectName);
    if (!rushProject) {
      throw new Error(`The specified project was not found in rush.json: "${shortProjectName}"`);
    }

    const templateContent: string = FileSystem.readFile(InitDeployAction._CONFIG_TEMPLATE_PATH);
    const expandedContent: string = templateContent.replace('[%PROJECT_NAME_TO_DEPLOY%]', rushProject.packageName);

    FileSystem.writeFile(scenarioFilePath, expandedContent, {
      ensureFolderExists: true,
      convertLineEndings: NewlineKind.OsDefault
    });

    console.log('\nFile successfully written. Please review the file contents before committing.');
  }
}
