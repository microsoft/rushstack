// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { ConfigurationFileBase } from './ConfigurationFileBase.ts';

/**
 * @beta
 */
export class NonProjectConfigurationFile<TConfigurationFile> extends ConfigurationFileBase<
  TConfigurationFile,
  {}
> {
  /**
   * Load the configuration file at the specified absolute path, automatically resolving
   * `extends` properties. Will throw an error if the file cannot be found.
   */
  public loadConfigurationFile(terminal: ITerminal, filePath: string): TConfigurationFile {
    return this._loadConfigurationFileInnerWithCache(
      terminal,
      filePath,
      PackageJsonLookup.instance.tryGetPackageFolderFor(filePath)
    );
  }

  /**
   * Load the configuration file at the specified absolute path, automatically resolving
   * `extends` properties. Will throw an error if the file cannot be found.
   */
  public async loadConfigurationFileAsync(
    terminal: ITerminal,
    filePath: string
  ): Promise<TConfigurationFile> {
    return await this._loadConfigurationFileInnerWithCacheAsync(
      terminal,
      filePath,
      PackageJsonLookup.instance.tryGetPackageFolderFor(filePath)
    );
  }

  /**
   * This function is identical to {@link NonProjectConfigurationFile.loadConfigurationFile}, except
   * that it returns `undefined` instead of throwing an error if the configuration file cannot be found.
   */
  public tryLoadConfigurationFile(terminal: ITerminal, filePath: string): TConfigurationFile | undefined {
    try {
      return this.loadConfigurationFile(terminal, filePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        return undefined;
      }
      throw e;
    }
  }

  /**
   * This function is identical to {@link NonProjectConfigurationFile.loadConfigurationFileAsync}, except
   * that it returns `undefined` instead of throwing an error if the configuration file cannot be found.
   */
  public async tryLoadConfigurationFileAsync(
    terminal: ITerminal,
    filePath: string
  ): Promise<TConfigurationFile | undefined> {
    try {
      return await this.loadConfigurationFileAsync(terminal, filePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        return undefined;
      }
      throw e;
    }
  }
}
