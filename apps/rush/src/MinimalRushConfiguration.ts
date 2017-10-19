// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@microsoft/node-core-library';
import { RushConfiguration } from '@microsoft/rush-lib';

interface IMinimalRushConfigurationJson {
  rushMinimumVersion: string;
  rushVersion?: string;
}

/**
 * Represents a minimal subset of the rush.json configuration file. It provides the information necessary to
 *  decide which version of Rush should be installed/used.
 */
export default class MinimalRushConfiguration {
  private _rushVersion: string;
  private _homeFolder: string;

  public static loadFromDefaultLocation(): MinimalRushConfiguration | undefined {
    const rushJsonLocation: string | undefined = RushConfiguration.tryFindRushJsonLocation();
    if (rushJsonLocation) {
      return MinimalRushConfiguration._loadFromConfigurationFile(rushJsonLocation);
    } else {
      return undefined;
    }
  }

  private static _loadFromConfigurationFile(rushJsonFilename: string): MinimalRushConfiguration | undefined {
    try {
      const minimalRushConfigurationJson: IMinimalRushConfigurationJson = JsonFile.load(rushJsonFilename);
      return new MinimalRushConfiguration(minimalRushConfigurationJson);
    } catch (e) {
      return undefined;
    }
  }

  private constructor(minimalRushConfigurationJson: IMinimalRushConfigurationJson) {
    this._rushVersion = minimalRushConfigurationJson.rushVersion || minimalRushConfigurationJson.rushMinimumVersion;
    this._homeFolder = RushConfiguration.getHomeDirectory();
  }

  /**
   * The version of rush specified by the rushVersion property of the rush.json configuration file. If the
   *  rushVersion property is not specified, this falls back to the rushMinimumVersion property. This should be
   *  a semver style version number like "4.0.0"
   */
  public get rushVersion(): string {
    return this._rushVersion;
  }

  /**
   * The absolute path to the home directory for the current user. On Windows, it would be something
   *  like "C:\Users\YourName".
   */
  public get homeFolder(): string {
    return this._homeFolder;
  }
}
