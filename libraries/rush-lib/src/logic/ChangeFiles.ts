// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema, LegacyAdapters } from '@rushstack/node-core-library';

import { Utilities } from '../utilities/Utilities';
import { IChangeInfo } from '../api/ChangeManagement';
import { IChangelog } from '../api/Changelog';
import { RushConfiguration } from '../api/RushConfiguration';
import schemaJson from '../schemas/change-file.schema.json';

/**
 * This class represents the collection of change files existing in the repo and provides operations
 * for those change files.
 */
export class ChangeFiles {
  /**
   * Change file path relative to changes folder.
   */
  private _files: string[] | undefined;
  private _changesPath: string;

  public constructor(changesPath: string) {
    this._changesPath = changesPath;
  }

  /**
   * Validate if the newly added change files match the changed packages.
   */
  public static validate(
    newChangeFilePaths: string[],
    changedPackages: string[],
    rushConfiguration: RushConfiguration
  ): void {
    const schema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

    const projectsWithChangeDescriptions: Set<string> = new Set<string>();
    newChangeFilePaths.forEach((filePath) => {
      console.log(`Found change file: ${filePath}`);

      const changeFile: IChangeInfo = JsonFile.loadAndValidate(filePath, schema);

      if (rushConfiguration.hotfixChangeEnabled) {
        if (changeFile && changeFile.changes) {
          for (const change of changeFile.changes) {
            if (change.type !== 'none' && change.type !== 'hotfix') {
              throw new Error(
                `Change file ${filePath} specifies a type of '${change.type}' ` +
                  `but only 'hotfix' and 'none' change types may be used in a branch with 'hotfixChangeEnabled'.`
              );
            }
          }
        }
      }

      if (changeFile && changeFile.changes) {
        changeFile.changes.forEach((change) => projectsWithChangeDescriptions.add(change.packageName));
      } else {
        throw new Error(`Invalid change file: ${filePath}`);
      }
    });

    const projectsMissingChangeDescriptions: Set<string> = new Set(changedPackages);
    projectsWithChangeDescriptions.forEach((name) => projectsMissingChangeDescriptions.delete(name));
    if (projectsMissingChangeDescriptions.size > 0) {
      const projectsMissingChangeDescriptionsArray: string[] = [];
      projectsMissingChangeDescriptions.forEach((name) => projectsMissingChangeDescriptionsArray.push(name));
      throw new Error(
        [
          'The following projects have been changed and require change descriptions, but change descriptions were not ' +
            'detected for them:',
          ...projectsMissingChangeDescriptionsArray.map((projectName) => `- ${projectName}`),
          'To resolve this error, run "rush change". This will generate change description files that must be ' +
            'committed to source control.'
        ].join('\n')
      );
    }
  }

  public static getChangeComments(newChangeFilePaths: string[]): Map<string, string[]> {
    const changes: Map<string, string[]> = new Map<string, string[]>();

    newChangeFilePaths.forEach((filePath) => {
      console.log(`Found change file: ${filePath}`);
      const changeRequest: IChangeInfo = JsonFile.load(filePath);
      if (changeRequest && changeRequest.changes) {
        changeRequest.changes!.forEach((change) => {
          if (!changes.get(change.packageName)) {
            changes.set(change.packageName, []);
          }
          if (change.comment && change.comment.length) {
            changes.get(change.packageName)!.push(change.comment);
          }
        });
      } else {
        throw new Error(`Invalid change file: ${filePath}`);
      }
    });
    return changes;
  }

  /**
   * Get the array of absolute paths of change files.
   */
  public async getFilesAsync(): Promise<string[]> {
    if (!this._files) {
      const { default: glob } = await import('glob');
      this._files =
        (await LegacyAdapters.convertCallbackToPromise(glob, `${this._changesPath}/**/*.json`)) || [];
    }

    return this._files;
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
  public async deleteAllAsync(shouldDelete: boolean, updatedChangelogs?: IChangelog[]): Promise<number> {
    if (updatedChangelogs) {
      // Skip changes files if the package's change log is not updated.
      const packagesToInclude: Set<string> = new Set<string>();
      updatedChangelogs.forEach((changelog) => {
        packagesToInclude.add(changelog.name);
      });

      const files: string[] = await this.getFilesAsync();
      const filesToDelete: string[] = files.filter((filePath) => {
        const changeRequest: IChangeInfo = await JsonFile.loadAsync(filePath);
        for (const changeInfo of changeRequest.changes!) {
          if (!packagesToInclude.has(changeInfo.packageName)) {
            return false;
          }
        }
        return true;
      });

      return this._deleteFiles(filesToDelete, shouldDelete);
    } else {
      // Delete all change files.
      const files: string[] = await this.getFilesAsync();
      return this._deleteFiles(files, shouldDelete);
    }
  }

  private _deleteFiles(files: string[], shouldDelete: boolean): number {
    if (files.length) {
      console.log(`\n* ${shouldDelete ? 'DELETING:' : 'DRYRUN: Deleting'} ${files.length} change file(s).`);

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
