// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'crypto';
import * as fetch from 'node-fetch';

import { IAmazonS3BuildCacheProviderOptions } from './AmazonS3BuildCacheProvider';
import { IPutFetchOptions, IGetFetchOptions, WebClient } from '../../../utilities/WebClient';

const CONTENT_HASH_HEADER_NAME: 'x-amz-content-sha256' = 'x-amz-content-sha256';
const DATE_HEADER_NAME: 'x-amz-date' = 'x-amz-date';
const HOST_HEADER_NAME: 'host' = 'host';

export interface IAmazonS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

interface IIsoDateString {
  date: string;
  dateTime: string;
}

export class AmazonS3Client {
  private readonly _accessKeyId: string;
  private readonly _secretAccessKey: string;
  private readonly _s3Bucket: string;
  private readonly _s3Region: string;

  private readonly _webClient: WebClient;

  public constructor(
    credentials: IAmazonS3Credentials | undefined,
    options: IAmazonS3BuildCacheProviderOptions
  ) {
    if (!credentials) {
      throw new Error('Amazon S3 credential is required.');
    }

    this._accessKeyId = credentials.accessKeyId || '';
    this._secretAccessKey = credentials.secretAccessKey || '';

    this._validateBucketName(options.s3Bucket);

    this._s3Bucket = options.s3Bucket;
    this._s3Region = options.s3Region;

    this._webClient = new WebClient();
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
    const response: fetch.Response = await this._makeRequestAsync('GET', objectName);
    if (response.ok) {
      return await response.buffer();
    } else if (response.status === 404) {
      return undefined;
    } else {
      this._throwS3Error(response);
    }
  }

  public async uploadObjectAsync(objectName: string, objectBuffer: Buffer): Promise<void> {
    const response: fetch.Response = await this._makeRequestAsync('PUT', objectName, objectBuffer);
    if (!response.ok) {
      this._throwS3Error(response);
    }
  }

  private async _makeRequestAsync(
    verb: 'GET' | 'PUT',
    objectName: string,
    body?: Buffer
  ): Promise<fetch.Response> {
    const isoDateString: IIsoDateString = this._getIsoDateString();
    const bodyHash: string = this._getSha256(body);

    // Compute the authorization header. See https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
    const host: string = `${this._s3Bucket}.s3.amazonaws.com`;
    const signedHeaderNames: string = `${HOST_HEADER_NAME};${CONTENT_HASH_HEADER_NAME};${DATE_HEADER_NAME}`;
    // The canonical request looks like this:
    //  GET
    // /test.txt
    //
    // host:examplebucket.s3.amazonaws.com
    // range:bytes=0-9
    // x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    // x-amz-date:20130524T000000Z
    //
    // host;range;x-amz-content-sha256;x-amz-date
    // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const canonicalRequest: string = [
      verb,
      `/${objectName}`,
      '', // we don't use query strings for these requests
      `${HOST_HEADER_NAME}:${host}`,
      `${CONTENT_HASH_HEADER_NAME}:${bodyHash}`,
      `${DATE_HEADER_NAME}:${isoDateString.dateTime}`,
      '',
      signedHeaderNames,
      bodyHash
    ].join('\n');
    const canonicalRequestHash: string = this._getSha256(canonicalRequest);

    const scope: string = `${isoDateString.date}/${this._s3Region}/s3/aws4_request`;
    // The string to sign looks like this:
    // AWS4-HMAC-SHA256
    // 20130524T423589Z
    // 20130524/us-east-1/s3/aws4_request
    // 7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972
    const stringToSign: string = [
      'AWS4-HMAC-SHA256',
      isoDateString.dateTime,
      scope,
      canonicalRequestHash
    ].join('\n');

    const dateKey: Buffer = this._getSha256Hmac(`AWS4${this._secretAccessKey}`, isoDateString.date);
    const dateRegionKey: Buffer = this._getSha256Hmac(dateKey, this._s3Region);
    const dateRegionServiceKey: Buffer = this._getSha256Hmac(dateRegionKey, 's3');
    const signingKey: Buffer = this._getSha256Hmac(dateRegionServiceKey, 'aws4_request');
    const signature: string = this._getSha256Hmac(signingKey, stringToSign, 'hex');

