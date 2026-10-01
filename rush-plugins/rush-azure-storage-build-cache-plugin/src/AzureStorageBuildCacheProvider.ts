// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  type BlobClient,
  BlobServiceClient,
  type BlockBlobClient,
  type ContainerClient
} from '@azure/storage-blob';
import { AzureAuthorityHosts } from '@azure/identity';

import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import {
  type ICloudBuildCacheProvider,
  EnvironmentVariableNames,
  RushConstants,
  EnvironmentConfiguration,
  type ICredentialCacheEntry
} from '@rushstack/rush-sdk';

import {
  AzureStorageAuthentication,
  type IAzureStorageAuthenticationOptions
} from './AzureStorageAuthentication';

export interface IAzureStorageBuildCacheProviderOptions extends IAzureStorageAuthenticationOptions {
  blobPrefix?: string;
  readRequiresAuthentication?: boolean;
}

interface IBlobError extends Error {
  statusCode: number;
  code: string;
  response?: {
    status: string;
    parsedHeaders?: {
      errorCode: string;
    };
  };
}

interface IKeptContainerClient {
  client: ContainerClient;
  isAnonymous: boolean;
}

export class AzureStorageBuildCacheProvider
  extends AzureStorageAuthentication
  implements ICloudBuildCacheProvider
{
  readonly #blobPrefix: string | undefined;
  readonly #environmentCredential: string | undefined;
  readonly #readRequiresAuthentication: boolean;

  public get isCacheWriteAllowed(): boolean {
    return EnvironmentConfiguration.buildCacheWriteAllowed ?? this._isCacheWriteAllowedByConfiguration;
  }

  // A long-lived process, such as the Rush daemon, keeps this provider across builds. So a client made
  // from a credential is kept only until Azure Storage rejects it, and an anonymous client only until
  // a credential is cached.
  #keptContainerClient: IKeptContainerClient | undefined;

  public constructor(options: IAzureStorageBuildCacheProviderOptions) {
    super({
      credentialUpdateCommandForLogging: `rush ${RushConstants.updateCloudCredentialsCommandName}`,
      ...options
    });

    this.#blobPrefix = options.blobPrefix;
    this.#environmentCredential = EnvironmentConfiguration.buildCacheCredential;
    this.#readRequiresAuthentication = !!options.readRequiresAuthentication;

    if (!(this._azureEnvironment in AzureAuthorityHosts)) {
      throw new Error(
        `The specified Azure Environment ("${this._azureEnvironment}") is invalid. If it is specified, it must ` +
          `be one of: ${Object.keys(AzureAuthorityHosts).join(', ')}`
      );
    }
  }

  public async tryGetCacheEntryBufferByIdAsync(
    terminal: ITerminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    return await this.#tryGetBlobDataAsync(terminal, cacheId, async (blobClient: BlobClient) => {
      return await blobClient.downloadToBuffer();
    });
  }

  public async trySetCacheEntryBufferAsync(
    terminal: ITerminal,
    cacheId: string,
    entryBuffer: Buffer
  ): Promise<boolean> {
    return await this.#trySetBlobDataAsync(terminal, cacheId, async (blockBlobClient: BlockBlobClient) => {
      await blockBlobClient.upload(entryBuffer, entryBuffer.length);
    });
  }

  public async tryDownloadCacheEntryToFileAsync(
    terminal: ITerminal,
    cacheId: string,
    localFilePath: string
  ): Promise<boolean> {
    const result: boolean | undefined = await this.#tryGetBlobDataAsync(
      terminal,
      cacheId,
      async (blobClient: BlobClient) => {
        // TODO: Determine if this is necessary, or if the Azure Storage SDK handles this internally.
        await FileSystem.ensureFolderAsync(path.dirname(localFilePath));
        await blobClient.downloadToFile(localFilePath);
        return true;
      }
    );

    return result ?? false;
  }

  public async tryUploadCacheEntryFromFileAsync(
    terminal: ITerminal,
    cacheId: string,
    localFilePath: string
  ): Promise<boolean> {
    return await this.#trySetBlobDataAsync(terminal, cacheId, async (blockBlobClient: BlockBlobClient) => {
      await blockBlobClient.uploadFile(localFilePath);
    });
  }

  /**
   * Shared logic for both buffer-based and file-based GET operations.
   * Checks if the blob exists, retrieves data via the provided callback, and handles errors.
   */
  async #tryGetBlobDataAsync<T>(
    terminal: ITerminal,
    cacheId: string,
    getBlobDataAsync: (blobClient: BlobClient) => Promise<T>
  ): Promise<T | undefined> {
    const containerClient: ContainerClient = await this.#getContainerClientAsync(terminal);
    const blobClient: BlobClient = this.#getBlobClient(containerClient, cacheId);

    try {
      const blobExists: boolean = await blobClient.exists();
      if (blobExists) {
        return await getBlobDataAsync(blobClient);
      } else {
        return undefined;
      }
    } catch (err) {
      this.#logBlobError(terminal, err, 'Error getting cache entry from Azure Storage: ');
      this.#forgetRejectedClient(containerClient, err);
      return undefined;
    }
  }

  /**
   * Shared logic for both buffer-based and file-based SET operations.
   * Checks write permission, whether the blob already exists, uploads via the provided callback,
   * and handles 409 conflict errors.
   */
  async #trySetBlobDataAsync(
    terminal: ITerminal,
    cacheId: string,
    uploadAsync: (blockBlobClient: BlockBlobClient) => Promise<void>
  ): Promise<boolean> {
    if (!this.isCacheWriteAllowed) {
      terminal.writeErrorLine(
        'Writing to Azure Blob Storage cache is not allowed in the current configuration.'
      );
      return false;
    }

    const containerClient: ContainerClient = await this.#getContainerClientAsync(terminal);
    const blobClient: BlobClient = this.#getBlobClient(containerClient, cacheId);
    const blockBlobClient: BlockBlobClient = blobClient.getBlockBlobClient();
    let blobAlreadyExists: boolean = false;

    try {
      blobAlreadyExists = await blockBlobClient.exists();
    } catch (err) {
      const e: IBlobError = err as IBlobError;

      // If RUSH_BUILD_CACHE_CREDENTIAL is set but is corrupted or has been rotated
      // in Azure Portal, or the user's own cached credentials have been corrupted or
      // invalidated, we'll print the error and continue (this way we don't fail the
      // actual rush build).
      const errorMessage: string =
        'Error checking if cache entry exists in Azure Storage: ' +
        [e.name, e.message, e.response?.status, e.response?.parsedHeaders?.errorCode]
          .filter((piece: string | undefined) => piece)
          .join(' ');

      terminal.writeWarningLine(errorMessage);
      this.#forgetRejectedClient(containerClient, err);
    }

    if (blobAlreadyExists) {
      terminal.writeVerboseLine('Build cache entry blob already exists.');
      return true;
    } else {
      try {
        await uploadAsync(blockBlobClient);
        return true;
      } catch (e) {
        if ((e as IBlobError).statusCode === 409 /* conflict */) {
          // If something else has written to the blob at the same time,
          // it's probably a concurrent process that is attempting to write
          // the same cache entry. That is an effective success.
          terminal.writeVerboseLine(
            'Azure Storage returned status 409 (conflict). The cache entry has ' +
              `probably already been set by another builder. Code: "${(e as IBlobError).code}".`
          );
          return true;
        } else {
          terminal.writeWarningLine(`Error uploading cache entry to Azure Storage: ${e}`);
          this.#forgetRejectedClient(containerClient, e);
          return false;
        }
      }
    }
  }

  #getBlobClient(containerClient: ContainerClient, cacheId: string): BlobClient {
    const blobName: string = this.#blobPrefix ? `${this.#blobPrefix}/${cacheId}` : cacheId;
    return containerClient.getBlobClient(blobName);
  }

  /**
   * Azure Storage answers 401 or 403 when it rejects a credential, for example once it has expired.
   * Forget the client that was made from it, so that the next request reads the cached credential again.
   */
  #forgetRejectedClient(containerClient: ContainerClient, error: unknown): void {
    const statusCode: number | undefined = (error as IBlobError | undefined)?.statusCode;
    const keptClient: IKeptContainerClient | undefined = this.#keptContainerClient;
    if (
      (statusCode === 401 || statusCode === 403) &&
      keptClient?.client === containerClient &&
      !keptClient.isAnonymous
    ) {
      this.#keptContainerClient = undefined;
    }
  }

  #logBlobError(terminal: ITerminal, err: unknown, prefix: string): void {
    const e: IBlobError = err as IBlobError;
    const errorMessage: string =
      prefix +
      [e.name, e.message, e.response?.status, e.response?.parsedHeaders?.errorCode]
        .filter((piece: string | undefined) => piece)
        .join(' ');

    if (e.response?.parsedHeaders?.errorCode === 'PublicAccessNotPermitted') {
      terminal.writeWarningLine(
        `${errorMessage}\n\n` +
          `You need to configure Azure Storage SAS credentials to access the build cache.\n` +
          `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}", \n` +
          `or provide a SAS in the ` +
          `${EnvironmentVariableNames.RUSH_BUILD_CACHE_CREDENTIAL} environment variable.`
      );
    } else if (e.response?.parsedHeaders?.errorCode === 'AuthenticationFailed') {
      terminal.writeWarningLine(
        `${errorMessage}\n\n` +
          `Your Azure Storage SAS credentials are not valid.\n` +
          `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}", \n` +
          `or provide a SAS in the ` +
          `${EnvironmentVariableNames.RUSH_BUILD_CACHE_CREDENTIAL} environment variable.`
      );
    } else if (e.response?.parsedHeaders?.errorCode === 'AuthorizationPermissionMismatch') {
      terminal.writeWarningLine(
        `${errorMessage}\n\n` +
          `Your Azure Storage SAS credentials are valid, but do not have permission to read the build cache.\n` +
          `Make sure you have added the role 'Storage Blob Data Reader' to the appropriate user(s) or group(s)\n` +
          `on your storage account in the Azure Portal.`
      );
    } else {
      terminal.writeWarningLine(errorMessage);
    }
  }

  async #getContainerClientAsync(terminal: ITerminal): Promise<ContainerClient> {
    const keptClient: IKeptContainerClient | undefined = this.#keptContainerClient;
    if (keptClient && !keptClient.isAnonymous) {
      return keptClient.client;
    }

    let sasString: string | undefined = this.#environmentCredential;
    if (!sasString) {
      let credentialEntry: ICredentialCacheEntry | undefined;
      if (keptClient) {
        // While the kept client is anonymous, look for a credential on each request, and don't repeat
        // the warning about an expired one. If the file can't be read, for example while it is being
        // written, keep using the anonymous client rather than failing the request.
        try {
          credentialEntry = await this.tryGetCachedCredentialAsync({ expiredCredentialBehavior: 'ignore' });
        } catch {
          terminal.writeVerboseLine(
            "Couldn't read the cached Azure Storage credentials. Using the build cache without them."
          );
        }
      } else {
        credentialEntry = await this.tryGetCachedCredentialAsync({
          expiredCredentialBehavior: 'logWarning',
          terminal
        });
      }

      sasString = credentialEntry?.credential;
    }

    if (keptClient && !sasString) {
      return keptClient.client;
    }

    let blobServiceClient: BlobServiceClient;
    if (sasString) {
      const connectionString: string = this.#getConnectionString(sasString);
      blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    } else if (!this.#readRequiresAuthentication && !this._isCacheWriteAllowedByConfiguration) {
      // If we don't have a credential and read doesn't require authentication, we can still read from the cache.
      blobServiceClient = new BlobServiceClient(this._storageAccountUrl);
    } else {
      throw new Error(
        "An Azure Storage SAS credential hasn't been provided, or has expired. " +
          `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}", ` +
          `or provide a SAS in the ` +
          `${EnvironmentVariableNames.RUSH_BUILD_CACHE_CREDENTIAL} environment variable`
      );
    }

    const containerClient: ContainerClient = blobServiceClient.getContainerClient(this._storageContainerName);
    this.#keptContainerClient = { client: containerClient, isAnonymous: !sasString };
    return containerClient;
  }

  #getConnectionString(sasString: string | undefined): string {
    const blobEndpoint: string = `BlobEndpoint=${this._storageAccountUrl}`;
    if (sasString) {
      const connectionString: string = `${blobEndpoint};SharedAccessSignature=${sasString}`;
      return connectionString;
    } else {
      return blobEndpoint;
    }
  }
}
