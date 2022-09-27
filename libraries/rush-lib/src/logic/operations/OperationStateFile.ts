// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
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

export class OperationStateFile {
  private readonly _rushProject: RushConfigurationProject;
  private readonly _filename: string;

  public constructor(options: IOperationStateFileOptions) {
    const { rushProject, phase } = options;
    this._rushProject = rushProject;
    this._filename = OperationStateFile.getFilename(phase, rushProject);
  }

  public static getFilename(phase: IPhase, project: RushConfigurationProject): string {
    const relativeFilename: string = OperationStateFile.getFilenameRelativeToProjectRoot(phase);
    return `${project.projectFolder}/${relativeFilename}`;
  }

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

  public async writeAsync(json: IOperationStateJson): Promise<void> {
    await JsonFile.saveAsync(json, this._filename, { ensureFolderExists: true, updateExistingFile: true });
  }

  public async tryReadAsync(): Promise<IOperationStateJson | undefined> {
    try {
      return await JsonFile.loadAsync(this._filename);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        return undefined;
      } else {
        // This should not happen
        throw new InternalError(error);
      }
    }
  }
}
