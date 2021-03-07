// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Readable } from 'stream';
import { Terminal } from '@rushstack/node-core-library';
import { S3Client, GetObjectCommand, PutObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { defaultProvider as awsCredentialsProvider } from '@aws-sdk/credential-provider-node';

import { EnvironmentConfiguration, EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { CloudBuildCacheProviderBase } from './CloudBuildCacheProviderBase';
import { CredentialCache, ICredentialCacheEntry } from '../CredentialCache';
import { RushConstants } from '../RushConstants';
import { Utilities } from '../../utilities/Utilities';

interface IAmazonS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface IAmazonS3BuildCacheProviderOptions {
  s3Bucket: string;
  s3Region: string;
  s3Prefix?: string;
  isCacheWriteAllowed: boolean;
}

export class AmazonS3BuildCacheProvider extends CloudBuildCacheProviderBase {
  private readonly _s3Bucket: string;
  private readonly _s3Region: string;
  private readonly _s3Prefix: string | undefined;
  private readonly _environmentWriteCredential: string | undefined;
  private readonly _isCacheWriteAllowedByConfiguration: boolean;

  public get isCacheWriteAllowed(): boolean {
    return this._isCacheWriteAllowedByConfiguration || !!this._environmentWriteCredential;
  }

  private __s3Client: S3Client | undefined;

  public constructor(options: IAmazonS3BuildCacheProviderOptions) {
    super();
    this._s3Bucket = options.s3Bucket;
    this._s3Region = options.s3Region;
    this._s3Prefix = options.s3Prefix;
    this._environmentWriteCredential = EnvironmentConfiguration.buildCacheWriteCredential;
    this._isCacheWriteAllowedByConfiguration = options.isCacheWriteAllowed;
  }

  private _deserializeCredentials(credentialString: string | undefined): IAmazonS3Credentials | undefined {
    if (!credentialString) {
      return undefined;
    }

    const splitIndex: number = credentialString.indexOf(':');
    if (splitIndex === -1) {
      throw new Error('Amazon S3 credential is in an unexpected format.');
    }

    return {
      accessKeyId: credentialString.substring(0, splitIndex),
      secretAccessKey: credentialString.substring(splitIndex + 1)
    };
  }

  private get _credentialCacheId(): string {
    const cacheIdParts: string[] = ['aws-s3', this._s3Region, this._s3Bucket];

    if (this._isCacheWriteAllowedByConfiguration) {
      cacheIdParts.push('cacheWriteAllowed');
    }
    return cacheIdParts.join('|');
  }

  private async _getS3ClientAsync(): Promise<S3Client> {
    if (!this.__s3Client) {
      let credentials: IAmazonS3Credentials | undefined = this._deserializeCredentials(
        this._environmentWriteCredential
      );
      if (!credentials) {
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
            credentials = this._deserializeCredentials(cacheEntry?.credential);
          }
        } else {
          try {
            credentials = await awsCredentialsProvider()();
          } catch {
            throw new Error(
              "An Amazon S3 credential hasn't been provided, or has expired. " +
                `Update the credentials by running "rush ${RushConstants.updateCloudCredentialsCommandName}", ` +
                `or provide an <AccessKeyId>:<SecretAccessKey> pair in the ` +
                `${EnvironmentVariableNames.RUSH_BUILD_CACHE_WRITE_CREDENTIAL} environment variable`
            );
          }
        }
      }

      this.__s3Client = new S3Client({ region: this._s3Region, credentials });
    }

    return this.__s3Client;
  }

  public async tryGetCacheEntryBufferByIdAsync(
    terminal: Terminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    try {
      const client: S3Client = await this._getS3ClientAsync();
      const fetchResult: GetObjectCommandOutput | undefined = await client.send(
        new GetObjectCommand({
          Bucket: this._s3Bucket,
          Key: this._s3Prefix ? `${this._s3Prefix}/${cacheId}` : cacheId
        })
      );
      if (fetchResult === undefined) {
        return undefined;
      }

      return await Utilities.readStreamToBufferAsync(fetchResult.Body as Readable);
    } catch (e) {
      if (e.name === 'NoSuchKey') {
        // No object was uploaded with that name/key
        return undefined;
      }

      terminal.writeWarningLine(`Error getting cache entry from S3: ${e}`);
      return undefined;
    }
  }

  public async trySetCacheEntryBufferAsync(
    terminal: Terminal,
    cacheId: string,
    entryStream: Buffer
  ): Promise<boolean> {
    if (!this.isCacheWriteAllowed) {
      terminal.writeErrorLine('Writing to S3 cache is not allowed in the current configuration.');
      return false;
    }

    try {
      const client: S3Client = await this._getS3ClientAsync();
      await client.send(
        new PutObjectCommand({
          Bucket: this._s3Bucket,
          Key: this._s3Prefix ? `${this._s3Prefix}/${cacheId}` : cacheId,
          Body: entryStream
        })
      );
      return true;
    } catch (e) {
      terminal.writeWarningLine(`Error uploading cache entry to S3: ${e}`);
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
    throw new Error(
      'The interactive cloud credentials flow is not supported for Amazon S3.\n' +
        'Install and authenticate with aws-cli, or provide your credentials to rush using the --credential flag instead.'
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
}
