// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as process from 'node:process';
import type * as http from 'node:http';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { Import, LegacyAdapters } from '@rushstack/node-core-library';

const createHttpsProxyAgent: typeof import('https-proxy-agent') = Import.lazy('https-proxy-agent', require);

/**
 * For use with {@link WebClient}.
 */
export interface IWebClientResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  redirected: boolean;
  headers: Record<string, string | string[] | undefined>;
  getTextAsync: () => Promise<string>;
  getJsonAsync: <TJson>() => Promise<TJson>;
  getBufferAsync: () => Promise<Buffer>;
}

/**
 * For use with {@link WebClient}.
 */
export interface IWebFetchOptionsBase {
  timeoutMs?: number;
  headers?: Record<string, string>;
  redirect?: 'follow' | 'error' | 'manual';
  /**
   * If true, the response will not be decoded if a Content-Encoding header is present.
   */
  noDecode?: boolean;
}

/**
 * For use with {@link WebClient}.
 */
export interface IGetFetchOptions extends IWebFetchOptionsBase {
  verb: 'GET' | never;
}

/**
 * For use with {@link WebClient}.
 */
export interface IFetchOptionsWithBody extends IWebFetchOptionsBase {
  verb: 'PUT' | 'POST' | 'PATCH';
  body?: Buffer;
}

/**
 * For use with {@link WebClient}.
 */
export enum WebClientProxy {
  None,
  Detect,
  Fiddler
}
export interface IRequestOptions
  extends RequestOptions,
    Pick<IFetchOptionsWithBody, 'body' | 'redirect' | 'noDecode'> {}

export type FetchFn = (
  url: string,
  options: IRequestOptions,
  isRedirect?: boolean
) => Promise<IWebClientResponse>;

const DEFLATE_ENCODING: 'deflate' = 'deflate';
const GZIP_ENCODING: 'gzip' = 'gzip';
const BROTLI_ENCODING: 'br' = 'br';
export const AUTHORIZATION_HEADER_NAME: 'Authorization' = 'Authorization';
const ACCEPT_HEADER_NAME: 'accept' = 'accept';
const USER_AGENT_HEADER_NAME: 'user-agent' = 'user-agent';
const CONTENT_ENCODING_HEADER_NAME: 'content-encoding' = 'content-encoding';

const makeRequestAsync: FetchFn = async (
  url: string,
  options: IRequestOptions,
  redirected: boolean = false
) => {
  const { body, redirect, noDecode } = options;

  return await new Promise(
    (resolve: (result: IWebClientResponse) => void, reject: (error: Error) => void) => {
      const parsedUrl: URL = typeof url === 'string' ? new URL(url) : url;
      const requestFunction: typeof httpRequest | typeof httpsRequest =
        parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

      requestFunction(url, options, (response: IncomingMessage) => {
        const responseBuffers: (Buffer | Uint8Array)[] = [];
        response.on('data', (chunk: string | Buffer | Uint8Array) => {
          responseBuffers.push(Buffer.from(chunk));
        });
        response.on('end', () => {
          // Handle retries by calling the method recursively with the redirect URL
          const statusCode: number | undefined = response.statusCode;
          if (statusCode === 301 || statusCode === 302) {
            switch (redirect) {
              case 'follow': {
                const redirectUrl: string | string[] | undefined = response.headers.location;
                if (redirectUrl) {
                  makeRequestAsync(redirectUrl, options, true).then(resolve).catch(reject);
                } else {
                  reject(
                    new Error(`Received status code ${response.statusCode} with no location header: ${url}`)
                  );
                }

                break;
              }
              case 'error':
                reject(new Error(`Received status code ${response.statusCode}: ${url}`));
                return;
            }
          }

          const responseData: Buffer = Buffer.concat(responseBuffers);
          const status: number = response.statusCode || 0;
          const statusText: string | undefined = response.statusMessage;
          const headers: Record<string, string | string[] | undefined> = response.headers;

          let bodyString: string | undefined;
          let bodyJson: unknown | undefined;
          let decodedBuffer: Buffer | undefined;
          const result: IWebClientResponse = {
            ok: status >= 200 && status < 300,
            status,
            statusText,
            redirected,
            headers,
            getTextAsync: async () => {
              if (bodyString === undefined) {
                const buffer: Buffer = await result.getBufferAsync();
                // eslint-disable-next-line require-atomic-updates
                bodyString = buffer.toString();
              }

              return bodyString;
            },
            getJsonAsync: async <TJson>() => {
              if (bodyJson === undefined) {
                const text: string = await result.getTextAsync();
                // eslint-disable-next-line require-atomic-updates
                bodyJson = JSON.parse(text);
              }

              return bodyJson as TJson;
            },
            getBufferAsync: async () => {
              // Determine if the buffer is compressed and decode it if necessary
              if (decodedBuffer === undefined) {
                let encodings: string | string[] | undefined = headers[CONTENT_ENCODING_HEADER_NAME];
                if (!noDecode && encodings !== undefined) {
                  const zlib: typeof import('zlib') = await import('node:zlib');
                  if (!Array.isArray(encodings)) {
                    encodings = encodings.split(',');
                  }

                  let buffer: Buffer = responseData;
                  for (const encoding of encodings) {
                    let decompressFn: (buffer: Buffer, callback: import('zlib').CompressCallback) => void;
                    switch (encoding.trim()) {
                      case DEFLATE_ENCODING: {
                        decompressFn = zlib.inflate.bind(zlib);
                        break;
                      }
                      case GZIP_ENCODING: {
                        decompressFn = zlib.gunzip.bind(zlib);
                        break;
                      }
                      case BROTLI_ENCODING: {
                        decompressFn = zlib.brotliDecompress.bind(zlib);
                        break;
                      }
                      default: {
                        throw new Error(`Unsupported content-encoding: ${encodings}`);
                      }
                    }

                    buffer = await LegacyAdapters.convertCallbackToPromise(decompressFn, buffer);
                  }

                  // eslint-disable-next-line require-atomic-updates
                  decodedBuffer = buffer;
                } else {
                  decodedBuffer = responseData;
                }
              }

              return decodedBuffer;
            }
          };
          resolve(result);
        });
      })
        .on('error', (error: Error) => {
          reject(error);
        })
        .end(body);
    }
  );
};

