// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import schemaJson from '../../schemas/deploy-scenario.schema.json';
import { RushConstants } from '../RushConstants.ts';

// Describes IDeployScenarioJson.projectSettings
export interface IDeployScenarioProjectJson {
  projectName: string;
  additionalProjectsToInclude?: string[];
  additionalDependenciesToInclude?: string[];
  dependenciesToExclude?: string[];
  patternsToInclude?: string[];
  patternsToExclude?: string[];
}

export interface IDeployScenarioDependencyJson {
  dependencyName: string;
  dependencyVersionRange: string;
  patternsToExclude?: string[];
  patternsToInclude?: string[];
}

// The parsed JSON file structure, as defined by the "deploy-scenario.schema.json" JSON schema
export interface IDeployScenarioJson {
  deploymentProjectNames: string[];
  includeDevDependencies?: boolean;
  includeNpmIgnoreFiles?: boolean;
  omitPnpmWorkaroundLinks?: boolean;
  linkCreation?: 'default' | 'script' | 'none';
  folderToCopy?: string;
  projectSettings?: IDeployScenarioProjectJson[];
  dependencySettings?: IDeployScenarioDependencyJson[];
}

export class DeployScenarioConfiguration {
  // Used by validateScenarioName()
  // Matches lowercase words separated by dashes.
  // Example: "deploy-the-thing123"
  private static _scenarioNameRegExp: RegExp = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  public readonly json: IDeployScenarioJson;

  /**
   * Used to lookup items in IDeployScenarioJson.projectSettings based on their IDeployScenarioProjectJson.projectName
   */
  public readonly projectJsonsByName: Map<string, IDeployScenarioProjectJson>;

  private constructor(
    json: IDeployScenarioJson,
    projectJsonsByName: Map<string, IDeployScenarioProjectJson>
  ) {
    this.json = json;
    this.projectJsonsByName = projectJsonsByName;
  }

  /**
   * Validates that the input string conforms to the naming rules for a "rush deploy" scenario name.
   */
  public static validateScenarioName(scenarioName: string): void {
    if (!scenarioName) {
      throw new Error('The scenario name cannot be an empty string');
    }
    if (!this._scenarioNameRegExp.test(scenarioName)) {
      throw new Error(
        `"${scenarioName}" is not a valid scenario name. The name must be comprised of` +
          ' lowercase letters and numbers, separated by single hyphens. Example: "my-scenario"'
      );
    }
  }

  /**
   * Given the --scenarioName value, return the full path of the filename.
   *
   * Example: "ftp-site" --> "...common/config/rush/deploy-ftp-site.json"
   * Example: undefined --> "...common/config/rush/deploy.json"
   */
  public static getConfigFilePath(
    scenarioName: string | undefined,
    rushConfiguration: RushConfiguration
  ): string {
    let scenarioFileName: string;
    if (scenarioName) {
      DeployScenarioConfiguration.validateScenarioName(scenarioName);
      scenarioFileName = `deploy-${scenarioName}.json`;
    } else {
      scenarioFileName = `deploy.json`;
    }

    return path.join(rushConfiguration.commonRushConfigFolder, scenarioFileName);
  }

  public static loadFromFile(
    terminal: ITerminal,
    scenarioFilePath: string,
    rushConfiguration: RushConfiguration
  ): DeployScenarioConfiguration {
    if (!FileSystem.exists(scenarioFilePath)) {
      throw new Error('The scenario config file was not found: ' + scenarioFilePath);
    }

    terminal.writeLine(Colorize.cyan(`Loading deployment scenario: ${scenarioFilePath}`));

    const deployScenarioJson: IDeployScenarioJson = JsonFile.loadAndValidate(
      scenarioFilePath,
      DeployScenarioConfiguration._jsonSchema
    );

    // Apply the defaults
    if (!deployScenarioJson.linkCreation) {
      deployScenarioJson.linkCreation = 'default';
    }

    const deployScenarioProjectJsonsByName: Map<string, IDeployScenarioProjectJson> = new Map();

    for (const projectSetting of deployScenarioJson.projectSettings || []) {
      // Validate projectSetting.projectName
      if (!rushConfiguration.getProjectByName(projectSetting.projectName)) {
        throw new Error(
          `The "projectSettings" section refers to the project name "${projectSetting.projectName}"` +
            ` which was not found in ${RushConstants.rushJsonFilename}`
        );
      }
      for (const additionalProjectsToInclude of projectSetting.additionalProjectsToInclude || []) {
        if (!rushConfiguration.getProjectByName(projectSetting.projectName)) {
          throw new Error(
            `The "additionalProjectsToInclude" setting refers to the` +
              ` project name "${additionalProjectsToInclude}" which was not found in ${RushConstants.rushJsonFilename}`
          );
        }
      }
      deployScenarioProjectJsonsByName.set(projectSetting.projectName, projectSetting);
    }
    return new DeployScenarioConfiguration(deployScenarioJson, deployScenarioProjectJsonsByName);
  }
}
