// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal } from '@rushstack/node-core-library';
import { ConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import { RigConfig } from '@rushstack/rig-package';

import { RushConfigurationProject } from './RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';

/**
 * Describes the file structure for the "<project root>/config/rush/build-cache.json" config file.
 */
interface IProjectBuildCacheJson {
  /**
   * A list of folder names under the project root that should be cached.
   *
   * These folders should not be tracked by git.
   */
  projectOutputFolderNames: string[];
}

/**
 * Use this class to load and save the "common/config/rush/build-cache.json" config file.
 * This file provides configuration options for cached project build output.
 * @public
 */
export class ProjectBuildCacheConfiguration {
  private static _projectBuildCacheConfigurationFile: ConfigurationFile<
    IProjectBuildCacheJson
  > = new ConfigurationFile<IProjectBuildCacheJson>({
    projectRelativeFilePath: `config/rush/${RushConstants.buildCacheFilename}`,
    jsonSchemaPath: path.resolve(__dirname, '..', 'schemas', 'project-build-cache.schema.json'),
    propertyInheritance: {
      projectOutputFolderNames: {
        inheritanceType: InheritanceType.append
      }
    }
  });

  public readonly project: RushConfigurationProject;

  public readonly projectOutputFolders: string[];

  private constructor(project: RushConfigurationProject, projectBuildCacheJson: IProjectBuildCacheJson) {
    this.project = project;
    this.projectOutputFolders = projectBuildCacheJson.projectOutputFolderNames;
  }

  /**
   * Loads the build-cache.json data for the specified project.
   */
  public static async tryLoadForProjectAsync(
    project: RushConfigurationProject,
    terminal: Terminal
  ): Promise<ProjectBuildCacheConfiguration | undefined> {
    const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
      projectFolderPath: project.projectFolder
    });

    const projectBuildCacheJson:
      | IProjectBuildCacheJson
      | undefined = await this._projectBuildCacheConfigurationFile.tryLoadConfigurationFileForProjectAsync(
      terminal,
      project.projectFolder,
      rigConfig
    );

    if (projectBuildCacheJson) {
      return new ProjectBuildCacheConfiguration(project, projectBuildCacheJson);
    } else {
      return undefined;
    }
  }
}
