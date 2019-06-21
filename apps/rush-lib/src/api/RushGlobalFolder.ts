// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Utilities } from '../utilities/Utilities';

/**
 * This class provides global folders that are used for rush's internal install locations.
 *
 * @internal
 */
export class RushGlobalFolder {
  private _rushUserFolder: string;
  private _rushNodeSpecificUserFolder: string;

  /**
   * The absolute path to Rush's storage in the home directory for the current user, independent of node version.
   * On Windows, it would be something like `C:\Users\YourName\.rush\`.
   */
  public get path(): string {
    return this._rushUserFolder;
  }

  /**
   * The absolute path to Rush's storage in the home directory for the current user and node version.
   * On Windows, it would be something like `C:\Users\YourName\.rush\node-v3.4.5`.
   */
  public get nodeSpecificPath(): string {
    return this._rushNodeSpecificUserFolder;
  }

  public constructor() {
    this._rushUserFolder = path.join(Utilities.getHomeDirectory(), '.rush');
    const normalizedNodeVersion: string = process.version.match(/^[a-z0-9\-\.]+$/i)
      ? process.version
      : 'unknown-version';
    this._rushNodeSpecificUserFolder = path.join(this._rushUserFolder, `node-${normalizedNodeVersion}`);
  }
}
