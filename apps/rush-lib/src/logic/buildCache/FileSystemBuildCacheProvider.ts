// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Terminal } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../api/RushConfiguration';
import { RushUserConfiguration } from '../../api/RushUserConfiguration';

export interface IFileSystemBuildCacheProviderOptions {
  rushConfiguration: RushConfiguration;
  rushUserConfiguration: RushUserConfiguration;
}

const BUILD_CACHE_FOLDER_NAME: string = 'build-cache';

export class FileSystemBuildCacheProvider {
  private readonly _cacheFolderPath: string;

  public constructor(options: IFileSystemBuildCacheProviderOptions) {
    this._cacheFolderPath =
      options.rushUserConfiguration.buildCacheFolder ||
      path.join(options.rushConfiguration.commonTempFolder, BUILD_CACHE_FOLDER_NAME);
  }

  public async tryGetCacheEntryBufferByIdAsync(
    terminal: Terminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    const cacheEntryFilePath: string = path.join(this._cacheFolderPath, cacheId);
    try {
      return await FileSystem.readFileToBufferAsync(cacheEntryFilePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        terminal.writeVerboseLine(`Cache entry at "${cacheEntryFilePath}" was not found.`);
        return undefined;
      } else {
        throw e;
      }
    }
  }

  public async trySetCacheEntryBufferAsync(
    terminal: Terminal,
    cacheId: string,
    entryBuffer: Buffer
  ): Promise<boolean> {
    const cacheEntryFilePath: string = path.join(this._cacheFolderPath, cacheId);
    await FileSystem.writeFileAsync(cacheEntryFilePath, entryBuffer, { ensureFolderExists: true });
    terminal.writeVerboseLine(`Wrote cache entry to "${cacheEntryFilePath}".`);
    return true;
  }
}
