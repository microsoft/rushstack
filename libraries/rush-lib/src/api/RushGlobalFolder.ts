// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Utilities } from '../utilities/Utilities';
import { EnvironmentConfiguration } from './EnvironmentConfiguration';

/**
 * This class provides global folders that are used for rush's internal install locations.
 *
 * @internal
 */
export class RushGlobalFolder {
  /**
   * The global folder where Rush stores temporary files.
   *
   * @remarks
   *
   * Most of the temporary files created by Rush are stored separately for each monorepo working folder,
   * to avoid issues of concurrency and compatibility between tool versions.  However, a small set
   * of files (e.g. installations of the `@microsoft/rush-lib` engine and the package manager) are stored
   * in a global folder to speed up installations.  The default location is `~/.rush` on POSIX-like
   * operating systems or `C:\Users\YourName` on Windows.
   *
   * You can use the {@link EnvironmentVariableNames.RUSH_GLOBAL_FOLDER} environment  variable to specify
   * a different folder path.  This is useful for example if a Windows group policy forbids executing scripts
   * installed in a user's home directory.
   *
   * POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.
   */
  public readonly path: string;

  /**
   * The absolute path to Rush's storage in the home directory for the current user and node version.
   * On Windows, it would be something like `C:\Users\YourName\.rush\node-v3.4.5`.
   */
  public readonly nodeSpecificPath: string;

  public constructor() {
    // Because RushGlobalFolder is used by the front-end VersionSelector before EnvironmentConfiguration
    // is initialized, we need to read it using a special internal API.
    const rushGlobalFolderOverride: string | undefined =
      EnvironmentConfiguration._getRushGlobalFolderOverride(process.env);
    if (rushGlobalFolderOverride !== undefined) {
      this.path = rushGlobalFolderOverride;
    } else {
      this.path = path.join(Utilities.getHomeFolder(), '.rush');
    }

    const normalizedNodeVersion: string = process.version.match(/^[a-z0-9\-\.]+$/i)
      ? process.version
      : 'unknown-version';
    this.nodeSpecificPath = path.join(this.path, `node-${normalizedNodeVersion}`);
  }
}
