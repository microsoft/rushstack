// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import type {
  PackageExtractor,
  IExtractorProjectConfiguration,
  IExtractorSubspace
} from '@rushstack/package-extractor';

import { BaseRushAction } from './BaseRushAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { PnpmfileConfiguration } from '../../logic/pnpm/PnpmfileConfiguration';
import type { ILogger } from '../../pluginFramework/logging/Logger';
import type {
  DeployScenarioConfiguration,
  IDeployScenarioProjectJson
} from '../../logic/deploy/DeployScenarioConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';

export class DeployAction extends BaseRushAction {
  private readonly _logger: ILogger;
  private readonly _scenario: CommandLineStringParameter;
  private readonly _project: CommandLineStringParameter;
  private readonly _overwrite: CommandLineFlagParameter;
  private readonly _targetFolder: CommandLineStringParameter;
  private readonly _createArchivePath: CommandLineStringParameter;
  private readonly _createArchiveOnly: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'deploy',
      summary:
        'Prepares a deployment by copying a subset of Rush projects and their dependencies' +
        ' to a target folder',
      documentation:
        'After building the repo, "rush deploy" can be used to prepare a deployment by copying' +
        ' a subset of Rush projects and their dependencies to a target folder, which can then be uploaded to' +
        ' a production server.  The "rush deploy" behavior is specified by a scenario config file that must' +
        ' be created first, using the "rush init-deploy" command.',
      parser,

