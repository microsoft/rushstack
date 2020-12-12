// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CollatedTerminal } from '@rushstack/stream-collator';
import { BuildCacheProviderBase, IBuildCacheProviderBaseOptions } from './BuildCacheProviderBase';

import { BlobClient, BlobServiceClient, BlockBlobClient, ContainerClient } from '@azure/storage-blob';

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

  private _containerClient: ContainerClient | undefined;

  public constructor(options: IAzureStorageBuildCacheProviderOptions) {
    super(options);
    this._connectionString = options.connectionString;
    this._storageContainerName = options.storageContainerName;
    this._blobPrefix = options.blobPrefix;
    this._isCacheWriteAllowed = options.isCacheWriteAllowed;
  }

  public async tryGetCacheEntryBufferByIdAsync(
    terminal: CollatedTerminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    const blobClient: BlobClient = this._getBlobClientForCacheId(cacheId);
    const blobExists: boolean = await blobClient.exists();
    if (blobExists) {
      return await blobClient.downloadToBuffer();
    } else {
      return undefined;
    }
  }

  public async trySetCacheEntryBufferAsync(
    terminal: CollatedTerminal,
    cacheId: string,
    entryStream: Buffer
  ): Promise<boolean> {
    const blobClient: BlobClient = this._getBlobClientForCacheId(cacheId);
    const blockBlobClient: BlockBlobClient = blobClient.getBlockBlobClient();
    try {
      await blockBlobClient.upload(entryStream, entryStream.length);
      return true;
    } catch (e) {
      return false;
    }
  }

  private _getBlobClientForCacheId(cacheId: string): BlobClient {
    const client: ContainerClient = this._getContainerClient();
    const blobName: string = this._blobPrefix ? `${this._blobPrefix}/${cacheId}` : cacheId;
    return client.getBlobClient(blobName);
  }

  private _getContainerClient(): ContainerClient {
    if (!this._containerClient) {
      const blobServiceClient: BlobServiceClient = BlobServiceClient.fromConnectionString(
        this._connectionString
      );
      this._containerClient = blobServiceClient.getContainerClient(this._storageContainerName);
    }

    return this._containerClient;
  }
}
