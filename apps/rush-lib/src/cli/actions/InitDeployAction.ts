// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as colors from 'colors';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineStringParameter } from '@rushstack/ts-command-line';
import { FileSystem, NewlineKind } from '@rushstack/node-core-library';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { DeployScenarioConfiguration } from '../../logic/deploy/DeployScenarioConfiguration';

export class InitDeployAction extends BaseRushAction {
  private static _CONFIG_TEMPLATE_PATH: string = path.join(
    __dirname,
    '../../../assets/rush-init-deploy/scenario-template.json'
  );
  private _project: CommandLineStringParameter;
  private _scenario: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init-deploy',
      summary: '(EXPERIMENTAL) Creates a deployment scenario config file for use with "rush deploy".',
      documentation:
        '(EXPERIMENTAL) Use this command to initialize a new scenario config file for use with "rush deploy".' +
        ' The default filename is common/config/rush/deploy.json. However, if you need to manage multiple' +
        ' deployments with different settings, you can use use "--scenario" to create additional config files.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._project = this.defineStringParameter({
      parameterLongName: '--project',
      parameterShortName: '-p',
      argumentName: 'PROJECT_NAME',
      required: true,
      description:
        'Specifies the name of the main Rush project to be deployed in this scenario.' +
        ' It will be added to the "deploymentProjectNames" setting.'
    });

    this._scenario = this.defineStringParameter({
      parameterLongName: '--scenario',
      parameterShortName: '-s',
      argumentName: 'SCENARIO',
      description:
        'By default, the deployment configuration will be written to "common/config/rush/deploy.json".' +
        ' You can use "--scenario" to specify an alternate name. The name must be lowercase and separated by dashes.' +
        ' For example, if the name is "web", then the config file would be "common/config/rush/deploy-web.json".'
    });
  }

  protected async run(): Promise<void> {
    const scenarioFilePath: string = DeployScenarioConfiguration.getConfigFilePath(
      this._scenario.value,
      this.rushConfiguration
    );

    if (FileSystem.exists(scenarioFilePath)) {
      throw new Error(
        'The target file already exists:\n' +
          scenarioFilePath +
          '\nIf you intend to replace it, please delete the old file first.'
      );
    }

    console.log(colors.green('Creating scenario file: ') + scenarioFilePath);

    const shortProjectName: string = this._project.value!;
    const rushProject:
      | RushConfigurationProject
      | undefined = this.rushConfiguration.findProjectByShorthandName(shortProjectName);
    if (!rushProject) {
      throw new Error(`The specified project was not found in rush.json: "${shortProjectName}"`);
    }

    const templateContent: string = FileSystem.readFile(InitDeployAction._CONFIG_TEMPLATE_PATH);
    const expandedContent: string = templateContent.replace(
      '[%PROJECT_NAME_TO_DEPLOY%]',
      rushProject.packageName
    );

    FileSystem.writeFile(scenarioFilePath, expandedContent, {
      ensureFolderExists: true,
      convertLineEndings: NewlineKind.OsDefault
    });

    console.log('\nFile successfully written. Please review the file contents before committing.');
  }
}