      // It is okay to invoke multiple instances of "rush deploy" simultaneously, if they are writing
      // to different target folders.
      safeForSimultaneousRushProcesses: true
    });

    this._logger = this.rushSession.getLogger('deploy');

    this._project = this.defineStringParameter({
      parameterLongName: '--project',
      parameterShortName: '-p',
      argumentName: 'PROJECT_NAME',
      description:
        'Specifies the name of the main Rush project to be deployed. It must appear in the' +
        ' "deploymentProjectNames" setting in the deployment config file.'
    });

    this._scenario = this.defineStringParameter({
      parameterLongName: '--scenario',
      parameterShortName: '-s',
      argumentName: 'SCENARIO_NAME',
      description:
        'By default, the deployment configuration is specified in "common/config/rush/deploy.json".' +
        ' You can use "--scenario" to specify an alternate name. The name must be lowercase and separated by dashes.' +
        ' For example, if SCENARIO_NAME is "web", then the config file would be "common/config/rush/deploy-web.json".'
    });

    this._overwrite = this.defineFlagParameter({
      parameterLongName: '--overwrite',
      description:
        'By default, deployment will fail if the target folder is not empty.  SPECIFYING THIS FLAG' +
        ' WILL RECURSIVELY DELETE EXISTING CONTENTS OF THE TARGET FOLDER.'
    });

    this._targetFolder = this.defineStringParameter({
      parameterLongName: '--target-folder',
      parameterShortName: '-t',
      argumentName: 'PATH',
      environmentVariable: 'RUSH_DEPLOY_TARGET_FOLDER',
      description:
        'By default, files are deployed to the "common/deploy" folder inside the Rush repo.' +
        ' Use this parameter to specify a different location. ' +
        ' WARNING: USE CAUTION WHEN COMBINING WITH "--overwrite"'
    });

    this._createArchivePath = this.defineStringParameter({
      parameterLongName: '--create-archive',
      argumentName: 'ARCHIVE_PATH',
      description:
        'If specified, after the deployment has been prepared, "rush deploy"' +
        ' will create an archive containing the contents of the target folder.' +
        ' The newly created archive file will be placed according to the designated path, relative' +
        ' to the target folder. Supported file extensions: .zip'
    });

    this._createArchiveOnly = this.defineFlagParameter({
      parameterLongName: '--create-archive-only',
      description:
        'If specified, "rush deploy" will only create an archive containing the contents of the target folder.' +
        ' The target folder will not be modified other than to create the archive file.'
    });
  }

  protected async runAsync(): Promise<void> {
    const scenarioName: string | undefined = this._scenario.value;
    const { DeployScenarioConfiguration } = await import('../../logic/deploy/DeployScenarioConfiguration');
    const scenarioFilePath: string = DeployScenarioConfiguration.getConfigFilePath(
      scenarioName,
      this.rushConfiguration
    );
    const scenarioConfiguration: DeployScenarioConfiguration = DeployScenarioConfiguration.loadFromFile(
      this._logger.terminal,
      scenarioFilePath,
      this.rushConfiguration
    );

    let mainProjectName: string | undefined = this._project.value;
    if (!mainProjectName) {
      if (scenarioConfiguration.json.deploymentProjectNames.length === 1) {
        // If there is only one project, then "--project" is optional
        mainProjectName = scenarioConfiguration.json.deploymentProjectNames[0];
      } else {
        throw new Error(
          `The ${path.basename(scenarioFilePath)} configuration specifies multiple items for` +
            ` "deploymentProjectNames". Use the "--project" parameter to indicate the project to be deployed.`
        );
      }
    } else {
      if (scenarioConfiguration.json.deploymentProjectNames.indexOf(mainProjectName) < 0) {
        throw new Error(
          `The project "${mainProjectName}" does not appear in the list of "deploymentProjectNames"` +
            ` from ${path.basename(scenarioFilePath)}.`
        );
      }
    }

    const targetRootFolder: string = this._targetFolder.value
      ? path.resolve(this._targetFolder.value)
      : path.join(this.rushConfiguration.commonFolder, 'deploy');

    const createArchiveFilePath: string | undefined = this._createArchivePath.value
      ? path.resolve(targetRootFolder, this._createArchivePath.value)
      : undefined;

    const createArchiveOnly: boolean = this._createArchiveOnly.value;

    /**
     * Subspaces that will be involved in deploy process.
     * Each subspace may have its own configurations
     */
    const subspaces: Map<string, IExtractorSubspace> = new Map();

    const rushConfigurationProject: RushConfigurationProject | undefined =
      this.rushConfiguration.getProjectByName(mainProjectName);
    if (!rushConfigurationProject) {
      throw new Error(`The specified deployment project "${mainProjectName}" was not found in rush.json`);
    }

    const projects: RushConfigurationProject[] = this.rushConfiguration.projects;
    if (this.rushConfiguration.isPnpm) {
      const currentlyInstalledVariant: string | undefined =
        await this.rushConfiguration.getCurrentlyInstalledVariantAsync();
      for (const project of projects) {
        const pnpmfileConfiguration: PnpmfileConfiguration = await PnpmfileConfiguration.initializeAsync(
          this.rushConfiguration,
          project.subspace,
          currentlyInstalledVariant
        );
        const subspace: IExtractorSubspace = {
          subspaceName: project.subspace.subspaceName,
          transformPackageJson: pnpmfileConfiguration.transform.bind(pnpmfileConfiguration)
        };

        if (subspaces.has(subspace.subspaceName)) {
          continue;
        }

        if (!scenarioConfiguration.json.omitPnpmWorkaroundLinks) {
          subspace.pnpmInstallFolder = project.subspace.getSubspaceTempFolderPath();
        }
        subspaces.set(subspace.subspaceName, subspace);
      }
    }

    // Construct the project list for the deployer
    const projectConfigurations: IExtractorProjectConfiguration[] = [];
    for (const project of projects) {
      const scenarioProjectJson: IDeployScenarioProjectJson | undefined =
        scenarioConfiguration.projectJsonsByName.get(project.packageName);
      projectConfigurations.push({
        projectName: project.packageName,
        projectFolder: project.projectFolder,
        additionalProjectsToInclude: scenarioProjectJson?.additionalProjectsToInclude,
        additionalDependenciesToInclude: scenarioProjectJson?.additionalDependenciesToInclude,
        dependenciesToExclude: scenarioProjectJson?.dependenciesToExclude,
        patternsToInclude: scenarioProjectJson?.patternsToInclude,
        patternsToExclude: scenarioProjectJson?.patternsToExclude
      });
    }

    // Call the deploy manager
    const { PackageExtractor } = await import(
      /* webpackChunkName: 'PackageExtractor' */
      '@rushstack/package-extractor'
    );
    const deployManager: PackageExtractor = new PackageExtractor();
    await deployManager.extractAsync({
      terminal: this._logger.terminal,
      overwriteExisting: !!this._overwrite.value,
      includeDevDependencies: scenarioConfiguration.json.includeDevDependencies,
      includeNpmIgnoreFiles: scenarioConfiguration.json.includeNpmIgnoreFiles,
      folderToCopy: scenarioConfiguration.json.folderToCopy,
      linkCreation: scenarioConfiguration.json.linkCreation,
      sourceRootFolder: this.rushConfiguration.rushJsonFolder,
      targetRootFolder,
      mainProjectName,
      projectConfigurations,
      dependencyConfigurations: scenarioConfiguration.json.dependencySettings,
      createArchiveFilePath,
      createArchiveOnly,
      subspaces: Array.from(subspaces.values())
    });
  }
}
