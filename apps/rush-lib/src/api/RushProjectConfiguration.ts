// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal } from '@rushstack/node-core-library';
import { ConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import { RigConfig } from '@rushstack/rig-package';

import { RushConfigurationProject } from './RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';

/**
 * Describes the file structure for the "<project root>/config/rush-project.json" config file.
 */
interface IRushProjectJson {
  /**
   * A list of folder names under the project root that should be cached.
   *
   * These folders should not be tracked by git.
   */
  projectOutputFolderNames: string[];
}

/**
 * Use this class to load the "config/rush-project.json" config file.
 *
 * This file provides project-specific configuration options.
 * @public
 */
export class RushProjectConfiguration {
  private static _projectBuildCacheConfigurationFile: ConfigurationFile<
    IRushProjectJson
  > = new ConfigurationFile<IRushProjectJson>({
    projectRelativeFilePath: `config/${RushConstants.rushProjectConfigFilename}`,
    jsonSchemaPath: path.resolve(__dirname, '..', 'schemas', 'rush-project.schema.json'),
    propertyInheritance: {
      projectOutputFolderNames: {
        inheritanceType: InheritanceType.append
      }
    }
  });

  public readonly project: RushConfigurationProject;

  /**
   * A list of folder names under the project root that should be cached.
   *
   * These folders should not be tracked by git.
   */
  public readonly projectOutputFolderNames: string[];

  private constructor(project: RushConfigurationProject, projectBuildCacheJson: IRushProjectJson) {
    this.project = project;

    this.projectOutputFolderNames = projectBuildCacheJson.projectOutputFolderNames;
  }

  /**
   * Loads the rush-project.json data for the specified project.
   */
  public static async tryLoadForProjectAsync(
    project: RushConfigurationProject,
    terminal: Terminal
  ): Promise<RushProjectConfiguration | undefined> {
    const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
      projectFolderPath: project.projectFolder
    });

    const rushProjectJson:
      | IRushProjectJson
      | undefined = await this._projectBuildCacheConfigurationFile.tryLoadConfigurationFileForProjectAsync(
      terminal,
      project.projectFolder,
      rigConfig
    );

    if (rushProjectJson) {
      RushProjectConfiguration._validateConfiguration(project, rushProjectJson, terminal);
      return new RushProjectConfiguration(project, rushProjectJson);
    } else {
      return undefined;
    }
  }

  private static _validateConfiguration(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    terminal: Terminal
  ): void {
    const invalidFolderNames: string[] = [];
    for (const projectOutputFolder of rushProjectJson.projectOutputFolderNames) {
      if (projectOutputFolder.match(/[\/\\]/)) {
        invalidFolderNames.push(projectOutputFolder);
      }
    }

    if (invalidFolderNames.length > 0) {
      terminal.writeErrorLine(
        `Invalid project configuration for project "${project.packageName}". Entries in ` +
          '"projectOutputFolderNames" must not contain slashes and the following entries do: ' +
          invalidFolderNames.join(', ')
      );
    }
  }
}
