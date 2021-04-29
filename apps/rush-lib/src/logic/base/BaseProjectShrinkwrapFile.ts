// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../RushConstants';
import { BaseShrinkwrapFile } from './BaseShrinkwrapFile';

/**
 * This class handles creating the project/.rush/temp/shrinkwrap-deps.json file
 * which tracks the direct and indirect dependencies that a project consumes. This is used
 * to better determine which projects should be rebuilt when dependencies are updated.
 */
export abstract class BaseProjectShrinkwrapFile {
  private readonly _projectShrinkwrapFilename: string;
  private readonly _shrinkwrapFile: BaseShrinkwrapFile;
  private readonly _project: RushConfigurationProject;

  public constructor(shrinkwrapFile: BaseShrinkwrapFile, project: RushConfigurationProject) {
    this._shrinkwrapFile = shrinkwrapFile;
    this._project = project;
    this._projectShrinkwrapFilename = BaseProjectShrinkwrapFile.getFilePathForProject(this._project);
  }

  /**
   * Get the fully-qualified path to the <project>/.rush/temp/shrinkwrap-deps.json
   * for the specified project.
   */
  public static getFilePathForProject(project: RushConfigurationProject): string {
    return path.join(project.projectRushTempFolder, RushConstants.projectDependencyManifestFilename);
  }

  /**
   * If the <project>/.rush/temp/shrinkwrap-deps.json file exists, delete it. Otherwise, do nothing.
   */
  public deleteIfExistsAsync(): Promise<void> {
    return FileSystem.deleteFileAsync(this._projectShrinkwrapFilename, { throwIfNotExists: false });
  }

  /**
   * Generate and write the project shrinkwrap file to <project>/.rush/temp/shrinkwrap-deps.json.
   *
   * @virtual
   */
  public abstract updateProjectShrinkwrapAsync(): Promise<void>;

  public get projectShrinkwrapFilename(): string {
    return this._projectShrinkwrapFilename;
  }

  protected get project(): RushConfigurationProject {
    return this._project;
  }

  protected get shrinkwrapFile(): BaseShrinkwrapFile {
    return this._shrinkwrapFile;
  }
}
