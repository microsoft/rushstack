// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';
import * as crypto from 'node:crypto';
import {
  type IGetFetchOptions,
  type IFetchOptionsWithBody,
  type IWebClientResponse,
  type WebClient,
  AUTHORIZATION_HEADER_NAME
} from '@rushstack/rush-sdk/lib/utilities/WebClient';

import type { IAmazonS3BuildCacheProviderOptionsAdvanced } from './AmazonS3BuildCacheProvider';
import { type IAmazonS3Credentials, fromRushEnv } from './AmazonS3Credentials';

const CONTENT_HASH_HEADER_NAME: 'x-amz-content-sha256' = 'x-amz-content-sha256';
const DATE_HEADER_NAME: 'x-amz-date' = 'x-amz-date';
const HOST_HEADER_NAME: 'host' = 'host';
const SECURITY_TOKEN_HEADER_NAME: 'x-amz-security-token' = 'x-amz-security-token';

interface IIsoDateString {
  date: string;
  dateTime: string;
}

type RetryableRequestResponse<T> =
  | {
      hasNetworkError: true;
      error: Error;
    }
  | {
      hasNetworkError: false;
      response: T;
    };

const protocolRegex: RegExp = /^https?:\/\//;
const portRegex: RegExp = /:(\d{1,5})$/;

// Similar to https://docs.microsoft.com/en-us/javascript/api/@azure/storage-blob/storageretrypolicytype?view=azure-node-latest
enum StorageRetryPolicyType {
  EXPONENTIAL = 0,
  FIXED = 1
}

// Similar to https://docs.microsoft.com/en-us/javascript/api/@azure/storage-blob/storageretryoptions?view=azure-node-latest
interface IStorageRetryOptions {
  maxRetryDelayInMs: number;
  maxTries: number;
  retryDelayInMs: number;
  retryPolicyType: StorageRetryPolicyType;
}

const storageRetryOptions: IStorageRetryOptions = {
  maxRetryDelayInMs: 120 * 1000,
  maxTries: 4,
  retryDelayInMs: 4 * 1000,
  retryPolicyType: StorageRetryPolicyType.EXPONENTIAL
};

/**
 * A helper for reading and updating objects on Amazon S3
 *
 * @public
 */
export class AmazonS3Client {
  private readonly _credentials: IAmazonS3Credentials | undefined;
  private readonly _s3Endpoint: string;
  private readonly _s3Region: string;

  private readonly _webClient: WebClient;

  private readonly _terminal: ITerminal;

  public constructor(
    credentials: IAmazonS3Credentials | undefined,
    options: IAmazonS3BuildCacheProviderOptionsAdvanced,
    webClient: WebClient,
    terminal: ITerminal
  ) {
    this._credentials = credentials;
    this._terminal = terminal;

    this._validateEndpoint(options.s3Endpoint);

    this._s3Endpoint = options.s3Endpoint;
    this._s3Region = options.s3Region;

    this._webClient = webClient;
  }

  // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html#create-signature-presign-entire-payload
  // We want to keep all slashes non encoded
  public static UriEncode(input: string): string {
    let output: string = '';
    for (let i: number = 0; i < input.length; i += 1) {
      const ch: string = input[i];
      if (ch.match(/[A-Za-z0-9~._-]|\//)) {
        output += ch;
      } else {
        if (ch === ' ') {
          output += '%20';
        } else {
          output += `%${ch.charCodeAt(0).toString(16).toUpperCase()}`;
        }
      }
    }
    return output;
  }

  public static tryDeserializeCredentials(
    credentialString: string | undefined
  ): IAmazonS3Credentials | undefined {
    return fromRushEnv(credentialString);
  }

  public async getObjectAsync(objectName: string): Promise<Buffer | undefined> {
    this._writeDebugLine('Reading object from S3');
    return await this._sendCacheRequestWithRetriesAsync(async () => {
      const response: IWebClientResponse = await this._makeRequestAsync('GET', objectName);
      if (response.ok) {
        return {
          hasNetworkError: false,
          response: await response.getBufferAsync()
        };
      } else if (response.status === 404) {
        return {
          hasNetworkError: false,
          response: undefined
        };
      } else if (
        (response.status === 400 || response.status === 401 || response.status === 403) &&
        !this._credentials
      ) {
        // unauthorized due to not providing credentials,
        // silence error for better DX when e.g. running locally without credentials
        this._writeWarningLine(
          `No credentials found and received a ${response.status}`,
          ' response code from the cloud storage.',
          ' Maybe run rush update-cloud-credentials',
          ' or set the RUSH_BUILD_CACHE_CREDENTIAL env'
        );
        return {
          hasNetworkError: false,
          response: undefined
        };
      } else if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw await this._getS3ErrorAsync(response);
      } else {
        const error: Error = await this._getS3ErrorAsync(response);
        return {
          hasNetworkError: true,
          error
        };
      }
    });
  }

