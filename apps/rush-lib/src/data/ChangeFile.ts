// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import gitInfo = require('git-repo-info');

import RushConfiguration from './RushConfiguration';

import { IChangeFile, IChangeInfo } from './ChangeManagement';

/**
 * This class represents a single change file.
 * @public
 */
export class ChangeFile {
  public constructor(private _changeFileData: IChangeFile,
    private _rushConfiguration: RushConfiguration
  ) {
    if (!this._changeFileData) {
      throw new Error(`_changeFileData does not have value`);
    }
    if (!this._rushConfiguration) {
      throw new Error(`_rushConfiguration does not have value`);
    }
  }

  public addChange(data: IChangeInfo): void {
    this._changeFileData.changes.push(data);
  }

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
   * Write the change file to disk in sync mode
   */
  public writeSync(): void {
    const filePath: string = this.generatePath();
    fsx.ensureFileSync(filePath);
    fsx.writeFileSync(filePath, JSON.stringify(this._changeFileData, undefined, 2));
  }

  /**
   * Generate a file path for storing the change file to disk
   */
  public generatePath(): string {
    let branch: string = undefined;
    try {
      branch = gitInfo().branch;
    } catch (error) {
      console.log('Could not automatically detect git branch name, using timestamp instead.');
    }

    // example filename: yourbranchname_2017-05-01-20-20.json
    const filename: string = (branch ?
      this._escapeFilename(`${branch}_${this._getTimestamp()}.json`) :
      `${this._getTimestamp()}.json`);
    const filePath: string = path.join(this._rushConfiguration.changesFolder,
      ...this._changeFileData.packageName.split('/'),
      filename);
    return filePath;
  }

  /**
  * Gets the current time, formatted as YYYY-MM-DD-HH-MM
  * Optionally will include seconds
  */
  private _getTimestamp(useSeconds: boolean = false): string {
    // Create a date string with the current time

    // dateString === "2016-10-19T22:47:49.606Z"
    const dateString: string = new Date().toJSON();

    // Parse out 2 capture groups, the date and the time
    const dateParseRegex: RegExp = /([0-9]{4}-[0-9]{2}-[0-9]{2}).*([0-9]{2}:[0-9]{2}:[0-9]{2})/;

    // matches[1] === "2016-10-19"
    // matches[2] === "22:47:49"
    const matches: RegExpMatchArray = dateString.match(dateParseRegex);

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

  private _escapeFilename(filename: string, replacer: string = '-'): string {
    // Removes / ? < > \ : * | ", really anything that isn't a letter, number, '.' '_' or '-'
    const badCharacters: RegExp = /[^a-zA-Z0-9._-]/g;
    return filename.replace(badCharacters, replacer);
  }
}