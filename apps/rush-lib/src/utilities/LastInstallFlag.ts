import * as path from 'path';
import * as fsx from 'fs-extra';
import * as _ from 'lodash';

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was sucessfully completed.
 * It also compares state, so that if something like the Node JS version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag {
  private _flagPath: string;

  /**
   * Creates a new LastInstall flag
   * @param folderPath - the folder that this flag is managing
   * @param _state - optional, the state that should be managed or compared
  */
  constructor(folderPath: string, private _state: Object = {}) {
    this._flagPath = path.join(folderPath, LAST_INSTALL_FLAG_FILE_NAME);
  }

  /**
   * Returns true if the file exists and the contents match the current state
   */
  public isValid(): boolean {
    try {
      return _.isEqual(fsx.readJsonSync(this._flagPath), this._state);
    } catch (error) {
      return false;
    }
  }

  /**
   * Writes the flag file to disk with the current state
   */
  public set(): void {
    fsx.mkdirsSync(path.dirname(this._flagPath));
    fsx.writeJsonSync(this._flagPath, this._state);
  }

  /**
   * Removes the flag file
   */
  public clear(): void {
    fsx.removeSync(this._flagPath);
  }

  /**
   * Returns the full path to the flag file
   */
  public get flagPath(): string {
    return this._flagPath;
  }
}