// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

import { RushConfigurationProject } from './RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import { BuildCacheConfiguration } from './BuildCacheConfiguration';

/**
 * Describes the file structure for the "<project root>/.rush/build-cache.json" config file.
 */
interface IProjectBuildCacheJson {}

interface IAdditionalOutputFoldersProjectBuildCacheJson extends IProjectBuildCacheJson {
  /**
   * A list of folder names under the project root that should be cached, in addition to those
   * listed in common/config/rush/build-cache.json projectOutputFolderNames property.
   *
   * These folders should not be tracked by git.
   */
  additionalProjectOutputFolderNames: string[];
}

interface IOutputFoldersProjectBuildCacheJson extends IProjectBuildCacheJson {
  /**
   * A list of folder names under the project root that should be cached instead of those
   * listed in common/config/rush/build-cache.json projectOutputFolderNames property.
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
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '..', 'schemas', 'project-build-cache.schema.json')
  );

  public readonly project: RushConfigurationProject;

  public readonly projectOutputFolders: string[];

  private constructor(
    project: RushConfigurationProject,
    projectBuildCacheJson: IProjectBuildCacheJson | undefined,
    buildCacheConfiguration: BuildCacheConfiguration
  ) {
    this.project = project;
    if (projectBuildCacheJson) {
      const additionalConfiguration: IAdditionalOutputFoldersProjectBuildCacheJson = projectBuildCacheJson as IAdditionalOutputFoldersProjectBuildCacheJson;
      const replacementConfiguration: IOutputFoldersProjectBuildCacheJson = projectBuildCacheJson as IOutputFoldersProjectBuildCacheJson;
      if (additionalConfiguration.additionalProjectOutputFolderNames) {
        this.projectOutputFolders = [
          ...buildCacheConfiguration.projectOutputFolderNames,
          ...additionalConfiguration.additionalProjectOutputFolderNames
        ];
      } else if (replacementConfiguration.projectOutputFolderNames) {
        this.projectOutputFolders = replacementConfiguration.projectOutputFolderNames;
      } else {
        throw new Error(
          'Expected a "additionalProjectOutputFolderNames" or a "projectOutputFolderNames" property.'
        );
      }
    } else {
      this.projectOutputFolders = buildCacheConfiguration.projectOutputFolderNames;
    }
  }

  /**
   * Loads the build-cache.json data for the specified project.
   */
  public static loadForProject(
    project: RushConfigurationProject,
    buildCacheConfiguration: BuildCacheConfiguration
  ): ProjectBuildCacheConfiguration {
    const jsonFilePath: string = path.join(project.projectRushConfigFolder, RushConstants.buildCacheFilename);
    let projectBuildCacheJson: IProjectBuildCacheJson | undefined;
    if (FileSystem.exists(jsonFilePath)) {
      projectBuildCacheJson = JsonFile.loadAndValidate(
        jsonFilePath,
        ProjectBuildCacheConfiguration._jsonSchema
      );
    }

    return new ProjectBuildCacheConfiguration(project, projectBuildCacheJson, buildCacheConfiguration);
  }
}
