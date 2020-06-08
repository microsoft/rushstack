import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import { DeployManager } from '../../logic/deploy/DeployManager';

export class DeployAction extends BaseRushAction {
  private _scenario: CommandLineStringParameter;
  private _overwrite: CommandLineFlagParameter;
  private _targetFolder: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'deploy',
      summary: '(EXPERIMENTAL) Copy a subset of Rush projects and their dependencies to a deployment folder',
      documentation: '(EXPERIMENTAL) After building the repo, "rush deploy" can be used to copy a subset of'
        + ' Rush projects and their dependencies to a deployment target folder, which can then be copied to'
        + ' a production machine.  The "rush deploy" behavior is specified by a scenario config file located under'
        + ' the "common/config/deploy" folder. You can define multiple scenarios. Use the "rush init-deploy" command'
        + ' to create a new config file.',
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
        'Specifies the name of a config file describing the deployment. ' +
        'For example if SCENARIO is "web", the input file is: common/config/deploy/web.json'
    });

    this._overwrite = this.defineFlagParameter({
      parameterLongName: '--overwrite',
      description:
        'By default, deployment will fail if the target folder is not empty.  SPECIFYING THIS FLAG ' +
        'WILL RECURSIVELY DELETE EXISTING CONTENTS OF THE TARGET FOLDER.'
    });

    this._targetFolder = this.defineStringParameter({
      parameterLongName: '--target-folder',
      parameterShortName: '-t',
      argumentName: 'PATH',
      environmentVariable: 'RUSH_DEPLOY_TARGET_FOLDER',
      description:
        'By default, files are deployed to the common/deploy folder inside the Rush repo.' +
        ' Use this parameter to specify a different location. ' +
        ' WARNING: USE CAUTION WHEN COMBINING WITH "--overwrite"'
    });
  }

  protected async run(): Promise<void> {
    const deployManager: DeployManager = new DeployManager(this.rushConfiguration);
    deployManager.deployScenario(this._scenario.value!, !!this._overwrite.value, this._targetFolder.value);
  }
}