  public async uploadObjectAsync(objectName: string, objectBuffer: Buffer): Promise<void> {
    if (!this._credentials) {
      throw new Error('Credentials are required to upload objects to S3.');
    }

    await this._sendCacheRequestWithRetriesAsync(async () => {
      const response: IWebClientResponse = await this._makeRequestAsync('PUT', objectName, objectBuffer);
      if (!response.ok) {
        return {
          hasNetworkError: true,
          error: await this._getS3ErrorAsync(response)
        };
      }
      return {
        hasNetworkError: false,
        response: undefined
      };
    });
  }

  private _writeDebugLine(...messageParts: string[]): void {
    // if the terminal has been closed then don't bother sending a debug message
    try {
      this._terminal.writeDebugLine(...messageParts);
    } catch (err) {
      // ignore error
    }
  }

  private _writeWarningLine(...messageParts: string[]): void {
    // if the terminal has been closed then don't bother sending a warning message
    try {
      this._terminal.writeWarningLine(...messageParts);
    } catch (err) {
      // ignore error
    }
  }

  private async _makeRequestAsync(
    verb: 'GET' | 'PUT',
    objectName: string,
    body?: Buffer
  ): Promise<IWebClientResponse> {
    const isoDateString: IIsoDateString = this._getIsoDateString();
    const bodyHash: string = this._getSha256(body);
    const headers: Record<string, string> = {};
    headers[DATE_HEADER_NAME] = isoDateString.dateTime;
    headers[CONTENT_HASH_HEADER_NAME] = bodyHash;

    // the host can be e.g. https://s3.aws.com or http://localhost:9000
    const host: string = this._s3Endpoint.replace(protocolRegex, '');
    const canonicalUri: string = AmazonS3Client.UriEncode(`/${objectName}`);
    this._writeDebugLine(Colorize.bold('Canonical URI: '), canonicalUri);

    if (this._credentials) {
      // Compute the authorization header. See https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
      const canonicalHeaders: string[] = [
        `${HOST_HEADER_NAME}:${host}`,
        `${CONTENT_HASH_HEADER_NAME}:${bodyHash}`,
        `${DATE_HEADER_NAME}:${isoDateString.dateTime}`
      ];

      // Handle signing with temporary credentials (via sts:assume-role)
      if (this._credentials.sessionToken) {
        canonicalHeaders.push(`${SECURITY_TOKEN_HEADER_NAME}:${this._credentials.sessionToken}`);
      }

      // the canonical headers must be sorted by header name
      canonicalHeaders.sort((aHeader, bHeader) => {
        const aHeaderName: string = aHeader.split(':')[0];
        const bHeaderName: string = bHeader.split(':')[0];
        if (aHeaderName < bHeaderName) {
          return -1;
        }
        if (aHeaderName > bHeaderName) {
          return 1;
        }
        return 0;
      });

      // the singed header names are derived from the canonicalHeaders
      const signedHeaderNamesString: string = canonicalHeaders
        .map((header) => {
          const headerName: string = header.split(':')[0];
          return headerName;
        })
        .join(';');

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
        canonicalUri,
        '', // we don't use query strings for these requests
        ...canonicalHeaders,
        '',
        signedHeaderNamesString,
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

      const dateKey: Buffer = this._getSha256Hmac(
        `AWS4${this._credentials.secretAccessKey}`,
        isoDateString.date
      );
      const dateRegionKey: Buffer = this._getSha256Hmac(dateKey, this._s3Region);
      const dateRegionServiceKey: Buffer = this._getSha256Hmac(dateRegionKey, 's3');
      const signingKey: Buffer = this._getSha256Hmac(dateRegionServiceKey, 'aws4_request');
      const signature: string = this._getSha256Hmac(signingKey, stringToSign, 'hex');

      const authorizationHeader: string = `AWS4-HMAC-SHA256 Credential=${this._credentials.accessKeyId}/${scope},SignedHeaders=${signedHeaderNamesString},Signature=${signature}`;

      headers[AUTHORIZATION_HEADER_NAME] = authorizationHeader;
      if (this._credentials.sessionToken) {
        // Handle signing with temporary credentials (via sts:assume-role)
        headers['X-Amz-Security-Token'] = this._credentials.sessionToken;
      }
    }

    const webFetchOptions: IGetFetchOptions | IFetchOptionsWithBody = {
      verb,
      headers
    };
    if (verb === 'PUT') {
      (webFetchOptions as IFetchOptionsWithBody).body = body;
    }

    const url: string = `${this._s3Endpoint}${canonicalUri}`;

    this._writeDebugLine(Colorize.bold(Colorize.underline('Sending request to S3')));
    this._writeDebugLine(Colorize.bold('HOST: '), url);
    this._writeDebugLine(Colorize.bold('Headers: '));
    for (const [name, value] of Object.entries(headers)) {
      this._writeDebugLine(Colorize.cyan(`\t${name}: ${value}`));
    }

    const response: IWebClientResponse = await this._webClient.fetchAsync(url, webFetchOptions);

    return response;
  }

