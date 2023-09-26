// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ===================================================================================================================
// AS A TEMPORARY WORKAROUND, THIS FILE WAS COPY+PASTED FROM THE "rush-lib" PROJECT.
//
// Eventually we plan to convert it into a more generic API for "node-core-library" or
// else replace it with a third party solution such as Axios.  See the discussion here:
// https://github.com/microsoft/rushstack/pull/3036#discussion_r758010126
// ===================================================================================================================

import * as os from 'os';
import * as process from 'process';
import * as fetch from 'node-fetch';
import type * as http from 'http';
import { Import } from '@rushstack/node-core-library';

const createHttpsProxyAgent: typeof import('https-proxy-agent') = Import.lazy('https-proxy-agent', require);

/**
 * For use with {@link WebClient}.
 *
 * @public
 */
export type WebClientResponse = fetch.Response;

/**
 * For use with {@link WebClient}.
 *
 * @public
 */
export interface IWebFetchOptionsBase {
  timeoutMs?: number;
  verb?: 'GET' | 'PUT';
  headers?: fetch.Headers;
}

/**
 * For use with {@link WebClient}.
 *
 * @public
 */
export interface IGetFetchOptions extends IWebFetchOptionsBase {
  verb: 'GET' | never;
}

/**
 * For use with {@link WebClient}.
 *
 * @public
 */
export interface IPutFetchOptions extends IWebFetchOptionsBase {
  verb: 'PUT';
  body?: Buffer;
}

/**
 * For use with {@link WebClient}.
 * @public
 */
export enum WebClientProxy {
  None,
  Detect,
  Fiddler
}

/**
 * A helper for issuing HTTP requests.
 *
 * @public
 */
export class WebClient {
  public readonly standardHeaders: fetch.Headers = new fetch.Headers();

  public accept: string | undefined = '*/*';
  public userAgent: string | undefined = `rush node/${process.version} ${os.platform()} ${os.arch()}`;

  public proxy: WebClientProxy = WebClientProxy.Detect;

  public constructor() {}

  public static mergeHeaders(target: fetch.Headers, source: fetch.Headers): void {
    source.forEach((value, name) => {
      target.set(name, value);
    });
  }

  public addBasicAuthHeader(userName: string, password: string): void {
    this.standardHeaders.set(
      'Authorization',
      'Basic ' + Buffer.from(userName + ':' + password).toString('base64')
    );
  }

  public async fetchAsync(
    url: string,
    options?: IGetFetchOptions | IPutFetchOptions
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
      timeout: timeoutMs
    };
    const putOptions: IPutFetchOptions | undefined = options as IPutFetchOptions | undefined;
    if (putOptions?.body) {
      requestInit.body = putOptions.body;
    }

    return await fetch.default(url, requestInit);
  }
}
