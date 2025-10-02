// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';
import { RushConfiguration } from '@microsoft/rush-lib';
import { RushConstants } from '@microsoft/rush-lib/lib/logic/RushConstants';
import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';

interface IMinimalRushConfigurationJson {
  rushMinimumVersion: string;
  rushVersion?: string;
}

/**
 * Represents a minimal subset of the rush.json configuration file. It provides the information necessary to
 * decide which version of Rush should be installed/used.
 */
export class MinimalRushConfiguration {
  private _rushVersion: string;
  private _commonRushConfigFolder: string;

  private constructor(minimalRushConfigurationJson: IMinimalRushConfigurationJson, rushJsonFilename: string) {
    this._rushVersion =
      minimalRushConfigurationJson.rushVersion || minimalRushConfigurationJson.rushMinimumVersion;
    this._commonRushConfigFolder = path.join(
      path.dirname(rushJsonFilename),
      RushConstants.commonFolderName,
      'config',
      'rush'
    );
  }

  public static loadFromDefaultLocation(): MinimalRushConfiguration | undefined {
    const rushJsonLocation: string | undefined = RushConfiguration.tryFindRushJsonLocation({
      showVerbose: !RushCommandLineParser.shouldRestrictConsoleOutput()
    });
    if (rushJsonLocation) {
      return MinimalRushConfiguration._loadFromConfigurationFile(rushJsonLocation);
    } else {
      return undefined;
    }
  }

  private static _loadFromConfigurationFile(rushJsonFilename: string): MinimalRushConfiguration | undefined {
    try {
      const minimalRushConfigurationJson: IMinimalRushConfigurationJson = JsonFile.load(rushJsonFilename);
      return new MinimalRushConfiguration(minimalRushConfigurationJson, rushJsonFilename);
    } catch (e) {
      return undefined;
    }
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
   * The folder where Rush's additional config files are stored.  This folder is always a
   * subfolder called "config\rush" inside the common folder.  (The "common\config" folder
   * is reserved for configuration files used by other tools.)  To avoid confusion or mistakes,
   * Rush will report an error if this this folder contains any unrecognized files.
   *
   * Example: "C:\MyRepo\common\config\rush"
   */
  public get commonRushConfigFolder(): string {
    return this._commonRushConfigFolder;
  }
}
