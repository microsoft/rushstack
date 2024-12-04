// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as process from 'process';
import * as fetch from 'node-fetch';
import type * as http from 'http';
import { Import } from '@rushstack/node-core-library';

const createHttpsProxyAgent: typeof import('https-proxy-agent') = Import.lazy('https-proxy-agent', require);

/**
 * For use with {@link WebClient}.
 */
export type WebClientResponse = fetch.Response;

/**
 * For use with {@link WebClient}.
 */
export type WebClientHeaders = fetch.Headers;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const WebClientHeaders: typeof fetch.Headers = fetch.Headers;

/**
 * For use with {@link WebClient}.
 */
export interface IWebFetchOptionsBase {
  timeoutMs?: number;
  headers?: WebClientHeaders | Record<string, string>;
  redirect?: fetch.RequestInit['redirect'];
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

/**
 * A helper for issuing HTTP requests.
 */
export class WebClient {
  private static _requestFn: typeof fetch.default = fetch.default;

  public readonly standardHeaders: fetch.Headers = new fetch.Headers();

  public accept: string | undefined = '*/*';
  public userAgent: string | undefined = `rush node/${process.version} ${os.platform()} ${os.arch()}`;

  public proxy: WebClientProxy = WebClientProxy.Detect;

  public static mockRequestFn(fn: typeof fetch.default): void {
    WebClient._requestFn = fn;
  }

  public static resetMockRequestFn(): void {
    WebClient._requestFn = fetch.default;
  }

  public static mergeHeaders(target: fetch.Headers, source: fetch.Headers | Record<string, string>): void {
    const iterator: Iterable<[string, string]> =
      'entries' in source && typeof source.entries === 'function' ? source.entries() : Object.entries(source);

    for (const [name, value] of iterator) {
      target.set(name, value);
    }
  }

  public addBasicAuthHeader(userName: string, password: string): void {
    this.standardHeaders.set(
      'Authorization',
      'Basic ' + Buffer.from(userName + ':' + password).toString('base64')
    );
  }

  public async fetchAsync(
    url: string,
    options?: IGetFetchOptions | IFetchOptionsWithBody
  ): Promise<WebClientResponse> {
    const headers: fetch.Headers = new fetch.Headers();

    WebClient.mergeHeaders(headers, this.standardHeaders);

    if (options?.headers) {
      WebClient.mergeHeaders(headers, options.headers);
    }

    if (this.userAgent) {
      headers.set('user-agent', this.userAgent);
    }

    if (this.accept) {
      headers.set('accept', this.accept);
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

    const timeoutMs: number = options?.timeoutMs !== undefined ? options.timeoutMs : 15 * 1000; // 15 seconds
    const requestInit: fetch.RequestInit = {
      method: options?.verb,
      headers: headers,
      agent: agent,
      timeout: timeoutMs,
      redirect: options?.redirect
    };
    const optionsWithBody: IFetchOptionsWithBody | undefined = options as IFetchOptionsWithBody | undefined;
    if (optionsWithBody?.body) {
      requestInit.body = optionsWithBody.body;
    }

    return await WebClient._requestFn(url, requestInit);
  }
}
