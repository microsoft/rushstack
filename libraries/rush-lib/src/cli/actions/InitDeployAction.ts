// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, NewlineKind } from '@rushstack/node-core-library';
import type {
  CommandLineStringParameter,
  IRequiredCommandLineStringParameter
} from '@rushstack/ts-command-line';
import { Colorize } from '@rushstack/terminal';

import { BaseRushAction } from './BaseRushAction.ts';
import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import { DeployScenarioConfiguration } from '../../logic/deploy/DeployScenarioConfiguration.ts';
import { assetsFolderPath } from '../../utilities/PathConstants.ts';
import { RushConstants } from '../../logic/RushConstants.ts';

const CONFIG_TEMPLATE_PATH: string = `${assetsFolderPath}/rush-init-deploy/scenario-template.json`;

export class InitDeployAction extends BaseRushAction {
  private readonly _project: IRequiredCommandLineStringParameter;
  private readonly _scenario: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init-deploy',
      summary: 'Creates a deployment scenario config file for use with "rush deploy".',
      documentation:
        'Use this command to initialize a new scenario config file for use with "rush deploy".' +
        ' The default filename is common/config/rush/deploy.json. However, if you need to manage multiple' +
        ' deployments with different settings, you can use use "--scenario" to create additional config files.',
      parser
    });

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

  protected async runAsync(): Promise<void> {
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

    // eslint-disable-next-line no-console
    console.log(Colorize.green('Creating scenario file: ') + scenarioFilePath);

    const shortProjectName: string = this._project.value;
    const rushProject: RushConfigurationProject | undefined =
      this.rushConfiguration.findProjectByShorthandName(shortProjectName);
    if (!rushProject) {
      throw new Error(
        `The specified project was not found in ${RushConstants.rushJsonFilename}: "${shortProjectName}"`
      );
    }

    const templateContent: string = FileSystem.readFile(CONFIG_TEMPLATE_PATH);
    const expandedContent: string = templateContent.replace(
      '[%PROJECT_NAME_TO_DEPLOY%]',
      rushProject.packageName
    );

    FileSystem.writeFile(scenarioFilePath, expandedContent, {
      ensureFolderExists: true,
      convertLineEndings: NewlineKind.OsDefault
    });

    // eslint-disable-next-line no-console
    console.log('\nFile successfully written. Please review the file contents before committing.');
  }
}
