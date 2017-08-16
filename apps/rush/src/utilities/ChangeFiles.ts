// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import { EOL } from 'os';
import * as semver from 'semver';

import {
  Utilities,
  IChangeInfo,
  IPackageJson
} from '@microsoft/rush-lib';
import * as glob from 'glob';

/**
 * This class represents the collection of change files existing in the repo and provides operations
 * for those change files.
 */
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
        if (changedSet.has(change.packageName)) {
          const duplicateError: string = `Project ${change.packageName} has more than one entries. ` +
            `Delete the duplicate change file and commit.`;
          throw new Error(duplicateError);
        }
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

  /**
   * Get the array of absolute paths of change files.
   */
  public getFiles(): string[] {
    if (this._files) {
      return this._files;
    }
    this._files = glob.sync(`${this._changesPath}/**/*.json`);
    return this._files || [];
  }

  /**
   * Get the path of changes folder.
   */
  public getChangesPath(): string {
    return this._changesPath;
  }

  /**
   * Delete all change files
   */
  public deleteAll(shouldDelete: boolean, updatedPackages?: Map<string, IPackageJson>): number {
    if (updatedPackages) {
      // If package information is provided, skip changes files for prerelease.
      const prereleasePackages: Set<string> = new Set<string>();
      updatedPackages.forEach((packageJson) => {
        if (semver.prerelease(packageJson.version)) {
          prereleasePackages.add(packageJson.name);
        }
      });

      const filesToDelete: string[] = this.getFiles().filter((filePath) => {
        const changeRequest: IChangeInfo = JSON.parse(fsx.readFileSync(filePath, 'utf8'));
        for (const changeInfo of changeRequest.changes) {
          if (prereleasePackages.has(changeInfo.packageName)) {
            // Change files for a prerelease version bump do not get deleted.
            // Those get saved for releases.
            return false;
          }
        }
        return true;
      });

      return this._deleteFiles(filesToDelete, shouldDelete);
    } else {
      // Delete all change files.
      return this._deleteFiles(this.getFiles(), shouldDelete);
    }
  }

  private _deleteFiles(files: string[], shouldDelete: boolean): number {
    if (files.length) {
      console.log(
        `${EOL}* ` +
        `${shouldDelete ? 'DELETING:' : 'DRYRUN: Deleting'} ` +
        `${files.length} change file(s).`
      );

      for (const filePath of files) {
        console.log(` - ${filePath}`);

        if (shouldDelete) {
          Utilities.deleteFile(filePath);
        }
      }
    }
    return files.length;
  }
}