/**
 * A helper for issuing HTTP requests.
 */
export class WebClient {
  private static _requestFn: FetchFn = makeRequestAsync;

  public readonly standardHeaders: Record<string, string> = {};

  public accept: string | undefined = '*/*';
  public userAgent: string | undefined = `rush node/${process.version} ${os.platform()} ${os.arch()}`;

  public proxy: WebClientProxy = WebClientProxy.Detect;

  public static mockRequestFn(fn: FetchFn): void {
    WebClient._requestFn = fn;
  }

  public static resetMockRequestFn(): void {
    WebClient._requestFn = makeRequestAsync;
  }

  public static mergeHeaders(target: Record<string, string>, source: Record<string, string>): void {
    for (const [name, value] of Object.entries(source)) {
      target[name] = value;
    }
  }

  public addBasicAuthHeader(userName: string, password: string): void {
    this.standardHeaders[AUTHORIZATION_HEADER_NAME] =
      'Basic ' + Buffer.from(userName + ':' + password).toString('base64');
  }

  public async fetchAsync(
    url: string,
    options?: IGetFetchOptions | IFetchOptionsWithBody
  ): Promise<IWebClientResponse> {
    const {
      headers: optionsHeaders,
      timeoutMs = 15 * 1000,
      verb,
      redirect,
      body,
      noDecode
    } = (options as IFetchOptionsWithBody | undefined) ?? {};

    const headers: Record<string, string> = {};

    WebClient.mergeHeaders(headers, this.standardHeaders);

    if (optionsHeaders) {
      WebClient.mergeHeaders(headers, optionsHeaders);
    }

    if (this.userAgent) {
      headers[USER_AGENT_HEADER_NAME] = this.userAgent;
    }

    if (this.accept) {
      headers[ACCEPT_HEADER_NAME] = this.accept;
    }

    let proxyUrl: string = '';

    switch (this.proxy) {
      case WebClientProxy.Detect:
        if (process.env.HTTPS_PROXY) {
          proxyUrl = process.env.HTTPS_PROXY;
        } else if (process.env.HTTP_PROXY) {
          proxyUrl = process.env.HTTP_PROXY;
        }
        break;

      case WebClientProxy.Fiddler:
        // For debugging, disable cert validation
        // eslint-disable-next-line
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
        proxyUrl = 'http://localhost:8888/';
        break;
    }

    let agent: http.Agent | undefined = undefined;
    if (proxyUrl) {
      agent = createHttpsProxyAgent(proxyUrl);
    }

    const requestInit: IRequestOptions = {
      method: verb,
      headers,
      agent,
      timeout: timeoutMs,
      redirect,
      body,
      noDecode
    };

    return await WebClient._requestFn(url, requestInit);
  }
}
