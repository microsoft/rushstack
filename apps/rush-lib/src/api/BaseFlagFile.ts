// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonObject } from '@rushstack/node-core-library';

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was successfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export abstract class BaseFlagFile {
  private _path: string;
  private _state: JsonObject;

  /**
   * Creates a new BaseFlagFile
   *
   * @param flagPath - the file containing the flag information
   * @param state - optional, the state that should be managed or compared
   */
  protected constructor(flagPath: string, state: JsonObject = {}) {
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
  protected get state(): JsonObject {
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
  protected loadFromFile(): JsonObject | undefined {
    try {
      return JsonFile.load(this.path);
    } catch (err) {
      return;
    }
  }
}
