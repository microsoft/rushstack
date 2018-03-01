import * as path from 'path';
import * as fsx from 'fs-extra';
import * as _ from 'lodash';

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * @internal
 */
export class LastInstallFlag {
  private _flagPath: string;

  constructor(folderPath: string, private _state: Object) {
    this._flagPath = path.join(folderPath, LAST_INSTALL_FLAG_FILE_NAME);
  }

  public isValid(): boolean {
    try {
      return _.isEqual(fsx.readJsonSync(this._flagPath), this._state);
    } catch (error) {
      return false;
    }
  }

  public set(): void {
    fsx.mkdirsSync(path.dirname(this._flagPath));
    fsx.writeJsonSync(this._flagPath, this._state);
  }

  public clear(): void {
    fsx.removeSync(this._flagPath);
  }

  public get flagPath(): string {
    return this._flagPath;
  }
}