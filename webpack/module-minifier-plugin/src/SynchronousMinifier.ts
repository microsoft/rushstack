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
 * Options for configuring the SynchronousMinifier
 * @public
 */
export interface ISynchronousMinifierOptions {
  terserOptions?: MinifyOptions;
}

/**
 * Minifier implementation that synchronously minifies code on the main thread.
 * @public
 */
export class SynchronousMinifier implements IModuleMinifier {
  public readonly terserOptions: MinifyOptions;

  private readonly _resultCache: Map<string, IModuleMinificationResult>;

  public constructor(options: ISynchronousMinifierOptions) {
    const { terserOptions = {} } = options || {};

    this.terserOptions = {
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
   * Transform that synchronously invokes Terser
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(request: IModuleMinificationRequest, callback: IModuleMinificationCallback): void {
    const { hash } = request;

    const cached: IModuleMinificationResult | undefined = this._resultCache.get(hash);
    if (cached) {
      return callback(cached);
    }

    const result: IModuleMinificationResult = minifySingleFile(request, this.terserOptions);
    this._resultCache.set(hash, result);

    callback(result);
  }
}
