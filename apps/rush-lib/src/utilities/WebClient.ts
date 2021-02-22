import * as os from 'os';
import * as process from 'process';
import * as fetch from 'node-fetch';
import * as http from 'http';
import { Import } from '@rushstack/node-core-library';

const createHttpsProxyAgent: typeof import('https-proxy-agent') = Import.lazy('https-proxy-agent', require);

export type WebClientResponse = fetch.Response;

export interface IWebFetchOptions {
  headers?: fetch.Headers;
}

export enum WebClientProxy {
  None,
  Detect,
  Fiddler
}

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

  public async fetch(url: string, options?: IWebFetchOptions): Promise<WebClientResponse> {
    if (!options) {
      options = {};
    }

    const headers: fetch.Headers = new fetch.Headers();

    WebClient.mergeHeaders(headers, this.standardHeaders);

    if (options.headers) {
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

    return await fetch.default(url, {
      headers: headers,
      agent: agent,
      timeout: 10000
    });
  }
}
