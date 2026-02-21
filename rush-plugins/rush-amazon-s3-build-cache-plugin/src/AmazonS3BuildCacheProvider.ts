// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ICredentialCacheEntry, CredentialCache } from '@rushstack/credential-cache';
import type { ITerminal } from '@rushstack/terminal';
import {
  type ICloudBuildCacheProvider,
  type RushSession,
  RushConstants,
  EnvironmentVariableNames,
  EnvironmentConfiguration
} from '@rushstack/rush-sdk';
import { WebClient } from '@rushstack/rush-sdk/lib/utilities/WebClient';

import { AmazonS3Client } from './AmazonS3Client.ts';
import { type IAmazonS3Credentials, fromAmazonEnv, fromRushEnv } from './AmazonS3Credentials.ts';

/**
 * @public
 */
export interface IAmazonS3BuildCacheProviderOptionsBase {
  s3Region: string;
  s3Prefix: string | undefined;
  isCacheWriteAllowed: boolean;
}

/**
 * Advanced options where user has the specify the full http endpoint
 * @public
 */
export interface IAmazonS3BuildCacheProviderOptionsAdvanced extends IAmazonS3BuildCacheProviderOptionsBase {
  s3Endpoint: string;
}
/**
 * Simple options where user only provides the bucket and the endpoint is automatically built
 * @public
 */
export interface IAmazonS3BuildCacheProviderOptionsSimple extends IAmazonS3BuildCacheProviderOptionsBase {
  s3Bucket: string;
}

const DEFAULT_S3_REGION: 'us-east-1' = 'us-east-1';
export class AmazonS3BuildCacheProvider implements ICloudBuildCacheProvider {
  private readonly _options:
    | IAmazonS3BuildCacheProviderOptionsSimple
    | IAmazonS3BuildCacheProviderOptionsAdvanced;
  private readonly _s3Prefix: string | undefined;
  private readonly _isCacheWriteAllowedByConfiguration: boolean;
  private __credentialCacheId: string | undefined;
  private _rushSession: RushSession;

  public get isCacheWriteAllowed(): boolean {
    return EnvironmentConfiguration.buildCacheWriteAllowed ?? this._isCacheWriteAllowedByConfiguration;
  }

  private __s3Client: AmazonS3Client | undefined;

  public constructor(
    options: IAmazonS3BuildCacheProviderOptionsSimple | IAmazonS3BuildCacheProviderOptionsAdvanced,
    rushSession: RushSession
  ) {
    this._rushSession = rushSession;
    this._options = options;
    this._s3Prefix = options.s3Prefix;
    this._isCacheWriteAllowedByConfiguration = options.isCacheWriteAllowed;
  }

  private get _s3Endpoint(): string {
    const options: IAmazonS3BuildCacheProviderOptionsSimple | IAmazonS3BuildCacheProviderOptionsAdvanced =
      this._options;
    if ('s3Bucket' in options) {
      // options: IAmazonS3BuildCacheProviderOptionsSimple
      const bucket: string = options.s3Bucket;
      if (options.s3Region === DEFAULT_S3_REGION) {
        return `https://${bucket}.s3.amazonaws.com`;
      } else {
        return `https://${bucket}.s3-${options.s3Region}.amazonaws.com`;
      }
    }
    // options: IAmazonS3BuildCacheProviderOptionsAdvanced
    return options.s3Endpoint;
  }

  private get _credentialCacheId(): string {
    if (!this.__credentialCacheId) {
      const cacheIdParts: string[] = ['aws-s3', this._options.s3Region, this._s3Endpoint];

      if (this._isCacheWriteAllowedByConfiguration) {
        cacheIdParts.push('cacheWriteAllowed');
      }

      this.__credentialCacheId = cacheIdParts.join('|');
    }

    return this.__credentialCacheId;
  }

  private async _getS3ClientAsync(terminal: ITerminal): Promise<AmazonS3Client> {
    if (!this.__s3Client) {
      let credentials: IAmazonS3Credentials | undefined = fromRushEnv() ?? fromAmazonEnv();

      if (!credentials) {
        terminal.writeDebugLine('No credentials found in env. Trying cloud credentials.');

        let cacheEntry: ICredentialCacheEntry | undefined;
        await CredentialCache.usingAsync(
          {
            supportEditing: false
          },
          (credentialsCache: CredentialCache) => {
            cacheEntry = credentialsCache.tryGetCacheEntry(this._credentialCacheId);
          }
        );

        if (cacheEntry) {
          const expirationTime: number | undefined = cacheEntry.expires?.getTime();
          if (expirationTime && expirationTime < Date.now()) {
            throw new Error(
              'Cached Amazon S3 credentials have expired. ' +
                `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}".`
            );
          } else {
            credentials = fromRushEnv(cacheEntry?.credential);
          }
        } else if (this._isCacheWriteAllowedByConfiguration) {
          throw new Error(
            "An Amazon S3 credential hasn't been provided, or has expired. " +
              `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}", ` +
              `or provide an <AccessKeyId>:<SecretAccessKey> pair in the ` +
              `${EnvironmentVariableNames.RUSH_BUILD_CACHE_CREDENTIAL} environment variable`
          );
        }
      }

      this.__s3Client = new AmazonS3Client(
        credentials,
        {
          ...this._options,
          // advanced options
          s3Endpoint: this._s3Endpoint
        },
        new WebClient(),
        terminal
      );
    }

    return this.__s3Client;
  }

  public async tryGetCacheEntryBufferByIdAsync(
    terminal: ITerminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    try {
      const client: AmazonS3Client = await this._getS3ClientAsync(terminal);
      return await client.getObjectAsync(this._s3Prefix ? `${this._s3Prefix}/${cacheId}` : cacheId);
    } catch (e) {
      terminal.writeWarningLine(`Error getting cache entry from S3: ${e}`);
      return undefined;
    }
  }

  public async trySetCacheEntryBufferAsync(
    terminal: ITerminal,
    cacheId: string,
    objectBuffer: Buffer
  ): Promise<boolean> {
    if (!this.isCacheWriteAllowed) {
      terminal.writeErrorLine('Writing to S3 cache is not allowed in the current configuration.');
      return false;
    }

    terminal.writeDebugLine('Uploading object with cacheId: ', cacheId);

    try {
      const client: AmazonS3Client = await this._getS3ClientAsync(terminal);
      await client.uploadObjectAsync(this._s3Prefix ? `${this._s3Prefix}/${cacheId}` : cacheId, objectBuffer);
      return true;
    } catch (e) {
      terminal.writeWarningLine(`Error uploading cache entry to S3: ${e}`);
      return false;
    }
  }

  public async updateCachedCredentialAsync(terminal: ITerminal, credential: string): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        credentialsCache.setCacheEntry(this._credentialCacheId, { credential });
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  public async updateCachedCredentialInteractiveAsync(terminal: ITerminal): Promise<void> {
    throw new Error(
      'The interactive cloud credentials flow is not supported for Amazon S3.\n' +
        'Provide your credentials to rush using the --credential flag instead. Credentials must be ' +
        'in the form of <ACCESS KEY ID>:<SECRET ACCESS KEY> or ' +
        '<ACCESS KEY ID>:<SECRET ACCESS KEY>:<SESSION TOKEN>.'
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
}
