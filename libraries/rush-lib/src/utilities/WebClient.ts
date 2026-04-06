// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as process from 'node:process';
import type { Readable } from 'node:stream';
import {
  request as httpRequest,
  type IncomingMessage,
  type ClientRequest,
  type Agent as HttpAgent
} from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';

import { Import, LegacyAdapters } from '@rushstack/node-core-library';

const createHttpsProxyAgent: typeof import('https-proxy-agent') = Import.lazy('https-proxy-agent', require);

export interface IWebClientResponseBase {
  ok: boolean;
  status: number;
  statusText?: string;
  redirected: boolean;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * A response from {@link WebClient.fetchAsync}.
 */
export interface IWebClientResponse extends IWebClientResponseBase {
  getTextAsync: () => Promise<string>;
  getJsonAsync: <TJson>() => Promise<TJson>;
  getBufferAsync: () => Promise<Buffer>;
}

/**
 * A response from {@link WebClient.fetchStreamAsync} that provides the response body as a
 * readable stream, avoiding buffering the entire response in memory.
 */
export interface IWebClientStreamResponse extends IWebClientResponseBase {
  stream: Readable;
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
  body?: Buffer | Readable;
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

type StreamFetchFn = (
  url: string,
  options: IRequestOptions,
  isRedirect?: boolean
) => Promise<IWebClientStreamResponse>;

/**
 * Shared HTTP request core used by both buffer-based and streaming request functions.
 * Handles URL parsing, protocol selection, redirect following, body sending, and error handling.
 * The `handleResponse` callback is responsible for processing the response and calling
 * `resolve`/`reject` to complete the outer promise.
 */
function _makeRawRequestAsync<TResponse>(
  url: string,
  options: IRequestOptions,
  redirected: boolean,
  handleResponse: (
    response: IncomingMessage,
    redirected: boolean,
    resolve: (result: TResponse | PromiseLike<TResponse>) => void,
    reject: (error: Error) => void
  ) => void,
  requestFnAsync: (url: string, options: IRequestOptions, isRedirect?: boolean) => Promise<TResponse>
): Promise<TResponse> {
  const { body, redirect } = options;

  return new Promise(
    (resolve: (result: TResponse | PromiseLike<TResponse>) => void, reject: (error: Error) => void) => {
      const parsedUrl: URL = typeof url === 'string' ? new URL(url) : url;
      const requestFunction: typeof httpRequest | typeof httpsRequest =
        parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

      const req: ClientRequest = requestFunction(url, options, (response: IncomingMessage) => {
        const {
          statusCode,
          headers: { location: redirectUrl }
        } = response;
        if (statusCode === 301 || statusCode === 302) {
          // Drain the redirect response before following
          response.resume();
          switch (redirect) {
            case 'follow': {
              if (redirectUrl) {
                requestFnAsync(redirectUrl, options, true).then(resolve).catch(reject);
              } else {
                reject(new Error(`Received status code ${statusCode} with no location header: ${url}`));
              }
              return;
            }

            case 'error':
              reject(new Error(`Received status code ${statusCode}: ${url}`));
              return;
          }
        }

        handleResponse(response, redirected, resolve, reject);
      }).on('error', (error: Error) => {
        reject(error);
      });

      const isStream: boolean = !!body && typeof (body as Readable).pipe === 'function';
      if (isStream) {
        (body as Readable).on('error', reject);
        (body as Readable).pipe(req);
      } else {
        req.end(body as Buffer | undefined);
      }
    }
  );
}

const makeRequestAsync: FetchFn = async (
  url: string,
  options: IRequestOptions,
  redirected: boolean = false
) => {
  const { noDecode } = options;

  return _makeRawRequestAsync(
    url,
    options,
    redirected,
    (
      response: IncomingMessage,
      wasRedirected: boolean,
      resolve: (result: IWebClientResponse | PromiseLike<IWebClientResponse>) => void
    ): void => {
      const responseBuffers: (Buffer | Uint8Array)[] = [];
      response.on('data', (chunk: string | Buffer | Uint8Array) => {
        responseBuffers.push(Buffer.from(chunk));
      });
      response.on('end', () => {
        const { statusCode: status = 0, statusMessage: statusText, headers } = response;
        const responseData: Buffer = Buffer.concat(responseBuffers);

        let bodyString: string | undefined;
        let bodyJson: unknown | undefined;
        let decodedBuffer: Buffer | undefined;
        const result: IWebClientResponse = {
          ok: status >= 200 && status < 300,
          status,
          statusText,
          redirected: wasRedirected,
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
    },
    makeRequestAsync
  );
};

const makeStreamRequestAsync: StreamFetchFn = async (
  url: string,
  options: IRequestOptions,
  redirected: boolean = false
) => {
  const { noDecode } = options;

  return _makeRawRequestAsync(
    url,
    options,
    redirected,
    (
      response: IncomingMessage,
      wasRedirected: boolean,
      resolve: (result: IWebClientStreamResponse | PromiseLike<IWebClientStreamResponse>) => void
    ): void => {
      const { statusCode: status = 0, statusMessage: statusText, headers } = response;

      const buildResult = (stream: Readable): IWebClientStreamResponse => ({
        ok: status >= 200 && status < 300,
        status,
        statusText,
        redirected: wasRedirected,
        headers,
        stream
      });

      // Handle Content-Encoding decompression for streaming responses,
      // matching the buffer-based path's behavior in getBufferAsync()
      let encodings: string | string[] | undefined;
      if (!noDecode) {
        encodings = headers[CONTENT_ENCODING_HEADER_NAME];
      }

      if (encodings !== undefined) {
        // Resolve with a promise so we can lazily import zlib (same pattern as buffer path)
        resolve(
          (async () => {
            const zlib: typeof import('zlib') = await import('node:zlib');
            if (!Array.isArray(encodings)) {
              encodings = encodings!.split(',');
            }

            let resultStream: Readable = response;
            for (const encoding of encodings) {
              switch (encoding.trim()) {
                case DEFLATE_ENCODING: {
                  resultStream = resultStream.pipe(zlib.createInflate());
                  break;
                }
                case GZIP_ENCODING: {
                  resultStream = resultStream.pipe(zlib.createGunzip());
                  break;
                }
                case BROTLI_ENCODING: {
                  resultStream = resultStream.pipe(zlib.createBrotliDecompress());
                  break;
                }
                default: {
                  throw new Error(`Unsupported content-encoding: ${encodings}`);
                }
              }
            }

            return buildResult(resultStream);
          })()
        );
      } else {
        resolve(buildResult(response));
      }
    },
    makeStreamRequestAsync
  );
};

/**
 * A helper for issuing HTTP requests.
 */
export class WebClient {
  private static _requestFnAsync: FetchFn = makeRequestAsync;
  private static _streamRequestFnAsync: StreamFetchFn = makeStreamRequestAsync;

  public readonly standardHeaders: Record<string, string> = {};

  public accept: string | undefined = '*/*';
  public userAgent: string | undefined = `rush node/${process.version} ${os.platform()} ${os.arch()}`;

  public proxy: WebClientProxy = WebClientProxy.Detect;

  public static mockRequestFn(fn: FetchFn): void {
    WebClient._requestFnAsync = fn;
  }

  public static resetMockRequestFn(): void {
    WebClient._requestFnAsync = makeRequestAsync;
  }

  public static mockStreamRequestFn(fn: StreamFetchFn): void {
    WebClient._streamRequestFnAsync = fn;
  }

  public static resetMockStreamRequestFn(): void {
    WebClient._streamRequestFnAsync = makeStreamRequestAsync;
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
    const requestInit: IRequestOptions = this._buildRequestOptions(options);
    return await WebClient._requestFnAsync(url, requestInit);
  }

  /**
   * Makes an HTTP request that resolves as soon as headers are received, providing the
   * response body as a readable stream. This avoids buffering the entire response in memory.
   */
  public async fetchStreamAsync(
    url: string,
    options?: IGetFetchOptions | IFetchOptionsWithBody
  ): Promise<IWebClientStreamResponse> {
    const requestInit: IRequestOptions = this._buildRequestOptions(options);
    return await WebClient._streamRequestFnAsync(url, requestInit);
  }

  private _buildRequestOptions(options?: IGetFetchOptions | IFetchOptionsWithBody): IRequestOptions {
    const {
      headers: optionsHeaders,
      timeoutMs = 15 * 1000,
      verb,
      redirect,
      body,
      noDecode
    } = (options as IFetchOptionsWithBody | undefined) ?? {};

    const headers: Record<string, string> = {};

    const { standardHeaders, userAgent, accept, proxy } = this;

    WebClient.mergeHeaders(headers, standardHeaders);

    if (optionsHeaders) {
      WebClient.mergeHeaders(headers, optionsHeaders);
    }

    if (userAgent) {
      headers[USER_AGENT_HEADER_NAME] = userAgent;
    }

    if (accept) {
      headers[ACCEPT_HEADER_NAME] = accept;
    }

    let proxyUrl: string = '';

    switch (proxy) {
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

    let agent: HttpAgent | undefined = undefined;
    if (proxyUrl) {
      agent = createHttpsProxyAgent(proxyUrl);
    }

    return {
      method: verb,
      headers,
      agent,
      timeout: timeoutMs,
      redirect,
      body,
      noDecode
    };
  }
}
