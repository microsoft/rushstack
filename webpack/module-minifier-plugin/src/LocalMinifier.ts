// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IModuleMinificationCallback,
  IModuleMinificationRequest,
  IModuleMinificationResult,
  IModuleMinifier
} from './ModuleMinifierPlugin.types';
import { minifySingleFile } from './terser/MinifySingleFile';
import { MinifyOptions } from 'terser';
import './OverrideWebpackIdentifierAllocation';

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

    minifySingleFile(request, this._terserOptions)
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
}
