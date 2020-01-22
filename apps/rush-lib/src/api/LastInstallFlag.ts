import * as path from 'path';
import * as _ from 'lodash';
import { FileSystem, JsonFile, JsonObject } from '@microsoft/node-core-library';

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was sucessfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag {
  private _path: string;
  private _state: JsonObject;

  /**
   * Creates a new LastInstall flag
   * @param folderPath - the folder that this flag is managing
   * @param state - optional, the state that should be managed or compared
  */
  public constructor(folderPath: string, state: JsonObject = {}) {
    this._path = path.join(folderPath, LAST_INSTALL_FLAG_FILE_NAME);
    this._state = state;
  }

  /**
   * Returns true if the file exists and the contents match the current state
   */
  public isValid(): boolean {
    if (!FileSystem.exists(this._path)) {
      return false;
    }
    try {
      const contents: JsonObject = JsonFile.load(this._path);
      return _.isEqual(contents, this._state);
    } catch (error) {
      return false;
    }
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
}