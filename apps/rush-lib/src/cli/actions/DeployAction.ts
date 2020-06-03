import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import {
  CommandLineChoiceParameter,
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';
import { DeployManager, LinkCreation } from '../../logic/deploy/DeployManager';
import { InternalError } from '@rushstack/node-core-library';

export class DeployAction extends BaseRushAction {
  private _projectName: CommandLineStringParameter;
  private _includeDevDependencies: CommandLineFlagParameter;
  private _includeNpmIgnoreFiles: CommandLineFlagParameter;
  private _linkCreation: CommandLineChoiceParameter;
  private _scenario: CommandLineStringParameter;
  private _overwrite: CommandLineFlagParameter;
  private _targetFolder: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'deploy',
      summary: '(EXPERIMENTAL) Copy a subset of Rush projects and their dependencies to a deployment folder',
      documentation: '(EXPERIMENTAL) After building the repo, "rush deploy" can be used to copy a subset of'
        + ' Rush projects and their dependencies to a deployment target folder, which can then be copied to'
        + ' a production machine.  The default "rush deploy" behavior takes a project name, while custom deploy'
        + ' behavior can be specified by a scenario config file located under the "common/config/deploy" folder.'
        + ' Use the "rush init-deploy" command to create a new config file for custom deployments.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._projectName = this.defineStringParameter({
      parameterLongName: '--project-name',
      parameterShortName: '-p',
      argumentName: 'PROJECT_NAME',
      description:
        'Specifies the name of the project to deploy. ' +
        'This project must be defined in rush.json. ' +
        'This and --scenario are mutually exclusive, and one is required.'
    });

    this._scenario = this.defineStringParameter({
      parameterLongName: '--scenario',
      parameterShortName: '-s',
      argumentName: 'SCENARIO',
      description:
        'Specifies the name of a config file describing the deployment. ' +
        'For example if SCENARIO is "web", the input file is: common/config/deploy/web.json. ' +
        'This and --project-name are mutually exclusive, and one is required.'
    });

    this._includeDevDependencies = this.defineFlagParameter({
      parameterLongName: '--include-dev-dependencies',
      description:
        'By default, dev dependencies are not included in the deployment. ' +
        'This option is only valid when --project-name is specified.'
    });

    this._includeNpmIgnoreFiles = this.defineFlagParameter({
      parameterLongName: '--include-npm-ignore-files',
      description:
        'By default, files in .npmignore are not included in the deployment. ' +
        'This option is only valid when --project-name is specified.'
    });

    this._linkCreation = this.defineChoiceParameter({
      parameterLongName: '--link-creation',
      description:
        'Specify how links (symbolic links, hard links, and/or NTFS junctions) will be created ' +
        'in the deployed folder. "default": Create the links while copying the files; this is ' +
        'the default behavior. "script": A Node.js script called "create-links.js" will be ' +
        'written. When executed, this script will create the links described in the ' +
        '"deploy-metadata.json" output file. "none": Do nothing; some other tool may create the ' +
        'links later. This option is only valid when --project-name is specified.',
      alternatives: ['default', 'none', 'script'],
    })

    this._overwrite = this.defineFlagParameter({
      parameterLongName: '--overwrite',
      description:
        'By default, deployment will fail if the target folder is not empty. SPECIFYING THIS ' +
        'FLAG WILL RECURSIVELY DELETE EXISTING CONTENTS OF THE TARGET FOLDER.'
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
    if (this._projectName.value === undefined) {
      deployManager.deployProject(
        this._projectName.value!,
        this._includeDevDependencies.value,
        this._includeNpmIgnoreFiles.value,
        this._linkCreation.value as LinkCreation,
        !!this._overwrite.value,
        this._targetFolder.value
      );
    } else {
      if (this._scenario.value === undefined) {
        throw new InternalError('--project-name or --scenario must be provided.')
      }
      deployManager.deployScenario(
        this._scenario.value!,
        !!this._overwrite.value,
        this._targetFolder.value
      );
    }
  }
}
