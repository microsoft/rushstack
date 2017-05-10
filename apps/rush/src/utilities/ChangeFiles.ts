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
    if (newChangeFilePaths.length === 1) {
      console.log('Found one change file: ' + newChangeFilePaths[0]);
      this._validateChangedProjects(newChangeFilePaths[0], changedPackages);
    } else if (newChangeFilePaths.length === 0) {
      throw new Error(`No change file is found. Run 'rush change' to generate a change file.`);
    } else {
      throw new Error('More than one change file was found. Delete and only keep one.');
    }
  }

  private static _validateChangedProjects(
    newChangeFilesPath: string,
    changedPackages: string[]
  ): void {
    const missingPackages: string[] = ChangeFiles._findMissingChangedPackages(newChangeFilesPath, changedPackages);
    if (missingPackages.length > 0) {
      throw new Error(`Change file does not contain ${missingPackages.join(',')}.`);
    }
  }

  /**
   * Find changed packages that are not included in the provided change file.
   */
  private static _findMissingChangedPackages(
    changeFileFullPath: string,
    changedPackages: string[]
  ): string[] {
    const changeRequest: IChangeInfo = JSON.parse(fsx.readFileSync(changeFileFullPath, 'utf8'));
    const requiredSet: Set<string> = new Set(changedPackages);
    changeRequest.changes.forEach(change => {
      requiredSet.delete(change.packageName);
    });
    const missingProjects: string[] = [];
    requiredSet.forEach(name => {
      missingProjects.push(name);
    });
    return missingProjects;
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