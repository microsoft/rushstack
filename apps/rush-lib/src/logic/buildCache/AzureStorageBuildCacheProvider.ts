// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildCacheProviderBase, IBuildCacheProviderBaseOptions } from './BuildCacheProviderBase';
import { Terminal } from '@rushstack/node-core-library';
import {
  BlobClient,
  BlobSASPermissions,
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  SASQueryParameters,
  ServiceGetUserDelegationKeyResponse,
  UserDelegationKey
} from '@azure/storage-blob';
import { AzureAuthorityHosts, DeviceCodeCredential, DeviceCodeInfo } from '@azure/identity';

import { EnvironmentConfiguration, EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import {
  BuildCacheProviderCredentialCache,
  IBuildCacheProviderCredentialCacheEntry
} from './BuildCacheProviderCredentialCache';
import { URLSearchParams } from 'url';
import { RushConstants } from '../RushConstants';
import { Utilities } from '../../utilities/Utilities';

export type AzureEnvironmentNames = keyof typeof AzureAuthorityHosts;

export interface IAzureStorageBuildCacheProviderOptions extends IBuildCacheProviderBaseOptions {
  storageContainerName: string;
  storageAccountName: string;
  azureEnvironment?: AzureEnvironmentNames;
  blobPrefix?: string;
  isCacheWriteAllowed: boolean;
  rushGlobalFolder: RushGlobalFolder;
}

const SAS_TTL_MILLISECONDS: number = 7 * 24 * 60 * 60 * 1000; // Seven days

export class AzureStorageBuildCacheProvider extends BuildCacheProviderBase {
  private readonly _storageAccountName: string;
  private readonly _storageContainerName: string;
  private readonly _azureEnvironment: AzureEnvironmentNames;
  private readonly _blobPrefix: string | undefined;
  private readonly _isCacheWriteAllowed: boolean;
  private readonly _rushGlobalFolder: RushGlobalFolder;
  private __credentialCacheId: string | undefined;

  private _containerClient: ContainerClient | undefined;

  public constructor(options: IAzureStorageBuildCacheProviderOptions) {
    super(options);
    this._storageAccountName = options.storageAccountName;
    this._storageContainerName = options.storageContainerName;
    this._azureEnvironment = options.azureEnvironment || 'AzurePublicCloud';
    this._blobPrefix = options.blobPrefix;
    this._isCacheWriteAllowed = options.isCacheWriteAllowed;
    this._rushGlobalFolder = options.rushGlobalFolder;

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

      if (this._isCacheWriteAllowed) {
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
    const blobExists: boolean = await blobClient.exists();
    if (blobExists) {
      return await blobClient.downloadToBuffer();
    } else {
      return undefined;
    }
  }

  public async trySetCacheEntryBufferAsync(
    terminal: Terminal,
    cacheId: string,
    entryStream: Buffer
  ): Promise<boolean> {
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
    const credentialsCache: BuildCacheProviderCredentialCache = await BuildCacheProviderCredentialCache.initializeAsync(
      this._rushGlobalFolder,
      true
    );
    credentialsCache.setCacheEntry(this._credentialCacheId, credential);
    await credentialsCache.saveIfModifiedAsync();
    credentialsCache.dispose();
  }

  public async updateCachedCredentialInteractiveAsync(terminal: Terminal): Promise<void> {
    const credentialsCache: BuildCacheProviderCredentialCache = await BuildCacheProviderCredentialCache.initializeAsync(
      this._rushGlobalFolder,
      true
    );

    const sasQueryParameters: SASQueryParameters = await this._getSasQueryParametersAsync(terminal);
    const sasString: string = this._getSasStringFromQueryParameters(sasQueryParameters);

    credentialsCache.setCacheEntry(this._credentialCacheId, sasString, sasQueryParameters.expiresOn);
    await credentialsCache.saveIfModifiedAsync();
    credentialsCache.dispose();
  }

  public async deleteCachedCredentialsAsync(terminal: Terminal): Promise<void> {
    const credentialsCache: BuildCacheProviderCredentialCache = await BuildCacheProviderCredentialCache.initializeAsync(
      this._rushGlobalFolder,
      true
    );
    credentialsCache.deleteCacheEntry(this._credentialCacheId);
    await credentialsCache.saveIfModifiedAsync();
    credentialsCache.dispose();
  }

  private async _getBlobClientForCacheIdAsync(cacheId: string): Promise<BlobClient> {
    const client: ContainerClient = await this._getContainerClientAsync();
    const blobName: string = this._blobPrefix ? `${this._blobPrefix}/${cacheId}` : cacheId;
    return client.getBlobClient(blobName);
  }

  private async _getContainerClientAsync(): Promise<ContainerClient> {
    if (!this._containerClient) {
      let sasString: string | undefined = EnvironmentConfiguration.buildCacheCredential;
      if (!sasString) {
        const credentialCache: BuildCacheProviderCredentialCache = await BuildCacheProviderCredentialCache.initializeAsync(
          this._rushGlobalFolder,
          false
        );
        const cacheEntry:
          | IBuildCacheProviderCredentialCacheEntry
          | undefined = credentialCache.tryGetCacheEntry(this._credentialCacheId);
        credentialCache.dispose();
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
      if (sasString || !this._isCacheWriteAllowed) {
        const connectionString: string = this._getConnectionString(sasString);
        blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
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

  private async _getSasQueryParametersAsync(terminal: Terminal): Promise<SASQueryParameters> {
    const authorityHost: string | undefined = AzureAuthorityHosts[this._azureEnvironment];
    if (!authorityHost) {
      throw new Error(`Unexpected Azure environment: ${this._azureEnvironment}`);
    }

    const deviceCodeCredential: DeviceCodeCredential = new DeviceCodeCredential(
      undefined,
      undefined,
      (deviceCodeInfo: DeviceCodeInfo) => {
        this._printMessageInBox(deviceCodeInfo.message, terminal);
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

    const blobSasPermissions: BlobSASPermissions = new BlobSASPermissions();
    blobSasPermissions.read = true;
    blobSasPermissions.create = this._isCacheWriteAllowed;

    const userDelegationKey: UserDelegationKey = key;
    const queryParameters: SASQueryParameters = generateBlobSASQueryParameters(
      {
        startsOn: startsOn,
        expiresOn: expires,
        permissions: blobSasPermissions,
        containerName: this._storageContainerName,
        blobName: 'dummy-blob-name'
      },
      userDelegationKey,
      this._storageAccountName
    );

    return queryParameters;
  }

  private _printMessageInBox(message: string, terminal: Terminal): void {
    const boxWidth: number = Math.floor(Utilities.getConsoleWidth() / 2);
    const maxLineLength: number = boxWidth - 10;

    const wrappedMessage: string = Utilities.wrapWords(message, maxLineLength);
    const wrappedMessageLines: string[] = wrappedMessage.split('\n');

    // ╔═══════════╗
    // ║  Message  ║
    // ╚═══════════╝
    terminal.writeLine(' ╔' + new Array(boxWidth - 3).join('═') + '╗ ');
    for (const line of wrappedMessageLines) {
      const trimmedLine: string = line.trim();
      const padding: number = boxWidth - trimmedLine.length - 4;
      const leftPadding: number = Math.floor(padding / 2);
      const rightPadding: number = padding - leftPadding;
      terminal.writeLine(
        ' ║' +
          new Array(leftPadding + 1).join(' ') +
          trimmedLine +
          (new Array(rightPadding + 1).join(' ') + '║ ')
      );
    }
    terminal.writeLine(' ╚' + new Array(boxWidth - 3).join('═') + '╝ ');
  }

  private _getSasStringFromQueryParameters(sasQueryParameters: SASQueryParameters): string {
    const sasQuerySearchParameters: URLSearchParams = new URLSearchParams();
    for (const [parameterName, parameterValue] of Object.entries(sasQueryParameters)) {
      if (parameterValue) {
        let serializedParameterValue: string;
        if (parameterValue instanceof Date) {
          serializedParameterValue = parameterValue.toISOString();
        } else {
          serializedParameterValue = parameterValue;
        }
        sasQuerySearchParameters.append(parameterName, serializedParameterValue);
      }
    }

    return sasQuerySearchParameters.toString();
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
