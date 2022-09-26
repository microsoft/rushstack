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
  durationInSecondsWithoutCache: number;
}

export class OperationStateFile {
  private readonly _rushProject: RushConfigurationProject;
  private _filename: string;

  public constructor(options: IOperationStateFileOptions) {
    const { rushProject, phase } = options;
    this._rushProject = rushProject;
    this._filename = OperationStateFile.getFilename(phase, rushProject);
  }

  public static getFilename(phase: IPhase, project: RushConfigurationProject): string {
    const relativeFilename: string = OperationStateFile.getFilenameRelativeToProjectRoot(phase);
    return path.join(project.projectFolder, relativeFilename);
  }

  public static getFilenameRelativeToProjectRoot(phase: IPhase): string {
    const identifier: string = `${phase.logFilenameIdentifier}`;
    return path.join(
      RushConstants.projectRushFolderName,
      RushConstants.rushTempFolderName,
      'operation',
      identifier,
      'state.json'
    );
  }

  /**
   * Returns the filename of the metadata file.
   */
  public get filename(): string {
    return this._filename;
  }

  public write(json: IOperationStateJson): void {
    JsonFile.save(json, this._filename, { ensureFolderExists: true, updateExistingFile: true });
  }

  public tryRead(): IOperationStateJson | undefined {
    let json: IOperationStateJson | undefined;
    try {
      json = JsonFile.load(this._filename);
    } catch (error) {
      if (FileSystem.isFileDoesNotExistError(error as Error)) {
        json = undefined;
      } else {
        // This should not happen
        throw new InternalError(error);
      }
    }
    return json;
  }
}
