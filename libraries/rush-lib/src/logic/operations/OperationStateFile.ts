// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, InternalError, JsonFile } from '@rushstack/node-core-library';
import { IOperationHashes } from './OperationHash';

import { OperationStatus } from './OperationStatus';

/**
 * @internal
 */
export interface IOperationStateFileOptions {
  filename: string;
}

/**
 * @internal
 */
export interface IOperationStateJson {
  nonCachedDurationMs: number;

  hashes: IOperationHashes | undefined;

  status: OperationStatus;
}

/**
 * A helper class for managing the state file of a operation.
 *
 * @internal
 */
export class OperationStateFile {
  private readonly _filename: string;
  private _state: IOperationStateJson | undefined;

  public constructor(options: IOperationStateFileOptions) {
    const { filename } = options;
    this._filename = filename;
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
