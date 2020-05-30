import * as path from 'path';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineStringParameter } from '@rushstack/ts-command-line';
import { DeployManager } from '../../logic/deploy/DeployManager';
import { FileSystem } from '@rushstack/node-core-library';

export class InitDeployAction extends BaseRushAction {
  private static _CONFIG_TEMPLATE_PATH: string = path.join(__dirname, '../../../assets/rush-deploy-init/scenario-template.json');
  private _scenario: CommandLineStringParameter;

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
  }

  protected async run(): Promise<void> {
    const scenarioName: string = this._scenario.value!;
    DeployManager.validateScenarioName(scenarioName);

    const scenarioFilePath: string = path.join(this.rushConfiguration.commonFolder, 'config/deploy-scenarios',
      scenarioName + '.json');

    if (FileSystem.exists(scenarioFilePath)) {
      throw new Error('The target file already exists:\n' + scenarioFilePath +
        '\nIf you intend to replace it, please delete the old file first.');
    }

    console.log('Creating ' + scenarioFilePath);

    FileSystem.ensureFolder(path.dirname(scenarioFilePath));

    FileSystem.copyFile({
      sourcePath: InitDeployAction._CONFIG_TEMPLATE_PATH,
      destinationPath: scenarioFilePath
    });

    console.log('\nPlease edit this file to define your deployment scenario.');
  }
}
