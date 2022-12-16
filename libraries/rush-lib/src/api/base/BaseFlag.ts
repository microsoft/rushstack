// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Import, JsonFile, JsonObject } from '@rushstack/node-core-library';

const lodash: typeof import('lodash') = Import.lazy('lodash', require);

/**
 * A base class for flag file.
 * @internal
 */
export class BaseFlag<T extends object = JsonObject> {
  /**
   * Flag file path
   */
  protected readonly _path: string;
  /**
   * Content of the flag
   */
  protected _state: T;
  /**
   * Whether the current state is modified
   */
  protected _isModified: boolean;

  /**
   * Creates a new flag file
   * @param folderPath - the folder that this flag is managing
   * @param state - optional, the state that should be managed or compared
   */
  public constructor(folderPath: string, state?: Partial<T>) {
    this._path = path.join(folderPath, this.flagName);
    this._state = (state || {}) as T;
    this._isModified = true;
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   */
  public isValid(): boolean {
    let oldState: JsonObject | undefined;
    try {
      oldState = JsonFile.load(this.path);
    } catch (err) {
      // Swallow error
    }
    return !!oldState;
  }

  /**
   * Writes the flag file to disk with the current state
   */
  public create(): void {
    JsonFile.save(this._state, this._path, {
      ensureFolderExists: true
    });
  }

  /**
   * Merge new data into current state by lodash "merge"
   */
  public mergeFromObject(data: Partial<T>): void {
    if (lodash.isMatch(this._state, data)) {
      return;
    }
    lodash.merge(this._state, data);
    this._isModified = true;
  }

  /**
   * Writes the flag file to disk with the current state if modified
   */
  public saveIfModified(): void {
    if (this._isModified) {
      JsonFile.save(this._state, this._path, {
        ensureFolderExists: true
      });
      this._isModified = false;
    }
  }

  /**
   * Writes the flag file to disk with the current state
   */
  public save(): void {
    JsonFile.save(this._state, this._path, {
      ensureFolderExists: true
    });
  }

  /**
   * Removes the flag file
   */
  public clear(): void {
    FileSystem.deleteFile(this._path);
  }

  /**
   * Returns the full path to the flag file
   */
  public get path(): string {
    return this._path;
  }

  /**
   * Returns the name of the flag file
   */
  protected get flagName(): string {
    throw new Error('Do not use this class directly, extends this class instead');
  }

  /**
   * Returns the state by reading current flag file
   */
  protected get oldState(): T | undefined {
    let oldState: T;
    try {
      oldState = JsonFile.load(this.path);
    } catch {
      return undefined;
    }
    return oldState;
  }
}
