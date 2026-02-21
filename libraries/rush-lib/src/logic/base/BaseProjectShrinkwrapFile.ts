// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile } from '@rushstack/node-core-library';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import { RushConstants } from '../RushConstants.ts';
import type { BaseShrinkwrapFile } from './BaseShrinkwrapFile.ts';

/**
 * This class handles creating the project/.rush/temp/shrinkwrap-deps.json file
 * which tracks the direct and indirect dependencies that a project consumes. This is used
 * to better determine which projects should be rebuilt when dependencies are updated.
 */
export abstract class BaseProjectShrinkwrapFile<TShrinkwrapFile extends BaseShrinkwrapFile> {
  public readonly projectShrinkwrapFilePath: string;
  protected readonly project: RushConfigurationProject;

  /**
   * The shrinkwrap file that the project shrinkwrap file is based off of.
   */
  protected readonly shrinkwrapFile: TShrinkwrapFile;

  public constructor(shrinkwrapFile: TShrinkwrapFile, project: RushConfigurationProject) {
    this.project = project;
    this.projectShrinkwrapFilePath = BaseProjectShrinkwrapFile.getFilePathForProject(this.project);

    this.shrinkwrapFile = shrinkwrapFile;
  }

  /**
   * Save an empty project shrinkwrap file. This is used in repos with no dependencies.
   */
  public static async saveEmptyProjectShrinkwrapFileAsync(project: RushConfigurationProject): Promise<void> {
    const projectShrinkwrapFilePath: string = BaseProjectShrinkwrapFile.getFilePathForProject(project);
    await JsonFile.saveAsync({}, projectShrinkwrapFilePath, { ensureFolderExists: true });
  }

  /**
   * Get the fully-qualified path to the <project>/.rush/temp/shrinkwrap-deps.json
   * for the specified project.
   */
  public static getFilePathForProject(project: RushConfigurationProject): string {
    return `${project.projectRushTempFolder}/${RushConstants.projectShrinkwrapFilename}`;
  }

  /**
   * If the <project>/.rush/temp/shrinkwrap-deps.json file exists, delete it. Otherwise, do nothing.
   */
  public async deleteIfExistsAsync(): Promise<void> {
    await FileSystem.deleteFileAsync(this.projectShrinkwrapFilePath, { throwIfNotExists: false });
  }

  /**
   * Generate and write the project shrinkwrap file to <project>/.rush/temp/shrinkwrap-deps.json.
   *
   * @virtual
   */
  public abstract updateProjectShrinkwrapAsync(): Promise<void>;
}
