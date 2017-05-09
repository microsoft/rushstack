import * as fsx from 'fs-extra';
import * as path from 'path';
import { EOL } from 'os';
import { Utilities } from '@microsoft/rush-lib';

export default class ChangeFiles {
  private _files: string[];

  constructor(private _changesPath: string) {
  }

  public getFiles(): string[] {
    if (this._files) {
      return this._files;
    }
    try {
      this._files = fsx.readdirSync(this._changesPath).filter(filename => path.extname(filename) === '.json');
    } catch (e) {
      /* no-op when empty folder */
      this._files = [];
    }
    return this._files;
  }

  public getChangesPath(): string {
    return this._changesPath;
  }

  public deleteAll(shouldDelete: boolean): void {
    if (this._files.length) {
      console.log(
        `${EOL}* ` +
        `${shouldDelete ? 'DELETING:' : 'DRYRUN: Deleting'} ` +
        `${this._files.length} change file(s).`
      );

      for (const fileName of this._files) {
        const filePath: string = path.join(this._changesPath, fileName);

        console.log(` - ${filePath}`);

        if (shouldDelete) {
          Utilities.deleteFile(filePath);
        }
      }
    }
  }
}