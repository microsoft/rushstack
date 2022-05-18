// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DeviceCodeCredential, DeviceCodeInfo } from '@azure/identity';
import {
  BlobServiceClient,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  SASQueryParameters,
  ServiceGetUserDelegationKeyResponse
} from '@azure/storage-blob';
import type { ITerminal } from '@rushstack/node-core-library';
import { CredentialCache, ICredentialCacheEntry, RushConstants } from '@rushstack/rush-sdk';
import { PrintUtilities } from '@rushstack/terminal';

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
// TODO: This is a temporary workaround; it should be reverted when we upgrade to "@azure/identity" version 2.x
// import { AzureAuthorityHosts } from '@azure/identity';
/**
 * @public
 */
export enum AzureAuthorityHosts {
  AzureChina = 'https://login.chinacloudapi.cn',
  AzureGermany = 'https://login.microsoftonline.de',
  AzureGovernment = 'https://login.microsoftonline.us',
  AzurePublicCloud = 'https://login.microsoftonline.com'
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

/**
 * @public
 */
export type AzureEnvironmentNames = keyof typeof AzureAuthorityHosts;

/**
 * @public
 */
export interface IAzureStorageAuthenticationOptions {
  storageContainerName: string;
  storageAccountName: string;
  azureEnvironment?: AzureEnvironmentNames;
  isCacheWriteAllowed: boolean;
}

const SAS_TTL_MILLISECONDS: number = 7 * 24 * 60 * 60 * 1000; // Seven days

/**
 * @public
 */
export class AzureStorageAuthentication {
  protected readonly _azureEnvironment: AzureEnvironmentNames;
  protected readonly _storageAccountName: string;
  protected readonly _storageContainerName: string;
  protected readonly _isCacheWriteAllowedByConfiguration: boolean;

  private __credentialCacheId: string | undefined;
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

      this.__credentialCacheId = cacheIdParts.join('|');
    }

    return this.__credentialCacheId;
  }

  protected get _storageAccountUrl(): string {
    return `https://${this._storageAccountName}.blob.core.windows.net/`;
  }

  public constructor(options: IAzureStorageAuthenticationOptions) {
    this._storageAccountName = options.storageAccountName;
    this._storageContainerName = options.storageContainerName;
    this._azureEnvironment = options.azureEnvironment || 'AzurePublicCloud';
    this._isCacheWriteAllowedByConfiguration = options.isCacheWriteAllowed;
  }

  public async updateCachedCredentialAsync(terminal: ITerminal, credential: string): Promise<void> {
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

  /**
   * Launches an interactive flow to renew a cached credential.
   *
   * @param terminal - The terminal to log output to
   * @param onlyIfExistingCredentialExpiresAfter - If specified, and a cached credential exists that is still valid
   * after the date specified, no action will be taken.
   */
  public async updateCachedCredentialInteractiveAsync(
    terminal: ITerminal,
    onlyIfExistingCredentialExpiresAfter?: Date
  ): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        if (onlyIfExistingCredentialExpiresAfter) {
          const existingCredentialExpiration: Date | undefined = credentialsCache.tryGetCacheEntry(
            this._credentialCacheId
          )?.expires;
          if (
            existingCredentialExpiration &&
            existingCredentialExpiration > onlyIfExistingCredentialExpiresAfter
          ) {
            return;
          }
        }

        const sasQueryParameters: SASQueryParameters = await this._getSasQueryParametersAsync(terminal);
        const sasString: string = sasQueryParameters.toString();

        credentialsCache.setCacheEntry(this._credentialCacheId, sasString, sasQueryParameters.expiresOn);
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  public async deleteCachedCredentialsAsync(terminal: ITerminal): Promise<void> {
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

  public async tryGetCachedCredentialAsync(): Promise<string | undefined> {
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
      return cacheEntry?.credential;
    }
  }

  private async _getSasQueryParametersAsync(terminal: ITerminal): Promise<SASQueryParameters> {
    const authorityHost: string | undefined = AzureAuthorityHosts[this._azureEnvironment];
    if (!authorityHost) {
      throw new Error(`Unexpected Azure environment: ${this._azureEnvironment}`);
    }

    const DeveloperSignOnClientId: string = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
    const deviceCodeCredential: DeviceCodeCredential = new DeviceCodeCredential(
      'organizations',
      DeveloperSignOnClientId,
      (deviceCodeInfo: DeviceCodeInfo) => {
        PrintUtilities.printMessageInBox(deviceCodeInfo.message, terminal);
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
}
