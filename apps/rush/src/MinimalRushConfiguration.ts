// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@microsoft/node-core-library';
import { RushConfiguration } from '@microsoft/rush-lib';

interface IMinimalRushConfigurationJson {
  rushMinimumVersion: string;
  rushVersion?: string;
}

export default class MinimalRushConfiguration {
  private _rushVersion: string;
  private _homeFolder: string;

  public static loadFromDefaultLocation(): MinimalRushConfiguration {
    const rushJsonLocation: string = RushConfiguration.findRushJsonLocation();
    return MinimalRushConfiguration.loadFromConfigurationFile(rushJsonLocation);
  }

  public static loadFromConfigurationFile(rushJsonFilename: string): MinimalRushConfiguration {
    try {
      const minimalRushConfigurationJson: IMinimalRushConfigurationJson = JsonFile.load(rushJsonFilename);
      return new MinimalRushConfiguration(minimalRushConfigurationJson);
    } catch (e) {
      throw new Error(`Failed to load rush.json: ${e}`);
    }
  }

  private constructor(minimalRushConfigurationJson: IMinimalRushConfigurationJson) {
    this._rushVersion = minimalRushConfigurationJson.rushVersion || minimalRushConfigurationJson.rushMinimumVersion;
    this._homeFolder = RushConfiguration.getHomeDirectory();
  }

  public get rushVersion(): string {
    return this._rushVersion;
  }

  public get homeFolder(): string {
    return this._homeFolder;
  }
}
