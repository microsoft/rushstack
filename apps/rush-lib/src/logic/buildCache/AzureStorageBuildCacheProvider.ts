// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CollatedTerminal } from '@rushstack/stream-collator';
import { BuildCacheProviderBase, IBuildCacheProviderBaseOptions } from './BuildCacheProviderBase';

export interface IAzureStorageBuildCacheProviderOptions extends IBuildCacheProviderBaseOptions {
  connectionString: string;
  storageContainerName: string;
  blobPrefix?: string;
  isCacheWriteAllowed: boolean;
}

export class AzureStorageBuildCacheProvider extends BuildCacheProviderBase {
  private readonly _connectionString: string;
  private readonly _storageContainerName: string;
  private readonly _blobPrefix: string | undefined;
  private readonly _isCacheWriteAllowed: boolean;

  public constructor(options: IAzureStorageBuildCacheProviderOptions) {
    super(options);
    this._connectionString = options.connectionString;
    this._storageContainerName = options.storageContainerName;
    this._blobPrefix = options.blobPrefix;
    this._isCacheWriteAllowed = options.isCacheWriteAllowed;
  }

  protected _tryGetCacheEntryBufferAsync(
    terminal: CollatedTerminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    throw new Error('Method not implemented.');
  }

  protected _trySetCAcheEntryBufferAsync(
    terminal: CollatedTerminal,
    cacheId: string,
    entryStream: Buffer
  ): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
}
