// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile } from '@rushstack/node-core-library';

/**
 * A helper class for managing persistent flag files. It also compares state, so that if
 * some tracked state has changed, it can invalidate the flag file.
 * @internal
 */
export abstract class FlagFileBase<TState> {
  private _path: string;
  private _state: TState;

  /**
   * Creates a new FlagFileBase
   *
   * @param flagPath - the file containing the flag information
   * @param state - optional, the state that should be managed or compared
   */
  protected constructor(flagPath: string, state: TState) {
    this._path = flagPath;
    this._state = state;
  }

  /**
   * Returns the full path to the flag file
   */
  public get path(): string {
    return this._path;
  }

  /**
   * Returns the current flag state
   */
  protected get state(): TState {
    return this._state;
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   */
  public abstract isValid(): boolean;

  /**
   * Writes the flag file to disk with the current state
   */
  public create(): void {
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
   * Load and return the flag from file, or undefined if the flag could not be loaded.
   */
  protected loadFromFile(): TState | undefined {
    try {
      return JsonFile.load(this.path);
    } catch (err) {
      return;
    }
  }
}
