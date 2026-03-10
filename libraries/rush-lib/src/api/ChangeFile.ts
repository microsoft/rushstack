// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type gitInfo from 'git-repo-info';

import { JsonFile } from '@rushstack/node-core-library';

import type { RushConfiguration } from './RushConfiguration.ts';
import type { IChangeFile, IChangeInfo } from './ChangeManagement.ts';
import { Git } from '../logic/Git.ts';

/**
 * This class represents a single change file.
 */
export class ChangeFile {
  private _changeFileData: IChangeFile;
  private _rushConfiguration: RushConfiguration;

  /**
   * @internal
   */
  public constructor(changeFileData: IChangeFile, rushConfiguration: RushConfiguration) {
    if (!changeFileData) {
      throw new Error(`changeFileData does not have a value`);
    }

    if (!rushConfiguration) {
      throw new Error(`rushConfiguration does not have a value`);
    }

    this._changeFileData = changeFileData;
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Adds a change entry into the change file
   * @param data - change information
   */
  public addChange(data: IChangeInfo): void {
    this._changeFileData.changes.push(data);
  }

  /**
   * Gets all the change entries about the specified package from the change file.
   * @param packageName - package name
   */
  public getChanges(packageName: string): IChangeInfo[] {
    const changes: IChangeInfo[] = [];
    for (const info of this._changeFileData.changes) {
      if (info.packageName === packageName) {
        changes.push(info);
      }
    }
    return changes;
  }

  /**
   * Writes the change file to disk in sync mode.
   * Returns the file path.
   * @returns the path to the file that was written (based on generatePath())
   */
  public writeSync(): string {
    const filePath: string = this.generatePath();
    JsonFile.save(this._changeFileData, filePath, {
      ensureFolderExists: true
    });
    return filePath;
  }

  /**
   * Generates a file path for storing the change file to disk.
   * Note that this value may change if called twice in a row,
   * as it is partially based on the current date/time.
   */
  public generatePath(): string {
    let branch: string | undefined = undefined;
    const git: Git = new Git(this._rushConfiguration);
    const repoInfo: gitInfo.GitRepoInfo | undefined = git.getGitInfo();
    branch = repoInfo && repoInfo.branch;
    if (!branch) {
      // eslint-disable-next-line no-console
      console.log('Could not automatically detect git branch name, using timestamp instead.');
    }

    // example filename: yourbranchname_2017-05-01-20-20.json
    const filename: string = branch
      ? this._escapeFilename(`${branch}_${this._getTimestamp()}.json`)
      : `${this._getTimestamp()}.json`;
    const filePath: string = path.join(
      this._rushConfiguration.changesFolder,
      ...this._changeFileData.packageName.split('/'),
      filename
    );
    return filePath;
  }

  /**
   * Gets the current time, formatted as YYYY-MM-DD-HH-MM
   * Optionally will include seconds
   */
  private _getTimestamp(useSeconds: boolean = false): string | undefined {
    // Create a date string with the current time

    // dateString === "2016-10-19T22:47:49.606Z"
    const dateString: string = new Date().toJSON();

    // Parse out 2 capture groups, the date and the time
    const dateParseRegex: RegExp = /([0-9]{4}-[0-9]{2}-[0-9]{2}).*([0-9]{2}:[0-9]{2}:[0-9]{2})/;

    // matches[1] === "2016-10-19"
    // matches[2] === "22:47:49"
    const matches: RegExpMatchArray | null = dateString.match(dateParseRegex);

    if (matches) {
      // formattedDate === "2016-10-19"
      const formattedDate: string = matches[1];

      let formattedTime: string;
      if (useSeconds) {
        // formattedTime === "22-47-49"
        formattedTime = matches[2].replace(':', '-');
      } else {
        // formattedTime === "22-47"
        const timeParts: string[] = matches[2].split(':');
        formattedTime = `${timeParts[0]}-${timeParts[1]}`;
      }

      return `${formattedDate}-${formattedTime}`;
    }
    return undefined;
  }

  private _escapeFilename(filename: string, replacer: string = '-'): string {
    // Removes / ? < > \ : * | ", really anything that isn't a letter, number, '.' '_' or '-'
    const badCharacters: RegExp = /[^a-zA-Z0-9._-]/g;
    return filename.replace(badCharacters, replacer);
  }
}
