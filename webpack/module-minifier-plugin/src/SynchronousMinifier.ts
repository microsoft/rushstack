// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IModuleMinificationCallback, IModuleMinificationRequest } from './ModuleMinifierPlugin.types';
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
export class SynchronousMinifier {
  public readonly terserOptions: MinifyOptions;

  public constructor(options: ISynchronousMinifierOptions) {
    const {
      terserOptions = {}
    } = options || {};

    this.terserOptions = {
      ...terserOptions,
      output: terserOptions.output ? {
        ...terserOptions.output
      } : {}
    };
  }

  /**
   * Transform that synchronously invokes Terser
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(
    request: IModuleMinificationRequest,
    callback: IModuleMinificationCallback
  ): void {
    callback(minifySingleFile(request, this.terserOptions));
  }

  public shutdown(): void {
    // Nothing to do
  }
}