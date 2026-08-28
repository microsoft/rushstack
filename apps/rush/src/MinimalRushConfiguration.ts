// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { RushConfiguration } from '@microsoft/rush-lib';
import { RushConstants } from '@microsoft/rush-lib/lib/logic/RushConstants';
import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';

interface IMinimalRushConfigurationJson {
  rushMinimumVersion: string;
  rushVersion?: string;
}

interface IMinimalExperimentsConfigurationJson {
  useRushReporter?: boolean;
}

/**
 * Represents a minimal subset of the rush.json configuration file. It provides the information necessary to
 * decide which version of Rush should be installed/used.
 */
export class MinimalRushConfiguration {
  private _rushVersion: string;
  private _commonRushConfigFolder: string;
  private _useRushReporter: boolean;

  private constructor(minimalRushConfigurationJson: IMinimalRushConfigurationJson, rushJsonFilename: string) {
    this._rushVersion =
      minimalRushConfigurationJson.rushVersion || minimalRushConfigurationJson.rushMinimumVersion;
    this._commonRushConfigFolder = path.join(
      path.dirname(rushJsonFilename),
      RushConstants.commonFolderName,
      'config',
      'rush'
    );

    const experimentsJsonFilename: string = path.join(
      this._commonRushConfigFolder,
      RushConstants.experimentsFilename
    );
    const experimentsConfiguration: IMinimalExperimentsConfigurationJson | undefined =
      _loadExperimentsConfigurationJson(experimentsJsonFilename);
    if (
      experimentsConfiguration?.useRushReporter !== undefined &&
      typeof experimentsConfiguration.useRushReporter !== 'boolean'
    ) {
      throw new Error(`The "useRushReporter" setting in "${experimentsJsonFilename}" must be true or false.`);
    }
    this._useRushReporter = experimentsConfiguration?.useRushReporter === true;
  }

  public static loadFromDefaultLocation(): MinimalRushConfiguration | undefined {
    const showVerbose: boolean = !RushCommandLineParser.shouldRestrictConsoleOutput();
    const rushJsonLocation: string | undefined = RushConfiguration.tryFindRushJsonLocation({
      showVerbose: false
    });
    if (rushJsonLocation) {
      const minimalRushConfigurationJson: IMinimalRushConfigurationJson | undefined =
        _loadConfigurationJson(rushJsonLocation);
      if (minimalRushConfigurationJson) {
        const configuration: MinimalRushConfiguration = new MinimalRushConfiguration(
          minimalRushConfigurationJson,
          rushJsonLocation
        );
        if (
          showVerbose &&
          !configuration.useRushReporter &&
          !_hasExplicitNonLegacyReporter(process.argv.slice(2)) &&
          path.dirname(rushJsonLocation) !== process.cwd()
        ) {
          // Preserve the legacy discovery message exactly when the reporter path is not taking ownership.
          console.log('Found configuration in ' + rushJsonLocation);
          console.log('');
        }
        return configuration;
      }
      return undefined;
    } else {
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

  /**
   * Whether the repository explicitly opted in to the experimental Rush reporter frontend.
   */
  public get useRushReporter(): boolean {
    return this._useRushReporter;
  }

  /**
   * The repository's common temp folder, used for invocation-scoped reporter logs.
   */
  public get commonTempFolder(): string {
    return path.resolve(this._commonRushConfigFolder, '..', '..', 'temp');
  }
}

function _hasExplicitNonLegacyReporter(argv: readonly string[]): boolean {
  for (let index: number = 0; index < argv.length; index++) {
    const argument: string = argv[index];
    let value: string | undefined;
    if (argument === '--reporter') {
      value = argv[index + 1];
    } else if (argument.startsWith('--reporter=')) {
      value = argument.slice('--reporter='.length);
    }
    if (value !== undefined) {
      return value.trim().toLowerCase() !== 'legacy';
    }
  }
  return false;
}

function _loadConfigurationJson(rushJsonFilename: string): IMinimalRushConfigurationJson | undefined {
  try {
    return JsonFile.load(rushJsonFilename);
  } catch (e) {
    return undefined;
  }
}

function _loadExperimentsConfigurationJson(
  experimentsJsonFilename: string
): IMinimalExperimentsConfigurationJson | undefined {
  try {
    return JsonFile.load(experimentsJsonFilename);
  } catch (e) {
    if (FileSystem.isNotExistError(e)) {
      return undefined;
    }
    throw e;
  }
}
