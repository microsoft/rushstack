// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Readable } from 'stream';
import { S3Client, GetObjectCommand, PutObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3';

import { Utilities } from '../../../utilities/Utilities';
import { IAmazonS3BuildCacheProviderOptions } from './AmazonS3BuildCacheProvider';

export interface IAmazonS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export class AmazonS3Client {
  private readonly _accessKeyId: string;
  private readonly _secretAccessKey: string;
  private readonly _s3Bucket: string;
  private readonly _s3Region: string;

  private readonly _innerS3Client: S3Client;

  public constructor(
    credentials: IAmazonS3Credentials | undefined,
    options: IAmazonS3BuildCacheProviderOptions
  ) {
    if (!credentials) {
      throw new Error('Amazon S3 credential is required.');
    }

    this._accessKeyId = credentials.accessKeyId;
    this._secretAccessKey = credentials.secretAccessKey;

    this._s3Bucket = options.s3Bucket;
    this._s3Region = options.s3Region;

    this._innerS3Client = new S3Client({
      region: this._s3Region,
      credentials: { accessKeyId: this._accessKeyId, secretAccessKey: this._secretAccessKey }
    });
  }

  public static tryDeserializeCredentials(
    credentialString: string | undefined
  ): IAmazonS3Credentials | undefined {
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

  public async getObjectAsync(objectName: string): Promise<Buffer | undefined> {
    try {
      const fetchResult: GetObjectCommandOutput | undefined = await this._innerS3Client.send(
        new GetObjectCommand({
          Bucket: this._s3Bucket,
          Key: objectName
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
      } else {
        throw e;
      }
    }
  }

  public async uploadObjectAsync(objectName: string, objectBuffer: Buffer): Promise<void> {
    await this._innerS3Client.send(
      new PutObjectCommand({
        Bucket: this._s3Bucket,
        Key: objectName,
        Body: objectBuffer
      })
    );
  }
}
