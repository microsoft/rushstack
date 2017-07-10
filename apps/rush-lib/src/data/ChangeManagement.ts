// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import gitInfo = require('git-repo-info');

import RushConfiguration from './RushConfiguration';
import { RushConstants } from '../RushConstants';

/**
 * Representation for a changes file
 * @public
 */
export interface IChangeFile {
  changes: IChangeInfo[];
  packageName: string;
  email: string;
}

/**
 * Represents all of the types of change requests.
 * @public
 */
export enum ChangeType {
  none = 0,
  dependency = 1,
  patch = 2,
  minor = 3,
  major = 4
}

/**
 * Defines an IChangeInfo object.
 * @public
 */
export interface IChangeInfo {
  /**
   * Defines the type of change. This is not expected to exist within the JSON file definition as we
   * parse it from the "type" property.
   */
  changeType?: ChangeType;

  /**
   * Defines the array of related changes for the given package. This is used to iterate over comments
   * requested by the change requests.
   */
  changes?: IChangeInfo[];

  /**
   * A user provided comment for the change.
   */
  comment?: string;

  /**
   * The email of the user who provided the comment. Pulled from the git log.
   */
  author?: string;

  /**
   * The commit hash for the change.
   */
  commit?: string;

  /**
   * The new downstream range dependency, as calculated by the findChangeRequests function.
   */
  newRangeDependency?: string;

  /**
   * The new version for the package, as calculated by the findChangeRequests function.
   */
  newVersion?: string;

  /**
   * The order in which the change request should be published.
   */
  order?: number;

  /**
   * The name of the package.
   */
  packageName: string;

  /**
   * The type of the package publishing request (patch/minor/major), as provided by the JSON file.
   */
  type?: string;
}

/**
 * Writes the change file to disk in sync mode.
 * @internal
 *
 * @param rushConfiguration - Rush configuration
 * @param changeFile - change file data
 */
export function _writeChangeFileSync(
  rushConfiguration: RushConfiguration,
  changeFile: IChangeFile
): void {
  const filePath: string = _generateChangeFilePath(rushConfiguration, changeFile.packageName);
  fsx.ensureFileSync(filePath);
  fsx.writeFileSync(filePath, JSON.stringify(changeFile, undefined, 2));
}

/**
 * Generates change file path based on the provided information.
 * @internal
 *
 * @param rushConfiguration - Rush configuration
 * @param packageName - package name
 */
export function _generateChangeFilePath(
  rushConfiguration: RushConfiguration,
  packageName: string
): string {
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
  const filePath: string = path.join(this.rushConfiguration.commonFolder,
    RushConstants.changeFilesFolderName,
    ...packageName.split('/'),
    filename);
  return filePath;
}

/**
* Gets the current time, formatted as YYYY-MM-DD-HH-MM
* Optionally will include seconds
*/
function _getTimestamp(useSeconds: boolean = false): string {
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

function _escapeFilename(filename: string, replacer: string = '-'): string {
  // Removes / ? < > \ : * | ", really anything that isn't a letter, number, '.' '_' or '-'
  const badCharacters: RegExp = /[^a-zA-Z0-9._-]/g;
  return filename.replace(badCharacters, replacer);
}