// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '@rushstack/node-core-library';

import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { CloudBuildCacheProviderBase } from './CloudBuildCacheProviderBase';
import { S3Client, GetObjectCommand, PutObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

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

  private _s3Client: S3Client | undefined;

  public constructor(options: IAmazonS3BuildCacheProviderOptions) {
    super();
    //this._storageAccountName = options.storageAccountName;
    this._s3Bucket = options.s3Bucket;
    this._s3Region = options.s3Region;
    this._s3Prefix = options.s3Prefix;
    this._environmentWriteCredential = EnvironmentConfiguration.buildCacheWriteCredential;
    this._isCacheWriteAllowedByConfiguration = options.isCacheWriteAllowed;

    // TODO: Can we validate the region?
    this._s3Client = new S3Client({ region: this._s3Region });
  }

  public async tryGetCacheEntryBufferByIdAsync(
    terminal: Terminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    try {
      const fetchResult: GetObjectCommandOutput | undefined = await this._s3Client?.send(
        new GetObjectCommand({
          Bucket: this._s3Bucket,
          Key: this._s3Prefix ? `${this._s3Prefix}/${cacheId}` : cacheId
        })
      );
      if (fetchResult === undefined) {
        return undefined;
      }
      return await this._streamToBuffer(fetchResult.Body as Readable);
    } catch (e) {
      if (e.name === 'NoSuchKey') {
        // TODO Non-existent file is normal, can it be handled differently?
        return undefined;
      }
      terminal.writeWarningLine(`Error getting cache entry from S3: ${e}`);
      return undefined;
    }
  }

  private _streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parts: Array<Uint8Array> = [];
      stream.on('data', (part) => parts.push(part));
      stream.on('end', () => resolve(Buffer.concat(parts)));
      stream.on('error', reject);
    });
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
      await this._s3Client?.send(
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

  public updateCachedCredentialAsync(terminal: Terminal, credential: string): Promise<void> {
    return Promise.reject('Unsupported');
  }

  public updateCachedCredentialInteractiveAsync(terminal: Terminal): Promise<void> {
    return Promise.reject('Unsupported');
  }

  public deleteCachedCredentialsAsync(terminal: Terminal): Promise<void> {
    return Promise.reject('Unsupported');
  }
}
