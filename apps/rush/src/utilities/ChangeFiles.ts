import * as fsx from 'fs-extra';
import * as path from 'path';
import { EOL } from 'os';
import {
  Utilities,
  IChangeInfo
} from '@microsoft/rush-lib';

export default class ChangeFiles {

  // Change file path relative to changes folder.
  private _files: string[];

  /**
   * Validate if the newly added change files match the changed packages.
   */
  public static validate(
    newChangeFilePaths: string[],
    changedPackages: string[]
  ): void {
    const changedSet: Set<string> = new Set<string>();
    newChangeFilePaths.forEach((filePath) => {
      console.log(`Found change file: ${filePath}`);
      const changeRequest: IChangeInfo = JSON.parse(fsx.readFileSync(filePath, 'utf8'));
      changeRequest.changes.forEach(change => {
        changedSet.add(change.packageName);
      });
    });

    const requiredSet: Set<string> = new Set(changedPackages);
    changedSet.forEach((name) => {
      requiredSet.delete(name);
    });
    if (requiredSet.size > 0) {
      const missingProjects: string[] = [];
      requiredSet.forEach(name => {
        missingProjects.push(name);
      });
      throw new Error(`Change file does not contain ${missingProjects.join(',')}.`);
    }
  }

  constructor(private _changesPath: string) {
  }

  public getFiles(): string[] {
    if (this._files) {
      return this._files;
    }
    this._files = Utilities.readdirSyncRecursively(this._changesPath)
      .filter(filename => path.extname(filename) === '.json');

    return this._files;
  }

  public getChangesPath(): string {
    return this._changesPath;
  }

  /**
   * Delete all change files
   */
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