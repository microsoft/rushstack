// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as https from 'node:https';
import * as http from 'node:http';
import * as os from 'node:os';
import * as process from 'node:process';
import * as zlib from 'node:zlib';

import type { INpmRegistryPackageResponse } from './interfaces/INpmCheckRegistry';
import packageJson from '../package.json';

/**
 * Options for configuring the NpmRegistryClient.
 * @public
 */
export interface INpmRegistryClientOptions {
  /**
   * The base URL of the npm registry.
   * @defaultValue 'https://registry.npmjs.org'
   */
  registryUrl?: string;

  /**
   * The User-Agent header to send with requests.
   * @defaultValue A string containing npm-check-fork version and platform info
   */
  userAgent?: string;

  /**
   * Request timeout in milliseconds.
   * @defaultValue 30000
   */
  timeoutMs?: number;
}

/**
 * Result from fetching package metadata from the npm registry.
 * @public
 */
export interface INpmRegistryClientResult {
  /**
   * The package metadata if the request was successful.
   */
  data?: INpmRegistryPackageResponse;

  /**
   * Error message if the request failed.
   */
  error?: string;
}

const DEFAULT_REGISTRY_URL: string = 'https://registry.npmjs.org';
const DEFAULT_TIMEOUT_MS: number = 30000;

/**
 * A client for fetching package metadata from the npm registry.
 *
 * @remarks
 * This client provides a simple interface for fetching package metadata
 * without external dependencies like `package-json`.
 *
 * @public
 */
export class NpmRegistryClient {
  private readonly _registryUrl: string;
  private readonly _userAgent: string;
  private readonly _timeoutMs: number;

  public constructor(options?: INpmRegistryClientOptions) {
    // trim trailing slash if one was provided
    this._registryUrl = (options?.registryUrl ?? DEFAULT_REGISTRY_URL).replace(/\/$/, '');
    this._userAgent =
      options?.userAgent ??
      `npm-check-fork/${packageJson.version} node/${process.version} ${os.platform()} ${os.arch()}`;
    this._timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Builds the URL for fetching package metadata.
   *
   * @remarks
   * Handles scoped packages by URL-encoding the package name.
   * For example, `@scope/name` becomes `@scope%2Fname`.
   *
   * @param packageName - The name of the package
   * @returns The full URL for fetching the package metadata
   */
  private _buildPackageUrl(packageName: string): string {
    // Scoped packages need the slash encoded
    // @scope/name -> @scope%2Fname
    const encodedName: string = packageName.replace(/\//g, '%2F');
    return `${this._registryUrl}/${encodedName}`;
  }

  /**
   * Fetches package metadata from the npm registry.
   *
   * @param packageName - The name of the package to fetch
   * @returns A promise that resolves to the result containing either data or an error
   *
   * @example
   * ```ts
   * const client = new NpmRegistryClient();
   * const result = await client.fetchPackageMetadataAsync('lodash');
   * if (result.error) {
   *   console.error(result.error);
   * } else {
   *   console.log(result.data?.['dist-tags'].latest);
   * }
   * ```
   */
  public async fetchPackageMetadataAsync(packageName: string): Promise<INpmRegistryClientResult> {
    const url: string = this._buildPackageUrl(packageName);

    return new Promise<INpmRegistryClientResult>((resolve) => {
      const parsedUrl: URL = new URL(url);
      const isHttps: boolean = parsedUrl.protocol === 'https:';
      const requestModule: typeof https | typeof http = isHttps ? https : http;

      const requestOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        timeout: this._timeoutMs,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'User-Agent': this._userAgent
        }
      };

      // TODO: Extract WebClient from rush-lib so that we can use it here
      // instead of this reimplementation of HTTP request logic.
      const request: http.ClientRequest = requestModule.request(
        requestOptions,
        (response: http.IncomingMessage) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          response.on('end', () => {
            const statusCode: number = response.statusCode ?? 0;

            // Handle 404 - Package not found
            if (statusCode === 404) {
              resolve({ error: 'Package not found' });
              return;
            }

            // Handle other HTTP errors
            if (statusCode < 200 || statusCode >= 300) {
              resolve({ error: `HTTP error ${statusCode}: ${response.statusMessage}` });
              return;
            }

            try {
              let buffer: Buffer = Buffer.concat(chunks);

              // Decompress if needed
              const contentEncoding: string | undefined = response.headers['content-encoding'];
              if (contentEncoding === 'gzip') {
                buffer = zlib.gunzipSync(buffer);
              } else if (contentEncoding === 'deflate') {
                buffer = zlib.inflateSync(buffer);
              }

              const data: INpmRegistryPackageResponse = JSON.parse(buffer.toString('utf8'));

              // Successfully retrieved and parsed data
              resolve({ data });
            } catch (parseError) {
              resolve({
                error: `Failed to parse response: ${
                  parseError instanceof Error ? parseError.message : String(parseError)
                }`
              });
            }
          });

          response.on('error', (error: Error) => {
            resolve({ error: `Response error: ${error.message}` });
          });
        }
      );

      request.on('error', (error: Error) => {
        resolve({ error: `Network error: ${error.message}` });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({ error: `Request timed out after ${this._timeoutMs}ms` });
      });

      request.end();
    });
  }
}
