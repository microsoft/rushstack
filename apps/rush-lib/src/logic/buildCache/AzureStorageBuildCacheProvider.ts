// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '@rushstack/node-core-library';
import {
  BlobClient,
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  SASQueryParameters,
  ServiceGetUserDelegationKeyResponse
} from '@azure/storage-blob';
import { AzureAuthorityHosts, DeviceCodeCredential, DeviceCodeInfo } from '@azure/identity';

import { EnvironmentConfiguration, EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { CredentialCache, ICredentialCacheEntry } from '../CredentialCache';
import { RushConstants } from '../RushConstants';
import { Utilities } from '../../utilities/Utilities';
import { CloudBuildCacheProviderBase } from './CloudBuildCacheProviderBase';

export type AzureEnvironmentNames = keyof typeof AzureAuthorityHosts;

export interface IAzureStorageBuildCacheProviderOptions {
  storageContainerName: string;
  storageAccountName: string;
  azureEnvironment?: AzureEnvironmentNames;
  blobPrefix?: string;
  isCacheWriteAllowed: boolean;
}

const SAS_TTL_MILLISECONDS: number = 7 * 24 * 60 * 60 * 1000; // Seven days

export class AzureStorageBuildCacheProvider extends CloudBuildCacheProviderBase {
  private readonly _storageAccountName: string;
  private readonly _storageContainerName: string;
  private readonly _azureEnvironment: AzureEnvironmentNames;
  private readonly _blobPrefix: string | undefined;
  private readonly _environmentWriteCredential: string | undefined;
  private readonly _isCacheWriteAllowedByConfiguration: boolean;
  private __credentialCacheId: string | undefined;

  public get isCacheWriteAllowed(): boolean {
    return this._isCacheWriteAllowedByConfiguration || !!this._environmentWriteCredential;
  }

  private _containerClient: ContainerClient | undefined;

  public constructor(options: IAzureStorageBuildCacheProviderOptions) {
    super();
    this._storageAccountName = options.storageAccountName;
    this._storageContainerName = options.storageContainerName;
    this._azureEnvironment = options.azureEnvironment || 'AzurePublicCloud';
    this._blobPrefix = options.blobPrefix;
    this._environmentWriteCredential = EnvironmentConfiguration.buildCacheWriteCredential;
    this._isCacheWriteAllowedByConfiguration = options.isCacheWriteAllowed;

    if (!(this._azureEnvironment in AzureAuthorityHosts)) {
      throw new Error(
        `The specified Azure Environment ("${this._azureEnvironment}") is invalid. If it is specified, it must ` +
          `be one of: ${Object.keys(AzureAuthorityHosts).join(', ')}`
      );
    }
  }

  private get _credentialCacheId(): string {
    if (!this.__credentialCacheId) {
      const cacheIdParts: string[] = [
        'azure-blob-storage',
        this._azureEnvironment,
        this._storageAccountName,
        this._storageContainerName
      ];

      if (this._isCacheWriteAllowedByConfiguration) {
        cacheIdParts.push('cacheWriteAllowed');
      }

      return cacheIdParts.join('|');
    }

    return this.__credentialCacheId;
  }

  private get _storageAccountUrl(): string {
    return `https://${this._storageAccountName}.blob.core.windows.net/`;
  }

  public async tryGetCacheEntryBufferByIdAsync(
    terminal: Terminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    const blobClient: BlobClient = await this._getBlobClientForCacheIdAsync(cacheId);
    try {
      const blobExists: boolean = await blobClient.exists();
      if (blobExists) {
        return await blobClient.downloadToBuffer();
      } else {
        return undefined;
      }
    } catch (e) {
      terminal.writeWarningLine(`Error getting cache entry from Azure Storage: ${e}`);
      return undefined;
    }
  }

  public async trySetCacheEntryBufferAsync(
    terminal: Terminal,
    cacheId: string,
    entryStream: Buffer
  ): Promise<boolean> {
    if (!this.isCacheWriteAllowed) {
      terminal.writeErrorLine(
        'Writing to Azure Blob Storage cache is not allowed in the current configuration.'
      );
      return false;
    }

    const blobClient: BlobClient = await this._getBlobClientForCacheIdAsync(cacheId);
    const blockBlobClient: BlockBlobClient = blobClient.getBlockBlobClient();
    try {
      await blockBlobClient.upload(entryStream, entryStream.length);
      return true;
    } catch (e) {
      terminal.writeWarningLine(`Error uploading cache entry to Azure Storage: ${e}`);
      return false;
    }
  }

  public async updateCachedCredentialAsync(terminal: Terminal, credential: string): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        credentialsCache.setCacheEntry(this._credentialCacheId, credential);
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  public async updateCachedCredentialInteractiveAsync(terminal: Terminal): Promise<void> {
    const sasQueryParameters: SASQueryParameters = await this._getSasQueryParametersAsync(terminal);
    const sasString: string = sasQueryParameters.toString();

    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        credentialsCache.setCacheEntry(this._credentialCacheId, sasString, sasQueryParameters.expiresOn);
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  public async deleteCachedCredentialsAsync(terminal: Terminal): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        credentialsCache.deleteCacheEntry(this._credentialCacheId);
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  private async _getBlobClientForCacheIdAsync(cacheId: string): Promise<BlobClient> {
    const client: ContainerClient = await this._getContainerClientAsync();
    const blobName: string = this._blobPrefix ? `${this._blobPrefix}/${cacheId}` : cacheId;
    return client.getBlobClient(blobName);
  }

  private async _getContainerClientAsync(): Promise<ContainerClient> {
    if (!this._containerClient) {
      let sasString: string | undefined = this._environmentWriteCredential;
      if (!sasString) {
        let cacheEntry: ICredentialCacheEntry | undefined;
        await CredentialCache.usingAsync(
          {
            supportEditing: false
          },
          (credentialsCache: CredentialCache) => {
            cacheEntry = credentialsCache.tryGetCacheEntry(this._credentialCacheId);
          }
        );

        const expirationTime: number | undefined = cacheEntry?.expires?.getTime();
        if (expirationTime && expirationTime < Date.now()) {
          throw new Error(
            'Cached Azure Storage credentials have expired. ' +
              `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}".`
          );
        } else {
          sasString = cacheEntry?.credential;
        }
      }

      let blobServiceClient: BlobServiceClient;
      if (sasString) {
        const connectionString: string = this._getConnectionString(sasString);
        blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      } else if (!this._isCacheWriteAllowedByConfiguration) {
        // If cache write isn't allowed and we don't have a credential, assume the blob supports anonymous read
        blobServiceClient = new BlobServiceClient(this._storageAccountUrl);
      } else {
        throw new Error(
          "An Azure Storage SAS credential hasn't been provided, or has expired. " +
            `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}", ` +
            `or provide a SAS in the ` +
            `${EnvironmentVariableNames.RUSH_BUILD_CACHE_WRITE_CREDENTIAL} environment variable`
        );
      }

      this._containerClient = blobServiceClient.getContainerClient(this._storageContainerName);
    }

    return this._containerClient;
  }

  private async _getSasQueryParametersAsync(terminal: Terminal): Promise<SASQueryParameters> {
    const authorityHost: string | undefined = AzureAuthorityHosts[this._azureEnvironment];
    if (!authorityHost) {
      throw new Error(`Unexpected Azure environment: ${this._azureEnvironment}`);
    }

    const deviceCodeCredential: DeviceCodeCredential = new DeviceCodeCredential(
      undefined,
      undefined,
      (deviceCodeInfo: DeviceCodeInfo) => {
        Utilities.printMessageInBox(deviceCodeInfo.message, terminal);
      },
      { authorityHost: authorityHost }
    );
    const blobServiceClient: BlobServiceClient = new BlobServiceClient(
      this._storageAccountUrl,
      deviceCodeCredential
    );

    const startsOn: Date = new Date();
    const expires: Date = new Date(Date.now() + SAS_TTL_MILLISECONDS);
    const key: ServiceGetUserDelegationKeyResponse = await blobServiceClient.getUserDelegationKey(
      startsOn,
      expires
    );

    const containerSasPermissions: ContainerSASPermissions = new ContainerSASPermissions();
    containerSasPermissions.read = true;
    containerSasPermissions.write = this._isCacheWriteAllowedByConfiguration;

    const queryParameters: SASQueryParameters = generateBlobSASQueryParameters(
      {
        startsOn: startsOn,
        expiresOn: expires,
        permissions: containerSasPermissions,
        containerName: this._storageContainerName
      },
      key,
      this._storageAccountName
    );

    return queryParameters;
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