    const authorizationHeader: string = `AWS4-HMAC-SHA256 Credential=${this._accessKeyId}/${scope},SignedHeaders=${signedHeaderNames},Signature=${signature}`;

    const headers: fetch.Headers = new fetch.Headers();
    headers.set('Authorization', authorizationHeader);
    headers.set(DATE_HEADER_NAME, isoDateString.dateTime);
    headers.set(CONTENT_HASH_HEADER_NAME, bodyHash);

    const webFetchOptions: IGetFetchOptions | IPutFetchOptions = {
      verb,
      headers
    };
    if (verb === 'PUT') {
      (webFetchOptions as IPutFetchOptions).body = body;
    }

    const response: fetch.Response = await this._webClient.fetchAsync(
      `https://${host}/${objectName}`,
      webFetchOptions
    );

    return response;
  }

  public _getSha256Hmac(key: string | Buffer, data: string): Buffer;
  public _getSha256Hmac(key: string | Buffer, data: string, encoding: 'hex'): string;
  public _getSha256Hmac(key: string | Buffer, data: string, encoding?: 'hex'): Buffer | string {
    const hash: crypto.Hash = crypto.createHmac('sha256', key);
    hash.update(data);
    if (encoding) {
      return hash.digest(encoding);
    } else {
      return hash.digest();
    }
  }

  private _getSha256(data?: string | Buffer): string {
    if (data) {
      const hash: crypto.Hash = crypto.createHash('sha256');
      hash.update(data);
      return hash.digest('hex');
    } else {
      // This is the null SHA256 hash
      return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    }
  }

  private _getIsoDateString(date: Date = new Date()): IIsoDateString {
    let dateString: string = date.toISOString();
    dateString = dateString.replace(/[-:]/g, ''); // Remove separator characters
    dateString = dateString.substring(0, 15); // Drop milliseconds

    // dateTime is an ISO8601 date. It looks like "20130524T423589"
    // date is an ISO date. It looks like "20130524"
    return {
      dateTime: `${dateString}Z`,
      date: dateString.substring(0, 8)
    };
  }

  private _throwS3Error(response: fetch.Response): never {
    throw new Error(`Amazon S3 responded with status code ${response.status} (${response.statusText})`);
  }

  /**
   * Validates a S3 bucket name.
   * {@link https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-s3-bucket-naming-requirements.html}
   */
  private _validateBucketName(s3BucketName: string): void {
    if (!s3BucketName) {
      throw new Error('A S3 bucket name must be provided');
    }

    if (!s3BucketName.match(/^[a-z\d-.]{3,63}$/)) {
      throw new Error(
        `The bucket name "${s3BucketName}" is invalid. A S3 bucket name must only contain lowercase ` +
          'alphanumerical characters, dashes, and periods and must be between 3 and 63 characters long.'
      );
    }

    if (!s3BucketName.match(/^[a-z\d]/)) {
      throw new Error(
        `The bucket name "${s3BucketName}" is invalid. A S3 bucket name must start with a lowercase ` +
          'alphanumerical character.'
      );
    }

    if (s3BucketName.match(/-$/)) {
      throw new Error(
        `The bucket name "${s3BucketName}" is invalid. A S3 bucket name must not end in a dash.`
      );
    }

    if (s3BucketName.match(/(\.\.)|(\.-)|(-\.)/)) {
      throw new Error(
        `The bucket name "${s3BucketName}" is invalid. A S3 bucket name must not have consecutive periods or ` +
          'dashes adjacent to periods.'
      );
    }

    if (s3BucketName.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      throw new Error(
        `The bucket name "${s3BucketName}" is invalid. A S3 bucket name must not be formatted as an IP address.`
      );
    }
  }
}
