// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

import serialize from 'serialize-javascript';
import type { MinifyOptions } from 'terser';

import type {
  IMinifierConnection,
  IModuleMinificationCallback,
  IModuleMinificationRequest,
  IModuleMinificationResult,
  IModuleMinifier
} from './types';
import { minifySingleFileAsync } from './MinifySingleFile';

/**
 * Options for configuring the LocalMinifier
 * @public
 */
export interface ILocalMinifierOptions {
  terserOptions?: MinifyOptions;
}

/**
 * Minifier implementation that minifies code on the main thread.
 * @public
 */
export class LocalMinifier implements IModuleMinifier {
  private readonly _terserOptions: MinifyOptions;

  private readonly _resultCache: Map<string, IModuleMinificationResult>;
  private readonly _configHash: string;

  public constructor(options: ILocalMinifierOptions) {
    const { terserOptions = {} } = options || {};

    this._terserOptions = {
      ...terserOptions,
      output: terserOptions.output
        ? {
            ...terserOptions.output
          }
        : {}
    };

    const { version: terserVersion } = require('terser/package.json');

    this._configHash = createHash('sha256')
      .update(LocalMinifier.name, 'utf8')
      .update(`terser@${terserVersion}`)
      .update(serialize(terserOptions))
      .digest('base64');

    this._resultCache = new Map();
  }

  /**
   * Transform that invokes Terser on the main thread
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(request: IModuleMinificationRequest, callback: IModuleMinificationCallback): void {
    const { hash } = request;

    const cached: IModuleMinificationResult | undefined = this._resultCache.get(hash);
    if (cached) {
      return callback(cached);
    }

    minifySingleFileAsync(request, this._terserOptions)
      .then((result: IModuleMinificationResult) => {
        this._resultCache.set(hash, result);
        callback(result);
      })
      .catch((error) => {
        // This branch is here to satisfy the no-floating-promises lint rule
        callback({
          error: error as Error,
          code: undefined,
          map: undefined,
          hash
        });
      });
  }

  /**
   * {@inheritdoc IModuleMinifier.connectAsync}
   */
  public async connectAsync(): Promise<IMinifierConnection> {
    const disconnectAsync: IMinifierConnection['disconnectAsync'] = async () => {
      // Do nothing.
    };
    return {
      configHash: this._configHash,
      disconnectAsync,
      disconnect: disconnectAsync
    };
  }

  /**
   * @deprecated Use {@link LocalMinifier.connectAsync} instead.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public async connect(): Promise<IMinifierConnection> {
    return await this.connectAsync();
  }
}
