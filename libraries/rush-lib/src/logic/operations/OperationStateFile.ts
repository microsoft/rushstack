// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, InternalError, JsonFile } from '@rushstack/node-core-library';

/**
 * @internal
 */
export interface IOperationStateFileOptions {
  projectFolder: string;
  metadataFolder: string;
}

/**
 * @internal
 */
export interface IOperationStateJson {
  nonCachedDurationMs: number;
  cobuildContextId: string | undefined;
  cobuildRunnerId: string | undefined;
}

/**
 * A helper class for managing the state file of a operation.
 *
 * @internal
 */
export class OperationStateFile {
  private _state: IOperationStateJson | undefined;

  /**
   * The path of the state json file.
   *
   * Example: `/code/repo/my-project/.rush/temp/operation/_phase_build/state.json`
   */
  public readonly filepath: string;

  /**
   * The relative path of the state json file to project folder
   *
   * Example: `.rush/temp/operation/_phase_build/state.json`
   */
  public readonly relativeFilepath: string;

  public static filename: string = 'state.json';

  public constructor(options: IOperationStateFileOptions) {
    const { projectFolder, metadataFolder } = options;
    this.relativeFilepath = `${metadataFolder}/${OperationStateFile.filename}`;
    this.filepath = `${projectFolder}/${this.relativeFilepath}`;
  }

  public get state(): IOperationStateJson | undefined {
    return this._state;
  }

  public async writeAsync(json: IOperationStateJson): Promise<void> {
    await JsonFile.saveAsync(json, this.filepath, { ensureFolderExists: true, ignoreUndefinedValues: true });
    this._state = json;
  }

  public async tryRestoreAsync(): Promise<IOperationStateJson | undefined> {
    try {
      this._state = await JsonFile.loadAsync(this.filepath);
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
