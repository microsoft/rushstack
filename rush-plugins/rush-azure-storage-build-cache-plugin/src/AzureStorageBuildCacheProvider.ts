// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type BlobClient,
  BlobServiceClient,
  type BlockBlobClient,
  type ContainerClient
} from '@azure/storage-blob';
import { AzureAuthorityHosts } from '@azure/identity';

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

export class AzureStorageBuildCacheProvider
  extends AzureStorageAuthentication
  implements ICloudBuildCacheProvider
{
  private readonly _blobPrefix: string | undefined;
  private readonly _environmentCredential: string | undefined;
  private readonly _readRequiresAuthentication: boolean;

  public get isCacheWriteAllowed(): boolean {
    return EnvironmentConfiguration.buildCacheWriteAllowed ?? this._isCacheWriteAllowedByConfiguration;
  }

  private _containerClient: ContainerClient | undefined;

  public constructor(options: IAzureStorageBuildCacheProviderOptions) {
    super({
      credentialUpdateCommandForLogging: `rush ${RushConstants.updateCloudCredentialsCommandName}`,
      ...options
    });

    this._blobPrefix = options.blobPrefix;
    this._environmentCredential = EnvironmentConfiguration.buildCacheCredential;
    this._readRequiresAuthentication = !!options.readRequiresAuthentication;

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
    const blobClient: BlobClient = await this._getBlobClientForCacheIdAsync(cacheId, terminal);

    try {
      const blobExists: boolean = await blobClient.exists();
      if (blobExists) {
        return await blobClient.downloadToBuffer();
      } else {
        return undefined;
      }
    } catch (err) {
      const e: IBlobError = err as IBlobError;
      const errorMessage: string =
        'Error getting cache entry from Azure Storage: ' +
        [e.name, e.message, e.response?.status, e.response?.parsedHeaders?.errorCode]
          .filter((piece: string | undefined) => piece)
          .join(' ');

      if (e.response?.parsedHeaders?.errorCode === 'PublicAccessNotPermitted') {
        // This error means we tried to read the cache with no credentials, but credentials are required.
        // We'll assume that the configuration of the cache is correct and the user has to take action.
        terminal.writeWarningLine(
          `${errorMessage}\n\n` +
            `You need to configure Azure Storage SAS credentials to access the build cache.\n` +
            `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}", \n` +
            `or provide a SAS in the ` +
            `${EnvironmentVariableNames.RUSH_BUILD_CACHE_CREDENTIAL} environment variable.`
        );
      } else if (e.response?.parsedHeaders?.errorCode === 'AuthenticationFailed') {
        // This error means the user's credentials are incorrect, but not expired normally. They might have
        // gotten corrupted somehow, or revoked manually in Azure Portal.
        terminal.writeWarningLine(
          `${errorMessage}\n\n` +
            `Your Azure Storage SAS credentials are not valid.\n` +
            `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}", \n` +
            `or provide a SAS in the ` +
            `${EnvironmentVariableNames.RUSH_BUILD_CACHE_CREDENTIAL} environment variable.`
        );
      } else if (e.response?.parsedHeaders?.errorCode === 'AuthorizationPermissionMismatch') {
        // This error is not solvable by the user, so we'll assume it is a configuration error, and revert
        // to providing likely next steps on configuration. (Hopefully this error is rare for a regular
        // developer, more likely this error will appear while someone is configuring the cache for the
        // first time.)
        terminal.writeWarningLine(
          `${errorMessage}\n\n` +
            `Your Azure Storage SAS credentials are valid, but do not have permission to read the build cache.\n` +
            `Make sure you have added the role 'Storage Blob Data Reader' to the appropriate user(s) or group(s)\n` +
            `on your storage account in the Azure Portal.`
        );
      } else {
        // We don't know what went wrong, hopefully we'll print something useful.
        terminal.writeWarningLine(errorMessage);
      }
      return undefined;
    }
  }

  public async trySetCacheEntryBufferAsync(
    terminal: ITerminal,
    cacheId: string,
    entryStream: Buffer
  ): Promise<boolean> {
    if (!this.isCacheWriteAllowed) {
      terminal.writeErrorLine(
        'Writing to Azure Blob Storage cache is not allowed in the current configuration.'
      );
      return false;
    }

    const blobClient: BlobClient = await this._getBlobClientForCacheIdAsync(cacheId, terminal);
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
    }

    if (blobAlreadyExists) {
      terminal.writeVerboseLine('Build cache entry blob already exists.');
      return true;
    } else {
      try {
        await blockBlobClient.upload(entryStream, entryStream.length);
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
          return false;
        }
      }
    }
  }

  private async _getBlobClientForCacheIdAsync(cacheId: string, terminal: ITerminal): Promise<BlobClient> {
    const client: ContainerClient = await this._getContainerClientAsync(terminal);
    const blobName: string = this._blobPrefix ? `${this._blobPrefix}/${cacheId}` : cacheId;
    return client.getBlobClient(blobName);
  }

  private async _getContainerClientAsync(terminal: ITerminal): Promise<ContainerClient> {
    if (!this._containerClient) {
      let sasString: string | undefined = this._environmentCredential;
      if (!sasString) {
        const credentialEntry: ICredentialCacheEntry | undefined = await this.tryGetCachedCredentialAsync({
          expiredCredentialBehavior: 'logWarning',
          terminal
        });

        sasString = credentialEntry?.credential;
      }

      let blobServiceClient: BlobServiceClient;
      if (sasString) {
        const connectionString: string = this._getConnectionString(sasString);
        blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      } else if (!this._readRequiresAuthentication && !this._isCacheWriteAllowedByConfiguration) {
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

      this._containerClient = blobServiceClient.getContainerClient(this._storageContainerName);
    }

    return this._containerClient;
  }

  private _getConnectionString(sasString: string | undefined): string {
    const blobEndpoint: string = `BlobEndpoint=${this._storageAccountUrl}`;
    if (sasString) {
      const connectionString: string = `${blobEndpoint};SharedAccessSignature=${sasString}`;
      return connectionString;
    } else {
      return blobEndpoint;
    }
  }
}