  public _getSha256Hmac(key: string | Buffer, data: string): Buffer;
  public _getSha256Hmac(key: string | Buffer, data: string, encoding: 'hex'): string;
  public _getSha256Hmac(key: string | Buffer, data: string, encoding?: 'hex'): Buffer | string {
    const hash: crypto.Hmac = crypto.createHmac('sha256', key);
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

  private async _safeReadResponseTextAsync(response: IWebClientResponse): Promise<string | undefined> {
    try {
      return await response.getTextAsync();
    } catch (err) {
      // ignore the error
    }
    return undefined;
  }

  private async _getS3ErrorAsync(response: IWebClientResponse): Promise<Error> {
    const text: string | undefined = await this._safeReadResponseTextAsync(response);
    return new Error(
      `Amazon S3 responded with status code ${response.status} (${response.statusText})${
        text ? `\n${text}` : ''
      }`
    );
  }

  /**
   * Validates a S3 endpoint which is http(s):// + hostname + port. Hostname validated according to RFC 1123
   * {@link https://docs.aws.amazon.com/general/latest/gr/s3.html}
   */
  private _validateEndpoint(s3Endpoint: string): void {
    let host: string = s3Endpoint;

    if (!s3Endpoint) {
      throw new Error('A S3 endpoint must be provided');
    }

    if (!s3Endpoint.match(protocolRegex)) {
      throw new Error('The S3 endpoint must start with https:// or http://');
    }

    host = host.replace(protocolRegex, '');

    if (host.match(/\//)) {
      throw new Error('The path should be omitted from the endpoint. Use s3Prefix to specify a path');
    }

    const portMatch: RegExpMatchArray | null = s3Endpoint.match(portRegex);
    if (portMatch) {
      const port: number = Number(portMatch[1]);
      if (Number.isNaN(port) || port > 65535) {
        throw new Error(`Port: ${port} is an invalid port number`);
      }
      host = host.replace(portRegex, '');
    }

    if (host.endsWith('.')) {
      host = host.slice(0, host.length - 1);
    }

    if (host.length > 253) {
      throw new Error(
        'The S3 endpoint is too long. RFC 1123 specifies a hostname should be no longer than 253 characters.'
      );
    }

    const subDomains: string[] = host.split('.');

    const subDomainRegex: RegExp = /^[a-zA-Z0-9-]+$/;
    const isValid: boolean = subDomains.every((subDomain) => {
      return (
        subDomainRegex.test(subDomain) &&
        subDomain.length < 64 &&
        !subDomain.startsWith('-') &&
        !subDomain.endsWith('-')
      );
    });

    if (!isValid) {
      throw new Error(
        'Invalid S3 endpoint. Some part of the hostname contains invalid characters or is too long'
      );
    }
  }

  private async _sendCacheRequestWithRetriesAsync<T>(
    sendRequest: () => Promise<RetryableRequestResponse<T>>
  ): Promise<T> {
    const response: RetryableRequestResponse<T> = await sendRequest();

    const log: (...messageParts: string[]) => void = this._writeDebugLine.bind(this);

    if (response.hasNetworkError) {
      if (storageRetryOptions && storageRetryOptions.maxTries > 1) {
        log('Network request failed. Will retry request as specified in storageRetryOptions');
        async function retry(retryAttempt: number): Promise<T> {
          const { retryDelayInMs, retryPolicyType, maxTries, maxRetryDelayInMs } = storageRetryOptions;
          let delay: number = retryDelayInMs;
          if (retryPolicyType === StorageRetryPolicyType.EXPONENTIAL) {
            delay = retryDelayInMs * Math.pow(2, retryAttempt - 1);
          }
          delay = Math.min(maxRetryDelayInMs, delay);

          log(`Will retry request in ${delay}s...`);
          await Async.sleepAsync(delay);
          const retryResponse: RetryableRequestResponse<T> = await sendRequest();

          if (retryResponse.hasNetworkError) {
            if (retryAttempt < maxTries - 1) {
              log('The retried request failed, will try again');
              return retry(retryAttempt + 1);
            } else {
              log('The retried request failed and has reached the maxTries limit');
              throw retryResponse.error;
            }
          }

          return retryResponse.response;
        }
        return retry(1);
      } else {
        log('Network request failed and storageRetryOptions is not specified');
        throw response.error;
      }
    }

    return response.response;
  }
}
