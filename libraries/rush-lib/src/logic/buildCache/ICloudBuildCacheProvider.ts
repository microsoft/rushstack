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
   * cache entry into memory.
   */
  tryGetCacheEntryStreamByIdAsync?(
    terminal: ITerminal,
    cacheId: string
  ): Promise<NodeJS.ReadableStream | undefined>;
  /**
   * If implemented, the build cache will prefer to use this method over
   * {@link ICloudBuildCacheProvider.trySetCacheEntryBufferAsync} to avoid loading the entire
   * cache entry into memory.
   *
   * @remarks
   * Because the provided stream can only be consumed once, implementations should not
   * attempt to retry the upload using the same stream. If retry logic is needed,
   * consider buffering internally or returning `false` so the caller can retry.
   */
  trySetCacheEntryStreamAsync?(
    terminal: ITerminal,
    cacheId: string,
    entryStream: NodeJS.ReadableStream
  ): Promise<boolean>;

  updateCachedCredentialAsync(terminal: ITerminal, credential: string): Promise<void>;
  updateCachedCredentialInteractiveAsync(terminal: ITerminal): Promise<void>;
  deleteCachedCredentialsAsync(terminal: ITerminal): Promise<void>;
}
