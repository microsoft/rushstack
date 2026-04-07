// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushUserConfiguration } from '../../api/RushUserConfiguration';

/**
 * Options for creating a file system build cache provider.
 * @beta
 */
export interface IFileSystemBuildCacheProviderOptions {
  /**
   * The workspace Rush configuration
   */
  rushConfiguration: RushConfiguration;
  /**
   * The user Rush configuration
   */
  rushUserConfiguration: RushUserConfiguration;
}

const DEFAULT_BUILD_CACHE_FOLDER_NAME: string = 'build-cache';

/**
 * A build cache provider using the local file system.
 * Required by all cloud cache providers.
 * @beta
 */
export class FileSystemBuildCacheProvider {
  /**
   * Returns the absolute disk path for the specified cache id.
   */
  public readonly getCacheEntryPath: (cacheId: string) => string;

  public constructor(options: IFileSystemBuildCacheProviderOptions) {
    const {
      rushConfiguration: { commonTempFolder },
      rushUserConfiguration: { buildCacheFolder = `${commonTempFolder}/${DEFAULT_BUILD_CACHE_FOLDER_NAME}` }
    } = options;
    this.getCacheEntryPath = (cacheId: string) => `${buildCacheFolder}/${cacheId}`;
  }

  /**
   * Validates that the specified cache id exists on disk, and returns the path if it does.
   */
  public async tryGetCacheEntryPathByIdAsync(
    terminal: ITerminal,
    cacheId: string
  ): Promise<string | undefined> {
    const cacheEntryFilePath: string = this.getCacheEntryPath(cacheId);
    const cacheEntryExists: boolean = await FileSystem.existsAsync(cacheEntryFilePath);
    if (cacheEntryExists) {
      return cacheEntryFilePath;
    } else {
      return undefined;
    }
  }

  /**
   * Writes the specified buffer to the corresponding file system path for the cache id.
   */
  public async trySetCacheEntryBufferAsync(
    terminal: ITerminal,
    cacheId: string,
    entryBuffer: Buffer
  ): Promise<string> {
    const cacheEntryFilePath: string = this.getCacheEntryPath(cacheId);
    await FileSystem.writeFileAsync(cacheEntryFilePath, entryBuffer, { ensureFolderExists: true });
    terminal.writeVerboseLine(`Wrote cache entry to "${cacheEntryFilePath}".`);
    return cacheEntryFilePath;
  }
}
