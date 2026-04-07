// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

/**
 * @beta
 */
export interface ICloudBuildCacheProvider {
  readonly isCacheWriteAllowed: boolean;

  tryGetCacheEntryBufferByIdAsync(terminal: ITerminal, cacheId: string): Promise<Buffer | undefined>;
  trySetCacheEntryBufferAsync(terminal: ITerminal, cacheId: string, entryBuffer: Buffer): Promise<boolean>;

  /**
   * If implemented, the build cache will prefer to use this method over
   * {@link ICloudBuildCacheProvider.tryGetCacheEntryBufferByIdAsync} to avoid loading the entire
   * cache entry into memory, if possible. The implementation should download the cache entry and write it
   * to the specified local file path.
   *
   * @returns `true` if the cache entry was found and written to the file, `false` if it was
   * not found. Throws on errors.
   */
  tryDownloadCacheEntryToFileAsync?(
    terminal: ITerminal,
    cacheId: string,
    localFilePath: string
  ): Promise<boolean>;
  /**
   * If implemented, the build cache will prefer to use this method over
   * {@link ICloudBuildCacheProvider.trySetCacheEntryBufferAsync} to avoid loading the entire
   * cache entry into memory, if possible. The implementation should read the cache entry from
   * the specified local file path and upload it.
   *
   * @returns `true` if the cache entry was written to the cache, otherwise `false`.
   */
  tryUploadCacheEntryFromFileAsync?(
    terminal: ITerminal,
    cacheId: string,
    localFilePath: string
  ): Promise<boolean>;

  updateCachedCredentialAsync(terminal: ITerminal, credential: string): Promise<void>;
  updateCachedCredentialInteractiveAsync(terminal: ITerminal): Promise<void>;
  deleteCachedCredentialsAsync(terminal: ITerminal): Promise<void>;
}
