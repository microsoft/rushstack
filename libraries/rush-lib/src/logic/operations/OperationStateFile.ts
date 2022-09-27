// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, InternalError, JsonFile } from '@rushstack/node-core-library';
import { RushConstants } from '../RushConstants';

import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';

export interface IOperationStateFileOptions {
  rushProject: RushConfigurationProject;
  phase: IPhase;
}

export interface IOperationStateJson {
  nonCachedDurationMs: number;
}

/**
 * A helper class for managing the state file of a operation.
 *
 * @internal
 */
export class OperationStateFile {
  private readonly _rushProject: RushConfigurationProject;
  private readonly _filename: string;
  private _state: IOperationStateJson | undefined;

  public constructor(options: IOperationStateFileOptions) {
    const { rushProject, phase } = options;
    this._rushProject = rushProject;
    this._filename = OperationStateFile._getFilename(phase, rushProject);
  }

  private static _getFilename(phase: IPhase, project: RushConfigurationProject): string {
    const relativeFilename: string = OperationStateFile.getFilenameRelativeToProjectRoot(phase);
    return `${project.projectFolder}/${relativeFilename}`;
  }

  /**
   * ProjectBuildCache expects the relative path for better logging
   *
   * @internal
   */
  public static getFilenameRelativeToProjectRoot(phase: IPhase): string {
    const identifier: string = `${phase.logFilenameIdentifier}`;
    return `${RushConstants.projectRushFolderName}/${RushConstants.rushTempFolderName}/operation/${identifier}/state.json`;
  }

  /**
   * Returns the filename of the metadata file.
   */
  public get filename(): string {
    return this._filename;
  }

  public get state(): IOperationStateJson | undefined {
    return this._state;
  }

  public async writeAsync(json: IOperationStateJson): Promise<void> {
    await JsonFile.saveAsync(json, this._filename, { ensureFolderExists: true, updateExistingFile: true });
    this._state = json;
  }

  public async tryRestoreAsync(): Promise<IOperationStateJson | undefined> {
    try {
      this._state = await JsonFile.loadAsync(this._filename);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        this._state = undefined;
      } else {
        // This should not happen
        throw new InternalError(error);
      }
    }
    return this._state;
  }
}
