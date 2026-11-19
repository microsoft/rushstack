// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TokenCredential } from '@azure/identity';
import {
  BlobServiceClient,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  type SASQueryParameters,
  type ServiceGetUserDelegationKeyResponse
} from '@azure/storage-blob';

import type { ITerminal } from '@rushstack/terminal';

import {
  AzureAuthenticationBase,
  type ICredentialResult,
  type IAzureAuthenticationBaseOptions
} from './AzureAuthenticationBase';

/**
 * @public
 */
export interface IAzureStorageAuthenticationOptions extends IAzureAuthenticationBaseOptions {
  storageContainerName: string;
  storageAccountName: string;
  storageEndpoint?: string;
  isCacheWriteAllowed: boolean;
}

const SAS_TTL_MILLISECONDS: number = 7 * 24 * 60 * 60 * 1000; // Seven days

function getDefaultStorageAccountUrl(storageAccountName: string): string {
  return `https://${storageAccountName}.blob.core.windows.net/`;
}

/**
 * @public
 */
export class AzureStorageAuthentication extends AzureAuthenticationBase {
  protected readonly _credentialNameForCache: string = 'azure-blob-storage';
  protected readonly _credentialKindForLogging: string = 'Storage';

  protected readonly _storageAccountName: string;
  protected readonly _storageContainerName: string;
  protected readonly _isCacheWriteAllowedByConfiguration: boolean;
  protected readonly _storageAccountUrl: string;

  public constructor(options: IAzureStorageAuthenticationOptions) {
    super(options);
    const { storageAccountName, storageContainerName, isCacheWriteAllowed, storageEndpoint } = options;
    this._storageAccountName = storageAccountName;
    this._storageContainerName = storageContainerName;
    this._isCacheWriteAllowedByConfiguration = isCacheWriteAllowed;
    this._storageAccountUrl = storageEndpoint
      ? storageEndpoint.endsWith('/')
        ? storageEndpoint
        : storageEndpoint + '/'
      : getDefaultStorageAccountUrl(storageAccountName);
  }

  protected _getCacheIdParts(): string[] {
    const cacheIdParts: string[] = [this._storageAccountName, this._storageContainerName];

    // A saved credential is sent to the endpoint that it was saved for, and to no other. The default
    // endpoint keeps the ID that it had before storageEndpoint existed.
    if (this._storageAccountUrl !== getDefaultStorageAccountUrl(this._storageAccountName)) {
      cacheIdParts.push(this._storageAccountUrl);
    }

    if (this._isCacheWriteAllowedByConfiguration) {
      cacheIdParts.push('cacheWriteAllowed');
    }

    return cacheIdParts;
  }

  protected async _getCredentialFromTokenAsync(
    terminal: ITerminal,
    tokenCredential: TokenCredential
  ): Promise<ICredentialResult> {
    const blobServiceClient: BlobServiceClient = new BlobServiceClient(
      this._storageAccountUrl,
      tokenCredential
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

    return {
      credentialString: queryParameters.toString(),
      expiresOn: queryParameters.expiresOn
    };
  }
}
