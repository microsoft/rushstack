// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { FileSystem, type FileSystemWriteStream } from '@rushstack/node-core-library';
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
  private readonly _cacheFolderPath: string;

  public constructor(options: IFileSystemBuildCacheProviderOptions) {
    const {
      rushUserConfiguration: { buildCacheFolder },
      rushConfiguration: { commonTempFolder }
    } = options;
    this._cacheFolderPath = buildCacheFolder || path.join(commonTempFolder, DEFAULT_BUILD_CACHE_FOLDER_NAME);
  }

  /**
   * Returns the absolute disk path for the specified cache id.
   */
  public getCacheEntryPath(cacheId: string): string {
    return path.join(this._cacheFolderPath, cacheId);
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
    return await this._setCacheEntryAsync(
      terminal,
      cacheId,
      async (cacheEntryFilePath: string): Promise<void> => {
        await FileSystem.writeFileAsync(cacheEntryFilePath, entryBuffer, { ensureFolderExists: true });
      }
    );
  }

  /**
   * Writes the specified stream to the corresponding file system path for the cache id.
   * This avoids loading the entire cache entry into memory.
   */
  public async trySetCacheEntryStreamAsync(
    terminal: ITerminal,
    cacheId: string,
    entryStream: NodeJS.ReadableStream
  ): Promise<string> {
    return await this._setCacheEntryAsync(
      terminal,
      cacheId,
      async (cacheEntryFilePath: string): Promise<void> => {
        const writeStream: FileSystemWriteStream = await FileSystem.createWriteStreamAsync(
          cacheEntryFilePath,
          {
            ensureFolderExists: true
          }
        );
        await pipeline(entryStream, writeStream);
      }
    );
  }

  private async _setCacheEntryAsync(
    terminal: ITerminal,
    cacheId: string,
    setEntryCallbackAsync: (cacheEntryFilePath: string) => Promise<void>
  ): Promise<string> {
    const cacheEntryFilePath: string = this.getCacheEntryPath(cacheId);
    await setEntryCallbackAsync(cacheEntryFilePath);
    terminal.writeVerboseLine(`Wrote cache entry to "${cacheEntryFilePath}".`);
    return cacheEntryFilePath;
  }
}
