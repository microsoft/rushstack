// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, type JsonObject, Objects } from '@rushstack/node-core-library';

/**
 * A base class for flag file.
 * @internal
 */
export class FlagFile<TState extends JsonObject = JsonObject> {
  /**
   * Flag file path
   */
  public readonly path: string;

  /**
   * Content of the flag
   */
  protected _state: TState;

  /**
   * Creates a new flag file
   * @param folderPath - the folder that this flag is managing
   * @param state - optional, the state that should be managed or compared
   */
  public constructor(folderPath: string, flagName: string, initialState: TState) {
    this.path = `${folderPath}/${flagName}.flag`;
    this._state = initialState;
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   */
  public async isValidAsync(): Promise<boolean> {
    let oldState: JsonObject | undefined;
    try {
      oldState = await JsonFile.loadAsync(this.path);
      const newState: JsonObject = this._state;
      return Objects.areDeepEqual(oldState, newState);
    } catch (err) {
      return false;
    }
  }

  /**
   * Writes the flag file to disk with the current state
   */
  public async createAsync(): Promise<void> {
    await JsonFile.saveAsync(this._state, this.path, {
      ensureFolderExists: true
    });
  }

  /**
   * Removes the flag file
   */
  public async clearAsync(): Promise<void> {
    await FileSystem.deleteFileAsync(this.path);
  }
}
